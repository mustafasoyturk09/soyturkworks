export const categories=Object.freeze({meal:'Yemek',wash:'Araç yıkama',fuel:'Yakıt',parking:'Otopark',flight:'Uçak bileti',transport:'Ulaşım',other:'Diğer'});
export const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export const validExpenseCode=code=>typeof code==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(code);
export const validQuantity=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100000&&Math.abs(value*1000-Math.round(value*1000))<1e-7;
export function calendarDays(year,month){
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7;
  return Array.from({length:42},(_,i)=>{const date=new Date(year,month,1-offset+i),iso=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');return {date,iso,outside:date.getMonth()!==month};});
}
export const receiptDescription=receipt=>[receipt.number?'FİŞ NO:'+receipt.number:'',String(receipt.seller||'').trim()].filter(Boolean).join(' ').slice(0,200);
// Logo'nun sağlanan XML örneği ISO-8859-9 kullanır. Bu kodlamada olmayan
// karakterler XML sayısal karakter başvurusu olarak saklanır; kayıp oluşmaz.
export function encodeLogoXML(xml){
  const turkish=new Map([['Ğ',0xd0],['İ',0xdd],['Ş',0xde],['ğ',0xf0],['ı',0xfd],['ş',0xfe]]),replaced=new Set([0xd0,0xdd,0xde,0xf0,0xfd,0xfe]);
  const bytes=[];for(const ch of String(xml).replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>/,'<?xml version="1.0" encoding="ISO-8859-9"?>')){const code=ch.codePointAt(0);if(turkish.has(ch))bytes.push(turkish.get(ch));else if(code<256&&!replaced.has(code))bytes.push(code);else for(const c of '&#'+code+';')bytes.push(c.charCodeAt(0));}return Uint8Array.from(bytes);
}
export function memoryKey(receipt,line){
  const seller=normalize(receipt.seller).replace(/\|/g,' ').trim().slice(0,120),merchant=receipt.taxId?.trim()||seller;
  if(!merchant||!line.category)return '';
  let description=normalize(line.description).replace(/^fis no:\s*\S+\s*/,'').trim();
  if(seller&&description.startsWith(seller))description=description.slice(seller.length);
  description=description.replace(/^[\s·:–-]+/,'').replace(/\|/g,' ').trim().slice(0,120);
  return [merchant,line.category==='bakery'?'meal':line.category,description||'*'].join('|');
}
export function rememberedProfile(receipt,line,profiles={}){
  const entries=profiles.lineProfiles||{},key=memoryKey(receipt,line),exact=entries[key];
  if(exact)return exact;
  const parts=key.split('|'),description=parts[2];
  if(!description||description==='*')return null;
  const matches=Object.entries(entries).filter(([k])=>{const p=k.split('|');return p[1]===parts[1]&&p[2]===description;}).map(([,v])=>v);
  return matches.length&&matches.every(p=>JSON.stringify(p)===JSON.stringify(matches[0]))?matches[0]:null;
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
export const groupedAmount=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100):'';
export const vatRateLabel=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?'%'+String(value):'Seç';
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
function sellerFromHeader(lines){
  const index=lines.findIndex(l=>/[A-ZÇĞİÖŞÜ]/i.test(l)&&!/^\d|^(?:F[İI][ŞS]|TAR[İI]H|SAAT|VKN|TCKN|TOPLAM)/i.test(l));
  if(index<0)return '';
  let seller=lines[index];
  const legal=/\b(?:ltd|limited|sirketi|sti|anonim|ticaret|tic|sanayi|san)\b/;
  const stop=/\b(?:mah|mahalle|cad|cadde|sok|sokak|adres|vergi|dairesi|vkn|tckn|istanbul|ankara|izmir|tel|telefon|fis|fatura|tarih|saat|kdv|toplam|nakit|kredi)\b/;
  for(let i=index+1;i<Math.min(lines.length,index+4);i++){
    const next=lines[i],n=normalize(next).replace(/[.,]/g,' ');
    const following=normalize(lines[i+1]||'').replace(/[.,]/g,' ');
    if(/\d/.test(next)||stop.test(n)||next.length>100||(!legal.test(n)&&(!/^ve\b/.test(n)||!following||stop.test(following)||!legal.test(following))))break;
    seller+=' '+next;
    if(/\b(?:sti|sirketi|anonim)\b/.test(n))break;
  }
  return seller.replace(/[,;:]+/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
}
// Keep the proprietor printed directly below the business title. Never infer
// a name from an address, payment section, passenger or cashier information.
export function completeReceiptSeller(receipt){
  let seller=String(receipt.seller||'').trim();
  // The user corrected this specific OCR pattern; preserve all other names.
  if(/\bco\s+tanlt\s+im\b/i.test(seller)&&/t[iİ]c[.,\s]*san[.,\s]*ltd[.,\s]*[şs]t[iİ]/i.test(seller)){
    const old=seller;let fixed=seller.replace(/\bco\s+tanlt\s+im\b/i,'VE TANITIM');fixed=fixed.replace(/t[iİ]c[.,\s]*san[.,\s]*ltd[.,\s]*[şs]t[iİ]\.?/i,'TİC.SAN.LTD.ŞTİ.');
    seller=fixed;receipt={...receipt,seller,lines:(receipt.lines||[]).map(line=>{const text=String(line.description||''),at=text.indexOf(old);return at>=0&&(at===0||text.startsWith('FİŞ NO:'))?{...line,description:(text.slice(0,at)+fixed+text.slice(at+old.length)).slice(0,200)}:line;})};
  }
  const header=String(receipt.rawText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),full=sellerFromHeader(header);
  if(seller&&full.length>seller.length&&normalize(full).startsWith(normalize(seller))){const old=seller;seller=full;receipt={...receipt,seller,lines:(receipt.lines||[]).map(line=>{const text=String(line.description||''),at=text.indexOf(old);return at>=0&&(at===0||text.startsWith('FİŞ NO:'))?{...line,description:(text.slice(0,at)+seller+text.slice(at+old.length)).slice(0,200)}:line;})};}
  const index=header.findIndex(s=>normalize(s)===normalize(seller));
  if(!seller||index<0||index>2)return receipt;
  const person=(header[index+1]||'').replace(/^(?:ADI?\s*SOYADI?|AD\s*SOYAD|İŞLETME\s*SAHİBİ)\s*:\s*/iu,'').trim();
  if(!/^[\p{L}]+(?:[ '\u2019-][\p{L}]+){1,3}$/u.test(person))return receipt;
  const nonName=/\b(mah|mahalle|mahallesi|cad|cadde|caddesi|sok|sokak|sokagi|bulvar|bulvari|apt|apartmani|adres|merkez|sube|subesi|san|sanayi|tic|ticaret|ltd|limited|sti|sirketi|anonim|hizmetleri|hizmet|vergi|dairesi|tel|telefon|fis|fatura|tarih|saat|kasiyer|kasiyeriniz|personel|yolcu|musteri|sayin|nakit|kredi|banka|bankasi|toplam|kdv|bilgi|belgesi|tesekkur|ederiz|hosgeldiniz|lokanta|restoran|restaurant|kafe|cafe|firin|pastane|mamulleri|temizleme|kurutemizleme|yikama|akaryakit|otopark|hava|yollari|airlines)\b/;
  if(nonName.test(normalize(person))||normalize(seller).includes(normalize(person)))return receipt;
  const fullPerson=seller+' - '+person.toLocaleUpperCase('tr');
  if(fullPerson.length>200)return receipt;
  const prefix='FİŞ NO:'+(receipt.number||'')+' '+seller;
  const lines=(receipt.lines||[]).map(line=>{
    const description=String(line.description||'');
    if(!description.startsWith(prefix))return line;
    const rest=description.slice(prefix.length),already=normalize(rest).replace(/^[\s·:–-]+/,'').startsWith(normalize(person));
    return already?line:{...line,description:(prefix+' - '+person.toLocaleUpperCase('tr')+rest).slice(0,200)};
  });
  return {...receipt,seller:fullPerson,lines};
}
export function parseReceipt(rawText,confidence=null){
  const text=String(rawText||'').slice(0,18000),lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean),notes=[];
  const dates=[...new Set([...text.matchAll(/\b(\d{2})[./-](\d{2})[./-](20\d{2})\b/g)].map(m=>m[3]+'-'+m[2]+'-'+m[1]).filter(d=>{try{return validDate(d);}catch{return false;}}))];
  const nums=[...new Set([...text.matchAll(/(?:F[İI][ŞS]|FATURA|BELGE|B[İI]LET)[ \t]*(?:NO|NUMARASI)\.?[ \t]*[:#]?[ \t]*([A-Z0-9/-]{1,30})/gi)].map(m=>m[1]).filter(n=>/\d/.test(n)))];
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
  const seller=sellerFromHeader(lines);
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
  for(const line of result.lines){const prefix=receiptDescription(result);if(prefix)line.description=(prefix+(line.description?' · '+line.description:'')).slice(0,200);}
  return completeReceiptSeller(result);
}
export function mergeReceiptReadings(primary,alternatives){
  const result={...primary};
  const noisy=s=>/[A-ZÇĞİÖŞÜ]{3}/.test(s)&&/(?:^|\s)[a-zçğıöşü]{1,2}(?=\s|$)/.test(s),prefix=normalize(result.seller).split(/\s+/).slice(0,3).join(' ');
  if(prefix.split(' ').length===3&&noisy(result.seller||'')){
    const matches=alternatives.map(r=>r.seller||'').filter(s=>normalize(s).startsWith(prefix+' ')&&!noisy(s)&&/\b(?:ltd|limited|sti|sirketi)\b/.test(normalize(s)));
    if(matches.length&&new Set(matches.map(normalize)).size===1){const old=result.seller,replacement=matches[0];result.seller=replacement;result.lines=(result.lines||[]).map(line=>{const text=String(line.description||''),at=text.indexOf(old);return at>=0?{...line,description:(text.slice(0,at)+replacement+text.slice(at+old.length)).slice(0,200)}:line;});}
  }
  const candidates=alternatives.map(r=>r.seller).filter(s=>s&&result.seller&&normalize(s).startsWith(normalize(result.seller))&&s.length>result.seller.length);
  if(candidates.length){const longest=candidates.sort((a,b)=>b.length-a.length)[0];if(candidates.every(s=>normalize(longest).startsWith(normalize(s)))){const old=result.seller;result.seller=longest;result.lines=(result.lines||[]).map(line=>{const text=String(line.description||''),at=text.indexOf(old);return at>=0?{...line,description:(text.slice(0,at)+longest+text.slice(at+old.length)).slice(0,200)}:line;});}}
  for(const field of ['taxId','date','number','total','vat']){
    if(result[field]!==''&&result[field]!==null&&result[field]!==undefined)continue;
    const values=[...new Set(alternatives.map(r=>r[field]).filter(v=>v!==''&&v!==null&&v!==undefined))];
    if(values.length===1)result[field]=values[0];
  }
  return result;
}
// A missing line must remain editable; only use OCR item amounts when they
// reconcile exactly with the stored document total. The source stays intact.
export function draftMissingLines(receipt){
  const parsed=parseReceipt(receipt.rawText||'',receipt.confidence),lines=parsed.lines||[];
  const sum=lines.reduce((n,line)=>n+(Number.isSafeInteger(line.gross)?line.gross:0),0);
  if(lines.length&&Number.isSafeInteger(receipt.total)&&sum===receipt.total&&lines.every(line=>Number.isSafeInteger(line.gross)&&Number.isFinite(line.vatRate)))return lines;
  return [{description:('FİŞ NO:'+(receipt.number||'')+' '+(receipt.seller||'')).trim(),category:guessCategory(receipt.rawText||''),gross:Number.isSafeInteger(receipt.total)?receipt.total:null,vatRate:null,vatIncluded:true}];
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
    if(line.quantity!==undefined&&!validQuantity(line.quantity))out.push(prefix+'miktar geçersiz.');
    if(Number.isSafeInteger(line.gross)&&validQuantity(line.quantity)&&Math.round(Math.round(line.gross/line.quantity)*line.quantity)!==line.gross)out.push(prefix+'miktar ile birim fiyatın yuvarlamasını kontrol et.');
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
export function lineProfile(line,profiles={},company='',receipt=null){
  const remembered=receipt?rememberedProfile(receipt,line,profiles):null;
  const specific=receipt&&line.category==='other'&&Object.keys(profiles.lineProfiles||{}).some(k=>k.split('|')[1]==='other');
  const p={...(specific?{}:categoryProfile(line.category,profiles,company)),...remembered};
  // Service and cost centre belong to this expense account, not its VAT rate.
  // Only the confirmed 20% VAT mapping is supplied; other rates need their own.
  if(company==='PUSULA'&&line.category==='other'&&line.expenseCode==='770.15.006')return {...p,serviceCode:p.serviceCode||'770.15.006',costCenter:p.costCenter||'DB.01',vatCode20:p.vatCode20||'191.01.004'};
  return p;
}
export function matchesReceiptFilters(receipt,{from='',to='',ocr=''}={}){
  if((from||to)&&(!receipt.date||(from&&receipt.date<from)||(to&&receipt.date>to)))return false;
  const state=receipt.error?'error':receipt.ocrDone?'done':'pending';
  return !ocr||ocr===state;
}
export function exportReadiness(receipts,profiles={},company=''){
  if(company&&company!=='PUSULA')return {ready:false,reasons:['Bu firma için Logo gider ve ödeme kartı kuralları henüz tanımlanmadı.']};
  const reasons=[],active=receipts.filter(r=>!r.archived&&!r.exported),duplicates=duplicateIds(receipts.filter(r=>!r.archived));
  if(!active.length)reasons.push('Aktarılacak fiş yok.');
  for(const r of active){
    const problems=issues(r);if(problems.length||!r.reviewed)reasons.push('Fişlerin kontrolünü tamamla.',...problems);
    if((r.lines||[]).reduce((sum,l)=>sum+(lineAmounts(l).gross||0),0)!==r.total)reasons.push('Satır toplamını belge toplamına eşitle.');
    if(duplicates.has(r.id))reasons.push('Olası mükerrer fişleri kontrol et.');
    if(!Object.hasOwn(paymentCards,r.paymentCard||''))reasons.push('Her fiş için kredi kartını seç.');
    if(r.currency!=='TRY')reasons.push('Dövizli belgeler için aktarım henüz desteklenmiyor.');
    for(const l of r.lines||[]){
      const p=lineProfile(l,profiles,company,r),label=categories[l.category]||'Masraf';
      // The supplied vehicle examples and GIB review cover 2026 only. Do not
      // silently carry accounting assumptions into a different document year.
      if(company==='PUSULA'&&['fuel','parking','wash'].includes(l.category)&&r.date?.slice(0,4)!=='2026')reasons.push('Binek araç gideri: belge yılı için mevzuat ve Logo KKEG tanımlarını doğrula.');
      if(!p.serviceCode)reasons.push(label+': Logo eşleştirmesini tamamla — hizmet/stok kodu eksik.');
      if(!(l.expenseCode||p.accountCode))reasons.push(label+': gider hesabı kodu eksik.');
      if(!p.costCenter&&l.category!=='flight')reasons.push(label+': Logo eşleştirmesini tamamla — masraf merkezi eksik.');
      if(l.vatRate>0&&!p['vatCode'+l.vatRate])reasons.push(label+': %'+l.vatRate+' KDV hesap kodunu tanımla.');
    }
  }
  return {ready:reasons.length===0,reasons:[...new Set(reasons)]};
}
export function buildPurchaseXML(receipts,profiles={},company='',{selected=false}={}){
  const status=exportReadiness(receipts,profiles,company);if(!selected&&!status.ready)throw Error(status.reasons.join(' '));
  if(selected&&(!receipts.length||company!=='PUSULA'))throw Error('Aktarılacak fiş bulunamadı.');
  if(receipts.some(r=>!r.archived&&!r.exported&&r.currency!=='TRY'))throw Error('Dövizli fişlerin Logo XML aktarımı henüz desteklenmiyor.');
  const esc=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const tag=(k,v)=>'<'+k+'>'+esc(v)+'</'+k+'>',money=v=>Number.isSafeInteger(v)?(v/100).toFixed(2):'';
  const active=receipts.filter(r=>!r.archived&&!r.exported);
  if(selected){
    if(!active.length)throw Error('Aktarılacak fiş bulunamadı.');
    if(active.some(r=>{try{return !validDate(r.date)||!r.number?.trim()||!r.seller?.trim();}catch{return true;}}))throw Error('Seçilen fişlerin tarih, fiş numarası ve satıcı alanlarını tamamlayın.');
    if(active.some(r=>!Object.hasOwn(paymentCards,r.paymentCard||'')))throw Error('Her fiş için ödeme kartını seçin.');
    if(new Set(active.map(r=>r.paymentCard)).size>1)throw Error('Farklı ödeme kartlarına ait fişleri ayrı ayrı aktarın.');
    if(active.some(r=>!Number.isSafeInteger(r.total)||!Number.isSafeInteger(r.vat)||!r.lines?.length||r.lines.some(l=>!Number.isSafeInteger(l.gross)||!Number.isFinite(l.vatRate))))throw Error('Seçilen fişlerin tutar, KDV ve satır bilgilerini tamamlayın.');
    if(active.some(r=>r.lines.some(l=>{const p=lineProfile(l,profiles,company,r);return !p.serviceCode||!(l.expenseCode||p.accountCode)||(l.vatRate>0&&!p['vatCode'+l.vatRate]);})))throw Error('Seçilen fişlerin hizmet, gider ve KDV hesap kodlarını tamamlayın.');
    if(active.some(r=>Math.abs(r.lines.reduce((n,l)=>n+(lineAmounts(l).gross||0),0)-r.total)>2||Math.abs(r.lines.reduce((n,l)=>n+(lineAmounts(l).vat||0),0)-r.vat)>2))throw Error('Fişin satır toplamı veya KDV tutarı belgeyle uyuşmuyor.');
    const periods=new Set(active.map(r=>r.date.slice(0,7)));if(periods.size>1)throw Error('Önceki aya ait fişlerin toplu kayıtta ayın birine işlenmesi Logo üzerinde henüz doğrulanamadı. Bu fişleri şimdilik aynı XML içinde aktarmayın.');
  }
  const groups=selected?[[...active].sort((a,b)=>b.date.localeCompare(a.date))]:active.map(r=>[r]);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<PURCHASE_INVOICES>'+groups.map(group=>{
    const r=group[0],date=(r.date||'').split('-').reverse().join('.'),card=paymentCards[r.paymentCard];
    const rows=group.map(r=>{
    const taxes=r.lines.map(l=>lineAmounts(l).vat);
    const adjustment=Number.isSafeInteger(r.vat)&&taxes.every(Number.isSafeInteger)?r.vat-taxes.reduce((a,b)=>a+b,0):0,lastTaxed=r.lines.findLastIndex(l=>l.vatRate>0);
    if(adjustment&&lastTaxed<0&&!selected)throw Error('KDV toplamını kontrol et.');
    if(lastTaxed>=0&&(!selected||Math.abs(adjustment)<=2))taxes[lastTaxed]+=adjustment;
    return r.lines.map((l,i)=>{const p=lineProfile(l,profiles,company,r),vat=taxes[i],gross=lineAmounts(l).gross,net=Number.isSafeInteger(gross)&&Number.isSafeInteger(vat)?gross-vat:null,price=l.vatIncluded===false?net:gross;
      const quantity=l.quantity??1,unitPrice=Number.isSafeInteger(price)&&validQuantity(quantity)?Math.round(price/quantity):null;if(unitPrice!==null&&Math.round(unitPrice*quantity)!==price)throw Error('Miktar ve birim fiyat yuvarlamasını kontrol et.');
      return '<TRANSACTION>'+tag('TYPE',4)+tag('MASTER_CODE',p.serviceCode)+(p.costCenter?tag('OHP_CODE1',p.costCenter):'')+tag('GL_CODE1',l.expenseCode||p.accountCode)+(vat?tag('GL_CODE2',p['vatCode'+l.vatRate]):'')+tag('QUANTITY',quantity)+tag('PRICE',money(unitPrice))+tag('TOTAL',money(price))+tag('DESCRIPTION',selected&&r===group[0]&&i===0?receiptDescription(r):l.description)+tag('UNIT_CODE','ADET')+tag('UNIT_CONV1',1)+tag('UNIT_CONV2',1)+tag('VAT_INCLUDED',l.vatIncluded===false?0:1)+tag('VAT_RATE',l.vatRate)+tag('VAT_AMOUNT',money(vat))+tag('VAT_BASE',money(net))+tag('TOTAL_NET',money(net))+tag('BILLED',1)+(p.kkegCode?tag('KKEG_GL_CODE',p.kkegCode)+tag('KKEG_OHP_CODE',p.costCenter):'')+(p.kkegVatCode?tag('KKEG_VAT_GL_CODE',p.kkegVatCode)+tag('KKEG_VAT_OHP_CODE',p.costCenter):'')+'</TRANSACTION>';
    }).join('');}).join('');
    const totals=group.map(item=>item.total),vats=group.map(item=>item.vat),total=totals.every(Number.isSafeInteger)?totals.reduce((a,b)=>a+b,0):null,vat=vats.every(Number.isSafeInteger)?vats.reduce((a,b)=>a+b,0):null,net=Number.isSafeInteger(total)&&Number.isSafeInteger(vat)?total-vat:null,services=group.flatMap(item=>item.lines.map(l=>l.vatIncluded===false?lineAmounts(l).net:lineAmounts(l).gross));
    return '<INVOICE DBOP="INS">'+tag('TYPE',4)+tag('NUMBER','~')+tag('DATE',date)+tag('DOC_DATE',date)+tag('DOC_NUMBER',r.number)+(selected?tag('NOTES1',receiptDescription(r)):'')+tag('ARP_CODE',r.paymentCard)+tag('GL_CODE',card?.glCode)+tag('TOTAL_DISCOUNTED',money(net))+tag('TOTAL_GROSS',money(net))+tag('TOTAL_VAT',money(vat))+tag('TOTAL_NET',money(total))+tag('TC_NET',money(total))+tag('CURRSEL_TOTALS',2)+'<TRANSACTIONS>'+rows+'</TRANSACTIONS><PAYMENT_LIST><PAYMENT>'+tag('DATE',date)+tag('MODULENR',4)+tag('SIGN',1)+tag('TRCODE',4)+tag('TOTAL',money(total))+tag('PROCDATE',date)+tag('PAY_NO',1)+'</PAYMENT></PAYMENT_LIST>'+tag('TOTAL_SERVICES',money(services.every(Number.isSafeInteger)?services.reduce((a,b)=>a+b,0):null))+tag('EBOOK_DOCTYPE',99)+'</INVOICE>';
  }).join('\n')+'</PURCHASE_INVOICES>';
}
