(() => {
  'use strict';
  const page=document.getElementById('page-yevmiye');
  const calc=document.getElementById('calc');
  const card=document.getElementById('fc165CardSelect');
  const clear=document.getElementById('yevmiyeClearBtn');
  const side=page?.querySelector('.yevmiye-side');
  if(!page || !calc || !card || !clear || !side || document.getElementById('swCalculatorDialog')) return;

  const tools=document.createElement('div'); tools.className='sw-yev-card-tools';
  card.before(tools); tools.append(card);
  const cardLabel=page.querySelector('label[for="fc165CardSelect"]');
  if(cardLabel) tools.prepend(cardLabel);
  const open=document.createElement('button'); open.type='button'; open.id='swCalculatorOpen';
  open.textContent='Hesap Makinesi'; open.setAttribute('aria-haspopup','dialog');
  open.setAttribute('aria-controls','swCalculatorDialog'); open.setAttribute('aria-expanded','false');
  tools.append(open);
  const actions=document.createElement('div'); actions.className='sw-yev-summary-actions';
  actions.append(clear); side.prepend(actions); clear.style.removeProperty('right');

  const dialog=document.createElement('dialog'); dialog.id='swCalculatorDialog';
  dialog.setAttribute('aria-labelledby','swCalculatorTitle');
  const head=document.createElement('div'); head.className='sw-calc-dialog-head';
  const title=document.createElement('h2'); title.id='swCalculatorTitle'; title.textContent='Hesap Makinesi';
  const close=document.createElement('button'); close.type='button'; close.id='swCalculatorClose';
  close.setAttribute('aria-label','Hesap makinesini kapat');
  close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  head.append(title,close);
  const body=document.createElement('div'); body.className='sw-calc-dialog-body';
  const stage=document.createElement('div'); stage.className='sw-calc-stage';
  const oldWrap=calc.closest('.yevmiye-calc-wrap');
  stage.append(calc); body.append(stage); dialog.append(head,body); document.body.append(dialog);
  oldWrap?.remove(); calc.style.removeProperty('transform');
  const output=document.getElementById('calcOut'); output.tabIndex=0;
  output.setAttribute('role','status'); output.setAttribute('aria-live','polite');

  function fit(){
    if(!dialog.open) return;
    const viewport=window.visualViewport;
    const width=viewport?.width || window.innerWidth;
    const height=viewport?.height || window.innerHeight;
    const mobile=width<=1024;
    const padding=width<=540?24:32;
    const outer=width<=540?18:26;
    dialog.style.left=((viewport?.offsetLeft || 0)+width/2)+'px';
    dialog.style.top=((viewport?.offsetTop || 0)+height/2)+'px';
    dialog.style.maxWidth=Math.max(1,width-outer)+'px';
    dialog.style.maxHeight=Math.max(1,height-outer)+'px';
    const usableWidth=Math.max(1,width-outer-padding);
    const usableHeight=Math.max(1,height-outer-padding-head.offsetHeight);
    const desiredWidth=mobile?Math.min(usableWidth,390):Math.max(380,Math.min(width*.31,680));
    const naturalHeight=calc.offsetHeight;
    if(!naturalHeight) return;
    let scale=Math.min(usableWidth/270,desiredWidth/270,usableHeight/naturalHeight);
    // A short landscape phone keeps readable keys and scrolls inside the dialog.
    if(mobile && height<540) scale=Math.min(usableWidth/270,1.35);
    scale*=width<=540 ? .94 : .85;
    scale=Math.max(.1,scale);
    stage.style.width=(270*scale)+'px'; stage.style.height=(naturalHeight*scale)+'px';
    stage.style.setProperty('--sw-calc-scale',String(scale));
  }
  open.addEventListener('click',()=>{
    if(dialog.open) return;
    dialog.showModal(); document.body.classList.add('sw-calc-open');
    open.setAttribute('aria-expanded','true'); fit(); output.focus({preventScroll:true});
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Escape') return;
    event.preventDefault(); event.stopPropagation(); dialog.close();
  });
  dialog.addEventListener('close',()=>{
    window._fcResetYevmiyeCalc?.();
    document.getElementById('taxRatePanel')?.classList.remove('show');
    document.body.classList.remove('sw-calc-open'); open.setAttribute('aria-expanded','false');
    open.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog) return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();
  });
  window.addEventListener('resize',fit);
  window.visualViewport?.addEventListener('resize',fit);
  window.visualViewport?.addEventListener('scroll',fit);
  // Opening TAX RATE changes the natural height; retain the centered fit.
  new ResizeObserver(fit).observe(calc);
  document.fonts?.ready.then(fit).catch(()=>{});
})();
