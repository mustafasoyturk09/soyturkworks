(() => {
'use strict';
const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',invoices:'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3',accounting:'M3 7V5h7l2 3h9v13H3ZM3 10h18M7 14h3M7 17h3M14 13h4v5h-4ZM16 13v5M14 15.5h4',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',folders:'M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM3 9h18',notifications:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',check:'m5 12 4 4L19 6',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',file:'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6',arrow:'M5 12h14m-6-6 6 6-6 6',alert:'M12 3 2 21h20ZM12 9v5M12 17v1',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'};
const icon=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.file)+'"/></svg>';
const integrationOriginal=document.querySelector('.integration-symbol').innerHTML,sectionIcons={invoices:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',folders:'<path d="M6 14l1.5-3h13l-2.5 7H4l2-7V6a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v3"/>',dashboard:'<path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/>',notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'};
const labels={overview:'Genel Bakış',invoices:'Faturalar',folders:'Dönem Arşivi',dashboard:'Otomatik Takip',notifications:'Telefon Bildirimleri'},navIcons={overview:'home',invoices:'invoices',folders:'folders',dashboard:'clock',notifications:'notifications'};
const params=new URLSearchParams(location.search);
const companyContext=window.SW_CONTEXT?.company;
if(!companyContext?.id){location.replace('/companies');return;}
const company=companyContext.id,base='/workspace/'+company+'/takip/';
let state={companies:[],events:[]},view=params.get('view')||'overview',status='all',month=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||'')?params.get('month'):localMonth(),query='',rows=[],offset=0,more=false,selected=new Map(),currentFolder=null,devices=[],pushId=null,loading=false,noticeTimer,toastTimer,searchTimer;
let undoEntries=[],undoMessage='',marking=false,selectingAll=false;
let invoiceFilterCache=null;
let previewAuto=true,previewId=null,previewRequest=0,previewDocument=null,previewTask=null,previewPage=1,previewFetch=null,pdfLoaderPromise=null,previewZoom=1,previewRenderSeq=0,previewPan=false,previewDrag=null;
let monthSpotlight=false,folderPageRequest=0,archiveIndex=true,periodChooserOpen=false,eventPeriod='all',archiveFilter='all',archiveSearch='';
const viewHistory=[];
const selectedEvents=new Set();
let invoiceRequest=0,folderRequest=0,refreshRequest=0,overviewRequest=0,typeRefreshTimer,deviceRefreshPromise,periodPinned=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||''),resetting=false,scanning=false,deviceStateKnown=false,pushRepairing=false;
const monthNames=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function localMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit'}).format(new Date());}
let registrationPromise='serviceWorker' in navigator?navigator.serviceWorker.register('/push-sw.js',{scope:'/'}).catch(()=>null):Promise.resolve(null);
const date=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms)):'—';
const datetime=ms=>ms?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'Henüz kontrol edilmedi';
const calendarDate=value=>value?value.split('-').reverse().join('.'):'Bilinmiyor';
const receivedLabel=row=>row.receivedAt?date(row.receivedAt)+' '+time(row.receivedAt):calendarDate(row.receivedDate);
const collectionDates=group=>{const dates=group.receivedDates?.length?group.receivedDates:[group.date].filter(Boolean);return dates.length?calendarDate(dates[0])+(dates.length>1?' – '+calendarDate(dates.at(-1))+' · '+dates.length+' farklı gün':''):'Bilinmiyor';};
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
  const desktop=document.querySelector('.desktop-nav'),bottom=document.querySelector('.bottom-nav');
  desktop.innerHTML='<a class="module-link" href="/workspace/'+company+'/">'+icon('home')+'<span>Ana Sayfa</span></a><button type="button" class="module-active" id="toggleSubnav" aria-expanded="true">'+icon('invoices')+'<span>Gelen E-Fatura İzibiz</span><b>⌃</b></button><div class="subnav" id="overviewSubnav">'+html+'</div><a class="module-link" href="/workspace/'+company+'/masraf/">'+icon('invoices')+'<span>Masraf Fişleri</span></a>'+[['satis','Satış Faturaları'],['satis-kesme','Satış Faturası Kesme'],['yevmiye','Yurt Dışı Yevmiye Kaydı'],['mutabakat','Cari Mutabakat'],['notlar','Not Alma']].map(([page,label])=>'<a class="module-link" href="/workspace/'+company+'/" data-page="'+page+'">'+icon('file')+'<span>'+label+'</span></a>').join('');
  bottom.innerHTML=html;for(const nav of [desktop,bottom])nav.addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)changeView(button.dataset.view);const link=e.target.closest('[data-page]');if(link)try{sessionStorage.setItem('sw:company:v2:'+company+':fc_active_page',link.dataset.page);}catch{}});
  $('toggleSubnav').onclick=()=>{const sub=$('overviewSubnav'),open=sub.hidden;sub.hidden=!open;$('toggleSubnav').setAttribute('aria-expanded',String(open));};
  $('openNotifications').innerHTML=icon('notifications');$('dialogFolderIcon').innerHTML=icon('accounting');
}
function updateAddress(){const p=new URLSearchParams({view});if(periodPinned)p.set('month',month);history.replaceState(null,'',base+'?'+p);}
function monthCounts(){return info(company)?.monthly?.[month]||{total:0,fresh:0,waiting:0,done:0,rejected:0,pdfs:0,folders:0};}
function updateButtons(){const c=info(company);$('scanButton').disabled=marking||scanning||resetting||!c?.connected||!!c?.running;$('clearAllButton').disabled=marking||resetting||!c||!(c.counts?.total||c.counts?.folders||c.bytes||c.running);}
function renderFilters(){
  const counts=monthCounts();$('downloadMonthExcel').hidden=!counts.total;$('downloadMonthExcel').href=apiURL(company,'month-excel')+'?'+new URLSearchParams({month});$('statusFilters').querySelectorAll('[data-count]').forEach(n=>n.textContent=counts[n.dataset.count]||0);
  $('statusFilters').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.status===status)));
}
function renderCalendar(){
  const visible=['invoices','folders','dashboard'].includes(view);$('periodPicker').hidden=!visible||!periodChooserOpen;if(!visible)return;
  const year=Number(month.slice(0,4)),current=Number(localMonth().slice(0,4)),stored=Object.keys(info(company)?.monthly||{}).map(m=>Number(m.slice(0,4)));
  const first=Math.min(current-5,year,...stored),last=Math.max(current+5,year),options=[];for(let y=last;y>=first;y--)options.push('<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>');$('yearSelect').innerHTML=options.join('');
  $('periodHint').textContent=view==='folders'?'Arşivini görmek için ay seç.':view==='dashboard'?'Takip özetini görmek için ay seç.':'Faturalarını görmek için ay seç.';
  $('monthGrid').innerHTML=monthNames.map((name,i)=>{const value=year+'-'+String(i+1).padStart(2,'0'),c=info(company)?.monthly?.[value]||{},n=view==='folders'?c.pdfs||0:c.total||0,pending=(c.fresh||0)+(c.waiting||0);return '<button type="button" class="month-tile '+(value===month?'active':'')+'" data-month="'+value+'" aria-pressed="'+(value===month)+'"><span>'+name+'</span><small>'+n+(view==='folders'?' PDF':' fatura')+'</small>'+(pending&&view!=='folders'?'<em title="Yeni gelen + bekleyen; işlenene kadar toplamda kalır">'+pending+' Yeni</em>':'')+'</button>';}).join('');
  $('monthGrid').classList.toggle('spotlight',monthSpotlight);
  $('invoiceHeading').textContent=monthName(month)+' Faturaları';$('folderHeading').textContent=monthName(month)+' Arşivi';renderFilters();
}
async function selectPeriod(value){
  month=value;periodPinned=true;periodChooserOpen=false;status='all';query='';clearTimeout(searchTimer);$('searchInput').value='';selected.clear();if(view==='folders')archiveIndex=false;await changeView(view);
}
function renderTrackingStatus(){
  const c=info(company);$('trackingStatus').hidden=!['invoices','folders'].includes(view);if(!c)return;
  const enabled=c.connected&&c.settings?.enabled,activeDevices=devices.filter(d=>d.active!==false),title=!c.connected?'İzibiz bağlantısı gerekli':enabled?'Otomatik takip açık':'Otomatik takip kapalı';
  const note=!c.connected?'Bağlantıyı çalışma alanındaki İzibiz ayarlarından kur.':enabled?'Hafta içi 09 · 11 · 13 · 15 · 17. Düğmeye basman gerekmez.':'İstersen elle alabilir veya Takip durumu bölümünden açabilirsin.';
  const result=c.running?c.status?.progress||'Faturalar alınıyor.':c.status?.error?'Son kontrol: '+c.status.error:'';
  const last=c.status?.lastFinished||c.status?.lastSuccess;
  $('trackingStatus').innerHTML='<div class="tracking-mode"><span class="mode-dot '+(enabled?'on':'off')+'"></span><div><strong>'+escape(title)+'</strong><p>'+escape(note)+'</p>'+(result?'<p class="'+(c.status?.error&&!c.running?'health error':'')+'">'+escape(result)+'</p>':'')+'</div><button class="text-button" data-go-view="dashboard">Ayarlar</button></div><div class="tracking-times"><span>Son kontrol <strong>'+datetime(last)+'</strong></span><span>Sonraki <strong>'+(enabled?datetime(c.nextCheck):'Kapalı')+'</strong></span></div><button type="button" class="tracking-notifications" data-go-view="notifications">'+icon('notifications')+'<span>Telefon bildirimleri<small>'+(!deviceStateKnown?'Cihaz durumu yükleniyor':activeDevices.length?activeDevices.length+' cihaz bağlı':'Henüz cihaz bağlı değil')+'</small></span><b>›</b></button>';
}
async function changeView(next,preloadedInvoices=null,targetOffset=0){
  if(selectingAll&&next!=='invoices')++invoiceRequest;
  if(!labels[next])next='overview';if(next!==view){viewHistory.push({view,month,status,query,offset});periodChooserOpen=false;if(next==='folders')archiveIndex=true;}view=next;updateAddress();
  document.body.classList.toggle('izibiz-redesign',next!=='overview');$('systemTitle').textContent='Gelen E-Fatura İzibiz'+(next==='overview'?'':' — '+labels[next]);$('breadcrumb').textContent=companyContext.name+' / Gelen E-Fatura İzibiz'+(next==='overview'?'':' / '+labels[next]);document.querySelector('.integration-symbol').innerHTML=sectionIcons[next]||integrationOriginal;
  document.querySelectorAll('.view').forEach(n=>n.hidden=n.id!==next+'View');
  document.querySelectorAll('[data-view]').forEach(n=>{n.classList.toggle('active',n.dataset.view===next);if(n.dataset.view===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  $('previousPage').hidden=next==='overview';
  renderTrackingStatus();renderCalendar();updateButtons();
  try{if(next==='overview')await renderOverview();if(next==='dashboard')renderDashboard();if(next==='invoices'){renderInvoiceSummary();await loadInvoices(targetOffset,preloadedInvoices);}if(next==='folders'){if(archiveIndex)renderArchiveMonths();else await loadFolders();}if(next==='notifications')await renderNotifications();}catch(e){notice(e.message);}
}
function renderInvoiceSummary(){const c=info(company),current=localMonth(),months=[previousMonth(current),current],counts=monthCounts(),stats=[['invoices','Toplam',counts.total,'blue'],['file','Yeni Gelen',counts.fresh,'cyan'],['check','İşlenen',counts.done,'green'],['clock','Bekleyen',counts.waiting,'amber'],['alert','İade / RET',counts.rejected,'red']];$('invoiceSummary').innerHTML='<div class="iz-periods">'+months.map(m=>'<button type="button" class="iz-period '+(m===current?'current':'')+' '+(m===month?'selected':'')+'" data-period="'+m+'">'+icon('folders')+'<span><strong>'+escape(monthName(m))+'</strong><b><em>'+(c?.monthly?.[m]?.total||0)+'</em><i>Fatura</i></b><small>'+(m===current?'Aktif dönem':'Önceki dönem')+(m===month?' · Seçili':'')+'</small></span></button>').join('')+'</div><div class="iz-invoice-stats">'+stats.map(([i,l,n,t])=>'<div class="iz-stat '+t+'">'+icon(i)+'<span>'+l+'</span><strong>'+n+'</strong></div>').join('')+'</div><button type="button" class="iz-period-chooser" data-period-chooser>Diğer dönemler</button>';}
function renderArchiveMonths(){const c=info(company),current=localMonth(),entries=Object.keys(c?.monthly||{}).sort(),needle=archiveSearch.trim().toLocaleLowerCase('tr'),baseMonths=needle?[...new Set([...entries,previousMonth(current),current])].sort():[previousMonth(current),current],shown=baseMonths.filter(m=>(archiveFilter==='all'||(archiveFilter==='current'?m===current:m===previousMonth(current)))&&(!needle||monthName(m).toLocaleLowerCase('tr').includes(needle)||m.includes(needle)));$('folderHeading').textContent='Dönem Arşivi';$('folderList').innerHTML=shown.map(m=>{const v=c?.monthly?.[m]||{},n=v.total||0,pct=n?Math.round((v.done||0)*100/n):0;return '<article class="iz-archive-card '+(m===current?'current':'previous')+'"><div class="iz-archive-title">'+icon('folders')+'<div><h3>'+escape(monthName(m))+'</h3><strong>'+n+' Fatura</strong><small>'+escape(companyContext.name)+'</small></div><span>'+(m===current?'Aktif dönem':'Önceki dönem')+'</span></div><div class="iz-archive-stats"><span>PDF <b>'+(v.pdfs||0)+'</b></span><span>Yeni <b>'+(v.fresh||0)+'</b></span><span>İşlenen <b>'+(v.done||0)+'</b></span><span>Bekleyen <b>'+(v.waiting||0)+'</b></span><span>İade / RET <b>'+(v.rejected||0)+'</b></span></div><div class="iz-progress"><i style="width:'+pct+'%"></i></div><div class="iz-archive-actions"><button type="button" data-archive-month="'+m+'">Dosyaları aç</button>'+(n?'<a href="'+apiURL(company,'month-excel')+'?month='+m+'" download>Excel indir</a>':'')+'<button type="button" data-archive-month="'+m+'">PDF ve ZIP işlemleri</button></div></article>';}).join('')||'<p class="subtle">Bu aramaya uygun d?nem bulunamad?.</p>';const timeline=[...new Set([...entries,previousMonth(current),current])].sort();$('archiveTimeline').innerHTML='<section class="iz-panel iz-timeline"><h2>Dönem Geçmişi</h2><div>'+timeline.map(m=>'<button type="button" class="'+(m===current?'current':'')+'" data-archive-month="'+m+'">'+icon('folders')+'<strong>'+escape(monthName(m))+'</strong><small>'+(c?.monthly?.[m]?.total||0)+' Fatura</small></button>').join('')+'</div></section>';}
function renderIdentity(){
  $('systemTitle').textContent='Gelen E-Fatura İzibiz';$('breadcrumb').textContent=companyContext.name+' / Gelen E-Fatura İzibiz';
  $('workspaceBack').href='/workspace/'+company+'/';$('workspaceBack').textContent=companyContext.name+' çalışma alanına dön ↗';
  $('railCompany').textContent=companyContext.name;
  document.querySelectorAll('.brand,.mobile-brand').forEach(a=>a.href='/workspace/'+company+'/');document.title=companyContext.name+' · Gelen E-Fatura İzibiz · Soyturk Works';
}
let overviewPeriod='two',overviewCache=null;
function previousMonth(value){const [y,m]=value.split('-').map(Number),d=new Date(Date.UTC(y,m-2,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');}
async function overviewMonthRows(value){
  const result=[];let total=null;
  do{const data=await api(apiURL(company,'invoices')+'?'+new URLSearchParams({month:value,offset:String(result.length)}));if(total!==null&&data.total!==total)throw Error('Fatura listesi değişti; genel bakışı yenileyin.');total=data.total;if(!data.rows.length&&result.length<total)throw Error('Fatura listesi tamamlanamadı; yeniden deneyin.');result.push(...data.rows);}while(result.length<total);
  if(new Set(result.map(r=>r.uuid)).size!==result.length)throw Error('Fatura listesi değişti; genel bakışı yenileyin.');return result;
}
async function renderOverview(){
  const c=info(company);if(!c)return;const request=++overviewRequest,current=localMonth(),previous=previousMonth(current),months=overviewPeriod==='two'?[previous,current]:[current],loadMonths=[previous,current],signature=JSON.stringify([loadMonths,c.monthly,c.status?.lastFinished,c.status?.lastSuccess]);
  const target=$('overviewContent');if(!overviewCache||overviewCache.signature!==signature){target.innerHTML='<div class="overview-loading">Genel bakış hazırlanıyor…</div>';try{const groups=await Promise.all(loadMonths.map(overviewMonthRows));if(request!==overviewRequest||view!=='overview')return;overviewCache={signature,groups};}catch(e){if(request===overviewRequest){target.innerHTML='<div class="overview-loading">'+escape(e.message)+'</div>'; }return;}}
  if(request!==overviewRequest||view!=='overview')return;const groups=overviewCache.groups,currentRows=groups[1],all=overviewPeriod==='two'?groups.flat():currentRows,count=(key)=>months.reduce((n,m)=>n+(c.monthly?.[m]?.[key]||0),0),total=count('total'),done=count('done'),waiting=count('waiting'),fresh=count('fresh'),returned=all.filter(r=>r.isRet||String(r.tip||'').toLocaleUpperCase('tr')==='IADE').length,foreign=all.filter(r=>r.birim&&!/^(TRY|TL|₺)$/i.test(r.birim.trim())).length;
  const percent=n=>total?'% '+(n*100/total).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1}):'% 0,0';
  const cards=[['file','Toplam Fatura',total,'','blue'],['check','İşlenen',done,percent(done),'green'],['clock','Bekleyen',waiting,percent(waiting)+(fresh?' · '+fresh+' yeni':''),'amber'],['alert','İade / RET',returned,percent(returned),'rose'],['accounting','Dövizli',foreign,percent(foreign),'cyan']];
  const monthCards=months.map(m=>{const v=c.monthly?.[m]||{},n=v.total||0,pct=x=>n?Math.round(x*100/n):0;return '<button type="button" class="overview-month '+(m===current?'current':'')+'" data-overview-month="'+m+'">'+icon('folders')+'<div><div class="overview-month-head"><strong>'+escape(monthName(m))+'</strong><span>'+(m===current?'Aktif dönem':'Önceki dönem')+'</span></div><b>'+(v.total||0)+' <small>Fatura</small></b><div class="overview-month-row"><span>✓ &nbsp; İşlenen</span><strong>'+(v.done||0)+'</strong><small>%'+pct(v.done||0)+'</small></div><div class="overview-meter green"><i style="width:'+pct(v.done||0)+'%"></i></div><div class="overview-month-row"><span>◷ &nbsp; Bekleyen</span><strong>'+(v.waiting||0)+'</strong><small>%'+pct(v.waiting||0)+'</small></div><div class="overview-meter amber"><i style="width:'+pct(v.waiting||0)+'%"></i></div><div class="overview-month-row"><span>＋ &nbsp; Yeni gelen</span><strong>'+(v.fresh||0)+'</strong><small>%'+pct(v.fresh||0)+'</small></div></div></button>';}).join('');
  const days=new Array(new Date(Number(current.slice(0,4)),Number(current.slice(5,7)),0).getDate()).fill(0),dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});let dated=0;for(const r of groups.flat()){const stamp=r.receivedDate||(r.receivedAt?dayFormat.format(new Date(r.receivedAt)):'');if(stamp.startsWith(current)){const d=Number(stamp.slice(8,10));if(d>=1&&d<=days.length){days[d-1]++;dated++;}}}const max=Math.max(1,...days);
  const chart=days.map((n,i)=>'<div class="overview-bar" title="'+(i+1)+' '+escape(monthName(current))+': '+n+' fatura"><i style="height:'+Math.round(n/max*100)+'%"></i></div>').join('');
  const recent=[...all].sort((a,b)=>(b.receivedAt||b.firstSeen||0)-(a.receivedAt||a.firstSeen||0)||String(b.tarih||'').localeCompare(String(a.tarih||''))).slice(0,5);
  const table=recent.map(r=>'<tr><td>'+escape(r.fatno)+'</td><td>'+escape(calendarDate(r.tarih))+'</td><td>'+escape(r.unvan)+'</td><td>'+escape(r.tipLabel||r.tip||'—')+'</td><td>'+escape(r.birim||'TRY')+'</td><td>'+money(Number(r.tutar)||0)+'</td><td><span class="overview-state '+escape(invoiceState(r))+'">'+escape(stateLabel(r))+'</span></td><td>'+(r.pdfReady?'<a '+pdfLink(company,r.uuid)+'>PDF</a>':'—')+'</td></tr>').join('');
  const activeDevices=devices.filter(d=>d.active!==false),enabled=!!(c.connected&&c.settings?.enabled),last=c.status?.lastFinished||c.status?.lastSuccess;
  const tryRows=currentRows.filter(r=>!r.isRet&&/^(TRY|TL|₺)$/i.test(String(r.birim||'TRY').trim())&&Number.isFinite(Number(r.tutar))),amounts=tryRows.map(r=>Number(r.tutar)),sum=amounts.reduce((a,b)=>a+b,0),foreignTotals={};for(const r of currentRows){const currency=String(r.birim||'TRY').toUpperCase();if(!r.isRet&&!/^(TRY|TL|₺)$/.test(currency)&&Number.isFinite(Number(r.tutar)))foreignTotals[currency]=(foreignTotals[currency]||0)+Number(r.tutar);}
  target.innerHTML='<div class="overview-toolbar"><div><strong>İzibiz API ile gelen e-faturaların takibi, işlemleri ve bildirim yönetimi</strong></div><div class="overview-toolbar-actions"><span class="overview-last">'+icon('clock')+'<span>Son API kontrolü<br><b>'+escape(datetime(last))+'</b></span></span><label class="overview-period-label"><span class="sr-only">Dönem</span><select id="overviewPeriod"><option value="two" '+(overviewPeriod==='two'?'selected':'')+'>Son 2 Ay</option><option value="current" '+(overviewPeriod==='current'?'selected':'')+'>Bu Ay</option></select></label></div></div><div class="overview-layout"><div class="overview-main"><div class="overview-stats">'+cards.map(([ico,label,n,p,tone])=>'<div class="overview-stat '+tone+'"><span class="overview-stat-icon">'+icon(ico)+'</span><div><span>'+label+'</span><strong>'+n+'</strong>'+(p?'<small>'+escape(p)+'</small>':'')+'</div></div>').join('')+'</div><div class="overview-middle"><section class="overview-panel overview-periods"><div class="overview-panel-head"><h2>Dönem Özeti</h2><span>'+(overviewPeriod==='two'?'Son 2 Ay':'Bu Ay')+'</span></div><div class="overview-months">'+monthCards+'</div></section><section class="overview-panel overview-chart"><div class="overview-panel-head"><h2>Günlük Gelen Fatura</h2><span>'+escape(monthName(current))+'</span></div><div class="overview-bars">'+chart+'</div><div class="overview-chart-axis"><span>01</span><span>'+String(Math.ceil(days.length/2)).padStart(2,'0')+'</span><span>'+days.length+'</span></div><p>'+(dated?'Alınma tarihine göre '+dated+' fatura':'Bu dönemde alınma tarihi bulunan fatura yok.')+'</p></section></div><section class="overview-panel overview-recent"><div class="overview-panel-head"><h2>Son Gelen Faturalar</h2><button class="text-button" data-go-view="invoices">Tüm Faturalar →</button></div><div class="overview-table-wrap"><table><thead><tr><th>Fatura Numarası</th><th>Tarih</th><th>Firma Adı</th><th>Tür</th><th>Döviz</th><th>Tutar</th><th>Durum</th><th></th></tr></thead><tbody>'+table+'</tbody></table>'+(recent.length?'':'<p class="overview-empty">Bu dönemde fatura bulunmuyor.</p>')+'</div></section></div><aside class="overview-side"><section class="overview-panel"><div class="overview-panel-head"><h2>İzibiz Bağlantı Durumu</h2><span class="overview-badge '+(c.connected?'on':'')+'">'+(c.connected?'Bağlı':'Bağlı değil')+'</span></div><div class="overview-fact"><span>Son kontrol</span><b>'+escape(datetime(last))+'</b></div><div class="overview-fact"><span>Sonraki kontrol</span><b>'+(enabled?escape(datetime(c.nextCheck)):'Kapalı')+'</b></div><div class="overview-fact"><span>Otomatik takip</span><b>'+(enabled?'Açık':'Kapalı')+'</b></div><button class="overview-side-link" data-go-view="dashboard">Takip ayarları →</button></section><section class="overview-panel"><div class="overview-panel-head"><h2>Telefon Bildirimleri</h2><span class="overview-badge '+(activeDevices.length?'on':'')+'">'+(!deviceStateKnown?'Kontrol ediliyor':activeDevices.length?'Aktif':'Kapalı')+'</span></div>'+(deviceStateKnown?(activeDevices.length?activeDevices.slice(0,2).map(d=>'<div class="overview-device">'+icon('notifications')+'<span>'+escape(d.name)+'</span><b>Bağlı</b></div>').join(''):'<p class="overview-empty">Bağlı cihaz yok.</p>'):'<p class="overview-empty">Cihaz durumu yükleniyor…</p>')+'<button class="overview-side-link" data-go-view="notifications">Bildirim Ayarları</button></section><section class="overview-panel"><div class="overview-panel-head"><h2>Hızlı İşlemler</h2></div><div class="overview-quick"><button data-go-view="invoices">'+icon('invoices')+' Tüm Faturaları Gör</button><button data-go-view="folders">'+icon('folders')+' Dönem Arşivine Git</button><button data-go-view="dashboard">'+icon('clock')+' Takip Ayarları</button><button data-go-view="notifications">'+icon('notifications')+' Bildirim Ayarları</button></div></section></aside></div><div class="overview-finance"><strong>Bu Dönem<br><small>'+escape(monthName(current))+'</small></strong><div>Toplam Tutar<b>'+money(sum)+' TRY</b></div><div>Dövizli Tutar<b>'+escape(Object.entries(foreignTotals).map(([k,v])=>money(v)+' '+k).join(' · ')||'—')+'</b></div><div>Ortalama Fatura<b>'+(amounts.length?money(sum/amounts.length)+' TRY':'—')+'</b></div><div>En Yüksek Fatura<b>'+(amounts.length?money(Math.max(...amounts))+' TRY':'—')+'</b></div><div>En Düşük Fatura<b>'+(amounts.length?money(Math.min(...amounts))+' TRY':'—')+'</b></div></div>';
  $('overviewPeriod').onchange=e=>{overviewPeriod=e.target.value;renderOverview();};
}
function renderDashboardLegacy(){
  const c=info(company);if(!c)return;const enabled=!!c.settings?.enabled,counts=monthCounts(),connected=devices.filter(d=>d.active!==false);
  const stats=[['total','Tüm faturalar','all'],['fresh','Yeni gelen','new'],['waiting','Bekleniyor','waiting'],['done','İşlendi','done'],['rejected','Reddedildi','rejected']];
  $('dashboardContent').innerHTML='<div class="automation-settings settings-panel"><div class="automation-heading"><h3>Otomatik takip</h3><span class="mode-badge '+(enabled&&c.connected?'on':'')+'">'+(!c.connected?'Bağlantı gerekli':enabled?'AÇIK':'KAPALI')+'</span></div><p>Açıkken bilgisayarın ve bu sayfa kapalı olsa da kontrol devam eder.</p><dl class="automation-facts"><div><dt>Kontrol saatleri</dt><dd>Hafta içi 09 · 11 · 13 · 15 · 17</dd></div><div><dt>Son kontrol</dt><dd>'+datetime(c.status?.lastFinished||c.status?.lastSuccess)+'</dd></div><div><dt>Sonraki kontrol</dt><dd>'+(enabled&&c.connected?datetime(c.nextCheck):'Kapalı')+'</dd></div></dl>'+(c.status?.error?'<p class="health error">'+escape(c.status.error)+'</p>':'')+'<button class="'+(enabled?'secondary':'primary')+'-button" data-toggle="'+company+'" data-enabled="'+!enabled+'" '+(!c.connected?'disabled':'')+'>'+(enabled?'Otomatik takibi durdur':'Otomatik takibi aç')+'</button></div><div class="section-head"><h3>'+escape(monthName(month))+'</h3></div><div class="summary-grid">'+stats.map(([key,label,filter])=>'<button type="button" class="stat-card" data-invoice-filter="'+filter+'"><span class="stat-top">'+label+' '+icon('invoices')+'</span><span class="stat-number">'+(counts[key]||0)+'</span><span class="stat-note">Faturaları göster ↗</span></button>').join('')+'</div><button class="notification-link-card" data-go-view="notifications">'+icon('notifications')+'<span><strong>Telefon bildirimleri</strong><small>'+(connected.length?connected.length+' cihaz tüm firmalara bağlı.':'Telefonundan bir kez bildirim iznini aç.')+'</small></span><b>›</b></button>';
}
function renderDashboard(){
  const c=info(company);if(!c)return;const enabled=!!(c.connected&&c.settings?.enabled),last=c.status?.lastFinished||c.status?.lastSuccess,next=c.nextCheck,checks=['09:00','11:00','13:00','15:00','17:00'];
  const result=c.running?'Devam ediyor':!last?'Henüz kontrol edilmedi':c.status?.error?'Hata':'Son kontrol tamamlandı';
  $('dashboardContent').innerHTML='<div class="iz-control-grid"><section class="iz-panel"><h3>'+icon('notifications')+' Otomatik Takip</h3><strong class="iz-big '+(enabled?'success':'')+'">'+(enabled?'Aktif':'Pasif')+'</strong><p>'+(!c.connected?'İzibiz bağlantısı gerekli.':enabled?'Hafta içi otomatik kontrol açık.':'Otomatik kontrol kapalı.')+'</p><button class="secondary-button" data-toggle="'+company+'" data-enabled="'+!c.settings?.enabled+'" '+(!c.connected?'disabled':'')+'>'+(c.settings?.enabled?'Takibi durdur':'Takibi aç')+'</button></section><section class="iz-panel"><h3>'+icon('clock')+' Kontrol Saatleri</h3><p>Hafta içi · Türkiye saati</p><div class="iz-hours">'+checks.map(h=>'<span>'+h+'</span>').join('')+'</div></section><section class="iz-panel"><h3>'+icon('clock')+' Son Kontrol</h3><strong class="iz-big">'+(last?escape(time(last)):'—')+'</strong><p>'+(last?escape(date(last)):'Kayıt yok')+'</p><small>'+escape(result)+'</small></section><section class="iz-panel"><h3>'+icon('clock')+' Sonraki Kontrol</h3><strong class="iz-big">'+(enabled&&next?escape(time(next)):'—')+'</strong><p>'+(enabled&&next?escape(date(next)):'Kapalı')+'</p></section></div><div class="iz-control-middle"><section class="iz-panel"><h3>Çekim İstatistikleri</h3><div class="iz-fact"><span>Toplam kontrol</span><b>—</b></div><div class="iz-fact"><span>Başarılı kontrol</span><b>—</b></div><div class="iz-fact"><span>Başarısız kontrol</span><b>—</b></div><div class="iz-fact"><span>Ortalama işlem süresi</span><b>—</b></div><p>Geçmiş kontrol istatistikleri mevcut değil.</p></section><section class="iz-panel"><h3>Dönemsel Çekim Aktivitesi</h3><div class="iz-chart-empty">Bu dönem için aktivite kaydı bulunmuyor.</div></section></div><section class="iz-panel iz-control-history"><h3>Son Kontrol Geçmişi</h3><div class="iz-history-head"><span>Tarih ve saat</span><span>İşlem</span><span>Durum</span><span>Yeni fatura</span><span>Süre</span></div>'+(last?'<div class="iz-history-row"><span>'+escape(datetime(last))+'</span><span>İzibiz kontrolü</span><span>'+escape(result)+'</span><span>'+(Number.isFinite(c.status?.lastResult?.fresh)?c.status.lastResult.fresh:'—')+'</span><span>—</span></div>':'<p>Henüz kontrol kaydı yok.</p>')+(c.status?.error?'<p class="health error">'+escape(c.status.error)+'</p>':'')+'</section>';
}
async function refresh(force=false){
  if(resetting&&!force||loading&&!force||selectingAll&&!force)return;const request=++refreshRequest;loading=true;
  try{
    const requestedView=view,requestedMonth=periodPinned?month:localMonth(),initial=requestedView==='invoices',p=new URLSearchParams({offset:String(offset),status,month:requestedMonth,q:query});
    const data=initial?await api(apiURL(company,'bootstrap')+'?'+p):{summary:await api(apiURL(company,'summary')),invoices:null},summary=data.summary,prefetchedInvoices=data.invoices;
    if(request!==refreshRequest)return;if(summary.company.id!==company)throw Error('Firma bilgisi doğrulanamadı.');state={companies:[summary],events:state.events};
    if(!periodPinned)month=localMonth();clearTimeout(typeRefreshTimer);if(summary.running)typeRefreshTimer=setTimeout(()=>{if(!document.hidden&&!$('folderDialog').open&&!selected.size)refresh();},2000);await changeView(view,requestedView===view&&requestedMonth===month?prefetchedInvoices:null);refreshDevicesInBackground();
  }catch(e){if(request===refreshRequest)notice(e.message);}finally{if(request===refreshRequest)loading=false;}
}
function refreshDevicesInBackground(){
  if(deviceRefreshPromise||view==='notifications')return deviceRefreshPromise;
  deviceRefreshPromise=api(pushURL('devices')).then(data=>{devices=data.devices;deviceStateKnown=true;renderTrackingStatus();if(view==='dashboard')renderDashboard();if(view==='overview')renderOverview();return repairPushSubscription();}).catch(()=>{}).finally(()=>deviceRefreshPromise=null);return deviceRefreshPromise;
}
async function loadInvoices(targetOffset=0,prefetched=null){
  const request=++invoiceRequest;
  const p=new URLSearchParams({offset:String(targetOffset),status,month,q:query});let data;if(hasAdvancedInvoiceFilters()){const filtered=await filteredInvoices();const actual=Math.min(targetOffset,Math.max(0,Math.ceil(filtered.length/100)-1)*100);data={rows:filtered.slice(actual,actual+100),total:filtered.length,offset:actual};}else data=prefetched||await api(apiURL(company,'invoices')+'?'+p);if(request!==invoiceRequest)return;
  offset=data.offset??targetOffset;selected.clear();rows=data.rows.map(r=>({...r,company:companyContext}));more=data.total>offset+data.rows.length;
  const start=info(company)?.period?.startMonth,before=start&&month<start;
  const note=query||status!=='all'?'Seçtiğin filtreye uygun fatura bulunamadı.':before?'Takip '+monthName(start)+' ayında başladı.':month===localMonth()?'Tüm Firmaları Güncelle ile bütün bağlı firmaları tek seferde kontrol edebilirsin.':'Bu ay için kayıtlı fatura bulunmuyor.';
  $('invoiceList').innerHTML=rows.length?invoiceHeader()+rows.map(invoiceHTML).join(''):empty(monthName(month)+' için fatura yok',note);
  renderInvoicePagination(data.total);renderSelection();renderFilters();updateButtons();
  if(previewAuto){const row=rows.find(r=>r.uuid===previewId&&r.pdfReady)||rows.find(r=>r.pdfReady);if(row&&row.uuid!==previewId)openInvoicePreview(row);else if(!row)closeInvoicePreview(false);}
}
function hasAdvancedInvoiceFilters(){return !!($('invoiceFrom').value||$('invoiceTo').value||$('invoiceType').value||$('invoiceCurrency').value||$('invoiceSort').value==='new');}
async function filterSource(){const signature=JSON.stringify([month,info(company)?.monthly?.[month],info(company)?.status?.lastFinished]);if(!invoiceFilterCache||invoiceFilterCache.signature!==signature)invoiceFilterCache={signature,rows:await overviewMonthRows(month)};return invoiceFilterCache.rows;}
async function filteredInvoices(){const source=await filterSource(),from=$('invoiceFrom').value,to=$('invoiceTo').value,type=$('invoiceType').value,currency=$('invoiceCurrency').value,q=query.toLocaleUpperCase('tr');let list=source.filter(r=>(!from||r.tarih>=from)&&(!to||r.tarih<=to)&&(!type||r.tip===type)&&(!currency||(r.birim||'TRY')===currency)&&(status==='all'||invoiceState(r)===status)&&(!q||(r.fatno+' '+r.unvan).toLocaleUpperCase('tr').includes(q)));if($('invoiceSort').value==='new')list=list.slice().reverse();return list;}
async function populateInvoiceFilters(){const source=await filterSource();for(const [id,key] of [['invoiceType','tip'],['invoiceCurrency','birim']]){const select=$(id),value=select.value,values=[...new Set(source.map(r=>r[key]||(key==='birim'?'TRY':'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));select.innerHTML='<option value="">'+(key==='tip'?'Tüm tipler':'Tüm dövizler')+'</option>'+values.map(v=>'<option value="'+escape(v)+'">'+escape(v)+'</option>').join('');select.value=value;}}
function renderInvoicePagination(total,allSelected=false){
  $('invoicePagination').hidden=total<=100||allSelected;
  $('previousInvoices').disabled=offset===0;
  $('loadMore').hidden=false;$('loadMore').disabled=!more;
  $('invoicePageInfo').textContent=total?(offset+1)+'–'+Math.min(offset+rows.length,total)+' / '+total+' fatura':'0 fatura';
}
async function navigateInvoices(targetOffset){
  await loadInvoices(targetOffset);$('invoiceList').scrollIntoView({block:'start'});
}
const invoiceColumns=[['number','FATURA NUMARASI'],['date','TARİH'],['supplier','FİRMA ADI'],['type','FATURA TİPİ'],['amount-cell','TUTAR'],['currency','BİRİM']];
function invoiceHeader(){return '<div class="invoice-table-head"><label class="invoice-select-label"><input type="checkbox" data-select-all aria-label="Bu listedeki tüm faturaları seç"><span class="select-all-caption">Tümünü seç</span></label><div class="invoice-fields">'+invoiceColumns.map(([,title])=>'<span class="invoice-column-heading">'+title+'</span>').join('')+'</div><span class="invoice-status-heading">DURUM</span><span class="iz-action-heading">İŞLEMLER</span></div>';}
function pdfLink(id,uuid,download=false){
  return 'href="'+apiURL(id,'pdf')+'?'+new URLSearchParams({id:uuid,...(download?{download:'1'}:{})})+'" '+(download?'download':'target="_blank" rel="noopener"');
}
function pdfActions(id,uuid){return '<a '+pdfLink(id,uuid)+'>PDF önizle ↗</a><a '+pdfLink(id,uuid,true)+'>PDF indir</a>';}
function invoiceHTML(r){
  const key=r.company.id+':'+r.uuid,label=stateLabel(r);
  const type=r.tipLabel||((r.profile?({TEMELFATURA:'Temel',TICARIFATURA:'Ticari'})[r.profile]||r.profile:'—')+' - '+(({SATIS:'Satış',IADE:'İade',TEVKIFAT:'Tevkifat',ISTISNA:'İstisna',OZELMATRAH:'Özel matrah',IHRACKAYITLI:'İhraç kayıtlı',SGK:'SGK'})[r.tip]||r.tip||'—'));
  const values=[r.fatno,r.tarih.split('-').reverse().join('.'),r.unvan,type,money(r.tutar),r.birim||'TRY'];
  const fields=invoiceColumns.map(([name,title],i)=>'<div class="invoice-field invoice-'+name+'"><span class="invoice-field-label">'+title+'</span>'+(name==='supplier'?'<h3 class="invoice-title invoice-value">':'<span class="invoice-value'+(name==='amount-cell'?' invoice-amount':'')+'">')+escape(values[i])+(name==='supplier'?'</h3>':'</span>')+'</div>').join('');
  return '<article class="invoice-row '+(r.done&&!r.isRet?'done':'')+'" data-invoice-id="'+escape(r.uuid)+'" style="--company:'+escape(r.company.color)+'"><input type="checkbox" data-select="'+key+'" aria-label="'+escape(r.fatno)+' faturasını seç" '+(r.isRet?'disabled':'')+' '+(selected.has(key)?'checked':'')+'><div class="invoice-fields">'+fields+'</div><div class="invoice-right"><span class="status-chip '+(r.isRet?'ret':r.done?'done':invoiceState(r)==='waiting'?'waiting':'')+'">'+label+'</span></div><div class="invoice-actions">'+(r.pdfReady?'<button type="button" data-preview="'+escape(r.uuid)+'" aria-label="PDF önizle">'+icon('file')+'</button><a '+pdfLink(r.company.id,r.uuid,true)+' aria-label="PDF indir">'+icon('download')+'</a>':r.isRet?'':'<span class="health error">'+escape(r.pdfError?'PDF hazırlanamadı':'PDF hazırlanıyor')+'</span>')+'<details class="iz-action-menu"><summary aria-label="Diğer işlemler">⋮</summary><div>'+(!r.isRet?'<button class="'+(r.done?'undo-invoice':'')+'" data-mark="'+key+'" data-done="'+(!r.done)+'">'+(r.done?'Geri al':'İşlendi olarak işaretle')+'</button>':'')+(r.pdfReady?'<p>Alınma: '+escape(receivedLabel(r))+'</p>':'')+'<p>İzibiz yanıtı: '+escape(r.yanit||'—')+'</p></div></details></div></article>';
}
function renderUndo(){
  $('undoBar').hidden=!undoEntries.length;$('undoMessage').textContent=undoMessage;$('undoLastMark').disabled=marking;
  document.querySelectorAll('[data-mark],[data-bulk]').forEach(button=>button.disabled=marking||selectingAll);updateButtons();
}
function renderSelection(){
  $('selectionBar').hidden=!selected.size;$('selectedCount').textContent=selected.size+' fatura seçili';
  const all=$('invoiceList').querySelector('[data-select-all]'),eligible=rows.filter(r=>!r.isRet),count=eligible.filter(r=>selected.has(r.company.id+':'+r.uuid)).length;
  if(all){all.checked=eligible.length>0&&count===eligible.length&&!more&&offset===0;all.indeterminate=count>0&&!all.checked;all.disabled=selectingAll||marking||(!eligible.length&&!more);all.setAttribute('aria-label',selectingAll?'Faturalar seçilmek üzere yükleniyor':'Bu listedeki tüm faturaları seç');}
  $('loadMore').disabled=selectingAll||!more;$('previousInvoices').disabled=selectingAll||offset===0;renderUndo();
}
async function selectAllInvoices(checked){
  if(selectingAll||marking)return;
  if(!checked){selected.clear();$('invoiceList').querySelectorAll('[data-select]').forEach(n=>n.checked=false);renderSelection();return;}
  const request=++invoiceRequest;selectingAll=true;renderSelection();
  try{
    // Read the complete filtered list afresh so a stale page cannot shift offsets.
    const loaded=[];let total=Infinity;
    if(hasAdvancedInvoiceFilters()){loaded.push(...(await filteredInvoices()).map(r=>({...r,company:companyContext})));if(request!==invoiceRequest)return;total=loaded.length;}
    while(loaded.length<total){
      const p=new URLSearchParams({offset:String(loaded.length),status,month,q:query}),data=await api(apiURL(company,'invoices')+'?'+p);
      if(request!==invoiceRequest)return;
      total=data.total;if(!data.rows.length&&loaded.length<total)throw Error('Liste değişti. Tümünü seç işlemini yeniden dene.');
      loaded.push(...data.rows.map(r=>({...r,company:companyContext})));
    }
    if(new Set(loaded.map(r=>r.uuid)).size!==loaded.length)throw Error('Liste değişti. Tümünü seç işlemini yeniden dene.');
    rows=loaded;offset=0;more=false;selected.clear();for(const row of rows)if(!row.isRet)selected.set(row.company.id+':'+row.uuid,row);
    $('invoiceList').innerHTML=rows.length?invoiceHeader()+rows.map(invoiceHTML).join(''):empty('Fatura bulunamadı','Seçtiğin filtreye uygun fatura bulunamadı.');renderInvoicePagination(total,true);
  }catch(e){notice(e.message);}finally{selectingAll=false;renderSelection();}
}
async function mark(items,done){
  if(marking||resetting||selectingAll)return;
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
async function loadFolders(report=false){
  const request=++folderRequest,data=await api(apiURL(company,'folders')+'?'+new URLSearchParams({month}));if(request!==folderRequest)return;
  const folders=data.folders;
  $('folderList').innerHTML='<button type="button" class="text-button archive-back" data-archive-index>← Tüm dönemler</button>'+(folders.length?folders.map(f=>'<article class="folder-card"><div class="folder-top"><span class="folder-icon">'+icon('accounting')+'</span><span class="folder-file-count">'+f.pdfs+' PDF</span></div><h3>'+escape(f.name)+'</h3><p class="folder-date-label">ALINMA TARİHLERİ</p><p class="folder-received-dates">'+escape(collectionDates(f))+'</p><div class="folder-detail"><span>'+f.fresh+' yeni · '+f.waiting+' bekleyen</span><span>'+(f.excel?(f.excel.current?'Excel hazır':'Excel güncelleniyor'):'Excel hazırlanıyor')+'</span></div><div class="folder-action"><button class="text-button" data-folder="'+f.id+'">Dosyaları aç ↗</button>'+(f.excel?.current?'<a class="text-button" href="'+apiURL(company,'month-excel')+'?month='+f.month+'" download>Excel’i indir</a>':'')+'<a class="text-button muted" href="'+apiURL(company,'export')+'?folder='+f.id+'" download>ZIP indir</a><button type="button" class="text-button folder-card-delete" data-delete-folder="'+f.id+'" data-folder-name="'+escape(f.name)+'" aria-label="'+escape(f.name)+' klasörünü sil">'+icon('trash')+' Sil</button></div></article>').join(''):empty(monthName(month)+' arşivi boş',month<(info(company)?.period?.startMonth||'')?'Takip '+monthName(info(company).period.startMonth)+' ayında başladı.':'PDF’ler alındığında bu ayın dosyaları burada görünür.','accounting'));
  if(report){const result=data.repair||{},changes=(result.repaired||0)+(result.merged||0)+(result.created||0);toast(changes?'Klasörler kontrol edildi; eksik bağlantılar onarıldı.':'Klasörler kontrol edildi. Eksik kayıt yok.');}
}
async function openFolder(id,folder,targetOffset=0){
  const request=++folderPageRequest;if(!info(id))throw Error('Firma bulunamadı.');
  const [result,data]=await Promise.all([api(apiURL(id,'folders')),api(apiURL(id,'invoices')+'?'+new URLSearchParams({folder,offset:String(targetOffset)}))]);
  if(request!==folderPageRequest)return;
  const group=result.folders.find(f=>f.id===folder);if(!group)throw Error('Klasör bulunamadı.');
  const pageOffset=data.offset??targetOffset,limit=data.limit||100;
  currentFolder={id,folder,name:group.name,offset:pageOffset};
  $('folderContent').innerHTML='<h2>'+escape(group.name)+'</h2><p class="subtle">'+group.pdfs+' PDF · '+group.fresh+' yeni · '+group.waiting+' bekleyen.</p><p class="folder-received-dates">Alınma tarihleri: '+escape(collectionDates(group))+'</p><div class="dialog-actions">'+(group.excel?.current?'<a class="primary-button" href="'+apiURL(id,'month-excel')+'?month='+group.month+'" download>Excel’i indir</a>':'<span>Excel güncelleniyor…</span>')+'<a class="secondary-button" href="'+apiURL(id,'export')+'?folder='+folder+'" download>ZIP indir</a></div><div class="excel-note">'+(group.excel?'<strong>'+escape(group.excel.name)+'</strong><br>'+datetime(group.excel.at)+' tarihinde oluşturuldu. '+(group.excel.current?'Ayın tüm faturaları ve durumlarıyla otomatik güncel.':'Ayın faturaları değişti; Excel otomatik güncelleniyor.'):'Ayın bütün faturaları, Yeni gelen / Bekleniyor / İşlendi durumlarıyla otomatik Excel’e eklenir.')+'</div><div class="folder-files">'+data.rows.map(r=>'<div class="folder-file">'+icon('file')+'<div class="folder-file-info"><a '+pdfLink(id,r.uuid)+'>'+escape(r.unvan+' - '+r.fatno)+'.pdf</a><small>Fatura tarihi: '+escape(calendarDate(r.tarih))+' · Alınma: '+escape(receivedLabel(r))+'</small><div class="folder-pdf-actions">'+pdfActions(id,r.uuid)+'</div></div><span class="status-chip '+(r.done?'done':'')+'">'+stateLabel(r)+'</span></div>').join('')+'</div>'+(data.total>limit?'<nav class="pagination" aria-label="Klasör dosyalarının sayfaları"><button class="secondary-button" data-folder-page="'+Math.max(0,pageOffset-limit)+'" '+(pageOffset===0?'disabled':'')+'>Önceki Sayfa</button><span aria-live="polite">'+(pageOffset+1)+'–'+Math.min(pageOffset+data.rows.length,data.total)+' / '+data.total+' PDF</span><button class="secondary-button" data-folder-page="'+(pageOffset+limit)+'" '+(pageOffset+data.rows.length>=data.total?'disabled':'')+'>Sonraki Sayfa</button></nav>':'')+'<button class="danger-button folder-delete" data-folder-action="delete">Klasörü sil</button><p class="fineprint subtle">Bu ayın klasöründeki dosyaları siler. Faturaların işlem durumu korunur; aynı PDF’ler tekrar alınmaz.</p>';
  if(!$('folderDialog').open)$('folderDialog').showModal();
  $('folderDialog').scrollTop=0;
}
function closeFolder(){++folderPageRequest;currentFolder=null;$('folderDialog').close();}
async function previousPage(){
  if($('folderDialog').open){closeFolder();return;}
  const previous=viewHistory.pop();if(!previous){location.href='/workspace/'+company+'/';return;}
  month=previous.month;status=previous.status;query=previous.query;periodPinned=true;$('searchInput').value=query;view=previous.view;await changeView(view,null,previous.offset||0);
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
  const [firstDevices,history]=await Promise.all([api(pushURL('devices')),api(apiURL(company,'events')).catch(()=>({events:[],unavailable:true}))]);state.events=history.events;state.eventsUnavailable=!!history.unavailable;
  let data=firstDevices;devices=data.devices;deviceStateKnown=true;pushId=subscription?await subscriptionId(subscription.endpoint):null;
  let saved=devices.find(d=>d.id===pushId);
  if(subscription&&permission==='granted'&&(!saved||saved.active===false)){
    await api(pushURL('subscribe'),{subscription:subscription.toJSON(),name:deviceName()});data=await api(pushURL('devices'));devices=data.devices;saved=devices.find(d=>d.id===pushId);
  }
  const ready=!!saved&&saved.active!==false&&usable&&permission==='granted',needsInstall=ios&&!standalone,hasConnectedDevice=devices.some(d=>d.active!==false);
  $('pushStatus').textContent=ready?'Bu telefon tüm firmaların bildirimlerine bağlı.':needsInstall?'Telefonunda hata yok. Bu sayfa Safari sekmesinde açık.':!usable?'Bu tarayıcıda telefon bildirimi açılamıyor.':permission==='denied'?'Bildirim izni kapalı. iPhone Ayarları’ndan açabilirsin.':ios?'Doğru yerdesin. Aşağıdaki düğmeye bir kez bas.':'Bu cihazda bildirimler henüz açık değil.';
  const setup=$('pushSetupSteps');setup.hidden=!needsInstall||hasConnectedDevice;setup.innerHTML=needsInstall&&!hasConnectedDevice?'<strong>iPhone’da yalnızca bir kez yap:</strong><ol><li>Safari’de Paylaş menüsünü aç.</li><li>Ana Ekrana Ekle’ye bas.</li><li>Ana ekrandaki SW logolu uygulama simgesini aç.</li><li>Bildirimler bölümünde “Bu telefonu tüm firmalara bağla” düğmesine bas ve İzin Ver’i seç.</li></ol><p>Herhangi bir firmanın ekranı yeterli. Bilgisayardan işlem yapma; diğer firmalarda tekrarlama.</p>':'';
  $('enablePush').hidden=ready||needsInstall;$('enablePush').disabled=!usable||permission==='denied';$('testPush').hidden=!ready;
  $('enablePush').textContent=hasConnectedDevice?'Bu cihazı da tüm firmalara bağla':'Bu telefonu tüm firmalara bağla';
  $('pushHelp').textContent=ready?'Kurulum tamam. Hafta içi 09 · 11 · 13 · 15 · 17’de tüm firmaların özeti bu telefona gelir.':needsInstall?'Ana ekrana ekledikten sonra Safari’yi kapatıp mutlaka uygulama simgesinden aç.':ios?'Bu işlem tüm firmalar için tek seferliktir. Başka firmalarda yeniden açma veya test yapma.':'Telefonuna bildirim istiyorsan bu işlemi bilgisayardan değil, telefonundaki ana ekran uygulamasından yap.';
  if(ready)$('pushHelp').textContent='Kurulum tamam. Site güncellendiğinde yeniden ana ekrana eklemen veya firmaları tek tek bağlaman gerekmez. Hafta içi 09 · 11 · 13 · 15 · 17 kontrolleri aynı telefon kaydını kullanır; yeni fatura yoksa da sonuç bildirimi hazırlanır.';
  else if(hasConnectedDevice){$('pushStatus').textContent=needsInstall?'Safari sekmesindesin. Hesabında bildirimlere bağlı cihaz var.':'Hesabında tüm firmalara bağlı '+devices.filter(d=>d.active!==false).length+' cihaz var.';$('pushHelp').textContent=needsInstall?'Bu telefonda daha önce kurduysan mevcut ana ekran simgesinden aç; site güncellemeleri için yeniden ekleme. Yeni bir telefon kullanıyorsan yalnızca o cihazı bir kez kur.':ios?'Mevcut bağlı cihazlar için yeniden kurulum gerekmez. Bu yeni telefonu da bağlamak istersen aşağıdaki düğmeyi kullan.':'Bağlı telefon için yeniden kurulum gerekmez. Bu bilgisayarı ayrıca bağlamak zorunda değilsin.';}
  $('deviceCount').textContent='('+devices.filter(d=>d.active!==false).length+')';$('deviceList').innerHTML=devices.length?devices.map(d=>'<div class="device-row">'+icon('notifications')+'<span><strong>'+escape(d.name)+'</strong><small>'+(d.active===false?'Bağlantı yenilenmeli':d.id===pushId?'Bu cihaz · Bağlı':'Bağlı')+(d.lastSent?' · Son gönderim '+escape(datetime(d.lastSent)):'')+'</small></span><div class="device-actions"><button data-remove-device="'+d.id+'">Kaldır</button></div></div>').join(''): '<p class="subtle">Hesaba henüz bildirim cihazı bağlanmadı.</p>';
  for(const id of selectedEvents)if(!state.events.some(e=>e.id===id))selectedEvents.delete(id);
  renderEventHistory();updateEventSelection();renderTrackingStatus();
}
function renderEventHistory(){const current=localMonth(),previous=previousMonth(current),monthFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit'}),events=state.events.filter(e=>eventPeriod==='all'||e.created&&monthFormat.format(new Date(e.created))===eventPeriod);$('eventPeriods').innerHTML=[['all','Tümü'],[previous,monthName(previous)],[current,monthName(current)]].map(([value,label])=>'<button type="button" data-event-period="'+value+'" aria-pressed="'+(eventPeriod===value)+'">'+escape(label)+'</button>').join('');$('eventList').innerHTML=state.eventsUnavailable?'<p class="subtle">Bildirim geçmişi alınamadı.</p>':events.length?events.map(e=>'<article class="event"><label class="event-select"><input type="checkbox" data-event-id="'+escape(e.id)+'" aria-label="'+escape(e.title||'Bildirim')+' bildirimini seç" '+(selectedEvents.has(e.id)?'checked':'')+'></label><div><strong>'+escape(e.title||'Bildirim')+'</strong><p>'+escape(e.body||'')+'</p><time>'+datetime(e.created)+'</time></div></article>').join(''):'<p class="subtle">Bu dönemde bildirim kaydı yok.</p>';$('notificationSummary').innerHTML='<div class="iz-fact"><span>Bildirim kaydı</span><b>'+(state.eventsUnavailable?'—':events.length)+'</b></div><div class="iz-fact"><span>Bağlı cihaz</span><b>'+devices.filter(d=>d.active!==false).length+'</b></div><p>Bildirimlerin kesin teslim durumu bu kayıtlarda bulunmuyor.</p>';}
$('eventPeriods').onclick=e=>{const b=e.target.closest('[data-event-period]');if(b){eventPeriod=b.dataset.eventPeriod;renderEventHistory();}};
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
  panel.innerHTML='<strong>Faturalar Anlık Durum</strong><small>Yeni Gelen toplamı; işlenenler hariç. Ayın 15’i dahil önceki ve mevcut ay, sonrasında mevcut ay. Daha eski işlenmemiş faturalar ayrıca gösterilir. Sunucudaki son kayıtlar.</small>'+result.results.map(r=>{
    const months=(r.monthly||[]).map(m=>monthName(m.month)+' '+m.count+' Adet').join(' · ')||(r.error?'Güncel durum doğrulanamadı':'İşlenmemiş fatura yok');
    const older=(r.olderMonthly||[]).map(m=>monthName(m.month)+' '+m.count+' Adet').join(' · ');
    const note=!r.connected?'İzibiz bağlantısı yok':r.error?'Son kontrol tamamlanamadı':r.running?'Kontrol sürüyor':!r.enabled?'Otomatik takip kapalı':'';
    return '<p><b>'+escape(r.name)+' · '+(r.pending||0)+' İşlenmemiş Fatura</b><span>Yeni + bekleyen: '+escape(months)+'</span>'+(older?'<span>Önceki aylardan bekleyen: '+escape(older)+'</span>':'')+'<small>'+escape(note)+(note?' · ':'')+'Son kontrol: '+(r.lastFinished?escape(new Date(r.lastFinished).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})):'Henüz tamamlanmadı')+'</small></p>';
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
$('trackingStatus').onclick=e=>handleNavigation(e).catch(e=>notice(e.message));$('dashboardView').onclick=e=>handleNavigation(e).catch(e=>notice(e.message));$('overviewView').onclick=e=>{const item=e.target.closest('[data-overview-month]');if(item){month=item.dataset.overviewMonth;periodPinned=true;status='all';query='';$('searchInput').value='';changeView('invoices').catch(err=>notice(err.message));return;}handleNavigation(e).catch(err=>notice(err.message));};
$('openNotifications').onclick=()=>changeView('notifications');$('refreshButton').onclick=()=>busy($('refreshButton'),()=>refresh());
$('previousYear').onclick=()=>{monthSpotlight=false;selectPeriod((Number(month.slice(0,4))-1)+month.slice(4)).catch(e=>notice(e.message));};$('nextYear').onclick=()=>{monthSpotlight=false;selectPeriod((Number(month.slice(0,4))+1)+month.slice(4)).catch(e=>notice(e.message));};
$('yearSelect').onchange=()=>{monthSpotlight=false;selectPeriod($('yearSelect').value+month.slice(4)).catch(e=>notice(e.message));};$('monthGrid').onclick=e=>{const b=e.target.closest('[data-month]');if(!b)return;monthSpotlight=!(monthSpotlight&&b.dataset.month===month);$('monthGrid').classList.toggle('spotlight',monthSpotlight);selectPeriod(b.dataset.month).catch(e=>notice(e.message));};
$('statusFilters').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;status=b.dataset.status;renderFilters();loadInvoices().catch(e=>notice(e.message));};
$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=$('searchInput').value.trim();loadInvoices().catch(e=>notice(e.message));},250);};
for(const id of ['invoiceFrom','invoiceTo','invoiceType','invoiceCurrency','invoiceSort'])$(id).onchange=()=>loadInvoices().catch(e=>notice(e.message));
for(const id of ['invoiceType','invoiceCurrency'])$(id).onfocus=()=>populateInvoiceFilters().catch(e=>notice(e.message));
$('clearInvoiceFilters').onclick=()=>{for(const id of ['invoiceFrom','invoiceTo','invoiceType','invoiceCurrency'])$(id).value='';$('invoiceSort').value='old';$('searchInput').value='';query='';status='all';renderFilters();loadInvoices().catch(e=>notice(e.message));};
$('loadMore').onclick=()=>busy($('loadMore'),()=>navigateInvoices(offset+100));
$('previousInvoices').onclick=()=>busy($('previousInvoices'),()=>navigateInvoices(Math.max(0,offset-100)));
$('previousPage').onclick=()=>previousPage().catch(e=>notice(e.message));
$('checkFolders').onclick=()=>busy($('checkFolders'),()=>loadFolders(true));
$('invoiceList').onchange=e=>{if(e.target.matches('[data-select-all]')){selectAllInvoices(e.target.checked);return;}const key=e.target.dataset.select;if(!key)return;const row=rows.find(r=>r.company.id+':'+r.uuid===key);if(!row||row.isRet)return;if(e.target.checked)selected.set(key,row);else selected.delete(key);renderSelection();};
$('invoiceList').onclick=e=>{const preview=e.target.closest('[data-preview]');if(preview){const row=rows.find(r=>r.uuid===preview.dataset.preview&&r.pdfReady);if(row){previewAuto=true;openInvoicePreview(row);}return;}const b=e.target.closest('[data-mark]');if(b){busy(b,async()=>{const row=rows.find(r=>r.company.id+':'+r.uuid===b.dataset.mark);if(row)await mark([row],b.dataset.done==='true');});return;}if(e.target.closest('button,a,input,summary,details'))return;const item=e.target.closest('[data-invoice-id]'),row=item&&rows.find(r=>r.uuid===item.dataset.invoiceId&&r.pdfReady);if(row){previewAuto=true;openInvoicePreview(row);}};
async function renderPreviewPage(request){if(!previewDocument)return;const sequence=++previewRenderSeq;try{if(previewTask){const previousTask=previewTask;previewTask=null;previousTask.cancel();await previousTask.promise.catch(()=>{});}if(request!==previewRequest||sequence!==previewRenderSeq||!previewDocument)return;const page=await previewDocument.getPage(previewPage);if(request!==previewRequest||sequence!==previewRenderSeq)return;const base=page.getViewport({scale:1}),scale=Math.min(4,Math.min(2,900/base.width)*Math.max(1,previewZoom)),viewport=page.getViewport({scale}),canvas=$('invoicePreviewCanvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=(previewZoom*100)+'%';previewTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await previewTask.promise;if(request!==previewRequest||sequence!==previewRenderSeq)return;canvas.hidden=false;$('invoicePreviewMessage').hidden=true;$('invoicePreviewPage').textContent=previewPage+' / '+previewDocument.numPages;$('invoicePreviewPages').hidden=previewDocument.numPages<2;$('invoicePreviewPrevious').disabled=previewPage<=1;$('invoicePreviewNext').disabled=previewPage>=previewDocument.numPages;}catch(e){if(request===previewRequest&&sequence===previewRenderSeq&&e.name!=='RenderingCancelledException'){$('invoicePreviewMessage').textContent='PDF sayfası görüntülenemedi. Dosyayı açabilir veya indirebilirsiniz.';$('invoicePreviewMessage').hidden=false;}}}
async function openInvoicePreview(row){const request=++previewRequest;previewId=row.uuid;previewPage=1;if(previewFetch)previewFetch.abort();if(previewTask)previewTask.cancel();if(previewDocument){previewDocument.destroy().catch(()=>{});previewDocument=null;}previewFetch=new AbortController();$('invoicePreview').hidden=false;$('invoicePreviewName').textContent=row.fatno+' · '+row.unvan;$('invoicePreviewActions').innerHTML=pdfActions(company,row.uuid);$('invoicePreviewCanvas').hidden=true;$('invoicePreviewPages').hidden=true;$('invoicePreviewMessage').textContent='PDF yükleniyor…';$('invoicePreviewMessage').hidden=false;try{const url=apiURL(company,'pdf')+'?'+new URLSearchParams({id:row.uuid});const [response]=await Promise.all([fetch(url,{credentials:'same-origin',signal:previewFetch.signal}),pdfLoaderPromise||(pdfLoaderPromise=import('/app/pdf-loader.mjs').catch(e=>{pdfLoaderPromise=null;throw e;}))]);if(!response.ok)throw Error('PDF alınamadı');const data=await response.arrayBuffer();if(request!==previewRequest)return;const doc=await window.pdfjsLib.getDocument({data}).promise;if(request!==previewRequest){doc.destroy().catch(()=>{});return;}previewDocument=doc;await renderPreviewPage(request);}catch(e){if(request===previewRequest&&e.name!=='AbortError'){$('invoicePreviewMessage').textContent='PDF görüntülenemedi. Dosyayı açabilir veya indirebilirsiniz.';$('invoicePreviewMessage').hidden=false;}}}
function closeInvoicePreview(manual=true){if(manual)previewAuto=false;++previewRequest;previewId=null;if(previewFetch)previewFetch.abort();if(previewTask)previewTask.cancel();if(previewDocument)previewDocument.destroy().catch(()=>{});previewDocument=null;$('invoicePreview').hidden=true;}
$('closeInvoicePreview').onclick=()=>closeInvoicePreview();$('invoicePreviewPrevious').onclick=()=>{if(previewPage>1){previewPage--;renderPreviewPage(previewRequest);}};$('invoicePreviewNext').onclick=()=>{if(previewDocument&&previewPage<previewDocument.numPages){previewPage++;renderPreviewPage(previewRequest);}};
function setPreviewZoom(value){previewZoom=Math.max(.5,Math.min(3,Math.round(value*4)/4));$('invoiceZoomLevel').textContent='%'+Math.round(previewZoom*100);$('invoiceZoomOut').disabled=previewZoom<=.5;$('invoiceZoomIn').disabled=previewZoom>=3;if(previewDocument)renderPreviewPage(previewRequest);}
$('invoiceZoomOut').onclick=()=>setPreviewZoom(previewZoom-.25);$('invoiceZoomIn').onclick=()=>setPreviewZoom(previewZoom+.25);
$('invoicePan').onclick=()=>{previewPan=!previewPan;$('invoicePan').setAttribute('aria-pressed',String(previewPan));$('invoicePreviewPaper').classList.toggle('pan-enabled',previewPan);};
$('invoicePreviewPaper').addEventListener('pointerdown',e=>{if(!previewPan||e.button!==0||e.pointerType==='touch')return;const paper=$('invoicePreviewPaper');previewDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:paper.scrollLeft,top:paper.scrollTop};paper.setPointerCapture(e.pointerId);paper.classList.add('dragging');e.preventDefault();});
$('invoicePreviewPaper').addEventListener('pointermove',e=>{if(!previewDrag||previewDrag.id!==e.pointerId)return;const paper=$('invoicePreviewPaper');paper.scrollLeft=previewDrag.left-(e.clientX-previewDrag.x);paper.scrollTop=previewDrag.top-(e.clientY-previewDrag.y);});
for(const eventName of ['pointerup','pointercancel','lostpointercapture'])$('invoicePreviewPaper').addEventListener(eventName,()=>{previewDrag=null;$('invoicePreviewPaper').classList.remove('dragging');});
$('invoiceSummary').onclick=e=>{const p=e.target.closest('[data-period]');if(p){selectPeriod(p.dataset.period).catch(err=>notice(err.message));return;}if(e.target.closest('[data-period-chooser]')){periodChooserOpen=!periodChooserOpen;renderCalendar();}};
$('archiveTimeline').onclick=e=>{const p=e.target.closest('[data-archive-month]');if(p)selectPeriod(p.dataset.archiveMonth).catch(err=>notice(err.message));};
$('archiveFilters').onclick=e=>{const b=e.target.closest('[data-archive-filter]');if(!b)return;archiveFilter=b.dataset.archiveFilter;archiveIndex=true;document.querySelectorAll('[data-archive-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderArchiveMonths();};$('archiveSearch').oninput=e=>{archiveSearch=e.target.value;archiveIndex=true;renderArchiveMonths();};
$('selectionBar').onclick=e=>{const b=e.target.closest('[data-bulk]');if(b)busy(b,()=>mark([...selected.values()],b.dataset.bulk==='true'));};
$('undoLastMark').onclick=()=>busy($('undoLastMark'),undoLastMark);
$('clearSelection').onclick=()=>{++invoiceRequest;selected.clear();$('invoiceList').querySelectorAll('input[type=checkbox]').forEach(n=>n.checked=false);renderSelection();};
$('scanButton').onclick=runScan;$('clearAllButton').onclick=resetAll;
$('instantStatusButton').onclick=()=>busy($('instantStatusButton'),sendInstantStatus);
async function clearFolder(id,folder,name){if(!confirm((name||'Bu aylık klasör')+' içindeki tüm PDF ve arşiv kayıtları silinsin mi? Aynı dosyalar otomatik olarak tekrar alınmaz. İşlem durumu korunur.'))return;await api(apiURL(id,'delete-folder'),{folder});if(currentFolder?.folder===folder)closeFolder();toast('Klasör dosyaları silindi.');await refresh(true);}
$('folderList').onclick=e=>{if(e.target.closest('[data-archive-index]')){archiveIndex=true;renderArchiveMonths();return;}const entry=e.target.closest('[data-archive-month]');if(entry){selectPeriod(entry.dataset.archiveMonth).catch(err=>notice(err.message));return;}const remove=e.target.closest('[data-delete-folder]');if(remove){busy(remove,()=>clearFolder(company,remove.dataset.deleteFolder,remove.dataset.folderName));return;}const b=e.target.closest('[data-folder]');if(b)busy(b,()=>openFolder(company,b.dataset.folder));};
$('closeFolder').onclick=closeFolder;$('backToFolders').onclick=closeFolder;
$('folderDialog').addEventListener('close',()=>{++folderPageRequest;currentFolder=null;});
$('folderDialog').addEventListener('click',e=>{if(e.target===$('folderDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeFolder();}});
$('folderContent').onclick=e=>{if(!currentFolder)return;const {id,folder,name}=currentFolder,page=e.target.closest('[data-folder-page]');if(page){busy(page,()=>openFolder(id,folder,Number(page.dataset.folderPage)));return;}const b=e.target.closest('[data-folder-action]');if(b?.dataset.folderAction==='delete')busy(b,()=>clearFolder(id,folder,name));};
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
function setTheme(light){document.body.classList.toggle('light-theme',light);$('themeToggle').textContent=light?'☀':'☾';$('themeToggle').setAttribute('aria-label',light?'Koyu temaya geç':'Açık temaya geç');try{localStorage.setItem('sw:automation:theme',light?'light':'dark');}catch{}}
$('themeToggle').onclick=()=>setTheme(!document.body.classList.contains('light-theme'));try{setTheme(localStorage.getItem('sw:automation:theme')==='light');}catch{setTheme(false);}
initNav();renderIdentity();document.querySelectorAll('.view').forEach(node=>node.hidden=node.id!==view+'View');document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));if(view==='invoices')$('invoiceList').innerHTML=empty('Faturalar yükleniyor','Özet ve fatura listesi birlikte hazırlanıyor.');refresh();
})();
