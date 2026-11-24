/* Keep the two independent modules alive inside the active company workspace. */
(() => {
  'use strict';
  if(!window.SW_CONTEXT?.company?.id)return;
  const company=window.SW_CONTEXT.company.id,validViews=new Set(['overview','invoices','folders','dashboard','notifications']);
  const labels=[['overview','Genel Bakış'],['invoices','Faturalar'],['folders','Dönem Arşivi'],['dashboard','Otomatik Takip'],['notifications','Telefon Bildirimleri']];
  const key='sw:company:v2:'+company+':embedded_module',frames=new Map();
  let active=null,desiredView='overview',desiredMonth=null,follow,expenses,submenu,main,loading;
  const url=name=>'/workspace/'+encodeURIComponent(company)+'/'+name+'/';
  function idle(fn){if('requestIdleCallback' in window)requestIdleCallback(fn,{timeout:12000});else setTimeout(fn,1200);}
  function createFrame(name){
    if(frames.has(name))return frames.get(name).promise;
    const frame=document.createElement('iframe');frame.className='sw-module-frame';frame.title=name==='takip'?'Gelen E-Fatura İzibiz':'Masraf Fişleri';frame.hidden=true;
    const item={frame,ready:false,promise:null};frames.set(name,item);main.append(frame);
    item.promise=(async()=>{
      const response=await fetch(url(name),{credentials:'same-origin',cache:'no-store'});
      if(response.redirected){if(response.url.includes('/login')||response.url.includes('/companies'))location.href=response.url;throw Error('Oturum veya firma doğrulanamadı.');}
      if(!response.ok)throw Error('Modül yüklenemedi.');
      const html=await response.text(),style=name==='takip'?'.rail,.topbar,.bottom-nav{display:none!important}.shell{margin-left:0!important}main{max-width:none!important}':'body.pusula-expenses{padding-left:0!important}.expense-sidebar,.topbar{display:none!important}main{max-width:none!important}';
      if(!html.includes('</head>'))throw Error('Modül içeriği alınamadı.');
      const source=html.replace('</head>','<style>'+style+'</style><script>window.SW_EMBEDDED=true;window.SW_EMBED_ACTIVE=false;<\/script></head>');
      await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Modül açılamadı.'));frame.srcdoc=source;});
      if(!frame.contentWindow?.SW_CONTEXT?.company||frame.contentWindow.SW_CONTEXT.company.id!==company)throw Error('Firma doğrulanamadı.');
      item.ready=true;frame.contentWindow.SWSetEmbeddedActive?.(active===name);
      if(active===name){loading.hidden=true;frame.hidden=false;if(name==='takip')frame.contentWindow.SWOpenEmbedded?.(desiredView,desiredMonth);}
      return item;
    })().catch(error=>{frame.remove();frames.delete(name);if(active===name){loading.hidden=false;loading.textContent='Modül açılamadı. Yeniden denemek için menüye tekrar basın.';}throw error;});
    return item.promise;
  }
  function hideFrames(except=null){for(const [name,item] of frames){if(name===except)continue;item.frame.hidden=true;item.frame.contentWindow?.SWSetEmbeddedActive?.(false);}}
  function updateMenu(){
    follow.classList.toggle('active',active==='takip');expenses.classList.toggle('active',active==='masraf');
    submenu.querySelectorAll('[data-follow-view]').forEach(button=>{const selected=active==='takip'&&button.dataset.followView===desiredView;button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');});
  }
  window.SWEmbeddedViewChanged=(next,month)=>{if(active==='takip'&&validViews.has(next)){desiredView=next;desiredMonth=month||null;updateMenu();try{sessionStorage.setItem(key,JSON.stringify({name:active,view:desiredView,month:desiredMonth}));}catch{}}};
  window.SWReturnToWorkspace=()=>{let previous='efatura';try{previous=window.SWWorkspace.session.getItem('fc_active_page')||previous;}catch{}const items=[...document.querySelectorAll('aside .nav-item[data-page]')],item=items.find(node=>node.dataset.page===previous)||items.find(node=>node.dataset.page==='efatura');item?.click();};
  function mobileClose(){if(matchMedia('(max-width: 1024px)').matches)document.querySelector('.sw-nav-backdrop')?.click();}
  function showModule(name,next='overview',month=null){
    if(name==='takip'){desiredView=validViews.has(next)?next:'overview';desiredMonth=month;submenu.hidden=false;follow.setAttribute('aria-expanded','true');}
    active=name;try{sessionStorage.setItem(key,JSON.stringify({name,view:desiredView,month:desiredMonth}));}catch{}
    document.body.classList.remove('sw-issue-active','fc-home-full');document.body.classList.add('sw-embedded-active');main.classList.add('wide');main.querySelectorAll('.page').forEach(page=>page.style.display='none');
    document.querySelectorAll('aside .nav-item[data-page]').forEach(node=>node.classList.remove('active'));hideFrames(name);updateMenu();
    const cached=frames.get(name);if(cached?.ready){loading.hidden=true;if(cached.frame.hidden){cached.frame.hidden=false;cached.frame.contentWindow.SWSetEmbeddedActive?.(true);}if(name==='takip')cached.frame.contentWindow.SWOpenEmbedded?.(desiredView,desiredMonth);}
    else{loading.hidden=false;loading.textContent='Modül açılıyor…';createFrame(name).catch(()=>{});}
    window.scrollTo(0,0);mobileClose();
  }
  function leaveModule(){if(!active)return;active=null;hideFrames();loading.hidden=true;document.body.classList.remove('sw-embedded-active');follow.classList.remove('active');expenses.classList.remove('active');submenu.querySelectorAll('button').forEach(button=>button.classList.remove('active'));try{sessionStorage.removeItem(key);}catch{}}
  function boot(){
    follow=document.getElementById('swEarlyFollow');expenses=document.getElementById('swEarlyExpenses');main=document.querySelector('body > main');if(!follow||!expenses||!main)return;
    for(const link of document.querySelectorAll('aside a.nav-item'))if(link!==follow&&link!==expenses&&(link.getAttribute('href')===url('takip')||link.getAttribute('href')===url('masraf')))link.remove();
    submenu=document.createElement('div');submenu.className='sw-follow-submenu';submenu.hidden=true;submenu.innerHTML=labels.map(([id,label])=>'<button type="button" data-follow-view="'+id+'">'+label+'</button>').join('');follow.after(submenu);follow.setAttribute('aria-expanded','false');follow.setAttribute('aria-controls','swFollowSubmenu');submenu.id='swFollowSubmenu';
    loading=document.createElement('div');loading.className='sw-module-loading';loading.setAttribute('role','status');loading.hidden=true;main.append(loading);
    follow.addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(active==='takip'&&!submenu.hidden){submenu.hidden=true;follow.setAttribute('aria-expanded','false');}else showModule('takip',active==='takip'?desiredView:'overview');});
    expenses.addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();showModule('masraf');});
    submenu.addEventListener('click',event=>{const button=event.target.closest('[data-follow-view]');if(button)showModule('takip',button.dataset.followView);});
    document.querySelector('body > aside')?.addEventListener('click',event=>{if(event.target.closest('.nav-item[data-page]'))leaveModule();},true);
    window.SWModuleNavigationReady=true;const params=new URLSearchParams(location.search);let target=window.SWPendingModule||params.get('module'),selected=params.get('view'),month=params.get('month');window.SWPendingModule=null;
    if(!['takip','masraf'].includes(target)){try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');target=saved?.name;selected=saved?.view;month=saved?.month;}catch{}}
    if(['takip','masraf'].includes(target)){showModule(target,selected,month);if(params.has('module'))history.replaceState(null,'','/workspace/'+encodeURIComponent(company)+'/');}
    idle(()=>createFrame('takip').then(()=>idle(()=>createFrame('masraf').catch(()=>{}))).catch(()=>{}));
  }
  if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
