/* Pusula-only, browser-local preparation. No invoice or accounting write API. */
(() => {
  'use strict';
  const normalize=value=>String(value??'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
  const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
  function cents(value){
    if(typeof value==='number'){
      if(!Number.isFinite(value)||Math.abs(value)>=1e11)return null;
      const scaled=value*100;return Math.abs(scaled-Math.round(scaled))<.00001?Math.round(scaled):null;
    }
    let text=clean(value).replace(/[₺\s]/g,'').replace(/TRY|TL/gi,'');
    if(!text)return null;
    if(text.includes(',')){
      if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(text))return null;
      text=text.replace(/\./g,'').replace(',','.');
    }else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(text))text=text.replace(/\./g,'');
    if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))return null;
    const result=Number(text);return Number.isFinite(result)&&Math.abs(result)<1e11?Math.round((result+Number.EPSILON)*100):null;
  }
  const validPeriod=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=2000&&Number(value.slice(0,4))<=2199;
  function validDate(value,period){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,7)!==period)return false;
    const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
  }
  function color(cell){
    const fill=cell?.s?.fgColor||cell?.s?.fill?.fgColor;
    const indexed={10:'FF0000',13:'FFFF00',2:'FF0000',5:'FFFF00'};
    return String(fill?.rgb||indexed[fill?.indexed]||'').slice(-6).toUpperCase();
  }
  const yellow=cell=>{const v=color(cell);return /^[A-F0-9]{6}$/.test(v)&&parseInt(v.slice(0,2),16)>=220&&parseInt(v.slice(2,4),16)>=200&&parseInt(v.slice(4,6),16)<=100;};
  const red=cell=>{const v=color(cell);return /^[A-F0-9]{6}$/.test(v)&&parseInt(v.slice(0,2),16)>=180&&parseInt(v.slice(2,4),16)<150&&parseInt(v.slice(4,6),16)<150;};
  function channel(value){const n=normalize(value);return n.includes('earsiv')?'earchive':n==='efatura'?'einvoice':/ss\s*no\s*:/i.test(String(value))?'pending':'unknown';}
  function monthEnd(branch,customer=''){
    const b=normalize(branch),c=normalize(customer);
    return b.includes('biruni')||c.includes('biruni')||b==='sentez'||c.startsWith('sentezsaglik');
  }
  function periodFromHeader(header){
    const names=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
    const text=String(header??'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
    const years=[...new Set(text.match(/(?:20|21)\d{2}/g)||[])];
    const months=names.map((name,index)=>({name,index})).filter(({name})=>new RegExp('(^|[^a-z])'+name+'(?=[^a-z]|$)').test(text));
    if(years.length===1&&months.length===1)return years[0]+'-'+String(months[0].index+1).padStart(2,'0');
    if(months.length||years.length!==1)return null;
    const numeric=text.match(/(?:^|[^0-9])((?:20|21)\d{2})[-/. ](0?[1-9]|1[0-2])(?:$|[^0-9])/);
    return numeric?numeric[1]+'-'+numeric[2].padStart(2,'0'):null;
  }
  function previousPeriod(period){const [y,m]=period.split('-').map(Number);return new Date(Date.UTC(y,m-2,15)).toISOString().slice(0,7);}
  function resolveColumn(sheet,period,XLSX){
    if(!validPeriod(period))throw Error('Önce fatura tarihini seç.');
    if(!sheet?.['!ref'])throw Error('Seçili sayfada veri bulunamadı.');
    const range=XLSX.utils.decode_range(sheet['!ref']);
    if(range.e.c>1000||range.e.r>20000)throw Error('Fatura listesi çok büyük.');
    const candidates=[];
    for(let c=0;c<=range.e.c;c++){
      const headers=[];for(let r=0;r<=Math.min(7,range.e.r);r++){const v=sheet[XLSX.utils.encode_cell({r,c})]?.v;if(typeof v==='string'&&periodFromHeader(v))headers.push(v);}
      const periods=[...new Set(headers.map(periodFromHeader))];if(periods.length!==1||periods[0]!==period)continue;
      const header=headers.join(' · '),n=normalize(header),words=header.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');if(n.includes('lisdiger')||n.includes('lisvediger')||/(^|[^a-z])lis(?=[^a-z]|$)/.test(words))continue;
      candidates.push({column:c,header,primary:n.includes('bakim')&&n.includes('kira')});
    }
    const primary=candidates.filter(c=>c.primary),matches=primary.length?primary:candidates;
    if(matches.length!==1)throw Error(period+' için '+(matches.length?'birden fazla matrah sütunu var; başlıkları ayır.':'Bakım-Kira / matrah sütunu bulunamadı. Başka ay kullanılmadı.'));
    return matches[0];
  }
  function readAmount(cell,XLSX){
    const format=String(cell?.z||''),currency=/USD|\$/.test(format)?'USD':/EUR|€/.test(format)?'EUR':/GBP|£/.test(format)?'GBP':'TRY';
    if(!cell||cell.v===undefined||cell.v==='')return {amountCents:null,currency,displayRounded:false};
    let amountCents=cents(cell.v),displayRounded=false;
    if(amountCents===null&&typeof cell.v==='number'&&/\.0{2}(?!0)/.test(cell.z||'')&&XLSX.SSF){amountCents=cents(XLSX.SSF.format('0.00',cell.v));displayRounded=amountCents!==null;}
    return {amountCents,currency,displayRounded};
  }
  function amountChanged(row){return Number.isSafeInteger(row.previousAmountCents)&&(row.amountCents!==row.previousAmountCents||row.currency!==row.previousCurrency);}
  function amountState(row){if(!Number.isSafeInteger(row.amountCents)||row.amountCents<=0)return 'missing';if(amountChanged(row))return row.changeConfirmed?'checked':'changed';return Number.isSafeInteger(row.previousAmountCents)?'matched':row.amountConfirmed?'checked':'pending';}
  const rowIdentity=row=>[normalize(row.branch),normalize(row.excelCustomer||row.customer),clean(row.excelSsno??row.ssno)].join('|');
  const deletionKey=row=>rowIdentity(row)+'|row:'+row.sourceRow;
  function mergeRows(next,previous){
    const old=new Map(),counts=new Map();
    for(const row of previous){const k=rowIdentity(row);old.set(k,old.has(k)?null:row);}
    for(const row of next){const k=rowIdentity(row);counts.set(k,(counts.get(k)||0)+1);}
    return next.map(row=>{const k=rowIdentity(row),before=old.get(k);if(!before||counts.get(k)!==1)return row;
      const keep={};for(const field of ['searchAlias','vkn','address','description','notes','taxType','withholdingCode','withholdingRate','withholdingReason','referencePdf','removed'])keep[field]=before[field];
      return {...row,...keep,amountConfirmed:false,referenceReviewed:false,changeConfirmed:false};
    });
  }
  function issues(row,project,refs=new Set()){
    const list=[];
    if(!row.branch||!row.customer)list.push('Şube ve cari unvanını tamamla.');
    if(!Number.isSafeInteger(row.amountCents)||row.amountCents<=0)list.push('Pozitif bir dönem matrahı gir.');
    if(!row.amountConfirmed)list.push('Matrahı bu çalışma dönemi için onayla.');
    if(row.sourcePeriod!==project.period)list.push('Bu ayın Excel matrahı yeniden okunmalı.');
    if(amountChanged(row)&&!row.changeConfirmed)list.push('Önceki aya göre tutar farkını düzelt veya doğrula.');
    if(!validDate(project.invoiceDate,project.period))list.push('Bu döneme ait bir fatura tarihi seç.');
    if(row.channel!=='einvoice')list.push('E-Fatura mükellefiyetini doğrula.');
    if(!/^\d{10,11}$/.test(row.vkn||''))list.push('Vergi numarasını referanstan tamamla.');
    if(!row.address)list.push('Şube adresini tamamla.');
    if(!row.description)list.push('Hizmet açıklamalarını tamamla.');
    if(!row.referencePdf||!refs.has(row.referencePdf))list.push('Referans belgeyi ekle ve bu satıra bağla.');
    if(!row.referenceReviewed)list.push('Açıklama, SS NO ve özel notları karşılaştır.');
    if(row.ssnoRequired&&!row.ssno)list.push('SS NO eksik.');
    if(row.taxType==='withholding'&&row.withholdingReason&&/^\d{3}\b/.test(row.withholdingReason)&&row.withholdingReason.match(/^\d{3}/)[0]!==row.withholdingCode)list.push('Tevkifat kodu ile kaynak belgedeki sebep açıklaması uyuşmuyor.');if(row.taxType==='withholding'&&(!row.withholdingCode||!row.withholdingRate||!row.withholdingReason))list.push('Tevkifat kodu ve oranını tamamla.');
    // Even a complete local review cannot establish external customer/alias identity.
    list.push('İzibiz cari ve posta kutusu doğrulaması bekleniyor.');
    return list;
  }
  function importSheet(sheet,options,XLSX){
    if(!sheet?.['!ref'])throw Error('Seçili sayfada veri bulunamadı.');
    const binding=resolveColumn(sheet,options.period,XLSX);
    if(options.amount!==undefined&&options.amount!==binding.column)throw Error('Matrah sütunu fatura tarihine göre otomatik seçilir.');
    options={...options,amount:binding.column};
    let prior=null;try{prior=resolveColumn(sheet,previousPeriod(options.period),XLSX);}catch{}
    const range=XLSX.utils.decode_range(sheet['!ref']);
    if(range.e.r>20000||range.e.c>1000)throw Error('Bu sayfa çok büyük. Yalnızca fatura listesini içeren bir dosya seç.');
    const value=(r,c)=>{
      const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.v!==undefined)return cell.v;
      const merged=(sheet['!merges']||[]).find(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c);
      return merged?sheet[XLSX.utils.encode_cell(merged.s)]?.v??'':'';
    };
    const rows=[],counts={earchive:0,zero:0,monthEnd:0,unknown:0,blank:0};
    for(let r=range.s.r;r<=range.e.r;r++){
      const cell=sheet[XLSX.utils.encode_cell({r,c:options.amount})];
      const branch=clean(value(r,options.branch??options.customer),300),customer=clean(value(r,options.customer),600),rawChannel=options.channel===undefined?'E-Fatura':clean(value(r,options.channel),300),kind=channel(rawChannel);
      // Headings and totals have no invoice channel; never treat them as customers.
      if(kind==='unknown'){counts.unknown++;continue;}
      if(monthEnd(branch,customer)){counts.monthEnd++;continue;}
      if(kind==='earchive'){counts.earchive++;continue;}
      const previous=prior?readAmount(sheet[XLSX.utils.encode_cell({r,c:prior.column})],XLSX):{amountCents:null,currency:'TRY'};
      if((cell?.v===undefined||cell.v==='')&&!cell?.f){if(!(previous.amountCents>0))continue;counts.blank++;}
      const current=readAmount(cell,XLSX),{amountCents,currency,displayRounded}=current;
      if(amountCents===0){counts.zero++;continue;}
      rows.push({id:'row-'+(r+1),sourceRow:r+1,sourceCell:XLSX.utils.encode_cell({r,c:options.amount}),branch,customer,channel:kind,amountCents,sourceAmountCents:amountCents,currency,displayRounded,sourcePeriod:options.period,previousPeriod:previousPeriod(options.period),previousAmountCents:previous.amountCents,previousCurrency:previous.currency,changeConfirmed:false,removed:false,schedule:'beginning',ssno:rawChannel.match(/SS\s*NO\s*:\s*([0-9]+)/i)?.[1]||'',ssnoRequired:kind==='pending',searchAlias:'',vkn:'',address:'',description:'',notes:'',taxType:'sale',withholdingCode:'',withholdingRate:'',referencePdf:'',amountConfirmed:false,referenceReviewed:false});
    }
    if(rows.length>1000)throw Error('En fazla 1.000 hazırlık satırı alınabilir.');
    return {rows,counts,binding};
  }
  function readBackup(input){
    if(!input||input.version!==1||input.company!=='PUSULA'||!validPeriod(input.period)||!Array.isArray(input.rows)||input.rows.length>1000)throw Error('Bu dosya geçerli bir Pusula hazırlık yedeği değil.');
    const ids=new Set();
    const rows=input.rows.map((value,i)=>{
      if(!value||typeof value!=='object'||!Number.isSafeInteger(value.sourceRow)||value.sourceRow<1)throw Error('Yedekte geçersiz satır bulundu.');
      const id='row-'+value.sourceRow;if(ids.has(id))throw Error('Yedekte yinelenen Excel satırı var.');ids.add(id);
      const row={id,sourceRow:value.sourceRow,sourceCell:clean(value.sourceCell,30),amountCents:Number.isSafeInteger(value.amountCents)?value.amountCents:null,sourceAmountCents:Number.isSafeInteger(value.sourceAmountCents)?value.sourceAmountCents:null,currency:['TRY','USD','EUR','GBP'].includes(value.currency)?value.currency:'TRY',displayRounded:value.displayRounded===true,channel:['einvoice','pending'].includes(value.channel)?value.channel:'pending',schedule:'beginning',taxType:['withholding','basic'].includes(value.taxType)?value.taxType:'sale'};
      for(const key of ['branch','customer','searchAlias','vkn','address','description','notes','withholdingCode','withholdingRate','withholdingReason','withholdingReason','referencePdf','ssno','excelCustomer','excelSsno','taxOffice','scenario','referenceInvoice','referenceDate','referenceTitle','referenceVkn','referenceAddress','referenceSsno','referenceDescription','referenceWrittenAmount','sellerText','sourceKind','monthSourcePeriod','monthTargetPeriod'])row[key]=clean(value[key],['description','notes','referenceDescription','withholdingReason'].includes(key)?25*1024*1024:4000);
      for(const key of ['ssnoRequired','amountConfirmed','referenceReviewed','changeConfirmed','removed','manualEdited','referenceManuallySelected','autoMatched','matchVerified'])row[key]=value[key]===true;
      row.sourcePeriod=validPeriod(value.sourcePeriod)?value.sourcePeriod:'';row.previousPeriod=validPeriod(value.previousPeriod)?value.previousPeriod:'';row.previousAmountCents=Number.isSafeInteger(value.previousAmountCents)?value.previousAmountCents:null;row.excelPreviousAmountCents=Number.isSafeInteger(value.excelPreviousAmountCents)?value.excelPreviousAmountCents:null;row.previousCurrency=['TRY','USD','EUR','GBP'].includes(value.previousCurrency)?value.previousCurrency:'TRY';
      row.matchVerified=row.matchVerified||value.referenceReviewed===true||value.referenceManuallySelected===true;
      row.legacyReviewed=value.referenceReviewed===true&&!Array.isArray(value.lineItems);
      row.referenceWarnings=Array.isArray(value.referenceWarnings)?value.referenceWarnings.map(x=>clean(x,2000)):[];
      row.bankLines=Array.isArray(value.bankLines)?value.bankLines.slice(0,40).map(l=>clean(l,1500)):[];
      row.lineItems=Array.isArray(value.lineItems)?value.lineItems.slice(0,1000).map(l=>({description:clean(l.description,25*1024*1024),quantity:Number.isFinite(l.quantity)&&l.quantity>0&&l.quantity<1e6?l.quantity:1,unit:clean(l.unit,100),unitPrice:Number.isFinite(l.unitPrice)&&l.unitPrice>=0&&l.unitPrice<1e11?l.unitPrice:null,vatRate:Number.isFinite(l.vatRate)&&l.vatRate>=0&&l.vatRate<=100?l.vatRate:null,amountCents:Number.isSafeInteger(l.amountCents)&&l.amountCents>=0?l.amountCents:null})):[];
      row.noteLines=Array.isArray(value.noteLines)?value.noteLines.slice(0,1000).map(l=>({text:clean(l.text,25*1024*1024),source:clean(l.source,60),removed:l.removed===true})):[];
      if(!row.sourcePeriod)row.amountConfirmed=false;
      return row;
    }).sort((a,b)=>a.sourceRow-b.sourceRow);
    const source=input.source&&typeof input.source==='object'?{name:clean(input.source.name,300),sheet:clean(input.source.sheet,100),column:clean(input.source.column,10),header:clean(input.source.header,300),period:validPeriod(input.source.period)?input.source.period:''}:null;
    return {version:1,company:'PUSULA',period:input.period,invoiceDate:validDate(input.invoiceDate,input.period)?input.invoiceDate:'',rows:rows.filter(r=>!monthEnd(r.branch,r.customer)),source,removedKeys:Array.isArray(input.removedKeys)?[...new Set(input.removedKeys.filter(x=>typeof x==='string'&&x.length<2000))].slice(0,1000):[]};
  }
  const words=value=>String(value??'').toLocaleUpperCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/İ/g,'I');
  const rowText=row=>row.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
  function pdfRows(items){
    const rows=[];for(const it of items){if(!it.str?.trim())continue;const y=it.transform[5],x=it.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<2);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,text:it.str,w:it.width||0,h:Math.hypot(it.transform[2]||0,it.transform[3]||0)||8});}
    return rows.sort((a,b)=>b.y-a.y).map(r=>({...r,items:r.items.sort((a,b)=>a.x-b.x)}));
  }
  function decimal(value){let s=clean(value).replace(/[^\d.,-]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return s&&Number.isFinite(n)?n:null;}
  function moneyIn(text){const m=String(text).match(/-?\d[\d.]*,\d{2}(?!\d)|-?\d+\.\d{2}(?!\d)/g);return m?.length?cents(m[m.length-1]):null;}
  function pdfDate(text){const m=text.match(/Fatura\s*Tarihi\s*:?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/i);if(!m)return '';const v=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return validDate(v,v.slice(0,7))?v:'';}
  function parseReference(pages,name){
    const all=pages.flat(),flat=all.map(rowText).join('\n'),first=pages[0]||[],sayin=first.find(r=>r.items.some(i=>normalize(i.text)==='sayin'));
    const ref={name,layout:pages,sellerText:'',bankLines:[],title:'',vkn:'',taxOffice:'',address:'',invoiceDate:pdfDate(flat),invoiceNo:(flat.match(/Fatura\s*No\s*:?\s*([A-Z0-9-]{8,})/i)||[])[1]||'',ssno:'',ssnos:[],taxType:'sale',scenario:'TICARIFATURA',withholdingCode:'',withholdingRate:'',withholdingReason:'',amountCents:null,currency:/\b(?:EUR|€)\b/.test(flat)?'EUR':/\bUSD\b/.test(flat)?'USD':'TRY',lineItems:[],noteLines:[],writtenAmountSource:'',rawText:flat.slice(0,100000),warnings:[]};
    if(sayin){
      const left=sayin.items.find(i=>normalize(i.text)==='sayin').x,meta=first.flatMap(r=>r.items).filter(i=>i.x>left+180&&/OZELLESTIRME|SENARYO|FATURA TIPI/.test(words(i.text))),right=meta.length?Math.min(...meta.map(i=>i.x))-12:left+280;
      const block=first.filter(r=>r.y<sayin.y-2&&r.y>sayin.y-210).map(r=>({...r,items:r.items.filter(i=>i.x>=left-4&&i.x<right)})).filter(r=>r.items.length);
      const end=block.findIndex(r=>/\b(?:VKN|TCKN)\s*:?\s*\d{10,11}\b/i.test(rowText(r)));
      const recipient=end>=0?block.slice(0,end+1):[];
      const titles=[],address=[];let addressStarted=false;
      for(const r of recipient){const text=rowText(r),n=words(text),v=text.match(/\b(?:VKN|TCKN)\s*:?\s*(\d{10,11})\b/i);if(v){ref.vkn=v[1];continue;}
        if(/VERGI\s*DAIRESI/.test(n)){ref.taxOffice=text.replace(/^.*?Vergi\s*Dairesi\s*:?\s*/i,'');continue;}
        if(/E-?POSTA|\bTEL\s*:|\bFAX\s*:|WEB\s*SITESI/.test(n))continue;
        if(titles.length&&/(?:\bMAH(?:ALLE(?:SI)?)?\b|\bMAH\.|\bCAD(?:DE(?:SI)?)?\b|\bCAD\.|\bSOK(?:AK|AGI)?\b|\bSOK\.|\bNO\s*[:.]|\bPK\s*[:.]|\bBULVAR|\bCADDES|\bSOKAK|\bAPARTMAN|\bADRES\s*:)/.test(n))addressStarted=true;
        if(addressStarted)address.push(text);else titles.push(text);
      }
      ref.title=titles.join(' ');ref.address=address.join('\n');ref.sellerText=first.filter(r=>r.y>sayin.y+2).map(r=>rowText({...r,items:r.items.filter(i=>i.x<right)})).filter(t=>t&&normalize(t)!=='efatura').join('\n');
    }
    const nflat=words(flat);if(/SENARYO\s*:?\s*TEMEL/.test(nflat)){ref.scenario='TEMELFATURA';ref.taxType='basic';}if(/FATURA\s*TIPI\s*:?\s*TEVKIFAT/.test(nflat))ref.taxType='withholding';
    ref.ssnos=[...new Set([...flat.matchAll(/\bSS\s*NO[\s:#.-]*([A-Z0-9][A-Z0-9/-]*)/gi)].map(m=>m[1]))];ref.ssno=ref.ssnos.length===1?ref.ssnos[0]:'';
    const totalRows=all.filter(r=>/malhizmettoplam|toplamtutarmatrah|vergihari[cç]toplam|matrah/i.test(normalize(rowText(r))));
    for(const r of totalRows){const amount=moneyIn(rowText(r));if(amount!==null){ref.amountCents=amount;break;}}
    for(const r of all){const t=rowText(r);if(/TEVKIFAT/.test(words(t))){ref.withholdingRate||=(t.match(/\b([1-9]\s*\/\s*10)\b/)||[])[1]?.replace(/\s/g,'')||'';ref.withholdingCode||=(t.match(/\b(6\d{2})\b/)||[])[1]||'';const pct=t.match(/TEVK[Iİ]FAT\s*\(\s*%\s*(\d{1,2})/i);if(!ref.withholdingRate&&pct&&Number(pct[1])%10===0)ref.withholdingRate=Number(pct[1])/10+'/10';}}
    const reasonIndex=all.findIndex(r=>normalize(rowText(r)).startsWith('tevkifatsebebi'));if(reasonIndex>=0){const parts=[];for(const r of all.slice(reasonIndex)){const t=rowText(r);if(parts.length&&/^(YALNIZ|NOT|BANKA)/.test(words(t)))break;parts.push(t);if(parts.length>=8)break;}ref.withholdingReason=parts.join(' ').replace(/^Tevkifat\s*Sebebi\s*:\s*/i,'');}
    for(const pageRows of pages){
      const hi=pageRows.findIndex(r=>{const n=normalize(rowText(r));return n.includes('miktar')&&n.includes('birimfiyat');});if(hi<0)continue;const header=pageRows[hi];
      const quantity=header.items.find(i=>normalize(i.text).includes('miktar'))?.x,price=header.items.find(i=>normalize(i.text).includes('birimfiyat'))?.x,vat=header.items.find(i=>normalize(i.text).includes('kdvoran'))?.x,vatAmount=header.items.find(i=>normalize(i.text).includes('kdvtutar'))?.x,total=header.items.find(i=>/malhizmettutar/.test(normalize(i.text)))?.x;
      if(quantity===undefined||price===undefined)continue;
      const end=pageRows.slice(hi+1).find(r=>/malhizmettoplam|toplamtutarmatrah|vergilerda|odenecektutar/.test(normalize(rowText(r))))?.y??-Infinity;
      const body=pageRows.slice(hi+1).filter(r=>r.y>end+3),markers=body.flatMap(r=>r.items.filter(i=>i.x<55&&/^\d{1,3}$/.test(i.text.trim())).map(i=>({y:r.y,index:Number(i.text)})));
      for(let k=0;k<markers.length;k++){
        const marker=markers[k],top=k?(markers[k-1].y+marker.y)/2:header.y,bottom=k+1<markers.length?(marker.y+markers[k+1].y)/2:end+3,band=body.filter(r=>r.y<top&&r.y>bottom),items=band.flatMap(r=>r.items),between=(a,b)=>items.filter(i=>i.x>=a&&i.x<b).map(i=>i.text).join(' ');
        const description=band.map(r=>r.items.filter(i=>i.x>=55&&i.x<quantity-3).map(i=>i.text).join(' ')).filter(Boolean).join('\n');
        const q=between(quantity-3,price-3),quantityValue=decimal((q.match(/[\d.,]+/)||[])[0]),unit=q.replace(/[\d.,]/g,'').trim()||'Adet',unitPrice=decimal(between(price-3,(vat??vatAmount??total??price+70)-3));
        const vatValue=vat===undefined?null:decimal(between(vat-3,(vatAmount??total??vat+65)-3)),lineAmount=total===undefined?null:moneyIn(between(total-3,Infinity));
        if(description)ref.lineItems.push({description,quantity:quantityValue||1,unit,unitPrice:unitPrice??null,vatRate:vatValue,amountCents:lineAmount??(unitPrice!==null&&quantityValue!==null?Math.round(unitPrice*quantityValue*100):null)});
      }
    }
    if(ref.amountCents===null&&ref.lineItems.length&&ref.lineItems.every(l=>Number.isSafeInteger(l.amountCents)))ref.amountCents=ref.lineItems.reduce((sum,l)=>sum+l.amountCents,0);
    for(const rows of pages){let inNotes=false;for(const r of rows){let text=rowText(r),n=words(text);if(/BANKA BILGI|BANKA HESAP|HESAP BILGI|BANKA ADI/.test(n)){inNotes=false;ref.bankLines=rows.filter(l=>l.y<=r.y).map(rowText);continue;}
      if(/^YALNIZ\s*[:.#-]?/.test(n)){inNotes=true;let content=text.replace(/^Yaln[ıi]z\s*[:.#-]?\s*/i,'');const normalized=words(content),endWritten=normalized.match(/KURUS|KR[SŞ]/),endCurrency=normalized.match(/TURK\s*LIRASI|TL|TRY|AVRO|DOLAR/);const marker=endWritten||endCurrency,end=marker?marker.index+marker[0].length:0,amountPrefix=normalized.slice(0,end),residue=amountPrefix.replace(/TURK\s*LIRASI|AMERIKAN|INGILIZ|DOLAR|AVRO|STERLIN|KURUS|KRS|SENT|CENT|TRY|USD|EUR|GBP|TL|SADECE|SIFIR|MILYAR|MILYON|SEKSEN|DOKSAN|YETMIS|ALTMIS|KIRK|ELL[Iİ]|YIRMI|OTUZ|DOKUZ|SEKIZ|YEDI|ALTI|BES|DORT|UC|IKI|BIR|YUZ|BIN|ON|[\d\s#·:;.,-]/g,'');if(marker&&!residue){ref.writtenAmountSource=content.slice(0,end);const extra=content.slice(end).replace(/^[\s#·:;.,-]+/,'').trim();if(extra)ref.noteLines.push({text:extra,source:'YALNIZ',removed:false});}else if(content)ref.noteLines.push({text:content,source:'YALNIZ',removed:false});continue;}
      if(inNotes&&text&&!/^\d+\s*\/\s*\d+$/.test(text)&&!/^IBAN|^TR\d{2}/i.test(text))ref.noteLines.push({text:text.replace(/^Not\s*:\s*/i,''),source:/^Not\s*:/i.test(text)?'Not':'Alt not',removed:false});
    }}
    ref.noteLines=ref.noteLines.filter((l,i,a)=>a.findIndex(x=>x.text===l.text)===i);
    if(!ref.title||!ref.vkn||!ref.address)ref.warnings.push('Alıcı unvanı, vergi no veya adres kaynak belgede tam okunamadı.');if(!ref.lineItems.length)ref.warnings.push('PDF’nin hizmet satırları okunamadı.');if(!ref.invoiceDate)ref.warnings.push('PDF’nin tarihi okunamadı.');if(ref.amountCents===null)ref.warnings.push('fatura matrahı okunamadı.');
    return ref;
  }
  function displayDate(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:'';}
  function inputDate(value){let v=clean(value,20);if(/^\d{8}$/.test(v))v=v.slice(0,2)+'-'+v.slice(2,4)+'-'+v.slice(4);const m=v.match(/^(\d{2})[-./](\d{2})[-./](\d{4})$/);if(m)v=m[3]+'-'+m[2]+'-'+m[1];return validDate(v,v.slice(0,7))?v:'';}
  const previewInvoiceNo=(row,project)=>'XXX'+project.invoiceDate.slice(0,4)+String(row.sourceRow||1).padStart(9,'0');
  function titleKey(value){
    return normalize(words(String(value||'').replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g,'$1 $2').replace(/\([^)]*\)/g,' ')).replace(/[-–]\s*(?:ELIS|LIS|HBYS|PACS)\b.*$/,'').replace(/[^A-Z0-9 ]/g,' ').replace(/^\s*T\s+C\s+/,'').replace(/\bANONIM\s+SIRKETI\b/g,'AS').replace(/\bA\s+S\b/g,'AS').replace(/\bLTD\s+STI\b/g,'LIMITED SIRKETI').replace(/\bLTD\b/g,'LIMITED').replace(/\bSTI\b/g,'SIRKETI').replace(/\bHIZM?\b/g,'HIZMETLERI').replace(/\bHIZMET\b/g,'HIZMETLERI').replace(/\bSAN\b/g,'SANAYI').replace(/\bTIC\b/g,'TICARET').replace(/\bINS\b/g,'INSAAT').replace(/\bEGT\b/g,'EGITIM').replace(/\bTURZ\b/g,'TURIZM').replace(/\bFAK\b/g,'FAKULTESI').replace(/\bUNIV?\b/g,'UNIVERSITESI').replace(/\bARAS\b/g,'ARASTIRMA').replace(/\bHAST\b/g,'HASTANESI').replace(/\bVE\b/g,''));
  }
  function titleScore(a,b){const x=titleKey(a),y=titleKey(b);if(!x||!y)return 0;if(x===y)return 1;if(Math.min(x.length,y.length)>=24&&(x.includes(y)||y.includes(x)))return .9*Math.min(x.length,y.length)/Math.max(x.length,y.length)+.08;const pairs=s=>{const p=new Set();for(let i=0;i<s.length-1;i++)p.add(s.slice(i,i+2));return p;},p=pairs(x),q=pairs(y);return 2*[...p].filter(v=>q.has(v)).length/(p.size+q.size);}
  function matchReference(row,references,period){
    const baselineDate=previousPeriod(period)+'-01';
    let candidates=references.filter(r=>r.invoiceDate?.slice(0,7)===previousPeriod(period)&&r.title).map(ref=>({ref,score:titleScore(ref.title,row.excelCustomer||row.customer)})).filter(c=>c.score>=.78).sort((a,b)=>b.score-a.score);
    const serviceHint=words(row.excelCustomer||row.customer).match(/[-–]\s*(ELIS|LIS|HBYS|PACS)\b/);if(serviceHint){const hint=serviceHint[1]==='ELIS'?'LIS':serviceHint[1],pattern=hint==='LIS'?/\b(?:ELIS|LIS)\b/:new RegExp('\\b'+hint+'\\b');candidates=candidates.filter(c=>pattern.test(words(c.ref.lineItems.map(l=>l.description).join(' '))));}
    if(row.ssno){const exact=candidates.filter(c=>c.ref.ssnos?.includes(row.ssno));candidates=exact.length?exact:candidates.filter(c=>!c.ref.ssnos?.length);}
    const trusted=row.matchVerified||row.referenceReviewed||row.referenceManuallySelected;
    if(trusted&&(row.referenceVkn||row.vkn))candidates=candidates.filter(c=>c.ref.vkn===(row.referenceVkn||row.vkn));
    if(trusted&&(row.referenceAddress||row.address)){const same=candidates.filter(c=>normalize(c.ref.address)===normalize(row.referenceAddress||row.address));if(same.length)candidates=same;}
    candidates=candidates.filter(c=>c.ref.sourceKind==='xml'||!candidates.some(x=>x.ref.sourceKind==='xml'&&x.ref.invoiceNo&&x.ref.invoiceNo===c.ref.invoiceNo));
    const firstDay=candidates.filter(c=>c.ref.invoiceDate===baselineDate),hasFirstDay=firstDay.length>0||candidates.some(c=>c.ref.sourceKind==='xml');
    if(firstDay.length)candidates=firstDay;else if(hasFirstDay)candidates=candidates.filter(c=>c.ref.sourceKind==='xml');
    const exactTitle=candidates.filter(c=>c.score===1);if(exactTitle.length)candidates=exactTitle;
    let selected=null,reason=!candidates.length?'no_title':!hasFirstDay?'no_baseline':'ambiguous';
    if(hasFirstDay){
      const best=candidates[0],second=candidates[1];
      if(row.ssno&&candidates.length===1&&best.ref.ssnos?.includes(row.ssno))selected=best.ref;
      if(!selected&&best&&best.score>=.94&&(!second||best.score-second.score>=.075))selected=best.ref;
      const sameIdentity=best&&candidates.every(c=>c.ref.vkn===best.ref.vkn&&normalize(c.ref.address)===normalize(best.ref.address)&&c.ref.ssno===best.ref.ssno);
      if(!selected&&sameIdentity){const equalAmount=candidates.filter(c=>c.ref.amountCents===row.amountCents&&c.ref.currency===row.currency);if(equalAmount.length===1)selected=equalAmount[0].ref;}
      if(!selected&&best?.score===1){const current=candidates.filter(c=>c.ref.amountCents===row.amountCents),prior=Number.isSafeInteger(row.excelPreviousAmountCents)?candidates.filter(c=>c.ref.amountCents===row.excelPreviousAmountCents):[];if(current.length===1&&(!prior.length||prior.some(c=>c.ref.name===current[0].ref.name)))selected=current[0].ref;else if(prior.length===1&&(!current.length||current.some(c=>c.ref.name===prior[0].ref.name)))selected=prior[0].ref;}
      if(!selected&&best&&candidates.length>1&&sameIdentity&&candidates.every(c=>c.ref.amountCents===best.ref.amountCents&&c.ref.taxType===best.ref.taxType&&c.ref.scenario===best.ref.scenario&&c.ref.withholdingCode===best.ref.withholdingCode&&c.ref.withholdingRate===best.ref.withholdingRate&&JSON.stringify(c.ref.lineItems)===JSON.stringify(best.ref.lineItems)&&JSON.stringify(c.ref.noteLines)===JSON.stringify(best.ref.noteLines)))selected=best.ref;
      if(!selected&&trusted&&candidates.length===1&&candidates[0].score>=.84)selected=candidates[0].ref;
      if(!selected&&candidates.length===1&&best.score>=.90){selected=best.ref;reason='title_variant';}
    }
    return {selected,candidates:candidates.slice(0,500),reason:selected?(reason==='title_variant'?'title_variant':'matched'):reason,baselineDate};
  }
  const monthNames=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  function shiftMonth(text,sourcePeriod,targetPeriod){
    if(!validPeriod(sourcePeriod)||!validPeriod(targetPeriod)||sourcePeriod===targetPeriod)return String(text??'');
    const before=monthNames[Number(sourcePeriod.slice(5))-1],after=monthNames[Number(targetPeriod.slice(5))-1];
    const spelling=[...before].map(ch=>({'i':'[iİIı]','ı':'[iİIı]','ş':'[şŞsS]','ğ':'[ğĞgG]','ü':'[üÜuU]','ö':'[öÖoO]','ç':'[çÇcC]'}[ch.toLocaleLowerCase('tr-TR')]||ch)).join('');
    const pattern=new RegExp('(^|[^\\p{L}])(?:('+sourcePeriod.slice(0,4)+')([\\s_./-]*))?('+spelling+')(?![\\p{L}])(?:([\\s_./-]*)('+sourcePeriod.slice(0,4)+'))?','giu');
    const protectedIds=[];const content=String(text??'').replace(/\bSS\s*NO[\s:#.-]*[A-Z0-9][A-Z0-9/-]*#?/gi,value=>{protectedIds.push(value);return '\uE000'+(protectedIds.length-1)+'\uE001';});
    return content.replace(pattern,(_,prefix,yearBefore,separatorBefore,word,separator,year)=>{const changed=word===word.toLocaleUpperCase('tr-TR')?after.toLocaleUpperCase('tr-TR'):word===word.toLocaleLowerCase('tr-TR')?after.toLocaleLowerCase('tr-TR'):after;return prefix+(yearBefore?targetPeriod.slice(0,4)+separatorBefore:'')+changed+(year?(separator+targetPeriod.slice(0,4)):'');}).replace(/\uE000(\d+)\uE001/g,(_,index)=>protectedIds[Number(index)]);
  }
  function decodeXmlBytes(bytes){
    const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),header=new TextDecoder('latin1').decode(b.slice(0,256));
    const bom=b[0]===255&&b[1]===254?'utf-16le':b[0]===254&&b[1]===255?'utf-16be':b[0]===60&&b[1]===0?'utf-16le':b[0]===0&&b[1]===60?'utf-16be':'';
    const encoding=bom||(header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)||[])[1]||'utf-8';
    try{return new TextDecoder(encoding,{fatal:true}).decode(b);}catch{throw Error('XML karakter kodlaması okunamadı: '+encoding);}
  }
  function parseXmlReference(xml,name,Parser=globalThis.DOMParser){
    if(!Parser||typeof xml!=='string'||xml.length>25*1024*1024)throw Error('XML okunamadı veya dosya boyutu aşıldı.');
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD / ENTITY içeren XML desteklenmiyor.');
    let invalid=false,doc;try{doc=new Parser({onError:()=>{invalid=true;}}).parseFromString(xml,'application/xml');}catch{throw Error('XML biçimi geçersiz.');}
    if(invalid||!doc?.documentElement||doc.getElementsByTagName('parsererror').length)throw Error('XML biçimi geçersiz.');
    const kids=(node,tag)=>Array.from(node?.childNodes||[]).filter(n=>n.nodeType===1&&(!tag||(n.localName||n.nodeName.split(':').pop())===tag));
    const path=(node,...tags)=>tags.reduce((n,tag)=>kids(n,tag)[0],node),value=(node,...tags)=>path(node,...tags)?.textContent?.trim()||'';
    const all=(node,tag)=>{const out=[];for(const n of kids(node)){if((n.localName||n.nodeName.split(':').pop())===tag)out.push(n);out.push(...all(n,tag));}return out;};
    const invoices=(doc.documentElement.localName==='Invoice'?[doc.documentElement]:all(doc.documentElement,'Invoice'));
    if(invoices.length!==1)throw Error('Her XML tam bir UBL Invoice faturası içermeli; zarfı açıp faturaları ayrı XML olarak ekle.');
    const root=invoices[0],buyer=path(root,'AccountingCustomerParty','Party'),seller=path(root,'AccountingSupplierParty','Party');
    const partyTitle=p=>value(p,'PartyName','Name')||value(p,'PartyLegalEntity','RegistrationName')||[value(p,'Person','FirstName'),value(p,'Person','FamilyName')].filter(Boolean).join(' ');
    const partyId=p=>kids(p,'PartyIdentification').map(n=>path(n,'ID')).find(n=>/^(VKN|TCKN)$/i.test(n?.getAttribute('schemeID')||''))?.textContent?.trim()||'';
    const address=p=>{const a=path(p,'PostalAddress');return kids(a).filter(n=>!['ID','AddressTypeCode'].includes(n.localName)).map(n=>kids(n).length?kids(n).map(c=>c.textContent.trim()).filter(Boolean).join(' · '):n.textContent.trim()).filter(Boolean).join('\n');};
    const number=v=>v!==''&&/^-?\d+(?:\.\d+)?$/.test(v)?Number(v):null,amount=(node,...tags)=>{const n=number(value(node,...tags));return n===null||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>.00001?null:Math.round(n*100);};
    const fields=[];let nodes=0;
    function walk(node,prefix='',depth=0){if(depth>80||++nodes>100000)throw Error('XML yapısı çok büyük veya çok derin.');const tag=node.localName||node.nodeName.split(':').pop(),label=prefix+'/'+tag;
      for(const a of Array.from(node.attributes||[]))if(!a.name.startsWith('xmlns'))fields.push({path:label+'/@'+a.name,value:a.value});
      if(tag==='EmbeddedDocumentBinaryObject'){fields.push({path:label,value:'Gömülü ek · '+(node.getAttribute('filename')||node.getAttribute('mimeCode')||'dosya')+' · '+node.textContent.trim().length+' base64 karakter'});return;}
      const children=kids(node);if(!children.length){if(node.textContent.trim())fields.push({path:label,value:node.textContent.trim()});}else for(const child of children)walk(child,label,depth+1);
    }walk(root);
    const rawText=fields.map(f=>f.path+': '+f.value).join('\n');
    const ref={name,sourceKind:'xml',xmlFields:fields,rawText,title:partyTitle(buyer),vkn:partyId(buyer),taxOffice:value(buyer,'PartyTaxScheme','TaxScheme','Name'),address:address(buyer),sellerText:[partyTitle(seller),'VKN / TCKN: '+partyId(seller),address(seller)].filter(Boolean).join('\n'),invoiceDate:value(root,'IssueDate'),invoiceNo:value(root,'ID'),scenario:value(root,'ProfileID'),taxType:value(root,'InvoiceTypeCode')==='TEVKIFAT'?'withholding':value(root,'ProfileID')==='TEMELFATURA'?'basic':'sale',currency:value(root,'DocumentCurrencyCode'),amountCents:amount(root,'LegalMonetaryTotal','LineExtensionAmount'),lineItems:[],noteLines:[],ssno:'',ssnos:[],bankLines:[],withholdingCode:'',withholdingRate:'',withholdingReason:'',writtenAmountSource:'',warnings:[]};
    const order=path(root,'OrderReference');
    ref.ssnos=[...new Set([...rawText.matchAll(/\bSS\s*NO[\s:#.-]*([A-Z0-9][A-Z0-9/-]*)/gi)].map(m=>m[1]))];
    if(!ref.ssnos.length&&order&&/SS\s*NO/i.test(value(order,'ID')))ref.ssnos=[value(order,'ID').replace(/^.*?SS\s*NO[\s:#.-]*/i,'').replace(/#.*$/,'')];
    for(const n of all(root,'ID'))if(/^SS[ _-]*NO$/i.test(n.getAttribute('schemeID')||'')&&n.textContent.trim())ref.ssnos.push(n.textContent.trim());
    ref.ssnos=[...new Set(ref.ssnos)];ref.ssno=ref.ssnos.length===1?ref.ssnos[0]:'';
    if(kids(root,'InvoiceLine').length>1000||kids(root,'Note').length>1000)throw Error('XML’de 1.000’den fazla hizmet veya not var; kaynak eksiltilmeden işlenemedi.');
    const noteNodes=kids(root,'Note');ref.noteLines=noteNodes.map(n=>({text:n.textContent.trim(),source:'XML notu',removed:false})).filter(n=>n.text);
    for(const node of kids(root,'InvoiceLine')){
      const item=path(node,'Item'),q=path(node,'InvoicedQuantity'),taxes=kids(path(node,'TaxTotal'),'TaxSubtotal'),vat=taxes.find(t=>value(t,'TaxCategory','TaxScheme','TaxTypeCode')==='0015'||/^KDV$/i.test(value(t,'TaxCategory','TaxScheme','Name')));
      const description=[value(item,'Name'),value(item,'Description'),...kids(node,'Note').map(n=>n.textContent.trim())].filter((t,i,a)=>t&&a.indexOf(t)===i).join('\n');
      const quantity=number(q?.textContent?.trim()||''),base=number(value(node,'Price','BaseQuantity'))??1,price=number(value(node,'Price','PriceAmount'));
      ref.lineItems.push({description,quantity,unit:q?.getAttribute('unitCode')||'',unitPrice:price!==null&&base>0?price/base:null,vatRate:vat?number(value(vat,'Percent')):null,amountCents:amount(node,'LineExtensionAmount')});
      if(kids(node,'AllowanceCharge').length)ref.warnings.push('Satır iskontosu / masrafı var; yeni ay hesaplarını kontrol et.');
      if(taxes.some(t=>t!==vat))ref.warnings.push('KDV dışında vergi var; yeni ay hesaplarını kontrol et.');
    }
    if(kids(root,'TaxTotal').flatMap(n=>kids(n,'TaxSubtotal')).some(n=>value(n,'TaxCategory','TaxScheme','TaxTypeCode')!=='0015'&&!/^KDV$/i.test(value(n,'TaxCategory','TaxScheme','Name'))))ref.warnings.push('Fatura genelinde KDV dışında vergi var; kontrol gerekli.');
    const withholding=all(root,'WithholdingTaxTotal').flatMap(n=>kids(n,'TaxSubtotal'));
    const rates=[...new Set(withholding.map(n=>value(n,'Percent')))];
    if(withholding.length){const w=withholding[0],pct=number(value(w,'Percent'));ref.withholdingCode=value(w,'TaxCategory','TaxScheme','TaxTypeCode');ref.withholdingReason=value(w,'TaxCategory','TaxScheme','Name');ref.withholdingRate=pct>0&&pct<100&&pct%10===0?pct/10+'/10':'';if(rates.length!==1||new Set(withholding.map(n=>value(n,'TaxCategory','TaxScheme','TaxTypeCode'))).size!==1)ref.warnings.push('Birden fazla tevkifat uygulaması var; kontrol gerekli.');}
    if(!ref.title||!ref.vkn||!ref.address)ref.warnings.push('XML alıcı bilgileri eksik.');
    if(!validDate(ref.invoiceDate,ref.invoiceDate.slice(0,7)))ref.warnings.push('XML fatura tarihi geçersiz.');
    if(!ref.lineItems.length||ref.lineItems.some(l=>l.vatRate===null))ref.warnings.push('XML hizmet / KDV bilgileri eksik.');
    if(!['TRY','USD','EUR','GBP'].includes(ref.currency))ref.warnings.push('XML para birimi desteklenmiyor.');
    if(kids(root,'AllowanceCharge').length)ref.warnings.push('Fatura genelinde iskonto / masraf var; yeni ay hesaplarını kontrol et.');
    if(!['SATIS','TEVKIFAT'].includes(value(root,'InvoiceTypeCode')))ref.warnings.push('Bu XML fatura türü için kontrol gerekli: '+value(root,'InvoiceTypeCode'));
    if(ref.ssnos.length>1)ref.warnings.push('XML birden fazla SS NO içeriyor; şubeyi seç.');
    const net=ref.lineItems.reduce((s,l)=>s+(l.amountCents||0),0);if(ref.lineItems.some(l=>l.quantity===null||l.unitPrice===null||Math.abs(Math.round(l.quantity*l.unitPrice*100)-l.amountCents)>1))ref.warnings.push('XML miktar × birim fiyat ile satır tutarı farklı; iskonto / masrafı kontrol et.');if(ref.amountCents===null||net!==ref.amountCents)ref.warnings.push('XML satır toplamı ile matrah uyuşmuyor.');
    ref.sourceTotals={net:ref.amountCents,vat:kids(root,'TaxTotal').reduce((s,n)=>s+(amount(n,'TaxAmount')||0),0),withholding:kids(root,'WithholdingTaxTotal').reduce((s,n)=>s+(amount(n,'TaxAmount')||0),0),payable:amount(root,'LegalMonetaryTotal','PayableAmount')};
    ref.noteLines=ref.noteLines.flatMap(note=>{if(!/^#?YALN[ıiİI]Z\b/i.test(note.text))return [note];const parsed=parseReference([[{y:100,items:[{x:35,text:note.text.replace(/^#/,''),w:200}]}]],name);if(parsed.writtenAmountSource){ref.writtenAmountSource=parsed.writtenAmountSource;return parsed.noteLines.map(n=>({...n,source:'XML notu'}));}return [note];});
    const t=totals({...ref,lineItems:ref.lineItems});if(!t||['net','vat','withholding','payable'].some(k=>t[k]!==ref.sourceTotals[k]))ref.warnings.push('XML resmi toplamları hesaplanan tutarlardan farklı; yeni ay kontrolü gerekli.');
    ref.warnings=[...new Set(ref.warnings)];return ref;
  }
  function applyReference(row,ref){
    const sourcePeriod=ref.invoiceDate.slice(0,7),targetPeriod=row.sourcePeriod,shift=text=>shiftMonth(text,sourcePeriod,targetPeriod);
    const lines=ref.lineItems.map(l=>({...l,description:shift(l.description)}));if(lines.length===1&&Number.isSafeInteger(row.amountCents)){lines[0].amountCents=row.amountCents;lines[0].unitPrice=row.amountCents/100/lines[0].quantity;}
    return {...row,sourceKind:ref.sourceKind||'pdf',referenceWarnings:ref.warnings||[],monthSourcePeriod:sourcePeriod,monthTargetPeriod:targetPeriod,sellerText:ref.sellerText,bankLines:[],excelCustomer:row.excelCustomer||row.customer,customer:ref.title,vkn:ref.vkn,address:ref.address,taxOffice:ref.taxOffice,referencePdf:ref.name,referenceInvoice:ref.invoiceNo,referenceDate:ref.invoiceDate,referenceTitle:ref.title,referenceVkn:ref.vkn,referenceAddress:ref.address,referenceSsno:ref.ssno,referenceDescription:ref.lineItems.map(l=>l.description).join('\n'),referenceWrittenAmount:ref.writtenAmountSource,previousAmountCents:ref.amountCents,previousCurrency:ref.currency,previousPeriod:ref.invoiceDate.slice(0,7),ssno:row.ssno||ref.ssno,ssnoRequired:row.ssnoRequired||/\bMLP\b|MEDICAL\s*PARK|LIV\s*HOSPITAL/i.test(ref.title),scenario:ref.scenario,taxType:ref.taxType,withholdingCode:ref.withholdingCode,withholdingRate:ref.withholdingRate,withholdingReason:ref.withholdingReason,currency:ref.currency,lineItems:lines,description:lines.map(l=>l.description).join('\n'),noteLines:ref.noteLines.map(l=>({...l,text:shift(l.text)})),notes:ref.noteLines.map(l=>shift(l.text)).join('\n'),amountConfirmed:true,referenceReviewed:false,changeConfirmed:false,referenceWarnings:ref.warnings,autoMatched:true};
  }
  function lineTotal(row){return Array.isArray(row.lineItems)&&row.lineItems.length&&row.lineItems.every(l=>Number.isSafeInteger(l.amountCents))?row.lineItems.reduce((s,l)=>s+l.amountCents,0):null;}
  function totals(row){const items=row.lineItems||[];if(!items.length||items.some(l=>!Number.isFinite(l.vatRate)||l.vatRate<0||l.vatRate>100||!Number.isSafeInteger(l.amountCents)||l.amountCents<0))return null;const net=items.reduce((s,l)=>s+l.amountCents,0),vat=items.reduce((s,l)=>s+Math.round(l.amountCents*l.vatRate/100),0);let withholding=0;if(row.taxType==='withholding'){const rate=String(row.withholdingRate||'').match(/^([1-9])\/10$/);if(!rate)return null;withholding=Math.round(vat*Number(rate[1])/10);}return {net,vat,withholding,payable:net+vat-withholding};}
  function moneyWords(value,currency='TRY'){
    if(!Number.isSafeInteger(value)||value<0)return '';const ones=['','Bir','İki','Üç','Dört','Beş','Altı','Yedi','Sekiz','Dokuz'],tens=['','On','Yirmi','Otuz','Kırk','Elli','Altmış','Yetmiş','Seksen','Doksan'];
    const triple=n=>(n>=100?(Math.floor(n/100)===1?'':ones[Math.floor(n/100)])+'Yüz':'')+tens[Math.floor(n%100/10)]+ones[n%10];let n=Math.floor(value/100),out='';for(const [v,label] of [[1e9,'Milyar'],[1e6,'Milyon'],[1000,'Bin']]){const count=Math.floor(n/v);if(count){out+=(count===1&&v===1000?'':triple(count))+label;n%=v;}}out+=triple(n)||(!out?'Sıfır':'');const unit={TRY:'TürkLirası',USD:'AmerikanDoları',EUR:'Avro',GBP:'İngilizSterlini'}[currency]||currency;return out+' '+unit+' '+(triple(value%100)||'Sıfır')+' '+(currency==='TRY'?'Kuruş':'Sent');
  }
  function localIssues(row,project,refs){const list=[];if(row.sourceKind==='xml')list.push(...(row.referenceWarnings||[]));if(!validDate(project.invoiceDate,project.period))list.push('Üstten kesilecek tarihi seç.');if(!row.referencePdf||!refs.has(row.referencePdf))list.push('Önceki ay belge eşleşmesi bekleniyor.');if(!/^\d{10,11}$/.test(row.vkn||''))list.push('kaynak belgede alıcının vergi numarası okunamadı.');if(!row.customer||!row.address)list.push('kaynak belgedeki unvan veya adres eksik.');if(row.referenceTitle&&titleKey(row.customer)!==titleKey(row.referenceTitle))list.push('Ticari unvan referanstaki alıcıdan farklı.');if(row.sourcePeriod!==project.period||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0)list.push('Bu ayın Excel tutarı bulunamadı.');if(!row.lineItems?.length||row.lineItems.some(l=>!l.description||!Number.isFinite(l.quantity)||l.quantity<=0||l.quantity>=1e6||!Number.isFinite(l.unitPrice)||l.unitPrice<0)||!row.description)list.push('Hizmet satırları XML / kaynak belgeden okunamadı.');if(lineTotal(row)!==row.amountCents)list.push('Hizmet satırlarının toplamı Excel tutarından farklı.');if(row.ssnoRequired&&!row.ssno)list.push('SS NO kaynak belgede okunamadı.');if(row.referenceSsno&&row.ssno!==row.referenceSsno)list.push('SS NO referanstan farklı.');if(row.referenceVkn&&row.vkn!==row.referenceVkn)list.push('Vergi numarası referanstan farklı.');if(row.referenceAddress&&normalize(row.address)!==normalize(row.referenceAddress))list.push('Adres referanstan farklı.');if(!totals(row))list.push('KDV / tevkifat bilgileri kaynak belgede tam okunamadı.');if(row.taxType==='withholding'&&row.withholdingReason&&/^\d{3}\b/.test(row.withholdingReason)&&row.withholdingReason.match(/^\d{3}/)[0]!==row.withholdingCode)list.push('Tevkifat kodu ile kaynak belgedeki sebep açıklaması uyuşmuyor.');if(row.taxType==='withholding'&&(!row.withholdingCode||!row.withholdingRate||!row.withholdingReason))list.push('Tevkifat kodu, oranı veya sebep açıklaması kaynak belgede tam okunamadı.');return list;}
  function pdfRuleLines(operatorList,OPS){
    const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];let matrix=[1,0,0,1,0,0],stack=[],lines=[];
    for(let i=0;i<operatorList.fnArray.length;i++){const op=operatorList.fnArray[i],args=operatorList.argsArray[i];if(op===OPS.save)stack.push([...matrix]);else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];else if(op===OPS.transform)matrix=multiply(matrix,args);else if(op===OPS.constructPath&&args[2]){const [x0,y0,x1,y1]=args[2],points=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);if(top-bottom<2&&right-left>10)lines.push({left,right,y:(top+bottom)/2,height:top-bottom});}}
    return lines;
  }
  async function createTemplatePreviewPdf(row,project,deps){
    const {PDFDocument,rgb}=deps.PDFLib,doc=await PDFDocument.create(),fonts=await deps.loadFonts(doc),font=fonts.regular,bold=fonts.bold;
    const source=await deps.pdfjsLib.getDocument({data:new Uint8Array(deps.sourcePdf),isEvalSupported:false}).promise,ref=deps.sourceReference,layout=ref.layout,black=rgb(0,0,0),white=rgb(1,1,1),red=rgb(.65,.13,.1),t=totals(row),overflows=[];
    const currency=row.currency==='TRY'?'TL':row.currency,money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100):'EKSİK',decimalText=n=>Number.isFinite(n)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:10}).format(n):'EKSİK';
    const fullText=r=>r.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim(),bounds=items=>({left:Math.min(...items.map(i=>i.x)),right:Math.max(...items.map(i=>i.x+(i.w||0))),top:Math.max(...items.map(i=>i.y+(i.h||7))),bottom:Math.min(...items.map(i=>i.y)),size:Math.min(8,...items.map(i=>i.h||7))});
    function wrapped(text,width,size){const out=[];for(const paragraph of String(text??'').split('\n')){let current='';for(const word of paragraph.split(/\s+/)){if(!word)continue;const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)<=width){current=next;continue;}if(current)out.push(current);current='';for(const char of word){if(font.widthOfTextAtSize(current+char,size)>width){out.push(current);current='';}current+=char;}}out.push(current);}return out;}
    function erase(page,items){for(const i of items)page.drawRectangle({x:i.x-.35,y:i.y-1.35,width:(i.w||2)+.7,height:(i.h||7)+1.7,color:white});}
    function patch(page,items,value,{left,right,align='left',maxHeight,minSize=4.5}={}){if(!items.length)return;const b=bounds(items),x=left??b.left,width=Math.max(12,(right??b.right)-x),height=maxHeight??Math.max(10,b.top-b.bottom+2);let size=b.size,lines=wrapped(value,width,size);while(size>minSize&&(lines.length*size*1.13>height||lines.some(l=>font.widthOfTextAtSize(l,size)>width))){size-=.2;lines=wrapped(value,width,size);}erase(page,items);if(lines.length*size*1.13>height+2){overflows.push(String(value));lines=wrapped('Ek açıklama sayfasına bakınız.',width,size);}lines.forEach((text,index)=>{const drawX=align==='right'?x+width-font.widthOfTextAtSize(text,size):x;page.drawText(text,{x:drawX,y:b.bottom+(lines.length-1-index)*size*1.13,size,font,color:black});});}
    try{for(let pn=0;pn<source.numPages;pn++){
      const oldPage=await source.getPage(pn+1),base=oldPage.getViewport({scale:1}),viewport=oldPage.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await oldPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const image=await doc.embedPng(canvas.toDataURL('image/png')),page=doc.addPage([base.width,base.height]);page.drawImage(image,{x:0,y:0,width:base.width,height:base.height});canvas.width=canvas.height=1;
      const rules=pdfRuleLines(await oldPage.getOperatorList(),deps.pdfjsLib.OPS);const rows=(layout[pn]||[]).map(r=>({...r,items:r.items.map(i=>({...i,y:r.y}))})),flat=rows.flatMap(r=>r.items);
      const header=rows.find(r=>normalize(fullText(r)).includes('miktar')&&normalize(fullText(r)).includes('birimfiyat'));
      const footerStart=rows.find(r=>/^YALNIZ|^TEVKIFAT\s*SEBEBI/.test(words(fullText(r))))?.y??0;const moneyItems=flat.filter(i=>i.y<(header?.y??base.height)&&i.y>footerStart+5&&i.x>base.width*.65&&(/\d[\d.]*,\d{2}/.test(i.text)||/^(TL|TRY|USD|EUR|GBP)$/.test(i.text)));const tableRule=rules.filter(r=>header&&r.y<header.y+20&&r.y>header.y-200&&r.right-r.left>base.width*.7).sort((a,b)=>(b.right-b.left)-(a.right-a.left))[0];const contentLeft=tableRule?.left??(header?Math.min(...header.items.map(i=>i.x))-2:34),contentRight=tableRule?.right??(moneyItems.length?Math.min(base.width-15,Math.max(...moneyItems.map(i=>i.x+(i.w||0)))+2):base.width-34);
      if(pn===0){
        // The original QR encodes the issued invoice. It is intentionally absent on this control copy.
        page.drawRectangle({x:base.width-155,y:base.height-142,width:140,height:130,color:white});page.drawText('KONTROL ÖNİZLEMESİ',{x:base.width-150,y:base.height-75,size:8,font:bold,color:red});page.drawText('GÖNDERİLMEDİ',{x:base.width-150,y:base.height-88,size:8,font:bold,color:red});
      }
      function meta(label,value){const line=rows.find(r=>r.items.some(i=>label.test(words(i.text))));if(!line)return;const item=line.items.find(i=>label.test(words(i.text))),tail=line.items.filter(i=>i.x>item.x+(item.w||0)-1);if(tail.length)patch(page,tail,value,{left:Math.min(...tail.map(i=>i.x)),right:Math.min(contentRight,Math.max(...tail.map(i=>i.x+(i.w||0)))+2)});else if(/:/.test(item.text))patch(page,[item],item.text.replace(/:.*/,': '+value),{right:contentRight});}
      meta(/FATURA\s*TARIHI/,displayDate(project.invoiceDate));meta(/FATURA\s*NO\s*:/,previewInvoiceNo(row,project));
      if(row.taxType!==ref.taxType){meta(/FATURA\s*TIPI/,row.taxType==='withholding'?'TEVKİFAT':'SATIŞ');meta(/SENARYO/,row.taxType==='basic'?'TEMELFATURA':row.scenario||'TICARIFATURA');}
      const ettn=rows.find(r=>r.items.some(i=>/^ETTN\s*:/i.test(i.text)));if(ettn){const label=ettn.items.find(i=>/^ETTN\s*:/i.test(i.text)),value=ettn.items.filter(i=>i.x>label.x+(label.w||0)-1);if(value.length)patch(page,value,'ÖNİZLEME — ETTN OLUŞTURULMADI',{right:contentRight});else patch(page,[label],'ETTN: ÖNİZLEME',{right:contentRight});}
      const sayin=rows.find(r=>r.items.some(i=>normalize(i.text)==='sayin'));
      if(sayin){const left=sayin.items.find(i=>normalize(i.text)==='sayin').x,metaStart=Math.min(...flat.filter(i=>i.x>left+180&&/OZELLESTIRME|SENARYO|FATURA TIPI/.test(words(i.text))).map(i=>i.x)),right=Number.isFinite(metaStart)?metaStart-12:left+280,recipient=rows.filter(r=>r.y<sayin.y-2&&r.y>sayin.y-210).map(r=>({...r,items:r.items.filter(i=>i.x>=left-4&&i.x<right)})).filter(r=>r.items.length);let consumed='';const titleItems=[],addressItems=[];for(const r of recipient){const text=fullText(r);if(/\bVKN|TCKN|VERGI DAIRESI|E-?POSTA|\bTEL\s*:|\bFAX\s*:/i.test(words(text)))continue;if(normalize(consumed).length<normalize(ref.title).length){titleItems.push(...r.items);consumed+=' '+text;}else addressItems.push(...r.items);}if(normalize(row.customer)!==normalize(ref.title)&&titleItems.length)patch(page,titleItems,row.customer,{right,maxHeight:bounds(titleItems).top-bounds(titleItems).bottom+3});if(normalize(row.address)!==normalize(ref.address)&&addressItems.length)patch(page,addressItems,row.address,{right,maxHeight:bounds(addressItems).top-bounds(addressItems).bottom+3});const vknLine=recipient.find(r=>/\b(?:VKN|TCKN)\s*:/i.test(fullText(r)));if(vknLine&&row.vkn!==ref.vkn)patch(page,vknLine.items,fullText(vknLine).replace(/\d{10,11}/,row.vkn),{right});const officeLine=recipient.find(r=>/VERGI\s*DAIRESI/.test(words(fullText(r))));if(officeLine&&row.taxOffice!==ref.taxOffice)patch(page,officeLine.items,'Vergi Dairesi: '+row.taxOffice,{right});}if(row.ssno!==ref.ssno){const ss=flat.filter(i=>/\bSS\s*NO[\s:#.-]*[A-Z0-9]/i.test(i.text));for(const item of ss)patch(page,[item],item.text.replace(/(\bSS\s*NO[\s:#.-]*)[A-Z0-9][A-Z0-9/-]*/i,(_,prefix)=>prefix+row.ssno),{right:Math.min(contentRight,item.x+Math.max(item.w||0,110))});}
      if(header){
        const xFor=pattern=>header.items.find(i=>pattern.test(normalize(i.text)))?.x,quantity=xFor(/miktar/),price=xFor(/birimfiyat/),vat=xFor(/kdvoran/),vatAmount=xFor(/kdvtutar/),other=xFor(/digervergi/),total=xFor(/malhizmettutar/);
        const end=rows.find(r=>r.y<header.y&&/malhizmettoplam|toplamtutarmatrah|vergilerda|odenecektutar/.test(normalize(fullText(r))))?.y??0,body=rows.filter(r=>r.y<header.y&&r.y>end+3),markers=body.flatMap(r=>r.items.filter(i=>i.x<55&&/^\d{1,3}$/.test(i.text.trim())).map(i=>({y:r.y,index:Number(i.text)-1})));
        for(let k=0;k<markers.length;k++){const marker=markers[k],top=k?(markers[k-1].y+marker.y)/2:header.y,bottom=k+1<markers.length?(marker.y+markers[k+1].y)/2:end+3,items=body.filter(r=>r.y<top&&r.y>bottom).flatMap(r=>r.items),index=marker.index,old=ref.lineItems[index],next=row.lineItems?.[index];if(!old||!next){if(old&&!next){erase(page,items);}continue;}
          const region=(a,b)=>items.filter(i=>i.x>=a-3&&i.x<b-3),replaceCell=(a,b,value)=>{if(a!==undefined){const selected=region(a,b);patch(page,selected,value,{left:a-2,right:b-4,align:'right'});}};
          if(next.description!==old.description)patch(page,items.filter(i=>i.x>=55&&i.x<quantity-3),next.description,{left:55,right:quantity-4,maxHeight:Math.max(10,top-bottom-5)});
          if(next.quantity!==old.quantity||next.unit!==old.unit)replaceCell(quantity,price,String(next.quantity)+' '+next.unit);
          if(next.unitPrice!==old.unitPrice)replaceCell(price,vat??vatAmount??total,decimalText(next.unitPrice)+' '+currency);
          if(next.vatRate!==old.vatRate)replaceCell(vat,vatAmount??other??total,'%'+decimalText(next.vatRate));
          if(next.amountCents!==old.amountCents||next.vatRate!==old.vatRate){replaceCell(vatAmount,other??total,money(Math.round(next.amountCents*next.vatRate/100))+' '+currency);replaceCell(total,contentRight+3,money(next.amountCents)+' '+currency);}
          if(other!==undefined&&(next.amountCents!==old.amountCents||row.withholdingRate!==ref.withholdingRate||row.taxType!==ref.taxType)){const value=row.taxType==='withholding'?'KDV TEVKİFAT\n(%'+(Number(row.withholdingRate?.split('/')[0])*10)+') '+money(Math.round(Math.round(next.amountCents*next.vatRate/100)*Number(row.withholdingRate?.split('/')[0])/10))+' '+currency:'';replaceCell(other,total,value);}
        }
      }
      if(t){for(const line of rows){const text=fullText(line),n=normalize(text);let value=null;if(/malhizmettoplam|toplamtutarmatrah|nettutarmatrah|vergihari[cç]toplam/.test(n))value=t.net;else if(/hesaplanankdvtevkifat/.test(n)){value=t.withholding;if(row.withholdingRate!==ref.withholdingRate){const labels=line.items.filter(i=>i.x<=base.width*.65&&/%\s*[\d.,]+/.test(i.text)),rate=Number(row.withholdingRate?.split('/')[0])*10;for(const label of labels)patch(page,[label],label.text.replace(/%\s*[\d.,]+/,'%'+decimalText(rate)));}}else if(/tevkifatatabiislemtutar/.test(n))value=t.net;else if(/hesaplanankdv/.test(n)){const rate=decimal((text.match(/%\s*([\d.,]+)/)||[])[1]);const currentRates=[...new Set(row.lineItems.map(l=>l.vatRate))];value=rate===null||currentRates.length===1?t.vat:row.lineItems.filter(l=>l.vatRate===rate).reduce((sum,l)=>sum+Math.round(l.amountCents*l.vatRate/100),0);if(currentRates.length===1&&rate!==null&&rate!==currentRates[0]){const labels=line.items.filter(i=>i.x<=base.width*.65&&/%\s*[\d.,]+/.test(i.text));for(const label of labels)patch(page,[label],label.text.replace(/%\s*[\d.,]+/,'%'+decimalText(currentRates[0])));}}else if(/vergilerdahiltoplam/.test(n))value=t.net+t.vat;else if(/odenecektutar/.test(n))value=t.payable;if(value===null)continue;const sourceRate=row.lineItems.length===ref.lineItems.length&&row.lineItems.every((l,i)=>l.vatRate===ref.lineItems[i].vatRate)&&row.withholdingRate===ref.withholdingRate;if(sourceRate&&moneyIn(text)===value)continue;const numeric=line.items.filter(i=>i.x>base.width*.65&&(/\d[\d.,]*,\d{2}/.test(i.text)||/^(TL|TRY|USD|EUR|GBP)$/.test(i.text)));if(numeric.length)patch(page,numeric,money(value)+' '+currency,{left:Math.min(...numeric.map(i=>i.x))-1,right:contentRight-2,align:'right'});}}
      const bank=rows.find(r=>/BANKA BILGI|BANKA HESAP|HESAP BILGI|BANKA ADI/.test(words(fullText(r)))),bankTextTop=bank?bank.y+Math.max(...bank.items.map(i=>i.h||7)):0,bankRule=bank?rules.filter(r=>r.right-r.left>base.width*.7&&r.y>bankTextTop&&r.y<bankTextTop+18).sort((a,b)=>a.y-b.y)[0]:null,bankCut=bankRule?.y??bankTextTop+3;if(bank)page.drawRectangle({x:contentLeft-.5,y:0,width:contentRight-contentLeft+2,height:bankCut-.1,color:white});
      const start=rows.findIndex(r=>/^YALNIZ|^TEVKIFAT\s*SEBEBI/.test(words(fullText(r)))),footer=start>=0?rows.slice(start).filter(r=>!bank||r.y>bankCut+1):[];
      if(footer.length){const sameNotes=JSON.stringify((row.noteLines||[]).filter(l=>!l.removed).map(l=>l.text))===JSON.stringify(ref.noteLines.map(l=>l.text)),sameMoney=t&&t.payable===totals({...row,lineItems:ref.lineItems,taxType:ref.taxType,withholdingRate:ref.withholdingRate})?.payable;
        if(!sameMoney||!sameNotes||row.withholdingReason!==ref.withholdingReason||row.taxType!==ref.taxType){const allItems=footer.flatMap(r=>r.items);erase(page,allItems);const upper=Math.max(...footer.map(r=>r.y)),lower=Math.max(28,bank?bankCut+2:Math.min(...footer.map(r=>r.y))-8);const paragraphs=[];if(row.taxType==='withholding'&&row.withholdingReason)paragraphs.push('Tevkifat Sebebi: '+row.withholdingReason);if(t){let written=moneyWords(t.payable,row.currency).replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g,'$1 $2');if(!/KURUS|KRS/.test(words(ref.writtenAmountSource))&&t.payable%100===0)written=written.replace(/ Sıfır Kuruş$/,'');paragraphs.push('Yalnız: '+written);}else paragraphs.push('Yalnız: Tutar kontrolü bekleniyor.');paragraphs.push(...(row.noteLines||[]).filter(n=>!n.removed&&n.text).map(n=>(n.source==='Not'?'Not : ':'')+n.text));let size=Math.min(7,...allItems.map(i=>i.h||7)),lines=paragraphs.flatMap(p=>wrapped(p,contentRight-contentLeft-4,size));while(size>5&&lines.length*(size+2)>upper-lower+size){size-=.2;lines=paragraphs.flatMap(p=>wrapped(p,contentRight-contentLeft-4,size));}let y=upper;for(const text of lines){if(y<lower){overflows.push(text);continue;}page.drawText(text,{x:contentLeft+1,y,size,font,color:/irsaliye yerine/i.test(text)?rgb(0,0,.8):black});y-=size+2;}}
      }
      page.drawText('KONTROL ÖNİZLEMESİ — GÖNDERİLMEDİ',{x:contentLeft,y:base.height-12,size:6,font:bold,color:red});
    }
    if(row.lineItems.length>ref.lineItems.length)for(const [index,line] of row.lineItems.entries())if(index>=ref.lineItems.length)overflows.push('Hizmet satırı '+(index+1)+': '+line.description+' · '+line.quantity+' '+line.unit+' · Birim fiyat '+decimalText(line.unitPrice)+' '+currency+' · KDV %'+decimalText(line.vatRate)+' · Tutar '+money(line.amountCents)+' '+currency);
    if(overflows.length){let p,y;const newPage=()=>{p=doc.addPage([595.28,841.89]);y=800;p.drawText('KONTROL ÖNİZLEMESİ · EK AÇIKLAMALAR',{x:36,y,size:11,font:bold,color:red});y-=25;};newPage();for(const value of overflows)for(const line of wrapped(value,523,8)){if(y<40)newPage();p.drawText(line,{x:36,y,size:8,font,color:black});y-=12;}}
    return doc.save();}finally{await source.destroy();}
  }
  async function createPreviewPdf(row,project,deps){
    if(deps.sourcePdf&&deps.sourceReference?.layout?.length&&deps.pdfjsLib)return createTemplatePreviewPdf(row,project,deps);
    const sourceMode=deps.sourceMode===true,sourceRef=deps.sourceReference;
    const {PDFDocument,rgb,degrees}=deps.PDFLib,doc=await PDFDocument.create(),fonts=await deps.loadFonts(doc),regular=fonts.regular,bold=fonts.bold;
    const ink=rgb(.12,.18,.23),muted=rgb(.38,.44,.49),line=rgb(.79,.83,.86),mint=rgb(.08,.35,.29),red=rgb(.65,.18,.14),money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100):'OKUNAMADI';
    let page,y;const W=595.28,H=841.89,left=36,right=W-36,width=right-left;
    const safe=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/\t/g,' ');
    function wrap(value,max,font=regular,size=9){const out=[];for(const paragraph of safe(value).split('\n')){let current='';for(const word of paragraph.split(/\s+/)){if(!word)continue;const candidate=current?current+' '+word:word;if(font.widthOfTextAtSize(candidate,size)<=max){current=candidate;continue;}if(current){out.push(current);current='';}if(font.widthOfTextAtSize(word,size)>max){for(const char of word){if(font.widthOfTextAtSize(current+char,size)>max){out.push(current);current='';}current+=char;}}else current=word;}out.push(current);}return out;}
    function newPage(){page=doc.addPage([W,H]);page.drawText(sourceMode?'ÖNCEKİ FATURA · XML GÖRÜNÜMÜ':'KONTROL ÖNİZLEMESİ',{x:left,y:H-31,size:9,font:bold,color:mint});page.drawText(sourceMode?'XML’DEN ÜRETİLDİ':'GÖNDERİLMEDİ',{x:right-110,y:H-31,size:9,font:bold,color:red});page.drawLine({start:{x:left,y:H-39},end:{x:right,y:H-39},color:line,thickness:.6});y=H-59;}
    function ensure(height){if(y-height<48)newPage();}
    function text(value,{x=left,max=width,size=9,font=regular,color=ink,leading=size*1.4}={}){const lines=wrap(value,max,font,size);for(const l of lines){ensure(leading);page.drawText(l,{x,y,size,font,color});y-=leading;}return lines.length*leading;}
    function section(title){ensure(34);y-=10;text(title,{font:bold,size:10,color:mint});y-=5;}
    newPage();
    const top=y;text('PUSULA',{font:bold,size:20,color:mint});y-=4;text(row.sellerText||'Satıcı bilgileri eşleşen XML / kaynak belgeden alınacak.',{max:290,size:8,leading:11});const sellerEnd=y;
    y=top;text(sourceMode?'ÖNCEKİ AYIN FATURASI':'FATURA HAZIRLIK ÖNİZLEMESİ',{x:340,max:right-340,font:bold,size:12});text('Tarih: '+(displayDate(project.invoiceDate)||'SEÇİLMEDİ'),{x:340,max:right-340,size:9});text('Senaryo: '+(row.taxType==='basic'?'TEMEL FATURA':row.scenario==='TEMELFATURA'?'TEMEL FATURA':'TİCARİ FATURA'),{x:340,max:right-340,size:9});text('Tip: '+(row.taxType==='withholding'?'TEVKİFAT':'SATIŞ'),{x:340,max:right-340,size:9});text('Para birimi: '+(row.currency||'TRY'),{x:340,max:right-340,size:9});text('Fatura no: '+(sourceMode?sourceRef.invoiceNo:previewInvoiceNo(row,project))+(sourceMode?'':' · ÖNİZLEME'),{x:340,max:right-340,size:8,color:muted});y=Math.min(y,sellerEnd)-10;
    section('SAYIN');text(row.customer||'ALICI UNVANI OKUNAMADI',{font:bold,size:11});text(row.address||'ADRES OKUNAMADI',{size:9});text('Vergi dairesi: '+(row.taxOffice||'Belirtilmemiş')+'    VKN / TCKN: '+(row.vkn||'OKUNAMADI'),{size:9});if(row.ssno||row.ssnoRequired)text('SS NO: '+(row.ssno||'EKSİK'),{font:bold,size:10,color:row.ssno?ink:red});y-=14;
    const xs=[36,63,291,333,373,439,480,559.28],headers=['No','Mal / hizmet açıklaması','Miktar','Birim','Birim fiyat','KDV %','Tutar'];
    function tableHeader(){ensure(30);const h=24;page.drawRectangle({x:left,y:y-h,width,height:h,color:rgb(.94,.96,.97),borderColor:line,borderWidth:.5});headers.forEach((v,i)=>page.drawText(v,{x:xs[i]+5,y:y-15,size:8,font:bold,color:ink}));y-=h;}
    tableHeader();const items=row.lineItems?.length?row.lineItems:[{description:'HİZMET SATIRLARI PDF’DEN OKUNAMADI',quantity:null,unit:'',unitPrice:null,vatRate:null,amountCents:null}];
    for(let n=0;n<items.length;n++){const item=items[n],description=wrap(item.description||'AÇIKLAMA EKSİK',xs[2]-xs[1]-10,regular,8.5),chunks=[];for(let k=0;k<description.length;k+=35)chunks.push(description.slice(k,k+35));
      for(let k=0;k<chunks.length;k++){const lines=chunks[k],height=Math.max(30,lines.length*12+12);if(y-height<55){newPage();tableHeader();}page.drawRectangle({x:left,y:y-height,width,height,borderColor:line,borderWidth:.5});for(const x of xs.slice(1,-1))page.drawLine({start:{x,y},end:{x,y:y-height},color:line,thickness:.4});
        const values=[k?'':String(n+1),'',k?'':String(item.quantity??''),k?'':item.unit||'',k?'':(Number.isFinite(item.unitPrice)?new Intl.NumberFormat('tr-TR',{maximumFractionDigits:10}).format(item.unitPrice):'EKSİK'),k?'':String(item.vatRate??'EKSİK'),k?'':money(item.amountCents)];
        values.forEach((value,i)=>{if(i===1)return;const max=xs[i+1]-xs[i]-8,ls=wrap(value,max,regular,8);ls.forEach((v,j)=>page.drawText(v,{x:xs[i]+4,y:y-15-j*10,size:8,font:regular,color:ink}));});lines.forEach((v,j)=>page.drawText(v,{x:xs[1]+5,y:y-15-j*12,size:8.5,font:regular,color:ink}));y-=height;
      }
    }
    y-=14;const t=sourceMode?sourceRef.sourceTotals:totals(row);if(t){const totalsList=[['Mal / hizmet toplamı (matrah)',t.net],['Hesaplanan KDV',t.vat],...(row.taxType==='withholding'?[['KDV tevkifat '+(row.withholdingRate||'')+' · '+(row.withholdingCode||''),t.withholding]]:[]),['Ödenecek tutar',t.payable]];for(const [label,value] of totalsList){ensure(19);page.drawText(label,{x:315,y,size:8.5,font:label==='Ödenecek tutar'?bold:regular,color:ink});const valueText=money(value)+' '+row.currency;page.drawText(valueText,{x:right-regular.widthOfTextAtSize(valueText,9),y,size:9,font:regular,color:ink});y-=19;}}
    else text('TOPLAMLAR: KDV / tevkifat veya hizmet bilgileri eksik.',{size:9,color:red});
    section('YALNIZ / NOTLAR');if(row.taxType==='withholding'&&row.withholdingReason)text('Tevkifat Sebebi: '+row.withholdingReason,{size:8});if(t)text('YALNIZ: '+moneyWords(t.payable,row.currency),{font:bold,size:9});else text('Yazıyla tutar, eksik bilgiler tamamlandığında hesaplanır.',{size:9,color:red});
    const notes=Array.isArray(row.noteLines)?row.noteLines.filter(n=>!n.removed&&n.text):[{text:row.notes||''}];for(const note of notes){if(!note.text)continue;y-=5;text(note.text,{size:9});}
    if(sourceRef?.xmlFields?.length){section(sourceMode?'XML’DEKİ TÜM ALANLAR':'XML’DEN TAŞINAN EK BİLGİLER');text(sourceMode?'Alan yolları, değerler ve nitelikler aşağıda korunur. Gömülü eklerin dosya bilgileri gösterilir; özgün içerik XML dosyasında saklıdır.':'Aşağıdaki ek ayrıntılar kaynak XML’den alınmıştır. Açıklamalardaki kaynak ay, seçilen fatura ayına çevrilir.',{size:8,color:muted});
      for(const field of sourceRef.xmlFields){if(!sourceMode&&(/^\/Invoice\/(?:ID|UUID|IssueDate|IssueTime|Note|TaxTotal|WithholdingTaxTotal|LegalMonetaryTotal|DocumentCurrencyCode|ProfileID|InvoiceTypeCode|UBLExtensions)(?:\/|$)/.test(field.path)))continue;
        if(!sourceMode&&/^\/Invoice\/InvoiceLine\/(?:InvoicedQuantity|LineExtensionAmount|Price|TaxTotal|WithholdingTaxTotal)(?:\/|$)/.test(field.path))continue;
        if(!sourceMode&&/^\/Invoice\/InvoiceLine\/(?:Note$|Item\/(?:Name|Description)$)/.test(field.path))continue;
        const descriptive=!/\/Accounting(?:Customer|Supplier)Party\//.test(field.path)&&/\/(?:Description|Note|Value)$/.test(field.path),v=!sourceMode&&descriptive?shiftMonth(field.value,sourceRef.invoiceDate.slice(0,7),project.period):field.value;ensure(30);text(field.path,{size:6.5,color:muted});text(v,{size:8});y-=5;
      }
    }
    section('KONTROL BİLGİSİ');text(sourceMode?'Bu PDF, yüklenen önceki ay XML’inin okunabilir görünümüdür. Özgün fatura dosyası XML’dir.':'Bu belge yalnızca kontrol önizlemesidir. Resmi fatura değildir; İzibiz’e gönderilmemiştir. Yeni ayın matrahı Excel’den, müşteri ve hizmet bilgileri önceki XML / kaynak belgeden hazırlanmıştır.',{size:8,color:muted});text('Kaynak dosya: '+(row.referencePdf||'EŞLEŞMEDİ'),{size:7.5,color:muted});
    doc.getPages().forEach((p,i)=>{p.drawText(sourceMode?'XML GÖRÜNÜMÜ':'KONTROL ÖNİZLEMESİ',{x:105,y:390,size:34,font:bold,rotate:degrees(35),color:rgb(.7,.75,.77),opacity:.13});p.drawText('Pusula · Kontrol amaçlı · '+(i+1)+' / '+doc.getPageCount(),{x:left,y:25,size:7.5,font:regular,color:muted});});
    return doc.save();
  }
  function distributeLineAmounts(items,target){
    if(!Number.isSafeInteger(target)||target<0||!items.length||items.some(l=>!Number.isSafeInteger(l.amountCents)||l.amountCents<0))throw Error('Dağıtım için geçerli satır tutarları gerekli.');
    const total=items.reduce((sum,l)=>sum+BigInt(l.amountCents),0n);if(total<=0n)throw Error('Dağıtım için önceki toplam pozitif olmalı.');const parts=items.map((l,index)=>{const n=BigInt(l.amountCents)*BigInt(target);return {index,amount:Number(n/total),remainder:n%total};});let left=target-parts.reduce((sum,p)=>sum+p.amount,0);for(const p of [...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left--)break;p.amount++;}return items.map((l,i)=>({...l,amountCents:parts[i].amount,unitPrice:parts[i].amount/100/l.quantity}));
  }
  const core=Object.freeze({decodeXmlBytes,parseXmlReference,shiftMonth,normalize,cents,validPeriod,validDate,yellow,red,channel,monthEnd,periodFromHeader,previousPeriod,resolveColumn,readAmount,amountChanged,amountState,rowIdentity,deletionKey,mergeRows,issues,importSheet,readBackup,pdfRows,parseReference,displayDate,inputDate,previewInvoiceNo,titleKey,titleScore,matchReference,applyReference,lineTotal,totals,moneyWords,localIssues,createPreviewPdf,createTemplatePreviewPdf,pdfRuleLines,distributeLineAmounts});
  globalThis.SWSalesPreparationCore=core;
  if(typeof document==='undefined')return;
  function boot(){
    const page=document.getElementById('page-satis-kesme'),workspace=window.SWWorkspace;
    if(!page||workspace?.companyId!=='PUSULA'){document.querySelector('[data-page="satis-kesme"]')?.remove();page?.remove();return;}
    const $=id=>document.getElementById(id),storage=workspace.storage,key='pusula_sales_preparation_v1';document.querySelector('[data-si-pusula-nav]')?.removeAttribute('hidden');
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const empty=()=>({version:1,company:'PUSULA',period:today.slice(0,7),invoiceDate:'',rows:[],source:null,removedKeys:[]});
    let originalReadFailed=false;
    let project=empty(),workbook=null,workbookName='',sheetName='',filter='all',pdfs=[],references=[],pdfErrors=[],dbPromise=null,busy=false,editId=null,draft=null,pendingConfirm=null,lastRemovedId=null;
    const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100):'Okunamadı';
    const number=n=>Number.isFinite(n)?new Intl.NumberFormat('tr-TR',{maximumFractionDigits:10}).format(n):'';
    const periodLabel=p=>new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(new Date(p+'-15T12:00:00Z'));
    const names=()=>new Set(pdfs.map(f=>f.name));
    const changed=r=>Boolean(r.referencePdf&&amountChanged(r));
    const problems=r=>{const out=localIssues(r,project,names());if(r.matchReason==='title_variant'&&!r.matchVerified)out.push('Ticari unvanın yazımı farklı; yan yana kaynak belgede kontrol et.');if(!r.referencePdf&&r.matchReason==='no_baseline'){const i=out.indexOf('Önceki ay belge eşleşmesi bekleniyor.');if(i>=0)out[i]=displayDate(previousPeriod(project.period)+'-01')+' tarihli asıl fatura belgeyi bulunamadı.';}if(r.referenceConflict)out.push('Aynı PDF birden fazla Excel satırına eşleşiyor; şubeyi kontrol et.');return out;};
    const ready=r=>!problems(r).length&&(!changed(r)||r.changeConfirmed);
    function notice(text,error=false){$('siNotice').hidden=false;$('siNotice').textContent=text;$('siNotice').dataset.error=String(error);}
    function setBusy(value){busy=value;for(const id of ['siPickWorkbook','siPickPdfs','siInvoiceDate','siClear'])$(id).disabled=value;if(!value)renderRows();}
    function save(){if(originalReadFailed){$('siSaveState').textContent='Önceki kayıt korunuyor; yedek açılmadan veya liste temizlenmeden üzerine yazılmaz.';return;}try{storage.setItem(key,JSON.stringify(project,(key,value)=>key==='candidateNames'?undefined:value));$('siSaveState').textContent='Hazırlık bu tarayıcıya kaydedildi';}catch{notice('Tarayıcıda yer kalmadı. Hazırlık yedeğini indirerek çalışmanı koru.',true);}}
    function database(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(workspace.databaseName('PusulaSalesPreparation'),1);req.onupgradeneeded=()=>req.result.createObjectStore('references');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Dosya saklama alanı açılamadı.'));req.onblocked=()=>reject(Error('Dosya alanı başka sekmede kullanılıyor.'));});return dbPromise;}
    async function store(action,id,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('references',action==='read'?'readonly':'readwrite'),s=tx.objectStore('references'),req=action==='read'?s.get(id):action==='clear'?s.clear():s.put(value,id);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(Error('Dosyalar tarayıcıya kaydedilemedi.'));tx.onabort=tx.onerror;});}
    function confirmAction(title,text){$('siConfirmTitle').textContent=title;$('siConfirmText').textContent=text;$('siConfirm').showModal();return new Promise(resolve=>pendingConfirm=resolve);}
    function finishConfirm(value){$('siConfirm').close();pendingConfirm?.(value);pendingConfirm=null;}
    $('siConfirmOk').onclick=()=>finishConfirm(true);$('siConfirmCancel').onclick=()=>finishConfirm(false);$('siConfirm').addEventListener('cancel',()=>finishConfirm(false));
    function setTheme(value){page.dataset.theme=value==='light'?'light':'dark';
    page.querySelectorAll('[data-si-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.siTheme===page.dataset.theme)));try{storage.setItem('pusula_sales_preparation_theme',page.dataset.theme);}catch{}}
    page.querySelector('.si-help').addEventListener('toggle',()=>{try{storage.setItem('pusula_sales_help_open',page.querySelector('.si-help').open?'1':'0');}catch{}});
    page.querySelectorAll('[data-si-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.siTheme));
    function render(){
      $('siInvoiceDate').value=displayDate(project.invoiceDate);$('siPeriodTitle').textContent=project.invoiceDate?periodLabel(project.period):'Kesilecek tarihi seç';
      $('siWorkbookNote').textContent=workbookName?(workbookName+(sheetName?' · '+sheetName:'')+(project.source?' · '+project.source.header:'')):'Tek Excel yeterli.';
      $('siPdfNote').textContent=pdfs.length?pdfs.length+' kaynak dosya · '+references.length+' dosya okundu'+(pdfErrors.length?' · '+pdfErrors.length+' dosya okunamadı':''):'Birden fazla XML bırakabilirsin.';
      $('siReferences').hidden=!pdfs.length;$('siReferenceCount').textContent='('+pdfs.length+')';
      $('siReferenceList').innerHTML=pdfs.map((f,i)=>{const ref=references.find(r=>r.name===f.name),error=pdfErrors.find(r=>r.name===f.name);return '<div class="si-reference"><div>'+escape(f.name)+'<small>'+(ref?escape(displayDate(ref.invoiceDate))+' · '+ref.lineItems.length+' hizmet satırı'+(ref.warnings.length?' · '+escape(ref.warnings.join(' ')):' · Bilgiler okundu'):escape(error?.error||'Okunuyor…'))+'</small></div><button class="si-text-btn" type="button" data-si-pdf="'+i+'">belgeyi aç</button></div>';}).join('');
      renderRows();
    }
    function renderRows(){
      const active=project.rows.filter(r=>!r.removed),q=normalize($('siSearch').value),shown=project.rows.filter(r=>(filter==='removed'?r.removed:!r.removed)&&(filter!=='changed'||changed(r)&&!r.changeConfirmed)&&(filter!=='missing'||!ready(r))&&(!q||normalize([r.excelCustomer,r.customer,r.vkn,r.ssno].join(' ')).includes(q)));
      $('siTotal').textContent=active.length;$('siListCount').textContent=active.length;$('siBeginning').textContent=active.filter(ready).length;$('siMonthEnd').textContent=active.filter(r=>changed(r)&&!r.changeConfirmed).length;$('siPending').textContent=active.filter(r=>!ready(r)).length;const deleted=project.rows.filter(r=>r.removed).length;const deletedButton=page.querySelector('[data-si-filter="removed"]');deletedButton.textContent='Silinenler'+(deleted?' ('+deleted+')':'');
      $('siRows').innerHTML=shown.map(r=>{const errors=problems(r),state=r.removed?'removed':changed(r)&&!r.changeConfirmed?'changed':ready(r)?'ready':'pending',label=state==='removed'?'Silindi':errors.length?(r.matchReason==='no_baseline'?'Ayın ilk günündeki fatura yok':r.candidateNames?.length?'Eşleşme kontrol edilmeli':'Kontrol gerekli'):state==='changed'?'Tutar değişti':'Bilgiler hazır';return '<article class="si-row" data-state="'+state+'" aria-label="Excel satırı '+r.sourceRow+'"><span class="si-row-index">'+r.sourceRow+'</span><button type="button" class="si-row-title" data-si-detail="'+r.id+'">'+escape(r.customer)+'<small>'+escape(r.vkn?'VKN '+r.vkn:r.excelCustomer||r.branch)+(r.ssno?' · SS NO '+escape(r.ssno):'')+'</small></button><div class="si-row-money"><strong>'+money(r.amountCents)+' '+escape(r.currency)+'</strong><small>Excel · '+escape(displayDate(project.invoiceDate))+'</small>'+(r.referencePdf?'<small>Önceki fatura: '+money(r.previousAmountCents)+'</small>':'')+(changed(r)?'<em>'+(r.amountCents-r.previousAmountCents>0?'+':'')+money(r.amountCents-r.previousAmountCents)+' fark</em>':'')+'</div><div class="si-row-status"><strong>'+label+'</strong><small>'+escape(errors[0]||(changed(r)?(r.changeConfirmed?'Excel tutarı doğrulandı.':'Yeni fatura Excel tutarıyla hazırlandı.'):'Unvan, adres, vergi no ve hizmetler XML / kaynak belgeden alındı.'))+'</small></div><div class="si-row-tools">'+(r.removed?'<button class="si-text-btn" type="button" data-si-restore="'+r.id+'">Geri al</button>':'<button class="si-text-btn" type="button" data-si-detail="'+r.id+'">Önizle</button>'+(changed(r)&&!r.changeConfirmed&&!errors.length?'<button class="si-text-btn" type="button" data-si-accept="'+r.id+'">Fark doğru</button>':'')+'<button class="si-text-btn si-danger" type="button" data-si-remove="'+r.id+'">Sil</button>')+'</div></article>';}).join('');
      $('siEmpty').hidden=shown.length>0;$('siEmpty').querySelector('h3').textContent=project.rows.length?'Bu görünümde fatura yok.':'Dosyaları eklediğinde faturalar burada hazırlanır.';
      $('siEmpty').querySelector('p').textContent=project.rows.length?'Başka bir filtre seç veya aramayı temizle.':'Yukarıdaki iki alan yeterli; başka bir Excel yüklemene gerek yok.';
      const lastRemoved=project.rows.find(r=>r.removed&&r.id===lastRemovedId)||[...project.rows].reverse().find(r=>r.removed);$('siUndoLast').hidden=!lastRemoved;if(lastRemoved){lastRemovedId=lastRemoved.id;$('siUndoLast').textContent='Geri al: '+lastRemoved.customer;}
      $('siSaveBackup').disabled=!project.rows.length;$('siClear').disabled=busy||!(project.rows.length||pdfs.length||workbook||project.invoiceDate||originalReadFailed);
      $('siListFoot').textContent=project.source?'Yeni tutarlar: '+project.source.header+' · Karşılaştırma: '+periodLabel(previousPeriod(project.period))+' fatura matrahı · Varsayılan Ticari - Satış. kaynak belgedeki Temel / Tevkifat bilgisi korunur.':'';
    }
    function columns(sheet){const X=window.XLSX,range=X.utils.decode_range(sheet['!ref']||'A1');let customer,branch,channelColumn;for(let r=0;r<=Math.min(7,range.e.r);r++)for(let c=0;c<=Math.min(range.e.c,30);c++){const n=normalize(sheet[X.utils.encode_cell({r,c})]?.v);if(['ticariunvan','cariunvan','caritamunvan','cari','unvan'].includes(n)&&customer===undefined)customer=c;if(['hastaneadi','sube','subeadi'].includes(n)&&branch===undefined)branch=c;if(['faturaturu','kanal','efaturassno'].includes(n)&&channelColumn===undefined)channelColumn=c;}if(customer===undefined)throw Error('Excel’de TİCARİ UNVAN başlığı bulunamadı.');return {customer,branch:branch??customer,channel:channelColumn,period:project.period};}
    function chooseSheet(){if(!workbook)return '';const candidates=[];for(const name of workbook.SheetNames){try{const options=columns(workbook.Sheets[name]);resolveColumn(workbook.Sheets[name],project.period,window.XLSX);candidates.push({name,options});}catch{}}if(candidates.length===1)return candidates[0].name;const previous=candidates.find(x=>x.name===project.source?.sheet);if(previous)return previous.name;const expected=candidates.find(x=>x.name==='2025-2026');if(expected)return expected.name;throw Error(candidates.length?'Birden fazla satış listesi bulundu. Yalnızca güncel satış sayfasını içeren Excel’i kullan.':'Ticari unvan ve seçilen ayın Bakım-Kira sütunu aynı sayfada bulunamadı.');}
    function reconcile(){
      const matches=project.rows.map(row=>matchReference(row,references,project.period)),uses=new Map();
      matches.forEach((m,i)=>{const r=project.rows[i],chosen=r.referenceManuallySelected?m.candidates.find(c=>c.ref.name===r.referencePdf&&(c.ref.invoiceDate===m.baselineDate||c.ref.sourceKind==='xml'))?.ref:m.selected;if(chosen)uses.set(chosen.name,(uses.get(chosen.name)||0)+1);});
      project.rows=project.rows.map((row,i)=>{const m=matches[i],manual=row.referenceManuallySelected?m.candidates.find(c=>c.ref.name===row.referencePdf&&(c.ref.invoiceDate===m.baselineDate||c.ref.sourceKind==='xml'))?.ref:null;let selected=manual||m.selected;if(selected&&uses.get(selected.name)>1&&!manual)selected=null;let next=row;
        if(selected){if(row.manualEdited&&row.referencePdf===selected.name){next={...row,withholdingReason:row.withholdingReason||selected.withholdingReason};for(const [field,snapshot,source] of [['customer','referenceTitle','title'],['address','referenceAddress','address'],['vkn','referenceVkn','vkn']])if(normalize(row[field])===normalize(row[snapshot])){next[field]=selected[source];next[snapshot]=selected[source];}}if(!(row.manualEdited&&row.referencePdf===selected.name)){next=applyReference(row,selected);if(row.legacyReviewed&&row.referencePdf===selected.name){for(const field of ['customer','vkn','address','ssno','taxType','withholdingCode','withholdingRate','withholdingReason'])if(row[field])next[field]=row[field];if(row.description&&normalize(row.description)!==normalize(next.description)){if(next.lineItems.length===1){next.lineItems[0].description=row.description;next.description=row.description;}else next.noteLines.push({text:row.description,source:'Önceki hazırlık açıklaması',removed:false});}if(row.notes&&!normalize(next.notes).includes(normalize(row.notes)))next.noteLines.push({text:row.notes,source:'Önceki hazırlık notu',removed:false});next.notes=next.noteLines.filter(l=>!l.removed).map(l=>l.text).join('\n');next.manualEdited=true;next.legacyReviewed=false;}if(row.referencePdf===selected.name&&row.previousAmountCents===selected.amountCents){next.changeConfirmed=row.changeConfirmed;next.referenceReviewed=row.referenceReviewed;}}next.referenceManuallySelected=!!manual;next.referenceConflict=(uses.get(selected.name)||0)>1;}
        else if(row.referencePdf){next={...row,referencePdf:'',referenceDate:'',referenceVkn:'',referenceAddress:'',referenceSsno:'',lineItems:[],referenceReviewed:false,autoMatched:false,manualEdited:false,referenceManuallySelected:false};}
        next.matchReason=manual?'matched':m.reason;next.candidateNames=selected?[]:m.candidates.map(c=>c.ref.name);return next;
      });save();render();
    }
    function rebuild(){
      if(!workbook||!validDate(project.invoiceDate,project.period)){if(workbook)notice('Üstten kesilecek tarihi seç; Excel’deki ayı otomatik bulacağım.');return;}
      try{sheetName=chooseSheet();const opts=columns(workbook.Sheets[sheetName]),result=importSheet(workbook.Sheets[sheetName],opts,window.XLSX),previous=project.rows;
        project.rows=result.rows.map(r=>{const old=previous.find(p=>p.sourceRow===r.sourceRow&&normalize(p.excelCustomer||p.customer)===normalize(r.customer));let next={...r,excelCustomer:r.customer,excelSsno:r.ssno,excelPreviousAmountCents:r.previousAmountCents};if(old){for(const key of ['removed','manualEdited','matchVerified','changeConfirmed','previousAmountCents','previousCurrency','previousPeriod','amountConfirmed','referenceManuallySelected','referencePdf','referenceDate','referenceReviewed','referenceTitle','referenceVkn','referenceAddress','referenceSsno','referenceInvoice','referenceDescription','referenceWrittenAmount','sellerText','sourceKind','referenceWarnings','monthSourcePeriod','monthTargetPeriod','bankLines','customer','vkn','address','taxOffice','description','notes','noteLines','lineItems','taxType','scenario','withholdingCode','withholdingRate','withholdingReason','ssno'])if(old[key]!==undefined)next[key]=old[key];if(old.sourcePeriod!==r.sourcePeriod||old.sourceAmountCents!==r.sourceAmountCents){const samePeriod=old.sourcePeriod===r.sourcePeriod;next.manualEdited=samePeriod&&old.manualEdited===true;next.referenceManuallySelected=samePeriod&&old.referenceManuallySelected===true;if(next.manualEdited&&next.lineItems?.length===1){next.lineItems=next.lineItems.map(l=>({...l,amountCents:r.amountCents,unitPrice:r.amountCents/100/l.quantity}));}next.referenceReviewed=false;next.changeConfirmed=false;}}
          next.removed=!!(next.removed||project.removedKeys.includes(deletionKey(next)));return next;});
        project.source={name:workbookName,sheet:sheetName,column:window.XLSX.utils.encode_col(result.binding.column),header:result.binding.header,period:project.period};reconcile();notice(result.rows.length+' fatura satırı hazırlandı. '+result.counts.earchive+' E-Arşiv, '+result.counts.monthEnd+' ay sonu kaydı ve '+result.counts.zero+' sıfır tutar dışarıda.');
      }catch(error){project.rows.forEach(r=>{r.sourcePeriod='';r.amountCents=null;r.changeConfirmed=false;});save();render();notice(error.message,true);}
    }
    $('siInvoiceDate').onchange=()=>{const input=$('siInvoiceDate').value,date=inputDate(input);if(input&&!date){notice('Geçerli bir tarih seç.',true);return;}project.invoiceDate=date;if(date)project.period=date.slice(0,7);if(workbook)rebuild();else{reconcile();if(project.rows.length&&project.rows.some(r=>r.sourcePeriod!==project.period))notice('Bu ayın güncel Excel’ini ekle. Eski ayın tutarları kullanılmaz.',true);}save();render();};
    async function loadWorkbook(file){if(!file||busy)return;if(!/\.xlsx?$/i.test(file.name)||file.size>25*1024*1024){notice('25 MB’tan küçük .xls veya .xlsx dosyası seç.',true);return;}setBusy(true);try{const bytes=await file.arrayBuffer(),next=window.XLSX.read(bytes,{type:'array',cellStyles:true,cellFormula:true});workbook=next;workbookName=file.name;await store('write','workbook',{name:file.name,data:bytes});rebuild();render();}catch(error){notice(error.message||'Excel okunamadı.',true);}finally{setBusy(false);}}
    async function readPdf(file){
      if(/\.xml$/i.test(file.name))return parseXmlReference(decodeXmlBytes(await file.arrayBuffer()),file.name);
      const task=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}),doc=await task.promise,pages=[];
      try{if(doc.numPages>100)throw Error('PDF 100 sayfadan büyük; faturaları ayrı XML / PDF dosyaları olarak ekle.');for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),text=await p.getTextContent();pages.push(pdfRows(text.items));}if(pages.flat().length<5)throw Error('PDF görüntü olarak taranmış; metin okunamadı. Metin içeren fatura belgeyini ekle.');return parseReference(pages,file.name);}finally{await doc.destroy();}
    }
    async function parseFiles(){references=[];pdfErrors=[];for(let i=0;i<pdfs.length;i++){notice('XML / PDF dosyaları okunuyor · '+(i+1)+' / '+pdfs.length);try{references.push(await readPdf(pdfs[i]));}catch(error){pdfErrors.push({name:pdfs[i].name,error:error.message||'Kaynak dosya okunamadı.'});}await new Promise(resolve=>setTimeout(resolve,0));}reconcile();if(pdfErrors.length)notice(pdfErrors.length+' dosya okunamadı. Okunan kaynak belgeler bölümünde nedenlerini görebilirsin; bu dosyaların bilgileri tahmin edilmedi.',true);else notice(references.length+' kaynak dosya okundu. Eşleşen satırların müşteri, hizmet ve not bilgileri otomatik dolduruldu.');}
    async function loadPdfs(files){if(!files.length||busy)return;if(files.some(f=>!/\.(xml|pdf)$/i.test(f.name)||f.size>25*1024*1024)){notice('Her dosya XML veya PDF ve en fazla 25 MB olmalı.',true);return;}setBusy(true);try{const map=new Map(pdfs.map(f=>[f.name,f]));for(const file of files){const h=new TextDecoder('latin1').decode(await file.slice(0,1024).arrayBuffer());if(/\.pdf$/i.test(file.name)&&!h.includes('%PDF-'))throw Error('Seçilen dosyalardan biri geçerli PDF değil.');if(map.has(file.name)){const old=map.get(file.name),a=new Uint8Array(await old.arrayBuffer()),b=new Uint8Array(await file.arrayBuffer());if(a.length===b.length&&a.every((v,i)=>v===b[i]))continue;throw Error('Aynı isimde farklı bir kaynak dosya var. Mevcut referans korunuyor; yeni dosyayı farklı adla ekle.');}map.set(file.name,file);}const next=[...map.values()];if(next.length>500||next.reduce((s,f)=>s+f.size,0)>150*1024*1024)throw Error('En fazla 500 dosya ve toplam 150 MB eklenebilir.');const stored=[];for(const f of next)stored.push({name:f.name,type:f.type,lastModified:f.lastModified,data:await f.arrayBuffer()});await store('write','PUSULA',stored);pdfs=next;await parseFiles();}catch(error){notice(error.message,true);}finally{setBusy(false);render();}}
    $('siPickWorkbook').onclick=()=>$('siWorkbookFile').click();$('siWorkbookFile').onchange=e=>{const file=e.target.files[0];e.target.value='';loadWorkbook(file);};$('siPickPdfs').onclick=()=>$('siPdfFiles').click();$('siPdfFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';loadPdfs(files);};
    for(const target of page.querySelectorAll('[data-si-drop]')){for(const type of ['dragenter','dragover'])target.addEventListener(type,e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';target.classList.add('si-dragover');}});target.addEventListener('dragleave',e=>{if(!target.contains(e.relatedTarget))target.classList.remove('si-dragover');});target.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();target.classList.remove('si-dragover');const files=[...e.dataTransfer.files];if(target.dataset.siDrop==='workbook'){if(files.length!==1){notice('Excel alanına tek bir güncel Excel bırak.',true);return;}loadWorkbook(files[0]);}else loadPdfs(files);});}
    page.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});page.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();notice('Dosyaları yukarıdaki Excel veya XML alanına bırak.',true);}});
    async function sourceBytes(file){const ref=references.find(r=>r.name===file.name);if(ref?.sourceKind!=='xml')return file.arrayBuffer();return createPreviewPdf({...ref,customer:ref.title,referencePdf:ref.name,sourceRow:1,sourceKind:'xml'},{invoiceDate:ref.invoiceDate,period:ref.invoiceDate.slice(0,7)},{PDFLib:window.PDFLib,loadFonts:window.loadTurkishFonts,sourceReference:ref,sourceMode:true});}
    async function openPdf(file){if(!file){notice('Bu PDF bu cihazda bulunamadı.',true);return;}const url=URL.createObjectURL(/\.xml$/i.test(file.name)?new Blob([await sourceBytes(file)],{type:'application/pdf'}):file),a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    $('siReferenceList').onclick=e=>{const b=e.target.closest('[data-si-pdf]');if(b)openPdf(pdfs[Number(b.dataset.siPdf)]);};$('siOpenReference').onclick=()=>openPdf(pdfs.find(f=>f.name===draft?.referencePdf));
    page.querySelectorAll('[data-si-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.siFilter;page.querySelectorAll('[data-si-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderRows();});$('siSearch').oninput=renderRows;
    function comparison(row){const state=!row.referencePdf?'pending':amountState(row);$('siAmountComparison').dataset.state=state;$('siAmountComparison').innerHTML='<strong>Yeni fatura: '+money(row.amountCents)+' '+escape(row.currency)+' · Excel’den</strong><p>Önceki fatura matrahı: '+money(row.referencePdf?row.previousAmountCents:null)+(changed(row)?' · Fark: '+money(row.amountCents-row.previousAmountCents):row.referencePdf?' · Tutar aynı':'')+'</p><p>'+escape(row.referencePdf?'Kaynak: '+row.referencePdf:'Önceki ayın eşleşen belgeyi bekleniyor.')+'</p>';}
    function renderLineEditor(){draft.lineItems||=[];$('siLineItems').innerHTML=draft.lineItems.map((l,i)=>'<div class="si-line-item" data-si-line="'+i+'"><label>Satır '+(i+1)+' · Hizmet açıklaması<textarea data-line-field="description" rows="2">'+escape(l.description)+'</textarea></label><label>Miktar<input data-line-field="quantity" inputmode="decimal" value="'+escape(number(l.quantity))+'"></label><label>Birim<input data-line-field="unit" value="'+escape(l.unit)+'"></label><label>Birim fiyat<input data-line-field="unitPrice" inputmode="decimal" value="'+escape(number(l.unitPrice))+'"></label><label>KDV %<input data-line-field="vatRate" inputmode="decimal" value="'+escape(number(l.vatRate))+'"></label><div class="si-line-sum"><span data-line-sum>'+money(l.amountCents)+' '+escape(draft.currency)+'</span><button type="button" class="si-text-btn si-danger" data-si-line-remove="'+i+'">Satırı sil</button></div></div>').join('');$('siDistribute').hidden=draft.lineItems.length<2||lineTotal(draft)===draft.amountCents;}
    function renderNoteEditor(){draft.noteLines||=[];$('siNoteLines').innerHTML=draft.noteLines.map((l,i)=>'<div class="si-note" data-si-note="'+i+'" data-removed="'+!!l.removed+'"><label>'+escape(l.source||'Not')+'<textarea data-note-text rows="2" '+(l.removed?'disabled':'')+'>'+escape(l.text)+'</textarea></label><button class="si-text-btn '+(l.removed?'':'si-danger')+'" data-si-note-toggle="'+i+'" type="button">'+(l.removed?'Geri al':'Sil')+'</button></div>').join('');}
    function readDraft(){if(!draft)return;const f=$('siDetailForm');for(const name of ['customer','vkn','taxOffice','address','ssno','taxType','withholdingCode','withholdingRate','withholdingReason'])draft[name]=clean(f.elements[name].value,4000);draft.scenario=draft.taxType==='basic'?'TEMELFATURA':draft.taxType==='sale'?'TICARIFATURA':draft.scenario||'TICARIFATURA';
      draft.lineItems=[...$('siLineItems').querySelectorAll('[data-si-line]')].map(el=>{const read=name=>el.querySelector('[data-line-field="'+name+'"]').value,q=decimal(read('quantity')),price=decimal(read('unitPrice')),rate=decimal(read('vatRate'));return {description:String(read('description')).trim(),quantity:q,unit:clean(read('unit'),100),unitPrice:price,vatRate:rate,amountCents:q!==null&&price!==null&&q>0&&price>=0?Math.round(q*price*100):null};});
      $('siNoteLines').querySelectorAll('[data-si-note]').forEach(el=>{draft.noteLines[Number(el.dataset.siNote)].text=String(el.querySelector('[data-note-text]').value).trim();});draft.description=draft.lineItems.map(l=>l.description).join('\n');draft.notes=draft.noteLines.filter(l=>!l.removed).map(l=>l.text).join('\n');
    }
    function refreshDetail(){if(!draft)return;comparison(draft);const errors=problems(draft),t=totals(draft);$('siDetailIssues').dataset.ok=String(!errors.length);$('siDetailIssues').innerHTML=errors.length?'<ul>'+errors.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>':'Unvan, vergi no, adres, SS NO ve hizmet toplamı kontrol edildi. Kaydet ile bu satırın kontrolünü tamamlayabilirsin.';
      $('siWrittenAmount').textContent=t?'YALNIZ: '+moneyWords(t.payable,draft.currency):'Yazıyla tutar, hizmet satırları ve KDV / tevkifat bilgileri tamamlanınca hesaplanır.';
      $('siDetailTotals').innerHTML=t?[['Matrah',t.net],['KDV',t.vat],...(t.withholding?[['Tevkifat',t.withholding]]:[]),['Ödenecek',t.payable]].map(([k,v])=>'<div><span>'+k+'</span><strong>'+money(v)+' '+escape(draft.currency)+'</strong></div>').join(''):'';
      page.querySelectorAll('[data-si-withholding]').forEach(el=>el.hidden=draft.taxType!=='withholding');$('siLineItems').querySelectorAll('[data-si-line]').forEach((el,i)=>el.querySelector('[data-line-sum]').textContent=money(draft.lineItems[i]?.amountCents)+' '+draft.currency);$('siDistribute').hidden=draft.lineItems.length<2||lineTotal(draft)===draft.amountCents;queuePreview();
    }
    let previewToken=0,previewTimer=null,sourcePreviewName='';
    async function renderPdfPages(bytes,target,token){const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;try{const width=Math.max(240,target.clientWidth||$('siDraftPages').clientWidth||520),fragment=document.createDocumentFragment();for(let n=1;n<=doc.numPages;n++){if(token!==previewToken)return;const p=await doc.getPage(n),base=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(2,window.devicePixelRatio||1)*width/base.width}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=previewZoom+'%';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','PDF sayfası '+n);await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;fragment.append(canvas);}if(token===previewToken)target.replaceChildren(fragment);}finally{await doc.destroy();}}
    async function renderPreviews(){if(!draft||!$('siDetail').open)return;const token=++previewToken,snapshot=JSON.parse(JSON.stringify(draft));$('siPreviewStatus').textContent='Önizlemeler hazırlanıyor…';const tasks=[(async()=>{const sourceFile=pdfs.find(f=>f.name===snapshot.referencePdf),sourceReference=references.find(r=>r.name===snapshot.referencePdf);const bytes=await createPreviewPdf(snapshot,project,{PDFLib:window.PDFLib,loadFonts:window.loadTurkishFonts,pdfjsLib:window.pdfjsLib,sourcePdf:sourceFile&&sourceReference?.sourceKind!=='xml'?await sourceFile.arrayBuffer():null,sourceReference});if(token===previewToken)await renderPdfPages(bytes,$('siDraftPages'),token);})()];
      const file=pdfs.find(f=>f.name===snapshot.referencePdf);if(!file){$('siSourcePages').textContent='Önceki PDF eşleştiğinde burada açılır.';sourcePreviewName='';}else if(sourcePreviewName!==file.name){tasks.push((async()=>{await renderPdfPages(await sourceBytes(file),$('siSourcePages'),token);if(token===previewToken)sourcePreviewName=file.name;})());}
      const results=await Promise.allSettled(tasks);if(token===previewToken){const failed=results.find(r=>r.status==='rejected');$('siPreviewStatus').textContent=failed?'Önizleme açılamadı: '+failed.reason.message:'Önceki PDF ile yeni tarih ve Excel tutarıyla hazırlanan önizlemeyi karşılaştır. İzibiz’e gönderilmedi.';}
    }
    function queuePreview(){clearTimeout(previewTimer);if($('siDetail').open)previewTimer=setTimeout(renderPreviews,700);}
    let previewZoom=100;page.querySelectorAll('[data-si-zoom]').forEach(b=>b.onclick=()=>{previewZoom=Math.max(100,Math.min(250,previewZoom+Number(b.dataset.siZoom)));$('siZoomValue').textContent=previewZoom+'%';page.querySelectorAll('.si-pdf-pages canvas').forEach(canvas=>canvas.style.width=previewZoom+'%');});
    $('siDownloadXml').onclick=()=>{const file=pdfs.find(f=>f.name===draft?.referencePdf);if(file&&/\.xml$/i.test(file.name))file.arrayBuffer().then(bytes=>download(bytes,file.name,'application/xml'));};
    $('siDownloadSource').onclick=async()=>{try{const file=pdfs.find(f=>f.name===draft?.referencePdf);if(file)download(await sourceBytes(file),'Onceki-Fatura.pdf','application/pdf');}catch(error){notice(error.message,true);}};
    $('siDownloadDraft').onclick=async()=>{try{readDraft();const ref=references.find(r=>r.name===draft?.referencePdf),file=pdfs.find(f=>f.name===draft?.referencePdf);const bytes=await createPreviewPdf(draft,project,{PDFLib:window.PDFLib,loadFonts:window.loadTurkishFonts,pdfjsLib:window.pdfjsLib,sourceReference:ref,sourcePdf:file&&ref?.sourceKind!=='xml'?await file.arrayBuffer():null});download(bytes,'Yeni-Fatura-'+project.period+'.pdf','application/pdf');}catch(error){notice(error.message,true);}};
    $('siUpdatePreview').onclick=()=>{readDraft();refreshDetail();renderPreviews();};
    page.querySelectorAll('[data-si-pdf-view]').forEach(b=>b.onclick=()=>{page.querySelector('.si-pdf-compare').dataset.mobileView=b.dataset.siPdfView;page.querySelectorAll('[data-si-pdf-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
    $('siDetail').addEventListener('close',()=>{previewToken++;clearTimeout(previewTimer);sourcePreviewName='';});
    function openDetail(id){const row=project.rows.find(r=>r.id===id);if(!row||row.removed)return;editId=id;draft=JSON.parse(JSON.stringify(row));const form=$('siDetailForm');$('siDetailTitle').textContent=draft.customer;$('siDetailSource').textContent='EXCEL SATIRI '+row.sourceRow+' · KONTROL AMAÇLI';$('siDetailDate').textContent=displayDate(project.invoiceDate)||'Tarih seçilmedi';
      for(const name of ['customer','vkn','taxOffice','address','ssno','taxType','withholdingCode','withholdingRate','withholdingReason'])form.elements[name].value=draft[name]||(['taxType'].includes(name)?'sale':'');
      $('siSourceIdentity').textContent='Excel ticari unvanı: '+(draft.excelCustomer||draft.customer)+(draft.referenceDate?' · Önceki fatura: '+displayDate(draft.referenceDate):'');
      const candidates=matchReference({...row,referenceReviewed:false},references,project.period).candidates.map(c=>c.ref).filter(ref=>(ref.invoiceDate===previousPeriod(project.period)+'-01'||ref.sourceKind==='xml'));$('siCandidateList').innerHTML=candidates.length&&(candidates.length>1||!row.referencePdf)?'<details><summary>'+(!row.referencePdf?'Kaynak eşleşmesini incele':'Kaynak eşleşmesini incele')+'</summary><p>Adres, SS NO, hizmet açıklaması ve fatura türüne bakarak seç. Aynı vergi numarasındaki farklı şubeler birleştirilmez.</p>'+candidates.map(ref=>'<button class="si-candidate" type="button" data-si-choose="'+escape(ref.name)+'">'+escape(ref.title)+'<small>VKN '+escape(ref.vkn)+' · SS NO '+escape(ref.ssno||'Belirtilmemiş')+' · Matrah '+money(ref.amountCents)+' · '+(ref.taxType==='withholding'?'Tevkifat':ref.taxType==='basic'?'Temel - Satış':'Ticari - Satış')+'</small><small>'+escape(ref.address)+'</small><small>'+escape(ref.lineItems.map(l=>l.description).join(' / '))+'</small></button>').join('')+'</details>':!row.referencePdf?'<p>Bu unvan için '+escape(periodLabel(previousPeriod(project.period)))+' belgeyi bulunamadı. XML alanına eklediğinde bilgiler otomatik hazırlanır.</p>':'';
      const ref=references.find(r=>r.name===row.referencePdf);$('siSourceHeading').textContent=ref?.sourceKind==='xml'?'Önceki ay · XML’den PDF görünümü':'Önceki ay · Özgün PDF';$('siRawText').textContent=ref?.rawText||'';$('siDownloadXml').hidden=ref?.sourceKind!=='xml';$('siOpenReference').disabled=!pdfs.some(f=>f.name===row.referencePdf);renderLineEditor();renderNoteEditor();refreshDetail();if(!$('siDetail').open)$('siDetail').showModal();renderPreviews();
    }
    $('siRows').onclick=e=>{const detail=e.target.closest('[data-si-detail]');if(detail){openDetail(detail.dataset.siDetail);return;}const button=e.target.closest('[data-si-remove],[data-si-restore],[data-si-accept]');if(!button)return;const row=project.rows.find(r=>r.id===(button.dataset.siRemove||button.dataset.siRestore||button.dataset.siAccept));if(!row)return;if(button.hasAttribute('data-si-accept')){if(problems(row).length){openDetail(row.id);return;}row.changeConfirmed=true;row.referenceReviewed=true;row.matchVerified=true;}else{row.removed=button.hasAttribute('data-si-remove');const id=deletionKey(row);project.removedKeys=project.removedKeys.filter(k=>k!==id);if(row.removed){project.removedKeys.push(id);lastRemovedId=row.id;notice('Satır silindi. Hemen alttaki Geri al düğmesiyle geri getirebilirsin.');}}save();renderRows();};
    $('siUndoLast').onclick=()=>{const row=project.rows.find(r=>r.id===lastRemovedId&&r.removed);if(!row)return;row.removed=false;project.removedKeys=project.removedKeys.filter(k=>k!==deletionKey(row));lastRemovedId=null;save();renderRows();notice('Satır geri alındı.');};
    $('siCandidateList').onclick=e=>{const b=e.target.closest('[data-si-choose]');if(!b)return;const ref=references.find(r=>r.name===b.dataset.siChoose),index=project.rows.findIndex(r=>r.id===editId);if(!ref||index<0)return;project.rows[index]={...applyReference(project.rows[index],ref),referenceManuallySelected:true,matchVerified:true,manualEdited:false,candidateNames:[]};save();reconcile();openDetail(editId);};
    $('siDetailForm').addEventListener('input',()=>{readDraft();refreshDetail();});$('siDetailForm').addEventListener('change',()=>{readDraft();refreshDetail();});
    $('siLineItems').onclick=e=>{const b=e.target.closest('[data-si-line-remove]');if(!b)return;readDraft();draft.lineItems.splice(Number(b.dataset.siLineRemove),1);draft.description=draft.lineItems.map(l=>l.description).join('\n');renderLineEditor();refreshDetail();};
    $('siNoteLines').onclick=e=>{const b=e.target.closest('[data-si-note-toggle]');if(!b)return;readDraft();const note=draft.noteLines[Number(b.dataset.siNoteToggle)];note.removed=!note.removed;draft.notes=draft.noteLines.filter(n=>!n.removed).map(n=>n.text).join('\n');renderNoteEditor();refreshDetail();};
    $('siAddNote').onclick=()=>{readDraft();draft.noteLines.push({text:'',source:'Ek not',removed:false});renderNoteEditor();};$('siAddLine').onclick=()=>{readDraft();draft.lineItems.push({description:'',quantity:1,unit:'Adet',unitPrice:null,amountCents:null,vatRate:draft.lineItems[0]?.vatRate??null});renderLineEditor();refreshDetail();};
    $('siDistribute').onclick=()=>{readDraft();const total=lineTotal(draft);if(!total||!Number.isSafeInteger(draft.amountCents))return;draft.lineItems=distributeLineAmounts(draft.lineItems,draft.amountCents);renderLineEditor();refreshDetail();};
    page.querySelectorAll('[data-si-close]').forEach(b=>b.onclick=()=>$('siDetail').close());
    $('siDetailForm').onsubmit=e=>{e.preventDefault();readDraft();const index=project.rows.findIndex(r=>r.id===editId);if(index<0)return;draft.manualEdited=true;draft.matchVerified=true;draft.referenceReviewed=!problems(draft).length;draft.changeConfirmed=draft.referenceReviewed;draft.matchVerified=draft.referenceReviewed;project.rows[index]=draft;save();renderRows();$('siDetail').close();notice(draft.referenceReviewed?'Kontrol kaydedildi. Bu satır Excel tutarıyla hazırlandı; İzibiz’e gönderilmedi.':'Değişiklikler kaydedildi. Okunamayan veya farklı bilgiler satırda işaretli kalıyor.');draft=null;};
    function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
    $('siSaveBackup').onclick=()=>download(JSON.stringify(project,null,2),'Pusula-Hazirlik-'+project.period+'.json');$('siRestoreBackup').onclick=()=>$('siBackupFile').click();
    $('siBackupFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>10*1024*1024){notice('Hazırlık yedeği en fazla 10 MB olabilir.',true);return;}try{const next=readBackup(JSON.parse(await file.text()));if(project.rows.length&&!await confirmAction('Hazırlık yedeğini aç','Mevcut liste yedekteki hazırlıkla değişecek. Devam edilsin mi?'))return;project=next;originalReadFailed=false;save();render();notice('Hazırlık yedeği açıldı. Bu cihazda olmayan kaynak XML / PDF dosyalarıi ekleyebilirsin.');}catch(error){notice(error.message,true);}};
    $('siClear').onclick=async()=>{if(busy||!await confirmAction('Tümünü Temizle','Bu sayfadaki Excel, XML/PDF dosyaları, hazırlanan faturalar, silinen satırlar, arama ve tarih tamamen temizlenecek.'))return;setBusy(true);try{await store('clear');storage.removeItem(key);originalReadFailed=false;project=empty();workbook=null;workbookName='';sheetName='';pdfs=[];references=[];pdfErrors=[];draft=null;editId=null;lastRemovedId=null;filter='all';previewToken++;clearTimeout(previewTimer);sourcePreviewName='';$('siSearch').value='';for(const id of ['siWorkbookFile','siPdfFiles','siBackupFile'])$(id).value='';for(const id of ['siSourcePages','siDraftPages','siRawText','siCandidateList'])$(id).replaceChildren();page.querySelectorAll('[data-si-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.siFilter==='all')));if($('siDetail').open)$('siDetail').close();save();render();notice('Bu sayfadaki dosyalar ve hazırlık tamamen temizlendi.');}catch(error){notice('Temizleme tamamlanamadı: '+error.message,true);}finally{setBusy(false);render();}};
    try{const raw=storage.getItem(key);if(raw)project=readBackup(JSON.parse(raw));}catch{originalReadFailed=true;notice('Önceki hazırlık okunamadı. Mevcut kayıt üzerine yazılmadı; hazırlık yedeğini açabilirsin.',true);}
    try{setTheme(storage.getItem('pusula_sales_preparation_theme')||'dark');page.querySelector('.si-help').open=storage.getItem('pusula_sales_help_open')!=='0';}catch{setTheme('dark');}render();setBusy(true);
    (async()=>{try{const [saved,files]=await Promise.all([store('read','workbook'),store('read','PUSULA')]);if(saved?.data){workbook=window.XLSX.read(saved.data,{type:'array',cellStyles:true,cellFormula:true});workbookName=saved.name;}pdfs=(files||[]).map(f=>f instanceof Blob&&typeof f.name==='string'?f:f?.data instanceof ArrayBuffer?new File([f.data],f.name,{type:f.type||'application/pdf',lastModified:f.lastModified}):null).filter(Boolean);if(pdfs.length)await parseFiles();if(workbook&&project.rows.length)rebuild();else render();}catch{notice('Kaynak dosyalar bu cihazda açılamadı; hazırlık kayıtları korunuyor.',true);}finally{setBusy(false);}})();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
