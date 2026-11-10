export const categories=Object.freeze({meal:'Yemek',bakery:'Unlu mamul',fuel:'Yakıt',parking:'Otopark',flight:'Uçak bileti',transport:'Ulaşım',other:'Diğer'});
export const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
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
export function validDate(value){return /^20\d{2}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function guessCategory(text){
  const n=normalize(text),matches=[['fuel',/\b(motorin|benzin|akaryakit|kursunsuz|lpg)\b/],['parking',/otopark|park ucreti/],['flight',/ucak|havayol|airlines|e.bilet|ucus/],['bakery',/unlu mamul|firin|pastane|pogaca|simit/],['meal',/yemek|restoran|restaurant|lokanta|doner|kebap|kafe|cafe/],['transport',/taksi|otobus|ulasim|tren/]].filter(([,re])=>re.test(n));
  return matches.length===1?matches[0][0]:'other';
}
const trailingMoney=line=>{const m=String(line).match(/(\d[\d.,]*[.,]\d{2})\s*(?:TL|TRY|₺)?\s*$/i);return m?cents(m[1]):null;};
export function parseReceipt(rawText,confidence=null){
  const text=String(rawText||'').slice(0,18000),lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean),notes=[];
  const dates=[...new Set([...text.matchAll(/\b(\d{2})[./-](\d{2})[./-](20\d{2})\b/g)].map(m=>m[3]+'-'+m[2]+'-'+m[1]).filter(d=>{try{return validDate(d);}catch{return false;}}))];
  const nums=[...new Set([...text.matchAll(/(?:F[İI][ŞS]|FATURA|BELGE|B[İI]LET)\s*(?:NO|NUMARASI)\.?\s*[:#]?\s*([A-Z0-9/-]{1,30})/gi)].map(m=>m[1]))];
  const totalLines=lines.filter(l=>/^(?:GENEL\s+TOPLAM|TOPLAM|TOP|[ÖO]DENECEK(?:\s+TUTAR)?)\b/i.test(l)&&!/KDV/i.test(l));
  const totals=[...new Set(totalLines.map(trailingMoney).filter(v=>v!==null))];
  const taxes=[...new Set(lines.filter(l=>/^(?:TOP\s*KDV|TOPLAM\s+KDV|KDV\s+TOPLAM|KDV\s*[:*])/i.test(l)).map(trailingMoney).filter(v=>v!==null))];
  const vkns=[...new Set([...text.matchAll(/(?:VKN|TCKN|VERG[İI]\s*(?:NO|NUMARASI))\s*[:/]?\s*(\d{10,11})\b/gi)].map(m=>m[1]))];
  const rates=[...new Set([...text.matchAll(/%\s*(\d{1,2})(?!\d)/g)].map(m=>Number(m[1])))];
  const items=[];
  for(const line of lines){
    if(/^(?:TOP|KDV|GENEL|NAK[İI]T|KRED[İI]|PARA|[ÖO]DENECEK)/i.test(line))continue;
    const rate=line.match(/%\s*(\d{1,2})(?!\d)/),gross=trailingMoney(line);
    if(rate&&gross!==null&&/[A-ZÇĞİÖŞÜ]/i.test(line.slice(0,rate.index))){items.push({description:line.slice(0,rate.index).trim().slice(0,200),category:guessCategory(line),gross,vatRate:Number(rate[1])});}
  }
  if(dates.length>1)notes.push('Birden fazla tarih okundu; belge tarihini seç.');
  if(totals.length>1)notes.push('Birden fazla toplam okundu; belge toplamını kontrol et.');
  if(rates.length>1&&!items.length)notes.push('Birden fazla KDV oranı var; kalemleri ayrı satırlara böl.');
  if(!items.length){items.push({description:'',category:guessCategory(text),gross:totals.length===1?totals[0]:null,vatRate:rates.length===1?rates[0]:null});notes.push('Ürün kalemleri ayrıştırılamadı; özet masraf satırını belgeyle karşılaştır.');}
  if(confidence!==null&&confidence<75)notes.push('Okuma güveni düşük; fotoğraf ve tüm alanları karşılaştır.');
  const seller=lines.find(l=>/[A-ZÇĞİÖŞÜ]/i.test(l)&&!/^\d|^(?:F[İI][ŞS]|TAR[İI]H|SAAT|VKN|TCKN|TOPLAM)/i.test(l))||'';
  return {seller:seller.slice(0,200),taxId:vkns.length===1?vkns[0]:'',date:dates.length===1?dates[0]:'',number:nums.length===1?nums[0]:'',currency:/\b(?:USD|EUR|GBP)\b/.test(text)?(text.match(/\b(?:USD|EUR|GBP)\b/)||[])[0]:'TRY',total:totals.length===1?totals[0]:null,vat:taxes.length===1?taxes[0]:null,lines:items.slice(0,40),rawText:text,confidence,notes,reviewed:false};
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
    if(!Object.hasOwn(categories,line.category))out.push(prefix+'kategori seçilmedi.');
    if(!Number.isSafeInteger(line.gross)||line.gross<=0){out.push(prefix+'KDV dahil tutar eksik.');complete=false;}
    if(!Number.isFinite(line.vatRate)||line.vatRate<0||line.vatRate>100){out.push(prefix+'KDV oranı eksik veya geçersiz.');complete=false;}
    if(Number.isSafeInteger(line.gross)&&Number.isFinite(line.vatRate)){gross+=line.gross;vat+=line.gross-Math.round(line.gross*100/(100+line.vatRate));}
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
export function exportReadiness(receipts,profiles={}){
  const reasons=[];const active=receipts.filter(r=>!r.archived),duplicates=duplicateIds(active);
  if(!active.length)reasons.push('Aktarılacak fiş yok.');
  for(const r of active){if(issues(r).length||!r.reviewed)reasons.push('Kontrolü tamamlanmamış fişler var.');if(duplicates.has(r.id))reasons.push('Olası mükerrer fişleri kontrol et.');}
  // Category mappings alone cannot establish a valid Logo import schema.
  // No imported or user-edited profile can bypass sample-based adapter validation.
  reasons.push('Logo satın alma XML şablonu örnek dosyalarla henüz doğrulanmadı.');
  return {ready:false,reasons:[...new Set(reasons)]};
}
