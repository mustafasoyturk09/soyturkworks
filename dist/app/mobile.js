(() => {
  'use strict';
  const sidebar=document.querySelector('body > aside');
  const main=document.querySelector('body > main');
  if(!sidebar||!main)return;
  const compact=window.matchMedia('(max-width: 1024px)');
  sidebar.id=sidebar.id||'swMainNav';
  const bar=document.createElement('div');
  bar.className='sw-mobile-bar';
  const toggle=document.createElement('button');
  toggle.type='button'; toggle.className='sw-menu-button';
  toggle.setAttribute('aria-label','Modül menüsünü aç');
  toggle.setAttribute('aria-controls',sidebar.id);
  toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const heading=document.createElement('div');
  heading.className='sw-mobile-heading';
  const brand=document.createElement('span'); brand.className='sw-mobile-brand'; brand.textContent=window.SWWorkspace?.companyName||'Soyturk Works';
  const pageName=document.createElement('span'); pageName.className='sw-mobile-page';
  const logo=document.createElement('img');
  logo.className='sw-header-logo'; logo.alt=''; logo.width=36; logo.height=36;
  const brandImage=sidebar.querySelector('.brand-mark-photo');
  logo.src=brandImage?brandImage.src:new URL('./assets/brand/sw-logo.png',location.href).href;
  heading.append(brand,pageName); bar.append(toggle,logo,heading);
  const backdrop=document.createElement('button');
  backdrop.type='button'; backdrop.className='sw-nav-backdrop';
  backdrop.setAttribute('aria-label','Modül menüsünü kapat'); backdrop.tabIndex=-1;
  const close=document.createElement('button');
  close.type='button'; close.className='sw-nav-close'; close.setAttribute('aria-label','Menüyü kapat');
  close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  sidebar.prepend(close); document.body.prepend(bar,backdrop);
  const items=[...sidebar.querySelectorAll('.nav-item[data-page]')];
  for(const item of items){item.tabIndex=0;item.setAttribute('role','button');}
  function updateTitle(){
    const active=sidebar.querySelector('.nav-item.active[data-page]');
    pageName.textContent=active?active.textContent.trim():'Modüller';
    for(const item of items)item.setAttribute('aria-current',item===active?'page':'false');
  }
  function setOpen(open,restoreFocus=true){
    open=Boolean(open&&compact.matches);
    document.body.classList.toggle('sw-nav-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    sidebar.inert=compact.matches&&!open;
    main.inert=open;
    if(open)close.focus();
    else if(restoreFocus)toggle.focus();
  }
  toggle.addEventListener('click',()=>setOpen(!document.body.classList.contains('sw-nav-open')));
  close.addEventListener('click',()=>setOpen(false));
  backdrop.addEventListener('click',()=>setOpen(false));
  sidebar.addEventListener('click',e=>{
    if(e.target.closest('.nav-item[data-page],.brand')){
      updateTitle(); if(compact.matches)setOpen(false);
    }
  });
  sidebar.addEventListener('keydown',e=>{
    if(e.target.matches('.nav-item[data-page]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}
  });
  document.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('sw-nav-open'))return;
    if(e.key==='Escape'){e.preventDefault();setOpen(false);}
    if(e.key==='Tab'){
      const focusable=[...sidebar.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
      if(e.shiftKey&&document.activeElement===close){e.preventDefault();focusable.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();close.focus();}
    }
  });
  new MutationObserver(updateTitle).observe(sidebar,{subtree:true,attributes:true,attributeFilter:['class']});
  compact.addEventListener('change',()=>setOpen(false,false));
  updateTitle();setOpen(false,false);
})();
