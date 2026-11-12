import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cents,parseReceipt,issues,guessCategory,duplicateIds,exportReadiness,buildPurchaseXML,categoryProfile,splitFlight,lineAmounts,memoryKey} from '../src/expenses/model.mjs';
import {ExpenseStore,limitedBytes} from '../server/expenses.mjs';

const sample='ÖRNEK LOKANTA\nVKN: 1234567890\nTARİH: 10.11.2026\nFİŞ NO: 0072\nYEMEK %10 110,00\nTOPKDV 10,00\nTOPLAM 110,00';
const receipt=()=>({...parseReceipt(sample,92),id:'one',reviewed:true});
class Storage{
  data=new Map();queue=Promise.resolve();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
  transaction(fn){const next=this.queue.then(async()=>{const before=structuredClone(this.data);try{return await fn(this);}catch(e){this.data=before;throw e;}});this.queue=next.catch(()=>{});return next;}
}
const jpg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(200000,42)]),id=createHash('sha256').update(jpg).digest('hex');
const call=(store,path,body,raw=false)=>store.handle(new Request('https://expense-store.internal/'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:raw?body:JSON.stringify(body)}));

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
