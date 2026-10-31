(() => {
'use strict';
const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',invoices:'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3',folders:'M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM3 9h18',notifications:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',check:'m5 12 4 4L19 6',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',file:'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6',arrow:'M5 12h14m-6-6 6 6-6 6',alert:'M12 3 2 21h20ZM12 9v5M12 17v1',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'};
const icon=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.file)+'"/></svg>';
const labels={dashboard:'Genel bakış',invoices:'Faturalar',folders:'Klasörler',notifications:'Bildirimler'},navIcons={dashboard:'home',invoices:'invoices',folders:'folders',notifications:'notifications'};
const params=new URLSearchParams(location.search);
let state={companies:[],events:[]},view=params.get('view')||'dashboard',company=params.get('company')||'all',status='all',month='',query='',rows=[],offset=0,more=false,selected=new Map(),currentFolder=null,devices=[],pushId=null,loading=false,noticeTimer,toastTimer,searchTimer;
let invoiceRequest=0,folderRequest=0;
let registrationPromise='serviceWorker' in navigator?navigator.serviceWorker.register('/push-sw.js',{scope:'/'}).catch(()=>null):Promise.resolve(null);
const date=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms)):'—';
const datetime=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'Henüz kontrol edilmedi';
const time=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'—';
const money=(n,c)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:/^[A-Z]{3}$/.test(c)?c:'TRY',maximumFractionDigits:2}).format(n);
const monthName=m=>m?new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z')).replace(/^./,c=>c.toLocaleUpperCase('tr')):'Bütün aylar';
const active=()=>state.companies.filter(c=>company==='all'||c.company.id===company);
const info=id=>state.companies.find(c=>c.company.id===id);
const apiURL=(id,action)=>'/api/automation/'+encodeURIComponent(id)+'/'+action;
async function api(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  if(response.status===401){location.href='/login';throw Error('Oturumunu yeniden aç.');}
  let data;try{data=await response.json();}catch{throw Error('Sunucudan yanıt alınamadı.');}
  if(!response.ok)throw Error(data.error||'İşlem tamamlanamadı.');return data;
}
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,14000);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function busy(button,fn){if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){notice(e.message);}finally{button.disabled=false;}}
function empty(title,text,symbol='invoices'){return '<div class="empty-state">'+icon(symbol)+'<h3>'+escape(title)+'</h3><p>'+escape(text)+'</p></div>';}
function initNav(){
  const html=Object.entries(labels).map(([id,label])=>'<button class="nav-item" data-view="'+id+'">'+icon(navIcons[id])+'<span>'+label+'</span></button>').join('');
  document.querySelectorAll('.desktop-nav,.bottom-nav').forEach(nav=>{nav.innerHTML=html;nav.addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)changeView(button.dataset.view);});});
  $('openNotifications').innerHTML=icon('notifications');$('bellIllustration').innerHTML=icon('notifications');$('dialogFolderIcon').innerHTML=icon('folders');
  $('todayLabel').textContent=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'numeric',month:'long',weekday:'long'}).format(new Date()).toLocaleUpperCase('tr-TR');
}
function updateAddress(){const p=new URLSearchParams();if(company!=='all')p.set('company',company);if(view!=='dashboard')p.set('view',view);history.replaceState(null,'','/takip'+(p.size?'?'+p:''));}
async function changeView(next){
  if(!labels[next])next='dashboard';view=next;updateAddress();
  document.querySelectorAll('.view').forEach(n=>n.hidden=n.id!==next+'View');
  document.querySelectorAll('[data-view]').forEach(n=>{n.classList.toggle('active',n.dataset.view===next);if(n.dataset.view===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  if(next==='dashboard')renderDashboard();
  try{if(next==='invoices')await loadInvoices();if(next==='folders')await loadFolders();if(next==='notifications')await renderNotifications();}catch(e){notice(e.message);}
}
function renderCompanies(){
  $('companyStrip').innerHTML='<button class="company-pill '+(company==='all'?'active':'')+'" data-company="all">Tüm firmalar</button>'+state.companies.map(c=>'<button class="company-pill '+(company===c.company.id?'active':'')+'" data-company="'+c.company.id+'" style="--company:'+escape(c.company.color)+'"><i></i>'+escape(c.company.name)+'</button>').join('');
}
function renderDashboard(){
  const items=active(),totals=items.reduce((t,c)=>{for(const k of ['fresh','done','pdfs','folders'])t[k]+=(c.counts?.[k]||0);return t;},{fresh:0,done:0,pdfs:0,folders:0});
  const running=items.some(c=>c.running),errors=items.filter(c=>c.status?.error||!c.connected),enabled=items.some(c=>c.settings?.enabled);
  const next=Math.min(...items.filter(c=>c.settings?.enabled).map(c=>c.nextCheck));
  const title=running?'Faturaların kontrol ediliyor':!items.length?'Henüz etkin firma yok':!enabled?'Otomasyon duraklatıldı':errors.length?'Kontrol edilmesi gereken bir bağlantı var':'Otomatik takip hazır';
  const note=running?'PDF’ler özel arşivine hazırlanıyor. Bu ekranı açık tutman gerekmez.':!enabled?'Firma kartından otomatik takibi yeniden açabilirsin.':'Hafta içi iki saatte bir. Önceki aya geç gelen faturalar da kontrol edilir.';
  $('dashboardView').innerHTML='<div class="summary-grid">'+[
    ['fresh','Yeni gelen','İşaretlemediğin faturalar','invoices'],['done','İşlendi','Geri alabilirsin','check'],['pdfs','PDF arşivde','Cihazına otomatik indirilmez','file'],['folders','Özel klasör','Firma ve aya göre ayrılır','folders']
  ].map(([key,label,caption,symbol],i)=>'<article class="stat-card '+(!i?'primary':'')+'"><div class="stat-top"><span>'+label+'</span>'+icon(symbol)+'</div><div class="stat-number">'+totals[key]+'</div><div class="stat-note">'+caption+'</div></article>').join('')+'</div><div class="schedule-panel"><div class="schedule-symbol">'+icon(running?'clock':errors.length?'alert':'check')+'</div><div class="schedule-copy"><strong>'+title+'</strong><p>'+note+'</p></div><div class="schedule-time">'+(Number.isFinite(next)?time(next):'—')+'<small>'+(Number.isFinite(next)?date(next)+' · sonraki kontrol':'Otomatik kontrol kapalı')+'</small></div></div><div class="section-head"><div><p class="eyebrow">FİRMALARIN</p><h2>Bir bakışta durum</h2></div><span class="subtle">İşlenmeyen faturalar yeni olarak kalır.</span></div><div class="company-grid">'+items.map(c=>{
    const health=c.error||c.status?.error||(!c.connected?'İzibiz bağlantısı eksik':c.running?c.status?.progress||'Kontrol devam ediyor':c.status?.lastSuccess?'Son kontrol · '+datetime(c.status.lastSuccess):'İlk kontrol · '+datetime(c.nextCheck));
    return '<article class="company-card" style="--company:'+escape(c.company.color)+'"><div class="company-card-head"><span class="company-initial">'+escape(c.company.initials)+'</span><div><h3>'+escape(c.company.name)+'</h3><div class="health '+(c.status?.error||!c.connected?'error':'')+'">'+escape(health)+'</div></div></div><div class="company-stats"><strong>'+(c.counts?.fresh||0)+'</strong><span>yeni gelen</span><span>· '+(c.counts?.done||0)+' işlendi</span></div><div class="company-card-actions"><button class="text-button" data-open-company="'+c.company.id+'">Faturaları gör ↗</button><span>'+((c.bytes||0)/1024/1024).toFixed(1)+' / '+Math.round((c.capacity||536870912)/1024/1024)+' MB</span><button class="text-button muted" data-toggle="'+c.company.id+'" data-enabled="'+(!c.settings?.enabled)+'">'+(c.settings?.enabled?'Duraklat':'Takibi aç')+'</button></div></article>';
  }).join('')+'</div>';
}
async function refresh(){
  if(loading)return;loading=true;try{state=await api('/api/automation');if(company!=='all'&&!info(company))company='all';renderCompanies();await changeView(view);}catch(e){notice(e.message);}finally{loading=false;}
}
async function loadInvoices(append=false){
  const request=++invoiceRequest;
  if(!append){offset=0;selected.clear();}
  const requests=active().map(async c=>{const p=new URLSearchParams({offset:String(offset),status,month,q:query});const data=await api(apiURL(c.company.id,'invoices')+'?'+p);return {...data,company:c.company};});
  const result=await Promise.all(requests);if(request!==invoiceRequest)return;const loaded=result.flatMap(d=>d.rows.map(r=>({...r,company:d.company})));
  rows=append?[...rows,...loaded]:loaded;rows.sort((a,b)=>b.firstSeen-a.firstSeen||b.tarih.localeCompare(a.tarih));
  more=result.some(d=>d.total>offset+d.rows.length);
  const months=[...new Set(result.flatMap(d=>d.months))].sort().reverse();$('monthFilter').innerHTML='<option value="">Bütün aylar</option>'+months.map(m=>'<option value="'+m+'">'+escape(monthName(m))+'</option>').join('');$('monthFilter').value=month;
  $('invoiceList').innerHTML=rows.length?rows.map(invoiceHTML).join(''):empty('Kutun sakin.','Faturalar kontrol edildiğinde burada görünecek. İlk kontrolde önceki ay ve güncel ay birlikte taranır.');
  $('loadMore').hidden=!more;$('scanButton').disabled=!active().length||active().some(c=>c.running);$('baselineButton').disabled=company==='all';renderSelection();
}
function invoiceHTML(r){
  const key=r.company.id+':'+r.uuid,label=r.done?'İŞLENDİ':r.isRet?'REDDEDİLDİ':'YENİ GELEN';
  return '<article class="invoice-row '+(r.done?'done':'')+'" style="--company:'+escape(r.company.color)+'"><input type="checkbox" data-select="'+key+'" aria-label="'+escape(r.fatno)+' faturasını seç" '+(r.isRet?'disabled':'')+'><div><div class="invoice-company">'+escape(r.company.name)+'</div><h3 class="invoice-title">'+escape(r.unvan)+'</h3><div class="invoice-meta"><span class="mono">'+escape(r.fatno)+'</span><span>'+escape(r.tarih.split('-').reverse().join('.'))+'</span><span>'+escape(r.yanit)+'</span></div><div class="invoice-actions">'+(r.pdfReady?'<a href="'+apiURL(r.company.id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">PDF’i aç ↗</a>':'<span class="health error">'+escape(r.pdfError?'PDF hazırlanamadı':'PDF hazırlanıyor')+'</span>')+(!r.isRet?'<button data-mark="'+key+'" data-done="'+(!r.done)+'">'+(r.done?'İşareti geri al':'İşlendi olarak işaretle')+'</button>':'')+'</div></div><div class="invoice-right"><span class="invoice-amount">'+escape(money(r.tutar,r.birim))+'</span><span class="status-chip '+(r.done?'done':r.isRet?'ret':'')+'">'+label+'</span></div></article>';
}
function renderSelection(){$('selectionBar').hidden=!selected.size;$('selectedCount').textContent=selected.size+' fatura seçili';}
async function mark(items,done){
  const groups=new Map();for(const row of items){const id=row.company.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push({uuid:row.uuid,revision:row.revision});}
  let finished=0;
  try{for(const [id,values] of groups){for(let i=0;i<values.length;i+=100){await api(apiURL(id,'mark'),{items:values.slice(i,i+100),done});finished+=Math.min(100,values.length-i);}}toast(done?finished+' fatura işlendi olarak kaydedildi.':finished+' fatura yeniden YENİ GELEN olarak kaydedildi.');}finally{selected.clear();await refresh();}
}
async function loadFolders(){
  const request=++folderRequest;
  const result=await Promise.all(active().map(async c=>({...await api(apiURL(c.company.id,'folders')),company:c.company})));
  if(request!==folderRequest)return;
  const folders=result.flatMap(d=>d.folders.map(f=>({...f,company:d.company}))).sort((a,b)=>b.date.localeCompare(a.date)||b.month.localeCompare(a.month));
  $('folderList').innerHTML=folders.length?folders.map(f=>'<article class="folder-card"><div class="folder-top"><span class="folder-icon">'+icon('folders')+'</span><span class="folder-month">'+escape(monthName(f.month))+'</span></div><h3>'+escape(f.name)+'</h3><div class="folder-detail"><span>'+f.pdfs+' PDF</span><span>'+f.pending+' yeni gelen</span><span>'+(f.excel?(f.excel.current?'Excel hazır':'Excel güncellenebilir'):'Excel henüz oluşturulmadı')+'</span></div><div class="folder-action"><button class="text-button" data-folder="'+f.id+'" data-company-id="'+f.company.id+'">Klasörü aç ↗</button><a class="text-button muted" href="'+apiURL(f.company.id,'export')+'?folder='+f.id+'" download>Mac / Windows’a aktar</a></div></article>').join(''):empty('Arşivin burada oluşacak.','PDF’ler geldiğinde firması, fatura ayı ve siteye alındığı tarih ile klasörlenir. Excel yalnızca sen istediğinde oluşturulur.','folders');
}
async function openFolder(id,folder){
  currentFolder={id,folder};const c=info(id);if(!c)throw Error('Firma bulunamadı.');
  const result=await api(apiURL(id,'folders')),group=result.folders.find(f=>f.id===folder);if(!group)throw Error('Klasör bulunamadı.');
  const data=await api(apiURL(id,'invoices')+'?folder='+folder);
  $('folderContent').innerHTML='<h2>'+escape(group.name)+'</h2><p class="subtle">'+group.pdfs+' PDF · '+group.pending+' yeni gelen. Kontrollerini Faturalar ekranından yapabilirsin.</p><div class="dialog-actions"><button class="primary-button" data-folder-action="excel">'+(group.excel?'Güncel Excel’i hazırla':'Excel’i hazırla')+'</button><a class="secondary-button" href="'+apiURL(id,'export')+'?folder='+folder+'" download>Klasörü dışa aktar</a></div><div class="excel-note">'+(group.excel?'<strong>'+escape(group.excel.name)+'</strong><br>'+datetime(group.excel.at)+' tarihinde oluşturuldu. '+(group.excel.current?'İşaretlerinle güncel.':'Son işaretlemelerin bu Excel’de henüz yok; yeniden hazırlayabilirsin.')+'<br><a class="text-button" href="'+apiURL(id,'export')+'?folder='+folder+'&excel=1" download>Excel’i indir ↗</a>':'Excel hazırlanmadı. Hazırladığında bu klasöre eklenir; o andaki İŞLENDİ / YENİ GELEN işaretlerin kullanılır.')+'</div>'+data.rows.map(r=>'<div class="folder-file">'+icon('file')+'<a href="'+apiURL(id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">'+escape(r.unvan+' - '+r.fatno)+'.pdf<small>'+escape(r.tarih.split('-').reverse().join('.'))+'</small></a><span class="status-chip '+(r.done?'done':'')+'">'+(r.done?'İŞLENDİ':'YENİ GELEN')+'</span></div>').join('')+(data.total>data.rows.length?'<p class="fineprint">İlk '+data.rows.length+' dosya gösteriliyor. Dışa aktarma klasörün tamamını içerir.</p>':'')+'<button class="danger-button folder-delete" data-folder-action="delete">Klasörü sil</button><p class="fineprint subtle">Dosyaları siler. Faturaların işlem durumu korunur; aynı PDF’ler tekrar alınmaz.</p>';
  if(!$('folderDialog').open)$('folderDialog').showModal();
}
async function renderNotifications(){
  if(navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{});
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const supported='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;
  const registration=await registrationPromise,subscription=registration?await registration.pushManager.getSubscription():null;
  const data=await api('/api/push/devices');devices=data.devices;
  pushId=subscription?await subscriptionId(subscription.endpoint):null;
  const saved=devices.find(d=>d.id===pushId);
  const ready=!!saved&&saved.active!==false&&supported&&Notification.permission==='granted';
  $('pushStatus').textContent=ready?'● Bu cihaz bağlı. Bildirimler açık.':ios&&!standalone?'iPhone’da önce Ana Ekrana Ekle adımını tamamla.':!supported?'Bu tarayıcı bildirimleri desteklemiyor.':Notification.permission==='denied'?'Bildirim izni kapalı. Cihazın bildirim ayarlarından açabilirsin.':'Bu cihaz henüz bağlı değil.';
  $('enablePush').hidden=ready;$('enablePush').disabled=!supported||(ios&&!standalone)||(supported&&Notification.permission==='denied');
  $('testPush').hidden=!ready;
  $('pushHelp').textContent=ios&&!standalone?'Safari’de Paylaş menüsünü aç → Ana Ekrana Ekle. Soyturk Works simgesinden uygulamayı aç ve burada bildirimlere izin ver.':'Bildirimler yeni PDF’ler hazır olduğunda gelir. Otomatik bildirimler hafta içi 09.00–18.00 arasındadır. Deneme bildirimini istediğin zaman gönderebilirsin.';
  $('deviceList').innerHTML=devices.map(d=>'<div class="device-row">'+icon('notifications')+'<span>'+escape(d.name)+'<small class="subtle"> · '+datetime(d.lastSent||d.created)+'</small></span><button data-remove-device="'+d.id+'">Kaldır</button></div>').join('');
  $('eventList').innerHTML=state.events.length?state.events.map(e=>'<article class="event">'+icon(e.kind==='error'?'alert':'notifications')+'<div><strong>'+escape(e.title)+'</strong><p>'+escape(e.body)+'</p><time>'+datetime(e.created)+'</time><a class="text-button" href="'+escape(e.url)+'">İlgili firmayı aç ↗</a></div></article>').join(''):empty('Henüz bildirim yok.','Yeni bir fatura bulunduğunda hem telefonunda hem burada görebilirsin.','notifications');
}
async function subscriptionId(endpoint){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function publicBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
$('enablePush').onclick=()=>busy($('enablePush'),async()=>{
  const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Bildirim izni verilmedi. İstediğinde ayarlardan açabilirsin.');await renderNotifications();return;}
  const registration=await registrationPromise;if(!registration)throw Error('Bildirim hizmeti açılamadı. Sayfayı yenileyip yeniden dene.');
  await navigator.serviceWorker.ready;const config=await api('/api/push/config');
  const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicBytes(config.publicKey)});
  const name=/iPhone/.test(navigator.userAgent)?'iPhone’um':/Mac/.test(navigator.platform)?'Mac’im':/Win/.test(navigator.platform)?'Windows bilgisayarım':'Cihazım';
  await api('/api/push/subscribe',{subscription:sub.toJSON(),name});await renderNotifications();toast('Bu cihazın bildirimleri açıldı.');
});
$('testPush').onclick=()=>busy($('testPush'),async()=>{await api('/api/push/test',{id:pushId});toast('Deneme bildirimi gönderildi. Telefonunun bildirimlerini kontrol et.');});
$('companyStrip').onclick=async e=>{const button=e.target.closest('[data-company]');if(!button)return;company=button.dataset.company;selected.clear();renderCompanies();await changeView(view);};
$('openNotifications').onclick=()=>changeView('notifications');
$('refreshButton').onclick=()=>busy($('refreshButton'),refresh);
$('dashboardView').onclick=e=>{
  const open=e.target.closest('[data-open-company]'),toggle=e.target.closest('[data-toggle]');
  if(open){company=open.dataset.openCompany;renderCompanies();changeView('invoices');}
  if(toggle)busy(toggle,async()=>{await api(apiURL(toggle.dataset.toggle,'settings'),{enabled:toggle.dataset.enabled==='true'});await refresh();});
};
$('statusFilters').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;status=b.dataset.status;$('statusFilters').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));loadInvoices().catch(e=>notice(e.message));};
$('monthFilter').onchange=()=>{month=$('monthFilter').value;loadInvoices().catch(e=>notice(e.message));};
$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=$('searchInput').value.trim();loadInvoices().catch(e=>notice(e.message));},250);};
$('loadMore').onclick=()=>busy($('loadMore'),async()=>{offset+=100;await loadInvoices(true);});
$('invoiceList').onchange=e=>{const key=e.target.dataset.select;if(!key)return;const row=rows.find(r=>r.company.id+':'+r.uuid===key);if(e.target.checked)selected.set(key,row);else selected.delete(key);renderSelection();};
$('invoiceList').onclick=e=>{const b=e.target.closest('[data-mark]');if(b)busy(b,async()=>{const row=rows.find(r=>r.company.id+':'+r.uuid===b.dataset.mark);if(row)await mark([row],b.dataset.done==='true');});};
$('selectionBar').onclick=e=>{const b=e.target.closest('[data-bulk]');if(b)busy(b,()=>mark([...selected.values()],b.dataset.bulk==='true'));};
$('clearSelection').onclick=()=>{selected.clear();$('invoiceList').querySelectorAll('input[type=checkbox]').forEach(n=>n.checked=false);renderSelection();};
$('scanButton').onclick=()=>busy($('scanButton'),async()=>{let count=0;for(const c of active()){await api(apiURL(c.company.id,'scan'),{});count++;}toast(count+' firma için kontrol başlatıldı.');await refresh();});
$('folderList').onclick=e=>{const b=e.target.closest('[data-folder]');if(b)busy(b,()=>openFolder(b.dataset.companyId,b.dataset.folder));};
$('closeFolder').onclick=()=>$('folderDialog').close();
$('folderDialog').addEventListener('click',e=>{if(e.target===$('folderDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('folderContent').onclick=e=>{const b=e.target.closest('[data-folder-action]');if(!b||!currentFolder)return;const {id,folder}=currentFolder;busy(b,async()=>{
  if(b.dataset.folderAction==='delete'){if(!confirm('Bu klasördeki PDF ve Excel dosyaları silinsin mi? İşlem durumları korunur.'))return;await api(apiURL(id,'delete-folder'),{folder});$('folderDialog').close();toast('Klasör silindi. İşlem durumları korundu.');await refresh();}
  else{await api(apiURL(id,'excel'),{folder});await openFolder(id,folder);toast('Güncel Excel bu klasöre eklendi.');}
});};
$('deviceList').onclick=e=>{const b=e.target.closest('[data-remove-device]');if(b)busy(b,async()=>{await api('/api/push/unsubscribe',{id:b.dataset.removeDevice});if(b.dataset.removeDevice===pushId){const registration=await registrationPromise;await(await registration?.pushManager.getSubscription())?.unsubscribe();}await renderNotifications();toast('Cihazın bildirim bağlantısı kaldırıldı.');});};
$('baselineButton').onclick=()=>$('baselineFile').click();
$('baselineFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||company==='all')return;
  busy($('baselineButton'),async()=>{
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),numbers=new Set(),normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
    let found=false;for(const name of workbook.SheetNames){const grid=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:''});const header=grid.findIndex(row=>row.some(v=>['faturano','faturanumarasi','invoicenumber','belgeno'].includes(normalize(v))));if(header<0)continue;found=true;const col=grid[header].findIndex(v=>['faturano','faturanumarasi','invoicenumber','belgeno'].includes(normalize(v)));for(const row of grid.slice(header+1)){const n=String(row[col]||'').trim();if(n&&n.length<100&&!/toplam/i.test(n))numbers.add(n);}}
    if(!found)throw Error('Excel’de Fatura No sütunu bulunamadı.');
    if(!confirm(info(company).company.name+' için bu dosyadaki '+numbers.size+' fatura numarası işlenmiş olarak kaydedilsin mi?'))return;
    const list=[...numbers];for(let i=0;i<list.length;i+=300)await api(apiURL(company,'baseline'),{numbers:list.slice(i,i+300)});
    toast('Başlangıç listesi aktarıldı. Faturaları listeden tekrar düzenleyebilirsin.');await refresh();
  });
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden&&!$('folderDialog').open&&!selected.size)refresh();},30000);
initNav();refresh();
})();
