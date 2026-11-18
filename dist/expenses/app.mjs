import {categories,normalize,cents,amount,parseReceipt,issues,duplicateIds,exportReadiness,categoryProfile,buildPurchaseXML,splitFlight,lineAmounts,memoryKey,validExpenseCode} from './model.mjs';
const $=id=>document.getElementById(id),company=window.SW_CONTEXT?.company;
if(!company)throw Error('Önce firma çalışma alanından Masraf Fişleri’ni aç.');
const expenseRulesReady=company.id==='PUSULA';
if(expenseRulesReady)document.body.classList.add('pusula-expenses');
let accountPlan={revision:0,accounts:[]};
if(expenseRulesReady){
 const side=document.createElement('aside');side.className='expense-sidebar';side.setAttribute('aria-label','Modüller');
 side.innerHTML='<div class="expense-sidebar-brand"><img src="/assets/brand/sw-logo.png" alt="" width="46" height="46"><strong>SoyturkWorks<small>Finans ve Muhasebe</small></strong></div><nav><a href="/workspace/PUSULA/" data-page="efatura"><i>▤</i> Gelen E-Fatura Takip</a><a href="/workspace/PUSULA/takip/"><i>☁</i> Gelen E-Fatura İzibiz</a><a href="/workspace/PUSULA/masraf/" class="active" aria-current="page"><i>▧</i> Masraf Fişleri</a><a href="/workspace/PUSULA/" data-page="satis"><i>▤</i> Satış Faturaları</a><a href="/workspace/PUSULA/" data-page="satis-kesme"><i>✎</i> Satış Faturası Kesme</a><a href="/workspace/PUSULA/" data-page="yevmiye"><i>✈</i> Yurt Dışı Yevmiye</a><a href="/workspace/PUSULA/" data-page="mutabakat"><i>♧</i> Cari Mutabakat</a><a href="/workspace/PUSULA/" data-page="notlar"><i>▣</i> Not Alma</a></nav>';
 const icons=['<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8"/>','<path d="M5 16a4 4 0 0 1 0-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 1 9z"/>','<path d="M5 2h10l4 4v16l-3-2-3 2-3-2-3 2-2-1zM9 10h7M9 14h7"/>','<path d="M6 2h9l5 5v15H6zM9 12h8M9 16h8"/>','<path d="M5 3h11l3 3v15H5zM12 10v8M8 14h8"/>','<path d="M2 13 22 3l-7 18-3-6-6 3 2-5z"/>','<path d="M3 12 8 8l4 2 4-2 5 4-6 6-3-2-3 2zM3 12l3 4m15-4-3 4"/>','<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>'];side.querySelectorAll('nav i').forEach((node,index)=>{node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[index]+'</svg>';});
 side.addEventListener('click',e=>{const link=e.target.closest('[data-page]');if(link)try{sessionStorage.setItem('sw:company:v2:PUSULA:fc_active_page',link.dataset.page);}catch{}});
 document.body.prepend(side);
 const list=document.querySelector('.worklist'),grid=document.createElement('div'),left=document.createElement('div'),empty=document.createElement('section');grid.className='expense-work-grid';left.className='expense-left';empty.className='expense-detail-empty panel';empty.innerHTML='<h2>▧ &nbsp; Fiş Detayı</h2><p>Görseli, okunan bilgileri ve muhasebe satırlarını incelemek için listeden bir fiş açın.</p>';const main=document.querySelector('main');main.insertBefore(grid,document.querySelector('.heading'));grid.append(left,empty,document.getElementById('editor'));left.append(document.querySelector('.heading'),document.querySelector('.stats'),document.getElementById('notice'),document.getElementById('progressPanel'),list);list.insertBefore(document.querySelector('.capture'),document.querySelector('.filters'));document.querySelector('.capture .actions').append(document.getElementById('copyLink'));
 const tabs=document.querySelector('.filters [role=group]');tabs.innerHTML='<button data-filter="all" aria-pressed="true">☷ &nbsp; Fişler (Tümü)</button><button data-filter="pending" aria-pressed="false">◷ &nbsp; İnceleme Bekleyen</button><button data-filter="checked" aria-pressed="false">⇧ &nbsp; Logo’ya Aktarılacak</button><button data-filter="exported" aria-pressed="false">✓ &nbsp; Aktarılanlar</button><button data-filter="archived" aria-pressed="false">Arşiv</button>';
 const toolbar=document.createElement('div');toolbar.className='expense-bulkbar';toolbar.innerHTML='<label><input id="expenseSelectAll" type="checkbox"> Tümünü seç</label><select id="expenseBulkAction" aria-label="Toplu işlemler"><option value="">Toplu işlemler</option><option value="backup">Seçilenleri yedekle</option><option value="exported">Logo’da aktarıldı olarak işaretle</option></select><button id="expenseBulkApply" type="button" class="secondary">Uygula</button><span id="expenseSelected">0 seçili</span>';list.insertBefore(toolbar,document.getElementById('receipts'));
 const extra=document.createElement('div');extra.className='expense-extra-filters';extra.innerHTML='<label>Başlangıç <input id="expenseDateFrom" type="date"></label><label>Bitiş <input id="expenseDateTo" type="date"></label><select id="expenseOcrFilter" aria-label="OCR durumu"><option value="">OCR Durumu</option><option value="done">Okundu</option><option value="pending">Bekliyor</option><option value="error">Okuma hatası</option></select>';list.insertBefore(extra,toolbar);
 const filters=document.querySelector('.filters'),capture=document.querySelector('.capture');list.insertBefore(tabs,capture);extra.prepend(document.getElementById('search'));filters.remove();list.insertBefore(toolbar,extra);
 const columnHead=document.createElement('div');columnHead.className='expense-table-head';columnHead.innerHTML='<span></span><span>Fiş</span><span>Tarih</span><span>Firma / İşletme</span><span>Tutar</span><span>OCR</span><span>Durum</span><span></span>';list.insertBefore(columnHead,document.getElementById('receipts'));
 const top=document.querySelector('.topbar'),calendar=document.createElement('button'),notifications=document.createElement('button');calendar.type='button';calendar.className='secondary expense-top-icon';calendar.textContent='▦';calendar.setAttribute('aria-label','Tarih filtresi');calendar.onclick=()=>document.getElementById('expenseDateFrom').focus();notifications.type='button';notifications.className='secondary expense-top-icon';notifications.textContent='🔔';notifications.setAttribute('aria-label','Fiş bildirimleri');notifications.onclick=()=>{const n=document.getElementById('pending').textContent;notice(n+' fiş inceleme bekliyor.');};top.insertBefore(calendar,document.getElementById('expenseTheme'));top.insertBefore(notifications,calendar);
 document.querySelector('#count + span').textContent='Taranan Fiş';document.querySelector('#pending + span').textContent='İnceleme Bekleyen';document.querySelector('#checked + span').textContent='Düzeltilen';document.querySelector('#total + span').textContent='Logo’ya Aktarıma Hazır';document.getElementById('camera').textContent='＋ Fiş Yükle / Tara';document.getElementById('pick').textContent='▧ Dosya Seç';
 const editorHead=document.querySelector('#editor .dialog-head'),nav=document.createElement('div');nav.className='expense-detail-nav';nav.innerHTML='<span id="expenseDetailStatus" class="badge">İncelemede</span><button type="button" id="expensePrev" class="secondary" aria-label="Önceki fiş">‹</button><span id="expenseDetailPosition"></span><button type="button" id="expenseNext" class="secondary" aria-label="Sonraki fiş">›</button>';editorHead.insertBefore(nav,document.getElementById('closeEditor'));const controls=document.querySelector('#editor .source .actions');controls.insertAdjacentHTML('beforeend','<button type="button" id="expenseZoomOut" class="text-button" aria-label="Küçült">⊖</button><button type="button" id="expenseZoomIn" class="text-button" aria-label="Büyüt">⊕</button>');
 const accounting=document.createElement('section');accounting.className='expense-accounting';const lineHead=document.getElementById('addLine').closest('.list-head'),lineHint=lineHead.nextElementSibling;lineHead.querySelector('h3').textContent='Muhasebe Satırları (Logo’ya Aktarılacak)';accounting.append(lineHead,lineHint,document.getElementById('flightSplit'),document.getElementById('lines'),document.querySelector('#editForm .review'),document.getElementById('editSaveState'));document.querySelector('#editor .editor-body').append(accounting);
}
$('company').textContent=company.name;$('workspace').href='/workspace/'+company.id+'/';document.title=company.name+' · Masraf Fişleri';
if(!expenseRulesReady){
  $('openProfiles').style.display='none';
  $('accountImport').style.display='none';
  $('expenseTheme').style.display='none';
  const cardLabel=$('editForm').elements.paymentCard.closest('label');
  cardLabel.style.display='none';
  if(cardLabel.previousElementSibling)cardLabel.previousElementSibling.style.display='none';
}
const base='/api/expenses/'+company.id+'/',escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let receipts=[],profiles={revision:0,categories:{}},filter='all',busy=false,stop=false,editing=null,dirty=false,saving=false,previewURL=null,rotation=0,worker=null,refreshing=false,pdfModule=null,opening=false,expenseZoom=100;
const expenseSelected=new Set();let expenseVisible=[];
const money=(value,currency='TRY')=>Number.isSafeInteger(value)?new Intl.NumberFormat('tr-TR',{style:'currency',currency}).format(value/100):'Tutar okunmadı';
const imageURL=id=>base+'image/'+id;
const normalizeLine=(line,receipt)=>{const oldFlight=line.category==='flight'&&line.vatIncluded===undefined&&Number.isSafeInteger(line.gross)&&Number.isFinite(line.vatRate);const prefix=receipt.number&&receipt.seller?'FİŞ NO:'+receipt.number+' '+receipt.seller:'';return {...line,category:line.category==='bakery'?'meal':line.category,gross:oldFlight?Math.round(line.gross*100/(100+line.vatRate)):line.gross,vatIncluded:oldFlight?false:line.vatIncluded!==false,description:!line.descriptionReady&&prefix&&!line.description?.startsWith('FİŞ NO:')?(prefix+(line.description?' · '+line.description:'')).slice(0,200):line.description,descriptionReady:true};};
const suggestExpenseCode=(receipt,line)=>{if(!expenseRulesReady)return line;const code=profiles.memories?.[memoryKey(receipt,line)];return !line.expenseCode&&code?{...line,expenseCode:code}:line;};
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
async function api(action,body,raw=false){
  const r=await fetch(base+action,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':raw?body.type||'application/octet-stream':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok){if(r.status===401)throw Error('Oturum sona erdi. Kaydedilmemiş düzenlemeyi yedekle; aynı firma bağlantısından yeniden giriş yap.');throw Object.assign(Error(data.error||'İşlem tamamlanamadı.'),{status:r.status});}return data;
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{const data=await api('list');receipts=data.receipts.map(r=>({...r,lines:r.lines.map(l=>normalizeLine(l,r))}));profiles=data.profiles;render();$('sync').textContent='Hesapla eşitlendi · '+new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});}
  finally{refreshing=false;}
}
function render(){
  const active=receipts.filter(r=>!r.archived),duplicates=duplicateIds(receipts),reviewed=r=>r.reviewed&&!issues(r).length&&!duplicates.has(r.id);
  $('count').textContent=active.length;$('checked').textContent=active.filter(reviewed).length;$('pending').textContent=active.filter(r=>!reviewed(r)).length;
  $('total').textContent=expenseRulesReady?active.filter(r=>!r.exported&&!duplicates.has(r.id)&&exportReadiness([r],profiles,company.id).ready).length:money(active.filter(r=>r.currency==='TRY').reduce((sum,r)=>sum+(r.total||0),0));
  const query=normalize($('search').value),from=$('expenseDateFrom')?.value||'',to=$('expenseDateTo')?.value||'',ocr=$('expenseOcrFilter')?.value||'';
  const list=receipts.filter(r=>(filter==='archived'?r.archived:!r.archived)&&(filter!=='pending'||!reviewed(r))&&(filter!=='checked'||(!r.exported&&!duplicates.has(r.id)&&exportReadiness([r],profiles,company.id).ready))&&(filter!=='exported'||r.exported)&&(ocr!=='done'||r.ocrDone&&!r.error)&&(ocr!=='pending'||!r.ocrDone)&&(ocr!=='error'||!!r.error)&&(!from||r.date>=from)&&(!to||r.date<=to)&&normalize(r.seller+' '+r.number+' '+r.lines.map(l=>l.description).join(' ')).includes(query));expenseVisible=list;
  $('receipts').innerHTML=list.map(r=>{
    const problems=issues(r),duplicate=duplicates.has(r.id),ok=reviewed(r),types=[...new Set(r.lines.map(l=>categories[l.category]))].filter(Boolean).join(' · ');
    const warning=duplicate?'Olası mükerrer: aynı vergi no, tarih ve belge no.':r.error||(!r.ocrDone?'Okuma bekliyor.':problems.length?problems[0]+(problems.length>1?' +'+(problems.length-1)+' uyarı':''):ok?'Belge kontrol edildi.':'Alanları fotoğrafla karşılaştır ve onayla.');
    if(expenseRulesReady)return '<article data-open="'+r.id+'" class="receipt panel expense-row '+(editing?.id===r.id?'selected':'')+'"><input type="checkbox" data-select="'+r.id+'" aria-label="Fişi seç" '+(expenseSelected.has(r.id)?'checked':'')+'><div class="expense-thumb">'+(r.source.type==='application/pdf'?'<span>PDF</span>':'<img loading="lazy" src="'+imageURL(r.id)+'" alt="Fiş görseli">')+'</div><div class="expense-row-date">'+escape(r.date||'Tarih eksik')+'</div><div class="expense-row-seller"><strong>'+escape(r.seller||'Satıcı henüz okunmadı')+'</strong><small>'+escape(types||'Kategori seçilecek')+'</small></div><div class="money">'+escape(money(r.total,r.currency))+'</div><span class="badge '+(r.ocrDone&&!r.error?'ok':'')+'">'+(r.error?'Hata':r.ocrDone?'Okundu':'Bekliyor')+'</span><span class="badge '+(ok?'ok':'')+'">'+(r.archived?'Arşiv':r.exported?'Aktarıldı':ok?'Hazır':'İnceleme')+'</span><button class="secondary" data-open="'+r.id+'" title="'+escape(warning)+'">Aç →</button></article>';
    return '<article class="receipt panel"><div class="receipt-top"><span class="step">'+(r.source.type==='application/pdf'?'PDF BELGE':'MASRAF FİŞİ')+'</span><span class="badge '+(ok?'ok':'')+'">'+(r.archived?'Arşiv':ok?'Kontrol edildi':'Kontrol gerekli')+'</span></div><h3>'+escape(r.seller||'Satıcı henüz okunmadı')+'</h3><div class="meta">'+escape(r.date||'Tarih eksik')+' · '+escape(r.number||'Belge no eksik')+'</div><div class="money">'+escape(money(r.total,r.currency))+'</div><div class="types">'+escape(types||'Kategori seçilecek')+'</div><p class="issue '+(ok?'good':'')+'">'+escape(warning)+'</p><button class="secondary" data-open="'+r.id+'">Fişi aç →</button></article>';
  }).join('');
  $('empty').hidden=list.length>0;$('empty').querySelector('h3').textContent=receipts.length?'Bu filtrede fiş yok.':'Henüz fiş eklenmedi.';
  if(expenseRulesReady){const available=new Set(receipts.map(r=>r.id));for(const id of expenseSelected)if(!available.has(id))expenseSelected.delete(id);$('expenseSelected').textContent=expenseSelected.size+' seçili';$('expenseSelectAll').checked=!!list.length&&list.every(r=>expenseSelected.has(r.id));$('expenseSelectAll').indeterminate=list.some(r=>expenseSelected.has(r.id))&&!$('expenseSelectAll').checked;}
  $('resume').disabled=busy||!active.some(r=>!r.ocrDone);$('camera').disabled=busy;$('pick').disabled=busy;
  const status=exportReadiness(active,profiles,company.id);$('exportReason').textContent=status.ready?active.filter(r=>!r.exported).length+' fiş aktarıma hazır.':status.reasons.join('\n');$('xml').disabled=!status.ready;
}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function getBlob(id){const r=await fetch(imageURL(id),{cache:'no-store'});if(!r.ok)throw Error('Kaynak belge açılamadı. Oturumunu kontrol et.');return r.blob();}
function recognize(blob){
  return new Promise((resolve,reject)=>{
    worker??=new Worker('/expenses/ocr-worker.js');const active=worker;
    const end=(terminate=false)=>{clearTimeout(timer);active.onmessage=null;active.onerror=null;if(terminate){active.terminate();if(worker===active)worker=null;}};
    const timer=setTimeout(()=>{end(true);reject(Error('Okuma 3 dakika içinde tamamlanamadı. Daha küçük ve net bir fotoğrafla yeniden dene.'));},180000);
    active.onmessage=({data})=>{if(data.progress){$('progressText').textContent=data.progress;return;}end(!!data.error);if(data.error)reject(Error(data.error));else resolve(data.result);};
    active.onerror=()=>{end(true);reject(Error('Okuma motoru çalıştırılamadı. Belge kaydedildi; daha sonra yeniden okuyabilir veya elle tamamlayabilirsin.'));};
    active.postMessage({blob});
  });
}
async function pdf(){
  if(!pdfModule){pdfModule=await import('/assets/vendor/pdf.min.mjs');pdfModule.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';}return pdfModule;
}
async function readPDF(blob){
  const lib=await pdf(),doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
  try{
    if(doc.numPages>8)throw Error('PDF 8 sayfadan uzun. Her belgeyi ayrı PDF olarak yükle.');
    const results=[];
    for(let p=1;p<=doc.numPages;p++){
      $('progressText').textContent='PDF '+p+'/'+doc.numPages+' okunuyor…';const page=await doc.getPage(p),content=await page.getTextContent();
      const rows=new Map();for(const item of content.items){if(!item.str)continue;const y=Math.round(item.transform[5]/3)*3;const row=rows.get(y)||[];row.push(item);rows.set(y,row);}
      let text=[...rows].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join('\n');
      if(text.replace(/\s/g,'').length<60){const scale=Math.min(2,2400/Math.max(page.getViewport({scale:1}).width,page.getViewport({scale:1}).height)),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const b=await new Promise(r=>canvas.toBlob(r,'image/png'));const result=await recognize(b);results.push(result);canvas.width=canvas.height=1;}else results.push({text,confidence:null,alternatives:[text]});
    }
    return {text:results.map(r=>r.text).join('\n'),confidence:results.every(r=>r.confidence===null)?null:Math.min(...results.map(r=>r.confidence??100)),alternatives:[],pages:doc.numPages};
  }finally{await doc.destroy();}
}
async function barcode(blob){
  if(!('BarcodeDetector' in window)||blob.type==='application/pdf')return null;
  let bitmap;try{const formats=await BarcodeDetector.getSupportedFormats();if(!formats.length)return null;bitmap=await createImageBitmap(blob);const found=await new BarcodeDetector({formats}).detect(bitmap);return found.length?found.map(x=>x.format+': '+x.rawValue.slice(0,100)).join(' · '):null;}catch{return null;}finally{bitmap?.close();}
}
async function processReceipt(record,blob){
  let patch;
  try{
    const result=blob.type==='application/pdf'?await readPDF(blob):await recognize(blob);patch=parseReceipt(result.text,result.confidence);
    if(result.alternatives?.length>1){const alternatives=result.alternatives.map(t=>parseReceipt(t));if(alternatives.some(r=>r.total!==patch.total||r.vat!==patch.vat||r.number!==patch.number))patch.notes.push('İki okuma denemesinde numara veya tutar farklı çıktı; belgeyi dikkatle karşılaştır.');}
    if(result.pages>1)patch.notes.push('Çok sayfalı PDF: tüm sayfaların aynı belgeye ait olduğunu kontrol et.');
    const code=await barcode(blob);if(code)patch.notes.push('Barkod / karekod okundu (alanlara otomatik uygulanmadı): '+code.slice(0,170));
    patch.lines=patch.lines.map(line=>suggestExpenseCode(patch,line));patch={...patch,ocrDone:true,error:'',exported:false};
  }catch(error){patch={...record,ocrDone:true,reviewed:false,exported:false,error:error.message};}
  return api('record/'+record.id,{...record,...patch,revision:record.revision});
}
async function runQueue(files=null){
  if(busy)return;busy=true;stop=false;notice('');render();$('progressPanel').hidden=false;
  const tasks=files?[...files].slice(0,20):receipts.filter(r=>!r.archived&&!r.ocrDone);$('progress').max=tasks.length||1;$('progress').value=0;
  const errors=[];let duplicateCount=0;
  try{
    for(const [index,task] of tasks.entries()){
      if(stop)break;
      $('progressText').textContent=(index+1)+'/'+tasks.length+' · Belge kaydediliyor…';
      try{
        let record,blob;
        if(files){blob=task;if(blob.size>8*1024*1024)throw Error('Belge 8 MB sınırını aşıyor. Daha küçük bir JPEG veya PDF seç.');if(!blob.size)throw Error('Dosya boş.');
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
          const saved=await api('image/'+hash,blob,true);record=saved.receipt;if(saved.duplicate){duplicateCount++;continue;}
        }else{record=await api('record/'+task.id);if(record.ocrDone)continue;blob=await getBlob(task.id);}
        await processReceipt(record,blob);
      }catch(e){errors.push((files?task.name:'Fiş')+': '+e.message);}
      finally{$('progress').value=index+1;await refresh().catch(()=>{});}
    }
  }finally{worker?.terminate();worker=null;busy=false;render();$('progressPanel').hidden=true;notice([stop?'İşlem durduruldu. Kaydedilmiş fişler korundu.':tasks.length?'İşlem tamamlandı. Okunan taslakları kontrol et.':'Bekleyen belge yok.',duplicateCount?duplicateCount+' dosya zaten kayıtlı; yeniden eklenmedi.':'',files&&files.length>20?'İlk 20 dosya işlendi. Kalanları yeniden seç.':'',...errors].filter(Boolean).join('\n'));}
}
function lineHTML(line,index){return '<div class="line" data-index="'+index+'"><div class="line-head"><strong>MASRAF SATIRI '+(index+1)+'</strong><button type="button" class="text-button" data-remove="'+index+'" aria-label="'+(index+1)+'. satırı kaldır">Kaldır</button></div><div class="line-grid"><label class="full">Logo satır açıklaması<input data-field="description" value="'+escape(line.description)+'" maxlength="200"></label></div><div class="categories" role="group" aria-label="'+(index+1)+'. satır kategorisi">'+Object.entries(categories).map(([key,label])=>'<button type="button" data-category="'+key+'" aria-pressed="'+(line.category===key)+'">'+label+'</button>').join('')+'</div><div class="expense-code"><label>Gider hesabı kodu (Logo GL_CODE1)<input data-field="expenseCode" value="'+escape(line.expenseCode||'')+'" maxlength="60" placeholder="Örn. 770.11.004" autocomplete="off"></label><div class="expense-code-actions"><button type="button" data-remember>Hafızaya kaydet</button><button type="button" data-forget>Geri al</button><span data-memory-status></span></div></div><div class="line-grid"><label>Satır tutarı ('+(line.vatIncluded===false?'KDV hariç':'KDV dahil')+')<input data-field="gross" inputmode="decimal" value="'+amount(line.gross)+'"></label><label>KDV oranı (%)<input data-field="vatRate" inputmode="decimal" value="'+escape(line.vatRate??'')+'" placeholder="Okunmadı"></label></div><div class="vat-choice" role="group" aria-label="'+(index+1)+'. satır KDV tutar biçimi"><span>KDV</span><button type="button" data-vat-included="true" aria-pressed="'+(line.vatIncluded!==false)+'">Dahil</button><button type="button" data-vat-included="false" aria-pressed="'+(line.vatIncluded===false)+'">Hariç</button></div><div class="line-summary" data-line-summary aria-live="polite"></div></div>';}
function renderLines(){
  $('lines').innerHTML=editing.lines.map(lineHTML).join('');
  if(expenseRulesReady)$('lines').querySelectorAll('[data-field=expenseCode]').forEach(input=>{input.setAttribute('list','accountCodes');const button=document.createElement('button');button.type='button';button.textContent='Hesap planında ara';button.dataset.plan='';input.closest('.expense-code').querySelector('.expense-code-actions').prepend(button);});
  if(!expenseRulesReady){
    $('lines').querySelectorAll('.expense-code-actions').forEach(node=>{node.style.display='none';});
    $('lines').querySelectorAll('[data-field=expenseCode]').forEach(input=>{input.placeholder='Bu firmada gider kodu henüz tanımlanmadı';});
  }
  $('flightSplit').hidden=!editing.lines.some(l=>l.category==='flight');renderLineSummaries();
}
function renderLineSummaries(){for(const node of $('lines').children){const l=editing.lines[Number(node.dataset.index)],v=lineAmounts(l);node.querySelector('[data-line-summary]').textContent=v.gross===null?'Tutar ve KDV oranını gir.':'Matrah '+money(v.net)+'  ·  KDV '+money(v.vat)+'  ·  Genel toplam '+money(v.gross);node.querySelector('[data-memory-status]').textContent=l.expenseCode&&profiles.memories?.[memoryKey(editing,l)]===l.expenseCode?'Hafızada':l.expenseCode?'Bu satıra özel':'Kategori kodu kullanılır';}}
function collect(){
  const f=$('editForm').elements;for(const key of ['seller','taxId','date','number','currency'])editing[key]=f[key].value.trim();if(expenseRulesReady)editing.paymentCard=f.paymentCard.value.trim();for(const key of ['total','vat'])editing[key]=cents(f[key].value);
  editing.reviewed=f.reviewed.checked;
  for(const node of $('lines').children){const row=editing.lines[Number(node.dataset.index)];row.description=node.querySelector('[data-field=description]').value.trim();row.descriptionReady=true;row.expenseCode=node.querySelector('[data-field=expenseCode]').value.trim().toUpperCase();row.vatIncluded=node.querySelector('[data-vat-included=true]').getAttribute('aria-pressed')==='true';row.gross=cents(node.querySelector('[data-field=gross]').value);const value=node.querySelector('[data-field=vatRate]').value.trim().replace(',','.');row.vatRate=/^\d+(?:\.\d{1,2})?$/.test(value)?Number(value):null;}
  return editing;
}
function warningList(){
  const problems=issues(editing);if(duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))problems.push('Olası mükerrer: aynı vergi no, belge no ve tarih başka bir fişte var.');
  $('editWarnings').innerHTML=(editing.error?'<p>'+escape(editing.error)+'</p>':'')+(problems.length?'<ul>'+problems.map(p=>'<li>'+escape(p)+'</li>').join('')+'</ul>':'<strong>Temel alanlar tutarlı. Belgeyle karşılaştırıp onayla.</strong>')+(editing.notes||[]).map(n=>'<p class="note">'+escape(n)+'</p>').join('');
}
async function displayPreview(record){
  if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}$('preview').replaceChildren();$('original').href=imageURL(record.id);$('rotate').hidden=record.source.type==='application/pdf';rotation=0;expenseZoom=100;
  const blob=await getBlob(record.id);if(editing?.id!==record.id||!$('editor').open)return;
  if(record.source.type==='application/pdf'){
    const lib=await pdf(),doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
    try{for(let i=1;i<=Math.min(doc.numPages,8);i++){const page=await doc.getPage(i),v=page.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;if(editing?.id!==record.id||!$('editor').open)return;$('preview').append(canvas);}}finally{await doc.destroy();}
  }else{previewURL=URL.createObjectURL(blob);const img=new Image();img.alt='Kaynak masraf fişi';img.src=previewURL;$('preview').append(img);}
}
async function openEditor(id){
  if(busy){notice('Okuma bittikten sonra fişi düzenleyebilirsin.');return;}
  if(editing&&editing.id===id&&$('editor').open)return;
  if(editing&&editing.id!==id&&dirty&&!confirm('Kaydedilmemiş değişiklikler var. Başka fişe geçilsin mi?'))return;
  if(opening)return;opening=true;
  try{
  editing=await api('record/'+id);editing.lines=editing.lines.map(l=>suggestExpenseCode(editing,normalizeLine(l,editing)));$('flightRate').value=editing.lines.find(l=>l.category==='flight'&&l.vatRate>0)?.vatRate||'';dirty=false;$('editTitle').textContent=editing.seller||'Masraf fişi';const f=$('editForm').elements;
  for(const key of ['seller','taxId','date','number','currency','paymentCard'])f[key].value=editing[key]||'';for(const key of ['total','vat'])f[key].value=amount(editing[key]);f.reviewed.checked=editing.reviewed;
  $('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';$('rawText').textContent=editing.rawText||'Henüz metin okunmadı.';$('editSaveState').textContent='Değişiklikler Kaydet ile hesaba aktarılır.';
  renderLines();warningList();if(expenseRulesReady){$('editTitle').textContent='Fiş Detayı';const index=expenseVisible.findIndex(r=>r.id===id);$('expenseDetailPosition').textContent=index>=0?(index+1)+' / '+expenseVisible.length:'';$('expensePrev').disabled=index<=0;$('expenseNext').disabled=index<0||index>=expenseVisible.length-1;$('expenseDetailStatus').textContent=editing.exported?'Aktarıldı':editing.reviewed?'Kontrol edildi':'İncelemede';}if(!$('editor').open){if(expenseRulesReady&&matchMedia('(min-width:1100px)').matches){$('editor').show();document.querySelector('.expense-detail-empty').hidden=true;}else $('editor').showModal();}if(expenseRulesReady)render();await displayPreview(editing).catch(e=>{$('preview').textContent=e.message;});
  }finally{opening=false;}
}
function closeEditor(){if(saving||busy)return;if(dirty&&!confirm('Kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?'))return;$('editor').close();if(expenseRulesReady)document.querySelector('.expense-detail-empty').hidden=false;editing=null;dirty=false;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').replaceChildren();if(expenseRulesReady)render();}
async function saveEditor(){
  if(saving)return;saving=true;$('save').disabled=true;$('editForm').inert=true;
  try{collect();if(editing.reviewed&&duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))throw Error('Mükerrer görünen fişi arşive al veya belge bilgilerini düzelt.');editing=await api('record/'+editing.id,editing);dirty=false;$('editSaveState').textContent='Kaydedildi.';await refresh();warningList();}
  catch(e){$('editSaveState').textContent=e.message+' Düzenlemen bu ekranda duruyor.';}
  finally{saving=false;$('save').disabled=false;$('editForm').inert=false;}
}
function edited(){dirty=true;editing.reviewed=false;editing.exported=false;$('editForm').elements.reviewed.checked=false;$('editSaveState').textContent='Kaydedilmemiş değişiklikler var.';collect();warningList();renderLineSummaries();}
const run=fn=>Promise.resolve().then(fn).catch(e=>notice(e.message));
$('expenseTheme').onclick=()=>{document.body.classList.toggle('expense-light');try{localStorage.setItem('sw:expenses:theme',document.body.classList.contains('expense-light')?'light':'dark');}catch{}};
try{if(localStorage.getItem('sw:expenses:theme')==='light')document.body.classList.add('expense-light');}catch{}
function showAccountPlan(){ $('accountCodes').replaceChildren(...accountPlan.accounts.map(a=>{const option=document.createElement('option');option.value=a.code;option.label=a.name;return option;})); }
let accountTarget=null;
function renderAccountResults(){const query=normalize($('accountSearch').value).trim(),found=accountPlan.accounts.filter(a=>!query||normalize(a.code+' '+a.name).includes(query));$('accountResults').innerHTML=found.slice(0,100).map(a=>'<button type="button" data-account="'+escape(a.code)+'"><strong>'+escape(a.code)+'</strong><span>'+escape(a.name)+'</span></button>').join('')+(found.length>100?'<p>İlk 100 sonuç gösteriliyor; aramayı daraltın.</p>':'')+(!found.length?'<p>Hesap bulunamadı. Önce hesap planı Excel dosyasını yükleyin veya aramayı değiştirin.</p>':'');}
$('accountSearch').oninput=renderAccountResults;$('closeAccountPicker').onclick=()=>$('accountPicker').close();
$('accountResults').onclick=e=>{const button=e.target.closest('[data-account]');if(!button||!accountTarget)return;accountTarget.value=button.dataset.account;accountTarget.dispatchEvent(new Event('input',{bubbles:true}));$('accountPicker').close();};
async function refreshAccountPlan(){if(!expenseRulesReady)return;accountPlan=await api('account-plan');showAccountPlan();}
$('accountImport').onclick=()=>$('accountFile').click();
$('accountFile').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;run(async()=>{if(!window.XLSX)throw Error('Excel okuyucu yüklenemedi.');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),map=new Map();for(const name of workbook.SheetNames){const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:''});for(const row of rows){const code=String(row[1]??'').trim(),description=String(row[2]??'').trim();if(/^\d{3}(?:\.\d+)+$/.test(code)&&description&&!map.has(code))map.set(code,{code,name:description.slice(0,200)});}}if(!map.size)throw Error('Excel içinde hesap kodu ve adı bulunamadı.');const result=await api('account-plan',{revision:accountPlan.revision,accounts:[...map.values()]});await refreshAccountPlan();notice(result.count+' hesap kodu Pusula hesabına kaydedildi. Fiş satırında kod alanından seçebilirsin.');});};
if(expenseRulesReady)run(refreshAccountPlan);
$('camera').onclick=()=>$('cameraInput').click();$('pick').onclick=()=>$('files').click();
for(const id of ['cameraInput','files'])$(id).onchange=event=>{const files=[...event.target.files];event.target.value='';if(files.length)run(()=>runQueue(files));};
$('stopQueue').onclick=()=>{stop=true;$('progressText').textContent='Bu belge tamamlanınca durdurulacak…';};
$('resume').onclick=()=>run(()=>runQueue());$('refresh').onclick=()=>run(refresh);
$('copyLink').onclick=()=>run(async()=>{await navigator.clipboard.writeText(location.origin+'/workspace/'+company.id+'/masraf/');notice('Firma bağlantısı kopyalandı. Telefonda aynı hesapla açabilirsin.');});
$('search').oninput=render;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
if(expenseRulesReady){
 for(const [id,delta] of [['expensePrev',-1],['expenseNext',1]])$(id).onclick=()=>{const index=expenseVisible.findIndex(r=>r.id===editing?.id),target=expenseVisible[index+delta];if(target)run(()=>openEditor(target.id));};
 for(const [id,delta] of [['expenseZoomOut',-25],['expenseZoomIn',25]])$(id).onclick=()=>{expenseZoom=Math.max(50,Math.min(300,expenseZoom+delta));$('preview').querySelectorAll('img,canvas').forEach(node=>{node.style.maxWidth='none';node.style.width=expenseZoom+'%';});};
 for(const id of ['expenseDateFrom','expenseDateTo','expenseOcrFilter'])$(id).addEventListener('change',render);
 $('expenseSelectAll').onchange=e=>{for(const r of expenseVisible)e.target.checked?expenseSelected.add(r.id):expenseSelected.delete(r.id);render();};
 $('receipts').addEventListener('change',e=>{if(!e.target.matches('[data-select]'))return;e.target.checked?expenseSelected.add(e.target.dataset.select):expenseSelected.delete(e.target.dataset.select);render();});
 $('expenseBulkApply').onclick=()=>run(async()=>{const action=$('expenseBulkAction').value,ids=[...expenseSelected];if(!action||!ids.length)throw Error('Önce işlem ve fiş seçin.');if(busy||saving||dirty)throw Error('Önce açık fişteki değişiklikleri kaydedin ve okumayı bitirin.');const full=[];for(const id of ids)full.push(await api('record/'+id));if(action==='backup'){downloadJSON({format:'soyturk-expenses-v1',company:company.id,created:new Date().toISOString(),receipts:full,sourceImagesIncluded:false},'secilen-masraf-fisleri.json');notice(ids.length+' fişin alanları yedeklendi.');return;}const dup=duplicateIds(receipts);if(full.some(r=>r.archived||dup.has(r.id)||!exportReadiness([r],profiles,company.id).ready))throw Error('Seçilen fişlerin tümü kontrol edilmiş ve Logo XML için hazır olmalı.');if(!confirm(ids.length+' fişi Logo’da gerçekten aktardınız mı? Bu işlem yalnızca durumlarını kaydeder.'))return;if(editing&&ids.includes(editing.id))closeEditor();let count=0;try{for(const r of full){await api('record/'+r.id,{...r,exported:true});count++;}}finally{await refresh();}notice(count+' fiş aktarıldı olarak işaretlendi.');});
}
$('receipts').onclick=e=>{if(e.target.matches('[data-select]'))return;const b=e.target.closest('[data-open]');if(b)run(()=>openEditor(b.dataset.open));};
$('closeEditor').onclick=closeEditor;$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('editForm').onsubmit=e=>{e.preventDefault();run(saveEditor);};
$('editForm').addEventListener('input',e=>{if(e.target.name==='reviewed'){dirty=true;if(!e.target.checked)editing.exported=false;collect();warningList();}else edited();});
$('lines').onclick=e=>{const b=e.target.closest('button');if(!b)return;const node=b.closest('[data-index]');if(!node)return;
  if(b.hasAttribute('data-plan')){accountTarget=node.querySelector('[data-field=expenseCode]');$('accountSearch').value='';renderAccountResults();$('accountPicker').showModal();$('accountSearch').focus();return;}
  if(b.hasAttribute('data-remember')||b.hasAttribute('data-forget')){run(async()=>{try{collect();const line=editing.lines[+node.dataset.index],key=memoryKey(editing,line);if(!key)throw Error('Önce satıcıyı ve masraf kategorisini doldur.');const code=b.hasAttribute('data-forget')?'':line.expenseCode;if(code&&!validExpenseCode(code))throw Error('Gider kodu harf, rakam, nokta, tire veya alt çizgi içermeli.');if(!code&&b.hasAttribute('data-remember'))throw Error('Önce gider kodunu yaz.');profiles=await api('profiles',{revision:profiles.revision,memory:{key,code}});if(!code)line.expenseCode='';renderLines();edited();$('editSaveState').textContent=code?'Kod bu firmada hafızaya kaydedildi. Fiş için Kaydet düğmesine bas.':'Kod hafızadan kaldırıldı. Fiş için Kaydet düğmesine bas.';}catch(error){$('editSaveState').textContent=error.message;}});return;}
  collect();if(b.dataset.category)editing.lines[+node.dataset.index].category=b.dataset.category;else if(b.dataset.vatIncluded!==undefined)editing.lines[+node.dataset.index].vatIncluded=b.dataset.vatIncluded==='true';else if(b.dataset.remove!==undefined)editing.lines.splice(+b.dataset.remove,1);renderLines();edited();};
$('addLine').onclick=()=>{if(editing.lines.length>=40){$('editSaveState').textContent='En fazla 40 satır eklenebilir.';return;}collect();editing.lines.push({description:(editing.number&&editing.seller?'FİŞ NO:'+editing.number+' '+editing.seller:'').slice(0,200),category:'other',expenseCode:'',gross:null,vatRate:null,vatIncluded:true,descriptionReady:true});renderLines();edited();};
$('rotate').onclick=()=>{rotation=(rotation+90)%360;const img=$('preview').querySelector('img');if(img)img.style.transform='rotate('+rotation+'deg)';};
$('archive').onclick=async()=>{if(saving)return;collect();editing.archived=!editing.archived;editing.reviewed=false;editing.exported=false;$('editForm').elements.reviewed.checked=false;dirty=true;await saveEditor();$('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';};
$('retry').onclick=()=>run(async()=>{
  if(busy||saving)return;if(!confirm('Mevcut alanlar yeni okuma sonucu ile değiştirilecek. Kaynak belge korunur. Devam edilsin mi?'))return;
  const record=editing;busy=true;$('editor').close();$('progressPanel').hidden=false;render();
  try{await processReceipt(record,await getBlob(record.id));dirty=false;editing=null;await refresh();}
  catch(e){if(expenseRulesReady&&matchMedia('(min-width:1100px)').matches)$('editor').show();else $('editor').showModal();$('editSaveState').textContent=e.message+' Önceki düzenleme bu ekranda korunuyor.';return;}
  finally{worker?.terminate();worker=null;busy=false;$('progressPanel').hidden=true;render();}
  await openEditor(record.id);
});
$('draftBackup').onclick=()=>{collect();downloadJSON({format:'soyturk-expense-draft-v1',company:company.id,receipt:editing},'masraf-duzenleme-'+company.id+'.json');};
$('backup').onclick=()=>run(async()=>{const full=[];for(const r of receipts)full.push(await api('record/'+r.id));downloadJSON({format:'soyturk-expenses-v1',company:company.id,created:new Date().toISOString(),receipts:full,profiles,sourceImagesIncluded:false},'masraf-calisma-'+company.id+'.json');notice('Alanlar ve eşleştirmeler indirildi. Bu yedek kaynak fotoğraf/PDF dosyalarını içermez; belgeler hesabında korunuyor.');});
let profileRevision=0;
$('openProfiles').onclick=()=>{profileRevision=profiles.revision;$('profileStatus').textContent='';$('profileRows').innerHTML=Object.entries(categories).map(([key,label])=>'<details class="profile-row" data-profile="'+key+'"><summary>'+label+'</summary><div class="profile-grid">'+[['serviceCode','Logo hizmet / stok kodu'],['accountCode','Gider hesap kodu'],['costCenter','Masraf merkezi'],['vatCode1','%1 KDV hesap kodu'],['vatCode10','%10 KDV hesap kodu'],['vatCode20','%20 KDV hesap kodu'],['kkegCode','KKEG gider hesabı'],['kkegVatCode','KKEG KDV hesabı']].map(([field,title])=>'<label>'+title+'<input data-profile-field="'+field+'" value="'+escape(categoryProfile(key,profiles,company.id)[field]||'')+'" maxlength="60"></label>').join('')+'</div></details>').join('');$('profiles').showModal();};
$('closeProfiles').onclick=()=>$('profiles').close();$('profileForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{const map={};for(const row of $('profileRows').children){map[row.dataset.profile]={};for(const input of row.querySelectorAll('input'))map[row.dataset.profile][input.dataset.profileField]=input.value;}profiles=await api('profiles',{revision:profileRevision,categories:map});profileRevision=profiles.revision;render();$('profileStatus').textContent='Firma ayarları kaydedildi.';}catch(e){$('profileStatus').textContent=e.message;}finally{button.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(!document.hidden&&!busy&&!$('editor').open&&!$('profiles').open)refresh().catch(e=>{$('sync').textContent=e.message;});},15000);
run(refresh);

$('xml').onclick=()=>run(async()=>{await refresh();const xml=buildPurchaseXML(receipts,profiles,company.id),url=URL.createObjectURL(new Blob([xml],{type:'application/xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='masraf-'+company.id+'.xml';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('Logo XML indirildi.');});

$('splitFlight').onclick=()=>{try{collect();const rate=Number($('flightRate').value);editing.lines=splitFlight(editing,rate);renderLines();edited();}catch(e){$('editSaveState').textContent=e.message;}};
