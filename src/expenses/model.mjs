export const categories=Object.freeze({meal:'Yemek',wash:'Araç yıkama',fuel:'Yakıt',parking:'Otopark',flight:'Uçak bileti',transport:'Ulaşım',other:'Diğer'});
export const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export const validExpenseCode=code=>typeof code==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(code);
export function memoryKey(receipt,line){
  const seller=normalize(receipt.seller).replace(/\|/g,' ').trim().slice(0,120),merchant=receipt.taxId?.trim()||seller;
  if(!merchant||!line.category)return '';
  let description=normalize(line.description).replace(/^fis no:\s*\S+\s*/,'').trim();
  if(seller&&description.startsWith(seller))description=description.slice(seller.length);
  description=description.replace(/^[\s·:–-]+/,'').replace(/\|/g,' ').trim().slice(0,120);
  return [merchant,line.category==='bakery'?'meal':line.category,description||'*'].join('|');
}
export function cents(value){
  if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
  let s=String(value??'').trim().replace(/(?:TL|TRY|₺)/gi,'').replace(/[\s*]/g,'');
  if(!s)return null;
  if(s.includes(',')){if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(s))return null;s=s.replace(/\./g,'').replace(',','.');}
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
  const n=Math.round(Number(s)*100);return Number.isSafeInteger(n)&&n<=1e11?n:null;
}
export const amount=value=>Number.isSafeInteger(value)?(value/100).toFixed(2).replace('.',','):'';
export function lineAmounts(line){
  const value=line.gross,rate=line.vatRate,vatIncluded=line.vatIncluded!==false;
  if(!Number.isSafeInteger(value)||value<0||!Number.isFinite(rate)||rate<0||rate>100)return {gross:null,net:null,vat:null,vatIncluded};
  const net=vatIncluded?Math.round(value*100/(100+rate)):value;
  const vat=vatIncluded?value-net:Math.round(value*rate/100);
  return {gross:net+vat,net,vat,vatIncluded};
}
export function splitFlight(receipt,rate){
  if(receipt.lines?.some(l=>l.category!=='flight'))throw Error('Bilet ayrımı için bütün satırlar uçak bileti olmalı; diğer masraf satırlarını koruyarak ayrı belge kullan.');
  if(!Number.isFinite(rate)||rate<=0||rate>100)throw Error('Biletin KDV oranını doğrula.');
  if(!Number.isSafeInteger(receipt.total)||receipt.total<=0||!Number.isSafeInteger(receipt.vat)||receipt.vat<=0)throw Error('Biletin toplamını ve KDV tutarını doldur.');
  const net=Math.round(receipt.vat*100/rate),gross=net+receipt.vat,remainder=receipt.total-gross;
  if(remainder<0)throw Error('KDV tutarı ve oranı belge toplamıyla uyuşmuyor.');
  const prefix='FİŞ NO:'+receipt.number+' '+receipt.seller;
  return [{description:prefix+' · Uçak bileti KDV’li tutar',category:'flight',gross:net,vatRate:rate,vatIncluded:false},...(remainder?[{description:prefix+' · Uçak bileti KDV’siz tutar',category:'flight',gross:remainder,vatRate:0,vatIncluded:false}]:[])];
}
export function validDate(value){return /^20\d{2}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function guessCategory(text){
  const n=normalize(text),matches=[['fuel',/\b(motorin|benzin|akaryakit|kursunsuz|lpg)\b/],['parking',/otopark|park ucreti/],['flight',/ucak|havayol|airlines|e.bilet|ucus/],['wash',/yikama|car wash/],['meal',/unlu mam|firin|pastane|pogaca|simit|yemek|yiyecek|izgara|corba|cay|asure|su pet|restoran|restaurant|lokanta|doner|kebap|kafe|cafe/],['transport',/taksi|otobus|ulasim|tren/]].filter(([,re])=>re.test(n));
  return matches.length===1?matches[0][0]:'other';
}
const trailingMoney=line=>{const m=String(line).match(/(\d[\d.,]*[.,]\d{2})\s*(?:TL|TRY|₺)?\s*$/i);return m?cents(m[1]):null;};
export function parseReceipt(rawText,confidence=null){
  const text=String(rawText||'').slice(0,18000),lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean),notes=[];
  const dates=[...new Set([...text.matchAll(/\b(\d{2})[./-](\d{2})[./-](20\d{2})\b/g)].map(m=>m[3]+'-'+m[2]+'-'+m[1]).filter(d=>{try{return validDate(d);}catch{return false;}}))];
  const nums=[...new Set([...text.matchAll(/(?:F[İI][ŞS]|FATURA|BELGE|B[İI]LET)\s*(?:NO|NUMARASI)\.?\s*[:#]?\s*([A-Z0-9/-]{1,30})/gi)].map(m=>m[1]))];
  const totalLines=lines.filter(l=>/^(?:GENEL\s+TOPLAM|TOPLAM|TOP|[ÖO]DENECEK(?:\s+TUTAR)?)\b/i.test(l)&&!/KDV/i.test(l));
  const totals=[...new Set(totalLines.map(trailingMoney).filter(v=>v!==null))];
  const taxes=[...new Set(lines.filter(l=>/^(?:TOP\s*KDV|TOPLAM\s+KDV|KDV\s+TOPLAM|KDV\s*(?:[:*]|(?=\d)))/i.test(l)).map(trailingMoney).filter(v=>v!==null))];
  const vkns=[...new Set([...text.matchAll(/(?:VKN|TCKN|VERG[İI]\s*(?:NO|NUMARASI))\s*[:/]?\s*(\d{10,11})\b/gi)].map(m=>m[1]))];
  if(!vkns.length){const printed=lines.flatMap(l=>/^\d{10,11}$/.test(l)?[l]:/\bV\.?D\.?|\bVD\b/i.test(l)?[...(l.matchAll(/\b\d{10,11}\b/g))].map(m=>m[0]):[]);vkns.push(...new Set(printed));}
  const rates=[...new Set([...text.matchAll(/%\s*(\d{1,2})(?!\d)/g)].map(m=>Number(m[1])))];
  const items=[];
  for(const line of lines){
    if(/^(?:TOP|KDV|GENEL|NAK[İI]T|KRED[İI]|PARA|[ÖO]DENECEK)/i.test(line))continue;
    const rate=line.match(/%\s*(\d{1,2})(?!\d)/),gross=trailingMoney(line);
    if(rate&&gross!==null&&/[A-ZÇĞİÖŞÜ]/i.test(line.slice(0,rate.index))){items.push({description:line.slice(0,rate.index).trim().slice(0,200),category:guessCategory(line)==='other'?guessCategory(text):guessCategory(line),gross,vatRate:Number(rate[1]),vatIncluded:true});}
  }
  if(dates.length>1)notes.push('Birden fazla tarih okundu; belge tarihini seç.');
  if(totals.length>1)notes.push('Birden fazla toplam okundu; belge toplamını kontrol et.');
  if(rates.length>1&&!items.length)notes.push('Birden fazla KDV oranı var; kalemleri ayrı satırlara böl.');
  if(!items.length){items.push({description:'',category:guessCategory(text),gross:totals.length===1?totals[0]:null,vatRate:rates.length===1?rates[0]:null,vatIncluded:true});notes.push('Ürün kalemleri ayrıştırılamadı; özet masraf satırını belgeyle karşılaştır.');}
  if(confidence!==null&&confidence<75)notes.push('Okuma güveni düşük; fotoğraf ve tüm alanları karşılaştır.');
  const seller=lines.find(l=>/[A-ZÇĞİÖŞÜ]/i.test(l)&&!/^\d|^(?:F[İI][ŞS]|TAR[İI]H|SAAT|VKN|TCKN|TOPLAM)/i.test(l))||'';
  const result={seller:seller.slice(0,200),taxId:vkns.length===1?vkns[0]:'',date:dates.length===1?dates[0]:'',number:nums.length===1?nums[0]:'',currency:/\b(?:USD|EUR|GBP)\b/.test(text)?(text.match(/\b(?:USD|EUR|GBP)\b/)||[])[0]:'TRY',total:totals.length===1?totals[0]:null,vat:taxes.length===1?taxes[0]:null,lines:items.slice(0,40),rawText:text,confidence,notes,reviewed:false};
  if(guessCategory(text)==='flight'){
    const unique=values=>{const distinct=[...new Set(values.filter(v=>v!==null&&v!==undefined&&v!==''))];return distinct.length===1?distinct[0]:null;};
    const total=unique(lines.filter(l=>/toplam tutar|total amount/.test(normalize(l))).map(l=>trailingMoney(l.replace(/\s*\([^)]*\)\s*$/,''))));
    const vat=unique(lines.filter(l=>/^kdv\s*\/\s*vat/.test(normalize(l))).map(trailingMoney));
    if(total!==null)result.total=total;if(vat!==null)result.vat=vat;
    const date=unique(lines.filter(l=>/duzenlenme tarihi|issue date/.test(normalize(l))).map(l=>{const m=l.match(/(\d{2})[./-](\d{2})[./-](20\d{2})/);if(!m)return null;const d=m[3]+'-'+m[2]+'-'+m[1];try{return validDate(d)?d:null;}catch{return null;}}));
    if(date){result.date=date;result.notes=result.notes.filter(n=>!n.startsWith('Birden fazla tarih'));}
    const number=unique(lines.filter(l=>/bilet no|ticket number|document no/.test(normalize(l))).map(l=>l.match(/:\s*([A-Z0-9-]+)\s*$/i)?.[1]));
    if(number)result.number=number;
    // Passenger TCKN is not the seller's tax identity.
    result.taxId=unique(lines.filter(l=>/v\.?\s*d\.?|vergi|vkn/.test(normalize(l))&&!/tckn|tax payer/.test(normalize(l))).map(l=>l.match(/\b(\d{3}\s+\d{3}\s+\d{4}|\d{10})\b/)?.[1]?.replace(/\s/g,'')))||'';
    if(result.lines.length===1&&result.lines[0].vatRate===null)result.lines[0]={description:'Uçak bileti',category:'flight',gross:result.total,vatRate:null,vatIncluded:true};
  }
  for(const line of result.lines){if(result.number&&result.seller)line.description=('FİŞ NO:'+result.number+' '+result.seller+(line.description?' · '+line.description:'')).slice(0,200);}
  return result;
}
export function issues(receipt){
  const out=[];
  if(!receipt.seller?.trim())out.push('Satıcı unvanı eksik.');
  if(!/^\d{10,11}$/.test(receipt.taxId||''))out.push('VKN / TCKN okunmadı veya eksik.');
  let date=false;try{date=validDate(receipt.date);}catch{}if(!date)out.push('Belge tarihi eksik veya geçersiz.');
  if(!receipt.number?.trim())out.push('Fiş / fatura / bilet numarası eksik.');
  if(!['TRY','USD','EUR','GBP'].includes(receipt.currency))out.push('Para birimini seç.');
  if(!Number.isSafeInteger(receipt.total)||receipt.total<=0)out.push('Belge toplamı eksik veya geçersiz.');
  if(!Number.isSafeInteger(receipt.vat)||receipt.vat<0)out.push('Belgedeki toplam KDV okunmadı; elle doğrula.');
  if(!receipt.lines?.length)out.push('En az bir masraf satırı ekle.');
  let gross=0,vat=0,complete=true;
  for(const [i,line] of (receipt.lines||[]).entries()){
    const prefix=(i+1)+'. satır: ';
    if(!line.description?.trim())out.push(prefix+'açıklama eksik.');
    if(line.expenseCode&&!validExpenseCode(line.expenseCode))out.push(prefix+'gider hesabı kodu geçersiz.');
    if(!Object.hasOwn(categories,line.category))out.push(prefix+'kategori seçilmedi.');
    if(!Number.isSafeInteger(line.gross)||line.gross<=0){out.push(prefix+'satır tutarı eksik.');complete=false;}
    if(!Number.isFinite(line.vatRate)||line.vatRate<0||line.vatRate>100){out.push(prefix+'KDV oranı eksik veya geçersiz.');complete=false;}
    if(line.vatIncluded!==undefined&&typeof line.vatIncluded!=='boolean')out.push(prefix+'KDV dahil/hariç seçimi geçersiz.');
    const calculated=lineAmounts(line);if(calculated.gross!==null){gross+=calculated.gross;vat+=calculated.vat;}
  }
  if(complete&&Number.isSafeInteger(receipt.total)&&Math.abs(gross-receipt.total)>2)out.push('Satır toplamları belge toplamıyla uyuşmuyor.');
  if(complete&&Number.isSafeInteger(receipt.vat)&&Math.abs(vat-receipt.vat)>2)out.push('Satırlardan hesaplanan KDV, belgedeki KDV ile uyuşmuyor.');
  return out;
}
export function duplicateIds(receipts){
  const ids=new Set(),keys=new Map();
  for(const r of receipts.filter(r=>!r.archived)){
    if(!r.taxId||!r.number||!r.date)continue;
    const key=[r.taxId,r.date,normalize(r.number)].join('|');
    if(keys.has(key)){ids.add(r.id);ids.add(keys.get(key));}else keys.set(key,r.id);
  }
  return ids;
}
export const paymentCards=Object.freeze({'309.07':{label:'9190 KK',glCode:'309.01.007'},'309.03':{label:'3915 KK',glCode:'309.01.001'}});
export function categoryProfile(category,profiles={},company=''){
  if(company&&company!=='PUSULA')return {};
  category=category==='bakery'?'meal':category;
  const defaults=company==='PUSULA'?{
    meal:{serviceCode:'770.02.013',accountCode:'770.02.013',costCenter:'DB.01',vatCode10:'191.01.005'},
    flight:{serviceCode:'770.02.014',accountCode:'770.02.014',vatCode20:'191.01.004'},
    ...Object.fromEntries(['fuel','parking','wash','transport'].map(k=>[k,{serviceCode:'770.11.004',accountCode:'770.11.004',costCenter:'DB.01',vatCode20:'191.01.004',kkegCode:'689.03.012',kkegVatCode:'689.03.003'}]))
  }:{};
  return {...defaults[category],...profiles.categories?.[category]};
}
export function exportReadiness(receipts,profiles={},company=''){
  if(company&&company!=='PUSULA')return {ready:false,reasons:['Bu firma için Logo gider ve ödeme kartı kuralları henüz tanımlanmadı.']};
  const reasons=[],active=receipts.filter(r=>!r.archived),duplicates=duplicateIds(active);
  if(!active.length)reasons.push('Aktarılacak fiş yok.');
  for(const r of active){
    if(issues(r).length||!r.reviewed)reasons.push('Fişlerin kontrolünü tamamla.');
    if((r.lines||[]).reduce((sum,l)=>sum+(lineAmounts(l).gross||0),0)!==r.total)reasons.push('Satır toplamını belge toplamına eşitle.');
    if(duplicates.has(r.id))reasons.push('Olası mükerrer fişleri kontrol et.');
    if(!Object.hasOwn(paymentCards,r.paymentCard||''))reasons.push('Her fiş için kredi kartını seç.');
    if(r.currency!=='TRY')reasons.push('Dövizli belgeler için aktarım henüz desteklenmiyor.');
    for(const l of r.lines||[]){
      const p=categoryProfile(l.category,profiles,company),label=categories[l.category]||'Masraf';
      // The supplied vehicle examples and GIB review cover 2026 only. Do not
      // silently carry accounting assumptions into a different document year.
      if(company==='PUSULA'&&['fuel','parking','wash'].includes(l.category)&&r.date?.slice(0,4)!=='2026')reasons.push('Binek araç gideri: belge yılı için mevzuat ve Logo KKEG tanımlarını doğrula.');
      if(!p.serviceCode||!(l.expenseCode||p.accountCode)||(!p.costCenter&&l.category!=='flight'))reasons.push(label+': Logo eşleştirmesini tamamla.');
      if(l.vatRate>0&&!p['vatCode'+l.vatRate])reasons.push(label+': %'+l.vatRate+' KDV hesap kodunu tanımla.');
    }
  }
  return {ready:reasons.length===0,reasons:[...new Set(reasons)]};
}
export function buildPurchaseXML(receipts,profiles={},company=''){
  const status=exportReadiness(receipts,profiles,company);if(!status.ready)throw Error(status.reasons.join(' '));
  const esc=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const tag=(k,v)=>'<'+k+'>'+esc(v)+'</'+k+'>',money=v=>(v/100).toFixed(2);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<PURCHASE_INVOICES>'+receipts.filter(r=>!r.archived).map(r=>{
    const date=r.date.split('-').reverse().join('.'),card=paymentCards[r.paymentCard];
    const taxes=r.lines.map(l=>lineAmounts(l).vat);
    const adjustment=r.vat-taxes.reduce((a,b)=>a+b,0),lastTaxed=r.lines.findLastIndex(l=>l.vatRate>0);
    if(adjustment&&lastTaxed<0)throw Error('KDV toplamını kontrol et.');
    if(lastTaxed>=0)taxes[lastTaxed]+=adjustment;
    const rows=r.lines.map((l,i)=>{const p=categoryProfile(l.category,profiles,company),vat=taxes[i],net=lineAmounts(l).gross-vat,price=l.vatIncluded===false?net:lineAmounts(l).gross;
      return '<TRANSACTION>'+tag('TYPE',4)+tag('MASTER_CODE',p.serviceCode)+(p.costCenter?tag('OHP_CODE1',p.costCenter):'')+tag('GL_CODE1',l.expenseCode||p.accountCode)+(vat?tag('GL_CODE2',p['vatCode'+l.vatRate]):'')+tag('QUANTITY',1)+tag('PRICE',money(price))+tag('TOTAL',money(price))+tag('DESCRIPTION',l.description)+tag('UNIT_CODE','ADET')+tag('UNIT_CONV1',1)+tag('UNIT_CONV2',1)+tag('VAT_INCLUDED',l.vatIncluded===false?0:1)+tag('VAT_RATE',l.vatRate)+tag('VAT_AMOUNT',money(vat))+tag('VAT_BASE',money(net))+tag('TOTAL_NET',money(net))+tag('BILLED',1)+(p.kkegCode?tag('KKEG_GL_CODE',p.kkegCode)+tag('KKEG_OHP_CODE',p.costCenter):'')+(p.kkegVatCode?tag('KKEG_VAT_GL_CODE',p.kkegVatCode)+tag('KKEG_VAT_OHP_CODE',p.costCenter):'')+'</TRANSACTION>';
    }).join('');
    const vat=r.vat,net=r.total-vat;
    return '<INVOICE DBOP="INS">'+tag('TYPE',4)+tag('NUMBER','~')+tag('DATE',date)+tag('DOC_DATE',date)+tag('DOC_NUMBER',r.number)+tag('ARP_CODE',r.paymentCard)+tag('GL_CODE',card.glCode)+tag('TOTAL_DISCOUNTED',money(net))+tag('TOTAL_GROSS',money(net))+tag('TOTAL_VAT',money(vat))+tag('TOTAL_NET',money(r.total))+tag('TC_NET',money(r.total))+tag('CURRSEL_TOTALS',2)+'<TRANSACTIONS>'+rows+'</TRANSACTIONS><PAYMENT_LIST><PAYMENT>'+tag('DATE',date)+tag('MODULENR',4)+tag('SIGN',1)+tag('TRCODE',4)+tag('TOTAL',money(r.total))+tag('PROCDATE',date)+tag('PAY_NO',1)+'</PAYMENT></PAYMENT_LIST>'+tag('TOTAL_SERVICES',money(r.lines.reduce((sum,l,i)=>sum+(l.vatIncluded===false?lineAmounts(l).net:lineAmounts(l).gross),0)))+tag('EBOOK_DOCTYPE',99)+'</INVOICE>';
  }).join('\n')+'</PURCHASE_INVOICES>';
}
