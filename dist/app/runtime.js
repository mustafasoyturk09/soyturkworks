(() => {
  'use strict';
  let ready=false,resourceFailed=false;
  const show=(message,error=false)=>{
    let bar=document.getElementById('sw177WebStatus');
    if(!bar){bar=document.createElement('div');bar.id='sw177WebStatus';bar.setAttribute('role','status');bar.style.cssText='position:fixed;bottom:8px;left:12px;right:12px;z-index:2147483647;padding:12px;background:#17243b;color:white;border:1px solid #c99b40;border-radius:8px;font:14px sans-serif';document.body.append(bar);}
    bar.replaceChildren(document.createTextNode(message+' '));
    const close=document.createElement('button');close.type='button';close.textContent='Kapat';close.onclick=()=>bar.remove();bar.append(close);
    if(error){const retry=document.createElement('button');retry.type='button';retry.textContent='Sayfayı yenile';retry.onclick=()=>{if(confirm('Kaydedilmemiş dosya listeleri kapanır. Yedeklerini aldıysan sayfayı yenileyelim mi?'))location.reload();};bar.append(retry);}
  };
  const notify=(message,error)=>document.body?show(message,error):document.addEventListener('DOMContentLoaded',()=>show(message,error),{once:true});
  window.sw177Notify=notify;
  document.addEventListener('click',e=>{if(!ready&&e.target.closest('input[type=file],button,[data-page]')){e.preventDefault();e.stopImmediatePropagation();notify(resourceFailed?'Bir uygulama dosyası yüklenemedi. Bağlantını kontrol ederek yeniden dene.':'Uygulama dosyaları yükleniyor; lütfen bekle.',resourceFailed);}},true);
  document.addEventListener('drop',e=>{if(!ready){e.preventDefault();e.stopImmediatePropagation();notify('Uygulama yüklenirken dosya alınamaz; yükleme tamamlanınca tekrar sürükle.');}},true);
  window.addEventListener('error',e=>{
    const tag=e.target&&e.target.tagName;
    if(tag==='SCRIPT'||tag==='LINK'){
      // Cloudflare may inject optional, third-party analytics. Only required
      // same-origin application resources should block invoice processing.
      const url=e.target.src||e.target.href;
      if(url&&new URL(url,location.href).origin!==location.origin)return;
      resourceFailed=true;notify('Bir uygulama bileşeni yüklenemedi. Dosya işleme başlatılmadı.',true);
    }
    else if(e.message){if(!ready)resourceFailed=true;notify('Bu işlem tamamlanamadı. Açık verilerini yedekle; sorun sürerse hata ekranıyla birlikte bildir.',true);}
  },true);
  window.addEventListener('unhandledrejection',()=>notify('İşlem tamamlanamadı; mevcut kayıtlar silinmedi. Depolama alanını ve bağlantını kontrol et.',true));
  window.addEventListener('offline',()=>notify('İnternet bağlantısı kesildi. Yüklenmiş dosyalarla çalışabilirsin; bu sayfayı kapatmadan yedeklerini indir.'));
  window.addEventListener('online',()=>notify('İnternet bağlantısı yeniden kuruldu.'));
  window.addEventListener('load',()=>{
    ready=!resourceFailed&&['XLSX','ExcelJS','pdfjsLib','PDFLib','fontkit','JSZip'].every(x=>!!window[x]);
    if(!ready){notify('Dosya işleme bileşenleri eksik. İnternet bağlantını kontrol edip yeniden dene.',true);return;}
    try{const k='sw177_storage_probe';localStorage.setItem(k,'1');localStorage.removeItem(k);}catch{notify('Tarayıcı kalıcı kayda izin vermiyor. Çalışmalarını kapatmadan yedekle; normal bir tarayıcı profili kullan.');}
  });
})();
