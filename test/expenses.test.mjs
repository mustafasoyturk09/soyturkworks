import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {cents,groupedAmount,parseReceipt,draftMissingLines,issues,guessCategory,duplicateIds,exportReadiness,buildPurchaseXML,encodeLogoXML,categoryProfile,lineProfile,splitFlight,lineAmounts,memoryKey,completeReceiptSeller,matchesReceiptFilters,rememberedProfile,mergeReceiptReadings,calendarDays} from '../src/expenses/model.mjs';

test('Birim fiyat Türkçe binlik ayırıcıyla gösterilir ve kuruş kaybı olmadan okunur',()=>{
  for(const [value,formatted] of [[110020,'1.100,20'],[123456789,'1.234.567,89'],[5,'0,05']]){assert.equal(groupedAmount(value),formatted);assert.equal(cents(formatted),value);}
});
test('Dövizli fiş seçilse de TL varsayılarak Logo XML üretilmez',()=>{
  const r={seller:'ÖRNEK',date:'2026-11-20',number:'1',currency:'USD',total:10000,vat:0,lines:[{category:'other',description:'ÖRNEK',gross:10000,vatRate:0}]};
  assert.throws(()=>buildPurchaseXML([r],{},'PUSULA',{selected:true}),/Dövizli fiş/);
});

test('Takvim günleri pazartesiden başlar ve artık yıl ile komşu ayları doğru ayırır',()=>{
  const days=calendarDays(2024,1);assert.equal(days.length,42);assert.equal(days[0].iso,'2024-01-29');assert.equal(days[0].outside,true);
  assert.equal(days.find(day=>day.iso==='2024-02-29').outside,false);assert.equal(days.find(day=>day.iso==='2024-03-01').outside,true);
});
test('OCR hazırlığı dosya yüklenirken başlatılabilir ve motor tekrar kullanılır',async()=>{
  const source=await readFile(new URL('../src/expenses/ocr-worker.js',import.meta.url),'utf8'),messages=[],files=[],requests=[];let initializations=0;
  const self={postMessage:value=>messages.push(value)};
  class Engine{Init(){initializations++;return 0;}}
  const context={self,Uint8Array,importScripts:()=>{},TesseractCore:async()=>({TessBaseAPI:Engine,FS:{writeFile:name=>files.push(name)}}),fetch:async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer};}};
  runInNewContext(source,context);await self.onmessage({data:{prepare:true}});await self.onmessage({data:{prepare:true}});
  assert.equal(initializations,1);assert.deepEqual(files,['tur.traineddata','eng.traineddata']);assert.equal(requests.length,2);assert.equal(messages.filter(m=>m.ready).length,2);
});

test('Satır eşleştirmeleri farklı giderleri ayırır ve benzer gideri tanır',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA'),r={seller:'ÖRNEK',taxId:'',lines:[]},line={category:'other',description:'ÖRNEK · KIRTASİYE'};
  const key=memoryKey(r,line),saved=await(await call(store,'profiles',{revision:0,categories:{other:{serviceCode:'HIZ.001',accountCode:'770.15.001'}},lineProfile:{key,category:'other',accountCode:'770.15.001'}})).json();
  assert.equal(rememberedProfile(r,line,saved).serviceCode,'HIZ.001');
  assert.equal(rememberedProfile({seller:'BAŞKA'}, {...line,description:'BAŞKA · KIRTASİYE'},saved).accountCode,'770.15.001');
  assert.equal(lineProfile({...line,description:'ÖRNEK · TEMİZLİK'},saved,'PUSULA',r).serviceCode,undefined);
});
test('Seçilen eksik fiş XML üretir, bilinmeyen tutarlar uydurulmaz',()=>{
  const r={seller:'ÖRNEK',date:'',number:'',currency:'TRY',total:null,vat:null,lines:[{category:'other',description:'ÖRNEK',gross:null,vatRate:null}],paymentCard:''};
  const xml=buildPurchaseXML([r],{},'PUSULA',{selected:true});
  assert.match(xml,/<TOTAL_NET><\/TOTAL_NET>/);assert(!/NaN|undefined/.test(xml));
});
test('İki OCR denemesi belirsiz olmayan eksik alanları tamamlar',()=>{
  const a=parseReceipt('CEM KOPYALAMA\nVE TANITIM TIC SAN LTD STI\nKIRTASİYE %20 1.100,00');
  const b=parseReceipt('CEM KOPYALAMA\nFIŞ NO: 41\nTOPKDV 183,33\nTOPLAM 1.100,00');
  const merged=mergeReceiptReadings(a,[a,b]);assert.equal(merged.number,'41');assert.equal(merged.vat,18333);assert.match(a.seller,/VE TANITIM TIC SAN LTD STI/);
});
test('OCR unvandaki belirgin paraziti ancak tutarlı ikinci okumayla değiştirir',()=>{
  const first=parseReceipt('ÖRNEK KOPYALAMA SİSTEMLERİ BASIM co TANLITIM TİC SAN LTD ŞTİ');
  const second=parseReceipt('ÖRNEK KOPYALAMA SİSTEMLERİ BASIM VE TANITIM TİC SAN LTD ŞTİ');
  assert.equal(mergeReceiptReadings(first,[first,second]).seller,second.seller);
  const conflict=parseReceipt('ÖRNEK KOPYALAMA SİSTEMLERİ BASIM VE YAYIN TİC SAN LTD ŞTİ');
  assert.equal(mergeReceiptReadings(first,[first,second,conflict]).seller,first.seller);
});
test('Belirli OCR hatası ve şirket son eki kayıtlı satırda düzeltilir',()=>{
  const bad='ÖRNEK KOPYALAMA co TANLT IM TİC, SAN, LTD. ŞTİ';
  const corrected='ÖRNEK KOPYALAMA VE TANITIM TİC.SAN.LTD.ŞTİ.';
  const result=completeReceiptSeller({seller:bad,rawText:'',lines:[{description:bad}]});
  assert.equal(result.seller,corrected);assert.equal(result.lines[0].description,corrected);
  const untouched='ÖRNEK KOPYALAMA LTD ŞTİ';assert.equal(completeReceiptSeller({seller:untouched,rawText:'',lines:[]}).seller,untouched);
});

test('Fiş numarası okunmasa da satır açıklamasında satıcı bulunur ve eksikler gösterilir',()=>{
  const r=parseReceipt('CEM KOPYALAMA\nKIRTASİYE %20 1.100,00\nTOPLAM 1.100,00');
  assert.equal(r.number,'');
  assert.equal(r.lines[0].description,'CEM KOPYALAMA · KIRTASİYE');
  r.reviewed=true;
  const reasons=exportReadiness([r],{},'PUSULA').reasons;
  assert(reasons.some(x=>x.includes('numarası eksik')));
  assert(reasons.some(x=>x.includes('VKN')));
});
import {ExpenseStore,limitedBytes} from '../server/expenses.mjs';
import {receiptCropFromTSV,receiptPaperFromPixels} from '../src/expenses/crop.mjs';

test('Şirket unvanı devam satırlarıyla tamamlanır ve adres eklenmez',()=>{
  const raw='CEM KOPYALAMA SİSTEMLERİ BASIM\nVE TANITIM\nTİC SAN LTD ŞTİ\nKOZYATAĞI MAH CAD NO: 4\nFİŞ NO: 41';
  const title='CEM KOPYALAMA SİSTEMLERİ BASIM VE TANITIM TİC SAN LTD ŞTİ',parsed=parseReceipt(raw);
  assert.equal(parsed.seller,title);assert.match(parsed.lines[0].description,/LTD ŞTİ/);
  const old=completeReceiptSeller({seller:'CEM KOPYALAMA SİSTEMLERİ BASIM',number:'41',rawText:raw,lines:[{description:'FİŞ NO:41 CEM KOPYALAMA SİSTEMLERİ BASIM'}]});
  assert.equal(old.seller,title);assert.match(old.lines[0].description,/LTD ŞTİ/);
});
test('Fiş numarası sonraki satırdaki ürün adıyla karışmaz ve unvandaki OCR virgülleri temizlenir',()=>{
  const r=parseReceipt('CEM KOPYALAMA SİSTEMLERİ BASIM\nVE TANITIM TİC, SAN, LTD, ŞTİ\n20.11.2026 FİŞ NO:\nKIRTASİYE %20 1.100,00\nTOPLAM 1.100,00');
  assert.equal(r.number,'');assert.equal(r.seller,'CEM KOPYALAMA SİSTEMLERİ BASIM VE TANITIM TİC SAN LTD ŞTİ');
  assert.equal(parseReceipt('ÖRNEK\n20.11.2026 FİŞ NO: 41\nKIRTASİYE %20 1.100,00').number,'41');
});
test('Telefon bağlantısı Türkçe adla temizleme düğmesinin üstüne yerleştirilir',async()=>{
  const app=await readFile(new URL('../src/expenses/app.mjs',import.meta.url),'utf8');
  assert.match(app,/textContent='Telefona Bağla'/);
  assert.match(app,/filterActions\.append\(document\.getElementById\('copyLink'\),clearFilters\)/);
  assert(!app.includes('Telefona Ba?la'));assert(!app.includes('expenseTextTool'));
});
test('Fotoğrafta belirgin kâğıt alanı bulunur, belirsiz görüntü kesilmez',()=>{
  const width=160,height=240,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,v=x>=45&&x<115&&y>=20&&y<220?230:35;pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
  const crop=receiptPaperFromPixels(pixels,width,height);assert(crop);assert(crop.x<45/width&&crop.x+crop.width>115/width);assert(crop.y<20/height&&crop.y+crop.height>220/height);assert.equal(crop.v,2);
  assert.equal(receiptPaperFromPixels(new Uint8ClampedArray(width*height*4).fill(220),width,height),null);
});

const sample='ÖRNEK LOKANTA\nVKN: 1234567890\nTARİH: 10.11.2026\nFİŞ NO: 0072\nYEMEK %10 110,00\nTOPKDV 10,00\nTOPLAM 110,00';
const receipt=()=>({...parseReceipt(sample,92),id:'one',reviewed:true});
test('Fişteki şahıs adı unvandan sonra gelir, açıklamada tekrarlanmaz',()=>{
  const raw=sample.replace('ÖRNEK LOKANTA','ÖRNEK LOKANTA\nDENİZ ÖRNEK');
  const r=parseReceipt(raw,92);assert.equal(r.seller,'ÖRNEK LOKANTA - DENİZ ÖRNEK');
  assert(r.lines[0].description.startsWith('FİŞ NO:0072 ÖRNEK LOKANTA - DENİZ ÖRNEK'));
  assert.deepEqual(completeReceiptSeller(r),r);
  const old={...r,seller:'ÖRNEK LOKANTA'};
  assert.equal(completeReceiptSeller(old).lines[0].description,r.lines[0].description);
  const manual={...old,seller:'Düzeltilmiş unvan'};assert.deepEqual(completeReceiptSeller(manual),manual);
  for(const next of ['ÖRNEK MAHALLESİ','ÇİÇEK CAD','MERKEZ ŞUBESİ','TEŞEKKÜR EDERİZ','KASİYER DENİZ','KREDİ KARTI'])assert.equal(parseReceipt(sample.replace('ÖRNEK LOKANTA','ÖRNEK LOKANTA\n'+next)).seller,'ÖRNEK LOKANTA',next);
});
test('Satırı olmayan fiş düzenlenebilir taslak açar ve belirsiz KDV uydurmaz',()=>{
  const r={...receipt(),lines:[]},draft=draftMissingLines(r);assert.equal(draft.length,1);assert.equal(draft[0].gross,r.total);assert.equal(draft[0].vatRate,10);assert.equal(r.lines.length,0);
  const uncertain=draftMissingLines({...r,rawText:'okunamadı',total:25000});assert.equal(uncertain[0].gross,25000);assert.equal(uncertain[0].vatRate,null);
});
class Storage{
  data=new Map();queue=Promise.resolve();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async delete(k){return this.data.delete(k);}
  async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
  transaction(fn){const next=this.queue.then(async()=>{const before=structuredClone(this.data);try{return await fn(this);}catch(e){this.data=before;throw e;}});this.queue=next.catch(()=>{});return next;}
}
const jpg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(200000,42)]),id=createHash('sha256').update(jpg).digest('hex');
const call=(store,path,body,raw=false)=>store.handle(new Request('https://expense-store.internal/'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:raw?body:JSON.stringify(body)}));
test('Temizle aktif fiş ve görseli siler, arşivi korur; arşivden yalnızca seçilen silinir',async()=>{
  const storage=new Storage(),store=new ExpenseStore(storage,'PUSULA');
  const initial=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const archivedId='b'.repeat(64),archived={...initial,id:archivedId,archived:true,revision:3};
  await storage.put('receipt:'+archivedId,archived);await storage.put('image:'+archivedId+':0',new Uint8Array([1]));await storage.put('count',2);await storage.put('bytes',initial.source.size*2);
  await storage.put('profiles',{revision:2,categories:{other:{serviceCode:'TEST'}},memories:{'test|other|*':'123'}});
  await assert.rejects(()=>call(store,'clear-active',{receipts:[{id,revision:0}],profileRevision:2}),e=>e.status===409);
  assert(await storage.get('receipt:'+id));
  assert.equal((await(await call(store,'clear-active',{receipts:[{id,revision:initial.revision}],profileRevision:2})).json()).deleted,1);
  assert.equal(await storage.get('receipt:'+id),undefined);assert.equal(await storage.get('image:'+id+':0'),undefined);assert(await storage.get('receipt:'+archivedId));assert.deepEqual((await storage.get('profiles')).memories,{'test|other|*':'123'});
  await assert.rejects(()=>call(store,'delete-archived',{receipts:[{id:archivedId,revision:2}]}),e=>e.status===409);
  assert(await storage.get('receipt:'+archivedId));
  assert.equal((await(await call(store,'delete-archived',{receipts:[{id:archivedId,revision:3}]})).json()).deleted,1);
  assert.equal(await storage.get('receipt:'+archivedId),undefined);assert.equal(await storage.get('image:'+archivedId+':0'),undefined);assert.equal(await storage.get('count'),0);
});
test('Eski kaydın şahıs adı listede, detayda, kayıtta ve XML açıklamasında korunur',async()=>{
  const storage=new Storage(),store=new ExpenseStore(storage,'PUSULA');
  const created=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const legacy={...created,...receipt(),id:created.id,rawText:sample.replace('ÖRNEK LOKANTA','ÖRNEK LOKANTA\nDENİZ ÖRNEK'),paymentCard:'309.07'};
  await storage.put('receipt:'+id,legacy);
  const listed=(await(await call(store,'list')).json()).receipts[0];assert.equal(listed.seller,'ÖRNEK LOKANTA - DENİZ ÖRNEK');assert(!('rawText' in listed));
  const detail=await(await call(store,'record/'+id)).json();assert.equal(detail.seller,listed.seller);assert.equal((await storage.get('receipt:'+id)).seller,'ÖRNEK LOKANTA');
  const saved=await(await call(store,'record/'+id,legacy)).json();assert.equal(saved.seller,listed.seller);
  assert(buildPurchaseXML([saved],{},'PUSULA').includes('ÖRNEK LOKANTA - DENİZ ÖRNEK'));
  assert.equal(saved.total,legacy.total);assert.equal(saved.vat,legacy.vat);assert.equal(saved.revision,legacy.revision+1);
});

test('Hesap planı Pusula ile sınırlıdır ve eşzamanlı değişikliklerin üzerine yazmaz',async()=>{
  const storage=new Storage(),pusula=new ExpenseStore(storage,'PUSULA'),other=new ExpenseStore(new Storage(),'KIB');
  assert.deepEqual(await(await call(pusula,'account-plan')).json(),{revision:0,accounts:[]});
  const data={revision:0,accounts:[{code:'770.03.001',name:'Örnek gider'}]};
  assert.equal((await(await call(pusula,'account-plan',data)).json()).count,1);
  assert.equal((await(await call(pusula,'account-plan')).json()).accounts[0].code,'770.03.001');
  await assert.rejects(()=>call(pusula,'account-plan',data),e=>e.status===409);
  await assert.rejects(()=>call(other,'account-plan'),e=>e.status===403);
  await assert.rejects(()=>call(pusula,'account-plan',{revision:1,accounts:[data.accounts[0],data.accounts[0]]}),/tekrarlanan/);
});
test('Aktarıldığı işaretlenen fiş yeniden XML içine girmez',()=>{
  const a=receipt();a.paymentCard='309.07';a.number='1001';
  const b=receipt();b.paymentCard='309.07';b.number='1002';b.exported=true;
  const xml=buildPurchaseXML([a,b],{},'PUSULA');assert(xml.includes('1001'));assert(!xml.includes('1002'));
  assert.equal(exportReadiness([b],{},'PUSULA').ready,false);
});
test('Aktarım işareti yalnızca kontrol edilmiş fişte saklanır ve eski istemcide korunur',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA'),created=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  await assert.rejects(()=>call(store,'record/'+id,{...created,exported:true}),/kontrol edilmemiş/i);
  const valid={...created,...receipt(),id:created.id,paymentCard:'309.07',exported:true};
  const saved=await(await call(store,'record/'+id,valid)).json();assert.equal(saved.exported,true);
  const old={...saved};delete old.exported;const unchanged=await(await call(store,'record/'+id,old)).json();assert.equal(unchanged.exported,true);
  const unreviewed=await(await call(store,'record/'+id,{...unchanged,reviewed:false,exported:false})).json();assert.equal(unreviewed.exported,false);
});
test('Diğer gider için seçili hesap, eksik Logo alanlarını ayrı gösterir',()=>{
  const r=receipt();r.paymentCard='309.07';r.lines[0].category='other';r.lines[0].expenseCode='770.99.987';r.lines[0].vatRate=20;r.lines[0].gross=12000;r.total=12000;r.vat=2000;
  const incomplete=exportReadiness([r],{},'PUSULA');assert.equal(incomplete.ready,false);assert(incomplete.reasons.some(x=>x.includes('hizmet/stok kodu')));assert(incomplete.reasons.some(x=>x.includes('masraf merkezi')));assert(incomplete.reasons.some(x=>x.includes('%20 KDV')));assert(!incomplete.reasons.some(x=>x.includes('gider hesabı kodu')));
  const profiles={categories:{other:{serviceCode:'TEST.HIZMET',costCenter:'TEST.MERKEZ',vatCode20:'TEST.KDV'}}};const xml=buildPurchaseXML([r],profiles,'PUSULA');assert(xml.includes('<GL_CODE1>770.99.987</GL_CODE1>'));assert(xml.includes('<MASTER_CODE>TEST.HIZMET</MASTER_CODE>'));
});
test('Miktar ve birim fiyat kaydedilir ve Logo XML toplamı korunur',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA'),created=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const r={...created,...receipt(),paymentCard:'309.07'};r.lines[0].quantity=2;r.lines[0].gross=11000;
  const saved=await(await call(store,'record/'+id,r)).json();assert.equal(saved.lines[0].quantity,2);
  const xml=buildPurchaseXML([saved],{},'PUSULA');assert(xml.includes('<QUANTITY>2</QUANTITY>'));assert(xml.includes('<PRICE>55.00</PRICE>'));assert(xml.includes('<TOTAL>110.00</TOTAL>'));
  await assert.rejects(()=>call(store,'record/'+id,{...saved,lines:[{...saved.lines[0],quantity:-1}]}),/Miktar/);
});
test('Miktar ve birim fiyat uyuşmazlığı sessizce yuvarlanıp aktarılmaz',()=>{
  const r=receipt();r.paymentCard='309.07';r.lines[0].quantity=3;r.lines[0].gross=11000;
  assert(issues(r).some(x=>x.includes('yuvarlama')));assert.throws(()=>buildPurchaseXML([r],{},'PUSULA'),/kontrol/);
});
test('Logo XML Türkçe karakterleri ISO-8859-9 baytlarıyla korur',()=>{
  const text='<?xml version="1.0" encoding="UTF-8"?><DESCRIPTION>FİŞ NO:002 ÇĞİÖŞÜ çğıöşü 😀</DESCRIPTION>';
  const decoded=new TextDecoder('iso-8859-9').decode(encodeLogoXML(text));assert(decoded.startsWith('<?xml version="1.0" encoding="ISO-8859-9"?>'));assert(decoded.includes('FİŞ NO:002 ÇĞİÖŞÜ çğıöşü &#128512;'));
});
test('Pusula hizmet ve masraf merkezi KDV oranından bağımsızdır, KDV hesapları ayrı doğrulanır',()=>{
  const r=receipt();r.paymentCard='309.07';r.lines[0]={...r.lines[0],category:'other',expenseCode:'770.15.006',vatRate:20,gross:12000};r.total=12000;r.vat=2000;
  const xml=buildPurchaseXML([r],{},'PUSULA');assert(xml.includes('<MASTER_CODE>770.15.006</MASTER_CODE>'));assert(xml.includes('<GL_CODE1>770.15.006</GL_CODE1>'));assert(xml.includes('<GL_CODE2>191.01.004</GL_CODE2>'));assert(xml.includes('<OHP_CODE1>DB.01</OHP_CODE1>'));
  for(const rate of [0,1,10,18]){
    r.lines[0].vatRate=rate;r.vat=lineAmounts(r.lines[0]).vat;
    const p=lineProfile(r.lines[0],{},'PUSULA');assert.equal(p.serviceCode,'770.15.006');assert.equal(p.costCenter,'DB.01');
    const status=exportReadiness([r],{},'PUSULA');assert(!status.reasons.some(s=>/hizmet\/stok|masraf merkezi/.test(s)));
    if(rate===0){assert.equal(status.ready,true);assert(!buildPurchaseXML([r],{},'PUSULA').includes('<GL_CODE2>'));}
    else {assert.equal(status.ready,false);assert(status.reasons.some(s=>s.includes('%'+rate+' KDV')));assert.throws(()=>buildPurchaseXML([r],{},'PUSULA'),/KDV/);}
  }
  r.lines[0].vatRate=10;r.vat=lineAmounts(r.lines[0]).vat;
  const configured={categories:{other:{vatCode10:'191.TEST10'}}},configuredXML=buildPurchaseXML([r],configured,'PUSULA');
  assert(configuredXML.includes('<GL_CODE2>191.TEST10</GL_CODE2>'));assert(configuredXML.includes('<MASTER_CODE>770.15.006</MASTER_CODE>'));
  assert.equal(lineProfile(r.lines[0],{categories:{other:{serviceCode:'CUSTOM',costCenter:'CENTER'}}},'PUSULA').serviceCode,'CUSTOM');
  r.vat=2000;assert.throws(()=>buildPurchaseXML([r],configured,'PUSULA'),/kontrol/);
  r.lines[0].expenseCode='770.99.987';assert.equal(exportReadiness([r],{},'PUSULA').ready,false);assert.equal(exportReadiness([r],{},'KIB').ready,false);
});

test('Fiş tarihi sınırları dahil süzülür; okundu, bekliyor ve hata birbirinden ayrılır',()=>{
  const rows=[{date:'2026-11-01',ocrDone:true},{date:'2026-11-10',ocrDone:false},{date:'2026-11-20',ocrDone:false,error:'Okunamadı'},{date:'',ocrDone:true}];
  assert.equal(rows.filter(r=>matchesReceiptFilters(r)).length,4);
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{from:'2026-11-01',to:'2026-11-10'})),rows.slice(0,2));
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{to:'2026-11-10'})),rows.slice(0,2));
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{from:'2026-11-20'})),[rows[2]]);
  assert.equal(rows.filter(r=>matchesReceiptFilters(r,{from:'2026-11-20',to:'2026-11-01'})).length,0);
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{ocr:'pending'})),[rows[1]]);
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{ocr:'error'})),[rows[2]]);
  assert.deepEqual(rows.filter(r=>matchesReceiptFilters(r,{ocr:'done'})),[rows[0],rows[3]]);
  assert.equal(matchesReceiptFilters({ocrDone:true,error:'Okuma hatası'},{ocr:'done'}),false);
});
test('Fiş kırpma kredi sınırı güvenle bulunursa uygulanır',()=>{
  const word=(y,text)=>`5\t1\t1\t1\t1\t1\t100\t${y}\t120\t20\t95\t${text}`;
  const lines=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',...[100,140,180,220,260,300].map((y,i)=>word(y,'ALAN'+i)),word(500,'TOPLAM'),word(650,'KREDİ')];
  const crop=receiptCropFromTSV(lines.join('\n'),1000,1000);assert(crop);assert(crop.y<.1);assert(crop.y+crop.height>.67);assert(crop.y+crop.height<.75);
  assert.equal(receiptCropFromTSV(lines.slice(0,-1).join('\n'),1000,1000),null);
  assert.equal(receiptCropFromTSV([...lines,word(700,'KREDİ')].join('\n'),1000,1000),null);
});
test('Kırpma sınırları doğrulanır ve eski istemci kaydında korunur',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA'),created=(await(await call(store,'image/'+id,jpg,true)).json()).receipt,crop={x:.1,y:.05,width:.8,height:.75};
  const saved=await(await call(store,'record/'+id,{...created,crop})).json();assert.deepEqual(saved.crop,crop);
  const old={...saved};delete old.crop;const kept=await(await call(store,'record/'+id,old)).json();assert.deepEqual(kept.crop,crop);
  await assert.rejects(()=>call(store,'record/'+id,{...kept,crop:{x:.8,y:0,width:.9,height:.5}}),/sınırları geçersiz/);
});

test('Expense OCR extracts explicit receipt fields without inventing missing identifiers or amounts',()=>{
  const r=receipt();assert.equal(r.number,'0072');assert.equal(r.date,'2026-11-10');assert.equal(r.total,11000);assert.equal(r.vat,1000);assert.equal(r.lines[0].category,'meal');assert.deepEqual(issues(r),[]);
  const unknown=parseReceipt('EKÜ NO: 8888\nZ NO: 1234\nNAKİT 999,00\nSAAT 10:11');assert.equal(unknown.number,'');assert.equal(unknown.total,null);assert.equal(unknown.date,'');assert.equal(unknown.lines[0].vatRate,null);assert(issues(unknown).length>=5);
});
test('Ambiguous dates, totals and tax rates stay unresolved rather than choosing a convenient value',()=>{
  const r=parseReceipt('ÖRNEK\n10.11.2026\n11.11.2026\nTOPLAM 110,00\nTOPLAM 220,00\nKDV ORANI %10\nKDV ORANI %20');assert.equal(r.date,'');assert.equal(r.total,null);assert.equal(r.lines[0].vatRate,null);assert(r.notes.some(n=>n.includes('Birden fazla')));
  assert.equal(parseReceipt('ÖRNEK\n31.02.2026').date,'');
});
test('Mixed VAT and categories use separate lines and reconcile to the printed totals',()=>{
  const r=parseReceipt('ÖRNEK\nVKN: 1234567890\n10.11.2026\nFİŞ NO: 42\nYEMEK %10 110,00\nMOTORİN %20 120,00\nTOPKDV 30,00\nTOPLAM 230,00');assert.equal(r.lines.length,2);assert.deepEqual(r.lines.map(l=>l.category),['meal','fuel']);assert.deepEqual(issues(r),[]);
  r.lines[0].gross=10000;assert(issues(r).some(n=>n.includes('Satır toplamları')));r.vat=0;assert(issues(r).some(n=>n.includes('KDV ile uyuşmuyor')));
});
test('Money parser preserves kuruş precision and rejects malformed and negative amounts',()=>{
  for(const [value,expected] of [['1.234,56',123456],['1234.56',123456],['1.234',123400],['0,00',0],['',null],['12,34,56',null],['-100,00',null],['1O0,00',null]])assert.equal(cents(value),expected,value);
});
test('Category suggestions are conservative and never infer a tax rate or accounting code',()=>{
  assert.equal(guessCategory('UNLU MAMÜLLER'),'meal');assert.equal(guessCategory('MOTORİN'),'fuel');assert.equal(guessCategory('OTOPARK'),'parking');assert.equal(guessCategory('TURKISH AIRLINES'),'flight');assert.equal(guessCategory('Lokanta ve akaryakıt'),'other');
  const r=parseReceipt('OTOPARK\nTOPLAM 100,00');assert.equal(r.lines[0].vatRate,null);assert.equal(r.lines[0].category,'parking');
});
test('Duplicate receipts are flagged independently of amounts and archived entries do not block review',()=>{
  const a=receipt(),b={...receipt(),id:'two',total:99999};assert.deepEqual([...duplicateIds([a,b])].sort(),['one','two']);b.archived=true;assert.equal(duplicateIds([a,b]).size,0);
});
test('Logo XML export cannot be enabled with unverified category mappings or imported verification flags',()=>{
  const result=exportReadiness([receipt()],{verified:true,categories:{meal:{verified:true}}});assert.equal(result.ready,false);assert(result.reasons.some(n=>n.includes('eşleştirmesini')));
});
test('Receipt source uploads are byte-exact, idempotent and isolated by company store',async()=>{
  const s=new Storage(),a=new ExpenseStore(s,'PUSULA'),b=new ExpenseStore(new Storage(),'COMED');
  assert.equal((await call(a,'image/'+id,jpg,true)).status,201);assert.equal((await(await call(a,'image/'+id,jpg,true)).json()).duplicate,true);
  assert.deepEqual(Buffer.from(await(await call(a,'image/'+id)).arrayBuffer()),jpg);assert.equal((await(await call(a,'list')).json()).receipts.length,1);
  await assert.rejects(()=>call(b,'image/'+id),e=>e.status===404);assert.equal((await(await call(b,'list')).json()).receipts.length,0);
});
test('Receipt updates use optimistic concurrency, preserve originals and reject incomplete approval',async()=>{
  const s=new Storage(),store=new ExpenseStore(s,'PUSULA');await call(store,'image/'+id,jpg,true);const r=await(await call(store,'record/'+id)).json();
  await assert.rejects(()=>call(store,'record/'+id,{...r,reviewed:true}),/onaylanamaz/);
  const patch={...r,...receipt(),id:'forged',company:'COMED',source:{size:0}};const saved=await(await call(store,'record/'+id,patch)).json();assert.equal(saved.id,id);assert.equal(saved.company,'PUSULA');assert.equal(saved.source.size,jpg.length);
  await assert.rejects(()=>call(store,'record/'+id,patch),e=>e.status===409);
  await call(store,'record/'+id,{...saved,archived:true});assert.deepEqual(Buffer.from(await(await call(store,'image/'+id)).arrayBuffer()),jpg);
});
test('Concurrent edits cannot silently overwrite the other device',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const r=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const results=await Promise.allSettled([call(store,'record/'+id,{...r,seller:'A'}),call(store,'record/'+id,{...r,seller:'B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
});
test('Profiles are per-company, revision checked and cannot claim verification',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const saved=await(await call(store,'profiles',{revision:0,categories:{meal:{accountCode:'770.TEST',verified:true}},verified:true})).json();assert.equal(saved.verified,false);assert.equal(saved.categories.meal.accountCode,'770.TEST');assert.equal(saved.categories.meal.verified,undefined);
  await assert.rejects(()=>call(store,'profiles',{revision:0,categories:{}}),e=>e.status===409);
});
test('Upload limits, content signatures and source hashes are enforced without trusting Content-Length',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');await assert.rejects(()=>call(store,'image/'+id,Buffer.from('<script>bad</script>'),true),/JPEG/);
  await assert.rejects(()=>call(store,'image/'+'0'.repeat(64),jpg,true),/bütünlüğü/);
  const request=new Request('https://example.invalid',{method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(11));c.close();}}),duplex:'half'});await assert.rejects(()=>limitedBytes(request,10),e=>e.status===413);
});
test('Build ships the standalone module and pinned OCR assets without changing the existing OCR engine',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../release-manifest.json',import.meta.url)));
  for(const file of ['expenses/index.html','expenses/model.mjs','expenses/app.mjs','expenses/ocr-worker.js','expenses/ocr-core.js','expenses/tur.traineddata','expenses/eng.traineddata'])assert(manifest.files.some(f=>f.file===file));
  const html=await readFile(new URL('../src/expenses/index.html',import.meta.url),'utf8');assert.match(html,/capture="environment"/);assert.match(html,/id="xml"[^>]+disabled/);
});


test('Sample purchase workflow preserves receipt totals, selected card and category accounts',()=>{
  for(const [category,gross,rate,vat,account] of [['meal',217000,10,19727,'770.02.013'],['parking',50000,20,8333,'770.11.004'],['wash',54000,20,9000,'770.11.004'],['transport',40000,0,0,'770.11.004']]){
    const r={...receipt(),paymentCard:'309.03',total:gross,vat,lines:[{description:'Test & <satır>',category,gross,vatRate:rate}]};
    const xml=buildPurchaseXML([r],{},'PUSULA');
    assert.match(xml,/<INVOICE DBOP="INS">/);assert.match(xml,/<ARP_CODE>309.03<\/ARP_CODE>/);assert.match(xml,/<GL_CODE>309.01.001<\/GL_CODE>/);
    assert(xml.includes('<MASTER_CODE>'+account+'</MASTER_CODE>'));assert(xml.includes('<VAT_AMOUNT>'+(vat/100).toFixed(2)+'</VAT_AMOUNT>'));assert(xml.includes('Test &amp; &lt;satır&gt;'));
    r.paymentCard='309.07';assert.match(buildPurchaseXML([r],{},'PUSULA'),/<GL_CODE>309.01.007<\/GL_CODE>/);
  }
});
test('Export requires manual card choice and company mappings, blocks missing mappings and unreviewed documents',()=>{
  const r=receipt();assert.equal(exportReadiness([r],{},'PUSULA').ready,false);
  r.paymentCard='309.07';assert.equal(exportReadiness([r],{},'PUSULA').ready,true);assert.equal(exportReadiness([r],{},'COMED').ready,false);
  r.reviewed=false;assert.throws(()=>buildPurchaseXML([r],{},'PUSULA'));r.reviewed=true;r.lines[0].category='flight';assert.equal(exportReadiness([r],{},'PUSULA').ready,false); // %10 flight VAT account was not supplied
  assert.equal(categoryProfile('bakery',{},'PUSULA').serviceCode,'770.02.013');
});

test('Pusula gider ve kart kuralları diğer firmalarda kullanılmaz',()=>{
  const r=receipt();r.paymentCard='309.07';
  const inherited={categories:{meal:{serviceCode:'770.02.013',accountCode:'770.02.013',costCenter:'DB.01',vatCode10:'191.01.005'}}};
  for(const company of ['COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL']){
    assert.deepEqual(categoryProfile('meal',inherited,company),{});
    assert.equal(exportReadiness([r],inherited,company).ready,false);
    assert.throws(()=>buildPurchaseXML([r],inherited,company),/henüz tanımlanmadı/);
  }
  assert.equal(exportReadiness([r],{},'PUSULA').ready,true);
});
test('Bakery stays meal without substituting its printed VAT rate; wash and food labels are recognized',()=>{
  for(const word of ['UNLU MAM','UNLU MAMÜLLER','YİYECEK','IZGARA TAVUK SALATASI'])assert.equal(guessCategory(word),'meal');
  const r=parseReceipt('ÖRNEK FIRIN\n1234567890\nUNLU MAMÜLLER %01 *5.500,00\nTOPKDV *54,46\nTOPLAM *5.500,00');
  assert.equal(r.taxId,'1234567890');assert.equal(r.lines[0].category,'meal');assert.equal(r.lines[0].vatRate,1);assert.equal(r.vat,5446);assert.equal(guessCategory('YIKAMA'),'wash');
  assert.equal(parseReceipt('KDV *83,33').vat,8333);
});
test('Selected card and legacy bakery category survive server save and reload',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const r=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const draft={...r,...receipt(),paymentCard:'309.07'};draft.lines[0].category='bakery';
  const saved=await(await call(store,'record/'+id,draft)).json();assert.equal(saved.paymentCard,'309.07');assert.equal(saved.lines[0].category,'meal');
});

test('Fuel and parking share sample mappings without a second 30 percent deduction; new years require review',()=>{
  assert.deepEqual(categoryProfile('fuel',{},'PUSULA'),categoryProfile('parking',{},'PUSULA'));
  const r={...receipt(),paymentCard:'309.07',total:12000,vat:2000,lines:[{description:'Test yakıt',category:'fuel',gross:12000,vatRate:20}]};
  const xml=buildPurchaseXML([r],{},'PUSULA');
  assert.match(xml,/<VAT_BASE>100.00<\/VAT_BASE>/);assert.match(xml,/<VAT_AMOUNT>20.00<\/VAT_AMOUNT>/);
  assert.match(xml,/<KKEG_GL_CODE>689.03.012<\/KKEG_GL_CODE>/);assert.match(xml,/<TOTAL_NET>120.00<\/TOTAL_NET>/);
  r.date='2027-01-01';assert.equal(exportReadiness([r],{},'PUSULA').ready,false);assert.throws(()=>buildPurchaseXML([r],{},'PUSULA'),/belge yılı/);
  r.lines[0].category='meal';assert.equal(exportReadiness([r],{categories:{meal:{vatCode20:'191.TEST'}}},'PUSULA').ready,true);
});

test('Flight XML follows the supplied net-price two-line example and reconciles payment',()=>{
  const r={...receipt(),total:371286,vat:58906,paymentCard:'309.07',lines:[]};r.lines=splitFlight(r,20);
  assert.deepEqual(r.lines.map(l=>[l.gross,l.vatRate]),[[294530,20],[17850,0]]);assert.deepEqual(issues(r),[]);
  const xml=buildPurchaseXML([r],{},'PUSULA');
  for(const tag of ['<PRICE>2945.30</PRICE>','<PRICE>178.50</PRICE>','<TOTAL_SERVICES>3123.80</TOTAL_SERVICES>','<TOTAL_VAT>589.06</TOTAL_VAT>','<TOTAL_NET>3712.86</TOTAL_NET>','<MASTER_CODE>770.02.014</MASTER_CODE>','<VAT_INCLUDED>0</VAT_INCLUDED>'])assert(xml.includes(tag),tag);
  assert(!xml.includes('<OHP_CODE1>'));assert(!xml.includes('KKEG_GL_CODE'));
  assert.throws(()=>splitFlight({...r,total:10000},20),/uyuşmuyor/);assert.throws(()=>splitFlight(r,0));
  assert.throws(()=>splitFlight({...r,lines:[{category:'meal'}]},20),/diğer masraf/);
});
test('Flight OCR distinguishes issue date from flight date and issuer identity from passenger TCKN',()=>{
  const r=parseReceipt('ÖRNEK AIRLINES\nBüyük Mükellefler V.D. 123 456 7890\nMükellef / Tax Payer: ÖRNEK (TCKN:11111111111)\nBelge No / Bilet No / Document No: 5555555555555\nDüzenlenme Tarihi / Issue Date: 22-10-2026\nUçuş Tarihi: 25/10/2026\nKDV / VAT : 589,06 TRY\nToplam Tutar / Total Amount : 3.712,86 TRY (KDV Dahildir/VAT Included)');
  assert.equal(r.total,371286);assert.equal(r.vat,58906);assert.equal(r.taxId,'1234567890');assert.equal(r.number,'5555555555555');assert.equal(r.date,'2026-10-22');assert.equal(r.lines[0].category,'flight');assert.equal(r.lines[0].vatRate,null);
});

test('Per-line VAT inclusion changes arithmetic, persists, and writes the edited Logo description verbatim',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const initial=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const draft={...initial,...receipt(),paymentCard:'309.07',total:12000,vat:2000,lines:[{description:'Düzeltilmiş Logo & açıklaması',category:'parking',gross:10000,vatRate:20,vatIncluded:false}]};
  assert.deepEqual(lineAmounts(draft.lines[0]),{gross:12000,net:10000,vat:2000,vatIncluded:false});assert.deepEqual(issues(draft),[]);
  const saved=await(await call(store,'record/'+id,draft)).json();assert.equal(saved.lines[0].vatIncluded,false);
  const xml=buildPurchaseXML([saved],{},'PUSULA');assert(xml.includes('<VAT_INCLUDED>0</VAT_INCLUDED>'));assert(xml.includes('<PRICE>100.00</PRICE>'));assert(xml.includes('<TOTAL_NET>120.00</TOTAL_NET>'));assert(xml.includes('<DESCRIPTION>Düzeltilmiş Logo &amp; açıklaması</DESCRIPTION>'));
  saved.lines[0].vatIncluded=true;saved.lines[0].gross=12000;
  assert.deepEqual(lineAmounts(saved.lines[0]),{gross:12000,net:10000,vat:2000,vatIncluded:true});
  const included=buildPurchaseXML([saved],{},'PUSULA');assert(included.includes('<VAT_INCLUDED>1</VAT_INCLUDED>'));assert(included.includes('<PRICE>120.00</PRICE>'));
  await assert.rejects(()=>call(store,'record/'+id,{...saved,lines:[{...saved.lines[0],vatIncluded:'false'}]}),/KDV dahil/);
});

test('Expense code memory is company scoped, reversible, and overrides only the selected Logo line',async()=>{
  const storage=new Storage(),pusula=new ExpenseStore(storage,'PUSULA');
  const r={...receipt(),paymentCard:'309.07',lines:[{description:'FİŞ NO:0072 ÖRNEK LOKANTA YEMEK',category:'meal',gross:11000,vatRate:10,expenseCode:'770.99.123'}]};
  const key=memoryKey(r,r.lines[0]);
  assert.equal(key,memoryKey({...r,number:'0099'},{...r.lines[0],description:'FİŞ NO:0099 ÖRNEK LOKANTA YEMEK'}));
  const remembered=await(await call(pusula,'profiles',{revision:0,memory:{key,code:'770.99.123'}})).json();
  assert.equal(remembered.memories[key],'770.99.123');
  assert.equal((await(await call(pusula,'list')).json()).profiles.memories[key],'770.99.123');
  assert.equal((await(await call(new ExpenseStore(new Storage(),'COMED'),'list')).json()).profiles.memories?.[key],undefined);
  assert.match(buildPurchaseXML([r],{},'PUSULA'),/<GL_CODE1>770\.99\.123<\/GL_CODE1>/);
  const initial=(await(await call(pusula,'image/'+id,jpg,true)).json()).receipt;
  const saved=await(await call(pusula,'record/'+id,{...initial,...r,reviewed:true})).json();
  assert.equal(saved.lines[0].expenseCode,'770.99.123');
  await assert.rejects(()=>call(pusula,'profiles',{revision:0,memory:{key,code:''}}),e=>e.status===409);
  const forgotten=await(await call(pusula,'profiles',{revision:remembered.revision,memory:{key,code:''}})).json();
  assert.equal(forgotten.memories[key],undefined);
  r.lines[0].expenseCode='';
  assert.match(buildPurchaseXML([r],{},'PUSULA'),/<GL_CODE1>770\.02\.013<\/GL_CODE1>/);
  await assert.rejects(()=>call(pusula,'profiles',{revision:forgotten.revision,memory:{key,code:'<bad>'}}),/geçersiz/);
});
