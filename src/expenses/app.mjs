import {categories,normalize,cents,amount,parseReceipt,issues,duplicateIds,exportReadiness} from './model.mjs';
const $=id=>document.getElementById(id),company=window.SW_CONTEXT?.company;
if(!company)throw Error('Önce firma çalışma alanından Masraf Fişleri’ni aç.');
$('company').textContent=company.name;$('workspace').href='/workspace/'+company.id+'/';document.title=company.name+' · Masraf Fişleri';
const base='/api/expenses/'+company.id+'/',escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let receipts=[],profiles={revision:0,categories:{}},filter='all',busy=false,stop=false,editing=null,dirty=false,saving=false,previewURL=null,rotation=0,worker=null,refreshing=false,pdfModule=null,opening=false;
const money=(value,currency='TRY')=>Number.isSafeInteger(value)?new Intl.NumberFormat('tr-TR',{style:'currency',currency}).format(value/100):'Tutar okunmadı';
const imageURL=id=>base+'image/'+id;
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
async function api(action,body,raw=false){
  const r=await fetch(base+action,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':raw?body.type||'application/octet-stream':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok){if(r.status===401)throw Error('Oturum sona erdi. Kaydedilmemiş düzenlemeyi yedekle; aynı firma bağlantısından yeniden giriş yap.');throw Object.assign(Error(data.error||'İşlem tamamlanamadı.'),{status:r.status});}return data;
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{const data=await api('list');receipts=data.receipts;profiles=data.profiles;render();$('sync').textContent='Hesapla eşitlendi · '+new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});}
  finally{refreshing=false;}
}
function render(){
  const active=receipts.filter(r=>!r.archived),duplicates=duplicateIds(receipts),reviewed=r=>r.reviewed&&!issues(r).length&&!duplicates.has(r.id);
  $('count').textContent=active.length;$('checked').textContent=active.filter(reviewed).length;$('pending').textContent=active.filter(r=>!reviewed(r)).length;
  $('total').textContent=money(active.filter(r=>r.currency==='TRY').reduce((sum,r)=>sum+(r.total||0),0));
  const query=normalize($('search').value),list=receipts.filter(r=>(filter==='archived'?r.archived:!r.archived)&&(filter!=='pending'||!reviewed(r))&&(filter!=='checked'||reviewed(r))&&normalize(r.seller+' '+r.number).includes(query));
  $('receipts').innerHTML=list.map(r=>{
    const problems=issues(r),duplicate=duplicates.has(r.id),ok=reviewed(r),types=[...new Set(r.lines.map(l=>categories[l.category]))].filter(Boolean).join(' · ');
    const warning=duplicate?'Olası mükerrer: aynı vergi no, tarih ve belge no.':r.error||(!r.ocrDone?'Okuma bekliyor.':problems.length?problems[0]+(problems.length>1?' +'+(problems.length-1)+' uyarı':''):ok?'Belge kontrol edildi. Logo şablonu bekleniyor.':'Alanları fotoğrafla karşılaştır ve onayla.');
    return '<article class="receipt panel"><div class="receipt-top"><span class="step">'+(r.source.type==='application/pdf'?'PDF BELGE':'MASRAF FİŞİ')+'</span><span class="badge '+(ok?'ok':'')+'">'+(r.archived?'Arşiv':ok?'Kontrol edildi':'Kontrol gerekli')+'</span></div><h3>'+escape(r.seller||'Satıcı henüz okunmadı')+'</h3><div class="meta">'+escape(r.date||'Tarih eksik')+' · '+escape(r.number||'Belge no eksik')+'</div><div class="money">'+escape(money(r.total,r.currency))+'</div><div class="types">'+escape(types||'Kategori seçilecek')+'</div><p class="issue '+(ok?'good':'')+'">'+escape(warning)+'</p><button class="secondary" data-open="'+r.id+'">Belgeyi ve satırları kontrol et ↗</button></article>';
  }).join('');
  $('empty').hidden=list.length>0;$('empty').querySelector('h3').textContent=receipts.length?'Bu filtrede fiş yok.':'İlk fişinle başlayalım.';
  $('resume').disabled=busy||!active.some(r=>!r.ocrDone);$('camera').disabled=busy;$('pick').disabled=busy;
  $('exportReason').textContent=exportReadiness(active,profiles).reasons.join('\n');$('xml').disabled=true;
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
    patch={...patch,ocrDone:true,error:''};
  }catch(error){patch={...record,ocrDone:true,reviewed:false,error:error.message};}
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
function lineHTML(line,index){return '<div class="line" data-index="'+index+'"><div class="line-head"><strong>MASRAF SATIRI '+(index+1)+'</strong><button type="button" class="text-button" data-remove="'+index+'" aria-label="'+(index+1)+'. satırı kaldır">Kaldır</button></div><div class="line-grid"><label class="full">Açıklama<input data-field="description" value="'+escape(line.description)+'" maxlength="200"></label></div><div class="categories" role="group" aria-label="'+(index+1)+'. satır kategorisi">'+Object.entries(categories).map(([key,label])=>'<button type="button" data-category="'+key+'" aria-pressed="'+(line.category===key)+'">'+label+'</button>').join('')+'</div><div class="line-grid"><label>KDV dahil tutar<input data-field="gross" inputmode="decimal" value="'+amount(line.gross)+'"></label><label>KDV oranı (%)<input data-field="vatRate" inputmode="decimal" value="'+escape(line.vatRate??'')+'" placeholder="Okunmadı"></label></div></div>';}
function renderLines(){$('lines').innerHTML=editing.lines.map(lineHTML).join('');}
function collect(){
  const f=$('editForm').elements;for(const key of ['seller','taxId','date','number','currency'])editing[key]=f[key].value.trim();for(const key of ['total','vat'])editing[key]=cents(f[key].value);
  editing.reviewed=f.reviewed.checked;
  for(const node of $('lines').children){const row=editing.lines[Number(node.dataset.index)];row.description=node.querySelector('[data-field=description]').value.trim();row.gross=cents(node.querySelector('[data-field=gross]').value);const value=node.querySelector('[data-field=vatRate]').value.trim().replace(',','.');row.vatRate=/^\d+(?:\.\d{1,2})?$/.test(value)?Number(value):null;}
  return editing;
}
function warningList(){
  const problems=issues(editing);if(duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))problems.push('Olası mükerrer: aynı vergi no, belge no ve tarih başka bir fişte var.');
  $('editWarnings').innerHTML=(editing.error?'<p>'+escape(editing.error)+'</p>':'')+(problems.length?'<ul>'+problems.map(p=>'<li>'+escape(p)+'</li>').join('')+'</ul>':'<strong>Temel alanlar tutarlı. Belgeyle karşılaştırıp onayla.</strong>')+(editing.notes||[]).map(n=>'<p class="note">'+escape(n)+'</p>').join('');
}
async function displayPreview(record){
  if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}$('preview').replaceChildren();$('original').href=imageURL(record.id);$('rotate').hidden=record.source.type==='application/pdf';rotation=0;
  const blob=await getBlob(record.id);if(editing?.id!==record.id||!$('editor').open)return;
  if(record.source.type==='application/pdf'){
    const lib=await pdf(),doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
    try{for(let i=1;i<=Math.min(doc.numPages,8);i++){const page=await doc.getPage(i),v=page.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;if(editing?.id!==record.id||!$('editor').open)return;$('preview').append(canvas);}}finally{await doc.destroy();}
  }else{previewURL=URL.createObjectURL(blob);const img=new Image();img.alt='Kaynak masraf fişi';img.src=previewURL;$('preview').append(img);}
}
async function openEditor(id){
  if(busy){notice('Okuma bittikten sonra fişi düzenleyebilirsin.');return;}
  if(opening)return;opening=true;
  try{
  editing=await api('record/'+id);dirty=false;$('editTitle').textContent=editing.seller||'Masraf fişi';const f=$('editForm').elements;
  for(const key of ['seller','taxId','date','number','currency'])f[key].value=editing[key]||'';for(const key of ['total','vat'])f[key].value=amount(editing[key]);f.reviewed.checked=editing.reviewed;
  $('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';$('rawText').textContent=editing.rawText||'Henüz metin okunmadı.';$('editSaveState').textContent='Değişiklikler Kaydet ile hesaba aktarılır.';
  renderLines();warningList();$('editor').showModal();await displayPreview(editing).catch(e=>{$('preview').textContent=e.message;});
  }finally{opening=false;}
}
function closeEditor(){if(saving||busy)return;if(dirty&&!confirm('Kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?'))return;$('editor').close();editing=null;dirty=false;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').replaceChildren();}
async function saveEditor(){
  if(saving)return;saving=true;$('save').disabled=true;$('editForm').inert=true;
  try{collect();if(editing.reviewed&&duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))throw Error('Mükerrer görünen fişi arşive al veya belge bilgilerini düzelt.');editing=await api('record/'+editing.id,editing);dirty=false;$('editSaveState').textContent='Kaydedildi.';await refresh();warningList();}
  catch(e){$('editSaveState').textContent=e.message+' Düzenlemen bu ekranda duruyor.';}
  finally{saving=false;$('save').disabled=false;$('editForm').inert=false;}
}
function edited(){dirty=true;editing.reviewed=false;$('editForm').elements.reviewed.checked=false;$('editSaveState').textContent='Kaydedilmemiş değişiklikler var.';collect();warningList();}
const run=fn=>Promise.resolve().then(fn).catch(e=>notice(e.message));
$('camera').onclick=()=>$('cameraInput').click();$('pick').onclick=()=>$('files').click();
for(const id of ['cameraInput','files'])$(id).onchange=event=>{const files=[...event.target.files];event.target.value='';if(files.length)run(()=>runQueue(files));};
$('stopQueue').onclick=()=>{stop=true;$('progressText').textContent='Bu belge tamamlanınca durdurulacak…';};
$('resume').onclick=()=>run(()=>runQueue());$('refresh').onclick=()=>run(refresh);
$('copyLink').onclick=()=>run(async()=>{await navigator.clipboard.writeText(location.origin+'/workspace/'+company.id+'/masraf/');notice('Firma bağlantısı kopyalandı. Telefonda aynı hesapla açabilirsin.');});
$('search').oninput=render;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
$('receipts').onclick=e=>{const b=e.target.closest('[data-open]');if(b)run(()=>openEditor(b.dataset.open));};
$('closeEditor').onclick=closeEditor;$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('editForm').onsubmit=e=>{e.preventDefault();run(saveEditor);};
$('editForm').addEventListener('input',e=>{if(e.target.name==='reviewed'){dirty=true;collect();warningList();}else edited();});
$('lines').onclick=e=>{const b=e.target.closest('button');if(!b)return;const node=b.closest('[data-index]');if(!node)return;collect();if(b.dataset.category)editing.lines[+node.dataset.index].category=b.dataset.category;else if(b.dataset.remove!==undefined)editing.lines.splice(+b.dataset.remove,1);renderLines();edited();};
$('addLine').onclick=()=>{if(editing.lines.length>=40){$('editSaveState').textContent='En fazla 40 satır eklenebilir.';return;}collect();editing.lines.push({description:'',category:'other',gross:null,vatRate:null});renderLines();edited();};
$('rotate').onclick=()=>{rotation=(rotation+90)%360;const img=$('preview').querySelector('img');if(img)img.style.transform='rotate('+rotation+'deg)';};
$('archive').onclick=async()=>{if(saving)return;collect();editing.archived=!editing.archived;editing.reviewed=false;$('editForm').elements.reviewed.checked=false;dirty=true;await saveEditor();$('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';};
$('retry').onclick=()=>run(async()=>{
  if(busy||saving)return;if(!confirm('Mevcut alanlar yeni okuma sonucu ile değiştirilecek. Kaynak belge korunur. Devam edilsin mi?'))return;
  const record=editing;busy=true;$('editor').close();$('progressPanel').hidden=false;render();
  try{await processReceipt(record,await getBlob(record.id));dirty=false;editing=null;await refresh();}
  catch(e){$('editor').showModal();$('editSaveState').textContent=e.message+' Önceki düzenleme bu ekranda korunuyor.';return;}
  finally{worker?.terminate();worker=null;busy=false;$('progressPanel').hidden=true;render();}
  await openEditor(record.id);
});
$('draftBackup').onclick=()=>{collect();downloadJSON({format:'soyturk-expense-draft-v1',company:company.id,receipt:editing},'masraf-duzenleme-'+company.id+'.json');};
$('backup').onclick=()=>run(async()=>{const full=[];for(const r of receipts)full.push(await api('record/'+r.id));downloadJSON({format:'soyturk-expenses-v1',company:company.id,created:new Date().toISOString(),receipts:full,profiles,sourceImagesIncluded:false},'masraf-calisma-'+company.id+'.json');notice('Alanlar ve eşleştirmeler indirildi. Bu yedek kaynak fotoğraf/PDF dosyalarını içermez; belgeler hesabında korunuyor.');});
let profileRevision=0;
$('openProfiles').onclick=()=>{profileRevision=profiles.revision;$('profileStatus').textContent='';$('profileRows').innerHTML=Object.entries(categories).map(([key,label])=>'<section class="profile-row" data-profile="'+key+'"><strong>'+label+'</strong><div class="profile-grid">'+[['serviceCode','Logo hizmet / stok kodu'],['accountCode','Gider hesap kodu'],['costCenter','Masraf merkezi']].map(([field,title])=>'<label>'+title+'<input data-profile-field="'+field+'" value="'+escape(profiles.categories?.[key]?.[field]||'')+'" maxlength="60"></label>').join('')+'</div></section>').join('');$('profiles').showModal();};
$('closeProfiles').onclick=()=>$('profiles').close();$('profileForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{const map={};for(const row of $('profileRows').children){map[row.dataset.profile]={};for(const input of row.querySelectorAll('input'))map[row.dataset.profile][input.dataset.profileField]=input.value;}profiles=await api('profiles',{revision:profileRevision,categories:map});profileRevision=profiles.revision;$('profileStatus').textContent='Bu firmaya ait taslak eşleştirmeler kaydedildi.';}catch(e){$('profileStatus').textContent=e.message;}finally{button.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(!document.hidden&&!busy&&!$('editor').open&&!$('profiles').open)refresh().catch(e=>{$('sync').textContent=e.message;});},15000);
run(refresh);
