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
let undoEntries=[],undoMessage='',marking=false;
const selectedEvents=new Set();
let invoiceRequest=0,folderRequest=0,refreshRequest=0,typeRefreshTimer,deviceRefreshPromise,periodPinned=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||''),resetting=false,scanning=false,deviceStateKnown=false,pushRepairing=false;
const monthNames=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function localMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit'}).format(new Date());}
let registrationPromise='serviceWorker' in navigator?navigator.serviceWorker.register('/push-sw.js',{scope:'/'}).catch(()=>null):Promise.resolve(null);
const date=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms)):'—';
const datetime=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'Henüz kontrol edilmedi';
const time=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'—';
const money=n=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const monthName=m=>m?new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z')).replace(/^./,c=>c.toLocaleUpperCase('tr')):'Bütün aylar';
const invoiceState=r=>r.isRet?'rejected':r.done?'done':r.state==='new'?'new':'waiting';
const stateLabel=r=>({new:'YENİ GELEN',waiting:'BEKLENİYOR',done:'İŞLENDİ',rejected:'REDDEDİLDİ'})[invoiceState(r)];
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
function monthCounts(){return info(company)?.monthly?.[month]||{total:0,fresh:0,waiting:0,done:0,rejected:0,pdfs:0,folders:0};}
function updateButtons(){const c=info(company);$('scanButton').disabled=marking||scanning||resetting||!c?.connected||!!c?.running;$('clearAllButton').disabled=marking||resetting||!c||!(c.counts?.total||c.counts?.folders||c.bytes||c.running);}
function renderFilters(){
  const counts=monthCounts();$('downloadMonthExcel').hidden=!counts.total;$('downloadMonthExcel').href=apiURL(company,'month-excel')+'?'+new URLSearchParams({month});$('statusFilters').querySelectorAll('[data-count]').forEach(n=>n.textContent=counts[n.dataset.count]||0);
  $('statusFilters').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.status===status)));
}
function renderCalendar(){
  const visible=['invoices','folders','dashboard'].includes(view);$('periodPicker').hidden=!visible;if(!visible)return;
  const year=Number(month.slice(0,4)),current=Number(localMonth().slice(0,4)),stored=Object.keys(info(company)?.monthly||{}).map(m=>Number(m.slice(0,4)));
  const first=Math.min(current-5,year,...stored),last=Math.max(current+5,year),options=[];for(let y=last;y>=first;y--)options.push('<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>');$('yearSelect').innerHTML=options.join('');
  $('periodHint').textContent=view==='folders'?'Arşivini görmek için ay seç.':view==='dashboard'?'Takip özetini görmek için ay seç.':'Faturalarını görmek için ay seç.';
  $('monthGrid').innerHTML=monthNames.map((name,i)=>{const value=year+'-'+String(i+1).padStart(2,'0'),c=info(company)?.monthly?.[value]||{},n=view==='folders'?c.pdfs||0:c.total||0;return '<button type="button" class="month-tile '+(value===month?'active':'')+'" data-month="'+value+'" aria-pressed="'+(value===month)+'"><span>'+name+'</span><small>'+n+(view==='folders'?' PDF':' fatura')+'</small>'+((c.fresh||0)&&view!=='folders'?'<em>'+c.fresh+' Yeni</em>':'')+'</button>';}).join('');
  $('invoiceHeading').textContent=monthName(month)+' Faturaları';$('folderHeading').textContent=monthName(month)+' Arşivi';renderFilters();
}
async function selectPeriod(value){
  month=value;periodPinned=true;status='all';query='';clearTimeout(searchTimer);$('searchInput').value='';selected.clear();await changeView(view);
}
function renderTrackingStatus(){
  const c=info(company);$('trackingStatus').hidden=!['invoices','folders'].includes(view);if(!c)return;
  const enabled=c.connected&&c.settings?.enabled,activeDevices=devices.filter(d=>d.active!==false),title=!c.connected?'İzibiz bağlantısı gerekli':enabled?'Otomatik takip açık':'Otomatik takip kapalı';
  const note=!c.connected?'Bağlantıyı çalışma alanındaki İzibiz ayarlarından kur.':enabled?'Hafta içi 09 · 11 · 13 · 15 · 17. Düğmeye basman gerekmez.':'İstersen elle alabilir veya Takip durumu bölümünden açabilirsin.';
  const result=c.running?c.status?.progress||'Faturalar alınıyor.':c.status?.error?'Son kontrol: '+c.status.error:'';
  const last=c.status?.lastFinished||c.status?.lastSuccess;
  $('trackingStatus').innerHTML='<div class="tracking-mode"><span class="mode-dot '+(enabled?'on':'off')+'"></span><div><strong>'+escape(title)+'</strong><p>'+escape(note)+'</p>'+(result?'<p class="'+(c.status?.error&&!c.running?'health error':'')+'">'+escape(result)+'</p>':'')+'</div><button class="text-button" data-go-view="dashboard">Ayarlar</button></div><div class="tracking-times"><span>Son kontrol <strong>'+datetime(last)+'</strong></span><span>Sonraki <strong>'+(enabled?datetime(c.nextCheck):'Kapalı')+'</strong></span></div><button type="button" class="tracking-notifications" data-go-view="notifications">'+icon('notifications')+'<span>Telefon bildirimleri<small>'+(!deviceStateKnown?'Cihaz durumu yükleniyor':activeDevices.length?activeDevices.length+' cihaz bağlı':'Henüz cihaz bağlı değil')+'</small></span><b>›</b></button>';
}
async function changeView(next,preloadedInvoices=null){
  if(!labels[next])next='invoices';view=next;updateAddress();
  document.querySelectorAll('.view').forEach(n=>n.hidden=n.id!==next+'View');
  document.querySelectorAll('[data-view]').forEach(n=>{n.classList.toggle('active',n.dataset.view===next);if(n.dataset.view===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  renderTrackingStatus();renderCalendar();updateButtons();
  try{if(next==='dashboard')renderDashboard();if(next==='invoices')await loadInvoices(false,preloadedInvoices);if(next==='folders')await loadFolders();if(next==='notifications')await renderNotifications();}catch(e){notice(e.message);}
}
function renderIdentity(){
  $('systemTitle').textContent='İzibiz - '+companyContext.name+' Gelen E-Fatura Takip Sistemi';$('breadcrumb').textContent=companyContext.name+' / Fatura Takibi';
  $('workspaceBack').href='/workspace/'+company+'/';$('workspaceBack').textContent=companyContext.name+' çalışma alanına dön ↗';
  document.querySelectorAll('.brand,.mobile-brand').forEach(a=>a.href='/workspace/'+company+'/');document.title=companyContext.name+' · Gelen E-Fatura Takibi · Soyturk Works';
}
function renderDashboard(){
  const c=info(company);if(!c)return;const enabled=!!c.settings?.enabled,counts=monthCounts(),connected=devices.filter(d=>d.active!==false);
  const stats=[['total','Tüm faturalar','all'],['fresh','Yeni gelen','new'],['waiting','Bekleniyor','waiting'],['done','İşlendi','done'],['rejected','Reddedildi','rejected']];
  $('dashboardContent').innerHTML='<div class="automation-settings settings-panel"><div class="automation-heading"><h3>Otomatik takip</h3><span class="mode-badge '+(enabled&&c.connected?'on':'')+'">'+(!c.connected?'Bağlantı gerekli':enabled?'AÇIK':'KAPALI')+'</span></div><p>Açıkken bilgisayarın ve bu sayfa kapalı olsa da kontrol devam eder.</p><dl class="automation-facts"><div><dt>Kontrol saatleri</dt><dd>Hafta içi 09 · 11 · 13 · 15 · 17</dd></div><div><dt>Son kontrol</dt><dd>'+datetime(c.status?.lastFinished||c.status?.lastSuccess)+'</dd></div><div><dt>Sonraki kontrol</dt><dd>'+(enabled&&c.connected?datetime(c.nextCheck):'Kapalı')+'</dd></div></dl>'+(c.status?.error?'<p class="health error">'+escape(c.status.error)+'</p>':'')+'<button class="'+(enabled?'secondary':'primary')+'-button" data-toggle="'+company+'" data-enabled="'+!enabled+'" '+(!c.connected?'disabled':'')+'>'+(enabled?'Otomatik takibi durdur':'Otomatik takibi aç')+'</button></div><div class="section-head"><h3>'+escape(monthName(month))+'</h3></div><div class="summary-grid">'+stats.map(([key,label,filter])=>'<button type="button" class="stat-card" data-invoice-filter="'+filter+'"><span class="stat-top">'+label+' '+icon('invoices')+'</span><span class="stat-number">'+(counts[key]||0)+'</span><span class="stat-note">Faturaları göster ↗</span></button>').join('')+'</div><button class="notification-link-card" data-go-view="notifications">'+icon('notifications')+'<span><strong>Telefon bildirimleri</strong><small>'+(connected.length?connected.length+' cihaz tüm firmalara bağlı.':'Telefonundan bir kez bildirim iznini aç.')+'</small></span><b>›</b></button>';
}
async function refresh(force=false){
  if(resetting&&!force||loading&&!force)return;const request=++refreshRequest;loading=true;
  try{
    const requestedView=view,requestedMonth=periodPinned?month:localMonth(),initial=requestedView==='invoices',p=new URLSearchParams({offset:'0',status,month:requestedMonth,q:query});
    const data=initial?await api(apiURL(company,'bootstrap')+'?'+p):{summary:await api(apiURL(company,'summary')),invoices:null},summary=data.summary,prefetchedInvoices=data.invoices;
    if(request!==refreshRequest)return;if(summary.company.id!==company)throw Error('Firma bilgisi doğrulanamadı.');state={companies:[summary],events:state.events};
    if(!periodPinned)month=localMonth();clearTimeout(typeRefreshTimer);if(summary.running)typeRefreshTimer=setTimeout(()=>{if(!document.hidden&&!$('folderDialog').open&&!selected.size)refresh();},2000);await changeView(view,requestedView===view&&requestedMonth===month?prefetchedInvoices:null);refreshDevicesInBackground();
  }catch(e){if(request===refreshRequest)notice(e.message);}finally{if(request===refreshRequest)loading=false;}
}
function refreshDevicesInBackground(){
  if(deviceRefreshPromise||view==='notifications')return deviceRefreshPromise;
  deviceRefreshPromise=api(pushURL('devices')).then(data=>{devices=data.devices;deviceStateKnown=true;renderTrackingStatus();if(view==='dashboard')renderDashboard();return repairPushSubscription();}).catch(()=>{}).finally(()=>deviceRefreshPromise=null);return deviceRefreshPromise;
}
async function loadInvoices(append=false,prefetched=null){
  const request=++invoiceRequest;if(!append){offset=0;selected.clear();}
  const p=new URLSearchParams({offset:String(offset),status,month,q:query}),data=prefetched||await api(apiURL(company,'invoices')+'?'+p);if(request!==invoiceRequest)return;
  const loaded=data.rows.map(r=>({...r,company:companyContext}));rows=append?[...rows,...loaded]:loaded;rows.sort((a,b)=>a.tarih.localeCompare(b.tarih)||(a.firstSeen||0)-(b.firstSeen||0)||a.fatno.localeCompare(b.fatno,'tr')||a.uuid.localeCompare(b.uuid));more=data.total>offset+data.rows.length;
  const start=info(company)?.period?.startMonth,before=start&&month<start;
  const note=query||status!=='all'?'Seçtiğin filtreye uygun fatura bulunamadı.':before?'Takip '+monthName(start)+' ayında başladı.':month===localMonth()?'Tüm Firmaları Güncelle ile bütün bağlı firmaları tek seferde kontrol edebilirsin.':'Bu ay için kayıtlı fatura bulunmuyor.';
  $('invoiceList').innerHTML=rows.length?invoiceHeader()+rows.map(invoiceHTML).join(''):empty(monthName(month)+' için fatura yok',note);
  $('loadMore').hidden=!more;renderSelection();renderFilters();updateButtons();
}
const invoiceColumns=[['number','FATURA NUMARASI'],['date','TARİH'],['supplier','FİRMA ADI'],['type','FATURA TİPİ'],['amount-cell','TUTAR'],['currency','BİRİM']];
function invoiceHeader(){return '<div class="invoice-table-head" aria-hidden="true"><span class="invoice-select-label">SEÇ</span><div class="invoice-fields">'+invoiceColumns.map(([,title])=>'<span class="invoice-column-heading">'+title+'</span>').join('')+'</div><span class="invoice-status-heading">DURUM</span></div>';}
function invoiceHTML(r){
  const key=r.company.id+':'+r.uuid,label=stateLabel(r);
  const type=r.tipLabel||((r.profile?({TEMELFATURA:'Temel',TICARIFATURA:'Ticari'})[r.profile]||r.profile:'—')+' - '+(({SATIS:'Satış',IADE:'İade',TEVKIFAT:'Tevkifat',ISTISNA:'İstisna',OZELMATRAH:'Özel matrah',IHRACKAYITLI:'İhraç kayıtlı',SGK:'SGK'})[r.tip]||r.tip||'—'));
  const values=[r.fatno,r.tarih.split('-').reverse().join('.'),r.unvan,type,money(r.tutar),r.birim||'TRY'];
  const fields=invoiceColumns.map(([name,title],i)=>'<div class="invoice-field invoice-'+name+'"><span class="invoice-field-label">'+title+'</span>'+(name==='supplier'?'<h3 class="invoice-title invoice-value">':'<span class="invoice-value'+(name==='amount-cell'?' invoice-amount':'')+'">')+escape(values[i])+(name==='supplier'?'</h3>':'</span>')+'</div>').join('');
  return '<article class="invoice-row '+(r.done&&!r.isRet?'done':'')+'" style="--company:'+escape(r.company.color)+'"><input type="checkbox" data-select="'+key+'" aria-label="'+escape(r.fatno)+' faturasını seç" '+(r.isRet?'disabled':'')+'><div class="invoice-fields">'+fields+'</div><div class="invoice-right"><span class="status-chip '+(r.isRet?'ret':r.done?'done':invoiceState(r)==='waiting'?'waiting':'')+'">'+label+'</span></div><div class="invoice-actions">'+(r.pdfReady?'<a href="'+apiURL(r.company.id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">PDF’i aç ↗</a>':r.isRet?'':'<span class="health error">'+escape(r.pdfError?'PDF hazırlanamadı':'PDF hazırlanıyor')+'</span>')+(!r.isRet?'<button class="'+(r.done?'undo-invoice':'')+'" data-mark="'+key+'" data-done="'+(!r.done)+'">'+(r.done?'Geri al':'İşlendi olarak işaretle')+'</button>':'')+'<span class="invoice-reply">İzibiz yanıtı: '+escape(r.yanit||'—')+'</span></div></article>';
}
function renderUndo(){
  $('undoBar').hidden=!undoEntries.length;$('undoMessage').textContent=undoMessage;$('undoLastMark').disabled=marking;
  document.querySelectorAll('[data-mark],[data-bulk]').forEach(button=>button.disabled=marking);updateButtons();
}
function renderSelection(){$('selectionBar').hidden=!selected.size;$('selectedCount').textContent=selected.size+' fatura seçili';renderUndo();}
async function mark(items,done){
  if(marking||resetting)return;
  const changed=items.filter(row=>!row.isRet&&row.done!==done);if(!changed.length){toast('Seçili faturalar zaten bu durumda.');return;}
  marking=true;renderUndo();const completed=[];
  try{
    for(let i=0;i<changed.length;i+=100){
      const batch=changed.slice(i,i+100),result=await api(apiURL(company,'mark'),{items:batch.map(row=>({uuid:row.uuid,revision:row.revision})),done});
      for(const saved of result.items){const previous=batch.find(row=>row.uuid===saved.uuid);completed.push({uuid:saved.uuid,revision:saved.revision,done:previous.done});}
    }
  }finally{
    if(completed.length){undoEntries=completed;undoMessage=completed.length+(done?' fatura işlendi olarak işaretlendi.':' faturanın işlendi işareti kaldırıldı.');toast(undoMessage);}
    marking=false;selected.clear();renderSelection();await refresh(true);
  }
}
async function undoLastMark(){
  if(marking||resetting||!undoEntries.length)return;marking=true;renderUndo();let finished=0;
  try{
    for(const done of [false,true]){
      const entries=undoEntries.filter(row=>row.done===done);
      for(let i=0;i<entries.length;i+=100){
        const batch=entries.slice(i,i+100);await api(apiURL(company,'mark'),{items:batch.map(({uuid,revision})=>({uuid,revision})),done});
        const restored=new Set(batch.map(row=>row.uuid));undoEntries=undoEntries.filter(row=>!restored.has(row.uuid));finished+=batch.length;
      }
    }
    toast(finished+' faturanın işlemi geri alındı.');
  }finally{marking=false;selected.clear();renderSelection();await refresh(true);}
}
async function loadFolders(){
  const request=++folderRequest,data=await api(apiURL(company,'folders')+'?'+new URLSearchParams({month}));if(request!==folderRequest)return;
  const folders=data.folders.sort((a,b)=>a.date.localeCompare(b.date));
  $('folderList').innerHTML=folders.length?folders.map(f=>'<article class="folder-card"><div class="folder-top"><span class="folder-icon">'+icon('folders')+'</span><span class="folder-file-count">'+f.pdfs+' PDF</span></div><p class="folder-date-label">ALINMA TARİHİ</p><h3>'+escape(new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(f.date+'T12:00:00Z')))+'</h3><div class="folder-detail"><span>'+f.fresh+' yeni · '+f.waiting+' bekleyen</span><span>'+(f.excel?(f.excel.current?'Excel hazır':'Excel güncelleniyor'):'Excel hazırlanıyor')+'</span></div><div class="folder-action"><button class="text-button" data-folder="'+f.id+'" data-company-id="'+company+'">Dosyaları aç ↗</button>'+(f.excel?.current?'<a class="text-button" href="'+apiURL(company,'month-excel')+'?month='+month+'" download>Excel’i indir</a>':'')+'<a class="text-button muted" href="'+apiURL(company,'export')+'?folder='+f.id+'" download>ZIP indir</a></div></article>').join(''):empty(monthName(month)+' arşivi boş',month<(info(company)?.period?.startMonth||'')?'Takip '+monthName(info(company).period.startMonth)+' ayında başladı.':'PDF’ler alındığında bu ayın dosyaları burada görünür.','folders');
}
async function openFolder(id,folder){
  currentFolder={id,folder};const c=info(id);if(!c)throw Error('Firma bulunamadı.');
  const result=await api(apiURL(id,'folders')),group=result.folders.find(f=>f.id===folder);if(!group)throw Error('Klasör bulunamadı.');
  const data=await api(apiURL(id,'invoices')+'?folder='+folder);
  $('folderContent').innerHTML='<h2>'+escape(group.name)+'</h2><p class="subtle">'+group.pdfs+' PDF · '+group.fresh+' yeni · '+group.waiting+' bekleyen. </p><div class="dialog-actions">'+(group.excel?.current?'<a class="primary-button" href="'+apiURL(id,'month-excel')+'?month='+group.month+'" download>Excel’i indir</a>':'<span>Excel güncelleniyor…</span>')+'<a class="secondary-button" href="'+apiURL(id,'export')+'?folder='+folder+'" download>ZIP indir</a></div><div class="excel-note">'+(group.excel?'<strong>'+escape(group.excel.name)+'</strong><br>'+datetime(group.excel.at)+' tarihinde oluşturuldu. '+(group.excel.current?'Ayın tüm faturaları ve durumlarıyla otomatik güncel.':'Ayın faturaları değişti; Excel otomatik güncelleniyor.')+'<br><a class="text-button" href="'+apiURL(id,'export')+'?folder='+folder+'&excel=1" download>Excel’i indir ↗</a>':'Ayın bütün faturaları, Yeni gelen / Bekleniyor / İşlendi durumlarıyla otomatik Excel’e eklenir.')+'</div>'+data.rows.map(r=>'<div class="folder-file">'+icon('file')+'<a href="'+apiURL(id,'pdf')+'?id='+r.uuid+'" target="_blank" rel="noopener">'+escape(r.unvan+' - '+r.fatno)+'.pdf<small>'+escape(r.tarih.split('-').reverse().join('.'))+'</small></a><span class="status-chip '+(r.done?'done':'')+'">'+stateLabel(r)+'</span></div>').join('')+(data.total>data.rows.length?'<p class="fineprint">İlk '+data.rows.length+' dosya gösteriliyor. Dışa aktarma klasörün tamamını içerir.</p>':'')+'<button class="danger-button folder-delete" data-folder-action="delete">Klasörü sil</button><p class="fineprint subtle">Dosyaları siler. Faturaların işlem durumu korunur; aynı PDF’ler tekrar alınmaz.</p>';
  if(!$('folderDialog').open)$('folderDialog').showModal();
}
function pushEnvironment(){
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  return {ios,standalone,supported:'Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator};
}
async function renderNotifications(){
  if(navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{});
  const {ios,standalone,supported}=pushEnvironment();
  const registration=supported?await registrationPromise:null,usable=supported&&!!registration?.pushManager;
  const subscription=usable?await registration.pushManager.getSubscription():null,permission=supported?Notification.permission:'default';
  const [firstDevices,history]=await Promise.all([api(pushURL('devices')),api(apiURL(company,'events')).catch(()=>({events:[]}))]);state.events=history.events;
  let data=firstDevices;devices=data.devices;deviceStateKnown=true;pushId=subscription?await subscriptionId(subscription.endpoint):null;
  let saved=devices.find(d=>d.id===pushId);
  if(subscription&&permission==='granted'&&(!saved||saved.active===false)){
    await api(pushURL('subscribe'),{subscription:subscription.toJSON(),name:deviceName()});data=await api(pushURL('devices'));devices=data.devices;saved=devices.find(d=>d.id===pushId);
  }
  const ready=!!saved&&saved.active!==false&&usable&&permission==='granted',needsInstall=ios&&!standalone,hasConnectedDevice=devices.some(d=>d.active!==false);
  $('pushStatus').textContent=ready?'Bu telefon tüm firmaların bildirimlerine bağlı.':needsInstall?'Telefonunda hata yok. Bu sayfa Safari sekmesinde açık.':!usable?'Bu tarayıcıda telefon bildirimi açılamıyor.':permission==='denied'?'Bildirim izni kapalı. iPhone Ayarları’ndan açabilirsin.':ios?'Doğru yerdesin. Aşağıdaki düğmeye bir kez bas.':'Bu cihazda bildirimler henüz açık değil.';
  const setup=$('pushSetupSteps');setup.hidden=!needsInstall||hasConnectedDevice;setup.innerHTML=needsInstall&&!hasConnectedDevice?'<strong>iPhone’da yalnızca bir kez yap:</strong><ol><li>Safari’de Paylaş menüsünü aç.</li><li>Ana Ekrana Ekle’ye bas.</li><li>Ana ekrandaki SW logolu uygulama simgesini aç.</li><li>Bildirimler bölümünde “Bu telefonda tüm firmaları aç” düğmesine bas ve İzin Ver’i seç.</li></ol><p>Herhangi bir firmanın ekranı yeterli. Bilgisayardan işlem yapma; diğer firmalarda tekrarlama.</p>':'';
  $('enablePush').hidden=ready||needsInstall;$('enablePush').disabled=!usable||permission==='denied';$('testPush').hidden=!ready;
  $('pushHelp').textContent=ready?'Kurulum tamam. Hafta içi 09 · 11 · 13 · 15 · 17’de tüm firmaların özeti bu telefona gelir.':needsInstall?'Ana ekrana ekledikten sonra Safari’yi kapatıp mutlaka uygulama simgesinden aç.':ios?'Bu işlem tüm firmalar için tek seferliktir. Başka firmalarda yeniden açma veya test yapma.':'Telefonuna bildirim istiyorsan bu işlemi bilgisayardan değil, telefonundaki ana ekran uygulamasından yap.';
  if(ready)$('pushHelp').textContent='Kurulum tamam. Site güncellendiğinde yeniden ana ekrana eklemen veya firmaları tek tek bağlaman gerekmez. Hafta içi 09 · 11 · 13 · 15 · 17 kontrolleri aynı telefon kaydını kullanır; yeni fatura yoksa da sonuç bildirimi hazırlanır.';
  else if(hasConnectedDevice){$('pushStatus').textContent=needsInstall?'Safari sekmesindesin. Hesabında bildirimlere bağlı cihaz var.':'Hesabında tüm firmalara bağlı '+devices.filter(d=>d.active!==false).length+' cihaz var.';$('pushHelp').textContent=needsInstall?'Bu telefonda daha önce kurduysan mevcut ana ekran simgesinden aç; site güncellemeleri için yeniden ekleme. Yeni bir telefon kullanıyorsan yalnızca o cihazı bir kez kur.':ios?'Mevcut bağlı cihazlar için yeniden kurulum gerekmez. Bu yeni telefonu da bağlamak istersen aşağıdaki düğmeyi kullan.':'Bağlı telefon için yeniden kurulum gerekmez. Bu bilgisayarı ayrıca bağlamak zorunda değilsin.';}
  $('deviceList').innerHTML=devices.length?devices.map(d=>'<div class="device-row">'+icon('notifications')+'<span><strong>'+escape(d.name)+'</strong><small>'+(d.active===false?'Oturum değişti · Açınca otomatik yenilenir':d.id===pushId?'Bu cihaz · Tüm firmalara bağlı':'Tüm firmalara bağlı')+'</small></span><div class="device-actions"><button data-remove-device="'+d.id+'">Kaldır</button></div></div>').join(''): '<p class="subtle">Hesaba henüz bildirim cihazı bağlanmadı.</p>';
  for(const id of selectedEvents)if(!state.events.some(e=>e.id===id))selectedEvents.delete(id);
  $('eventList').innerHTML=state.events.length?state.events.map(e=>'<article class="event"><label class="event-select"><input type="checkbox" data-event-id="'+escape(e.id)+'" aria-label="'+escape(e.title)+' bildirimini seç" '+(selectedEvents.has(e.id)?'checked':'')+'></label><div><strong>'+escape(e.title)+'</strong><p>'+escape(e.body)+'</p><time>'+datetime(e.created)+'</time></div></article>').join(''):'<p class="subtle">Bildirim geçmişi boş.</p>';updateEventSelection();renderTrackingStatus();
}
function updateEventSelection(){const button=$('deleteSelectedEvents');button.disabled=!selectedEvents.size;button.textContent=selectedEvents.size?'Seçilenleri sil ('+selectedEvents.size+')':'Seçilenleri sil';}
async function deleteEvents(all=false){
  if(!all&&!selectedEvents.size)return;
  if(all&&!confirm('Tüm firmaların bildirim geçmişi silinsin mi? Telefon bağlantısı, faturalar ve yeni bildirimler korunur.'))return;
  const result=await api(apiURL(company,'events-delete'),all?{all:true}:{ids:[...selectedEvents]});selectedEvents.clear();await renderNotifications();toast(result.deleted+' bildirim geçmişten silindi.');
}
$('eventList').onchange=e=>{const id=e.target.dataset.eventId;if(!id)return;if(e.target.checked)selectedEvents.add(id);else selectedEvents.delete(id);updateEventSelection();};
$('deleteSelectedEvents').onclick=async()=>{await busy($('deleteSelectedEvents'),()=>deleteEvents());updateEventSelection();};
$('deleteAllEvents').onclick=()=>busy($('deleteAllEvents'),()=>deleteEvents(true));
async function subscriptionId(endpoint){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function publicBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function deviceName(){return /iPhone/.test(navigator.userAgent)?'iPhone’um':/Android/.test(navigator.userAgent)?'Android telefonum':/Mac/.test(navigator.platform)?'Mac’im':/Win/.test(navigator.platform)?'Windows bilgisayarım':'Cihazım';}
let spreadsheetPromise;
function loadSpreadsheetLibrary(){
  if(window.XLSX)return Promise.resolve(window.XLSX);if(spreadsheetPromise)return spreadsheetPromise;
  spreadsheetPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/vendor/xlsx.full.min.js';script.onload=()=>{if(window.XLSX)resolve(window.XLSX);else{spreadsheetPromise=null;reject(Error('Excel okuyucu başlatılamadı.'));}};script.onerror=()=>{spreadsheetPromise=null;reject(Error('Excel okuyucu yüklenemedi. İnternet bağlantını kontrol et.'));};document.head.append(script);});return spreadsheetPromise;
}
async function repairPushSubscription(){
  if(pushRepairing||!('Notification' in window)||Notification.permission!=='granted')return;pushRepairing=true;
  try{const registration=await registrationPromise,subscription=await registration?.pushManager?.getSubscription();if(!subscription)return;const id=await subscriptionId(subscription.endpoint),saved=devices.find(device=>device.id===id);if(saved&&saved.active!==false)return;await api(pushURL('subscribe'),{subscription:subscription.toJSON(),name:deviceName()});devices=(await api(pushURL('devices'))).devices;deviceStateKnown=true;}
  finally{pushRepairing=false;}
}
async function connectPushForAll(){
  const environment=pushEnvironment();
  if(environment.ios&&!environment.standalone)throw Error('Önce Safari’den Ana Ekrana Ekle; sonra ana ekrandaki SW logolu uygulama simgesinden aç.');
  if(!environment.supported)throw Error('Bu tarayıcı telefon bildirimini desteklemiyor.');
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted')return {ready:false,created:false};
  const registration=await registrationPromise;if(!registration?.pushManager)throw Error('Bildirim hizmeti açılamadı. iPhone’da ana ekrandaki SW logolu uygulama simgesinden açıp yeniden dene.');
  await navigator.serviceWorker.ready;const config=await api(pushURL('config'));
  const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicBytes(config.publicKey)});
  const saved=await api(pushURL('subscribe'),{subscription:sub.toJSON(),name:deviceName()});pushId=saved.id;return {ready:true,created:!!saved.created,id:saved.id};
}
$('enablePush').onclick=()=>busy($('enablePush'),async()=>{
  const result=await connectPushForAll();
  if(!result.ready){toast('Bildirim izni verilmedi. İstediğinde ayarlardan açabilirsin.');await renderNotifications();return;}
  await renderNotifications();toast('Bu cihaz tüm firmaların bildirimlerine bağlandı.');
});
$('testPush').onclick=()=>busy($('testPush'),async()=>{await api(pushURL('test'),{id:pushId});toast('Tüm firmalar için tek test özeti bu telefona gönderildi.');});
async function runScan(){
  if(scanning||resetting)return;scanning=true;updateButtons();
  try{
    const environment=pushEnvironment();
    if(environment.standalone&&environment.supported&&Notification.permission!=='denied'){
      try{await connectPushForAll();}catch(e){notice('Telefon bildirimi bağlanamadı: '+e.message);}
    }
    const result=await api('/api/automation/scan-all',{});month=localMonth();periodPinned=false;status='all';query='';$('searchInput').value='';view='invoices';
    if(result.started)toast(result.started+' bağlı firmanın İzibiz kontrolü başladı. Başka firmaya girmen gerekmiyor.');
    else if(result.connected)toast('Firma sonuçlarını aşağıda görebilirsin. Başlatılamayan kontroller sunucuda yeniden denenecek.');
    else throw Error('Henüz İzibiz bağlantısı bulunan firma yok.');
    const labels={'started':'Kontrol başladı · otomatik takip açık','skipped':'Kontrol sonucu hazırlanıyor','error':'Başlatılamadı · yeniden denenecek','not-connected':'İzibiz bağlantısı yok'};
    const panel=$('allCompanyStatus');panel.hidden=false;panel.innerHTML='<strong>Tüm firmaların kontrolü</strong>'+result.results.map(r=>'<p><b>'+escape(r.name)+'</b><span>'+escape(labels[r.status]||r.status)+(r.error?' · '+escape(r.error):'')+'</span></p>').join('');
    await refresh(true);
  }catch(e){notice(e.message);}finally{scanning=false;updateButtons();}
}
async function sendInstantStatus(){
  await repairPushSubscription();
  const result=await api('/api/automation/instant-status',{}),panel=$('allCompanyStatus');panel.hidden=false;
  panel.innerHTML='<strong>Faturalar Anlık Durum</strong><small>Sunucudaki son kayıtlar · Yeni bir İzibiz indirmesi başlatılmaz.</small>'+result.results.map(r=>{
    const months=(r.allMonthly||[]).map(m=>monthName(m.month)+' '+m.count+' Adet').join(' · ')||(r.error?'Güncel durum doğrulanamadı':'Kayıtlı fatura yok');
    const note=!r.connected?'İzibiz bağlantısı yok':r.error?'Son kontrol tamamlanamadı':r.running?'Kontrol sürüyor':!r.enabled?'Otomatik takip kapalı':'';
    return '<p><b>'+escape(r.name)+'</b><span>Gelen: '+escape(months)+'</span><small>'+escape(note)+(note?' · ':'')+'Son kontrol: '+(r.lastFinished?escape(new Date(r.lastFinished).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})):'Henüz tamamlanmadı')+'</small></p>';
  }).join('');
  if(result.queued)toast('Tüm firmaların aylık durumu bağlı telefonlara gönderim sırasına alındı.');
  else notice('Durum aşağıda hazır. Bağlı bildirim cihazı yok; telefondaki Bildirimler bölümünden bir kez açmalısın.');
}
async function resetAll(){
  if(resetting||!confirm(companyContext.name+' firmasının TÜM AYLARDAKİ faturaları ve arşiv dosyaları temizlensin mi?\nİzibiz bağlantısı, bildirim izni ve işlenmiş fatura bilgisi korunur. Tüm Firmaları Güncelle’ye basınca son faturalar yeniden alınır ve telefon bildirimi yeniden oluşturulur.'))return;
  resetting=true;++invoiceRequest;++folderRequest;++refreshRequest;loading=false;clearTimeout(typeRefreshTimer);selected.clear();updateButtons();
  try{await api(apiURL(company,'clear-all'),{confirm:true});undoEntries=[];renderUndo();month=localMonth();periodPinned=false;status='all';query='';$('searchInput').value='';view='invoices';if($('folderDialog').open)$('folderDialog').close();toast(companyContext.name+' temizlendi. Tüm Firmaları Güncelle’ye bir kez basman yeterli.');await refresh(true);}catch(e){notice(e.message);}finally{resetting=false;updateButtons();}
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
$('undoLastMark').onclick=()=>busy($('undoLastMark'),undoLastMark);
$('clearSelection').onclick=()=>{selected.clear();$('invoiceList').querySelectorAll('input[type=checkbox]').forEach(n=>n.checked=false);renderSelection();};
$('scanButton').onclick=runScan;$('clearAllButton').onclick=resetAll;
$('instantStatusButton').onclick=()=>busy($('instantStatusButton'),sendInstantStatus);
async function clearFolder(id,folder){if(!confirm('Bu klasörün dosyaları silinsin mi? Aynı dosyalar otomatik olarak tekrar alınmaz. Tümünü Temizle ile sistemi boşaltıp yeniden alabilirsin.'))return;await api(apiURL(id,'delete-folder'),{folder});$('folderDialog').close();toast('Klasör dosyaları silindi.');await refresh(true);}
$('folderList').onclick=e=>{const b=e.target.closest('[data-folder]');if(b)busy(b,()=>openFolder(company,b.dataset.folder));};
$('closeFolder').onclick=()=>$('folderDialog').close();
$('folderDialog').addEventListener('click',e=>{if(e.target===$('folderDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('folderContent').onclick=e=>{const b=e.target.closest('[data-folder-action]');if(!b||!currentFolder)return;const {id,folder}=currentFolder;busy(b,async()=>{if(b.dataset.folderAction==='delete')await clearFolder(id,folder);else{await api(apiURL(id,'excel'),{folder});await openFolder(id,folder);toast('Excel hazır.');}});};
$('deviceList').onclick=e=>{const remove=e.target.closest('[data-remove-device]');if(remove)busy(remove,async()=>{await api(pushURL('unsubscribe'),{id:remove.dataset.removeDevice});if(remove.dataset.removeDevice===pushId){const registration=await registrationPromise;await(await registration?.pushManager?.getSubscription())?.unsubscribe();}await renderNotifications();toast('Bu cihazın tüm firma bildirimleri kapatıldı.');});};
$('baselineButton').onclick=()=>$('baselineFile').click();
$('baselineFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  busy($('baselineButton'),async()=>{
    const XLSX=await loadSpreadsheetLibrary(),workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),numbers=new Set(),normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ı/g,'i').replace(/[^a-z0-9]/g,'');
    let found=false;for(const name of workbook.SheetNames){const grid=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:''});const header=grid.findIndex(row=>row.some(v=>['faturano','faturanumarasi','invoicenumber','belgeno'].includes(normalize(v))));if(header<0)continue;found=true;const col=grid[header].findIndex(v=>['faturano','faturanumarasi','invoicenumber','belgeno'].includes(normalize(v)));for(const row of grid.slice(header+1)){const n=String(row[col]||'').trim();if(n&&n.length<100&&!/toplam/i.test(n))numbers.add(n);}}
    if(!found)throw Error('Excel’de Fatura No sütunu bulunamadı.');
    if(!confirm(info(company).company.name+' için bu dosyadaki '+numbers.size+' fatura numarası işlenmiş olarak kaydedilsin mi?'))return;
    const list=[...numbers];for(let i=0;i<list.length;i+=300)await api(apiURL(company,'baseline'),{numbers:list.slice(i,i+300)});
    toast('Başlangıç listesi kaydedildi. Eşleşenler işlendi; sonraki faturalar otomatik karşılaştırılacak.');await refresh();
  });
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden&&!$('folderDialog').open&&!selected.size)refresh();},30000);
initNav();renderIdentity();document.querySelectorAll('.view').forEach(node=>node.hidden=node.id!==view+'View');document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));if(view==='invoices')$('invoiceList').innerHTML=empty('Faturalar yükleniyor','Özet ve fatura listesi birlikte hazırlanıyor.');refresh();
})();
