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
    for(let c=3;c<=range.e.c;c++){
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
  const rowIdentity=row=>[normalize(row.branch),normalize(row.customer),clean(row.ssno)].join('|');
  const deletionKey=row=>rowIdentity(row)+'|row:'+row.sourceRow;
  function mergeRows(next,previous){
    const old=new Map(),counts=new Map();
    for(const row of previous){const k=rowIdentity(row);old.set(k,old.has(k)?null:row);}
    for(const row of next){const k=rowIdentity(row);counts.set(k,(counts.get(k)||0)+1);}
    return next.map(row=>{const k=rowIdentity(row),before=old.get(k);if(!before||counts.get(k)!==1)return row;
      const keep={};for(const field of ['searchAlias','vkn','address','description','notes','taxType','withholdingCode','withholdingRate','referencePdf','removed'])keep[field]=before[field];
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
    if(!row.referencePdf||!refs.has(row.referencePdf))list.push('Referans PDF’i ekle ve bu satıra bağla.');
    if(!row.referenceReviewed)list.push('Açıklama, SS NO ve özel notları karşılaştır.');
    if(row.ssnoRequired&&!row.ssno)list.push('SS NO eksik.');
    if(row.taxType==='withholding'&&(!row.withholdingCode||!row.withholdingRate))list.push('Tevkifat kodu ve oranını tamamla.');
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
      const branch=clean(value(r,options.branch),300),customer=clean(value(r,options.customer),600),rawChannel=clean(value(r,options.channel),300),kind=channel(rawChannel);
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
      const row={id,sourceRow:value.sourceRow,sourceCell:clean(value.sourceCell,30),amountCents:Number.isSafeInteger(value.amountCents)?value.amountCents:null,sourceAmountCents:Number.isSafeInteger(value.sourceAmountCents)?value.sourceAmountCents:null,currency:['TRY','USD','EUR','GBP'].includes(value.currency)?value.currency:'TRY',displayRounded:value.displayRounded===true,channel:['einvoice','pending'].includes(value.channel)?value.channel:'pending',schedule:'beginning',taxType:value.taxType==='withholding'?'withholding':'sale'};
      for(const key of ['branch','customer','searchAlias','vkn','address','description','notes','withholdingCode','withholdingRate','referencePdf','ssno'])row[key]=clean(value[key],['description','notes'].includes(key)?4000:1200);
      for(const key of ['ssnoRequired','amountConfirmed','referenceReviewed','changeConfirmed','removed'])row[key]=value[key]===true;
      row.sourcePeriod=validPeriod(value.sourcePeriod)?value.sourcePeriod:'';row.previousPeriod=validPeriod(value.previousPeriod)?value.previousPeriod:'';row.previousAmountCents=Number.isSafeInteger(value.previousAmountCents)?value.previousAmountCents:null;row.previousCurrency=['TRY','USD','EUR','GBP'].includes(value.previousCurrency)?value.previousCurrency:'TRY';
      if(!row.sourcePeriod)row.amountConfirmed=false;
      return row;
    }).sort((a,b)=>a.sourceRow-b.sourceRow);
    const source=input.source&&typeof input.source==='object'?{name:clean(input.source.name,300),sheet:clean(input.source.sheet,100),column:clean(input.source.column,10),header:clean(input.source.header,300),period:validPeriod(input.source.period)?input.source.period:''}:null;
    return {version:1,company:'PUSULA',period:input.period,invoiceDate:validDate(input.invoiceDate,input.period)?input.invoiceDate:'',rows:rows.filter(r=>!monthEnd(r.branch,r.customer)),source,removedKeys:Array.isArray(input.removedKeys)?[...new Set(input.removedKeys.filter(x=>typeof x==='string'&&x.length<2000))].slice(0,1000):[]};
  }
  const core=Object.freeze({normalize,cents,validPeriod,validDate,yellow,red,channel,monthEnd,periodFromHeader,previousPeriod,resolveColumn,readAmount,amountChanged,amountState,rowIdentity,deletionKey,mergeRows,issues,importSheet,readBackup});
  globalThis.SWSalesPreparationCore=core;
  if(typeof document==='undefined')return;
  function boot(){
    const page=document.getElementById('page-satis-kesme'),workspace=window.SWWorkspace;
    if(!page||workspace?.companyId!=='PUSULA'){
      document.querySelector('[data-page="satis-kesme"]')?.remove();page?.remove();return;
    }
    const $=id=>document.getElementById(id),storage=workspace.storage,key='pusula_sales_preparation_v1';
    document.querySelector('[data-si-pusula-nav]')?.removeAttribute('hidden');
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const empty=period=>({version:1,company:'PUSULA',period,invoiceDate:'',rows:[],source:null,removedKeys:[]});
    let project=empty(today.slice(0,7)),workbook=null,workbookName='',filter='all',view='sources',editId=null,busy=false;
    let pdfs=[],dbPromise=null,pendingConfirm=null;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100):'Eksik';
    const periodTitle=period=>new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(new Date(period+'-15T12:00:00Z'));
    const refNames=()=>new Set(pdfs.map(f=>f.name));
    function notice(message,error=false){$('siNotice').hidden=false;$('siNotice').textContent=message;$('siNotice').dataset.error=String(error);}
    function confirmAction(title,message){
      $('siConfirmTitle').textContent=title;$('siConfirmText').textContent=message;$('siConfirm').showModal();
      return new Promise(resolve=>{pendingConfirm=resolve;});
    }
    function finishConfirm(result){$('siConfirm').close();const resolve=pendingConfirm;pendingConfirm=null;resolve?.(result);}
    $('siConfirmOk').onclick=()=>finishConfirm(true);$('siConfirmCancel').onclick=()=>finishConfirm(false);$('siConfirm').addEventListener('cancel',()=>finishConfirm(false));
    function save(){
      try{storage.setItem(key,JSON.stringify(project));$('siSaveState').textContent='Hazırlık bu tarayıcıya kaydedildi';}
      catch{$('siSaveState').textContent='Kaydedilemedi — yedeğini indir';notice('Tarayıcıya kayıt yapılamadı. Çalışmanı korumak için Yedeği indir’i kullan.',true);}
    }
    function database(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(workspace.databaseName('PusulaSalesPreparation'),1);req.onupgradeneeded=()=>req.result.createObjectStore('references');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('PDF saklama alanı açılamadı.'));req.onblocked=()=>reject(Error('Diğer açık sekmeleri kapatıp yeniden dene.'));});
      return dbPromise;
    }
    async function pdfStore(action,value){
      // ArrayBuffer storage works in Safari/WebKit versions that cannot clone
      // File/Blob objects into IndexedDB. Keep the original bytes and filename.
      let payload=value;
      if(action==='write'){
        payload=[];for(const file of value)payload.push({name:file.name,type:file.type,lastModified:file.lastModified,data:await file.arrayBuffer()});
      }
      const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('references',action==='read'?'readonly':'readwrite'),store=tx.objectStore('references');let req;
        if(action==='read')req=store.get('PUSULA');else if(action==='write')store.put(payload,'PUSULA');else store.delete('PUSULA');
        tx.oncomplete=()=>resolve(req?.result||[]);tx.onerror=()=>reject(Error('PDF’ler bu cihazda saklanamadı.'));tx.onabort=tx.onerror;
      });
    }
    async function workbookStore(action,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('references',action==='read'?'readonly':'readwrite'),store=tx.objectStore('references'),req=action==='read'?store.get('workbook'):store.put(value,'workbook');tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(Error('Excel saklanamadı.'));tx.onabort=tx.onerror;});}
    function setTheme(theme){page.dataset.theme=theme==='light'?'light':'dark';page.querySelectorAll('[data-si-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.siTheme===page.dataset.theme)));try{storage.setItem('pusula_sales_preparation_theme',page.dataset.theme);}catch{}}
    page.querySelectorAll('[data-si-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.siTheme));
    function setView(next){view=next;page.querySelectorAll('[data-si-panel]').forEach(p=>p.hidden=p.dataset.siPanel!==view);page.querySelectorAll('[data-si-view]').forEach(b=>{if(b.dataset.siView===view)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});renderChecks();renderPreview();}
    page.querySelectorAll('[data-si-view]').forEach(b=>b.onclick=()=>setView(b.dataset.siView));
    function renderPeriod(){
      $('siPeriod').value=project.period;$('siInvoiceDate').value=project.invoiceDate;$('siInvoiceDate').min='2000-01-01';
      $('siInvoiceDate').max='2199-12-31';
      $('siPeriodTitle').textContent=periodTitle(project.period);$('siArchiveFolder').textContent='Pusula - '+periodTitle(project.period);
    }
    function renderReferences(){
      $('siReferences').hidden=!pdfs.length;$('siReferenceCount').textContent=pdfs.length+' PDF';$('siPdfNote').textContent=pdfs.length?pdfs.length+' referans PDF bu tarayıcıda saklanıyor.':'Birden fazla PDF seçebilir veya bu kutuya sürükleyebilirsin.';
      $('siReferenceList').innerHTML=pdfs.map((f,i)=>'<div class="si-reference"><span>'+escape(f.name)+'</span><button type="button" class="si-text-btn" data-si-pdf="'+i+'">İncele ↗</button></div>').join('');
    }
    function renderChecks(){
      const refs=refNames(),rows=project.rows.filter(r=>!r.removed);
      const cards=[['Dönem matrahları',rows.filter(r=>!r.amountConfirmed||!Number.isSafeInteger(r.amountCents)||r.amountCents<=0).length,'satır kontrol bekliyor'],['Referans ve açıklamalar',rows.filter(r=>!r.description||!r.referenceReviewed||!refs.has(r.referencePdf)).length,'satır kontrol bekliyor'],['Cari ve şube bilgileri',rows.filter(r=>!/^\d{10,11}$/.test(r.vkn)||!r.address).length,'satırda eksik bilgi'],['E-Fatura ve SS NO',rows.filter(r=>r.channel!=='einvoice'||r.ssnoRequired&&!r.ssno).length,'satır doğrulama bekliyor'],['Tevkifat bilgileri',rows.filter(r=>r.taxType==='withholding'&&(!r.withholdingCode||!r.withholdingRate)).length,'satırda eksik bilgi'],['İzibiz bağlantısı',rows.length,'satır için cari doğrulaması bağlı değil']];
      $('siCheckSummary').innerHTML=cards.map(([title,count,label])=>'<div class="si-check-card"><strong>'+title+'</strong><span><b>'+count+'</b> '+label+'</span></div>').join('');
    }
    function renderRows(){
      const refs=refNames(),query=normalize($('siSearch').value),all=project.rows,rows=all.filter(r=>!r.removed);
      $('siTotal').textContent=rows.length;$('siListCount').textContent=rows.length;$('siBeginning').textContent=rows.filter(r=>['matched','checked'].includes(amountState(r))).length;$('siMonthEnd').textContent=rows.filter(r=>amountState(r)==='changed').length;$('siPending').textContent=rows.length;
      const shown=(filter==='removed'?all.filter(r=>r.removed):rows).filter(r=>(filter==='all'||filter==='removed'||filter==='changed'&&amountState(r)==='changed'||filter==='missing'&&issues(r,project,refs).length>1)&&(!query||normalize(r.branch+' '+r.customer+' '+r.ssno).includes(query)));
      const head='<div class="si-table-head" aria-hidden="true"><div>SIRA</div><div>ŞUBE</div><div>CARİ / UNVAN</div><div>MATRAH</div><div>TUTAR KONTROLÜ</div><div>DURUM</div><div>İŞLEMLER</div></div>';
      $('siRows').innerHTML=shown.length?head+shown.map(r=>{
        const missing=issues(r,project,refs).length-1,state=amountState(r),amountLabel={changed:'TUTAR FARKI',matched:'EŞLEŞTİ',checked:'DOĞRULANDI',pending:'KONTROL ET',missing:'EKSİK'}[state];
        return '<article class="si-row" aria-label="Excel satırı '+r.sourceRow+'"><div data-label="EXCEL SATIRI">'+r.sourceRow+'</div><div data-label="ŞUBE">'+escape(r.branch)+'</div><div data-label="CARİ / UNVAN" class="si-row-customer">'+escape(r.customer)+'</div><div data-label="MATRAH" class="si-amount">'+money(r.amountCents)+'<small>'+escape(r.currency)+'</small></div><div data-label="TUTAR KONTROLÜ"><span class="si-pill '+(['matched','checked'].includes(state)?'si-pill-mint':'si-pill-amber')+'">'+amountLabel+'</span></div><div data-label="DURUM"><span class="si-pill '+(missing?'si-pill-amber':'si-pill-mint')+'">'+(missing?missing+' eksik':'Cari doğrulaması')+'</span></div><div class="si-row-tools">'+(r.removed?'<button type="button" class="si-text-btn" data-si-restore="'+r.id+'">Geri al</button>':'<button type="button" class="si-text-btn" data-si-detail="'+r.id+'" aria-label="'+escape(r.branch)+' ayrıntısını aç">İncele →</button><button type="button" class="si-text-btn si-danger" data-si-remove="'+r.id+'">Sil</button>')+'</div></article>';
      }).join(''):'';
      $('siEmpty').hidden=shown.length>0;
      if(all.length&&!shown.length){$('siEmpty').querySelector('h3').textContent='Bu görünümde satır yok';$('siEmpty').querySelector('p').textContent='Farklı bir grup seç veya aramayı temizle. Sildiklerini Silinenler bölümünden geri alabilirsin.';$('siEmptyImport').hidden=true;}
      else{$('siEmpty').querySelector('h3').textContent='Yeni döneme temiz bir başlangıç';$('siEmpty').querySelector('p').textContent='Bu bölüm Excel’den alınan faturaların inceleme listesidir. Fatura tarihini seçip güncel Excel’ini ekleyerek başla.';$('siEmptyImport').hidden=false;}
      $('siClear').disabled=!all.length;$('siSaveBackup').disabled=!all.length;
      $('siWorkbookNote').textContent=project.source?[project.source.name,project.source.sheet,project.source.column+' · '+project.source.header].filter(Boolean).join(' / '):'.xls veya .xlsx · Bu kutuya sürükleyebilirsin.';
      $('siListFoot').textContent=project.source?'Kaynak: '+project.source.sheet+' · '+project.source.column+' · '+project.source.header+' | Fatura tarihi: '+project.invoiceDate+' · Matrahlar yalnızca ilgili ayın sütunundan alınır.':'Yalnızca Pusula · Ticari E-Fatura · Hazırlık aşaması';
      const selected=$('siPreviewRow').value;$('siPreviewRow').innerHTML='<option value="">Bir satır seç</option>'+rows.map(r=>'<option value="'+r.id+'">'+r.sourceRow+' · '+escape(r.branch)+'</option>').join('');if(rows.some(r=>r.id===selected))$('siPreviewRow').value=selected;
      renderChecks();renderPreview();
    }
    function renderPreview(){
      const row=project.rows.find(r=>!r.removed&&r.id===$('siPreviewRow').value),target=$('siPreview');
      if(!row){target.className='si-panel si-preview-empty';target.textContent='Listeden bir satır seç. Burada resmi fatura yerine hazırlık özeti gösterilir.';return;}
      const fields=[['Şube',row.branch],['Cari / tam unvan',row.customer],['Fatura tarihi',project.invoiceDate||'Henüz seçilmedi'],['Matrah · '+row.currency,money(row.amountCents)],['Vergi numarası',row.vkn||'Eksik'],['Senaryo / tür',row.taxType==='withholding'?'Ticari - Tevkifat':'Ticari - Satış'],['Şube adresi',row.address||'Eksik'],['SS NO',row.ssno||'Belirtilmedi'],['Hizmet açıklamaları',row.description||'Eksik'],['Özel notlar',row.notes||'Henüz eklenmedi'],['Referans PDF',row.referencePdf||'Seçilmedi']];
      target.className='si-panel si-preview-paper';target.innerHTML='<div class="si-preview-top"><div><h3>PUSULA</h3><p>HAZIRLIK ÖZETİ · FATURA DEĞİLDİR</p></div><span class="si-label">'+escape(periodTitle(project.period))+'</span></div><div class="si-preview-data">'+fields.map(([title,value],i)=>'<div class="'+(i>=8?'si-span':'')+'"><strong>'+title+'</strong><span>'+escape(value)+'</span></div>').join('')+'</div><div class="si-callout"><p>KDV, tevkifat ve ödenecek toplam bu aşamada hesaplanmaz. Referans kontrolleri tamamlanmadan resmi fatura önizlemesi hazırlanmaz.</p></div>';
    }
    function render(){renderPeriod();renderReferences();renderRows();}
    page.querySelectorAll('[data-si-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.siFilter;page.querySelectorAll('[data-si-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderRows();});
    $('siSearch').oninput=renderRows;$('siPreviewRow').onchange=renderPreview;
    $('siInvoiceDate').onchange=()=>{
      const next=$('siInvoiceDate').value,nextPeriod=next.slice(0,7);
      if(next&&(!validPeriod(nextPeriod)||!validDate(next,nextPeriod))){notice('Geçerli bir fatura tarihi seç.',true);renderPeriod();return;}
      const changed=next&&nextPeriod!==project.period;project.invoiceDate=next;if(next)project.period=nextPeriod;
      if(changed){project.rows.forEach(r=>{r.amountCents=null;r.sourcePeriod='';r.amountConfirmed=false;r.referenceReviewed=false;r.changeConfirmed=false;});}
      if(workbook){mapColumns(false);if(changed&&project.rows.length)rebuildRows(true);}
      else if(changed&&project.rows.length)notice('Yeni ayın tutarlarını okumak için güncel Excel listesini ekle. Eski ayın tutarları kullanılmadı.',true);
      save();render();
    };
    function pickWorkbook(){setView('sources');$('siWorkbookFile').click();}
    $('siPickWorkbook').onclick=pickWorkbook;$('siEmptyImport').onclick=pickWorkbook;
    async function loadWorkbook(file){
      if(!file)return;
      if(!/\.(xlsx|xls)$/i.test(file.name)||file.size>25*1024*1024){notice('25 MB’tan küçük bir .xls veya .xlsx dosyası seç.',true);return;}
      try{const bytes=await file.arrayBuffer();workbook=window.XLSX.read(bytes,{type:'array',cellStyles:true,cellFormula:true});workbookName=file.name;
        try{await workbookStore('write',{name:file.name,data:bytes});}catch{notice('Excel bu oturumda açıldı; tarayıcıya saklanamadı. Yenilediğinde tekrar ekle.',true);}
        $('siSheet').replaceChildren(...workbook.SheetNames.map(name=>new Option(name,name)));$('siSheet').value=workbook.SheetNames.includes('2025-2026')?'2025-2026':workbook.SheetNames[0];$('siMapping').hidden=false;mapColumns(true);
      }catch{workbook=null;notice('Excel okunamadı. Dosyanın .xls veya .xlsx biçiminde olduğundan emin ol.',true);}
    };
    $('siWorkbookFile').onchange=e=>{const file=e.target.files[0];e.target.value='';loadWorkbook(file);};
    function sheetHeader(sheet,c){
      for(let r=0;r<8;r++){const cell=sheet[window.XLSX.utils.encode_cell({r,c})];if(cell?.v!==undefined&&typeof cell.v==='string')return clean(cell.v,75);}
      return '';
    }
    function mapColumns(reset=true){
      if(!workbook)return;const sheet=workbook.Sheets[$('siSheet').value],range=window.XLSX.utils.decode_range(sheet['!ref']||'A1');
      if(range.e.c>1000){notice('Fatura listesinin olduğu sayfayı seç.',true);return;}
      for(const id of ['siBranchColumn','siCustomerColumn','siChannelColumn']){
        const selected=$(id).value;$(id).replaceChildren(...Array.from({length:range.e.c+1},(_,c)=>new Option(window.XLSX.utils.encode_col(c)+' · '+sheetHeader(sheet,c),String(c))));
        $(id).value=!reset&&selected?selected:String(['siBranchColumn','siCustomerColumn','siChannelColumn'].indexOf(id));
      }
      mappingPreview();
    }
    function mappingOptions(){
      if(!validDate(project.invoiceDate,project.period))throw Error('Önce üstte fatura tarihini seç. Ay sütunu bu tarihe göre bulunacak.');
      const binding=resolveColumn(workbook.Sheets[$('siSheet').value],project.period,window.XLSX);
      $('siAmountColumn').replaceChildren(new Option(window.XLSX.utils.encode_col(binding.column)+' · '+binding.header,String(binding.column)));
      return {period:project.period,branch:Number($('siBranchColumn').value),customer:Number($('siCustomerColumn').value),channel:Number($('siChannelColumn').value),amount:binding.column};
    }
    function mappingPreview(){
      if(!workbook)return;
      try{const options=mappingOptions();if(new Set([options.branch,options.customer,options.channel,options.amount]).size!==4)throw Error('Şube, cari ve kanal sütunlarını kontrol et.');
        const result=importSheet(workbook.Sheets[$('siSheet').value],options,window.XLSX);
        $('siMappingPreview').textContent=project.period+' otomatik seçildi · '+result.rows.length+' satır · '+result.counts.earchive+' E-Arşiv ve '+result.counts.monthEnd+' ay sonu kaydı dışarıda · '+result.counts.zero+' sıfır matrah dışarıda · '+result.counts.blank+' satırda bu ayın matrahı eksik. Renklendirme gerekmez.';
        $('siImportRows').disabled=!result.rows.length;
        if(!result.rows.length)notice('İlgili ay sütunu bulundu fakat hazırlanacak tutar yok. Önceki aya dönülmedi.',true);
      }catch(error){$('siAmountColumn').replaceChildren(new Option('Eşleşen dönem bulunamadı',''));$('siMappingPreview').textContent=error.message;$('siImportRows').disabled=true;notice(error.message,true);}
    }
    function rebuildRows(showDifference=false){
      try{const options=mappingOptions(),result=importSheet(workbook.Sheets[$('siSheet').value],options,window.XLSX),old=project.rows;
        project.rows=mergeRows(result.rows,old).map(r=>({...r,removed:Boolean(r.removed||project.removedKeys.includes(deletionKey(r)))}));
        project.source={name:workbookName,sheet:$('siSheet').value,column:window.XLSX.utils.encode_col(options.amount),header:result.binding.header,period:project.period};
        save();render();const differences=project.rows.filter(r=>!r.removed&&amountState(r)==='changed'),missing=project.rows.filter(r=>!r.removed&&amountState(r)==='missing');notice(project.period+' sütunundan '+result.rows.length+' hazırlık satırı alındı. Fatura tarihi '+project.invoiceDate+'. '+differences.length+' tutar farkı, '+missing.length+' eksik/geçersiz matrah.');if(showDifference&&(differences.length||missing.length))openDetail((differences[0]||missing[0]).id);return true;
      }catch(error){notice(error.message,true);return false;}
    }
    $('siSheet').onchange=()=>mapColumns(true);for(const id of ['siBranchColumn','siCustomerColumn','siChannelColumn'])$(id).onchange=mappingPreview;
    $('siImportRows').onclick=()=>{if(workbook&&rebuildRows(true)){$('siMapping').hidden=true;setView('checks');}};
    $('siPickPdfs').onclick=()=>$('siPdfFiles').click();
    async function loadPdfs(files){
      if(!files.length)return;if(busy)return;
      if(files.some(f=>!/\.pdf$/i.test(f.name)||f.size>25*1024*1024)){notice('Her dosya PDF biçiminde ve en fazla 25 MB olmalı.',true);return;}
      if(pdfs.length+files.length>500){notice('En fazla 500 referans PDF ekleyebilirsin.',true);return;}
      busy=true;$('siPickPdfs').disabled=true;
      try{
        const map=new Map(pdfs.map(f=>[f.name,f]));
        for(const file of files){const header=new Uint8Array(await file.slice(0,1024).arrayBuffer());if(!new TextDecoder('latin1').decode(header).includes('%PDF-'))throw Error('Seçilen dosyalardan biri geçerli bir PDF değil.');
          if(map.has(file.name)){
            const old=map.get(file.name);
            if(old.size===file.size){const [a,b]=await Promise.all([old.arrayBuffer(),file.arrayBuffer()]),other=new Uint8Array(b);if(new Uint8Array(a).every((value,i)=>value===other[i]))continue;}
            throw Error('Aynı adlı farklı bir PDF var. Dosya adını ayırıp yeniden ekle; mevcut referans değiştirilmedi.');
          }map.set(file.name,file);
        }
        const next=[...map.values()];if(next.reduce((sum,f)=>sum+f.size,0)>150*1024*1024)throw Error('Referans PDF’lerin toplam boyutu 150 MB’ı aşamaz.');await pdfStore('write',next);pdfs=next;render();notice(pdfs.length+' PDF eklendi. Satır ayrıntısından doğru referansı seçip içeriğini karşılaştır.');
      }catch(error){notice(error.message||'PDF’ler saklanamadı.',true);}finally{busy=false;$('siPickPdfs').disabled=false;}
    };
    $('siPdfFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';loadPdfs(files);};
    for(const target of page.querySelectorAll('[data-si-drop]')){
      for(const name of ['dragenter','dragover'])target.addEventListener(name,event=>{
        if(![...event.dataTransfer.types].includes('Files'))return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';target.classList.add('si-dragover');
      });
      target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))target.classList.remove('si-dragover');});
      target.addEventListener('drop',event=>{
        event.preventDefault();event.stopPropagation();target.classList.remove('si-dragover');
        const files=[...event.dataTransfer.files];if(!files.length)return;
        if(target.dataset.siDrop==='workbook'){
          if(files.length!==1){notice('Excel kutusuna tek bir güncel Excel dosyası bırak.',true);return;}
          setView('sources');loadWorkbook(files[0]);
        }else loadPdfs(files);
      });
    }
    page.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files'))event.preventDefault();});
    page.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();notice('Excel’i mavi kutuya, önceki ayın PDF’lerini mor kutuya bırak.',true);}});
    function openReference(file){if(!file){notice('Önce bu satırın referans PDF’ini seç.',true);return;}const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    $('siReferenceList').onclick=e=>{const b=e.target.closest('[data-si-pdf]');if(b)openReference(pdfs[Number(b.dataset.siPdf)]);};
    $('siOpenReference').onclick=()=>openReference(pdfs.find(f=>f.name===$('siDetailForm').elements.referencePdf.value));
    function openDetail(id){
      const row=project.rows.find(r=>r.id===id);if(!row||row.removed)return;editId=id;const form=$('siDetailForm');
      $('siDetailTitle').textContent=row.branch;$('siDetailSource').textContent='EXCEL SATIRI '+row.sourceRow+' · '+row.sourceCell+(row.displayRounded?' · Excel’in iki ondalıklı gösterimi alındı':'');
      form.elements.referencePdf.replaceChildren(new Option('Referans seç',''),...pdfs.map(f=>new Option(f.name,f.name)));
      for(const el of form.elements){if(!el.name)continue;if(el.name==='amount')el.value=Number.isSafeInteger(row.amountCents)?money(row.amountCents):'';else if(el.type==='checkbox')el.checked=row[el.name]===true;else el.value=row[el.name]??'';}
      $('siOpenReference').disabled=!refNames().has(form.elements.referencePdf.value);
      $('siDetailIssues').innerHTML='<ul>'+issues(row,project,refNames()).map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul>';$('siDetail').showModal();refreshDetailIssues();
    }
    $('siRows').onclick=e=>{
      const button=e.target.closest('[data-si-detail]');if(button){openDetail(button.dataset.siDetail);return;}
      const action=e.target.closest('[data-si-remove],[data-si-restore]');if(!action)return;const removed=action.hasAttribute('data-si-remove'),id=action.dataset.siRemove||action.dataset.siRestore,row=project.rows.find(r=>r.id===id);if(!row)return;
      row.removed=removed;const identity=deletionKey(row);project.removedKeys=project.removedKeys.filter(k=>k!==identity);if(removed)project.removedKeys.push(identity);save();renderRows();notice(removed?'Satır kaldırıldı. Silinenler bölümündeki kendi Geri al düğmesiyle geri getirebilirsin.':'Bu satır geri getirildi.');
    };
    page.querySelectorAll('[data-si-close]').forEach(b=>b.onclick=()=>$('siDetail').close());
    $('siDetailForm').onsubmit=e=>{
      e.preventDefault();const row=project.rows.find(r=>r.id===editId);if(!row)return;const form=e.currentTarget,amount=cents(form.elements.amount.value);
      if(amount===null||amount<=0){form.elements.amount.setCustomValidity('Pozitif bir matrah yaz. Örnek: 1.250,50');form.elements.amount.reportValidity();return;}
      for(const name of ['branch','customer','searchAlias','vkn','address','description','notes','ssno','withholdingCode','withholdingRate','referencePdf'])row[name]=clean(form.elements[name].value,['description','notes'].includes(name)?4000:1200);
      row.amountCents=amount;row.currency=form.elements.currency.value;row.schedule=form.elements.schedule.value;row.taxType=form.elements.taxType.value;row.amountConfirmed=form.elements.amountConfirmed.checked;row.referenceReviewed=form.elements.referenceReviewed.checked;row.changeConfirmed=form.elements.changeConfirmed.checked;
      save();renderRows();$('siDetail').close();notice('Hazırlık bilgileri kaydedildi. İzibiz’de herhangi bir kayıt oluşturulmadı.');
    };
    $('siDetailForm').elements.amount.oninput=e=>{e.target.setCustomValidity('');$('siDetailForm').elements.amountConfirmed.checked=false;$('siDetailForm').elements.changeConfirmed.checked=false;};
    $('siDetailForm').elements.currency.onchange=()=>{$('siDetailForm').elements.amountConfirmed.checked=false;$('siDetailForm').elements.changeConfirmed.checked=false;};
    for(const name of ['referencePdf','description','ssno','notes','taxType','withholdingCode','withholdingRate'])$('siDetailForm').elements[name].addEventListener('change',()=>{$('siDetailForm').elements.referenceReviewed.checked=false;});
    function renderAmountComparison(row){
      const state=amountState(row),hasPrevious=Number.isSafeInteger(row.previousAmountCents),changed=amountChanged(row),target=$('siAmountComparison');
      target.dataset.state=state;target.innerHTML='<strong>'+({changed:'Önceki aya göre tutar farklı',matched:'Önceki ayla tutar eşleşti',checked:'Tutar kontrolü tamamlandı',pending:'Matrahını kontrol et',missing:'Geçerli matrah gerekli'}[state])+'</strong><p>Önceki ay: '+(hasPrevious?money(row.previousAmountCents)+' '+escape(row.previousCurrency):'Tutar bulunamadı')+' · Bu ay: '+money(row.amountCents)+' '+escape(row.currency)+'</p>'+(hasPrevious&&Number.isSafeInteger(row.amountCents)&&row.currency===row.previousCurrency?'<p>Fark: '+money(row.amountCents-row.previousAmountCents)+' '+escape(row.currency)+'</p>':'');
      $('siChangeConfirmLabel').hidden=!changed;
    }
    function refreshDetailIssues(){
      const row=project.rows.find(r=>r.id===editId);if(!row||!$('siDetail').open)return;
      const form=$('siDetailForm'),draft={...row,amountCents:cents(form.elements.amount.value),amountConfirmed:form.elements.amountConfirmed.checked,referenceReviewed:form.elements.referenceReviewed.checked,changeConfirmed:form.elements.changeConfirmed.checked};
      $('siOpenReference').disabled=!refNames().has(form.elements.referencePdf.value);
      for(const name of ['branch','customer','vkn','address','description','notes','ssno','withholdingCode','withholdingRate','referencePdf','schedule','taxType','currency'])draft[name]=clean(form.elements[name].value,4000);
      renderAmountComparison(draft);
      $('siDetailIssues').innerHTML='<ul>'+issues(draft,project,refNames()).map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul>';
    }
    $('siDetailForm').addEventListener('input',refreshDetailIssues);$('siDetailForm').addEventListener('change',refreshDetailIssues);
    $('siRunChecks').onclick=()=>{renderChecks();renderRows();notice(project.rows.length?'Hazırlık kontrolleri tamamlandı. Eksikleri satırların İncele bölümünde görebilirsin. İzibiz doğrulaması henüz bağlı değil.':'Önce Excel’den hazırlık listesini oluştur.');};
    function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
    $('siSaveBackup').onclick=()=>{if(project.rows.length)download(JSON.stringify(project,null,2),'Pusula-Hazirlik-'+project.period+'.json','application/json');};
    $('siRestoreBackup').onclick=()=>$('siBackupFile').click();
    $('siBackupFile').onchange=async e=>{
      const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>3*1024*1024){notice('Hazırlık yedeği en fazla 3 MB olabilir.',true);return;}
      try{const next=readBackup(JSON.parse(await file.text()));if(project.rows.length&&!await confirmAction('Hazırlık yedeğini yükle','Mevcut hazırlık satırları yedekteki listeyle değişecek. Devam edilsin mi?'))return;project=next;save();render();notice('Hazırlık yedeği yüklendi. PDF dosyaları yedeğe dahil değildir; gerekirse yeniden ekle.');}catch(error){notice(error instanceof SyntaxError?'Yedek dosyası okunamadı.':error.message,true);}
    };
    $('siClear').onclick=async()=>{
      if(busy)return;if(!await confirmAction('Hazırlık listesini temizle','Bu hazırlık listesi temizlenecek. Referans PDF’ler ve diğer modüllerdeki kayıtlar korunacak.'))return;
      try{const date=project.invoiceDate;project=empty(project.period);project.invoiceDate=date;$('siMapping').hidden=true;save();render();setView('sources');notice('Hazırlık listesi temizlendi.');}catch(error){notice(error.message,true);}
    };
    try{const raw=storage.getItem(key);if(raw)project=readBackup(JSON.parse(raw));}catch{notice('Önceki hazırlık kaydı okunamadı. Kayıt üzerine yazılmadı; varsa yedeğini yükle.',true);}
    try{setTheme(storage.getItem('pusula_sales_preparation_theme')||'dark');}catch{setTheme('dark');}
    render();if(project.rows.length)$('siSaveState').textContent='Kaydedilmiş hazırlık açıldı';
    workbookStore('read').then(saved=>{if(!saved?.data)return;workbook=window.XLSX.read(saved.data,{type:'array',cellStyles:true,cellFormula:true});workbookName=saved.name;$('siSheet').replaceChildren(...workbook.SheetNames.map(n=>new Option(n,n)));$('siSheet').value=workbook.SheetNames.includes(project.source?.sheet)?project.source.sheet:workbook.SheetNames.includes('2025-2026')?'2025-2026':workbook.SheetNames[0];mapColumns(true);}).catch(()=>{});
    pdfStore('read').then(files=>{pdfs=files.map(f=>f instanceof Blob&&typeof f.name==='string'?f:f?.data instanceof ArrayBuffer&&typeof f.name==='string'?new File([f.data],f.name,{type:f.type||'application/pdf',lastModified:f.lastModified}):null).filter(Boolean);render();}).catch(()=>{if(project.rows.some(r=>r.referencePdf))notice('Referans PDF’ler açılamadı. Kaynak dosyaları yeniden ekleyebilirsin.',true);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
