(() => {
'use strict';
const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',invoices:'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3',folders:'M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM3 9h18',notifications:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',check:'m5 12 4 4L19 6',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',file:'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6',arrow:'M5 12h14m-6-6 6 6-6 6',alert:'M12 3 2 21h20ZM12 9v5M12 17v1',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'};
const icon=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.file)+'"/></svg>';
const labels={invoices:'Faturalar',folders:'Klasörler',notifications:'Bildirimler',dashboard:'Takip durumu'},navIcons={dashboard:'home',invoices:'invoices',folders:'folders',notifications:'notifications'};
const params=new URLSearchParams(location.search);
const companyContext=window.SW_CONTEXT?.company;
if(!companyContext?.id){location.replace('/companies');return;}
const company=companyContext.id,base='/workspace/'+company+'/takip/';
let state={companies:[],events:[]},view=params.get('view')||'invoices',status='all',month=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||'')?params.get('month'):localMonth(),query='',rows=[],offset=0,more=false,selected=new Map(),currentFolder=null,devices=[],pushId=null,loading=false,noticeTimer,toastTimer,searchTimer;
let invoiceRequest=0,folderRequest=0,refreshRequest=0,typeRefreshTimer,periodPinned=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||''),resetting=false,scanning=false,deviceStateKnown=false;
const monthNames=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function localMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit'}).format(new Date());}
let registrationPromise='serviceWorker' in navigator?navigator.serviceWorker.register('/push-sw.js',{scope:'/'}).catch(()=>null):Promise.resolve(null);
const date=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms)):'—';
const datetime=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'Henüz kontrol edilmedi';
const time=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'—';
const money=n=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const monthName=m=>m?new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z')).replace(/^./,c=>c.toLocaleUpperCase('tr')):'Bütün aylar';
const active=()=>state.companies.filter(c=>c.company.id===company);
const info=id=>state.companies.find(c=>c.company.id===id);
const apiURL=(id,action)=>{if(id!==company)throw Error('Bu işlem yalnızca seçili firmada yapılabilir.');return '/api/automation/'+encodeURIComponent(company)+'/'+action;};
const pushURL=action=>'/api/push/'+action+'?company='+encodeURIComponent(company);
async function api(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  if(response.status===401){location.href='/login?next='+encodeURIComponent(base+location.search);throw Error('Oturumunu yeniden aç.');}
  let data;try{data=await response.json();}catch{throw Error('Sunucudan yanıt alınamadı.');}
  if(!response.ok)throw Error(data.error||'İşlem tamamlanamadı.');return data;
}
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,14000);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function busy(button,fn){if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){notice(e.message);}finally{button.disabled=false;}}
function empty(title,text,symbol='invoices'){return '<div class="empty-state">'+icon(symbol)+'<h3>'+escape(title)+'</h3><p>'+escape(text)+'</p></div>';}
function initNav(){
  const html=Object.entries(labels).map(([id,label])=>'<button type="button" class="nav-item" data-view="'+id+'">'+icon(navIcons[id])+'<span>'+label+'</span></button>').join('');
  document.querySelectorAll('.desktop-nav,.bottom-nav').forEach(nav=>{nav.innerHTML=html;nav.addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)changeView(button.dataset.view);});});
  $('openNotifications').innerHTML=icon('notifications');$('dialogFolderIcon').innerHTML=icon('folders');
}
function updateAddress(){const p=new URLSearchParams({view});if(periodPinned)p.set('month',month);history.replaceState(null,'',base+'?'+p);}
function monthCounts(){return info(company)?.monthly?.[month]||{total:0,fresh:0,done:0,rejected:0,pdfs:0,folders:0};}
function updateButtons(){const c=info(company);$('scanButton').disabled=scanning||resetting||!c?.connected||!!c?.running;$('clearAllButton').disabled=resetting||!c||!(c.counts?.total||c.counts?.folders||c.bytes||c.running);}
function renderFilters(){
  const counts=monthCounts();$('statusFilters').querySelectorAll('[data-count]').forEach(n=>n.textContent=counts[n.dataset.count]||0);
  $('statusFilters').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.status===status)));
}
function renderCalendar(){
  const visible=view==='invoices'||view==='folders';$('periodPicker').hidden=!visible;if(!visible)return;
  const year=Number(month.slice(0,4)),current=Number(localMonth().slice(0,4)),stored=Object.keys(info(company)?.monthly||{}).map(m=>Number(m.slice(0,4)));
  const first=Math.min(current-5,year,...stored),last=Math.max(current+5,year),options=[];for(let y=last;y>=first;y--)options.push('<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>');$('yearSelect').innerHTML=options.join('');
  $('periodHint').textContent=view==='folders'?'Arşivini görmek için ay seç.':'Faturalarını görmek için ay seç.';
  $('monthGrid').innerHTML=monthNames.map((name,i)=>{const value=year+'-'+String(i+1).padStart(2,'0'),c=info(company)?.monthly?.[value]||{},n=view==='folders'?c.pdfs||0:c.total||0;return '<button type="button" class="month-tile '+(value===month?'active':'')+'" data-month="'+value+'" aria-pressed="'+(value===month)+'"><span>'+name+'</span><small>'+n+(view==='folders'?' PDF':' fatura')+'</small>'+((c.fresh||0)&&view==='invoices'?'<em>'+c.fresh+' yeni</em>':'')+'</button>';}).join('');
  $('invoiceHeading').textContent=monthName(month)+' Faturaları';$('folderHeading').textContent=monthName(month)+' Arşivi';renderFilters();
}
async function selectPeriod(value){
  month=value;periodPinned=true;status='all';query='';clearTimeout(searchTimer);$('searchInput').value='';selected.clear();await changeView(view);
}
function renderTrackingStatus(){
  const c=info(company);$('trackingStatus').hidden=!['invoices','folders'].includes(view);if(!c)return;
  const enabled=c.connected&&c.settings?.enabled,activeDevices=devices.filter(d=>d.active!==false),title=!c.connected?'İzibiz bağlantısı gerekli':c.updatingTypes?'Fatura bilgileri güncelleniyor':c.running?'İzibiz çalışıyor':c.status?.error?'Son kontrol tamamlanamadı':enabled?'Otomatik takip açık':'Otomatik takip kapalı';
  const note=c.running?c.status?.progress||'Faturalar alınıyor.':c.status?.error?c.status.error:enabled?'Hafta içi 09 · 11 · 13 · 15 · 17. Düğmeye basman gerekmez.':!c.connected?'Bağlantıyı çalışma alanındaki İzibiz ayarlarından kur.':'İstersen elle alabilir veya Takip durumu bölümünden açabilirsin.';
  const last=c.status?.lastFinished||c.status?.lastSuccess;
  $('trackingStatus').innerHTML='<div class="tracking-mode"><span class="mode-dot '+(enabled?'on':'off')+'"></span><div><strong>'+escape(title)+'</strong><p>'+escape(note)+'</p></div><button class="text-button" data-go-view="dashboard">Ayarlar</button></div><div class="tracking-times"><span>Son kontrol <strong>'+datetime(last)+'</strong></span><span>Sonraki <strong>'+(enabled?datetime(c.nextCheck):'Kapalı')+'</strong></span></div><button type="button" class="tracking-notifications" data-go-view="notifications">'+icon('notifications')+'<span>Telefon bildirimleri<small>'+(!deviceStateKnown?'Durum alınamadı':activeDevices.length?activeDevices.length+' cihaz bağlı':'Henüz cihaz bağlı değil')+'</small></span><b>›</b></button>';
}
async function changeView(next){
  if(!labels[next])next='invoices';view=next;updateAddress();
  document.querySelectorAll('.view').forEach(n=>n.hidden=n.id!==next+'View');
  document.querySelectorAll('[data-view]').forEach(n=>{n.classList.toggle('active',n.dataset.view===next);if(n.dataset.view===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  renderTrackingStatus();renderCalendar();updateButtons();
  try{if(next==='dashboard')renderDashboard();if(next==='invoices')await loadInvoices();if(next==='folders')await loadFolders();if(next==='notifications')await renderNotifications();}catch(e){notice(e.message);}
}
function renderIdentity(){
  $('systemTitle').textContent='İzibiz - '+companyContext.name+' Gelen E-Fatura Takip Sistemi';$('breadcrumb').textContent=companyContext.name+' / Fatura Takibi';
  $('workspaceBack').href='/workspace/'+company+'/';$('workspaceBack').textContent=companyContext.name+' çalışma alanına dön ↗';
  document.querySelectorAll('.brand,.mobile-brand').forEach(a=>a.href='/workspace/'+company+'/');document.title=companyContext.name+' · Gelen E-Fatura Takibi · Soyturk Works';
}
function renderDashboard(){
  const c=info(company);if(!c)return;const enabled=!!c.settings?.enabled,counts=monthCounts(),connected=devices.filter(d=>d.active!==false);
  const stats=[['total','Tüm faturalar','all'],['fresh','Yeni gelen','new'],['done','İşlendi','done'],['rejected','Reddedildi','rejected']];
  $('dashboardContent').innerHTML='<div class="automation-settings settings-panel"><div class="automation-heading"><h3>Otomatik takip</h3><span class="mode-badge '+(enabled&&c.connected?'on':'')+'">'+(!c.connected?'Bağlantı gerekli':enabled?'AÇIK':'KAPALI')+'</span></div><p>Açıkken bilgisayarın ve bu sayfa kapalı olsa da kontrol devam eder.</p><dl class="automation-facts"><div><dt>Kontrol saatleri</dt><dd>Hafta içi 09 · 11 · 13 · 15 · 17</dd></div><div><dt>Son kontrol</dt><dd>'+datetime(c.status?.lastFinished||c.status?.lastSuccess)+'</dd></div><div><dt>Sonraki kontrol</dt><dd>'+(enabled&&c.connected?datetime(c.nextCheck):'Kapalı')+'</dd></div></dl>'+(c.status?.error?'<p class="health error">'+escape(c.status.error)+'</p>':'')+'<button class="'+(enabled?'secondary':'primary')+'-button" data-toggle="'+company+'" data-enabled="'+!enabled+'" '+(!c.connected?'disabled':'')+'>'+(enabled?'Otomatik takibi durdur':'Otomatik takibi aç')+'</button></div><div class="section-head"><h3>'+escape(monthName(month))+'</h3></div><div class="summary-grid">'+stats.map(([key,label,filter])=>'<button type="button" class="stat-card" data-invoice-filter="'+filter+'"><span class="stat-top">'+label+' '+icon('invoices')+'</span><span class="stat-number">'+(counts[key]||0)+'</span><span class="stat-note">Faturaları göster ↗</span></button>').join('')+'</div><button class="notification-link-card" data-go-view="notifications">'+icon('notifications')+'<span><strong>Telefon bildirimleri</strong><small>'+(connected.length?connected.length+' cihaz bağlı. Deneme gönderebilirsin.':'Telefonundan bildirim iznini aç.')+'</small></span><b>›</b></button>';
}
async function refresh(force=false){
  if(resetting&&!force||loading&&!force)return;const request=++refreshRequest;loading=true;
  try{
    const [summary,events,subscriptions]=await Promise.all([api(apiURL(company,'summary')),api(apiURL(company,'events')).catch(()=>({events:[]})),api(pushURL('devices')).catch(()=>null)]);
    if(request!==refreshRequest)return;if(summary.company.id!==company)throw Error('Firma bilgisi doğrulanamadı.');state={companies:[summary],events:events.events};devices=subscriptions?.devices||[];deviceStateKnown=!!subscriptions;
    if(!periodPinned)month=localMonth();clearTimeout(typeRefreshTimer);if(summary.running)typeRefreshTimer=setTimeout(()=>{if(!document.hidden&&!$('folderDialog').open&&!selected.size)refresh();},2000);await changeView(view);
  }catch(e){if(request===refreshRequest)notice(e.message);}finally{if(request===refreshRequest)loading=false;}
}
async function loadInvoices(append=false){
  const request=++invoiceRequest;if(!append){offset=0;selected.clear();}
  const p=new URLSearchParams({offset:String(offset),status,month,q:query}),data=await api(apiURL(company,'invoices')+'?'+p);if(request!==invoiceRequest)return;
  const loaded=data.rows.map(r=>({...r,company:companyContext}));rows=append?[...rows,...loaded]:loaded;rows.sort((a,b)=>a.tarih.localeCompare(b.tarih)||(a.firstSeen||0)-(b.firstSeen||0)||a.fatno.localeCompare(b.fatno,'tr')||a.uuid.localeCompare(b.uuid));more=data.total>offset+data.rows.length;
  const start=info(company)?.period?.startMonth,before=start&&month<start;
  const note=query||status!=='all'?'Seçtiğin filtreye uygun fatura bulunamadı.':before?'Takip '+monthName(start)+' ayında başladı.':month===localMonth()?'İzibiz Sistemini Başlat ile şimdi alabilir veya otomatik kontrolü bekleyebilirsin.':'Bu ay için kayıtlı fatura bulunmuyor.';
  $('invoiceList').innerHTML=rows.length?invoiceHeader()+rows.map(invoiceHTML).join(''):empty(monthName(month)+' için fatura yok',note);
  $('loadMore').hidden=!more;renderSelection();renderFilters();updateButtons();
}
const invoiceColumns=[['number','FATURA NUMARASI'],['date','TARİH'],['supplier','FİRMA ADI'],['type','FATURA TİPİ'],['amount-cell','TUTAR'],['currency','BİRİM']];
function invoiceHeader(){return '<div class="invoice-table-head" aria-hidden="true"><span class="invoice-select-label">SEÇ</span><div class="invoice-fields">'+invoiceColumns.map(([,title])=>'<span class="invoice-column-heading">'+title+'</span>').join('')+'</div><span class="invoice-status-heading">DURUM</span></div>';}
function invoiceHTML(r){
  const key=r.company.id+':'+r.uuid,label=r.isRet?'REDDEDİLDİ':r.done?'İŞLENDİ':'YENİ GELEN';
  const type=r.tipLabel||((r.profile?({TEMELFATURA:'Temel',TICARIFATURA:'Ticari'})[r.profile]||r.profile:'—')+' - '+(({SATIS:'Satış',IADE:'İade',TEVKIFAT:'Tevkifat',ISTISNA:'İstisna',OZELMATRAH:'Özel matrah',IHRACKAYITLI:'İhraç kayıtlı',SGK:'SGK'})[r.tip]||r.tip||'—'));
  const values=[r.fatno,r.tarih.split('-').reverse().join('.'),r.unvan,type,money(r.tutar),r.birim||'TRY'];
  const fields=invoiceColumns.map(([name,title],i)=>'<div class="invoice-field invoice-'+name+'"><span class="invoice-field-label">'+title+'</span>'+(name==='supplier'?'<h3 class="invoice-title invoice-value">':'<span class="invoice-value'+(name==='amount-cell'?' invoice-amount':'')+'">')+escape(values[i])+(name==='supplier'?'</h3>':'</span>')+'</div>').join('');
  return '<article class="invoice-row '+(r.done&&!r.isRet?'done':'')+'" style="--company:'+escape(r.company.color)+'"><input type="checkbox" data-select="'+key+'" aria-label="'+escape(r.fatno)+' faturasını seç" '+(r.isRet?'disabled':'')+'><div class="invoice-fields">'+fields+'</div><div class="invoice-right"><span class="status-chip '+(r.isRet?'ret':r.done?'done':'')+'">'+label+'</span></div><div class="invoice-actions">'+(r.pdfReady?'<a href="'+apiURL(r.company.id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">PDF’i aç ↗</a>':r.isRet?'':'<span class="health error">'+escape(r.pdfError?'PDF hazırlanamadı':'PDF hazırlanıyor')+'</span>')+(!r.isRet?'<button data-mark="'+key+'" data-done="'+(!r.done)+'">'+(r.done?'İşareti geri al':'İşlendi olarak işaretle')+'</button>':'')+'<span class="invoice-reply">İzibiz yanıtı: '+escape(r.yanit||'—')+'</span></div></article>';
}
function renderSelection(){$('selectionBar').hidden=!selected.size;$('selectedCount').textContent=selected.size+' fatura seçili';}
async function mark(items,done){
  const groups=new Map();for(const row of items){const id=row.company.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push({uuid:row.uuid,revision:row.revision});}
  let finished=0;
  try{for(const [id,values] of groups){for(let i=0;i<values.length;i+=100){await api(apiURL(id,'mark'),{items:values.slice(i,i+100),done});finished+=Math.min(100,values.length-i);}}toast(done?finished+' fatura işlendi olarak kaydedildi.':finished+' fatura yeniden YENİ GELEN olarak kaydedildi.');}finally{selected.clear();await refresh();}
}
async function loadFolders(){
  const request=++folderRequest,data=await api(apiURL(company,'folders')+'?'+new URLSearchParams({month}));if(request!==folderRequest)return;
  const folders=data.folders.sort((a,b)=>a.date.localeCompare(b.date));
  $('folderList').innerHTML=folders.length?folders.map(f=>'<article class="folder-card"><div class="folder-top"><span class="folder-icon">'+icon('folders')+'</span><span class="folder-file-count">'+f.pdfs+' PDF</span></div><p class="folder-date-label">ALINMA TARİHİ</p><h3>'+escape(new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(f.date+'T12:00:00Z')))+'</h3><div class="folder-detail"><span>'+f.pending+' yeni gelen</span><span>'+(f.excel?(f.excel.current?'Excel hazır':'Excel güncellenebilir'):'Excel hazırlanmadı')+'</span></div><div class="folder-action"><button class="text-button" data-folder="'+f.id+'" data-company-id="'+company+'">Dosyaları aç ↗</button><a class="text-button muted" href="'+apiURL(company,'export')+'?folder='+f.id+'" download>ZIP indir</a></div></article>').join(''):empty(monthName(month)+' arşivi boş',month<(info(company)?.period?.startMonth||'')?'Takip '+monthName(info(company).period.startMonth)+' ayında başladı.':'PDF’ler alındığında bu ayın dosyaları burada görünür.','folders');
}
async function openFolder(id,folder){
  currentFolder={id,folder};const c=info(id);if(!c)throw Error('Firma bulunamadı.');
  const result=await api(apiURL(id,'folders')),group=result.folders.find(f=>f.id===folder);if(!group)throw Error('Klasör bulunamadı.');
  const data=await api(apiURL(id,'invoices')+'?folder='+folder);
  $('folderContent').innerHTML='<h2>'+escape(group.name)+'</h2><p class="subtle">'+group.pdfs+' PDF · '+group.pending+' yeni gelen. </p><div class="dialog-actions"><button class="primary-button" data-folder-action="excel">'+(group.excel?'Excel’i güncelle':'Excel’i hazırla')+'</button><a class="secondary-button" href="'+apiURL(id,'export')+'?folder='+folder+'" download>ZIP indir</a></div><div class="excel-note">'+(group.excel?'<strong>'+escape(group.excel.name)+'</strong><br>'+datetime(group.excel.at)+' tarihinde oluşturuldu. '+(group.excel.current?'Ayın tüm faturalarıyla güncel.':'Ayın faturaları veya işaretlerin değişti; güncel Excel’i yeniden hazırlayabilirsin.')+'<br><a class="text-button" href="'+apiURL(id,'export')+'?folder='+folder+'&excel=1" download>Excel’i indir ↗</a>':'Excel hazırlanmadı. Hazırladığında bu firmada aynı aya ait bütün faturaları, önceki günlerden kalanlar dahil, o andaki İŞLENDİ / YENİ GELEN işaretleriyle içerir ve bu klasöre eklenir.')+'</div>'+data.rows.map(r=>'<div class="folder-file">'+icon('file')+'<a href="'+apiURL(id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">'+escape(r.unvan+' - '+r.fatno)+'.pdf<small>'+escape(r.tarih.split('-').reverse().join('.'))+'</small></a><span class="status-chip '+(r.done?'done':'')+'">'+(r.isRet?'REDDEDİLDİ':r.done?'İŞLENDİ':'YENİ GELEN')+'</span></div>').join('')+(data.total>data.rows.length?'<p class="fineprint">İlk '+data.rows.length+' dosya gösteriliyor. Dışa aktarma klasörün tamamını içerir.</p>':'')+'<button class="danger-button folder-delete" data-folder-action="delete">Klasörü sil</button><p class="fineprint subtle">Dosyaları siler. Faturaların işlem durumu korunur; aynı PDF’ler tekrar alınmaz.</p>';
  if(!$('folderDialog').open)$('folderDialog').showModal();
}
async function renderNotifications(){
  if(navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{});
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const supported='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;
  const registration=await registrationPromise,subscription=registration?await registration.pushManager.getSubscription():null;
  const data=await api(pushURL('devices'));devices=data.devices;deviceStateKnown=true;pushId=subscription?await subscriptionId(subscription.endpoint):null;
  const saved=devices.find(d=>d.id===pushId),ready=!!saved&&saved.active!==false&&supported&&Notification.permission==='granted';
  $('pushStatus').textContent=ready?'Bu cihazda '+companyContext.name+' bildirimleri açık.':ios&&!standalone?'Önce Safari’den Ana Ekrana Ekle.':!supported?'Bu tarayıcıda bildirim açılamıyor.':Notification.permission==='denied'?'Bildirim izni kapalı. Telefonunun ayarlarından açabilirsin.':'Bu cihazda bildirimler henüz açık değil.';
  $('enablePush').hidden=ready;$('enablePush').disabled=!supported||(ios&&!standalone)||(supported&&Notification.permission==='denied');$('testPush').hidden=!ready;
  $('pushHelp').textContent=ios?(standalone?'Bildirimler bu telefona gelir. Deneme göndererek kontrol edebilirsin.':'Safari → Paylaş → Ana Ekrana Ekle. Sonra simgeden açıp buradaki bildirim düğmesine bas.'):'Telefonundan bu sayfayı açıp bildirimleri etkinleştir. iPhone’da ana ekrandaki uygulama simgesinden açmalısın.';
  $('deviceList').innerHTML=devices.length?devices.map(d=>'<div class="device-row">'+icon('notifications')+'<span><strong>'+escape(d.name)+'</strong><small>'+(d.active===false?'Yeniden bağlanması gerekiyor':d.id===pushId?'Bu cihaz · Bağlı':'Bağlı')+'</small></span><div class="device-actions">'+(d.active!==false&&d.id!==pushId?'<button data-test-device="'+d.id+'">Deneme gönder</button>':'')+'<button data-remove-device="'+d.id+'">Kaldır</button></div></div>').join(''): '<p class="subtle">Bu firma için henüz cihaz bağlanmadı.</p>';
  $('eventList').innerHTML=state.events.length?state.events.slice(0,10).map(e=>'<article class="event">'+icon(e.kind==='error'?'alert':'notifications')+'<div><strong>'+escape(e.title)+'</strong><p>'+escape(e.body)+'</p><time>'+datetime(e.created)+'</time></div></article>').join(''):'<p class="subtle">Henüz bildirim yok.</p>';renderTrackingStatus();
}
async function subscriptionId(endpoint){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function publicBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
$('enablePush').onclick=()=>busy($('enablePush'),async()=>{
  const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Bildirim izni verilmedi. İstediğinde ayarlardan açabilirsin.');await renderNotifications();return;}
  const registration=await registrationPromise;if(!registration)throw Error('Bildirim hizmeti açılamadı. Sayfayı yenileyip yeniden dene.');
  await navigator.serviceWorker.ready;const config=await api(pushURL('config'));
  const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicBytes(config.publicKey)});
  const name=/iPhone/.test(navigator.userAgent)?'iPhone’um':/Mac/.test(navigator.platform)?'Mac’im':/Win/.test(navigator.platform)?'Windows bilgisayarım':'Cihazım';
  await api(pushURL('subscribe'),{subscription:sub.toJSON(),name});await renderNotifications();toast(companyContext.name+' için bu cihazın bildirimleri açıldı.');
});
$('testPush').onclick=()=>busy($('testPush'),async()=>{await api(pushURL('test'),{id:pushId});toast('Deneme bildirimi gönderildi. Bu cihazın bildirimlerini kontrol et.');});
async function runScan(){
  if(scanning||resetting)return;scanning=true;updateButtons();
  try{await api(apiURL(company,'scan'),{});month=localMonth();periodPinned=false;status='all';query='';$('searchInput').value='';view='invoices';toast('İzibiz başlatıldı. Faturalar geldikçe listeye eklenecek.');await refresh(true);}catch(e){notice(e.message);}finally{scanning=false;updateButtons();}
}
async function resetAll(){
  if(resetting||!confirm(companyContext.name+' firmasının TÜM AYLARDAKİ faturaları ve arşiv dosyaları temizlensin mi?\nİzibiz bağlantısı, bildirim izni ve işlenmiş fatura bilgisi korunur. Yeniden başlatınca güncel dönemin faturaları tekrar alınır. Otomatik takip açıksa sonraki kontrolde de yeniden alınır.'))return;
  resetting=true;++invoiceRequest;++folderRequest;++refreshRequest;loading=false;clearTimeout(typeRefreshTimer);selected.clear();updateButtons();
  try{await api(apiURL(company,'clear-all'),{confirm:true});month=localMonth();periodPinned=false;status='all';query='';$('searchInput').value='';view='invoices';if($('folderDialog').open)$('folderDialog').close();toast('Tüm faturalar ve arşiv temizlendi. Yeniden başlatabilirsin.');await refresh(true);}catch(e){notice(e.message);}finally{resetting=false;updateButtons();}
}
async function handleNavigation(e){
  const go=e.target.closest('[data-go-view]'),filter=e.target.closest('[data-invoice-filter]'),toggle=e.target.closest('[data-toggle]');
  if(go)await changeView(go.dataset.goView);
  if(filter){status=filter.dataset.invoiceFilter;query='';$('searchInput').value='';await changeView('invoices');}
  if(toggle)await busy(toggle,async()=>{await api(apiURL(company,'settings'),{enabled:toggle.dataset.enabled==='true'});await refresh(true);});
}
$('trackingStatus').onclick=e=>handleNavigation(e).catch(e=>notice(e.message));$('dashboardView').onclick=e=>handleNavigation(e).catch(e=>notice(e.message));
$('openNotifications').onclick=()=>changeView('notifications');$('refreshButton').onclick=()=>busy($('refreshButton'),()=>refresh());
$('previousYear').onclick=()=>selectPeriod((Number(month.slice(0,4))-1)+month.slice(4));$('nextYear').onclick=()=>selectPeriod((Number(month.slice(0,4))+1)+month.slice(4));
$('yearSelect').onchange=()=>selectPeriod($('yearSelect').value+month.slice(4));$('monthGrid').onclick=e=>{const b=e.target.closest('[data-month]');if(b)selectPeriod(b.dataset.month).catch(e=>notice(e.message));};
$('statusFilters').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;status=b.dataset.status;renderFilters();loadInvoices().catch(e=>notice(e.message));};
$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=$('searchInput').value.trim();loadInvoices().catch(e=>notice(e.message));},250);};
$('loadMore').onclick=()=>busy($('loadMore'),async()=>{offset+=100;await loadInvoices(true);});
$('invoiceList').onchange=e=>{const key=e.target.dataset.select;if(!key)return;const row=rows.find(r=>r.company.id+':'+r.uuid===key);if(e.target.checked)selected.set(key,row);else selected.delete(key);renderSelection();};
$('invoiceList').onclick=e=>{const b=e.target.closest('[data-mark]');if(b)busy(b,async()=>{const row=rows.find(r=>r.company.id+':'+r.uuid===b.dataset.mark);if(row)await mark([row],b.dataset.done==='true');});};
$('selectionBar').onclick=e=>{const b=e.target.closest('[data-bulk]');if(b)busy(b,()=>mark([...selected.values()],b.dataset.bulk==='true'));};
$('clearSelection').onclick=()=>{selected.clear();$('invoiceList').querySelectorAll('input[type=checkbox]').forEach(n=>n.checked=false);renderSelection();};
$('scanButton').onclick=runScan;$('clearAllButton').onclick=resetAll;
async function clearFolder(id,folder){if(!confirm('Bu klasörün dosyaları silinsin mi? Aynı dosyalar otomatik olarak tekrar alınmaz. Tümünü Temizle ile sistemi boşaltıp yeniden alabilirsin.'))return;await api(apiURL(id,'delete-folder'),{folder});$('folderDialog').close();toast('Klasör dosyaları silindi.');await refresh(true);}
$('folderList').onclick=e=>{const b=e.target.closest('[data-folder]');if(b)busy(b,()=>openFolder(company,b.dataset.folder));};
$('closeFolder').onclick=()=>$('folderDialog').close();
$('folderDialog').addEventListener('click',e=>{if(e.target===$('folderDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('folderContent').onclick=e=>{const b=e.target.closest('[data-folder-action]');if(!b||!currentFolder)return;const {id,folder}=currentFolder;busy(b,async()=>{if(b.dataset.folderAction==='delete')await clearFolder(id,folder);else{await api(apiURL(id,'excel'),{folder});await openFolder(id,folder);toast('Excel hazır.');}});};
$('deviceList').onclick=e=>{const test=e.target.closest('[data-test-device]'),remove=e.target.closest('[data-remove-device]');if(test)busy(test,async()=>{await api(pushURL('test'),{id:test.dataset.testDevice});toast('Seçtiğin cihaza deneme bildirimi gönderildi.');});if(remove)busy(remove,async()=>{const result=await api(pushURL('unsubscribe'),{id:remove.dataset.removeDevice});if(!result.remaining&&remove.dataset.removeDevice===pushId){const registration=await registrationPromise;await(await registration?.pushManager.getSubscription())?.unsubscribe();}await renderNotifications();toast('Bu cihazın bu firmadaki bildirimleri kapatıldı.');});};
$('baselineButton').onclick=()=>$('baselineFile').click();
$('baselineFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
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
initNav();renderIdentity();refresh();
})();
