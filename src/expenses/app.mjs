import {categories,normalize,cents,amount,groupedAmount,parseReceipt,draftMissingLines,issues,duplicateIds,exportReadiness,categoryProfile,lineProfile,buildPurchaseXML,encodeLogoXML,splitFlight,lineAmounts,memoryKey,validExpenseCode,validQuantity,matchesReceiptFilters,receiptDescription,rememberedProfile,mergeReceiptReadings,calendarDays} from './model.mjs?v=ocr7';
import {receiptPaperFromPixels} from './crop.mjs?v=ocr5';
const $=id=>document.getElementById(id),company=window.SW_CONTEXT?.company;
if(!company)throw Error('Önce firma çalışma alanından Masraf Fişleri’ni aç.');
const expenseRulesReady=company.id==='PUSULA';
const desktopLayout=matchMedia('(min-width:1100px)');
let inlineAccounting=expenseRulesReady&&desktopLayout.matches;
if(expenseRulesReady)document.body.classList.add('pusula-expenses');
let accountPlan={revision:0,accounts:[]};
if(expenseRulesReady){
 const side=document.createElement('aside');side.className='expense-sidebar';side.setAttribute('aria-label','Modüller');
 side.innerHTML='<div class="expense-sidebar-brand"><img src="/assets/brand/sw-logo.png" alt="" width="46" height="46"><strong>SoyturkWorks<small>Finans ve Muhasebe</small></strong></div><nav><a href="/workspace/PUSULA/" data-page="efatura"><i>▤</i> Gelen E-Fatura Takip</a><a href="/workspace/PUSULA/takip/"><i>☁</i> Gelen E-Fatura İzibiz</a><a href="/workspace/PUSULA/masraf/" class="active" aria-current="page"><i>▧</i> Masraf Fişleri</a><a href="/workspace/PUSULA/" data-page="satis"><i>▤</i> Satış Faturaları</a><a href="/workspace/PUSULA/" data-page="satis-kesme"><i>✎</i> Satış Faturası Kesme</a><a href="/workspace/PUSULA/" data-page="yevmiye"><i>✈</i> Yurt Dışı Yevmiye</a><a href="/workspace/PUSULA/" data-page="mutabakat"><i>♧</i> Cari Mutabakat</a><a href="/workspace/PUSULA/" data-page="notlar"><i>▣</i> Not Alma</a></nav>';
 const icons=['<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8"/>','<path d="M5 16a4 4 0 0 1 0-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 1 9z"/>','<path d="M5 2h10l4 4v16l-3-2-3 2-3-2-3 2-2-1zM9 10h7M9 14h7"/>','<path d="M6 2h9l5 5v15H6zM9 12h8M9 16h8"/>','<path d="M5 3h11l3 3v15H5zM12 10v8M8 14h8"/>','<path d="M2 13 22 3l-7 18-3-6-6 3 2-5z"/>','<path d="M3 12 8 8l4 2 4-2 5 4-6 6-3-2-3 2zM3 12l3 4m15-4-3 4"/>','<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>'];side.querySelectorAll('nav i').forEach((node,index)=>{node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[index]+'</svg>';});
 side.addEventListener('click',e=>{const link=e.target.closest('[data-page]');if(link)try{sessionStorage.setItem('sw:company:v2:PUSULA:fc_active_page',link.dataset.page);}catch{}});
 document.body.prepend(side);
 const list=document.querySelector('.worklist'),grid=document.createElement('div'),left=document.createElement('div'),empty=document.createElement('section');grid.className='expense-work-grid';left.className='expense-left';empty.className='expense-detail-empty panel';empty.innerHTML='<h2>▧ &nbsp; Fiş Detayı</h2><p>Görseli, okunan bilgileri ve muhasebe satırlarını incelemek için listeden bir fiş açın.</p>';const main=document.querySelector('main');main.insertBefore(grid,document.querySelector('.heading'));grid.append(left,empty,document.getElementById('editor'));left.append(document.querySelector('.heading'),document.querySelector('.stats'),document.getElementById('notice'),document.getElementById('progressPanel'),list);list.insertBefore(document.querySelector('.capture'),document.querySelector('.filters'));
 if(inlineAccounting)document.body.append(document.getElementById('editor'));
 const tabs=document.querySelector('.filters [role=group]');tabs.innerHTML='<button data-filter="all" aria-pressed="true">☷ &nbsp; Fişler (Tümü)</button><button data-filter="pending" aria-pressed="false">◷ &nbsp; İnceleme Bekleyen</button><button data-filter="checked" aria-pressed="false">⇧ &nbsp; Logo’ya Aktarılacak</button><button data-filter="exported" aria-pressed="false">✓ &nbsp; Aktarılanlar</button><button data-filter="archived" aria-pressed="false">Arşiv</button>';
 const toolbar=document.createElement('div');toolbar.className='expense-bulkbar';toolbar.innerHTML='<label><input id="expenseSelectAll" type="checkbox"> Tümünü seç</label><select id="expenseBulkAction" aria-label="Toplu işlemler"><option value="">Toplu işlemler</option><option value="backup">Seçilenleri yedekle</option><option value="exported">Logo’da aktarıldı olarak işaretle</option></select><button id="expenseBulkApply" type="button" class="secondary">Uygula</button><span id="expenseSelected">0 seçili</span>';list.insertBefore(toolbar,document.getElementById('receipts'));
 const extra=document.createElement('div');extra.className='expense-extra-filters';extra.innerHTML='<label>Fiş tarihi: başlangıç<input id="expenseDateFrom" type="date"></label><label>Fiş tarihi: bitiş<input id="expenseDateTo" type="date"></label><label>Otomatik okuma<select id="expenseOcrFilter" aria-describedby="expenseFilterHelp"><option value="">Tüm okuma durumları</option><option value="done">Okundu</option><option value="pending">Okuma bekliyor</option><option value="error">Okuma hatası</option></select></label><button type="button" id="expenseClearFilters" class="secondary">Temizle</button>';list.insertBefore(extra,toolbar);
 const filterActions=document.createElement('div');filterActions.className='expense-filter-actions';const clearFilters=extra.querySelector('#expenseClearFilters');clearFilters.replaceWith(filterActions);filterActions.append(document.getElementById('copyLink'),clearFilters);
 const deleteArchived=document.createElement('button');deleteArchived.type='button';deleteArchived.id='expenseDeleteArchived';deleteArchived.className='secondary';deleteArchived.textContent='Seçilenleri sil';deleteArchived.hidden=true;extra.after(deleteArchived);
 const filters=document.querySelector('.filters'),capture=document.querySelector('.capture');list.insertBefore(tabs,capture);extra.prepend(document.getElementById('search'));filters.remove();list.insertBefore(toolbar,extra);
 const searchInput=document.getElementById('search'),searchLabel=document.createElement('label');searchLabel.className='expense-search-label';searchLabel.textContent='Fiş numarası';searchInput.replaceWith(searchLabel);searchLabel.append(searchInput);
 extra.insertAdjacentHTML('afterend','<p id="expenseFilterHelp" class="hint expense-filter-help">Tarih ve okuma durumu fiş listesini süzer. “Okundu”, belge kontrolünün tamamlandığı anlamına gelmez.</p>');
 const columnHead=document.createElement('div');columnHead.className='expense-table-head';columnHead.innerHTML='<span></span><span>Fiş</span><span>Tarih</span><span>Firma / İşletme</span><span>Tutar</span><span>OCR</span><span>Durum</span><span></span>';list.insertBefore(columnHead,document.getElementById('receipts'));
 const top=document.querySelector('.topbar'),theme=document.getElementById('expenseTheme'),companyLink=top.querySelector('a[href="/companies"]'),tools=document.createElement('div'),calendar=document.createElement('button'),notifications=document.createElement('button'),calendarWrap=document.createElement('div'),calendarPanel=document.createElement('div');
 tools.className='expense-top-tools';calendarWrap.className='expense-calendar-wrap';calendarPanel.className='expense-calendar-panel';calendarPanel.id='expenseCalendar';calendarPanel.hidden=true;calendarPanel.setAttribute('role','dialog');calendarPanel.setAttribute('aria-label','Fiş tarihi seç');
 const svg=body=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
 notifications.type='button';notifications.id='expenseNotification';notifications.className='secondary expense-top-icon expense-notification';notifications.innerHTML=svg('<path d="M18 8a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 19a2 2 0 0 0 4 0"/>')+'<span class="expense-notification-dot" aria-hidden="true" hidden></span>';notifications.setAttribute('aria-label','Fiş bildirimleri');notifications.title='Fiş bildirimleri';notifications.onclick=()=>{const n=document.getElementById('pending').textContent;notice(n+' fiş inceleme bekliyor.');};
 calendar.type='button';calendar.className='secondary expense-top-icon expense-calendar-button';calendar.innerHTML=svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9h17M8 13h2M14 13h2M8 17h2"/>');calendar.setAttribute('aria-label','Fiş tarihi seç');calendar.setAttribute('aria-haspopup','dialog');calendar.setAttribute('aria-controls','expenseCalendar');calendar.setAttribute('aria-expanded','false');calendar.title='Fiş tarihi';calendar.onclick=()=>toggleExpenseCalendar();
 theme.classList.add('expense-top-icon','expense-theme-icon');theme.innerHTML=svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>');theme.title='Açık veya koyu görünüm';
 calendarWrap.append(calendar,calendarPanel);tools.append(notifications,calendarWrap,theme,companyLink);top.append(tools);
 document.querySelector('#count + span').textContent='Taranan Fiş';document.querySelector('#pending + span').textContent='İnceleme Bekleyen';document.querySelector('#checked + span').textContent='Düzeltilen';document.querySelector('#total + span').textContent='Logo’ya Aktarıma Hazır';document.getElementById('camera').textContent='＋ Fiş Yükle / Tara';document.getElementById('pick').textContent='▧ Dosya Seç';
 for(const id of ['count','pending','checked','total']){const value=document.getElementById(id);value.parentElement.append(value);}
 const editorHead=document.querySelector('#editor .dialog-head'),nav=document.createElement('div');nav.className='expense-detail-nav';nav.innerHTML='<span id="expenseDetailStatus" class="badge">İncelemede</span><button type="button" id="expensePrev" class="secondary" aria-label="Önceki fiş">‹</button><span id="expenseDetailPosition"></span><button type="button" id="expenseNext" class="secondary" aria-label="Sonraki fiş">›</button>';editorHead.insertBefore(nav,document.getElementById('closeEditor'));const controls=document.querySelector('#editor .source .actions');controls.insertAdjacentHTML('beforeend','<button type="button" id="expenseZoomOut" class="text-button" aria-label="Küçült">⊖</button><button type="button" id="expenseZoomIn" class="text-button" aria-label="Büyüt">⊕</button>');
 const viewerTools=document.createElement('div');viewerTools.className='expense-viewer-tools';viewerTools.setAttribute('role','group');viewerTools.setAttribute('aria-label','Fiş görseli kontrolleri');
 const viewerIcons={in:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M10 7v6M7 10h6"/>',out:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M7 10h6"/>',rotate:'<path d="M20 11a8 8 0 1 1-2.3-5.7L20 8M20 3v5h-5"/>'};
 for(const [label,id,icon] of [['Yakınlaştır','expenseZoomIn','in'],['Uzaklaştır','expenseZoomOut','out'],['Görseli döndür','rotate','rotate']]){const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+viewerIcons[icon]+'</svg>';button.onclick=()=>$(id).click();viewerTools.append(button);}
 document.getElementById('preview').after(viewerTools);
 const fix=document.createElement('button');fix.type='button';fix.id='fixExportMapping';fix.className='secondary';fix.textContent='Eksik Logo alanlarını aç';fix.hidden=true;document.getElementById('exportReason').after(fix);
 const accounting=document.createElement('section');accounting.className='expense-accounting';accounting.hidden=true;const lineHead=document.getElementById('addLine').closest('.list-head'),lineHint=lineHead.nextElementSibling;lineHead.querySelector('h3').textContent='Muhasebe Satırları (Logo’ya Aktarılacak)';accounting.append(lineHead,lineHint,document.getElementById('flightSplit'),document.getElementById('lines'));(inlineAccounting?left:document.querySelector('#editor .editor-body')).append(accounting);
 const sellerInput=document.querySelector('#editForm [name=seller]'),sellerLabel=sellerInput.closest('label');sellerLabel.firstChild.textContent='Satır açıklaması';const descriptionText=document.createElement('textarea');descriptionText.id='expenseDescriptionMirror';descriptionText.readOnly=false;descriptionText.maxLength=200;descriptionText.rows=2;sellerLabel.append(descriptionText);const sellerDetails=document.createElement('details');sellerDetails.className='full';sellerDetails.innerHTML='<summary>Satıcı bilgisini düzelt</summary><label>Satıcı unvanı</label>';sellerDetails.querySelector('label').append(sellerInput);sellerLabel.after(sellerDetails);
 const archiveAction=document.createElement('button');archiveAction.type='button';archiveAction.className='secondary';archiveAction.id='expenseArchiveAction';archiveAction.textContent='Arşive ekle';archiveAction.onclick=()=>document.getElementById('archive').click();const headActions=document.createElement('div');headActions.className='expense-head-actions';const addLine=document.getElementById('addLine');addLine.before(headActions);headActions.append(addLine,archiveAction);
 document.getElementById('editWarnings').hidden=true;document.querySelector('#editForm .review').hidden=true;document.getElementById('save').hidden=true;
 document.querySelector('#editor .source details').hidden=true;document.getElementById('archive').hidden=true;document.getElementById('draftBackup').hidden=true;
 document.getElementById('search').placeholder='Fiş no ara…';document.getElementById('search').setAttribute('aria-label','Fiş numarası ara');
}
$('copyLink').textContent='Telefona Bağla';$('copyLink').title='Fiş bağlantısını kopyala; telefonda aynı hesapla aç';
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
let receipts=[],profiles={revision:0,categories:{}},filter='all',busy=false,stop=false,editing=null,dirty=false,saving=false,previewURL=null,previewSourceBlob=null,cropManual=false,cropEditToken=0,rotation=0,viewerX=0,viewerY=0,viewerDrag=null,worker=null,refreshing=false,pdfModule=null,openRequest=0,expenseZoom=100,saveTimer=null,activeLineIndex=0;
const expenseSelected=new Set();let expenseVisible=[],inlineExpanded=true;
let expenseCalendarMonth=null;
const localISO=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
function drawExpenseCalendar(){
  const panel=$('expenseCalendar');if(!panel)return;const current=expenseCalendarMonth||new Date(),year=current.getFullYear(),month=current.getMonth(),first=new Date(year,month,1),selected=$('expenseDateFrom').value,today=localISO(new Date()),title=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(first);
  const headings=['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(day=>'<span>'+day+'</span>').join(''),days=[];
  for(const {date,iso,outside} of calendarDays(year,month))days.push('<button type="button" data-expense-day="'+iso+'" class="'+(outside?'outside ':'')+(iso===today?'today ':'')+(iso===selected?'selected':'')+'" aria-label="'+escape(new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(date))+'" aria-pressed="'+(iso===selected)+'">'+date.getDate()+'</button>');
  panel.innerHTML='<div class="expense-calendar-head"><button type="button" data-calendar-prev aria-label="Önceki ay">‹</button><strong>'+escape(title)+'</strong><button type="button" data-calendar-next aria-label="Sonraki ay">›</button></div><div class="expense-calendar-week">'+headings+'</div><div class="expense-calendar-days">'+days.join('')+'</div><p>Başlangıç tarihini seçin</p>';
}
function toggleExpenseCalendar(force){
  const panel=$('expenseCalendar'),button=document.querySelector('.expense-calendar-button');if(!panel||!button)return;const open=force===undefined?panel.hidden:force;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){const value=$('expenseDateFrom').value,parts=value.split('-').map(Number);expenseCalendarMonth=value?new Date(parts[0],parts[1]-1,1):new Date(new Date().getFullYear(),new Date().getMonth(),1);drawExpenseCalendar();}
}
if(expenseRulesReady){
  $('expenseCalendar').addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;if(target.hasAttribute('data-calendar-prev')||target.hasAttribute('data-calendar-next')){const change=target.hasAttribute('data-calendar-prev')?-1:1;expenseCalendarMonth=new Date(expenseCalendarMonth.getFullYear(),expenseCalendarMonth.getMonth()+change,1);drawExpenseCalendar();return;}const day=target.dataset.expenseDay;if(day){$('expenseDateFrom').value=day;if($('expenseDateTo').value&&$('expenseDateTo').value<day)$('expenseDateTo').value='';toggleExpenseCalendar(false);render();}});
  document.addEventListener('click',event=>{if(!$('expenseCalendar').hidden&&!event.target.closest('.expense-calendar-wrap'))toggleExpenseCalendar(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('expenseCalendar').hidden){event.preventDefault();toggleExpenseCalendar(false);document.querySelector('.expense-calendar-button').focus();}});
}
const money=(value,currency='TRY')=>Number.isSafeInteger(value)?new Intl.NumberFormat('tr-TR',{style:'currency',currency:['TRY','USD','EUR','GBP'].includes(currency)?currency:'TRY'}).format(value/100):'Tutar okunmadı';
const imageURL=id=>base+'image/'+id;
const normalizeLine=(line,receipt)=>{const oldFlight=line.category==='flight'&&line.vatIncluded===undefined&&Number.isSafeInteger(line.gross)&&Number.isFinite(line.vatRate);const prefix=receiptDescription(receipt);return {...line,category:line.category==='bakery'?'meal':line.category,gross:oldFlight?Math.round(line.gross*100/(100+line.vatRate)):line.gross,vatIncluded:oldFlight?false:line.vatIncluded!==false,description:!line.description?.trim()?prefix:!line.descriptionReady&&prefix&&!line.description.startsWith('FİŞ NO:')?(prefix+' · '+line.description).slice(0,200):line.description,descriptionReady:true};};
const suggestExpenseCode=(receipt,line)=>{if(!expenseRulesReady)return line;const code=rememberedProfile(receipt,line,profiles)?.accountCode||profiles.memories?.[memoryKey(receipt,line)];return !line.expenseCode&&code?{...line,expenseCode:code}:line;};
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
  if(inlineAccounting&&document.querySelector('.expense-accounting')?.contains(document.activeElement)){if(dirty)$('xml').disabled=true;return;}
  const active=receipts.filter(r=>!r.archived),duplicates=duplicateIds(receipts),reviewed=r=>r.reviewed&&!issues(r).length&&!duplicates.has(r.id);
  $('count').textContent=active.length;$('checked').textContent=active.filter(reviewed).length;$('pending').textContent=active.filter(r=>!reviewed(r)).length;
  if(expenseRulesReady){const pending=Number($('pending').textContent),button=$('expenseNotification');button.querySelector('.expense-notification-dot').hidden=!pending;button.setAttribute('aria-label',pending+' fiş inceleme bekliyor');}
  $('total').textContent=expenseRulesReady?active.filter(r=>!r.exported&&!duplicates.has(r.id)&&exportReadiness([r],profiles,company.id).ready).length:money(active.filter(r=>r.currency==='TRY').reduce((sum,r)=>sum+(r.total||0),0));
  const queryText=normalize($('search').value),query=expenseRulesReady?queryText.trim().replace(/^fis\s*(?:no|numarasi)?\s*[:#-]?\s*/,''):queryText;const from=$('expenseDateFrom')?.value||'',to=$('expenseDateTo')?.value||'',ocr=$('expenseOcrFilter')?.value||'';
  const list=receipts.filter(r=>(filter==='archived'?r.archived:!r.archived)&&(filter!=='pending'||!reviewed(r))&&(filter!=='reviewed'||reviewed(r))&&(filter!=='checked'||(!r.exported&&!duplicates.has(r.id)&&exportReadiness([r],profiles,company.id).ready))&&(filter!=='exported'||r.exported)&&matchesReceiptFilters(r,{from,to,ocr})&&normalize(expenseRulesReady?r.number:r.seller+' '+r.number+' '+r.lines.map(l=>l.description).join(' ')).includes(query));expenseVisible=list;
  const accounting=inlineAccounting?document.querySelector('.expense-accounting'):null;if(accounting)accounting.remove();
  $('receipts').innerHTML=list.map(r=>{
    const problems=issues(r),duplicate=duplicates.has(r.id),ok=reviewed(r)||(expenseRulesReady&&expenseSelected.has(r.id)),types=[...new Set(r.lines.map(l=>categories[l.category]))].filter(Boolean).join(' · ');
    const warning=duplicate?'Olası mükerrer: aynı vergi no, tarih ve belge no.':r.error||(!r.ocrDone?'Okuma bekliyor.':problems.length?problems[0]+(problems.length>1?' +'+(problems.length-1)+' uyarı':''):ok?'Belge kontrol edildi.':'Alanları fotoğrafla karşılaştır ve onayla.');
    if(expenseRulesReady){const lines=r.lines.map(l=>{const p=lineProfile(l,profiles,company.id,r),quantity=l.quantity??1,unit=Number.isSafeInteger(l.gross)&&validQuantity(quantity)?Math.round(l.gross/quantity):null,amounts=lineAmounts(l),code=l.expenseCode||p.accountCode||'';return '<div class="expense-row-line"><span class="'+(!code?'missing':'')+'">'+escape(code||'Kod seç')+'</span><span>'+escape(quantity)+' adet</span><span>'+escape(unit===null?'—':money(unit,r.currency))+'</span><span>'+escape(Number.isFinite(l.vatRate)?'%'+l.vatRate:'KDV seç')+'</span><span>'+(l.vatIncluded===false?'Hariç':'Dahil')+'</span><span>'+escape(amounts.vat===null?'—':money(amounts.vat,r.currency))+'</span><span>'+escape(l.description||'Açıklama eksik')+'</span></div>';}).join('');return '<article data-open="'+r.id+'" class="receipt panel expense-row '+(editing?.id===r.id?'selected':'')+'"><input type="checkbox" data-select="'+r.id+'" aria-label="Fişi seç" '+(expenseSelected.has(r.id)?'checked':'')+'><div class="expense-thumb">'+(r.source.type==='application/pdf'?'<span>PDF</span>':'<img loading="lazy" data-crop-thumb="'+r.id+'" alt="Fiş görseli">')+'</div><div class="expense-row-date">'+escape(r.date||'Tarih eksik')+'</div><div class="expense-row-seller"><strong>'+escape(r.seller||'Satıcı henüz okunmadı')+'</strong><small>'+escape(types||'Kategori seçilecek')+'</small></div><div class="money">'+escape(money(r.total,r.currency))+'</div><span class="badge '+(r.ocrDone&&!r.error?'ok':'')+'">'+(r.error?'Hata':r.ocrDone?'Okundu':'Bekliyor')+'</span><span class="badge '+(ok?'ok':'')+'">'+(r.archived?'Arşiv':r.exported?'Aktarıldı':ok?'Hazır':'İnceleme')+'</span><button class="secondary" data-open="'+r.id+'" title="'+escape(warning)+'">Aç →</button><div class="expense-row-lines">'+lines+'</div></article>';}
    return '<article class="receipt panel"><div class="receipt-top"><span class="step">'+(r.source.type==='application/pdf'?'PDF BELGE':'MASRAF FİŞİ')+'</span><span class="badge '+(ok?'ok':'')+'">'+(r.archived?'Arşiv':ok?'Kontrol edildi':'Kontrol gerekli')+'</span></div><h3>'+escape(r.seller||'Satıcı henüz okunmadı')+'</h3><div class="meta">'+escape(r.date||'Tarih eksik')+' · '+escape(r.number||'Belge no eksik')+'</div><div class="money">'+escape(money(r.total,r.currency))+'</div><div class="types">'+escape(types||'Kategori seçilecek')+'</div><p class="issue '+(ok?'good':'')+'">'+escape(warning)+'</p><button class="secondary" data-open="'+r.id+'">Fişi aç →</button></article>';
  }).join('');
  if(accounting){const row=[...$('receipts').querySelectorAll('article[data-open]')].find(node=>node.dataset.open===editing?.id);if(row&&inlineExpanded){row.after(accounting);accounting.hidden=false;}else{document.querySelector('.expense-left').append(accounting);accounting.hidden=true;}}
  if(expenseRulesReady)observeThumbnails(list);
  if(expenseRulesReady)$('expenseDeleteArchived').hidden=filter!=='archived';$('empty').hidden=list.length>0;$('empty').querySelector('h3').textContent=receipts.length?'Bu filtrede fiş yok.':'Henüz fiş eklenmedi.';
  if(expenseRulesReady){const available=new Set(receipts.map(r=>r.id));for(const id of expenseSelected)if(!available.has(id))expenseSelected.delete(id);$('expenseSelected').textContent=expenseSelected.size+' seçili';$('expenseSelectAll').checked=!!list.length&&list.every(r=>expenseSelected.has(r.id));$('expenseSelectAll').indeterminate=list.some(r=>expenseSelected.has(r.id))&&!$('expenseSelectAll').checked;}
  $('resume').disabled=busy||!active.some(r=>!r.ocrDone);$('camera').disabled=busy;$('pick').disabled=busy;
  const selected=expenseRulesReady?active.filter(r=>!r.exported&&expenseSelected.has(r.id)).map(r=>({...r,reviewed:true})):active,status=exportReadiness(selected,profiles,company.id);$('exportReason').textContent=status.ready?selected.filter(r=>!r.exported).length+' fiş aktarıma hazır.':status.reasons.join('\n');$('xml').disabled=expenseRulesReady?!selected.length||saving||busy:!status.ready||saving||busy||dirty;if(expenseRulesReady&&selected.length)$('exportReason').textContent=selected.length+' fiş seçildi. XML oluşturulabilir.'+(status.ready?'':' Eksik bilgiler XML içinde boş kalabilir; fişi ve Logo aktarımını kontrol edin.');
  if(expenseRulesReady){const missing=active.filter(r=>!r.exported).flatMap(r=>r.lines||[]).find(line=>{const p=lineProfile(line,profiles,company.id);return !p.serviceCode||!(line.expenseCode||p.accountCode);});const fix=$('fixExportMapping');fix.hidden=!missing;fix.dataset.category=missing?.category||'';fix.textContent=missing?(categories[missing.category]||'Masraf')+' için eksik Logo alanlarını aç':'';}
}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const imageBlobCache=new Map(),imageCacheLimit=24*1024*1024;
function trimImageCache(){let bytes=[...imageBlobCache.values()].reduce((n,item)=>n+item.size,0);while(imageBlobCache.size>8||bytes>imageCacheLimit){const [id,item]=imageBlobCache.entries().next().value;imageBlobCache.delete(id);bytes-=item.size;}}
function getBlob(id){
  const cached=imageBlobCache.get(id);if(cached){imageBlobCache.delete(id);imageBlobCache.set(id,cached);return cached.promise;}
  const item={size:0,promise:null};imageBlobCache.set(id,item);item.promise=(async()=>{const r=await fetch(imageURL(id),{cache:'no-store'});if(!r.ok)throw Error('Kaynak belge açılamadı. Oturumunu kontrol et.');const blob=await r.blob();if(imageBlobCache.get(id)===item){item.size=blob.size;trimImageCache();}return blob;})().catch(error=>{if(imageBlobCache.get(id)===item)imageBlobCache.delete(id);throw error;});trimImageCache();return item.promise;
}
async function croppedBlob(blob,crop,maxSize){if(!crop||blob.type==='application/pdf')return blob;let bitmap;try{bitmap=await createImageBitmap(blob);const x=Math.floor(crop.x*bitmap.width),y=Math.floor(crop.y*bitmap.height),w=Math.max(1,Math.min(bitmap.width-x,Math.ceil(crop.width*bitmap.width))),h=Math.max(1,Math.min(bitmap.height-y,Math.ceil(crop.height*bitmap.height))),scale=Math.min(1,maxSize/Math.max(w,h));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/jpeg',.9));}catch{return blob;}finally{bitmap?.close();}}
const paperCache=new Map();
async function detectedPaper(record,blob){
  if(!paperCache.has(record.id))paperCache.set(record.id,(async()=>{let bitmap;try{bitmap=await createImageBitmap(blob);const scale=Math.min(1,600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return receiptPaperFromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);}catch{return null;}finally{bitmap?.close();}})());
  const detected=await paperCache.get(record.id),old=record.crop;if(!detected)return old||null;const paper={...detected};if(old?.v===2){const bottom=old.y+old.height;if(bottom>paper.y+paper.height*.5&&bottom<paper.y+paper.height)paper.height=bottom-paper.y;}return paper;
}
const thumbCache=new Map();
function clearImageCache(){imageBlobCache.clear();paperCache.clear();for(const promise of thumbCache.values())promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});thumbCache.clear();}
function loadCroppedThumbnail(record){const key=record.id+JSON.stringify(record.crop);if(!thumbCache.has(key)){if(thumbCache.size>=100){const [old,promise]=thumbCache.entries().next().value;thumbCache.delete(old);promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});}thumbCache.set(key,getBlob(record.id).then(async blob=>croppedBlob(blob,await detectedPaper(record,blob),400)).then(blob=>URL.createObjectURL(blob)).catch(error=>{thumbCache.delete(key);throw error;}));}thumbCache.get(key).then(url=>{const image=document.querySelector('[data-crop-thumb="'+record.id+'"]');if(image)image.src=url;}).catch(()=>{});}
let thumbnailObserver=null;
function observeThumbnails(list){
  thumbnailObserver?.disconnect();
  const records=new Map(list.filter(r=>r.source.type!=='application/pdf').map(r=>[r.id,r]));
  if(!('IntersectionObserver' in window)){for(const r of records.values())loadCroppedThumbnail(r);return;}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);const record=records.get(entry.target.dataset.cropThumb);if(record)loadCroppedThumbnail(record);}},{rootMargin:'200px'});thumbnailObserver=observer;
  for(const image of $('receipts').querySelectorAll('[data-crop-thumb]'))thumbnailObserver.observe(image);
}
let workerPreparation=null,cancelWorkerPreparation=null;
function prepareOcr(){
  if(workerPreparation)return workerPreparation;
  worker??=new Worker('/expenses/ocr-worker.js?v=ocr6');const active=worker;
  workerPreparation=new Promise((resolve,reject)=>{
    const finish=terminate=>{clearTimeout(timer);active.onmessage=null;active.onerror=null;cancelWorkerPreparation=null;if(terminate){active.terminate();if(worker===active)worker=null;}};
    const timer=setTimeout(()=>{finish(true);reject(Error('Okuma motoru zamanında hazırlanamadı.'));},180000);
    cancelWorkerPreparation=()=>{finish(true);reject(Error('Okuma hazırlığı durduruldu.'));};
    active.onmessage=({data})=>{if(data.progress)return;if(data.error){finish(true);reject(Error(data.error));return;}if(data.ready){finish(false);resolve();}};
    active.onerror=()=>{finish(true);reject(Error('Okuma motoru başlatılamadı.'));};active.postMessage({prepare:true});
  }).catch(error=>{workerPreparation=null;throw error;});return workerPreparation;
}
async function recognize(blob){
  await prepareOcr();
  return new Promise((resolve,reject)=>{
    const active=worker;
    const end=(terminate=false)=>{clearTimeout(timer);active.onmessage=null;active.onerror=null;if(terminate){active.terminate();if(worker===active){worker=null;workerPreparation=null;}}};
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
    const result=blob.type==='application/pdf'?await readPDF(blob):await recognize(blob);patch=parseReceipt(result.text,result.confidence);if(result.headerText)patch=mergeReceiptReadings(patch,[parseReceipt(result.headerText)]);
    if(result.alternatives?.length>1){const alternatives=result.alternatives.map(t=>parseReceipt(t));patch=mergeReceiptReadings(patch,alternatives);if(alternatives.some(r=>r.total!==patch.total||r.vat!==patch.vat||r.number!==patch.number))patch.notes.push('İki okuma denemesinde numara veya tutar farklı çıktı; belgeyi dikkatle karşılaştır.');}
    if(result.pages>1)patch.notes.push('Çok sayfalı PDF: tüm sayfaların aynı belgeye ait olduğunu kontrol et.');
    const code=await barcode(blob);if(code)patch.notes.push('Barkod / karekod okundu (alanlara otomatik uygulanmadı): '+code.slice(0,170));
    patch.lines=patch.lines.map(line=>suggestExpenseCode(patch,line));if(expenseRulesReady&&blob.type!=='application/pdf'&&result.crop)patch.crop=result.crop;patch={...patch,ocrDone:true,error:'',exported:false};
  }catch(error){patch={...record,ocrDone:true,reviewed:false,exported:false,error:error.message};}
  return api('record/'+record.id,{...record,...patch,revision:record.revision});
}
async function runQueue(files=null){
  if(busy)return;if(files&&files.length>50)throw Error('Bir seferde en fazla 50 fiş seçin; dosyalar yüklenmedi.');busy=true;stop=false;notice('');render();$('progressPanel').hidden=false;
  const tasks=files?[...files]:receipts.filter(r=>!r.archived&&!r.ocrDone);$('progress').max=tasks.length||1;$('progress').value=0;
  if(tasks.some(task=>files?task.type.startsWith('image/'):task.source?.type!=='application/pdf'))try{prepareOcr().catch(()=>{});}catch{}
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
      finally{$('progress').value=index+1;if((index+1)%5===0||index+1===tasks.length)await refresh().catch(()=>{});}
    }
  }finally{cancelWorkerPreparation?.();worker?.terminate();worker=null;workerPreparation=null;busy=false;await refresh().catch(()=>{});render();$('progressPanel').hidden=true;notice([stop?'İşlem durduruldu. Kaydedilmiş fişler korundu.':tasks.length?'İşlem tamamlandı. Okunan taslakları kontrol et.':'Bekleyen belge yok.',duplicateCount?duplicateCount+' dosya zaten kayıtlı; yeniden eklenmedi.':'',...errors].filter(Boolean).join('\n'));}
}
function lineHTML(line,index){return '<div class="line" data-index="'+index+'"><div class="line-head"><strong>MASRAF SATIRI '+(index+1)+'</strong><button type="button" class="text-button" data-remove="'+index+'" aria-label="'+(index+1)+'. satırı kaldır">Kaldır</button></div><div class="line-grid"><label class="full">Logo satır açıklaması<textarea data-field="description" rows="2" maxlength="200">'+escape(line.description)+'</textarea></label></div><div class="categories" role="group" aria-label="'+(index+1)+'. satır kategorisi">'+Object.entries(categories).map(([key,label])=>'<button type="button" data-category="'+key+'" aria-pressed="'+(line.category===key)+'">'+label+'</button>').join('')+'</div><div class="expense-code"><label>Gider hesabı kodu (Logo GL_CODE1)<input data-field="expenseCode" value="'+escape(line.expenseCode||'')+'" maxlength="60" placeholder="Örn. 770.11.004" autocomplete="off"></label><div class="expense-code-actions"><button type="button" data-remember>Hafızaya kaydet</button><button type="button" data-forget>Geri al</button><span data-memory-status></span></div></div><div class="line-grid"><label>Satır tutarı ('+(line.vatIncluded===false?'KDV hariç':'KDV dahil')+')<input data-field="gross" inputmode="decimal" value="'+amount(line.gross)+'"></label><label>KDV oranı (%)<input data-field="vatRate" inputmode="decimal" value="'+escape(line.vatRate??'')+'" placeholder="Okunmadı"></label></div><div class="vat-choice" role="group" aria-label="'+(index+1)+'. satır KDV tutar biçimi"><span>KDV</span><button type="button" data-vat-included="true" aria-pressed="'+(line.vatIncluded!==false)+'">Dahil</button><button type="button" data-vat-included="false" aria-pressed="'+(line.vatIncluded===false)+'">Hariç</button></div><div class="line-summary" data-line-summary aria-live="polite"></div></div>';}
function currencyField(){return '<label class="expense-line-currency">Para birimi<select data-field="currency" aria-label="Fiş para birimi">'+[['TRY','₺'],['USD','USD'],['EUR','EUR'],['GBP','GBP']].map(([value,label])=>'<option value="'+value+'" '+((editing.currency||'TRY')===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label>';}
function inlineLineHTML(line,index){
  const qty=line.quantity===undefined?1:line.quantity,unit=Number.isSafeInteger(line.gross)&&validQuantity(qty)?Math.round(line.gross/qty):null,rates=[0,1,10,20];
  if(Number.isFinite(line.vatRate)&&!rates.includes(line.vatRate))rates.push(line.vatRate);
  return '<div class="line expense-inline-line" data-index="'+index+'"><div class="expense-inline-grid">'
    +'<div class="expense-code"><label>Gider kodu<input data-field="expenseCode" value="'+escape(line.expenseCode||'')+'" maxlength="60" autocomplete="off" placeholder="Hesap seç"></label></div>'
    +'<label>Miktar<input data-field="quantity" inputmode="decimal" value="'+escape(qty??'')+'"></label>'
    +'<label class="expense-unit-price">Birim fiyat<input data-field="gross" inputmode="decimal" value="'+groupedAmount(unit)+'"></label>'
    +currencyField()
    +'<label class="expense-vat-rate">KDV oranı<select data-field="vatRate"><option value="">Seç</option>'+rates.map(rate=>'<option value="'+rate+'" '+(line.vatRate===rate?'selected':'')+'>%'+rate+'</option>').join('')+'</select></label>'
    +'<div class="vat-choice"><span>Tutar biçimi</span><div><button type="button" data-vat-included="true" aria-pressed="'+(line.vatIncluded!==false)+'">Dahil</button><button type="button" data-vat-included="false" aria-pressed="'+(line.vatIncluded===false)+'">Hariç</button></div></div>'
    +'<div class="expense-line-vat"><span>KDV tutarı</span><strong data-vat-amount>—</strong></div></div>'
    +'<label class="expense-line-description">Açıklama<textarea data-field="description" rows="2" maxlength="200">'+escape(line.description)+'</textarea></label>'
    +'<div class="categories" role="group" aria-label="Masraf kategorisi">'+Object.entries(categories).map(([key,label])=>'<button type="button" data-category="'+key+'" aria-pressed="'+(line.category===key)+'">'+label+'</button>').join('')+'</div>'
    +'<div class="expense-line-actions"><button type="button" data-forget title="Gider kodunu ve kayıtlı eşleşmesini geri al">Geri al</button><span data-memory-status></span><button type="button" class="text-button" data-remove="'+index+'" aria-label="Satırı kaldır">Satırı kaldır</button></div>'
    +'<div class="line-summary" data-line-summary aria-live="polite"></div></div>';
}
function syncRightDescription(){const target=$('expenseDescriptionMirror');if(target)target.value=editing?.lines?.[activeLineIndex]?.description||'';}
function renderLines(){
  $('lines').innerHTML=editing.lines.map(inlineAccounting?inlineLineHTML:lineHTML).join('');
  if(expenseRulesReady)for(const node of $('lines').children){
    const row=editing.lines[Number(node.dataset.index)],priceInput=node.querySelector('[data-field=gross]');
    if(!inlineAccounting){const label=priceInput.closest('label'),qty=row.quantity===undefined?1:row.quantity,unit=Number.isSafeInteger(row.gross)&&validQuantity(qty)?Math.round(row.gross/qty):null;label.firstChild.textContent='Birim fiyat';label.insertAdjacentHTML('beforebegin','<label>Miktar<input data-field="quantity" inputmode="decimal" value="'+escape(qty??'')+'"></label>');priceInput.value=groupedAmount(unit);label.insertAdjacentHTML('afterend',currencyField());}
    node.dataset.initialPrice=priceInput.value;node.dataset.initialQuantity=node.querySelector('[data-field=quantity]').value;node.dataset.initialGross=Number.isSafeInteger(row.gross)?String(row.gross):'';
    priceInput.addEventListener('blur',()=>{const value=cents(priceInput.value);if(value!==null)priceInput.value=groupedAmount(value);});
    const setup=document.createElement('button');setup.type='button';setup.className='expense-inline-setup';setup.dataset.setup='';setup.hidden=true;node.append(setup);
  }
  if(expenseRulesReady)$('lines').querySelectorAll('[data-field=expenseCode]').forEach(input=>{
    const picker=document.createElement('div');picker.className='expense-account-picker';input.replaceWith(picker);picker.append(input);
    const button=document.createElement('button');button.type='button';if(inlineAccounting)button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/></svg>';else button.textContent='⌄';button.setAttribute('aria-label','Hesap planını aç');button.setAttribute('aria-haspopup','dialog');button.dataset.plan='';picker.append(button);
    input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();button.click();}});
    input.addEventListener('change',()=>rememberCodeAutomatically(input));
  });
  if(!expenseRulesReady){
    $('lines').querySelectorAll('.expense-code-actions').forEach(node=>{node.style.display='none';});
    $('lines').querySelectorAll('[data-field=expenseCode]').forEach(input=>{input.placeholder='Bu firmada gider kodu henüz tanımlanmadı';});
  }
  activeLineIndex=Math.max(0,Math.min(activeLineIndex,editing.lines.length-1));$('flightSplit').hidden=!editing.lines.some(l=>l.category==='flight');renderLineSummaries();syncRightDescription();
}
function renderLineSummaries(){
  for(const node of $('lines').children){
    const l=editing.lines[Number(node.dataset.index)],v=lineAmounts(l),p=lineProfile(l,profiles,company.id,editing);
    node.querySelector('[data-line-summary]').textContent=v.gross===null?'Tutar ve KDV oranını gir.':'Matrah '+money(v.net,editing.currency)+'  ·  KDV '+money(v.vat,editing.currency)+'  ·  Genel toplam '+money(v.gross,editing.currency);
    const tax=node.querySelector('[data-vat-amount]');if(tax)tax.textContent=v.vat===null?'—':money(v.vat,editing.currency);
    node.querySelector('[data-memory-status]').textContent=l.expenseCode&&profiles.memories?.[memoryKey(editing,l)]===l.expenseCode?'Hafızada':l.expenseCode?'Bu satıra özel':'Kategori kodu kullanılır';
    if(inlineAccounting){
      const missing={expenseCode:!(l.expenseCode||p.accountCode),quantity:!validQuantity(l.quantity===undefined?1:l.quantity),gross:!Number.isSafeInteger(l.gross)||l.gross<=0,vatRate:!Number.isFinite(l.vatRate),description:!l.description?.trim()};
      for(const [field,isMissing] of Object.entries(missing)){const input=node.querySelector('[data-field="'+field+'"]');if(input)input.setAttribute('aria-invalid',String(isMissing));}
    }
    if(expenseRulesReady){
      const needs=[!p.serviceCode?'hizmet/stok kodu':'',!(l.expenseCode||p.accountCode)?'gider hesap kodu':''].filter(Boolean),setup=node.querySelector('[data-setup]');
      setup.hidden=!needs.length;setup.textContent='Logo için eksik: '+needs.join(', ')+' · Ayarları aç';
      setup.title='Her KDV oranı kendi Logo KDV hesabını kullanır. Oranı değiştirmek hizmet kodunu veya masraf merkezini değiştirmez.';
    }
  }
  if(expenseRulesReady){const status=$('expenseDetailStatus');status.textContent=editing.exported?'Aktarıldı':editing.reviewed&&!issues(editing).length?'Kontrol edildi':'İncelemede';status.classList.toggle('needs-review',!editing.reviewed||issues(editing).length>0);}
}
function collect(){
  const f=$('editForm').elements;for(const key of ['seller','taxId','date','number','currency'])editing[key]=f[key].value.trim();if(expenseRulesReady)editing.paymentCard=f.paymentCard.value.trim();for(const key of ['total','vat'])editing[key]=cents(f[key].value);
  editing.reviewed=f.reviewed.checked;
  for(const node of $('lines').children){const row=editing.lines[Number(node.dataset.index)];row.description=node.querySelector('[data-field=description]').value.trim();row.descriptionReady=true;row.expenseCode=node.querySelector('[data-field=expenseCode]').value.trim().toUpperCase();row.vatIncluded=node.querySelector('[data-vat-included=true]').getAttribute('aria-pressed')==='true';const priceInput=node.querySelector('[data-field=gross]'),price=cents(priceInput.value);if(node.querySelector('[data-field=quantity]')){const quantityInput=node.querySelector('[data-field=quantity]'),raw=quantityInput.value.trim().replace(',','.');const qty=/^\d+(?:\.\d{1,3})?$/.test(raw)?Number(raw):null;row.quantity=validQuantity(qty)?qty:null;const unchanged=priceInput.value===node.dataset.initialPrice&&quantityInput.value===node.dataset.initialQuantity;const total=unchanged&&node.dataset.initialGross!==''?Number(node.dataset.initialGross):price!==null&&row.quantity!==null?Math.round(price*row.quantity):null;row.gross=Number.isSafeInteger(total)&&total<=1e11?total:null;}else row.gross=price;const value=node.querySelector('[data-field=vatRate]').value.trim().replace(',','.');row.vatRate=/^\d+(?:\.\d{1,2})?$/.test(value)?Number(value):null;}
  return editing;
}
function warningList(){
  const problems=issues(editing);if(duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))problems.push('Olası mükerrer: aynı vergi no, belge no ve tarih başka bir fişte var.');
  $('editWarnings').innerHTML=(editing.error?'<p>'+escape(editing.error)+'</p>':'')+(problems.length?'<ul>'+problems.map(p=>'<li>'+escape(p)+'</li>').join('')+'</ul>':'<strong>Temel alanlar tutarlı. Belgeyle karşılaştırıp onayla.</strong>')+(!editing.reviewed?'<p>Aktarım için aşağıdaki “Fotoğrafla karşılaştırdım” kutusunu işaretleyip Kaydet’e basın.</p>':'')+(editing.notes||[]).map(n=>'<p class="note">'+escape(n)+'</p>').join('');
}
async function displayPreview(record,preloaded){
  const token=++cropEditToken,isCurrent=()=>token===cropEditToken&&editing?.id===record.id&&$('editor').open;
  if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}$('preview').replaceChildren();$('original').href=imageURL(record.id);$('rotate').hidden=record.source.type==='application/pdf';rotation=0;expenseZoom=100;viewerX=0;viewerY=0;
  let img=null;if(record.source.type!=='application/pdf'){img=new Image();img.alt='Kaynak masraf fişi';const thumbnail=thumbCache.get(record.id+JSON.stringify(record.crop));thumbnail?.then(url=>{if(isCurrent()&&!previewURL&&img.isConnected)img.src=url;}).catch(()=>{});if(expenseRulesReady){const surface=document.createElement('div');surface.className='expense-image-surface';surface.append(img);$('preview').append(surface);}else $('preview').append(img);}
  const loaded=preloaded?await preloaded:{blob:await getBlob(record.id)};if(!isCurrent())return;if(loaded.error)throw loaded.error;const blob=loaded.blob;previewSourceBlob=blob;
  if(record.source.type==='application/pdf'){
    const lib=await pdf(),doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
    try{for(let i=1;i<=Math.min(doc.numPages,8);i++){const page=await doc.getPage(i),v=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;if(!isCurrent())return;if(expenseRulesReady){const surface=document.createElement('div');surface.className='expense-image-surface expense-pdf-surface';surface.append(canvas);$('preview').append(surface);}else $('preview').append(canvas);}}finally{await doc.destroy();}
  }else{previewURL=URL.createObjectURL(blob);img.src=previewURL;const crop=expenseRulesReady?await detectedPaper(record,blob):record.crop;if(!crop||!isCurrent())return;const shown=await croppedBlob(blob,crop,2000);if(!isCurrent())return;const oldURL=previewURL;previewURL=URL.createObjectURL(shown);img.src=previewURL;img.alt='Kırpılmış fiş görünümü';URL.revokeObjectURL(oldURL);}
}
async function openEditor(id){
  if(busy){notice('Okuma bittikten sonra fişi düzenleyebilirsin.');return;}
  if(saving){notice('Değişiklikler kaydediliyor; lütfen bekleyin.');return;}
  if(editing&&editing.id===id&&$('editor').open){openRequest++;if(inlineAccounting)render();return;}
  if(editing&&editing.id!==id&&dirty){if(expenseRulesReady){if(saving){notice('Değişiklikler kaydediliyor; lütfen bekleyin.');return;}await saveEditor();if(dirty)return;}else if(!confirm('Kaydedilmemiş değişiklikler var. Başka fişe geçilsin mi?'))return;}
  inlineExpanded=true;const request=++openRequest;cropEditToken++;const preloaded=getBlob(id).then(blob=>({blob}),error=>({error}));
  const record=await api('record/'+id);if(request!==openRequest)return;
  editing=record;if(expenseRulesReady&&!editing.currency)editing.currency='TRY';activeLineIndex=0;const missingLines=expenseRulesReady&&!editing.lines.length;if(missingLines)editing.lines=draftMissingLines(editing);editing.lines=editing.lines.map(l=>suggestExpenseCode(editing,normalizeLine(l,editing)));$('flightRate').value=editing.lines.find(l=>l.category==='flight'&&l.vatRate>0)?.vatRate||'';dirty=false;$('editTitle').textContent=editing.seller||'Masraf fişi';const f=$('editForm').elements;
  for(const key of ['seller','taxId','date','number','currency','paymentCard'])f[key].value=editing[key]||'';for(const key of ['total','vat'])f[key].value=amount(editing[key]);f.reviewed.checked=editing.reviewed;
  $('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';if(expenseRulesReady)$('expenseArchiveAction').textContent=editing.archived?'Arşivden çıkar':'Arşive ekle';$('rawText').textContent=editing.rawText||'Henüz metin okunmadı.';$('editSaveState').textContent='Değişiklikler Kaydet ile hesaba aktarılır.';
  renderLines();warningList();if(missingLines)notice('Kayıtta masraf satırı bulunamadı. Belgeden bir taslak açıldı; kod, açıklama ve KDV’yi kontrol edin.');if(expenseRulesReady){document.querySelector('.expense-accounting').hidden=false;$('editTitle').textContent='Fiş Detayı';const index=expenseVisible.findIndex(r=>r.id===id);$('expenseDetailPosition').textContent=index>=0?(index+1)+' / '+expenseVisible.length:'';$('expensePrev').disabled=index<=0;$('expenseNext').disabled=index<0||index>=expenseVisible.length-1;}if(!$('editor').open){if(expenseRulesReady&&matchMedia('(min-width:1100px)').matches){$('editor').show();document.querySelector('.expense-detail-empty').hidden=true;}else $('editor').showModal();}if(expenseRulesReady)render();displayPreview(record,preloaded).catch(e=>{if(request===openRequest&&editing?.id===id)$('preview').textContent=e.message;});
}
async function closeEditor(){if(saving||busy)return;if(dirty){if(expenseRulesReady){await saveEditor();if(dirty)return;}else if(!confirm('Kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?'))return;}openRequest++;cropEditToken++;previewSourceBlob=null;$('editor').close();if(expenseRulesReady){document.querySelector('.expense-detail-empty').hidden=false;document.querySelector('.expense-accounting').hidden=true;}editing=null;dirty=false;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').replaceChildren();if(expenseRulesReady)render();}
async function saveEditor(){
  if(saving)return;const focused=inlineAccounting&&document.querySelector('.expense-accounting').contains(document.activeElement)?document.activeElement:null,selection=focused&&typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;clearTimeout(saveTimer);saving=true;$('save').disabled=true;$('editForm').inert=true;if(inlineAccounting)document.querySelector('.expense-accounting').inert=true;
  try{collect();if(editing.reviewed&&duplicateIds([...receipts.filter(r=>r.id!==editing.id),editing]).has(editing.id))throw Error('Mükerrer görünen fişi arşive al veya belge bilgilerini düzelt.');editing=await api('record/'+editing.id,editing);dirty=false;$('editSaveState').textContent='Kaydedildi.';await refresh();warningList();}
  catch(e){$('editSaveState').textContent=e.message+' Düzenlemen bu ekranda duruyor.';}
  finally{saving=false;$('save').disabled=false;$('editForm').inert=false;if(expenseRulesReady)document.querySelector('.expense-accounting').inert=false;if(expenseRulesReady)render();if(focused?.isConnected&&document.activeElement===document.body){focused.focus({preventScroll:true});if(selection)focused.setSelectionRange(...selection);}}
}
function scheduleAutoSave(){if(!expenseRulesReady||!editing)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(!editing||!dirty)return;if(saving||busy){scheduleAutoSave();return;}saveEditor();},1200);}
function edited(){dirty=true;editing.reviewed=false;editing.exported=false;$('editForm').elements.reviewed.checked=false;$('editSaveState').textContent='Otomatik kayıt bekleniyor…';collect();syncRightDescription();warningList();renderLineSummaries();scheduleAutoSave();if(expenseRulesReady)render();}
const run=fn=>Promise.resolve().then(fn).catch(e=>notice(e.message));
let memoryQueue=Promise.resolve();
function rememberCodeAutomatically(input){if(!editing||!input)return;collect();const node=input.closest('[data-index]'),line=node&&editing.lines[Number(node.dataset.index)],key=line&&memoryKey(editing,line),code=line?.expenseCode;if(!key||!code||!validExpenseCode(code)||profiles.memories?.[key]===code)return;memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{try{try{profiles=await api('profiles',{revision:profiles.revision,memory:{key,code}});}catch(error){if(error.status!==409)throw error;await refresh();profiles=await api('profiles',{revision:profiles.revision,memory:{key,code}});}if(editing&&$('editor').open)renderLineSummaries();}catch(error){$('editSaveState').textContent='Fiş kaydı ayrı tutuldu; kod hafızası kaydedilemedi: '+error.message;}});}
function syncExpenseThemeIcon(){if(!expenseRulesReady)return;const light=document.body.classList.contains('expense-light'),button=$('expenseTheme');button.setAttribute('aria-label',light?'Koyu görünüme geç':'Açık görünüme geç');button.title=light?'Koyu görünüme geç':'Açık görünüme geç';button.setAttribute('aria-pressed',String(light));button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(light?'<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>':'<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>')+'</svg>';}
$('expenseTheme').onclick=()=>{document.body.classList.toggle('expense-light');syncExpenseThemeIcon();try{localStorage.setItem('sw:expenses:theme',document.body.classList.contains('expense-light')?'light':'dark');}catch{}};
try{if(localStorage.getItem('sw:expenses:theme')==='light')document.body.classList.add('expense-light');}catch{}
syncExpenseThemeIcon();
function showAccountPlan(){ $('accountCodes').replaceChildren(...accountPlan.accounts.map(a=>{const option=document.createElement('option');option.value=a.code;option.label=a.name;return option;})); }
let accountTarget=null;
function renderAccountResults(){const query=normalize($('accountSearch').value).trim(),found=accountPlan.accounts.filter(a=>!query||normalize(a.code+' '+a.name).includes(query));$('accountResults').innerHTML=found.slice(0,100).map(a=>'<button type="button" data-account="'+escape(a.code)+'"><strong>'+escape(a.code)+'</strong><span>'+escape(a.name)+'</span></button>').join('')+(found.length>100?'<p>İlk 100 sonuç gösteriliyor; aramayı daraltın.</p>':'')+(!found.length?'<p>Hesap bulunamadı. Önce hesap planı Excel dosyasını yükleyin veya aramayı değiştirin.</p>':'');}
$('accountSearch').oninput=renderAccountResults;$('closeAccountPicker').onclick=()=>$('accountPicker').close();
$('accountResults').onclick=e=>{const button=e.target.closest('[data-account]');if(!button||!accountTarget)return;accountTarget.value=button.dataset.account;accountTarget.dispatchEvent(new Event('input',{bubbles:true}));if(inlineAccounting)rememberCodeAutomatically(accountTarget);$('accountPicker').close();};
async function refreshAccountPlan(){if(!expenseRulesReady)return;accountPlan=await api('account-plan');showAccountPlan();}
$('accountImport').onclick=()=>$('accountFile').click();
$('accountFile').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;run(async()=>{if(!window.XLSX)throw Error('Excel okuyucu yüklenemedi.');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),map=new Map();for(const name of workbook.SheetNames){const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:''});for(const row of rows){const code=String(row[1]??'').trim(),description=String(row[2]??'').trim();if(/^\d{3}(?:\.\d+)+$/.test(code)&&description&&!map.has(code))map.set(code,{code,name:description.slice(0,200)});}}if(!map.size)throw Error('Excel içinde hesap kodu ve adı bulunamadı.');const result=await api('account-plan',{revision:accountPlan.revision,accounts:[...map.values()]});await refreshAccountPlan();notice(result.count+' hesap kodu Pusula hesabına kaydedildi. Fiş satırında kod alanından seçebilirsin.');});};
if(expenseRulesReady)run(refreshAccountPlan);
$('camera').onclick=()=>$('cameraInput').click();$('pick').onclick=()=>$('files').click();
for(const id of ['cameraInput','files'])$(id).onchange=event=>{const files=[...event.target.files];event.target.value='';if(files.length)run(()=>runQueue(files));};
$('stopQueue').onclick=()=>{stop=true;$('progressText').textContent='Bu belge tamamlanınca durdurulacak…';};
$('resume').onclick=()=>run(()=>runQueue());$('refresh').onclick=()=>run(refresh);
$('copyLink').onclick=()=>run(async()=>{await navigator.clipboard.writeText(location.origin+'/workspace/'+company.id+'/masraf/');notice('Firma bağlantısı kopyalandı. Telefonda aynı hesapla açabilirsin.');});
$('search').oninput=render;function setExpenseFilter(value){if(inlineAccounting&&document.querySelector('.expense-accounting')?.contains(document.activeElement))document.activeElement.blur();filter=value;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter===value)));render();}document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>setExpenseFilter(b.dataset.filter));
if(expenseRulesReady){
 for(const [id,value] of [['count','all'],['pending','pending'],['checked','reviewed'],['total','checked']]){const card=$(id).parentElement;card.setAttribute('role','button');card.tabIndex=0;card.onclick=()=>setExpenseFilter(value);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setExpenseFilter(value);}};}
 $('fixExportMapping').onclick=()=>{const category=$('fixExportMapping').dataset.category;$('openProfiles').click();const row=[...$('profileRows').children].find(node=>node.dataset.profile===category);if(row){row.open=true;row.scrollIntoView({block:'nearest'});}};
 for(const [id,delta] of [['expensePrev',-1],['expenseNext',1]])$(id).onclick=()=>{const index=expenseVisible.findIndex(r=>r.id===editing?.id),target=expenseVisible[index+delta];if(target)run(()=>openEditor(target.id));};
 for(const [id,delta] of [['expenseZoomOut',-25],['expenseZoomIn',25]])$(id).onclick=()=>{expenseZoom=Math.max(50,Math.min(300,expenseZoom+delta));const img=$('preview').querySelector('img');if(inlineAccounting&&img){updateViewerTransform();return;}$('preview').querySelectorAll('.expense-image-surface').forEach(node=>{node.style.maxWidth='none';node.style.width=expenseZoom+'%';});};
 const preview=$('preview');preview.addEventListener('pointerdown',e=>{if(!inlineAccounting||e.button!==0||!e.target.matches('img'))return;e.preventDefault();viewerDrag={x:e.clientX,y:e.clientY,originX:viewerX,originY:viewerY};preview.setPointerCapture(e.pointerId);preview.classList.add('dragging');});
 preview.addEventListener('pointermove',e=>{if(!viewerDrag)return;viewerX=viewerDrag.originX+e.clientX-viewerDrag.x;viewerY=viewerDrag.originY+e.clientY-viewerDrag.y;updateViewerTransform();});
 const endDrag=()=>{viewerDrag=null;preview.classList.remove('dragging');};preview.addEventListener('pointerup',endDrag);preview.addEventListener('pointercancel',endDrag);preview.addEventListener('lostpointercapture',endDrag);
 for(const id of ['expenseDateFrom','expenseDateTo','expenseOcrFilter'])$(id).addEventListener('change',render);
 $('expenseClearFilters').onclick=()=>run(async()=>{
   if(busy||saving)throw Error('Devam eden işlem tamamlanınca tekrar deneyin.');
   if(!confirm('Tüm aktif fişler ve görselleri kalıcı olarak silinecek; arşivdekiler korunacak. Devam edilsin mi?'))return;
   if(editing)await closeEditor();if(editing)return;await memoryQueue;await refresh();
   const active=receipts.filter(r=>!r.archived).map(r=>({id:r.id,revision:r.revision}));
   await api('clear-active',{receipts:active,profileRevision:profiles.revision});clearImageCache();expenseSelected.clear();for(const id of ['search','expenseDateFrom','expenseDateTo','expenseOcrFilter'])$(id).value='';setExpenseFilter('all');await refresh();notice('Aktif fişler temizlendi. Arşiv ve gider kodu hafızası korundu.');
 });
 $('expenseDeleteArchived').onclick=()=>run(async()=>{
   if(busy||saving)throw Error('Devam eden işlem tamamlanınca tekrar deneyin.');
   const chosen=receipts.filter(r=>r.archived&&expenseSelected.has(r.id));if(!chosen.length)throw Error('Arşivden silinecek fişleri seçin.');
   if(!confirm(chosen.length+' arşiv fişi ve görseli kalıcı olarak silinecek. Devam edilsin mi?'))return;
   if(editing&&chosen.some(r=>r.id===editing.id)){await closeEditor();if(editing)return;}
   await api('delete-archived',{receipts:chosen.map(r=>({id:r.id,revision:r.revision}))});clearImageCache();for(const r of chosen)expenseSelected.delete(r.id);await refresh();notice(chosen.length+' arşiv fişi silindi.');
 });
 $('expenseSelectAll').onchange=e=>{for(const r of expenseVisible)e.target.checked?expenseSelected.add(r.id):expenseSelected.delete(r.id);render();};
 $('receipts').addEventListener('change',e=>{if(!e.target.matches('[data-select]'))return;const id=e.target.dataset.select;if(e.target.checked)expenseSelected.add(id);else expenseSelected.delete(id);render();});
 $('expenseBulkApply').onclick=()=>run(async()=>{const action=$('expenseBulkAction').value,ids=[...expenseSelected];if(!action||!ids.length)throw Error('Önce işlem ve fiş seçin.');if(busy||saving||dirty)throw Error('Önce açık fişteki değişiklikleri kaydedin ve okumayı bitirin.');const full=[];for(const id of ids)full.push(await api('record/'+id));if(action==='backup'){downloadJSON({format:'soyturk-expenses-v1',company:company.id,created:new Date().toISOString(),receipts:full,sourceImagesIncluded:false},'secilen-masraf-fisleri.json');notice(ids.length+' fişin alanları yedeklendi.');return;}const dup=duplicateIds(receipts);if(full.some(r=>r.archived||dup.has(r.id)||!exportReadiness([r],profiles,company.id).ready))throw Error('Seçilen fişlerin tümü kontrol edilmiş ve Logo XML için hazır olmalı.');if(!confirm(ids.length+' fişi Logo’da gerçekten aktardınız mı? Bu işlem yalnızca durumlarını kaydeder.'))return;if(editing&&ids.includes(editing.id))closeEditor();let count=0;try{for(const r of full){await api('record/'+r.id,{...r,exported:true});count++;}}finally{await refresh();}notice(count+' fiş aktarıldı olarak işaretlendi.');});
}
$('receipts').onclick=e=>{if(e.target.matches('[data-select]'))return;const b=e.target.closest('[data-open]');if(b){if(inlineAccounting&&document.querySelector('.expense-accounting')?.contains(document.activeElement))document.activeElement.blur();if(inlineAccounting&&editing?.id===b.dataset.open&&$('editor').open){inlineExpanded=!inlineExpanded;render();return;}inlineExpanded=true;run(()=>openEditor(b.dataset.open));}};
$('closeEditor').onclick=closeEditor;$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('editForm').onsubmit=e=>{e.preventDefault();run(saveEditor);};
$('expenseDescriptionMirror')?.addEventListener('input',e=>{const field=$('lines').querySelector('[data-index="'+activeLineIndex+'"] [data-field=description]');if(field)field.value=e.target.value;});
function syncCurrency(value){$('editForm').elements.currency.value=value;for(const select of $('lines').querySelectorAll('[data-field=currency]'))select.value=value;}
$('editForm').addEventListener('input',e=>{if(e.target.name==='currency')syncCurrency(e.target.value);if(e.target.name==='reviewed'){dirty=true;if(!e.target.checked)editing.exported=false;collect();warningList();scheduleAutoSave();}else edited();});
if(expenseRulesReady){
 $('lines').addEventListener('input',e=>{if(e.target.matches('[data-field=currency]'))syncCurrency(e.target.value);if(inlineAccounting)edited();});
 $('lines').addEventListener('focusin',e=>{const row=e.target.closest('[data-index]');if(row){activeLineIndex=Number(row.dataset.index);syncRightDescription();}});
 document.querySelector('.expense-accounting').addEventListener('focusout',e=>{if(inlineAccounting&&!e.currentTarget.contains(e.relatedTarget))setTimeout(()=>render(),0);});
 desktopLayout.addEventListener('change',syncExpenseLayout);
}
function syncExpenseLayout(){
 const next=expenseRulesReady&&desktopLayout.matches;
 if(next===inlineAccounting)return;
 // Collect using the old layout before replacing quantity/price inputs.
 if(editing)collect();
 const editor=$('editor'),wasOpen=editor.open,accounting=document.querySelector('.expense-accounting');
 if(accounting.contains(document.activeElement))document.activeElement.blur();
 if(wasOpen)editor.close();
 inlineAccounting=next;
 (next?document.body:document.querySelector('.expense-work-grid')).append(editor);
 (next?document.querySelector('.expense-left'):document.querySelector('#editor .editor-body')).append(accounting);
 if(editing)renderLines();
 if(wasOpen){if(next)editor.show();else editor.showModal();}
 document.querySelector('.expense-detail-empty').hidden=wasOpen;
 // A save already in flight must keep both layouts locked until it finishes.
 accounting.inert=saving;
 render();
}
$('lines').onclick=e=>{const b=e.target.closest('button');if(!b)return;const node=b.closest('[data-index]');if(!node)return;
  if(b.hasAttribute('data-plan')){accountTarget=node.querySelector('[data-field=expenseCode]');$('accountSearch').value='';renderAccountResults();$('accountPicker').showModal();$('accountSearch').focus();return;}
  if(b.hasAttribute('data-setup')){const category=editing.lines[Number(node.dataset.index)].category;$('openProfiles').click();const target=[...$('profileRows').children].find(row=>row.dataset.profile===category);if(target){target.open=true;target.scrollIntoView({block:'nearest'});}return;}
  if(b.hasAttribute('data-remember')||b.hasAttribute('data-forget')){run(async()=>{try{collect();const line=editing.lines[+node.dataset.index],key=memoryKey(editing,line);if(!key)throw Error('Önce satıcıyı ve masraf kategorisini doldur.');const code=b.hasAttribute('data-forget')?'':line.expenseCode;if(code&&!validExpenseCode(code))throw Error('Gider kodu harf, rakam, nokta, tire veya alt çizgi içermeli.');if(!code&&b.hasAttribute('data-remember'))throw Error('Önce gider kodunu yaz.');await memoryQueue;profiles=await api('profiles',{revision:profiles.revision,memory:{key,code}});if(!code)line.expenseCode='';renderLines();edited();$('editSaveState').textContent=code?'Kod bu firmada hafızaya kaydedildi.':'Kod hafızadan kaldırıldı.';}catch(error){$('editSaveState').textContent=error.message;}});return;}
  collect();if(b.dataset.category)editing.lines[+node.dataset.index].category=b.dataset.category;else if(b.dataset.vatIncluded!==undefined)editing.lines[+node.dataset.index].vatIncluded=b.dataset.vatIncluded==='true';else if(b.dataset.remove!==undefined)editing.lines.splice(+b.dataset.remove,1);renderLines();edited();};
$('addLine').onclick=()=>{if(editing.lines.length>=40){$('editSaveState').textContent='En fazla 40 satır eklenebilir.';return;}collect();editing.lines.push({description:receiptDescription(editing),category:'other',expenseCode:'',gross:null,vatRate:null,vatIncluded:true,descriptionReady:true});renderLines();edited();};
function updateViewerTransform(){const img=$('preview').querySelector('.expense-image-surface')||$('preview').querySelector('img');if(img)img.style.transform='translate('+viewerX+'px, '+viewerY+'px) rotate('+rotation+'deg) scale('+(inlineAccounting?expenseZoom/100:1)+')';}
$('rotate').onclick=()=>{rotation=(rotation+90)%360;updateViewerTransform();};
$('archive').onclick=async()=>{if(saving)return;collect();editing.archived=!editing.archived;editing.reviewed=false;editing.exported=false;$('editForm').elements.reviewed.checked=false;dirty=true;await saveEditor();$('archive').textContent=editing.archived?'Arşivden geri getir':'Arşive al';if(expenseRulesReady)$('expenseArchiveAction').textContent=editing.archived?'Arşivden çıkar':'Arşive ekle';};
$('retry').onclick=()=>run(async()=>{
  if(busy||saving)return;if(!confirm('Mevcut alanlar yeni okuma sonucu ile değiştirilecek. Kaynak belge korunur. Devam edilsin mi?'))return;
  const record=editing;busy=true;$('editor').close();$('progressPanel').hidden=false;render();
  try{await processReceipt(record,await getBlob(record.id));dirty=false;editing=null;await refresh();}
  catch(e){if(expenseRulesReady&&matchMedia('(min-width:1100px)').matches)$('editor').show();else $('editor').showModal();$('editSaveState').textContent=e.message+' Önceki düzenleme bu ekranda korunuyor.';return;}
  finally{cancelWorkerPreparation?.();worker?.terminate();worker=null;workerPreparation=null;busy=false;$('progressPanel').hidden=true;render();}
  await openEditor(record.id);
});
$('draftBackup').onclick=()=>{collect();downloadJSON({format:'soyturk-expense-draft-v1',company:company.id,receipt:editing},'masraf-duzenleme-'+company.id+'.json');};
$('backup').onclick=()=>run(async()=>{const full=[];for(const r of receipts)full.push(await api('record/'+r.id));downloadJSON({format:'soyturk-expenses-v1',company:company.id,created:new Date().toISOString(),receipts:full,profiles,sourceImagesIncluded:false},'masraf-calisma-'+company.id+'.json');notice('Alanlar ve eşleştirmeler indirildi. Bu yedek kaynak fotoğraf/PDF dosyalarını içermez; belgeler hesabında korunuyor.');});
let profileRevision=0;
$('openProfiles').onclick=()=>{profileRevision=profiles.revision;$('profileStatus').textContent='';$('profileRows').innerHTML=Object.entries(categories).map(([key,label])=>'<details class="profile-row" data-profile="'+key+'"><summary>'+label+'</summary><div class="profile-grid">'+[['serviceCode','Logo hizmet / stok kodu'],['accountCode','Gider hesap kodu'],['costCenter','Masraf merkezi'],['vatCode1','%1 KDV hesap kodu'],['vatCode10','%10 KDV hesap kodu'],['vatCode20','%20 KDV hesap kodu'],['kkegCode','KKEG gider hesabı'],['kkegVatCode','KKEG KDV hesabı']].map(([field,title])=>'<label>'+title+'<input data-profile-field="'+field+'" value="'+escape((editing?.lines?.[activeLineIndex]?.category===key?lineProfile(editing.lines[activeLineIndex],profiles,company.id,editing):categoryProfile(key,profiles,company.id))[field]||'')+'" maxlength="60"></label>').join('')+'</div></details>').join('');$('profiles').showModal();};
$('closeProfiles').onclick=()=>$('profiles').close();$('profileForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{const map={};for(const row of $('profileRows').children){map[row.dataset.profile]={};for(const input of row.querySelectorAll('input'))map[row.dataset.profile][input.dataset.profileField]=input.value;}const current=editing?.lines?.[activeLineIndex],key=current&&memoryKey(editing,current),entered=current&&map[current.category]?.accountCode,code=validExpenseCode(entered||'')?entered:current?.expenseCode;profiles=await api('profiles',{revision:profileRevision,categories:map,...(key&&validExpenseCode(code||'')?{lineProfile:{key,category:current.category,accountCode:code}}:{})});if(current&&key&&validExpenseCode(code||'')){current.expenseCode=code;dirty=true;scheduleAutoSave();}profileRevision=profiles.revision;render();if(editing&&$('editor').open)renderLines();$('profileStatus').textContent='Firma ayarları kaydedildi.';}catch(e){$('profileStatus').textContent=e.message;}finally{button.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(!document.hidden&&!busy&&!$('editor').open&&!$('profiles').open)refresh().catch(e=>{$('sync').textContent=e.message;});},15000);
run(refresh);

$('xml').onclick=()=>run(async()=>{if(dirty){await saveEditor();if(dirty)throw Error('Önce fişteki değişiklikler kaydedilmeli.');}await refresh();const selected=expenseRulesReady?receipts.filter(r=>!r.archived&&!r.exported&&expenseSelected.has(r.id)).map(r=>({...r,reviewed:true})):receipts;const xml=buildPurchaseXML(selected,profiles,company.id,{selected:expenseRulesReady}),url=URL.createObjectURL(new Blob([encodeLogoXML(xml)],{type:'application/xml;charset=iso-8859-9'}));const a=document.createElement('a');a.href=url;a.download='masraf-'+company.id+'.xml';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('Logo XML indirildi.');});

$('splitFlight').onclick=()=>{try{collect();const rate=Number($('flightRate').value);editing.lines=splitFlight(editing,rate);renderLines();edited();}catch(e){$('editSaveState').textContent=e.message;}};
