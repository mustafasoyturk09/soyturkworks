/* Company context is fixed for this document. Switching companies reloads the
   application instead of reusing in-memory invoices, images or accounting state. */
(() => {
  'use strict';
  const names={PUSULA:'Pusula',COMED:'Comed',KIB:'Kendine İyi Bak',DIJITAL_GARAJ:'Dijital Garaj',KIB_DIJITAL:'KİB Dijital Tek'};
  let seed=null;try{seed=JSON.parse(document.getElementById('fc153PortableData')?.textContent||'null');}catch{}
  const companyId=window.SW_CONTEXT?.company?.id||seed?.workspace?.companyId||'PUSULA';
  if(!Object.hasOwn(names,companyId))throw Error('Geçersiz firma bağlamı.');
  const prefix='sw:company:v2:'+companyId+':';
  const nativeLocal={getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)};
  const nativeSession={getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value)};
  const plainKey=key=>String(key).replace(/^fc153:fc153-[A-Za-z0-9-]+:/,'');
  function onlyCompany(value,id=companyId) {
    if(Array.isArray(value))return value.filter(x=>x&&x.company===id);
    return null;
  }
  function filterCompanyValue(key,value,id=companyId) {
    if(typeof value!=='string')return null;
    key=plainKey(key);let parsed;try{parsed=JSON.parse(value);}catch{return null;}
    if(['fc_sales_branch_memory_v1','fc_sales_service_memory_v1'].includes(key))return JSON.stringify(onlyCompany(parsed,id)||[]);
    if(key==='fc_sales_work_v156')return JSON.stringify({[id]:Array.isArray(parsed?.[id])?parsed[id].filter(x=>x?.company===id):[]});
    if(key==='fc_sales_companies_v156')return JSON.stringify(parsed?.[id]?{[id]:parsed[id]}:{});
    if(key==='fc_sales_history_v1')return id==='PUSULA'?JSON.stringify(Array.isArray(parsed)?parsed.filter(x=>!x.company||x.company===id):[]):null;
    if(key==='fc_sales_history_kib_v1')return id==='KIB'?JSON.stringify(Array.isArray(parsed)?parsed.filter(x=>!x.company||x.company===id):[]):null;
    if(key==='fc_sales_history_'+id.toLowerCase()+'_v1')return JSON.stringify(Array.isArray(parsed)?parsed.filter(x=>!x.company||x.company===id):[]);
    // Undo and unassigned records must never silently inherit a company.
    return null;
  }
  const storage={
    getItem(key){
      const current=nativeLocal.getItem(prefix+key);if(current!==null)return current;
      const legacy=nativeLocal.getItem(String(key));const migrated=filterCompanyValue(key,legacy);
      if(migrated!==null)nativeLocal.setItem(prefix+key,migrated);
      return migrated;
    },
    setItem(key,value){nativeLocal.setItem(prefix+key,String(value));},
    removeItem(key){window.localStorage.removeItem(prefix+key);}
  };
  const session={getItem:key=>nativeSession.getItem(prefix+key),setItem:(key,value)=>nativeSession.setItem(prefix+key,String(value)),removeItem:key=>window.sessionStorage.removeItem(prefix+key)};
  window.SWWorkspace=Object.freeze({companyId,companyName:names[companyId],storage,session,filterCompanyValue,databaseName:name=>prefix+name,allows:id=>id===companyId,names,offline:!window.SW_CONTEXT});
  async function logout(){const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.href='/login';else alert('Çıkış tamamlanamadı. Yeniden deneyin.');}
  function boot(){
    document.body.dataset.workspace=companyId;
    document.title=names[companyId]+' · Soyturk Works';
    const aside=document.querySelector('aside');
    if(aside){
      const box=document.createElement('section');box.className='sw-workspace-card';
      const label=document.createElement('span');label.textContent='AKTİF FİRMA';
      const title=document.createElement('strong');title.textContent=names[companyId];
      box.append(label,title);
      if(window.SW_CONTEXT){const change=document.createElement('a');change.href='/companies';change.textContent='Firma değiştir ↗';change.addEventListener('click',event=>{if(!confirm('Firma seçimine dönülsün mü? Açık PDF ve Excel dosyaların bu ekranda tutulur; gerekiyorsa önce çıktını indir. Kaydedilmiş kayıtların korunur.'))event.preventDefault();});box.append(change);}
      aside.querySelector('nav')?.before(box);
      const foot=aside.querySelector('.sidebar-foot');if(foot){const legacy=document.createElement('button');legacy.type='button';legacy.textContent='Eski yerel kayıtları aktar';legacy.onclick=legacyDialog;foot.append(legacy);if(window.SW_CONTEXT){const account=document.createElement('a');account.href='/account';account.textContent='Hesabım';const out=document.createElement('button');out.type='button';out.textContent='Çıkış yap';out.onclick=logout;foot.append(account,out);}}
    }
    document.querySelector('.brand-mark')?.addEventListener('click',()=>{if(window.SW_CONTEXT)location.href='/companies';});
    function restrictSelectors(){
      document.querySelectorAll('#fcCompanySeg [data-company],#page-satis [data-sales-company],#cmCompanySeg [data-company],#cm96CompanyList [data-company]').forEach(button=>{if((button.dataset.company||button.dataset.salesCompany)!==companyId)button.remove();});
      for(const id of ['fcCompanySeg','cmCompanySeg']){const seg=document.getElementById(id);if(seg&&!seg.querySelector('[data-company]')){const b=document.createElement('button');b.type='button';b.dataset.company=companyId;b.className='active';b.textContent=names[companyId];seg.append(b);}}
      const select=document.getElementById('cm91Company');if(select){[...select.options].forEach(o=>{if(o.value!==companyId)o.remove();});if(!select.options.length)select.add(new Option(names[companyId],companyId));select.value=companyId;}
      const trigger=document.getElementById('cm96CompanyTrigger');if(trigger){trigger.disabled=true;trigger.setAttribute('aria-label',names[companyId]+' — aktif firma');}
    }
    restrictSelectors();
    const salesCompanies=document.querySelector('#page-satis .s79-company');if(salesCompanies)new MutationObserver(restrictSelectors).observe(salesCompanies,{childList:true});
    const description=document.getElementById('s86PageDesc');if(description)description.textContent=names[companyId]+' satış e-faturalarını PDF’den oku, kritik alanları kontrol et ve Logo Tiger 3 için toplu XML hazırla.';
    if(!['PUSULA','KIB'].includes(companyId)){
      for(const id of ['page-yevmiye','page-satis']){const page=document.getElementById(id);if(!page)continue;const note=document.createElement('div');note.className='sw-configuration-note';note.setAttribute('role','status');note.textContent=names[companyId]+' için doğrulanmış hesap planı henüz tanımlı değil. Başka firmanın kodları kullanılmaz. Hesap kodları tanımlanmadan muhasebe çıktısı oluşturulamaz.';page.querySelector('header')?.after(note);}
    }
    if(window.SW_CONTEXT){let verifying=false;const check=async()=>{if(verifying||document.hidden)return;verifying=true;try{const r=await fetch('/api/session',{cache:'no-store'});if(r.ok){const session=await r.json();if(!session.account)location.replace('/login');else if(!session.companies.some(c=>c.id===companyId&&c.active&&!c.deleted))location.replace('/companies');}}catch{}finally{verifying=false;}};document.addEventListener('visibilitychange',check);window.addEventListener('pageshow',check);setInterval(check,120000);}
  }
  function legacyDialog(){
    let dialog=document.getElementById('swLegacyDialog');if(dialog){dialog.showModal();return;}
    dialog=document.createElement('dialog');dialog.id='swLegacyDialog';dialog.className='sw-legacy-dialog';
    const heading=document.createElement('h2');heading.textContent='Eski yerel kayıtlar';
    const text=document.createElement('p');text.textContent='Önceki sürümde firması belirtilmemiş kayıtlar bu tarayıcıda korunuyor. Yalnızca '+names[companyId]+' firmasına ait olduklarından eminsen bir kopyasını bu firmaya aktar. Kaynak kayıtlar silinmez.';
    dialog.append(heading,text);
    const choices=[['Notlar','fc_notes_v1'],['Notların önceki sağlam kopyası','fc_notes_backup_v145'],['Satın alma kayıtları','sf_receipts_v1'],['Satın alma görselleri','sf_img_fallback_v1'],['Satın alma ayarları','sf_settings_v1']];
    // Notes used several historical keys. Find the actual saved collection without
    // enumerating or exposing unrelated browser storage.
    for(const key of ['fc_notes_v145','fc_notes_v140','fc_notes_v133','fc_notes_v132','fc_notes_v130','fc_notes_v1']){if(nativeLocal.getItem(key)!==null){choices[0][1]=key;break;}}
    let count=0;
    for(const [label,key] of choices){const raw=nativeLocal.getItem(key);if(!raw)continue;count++;const row=document.createElement('div');row.className='sw-legacy-row';const title=document.createElement('span');title.textContent=label;const button=document.createElement('button');button.type='button';button.textContent='Bu firmaya kopyala';button.onclick=()=>{
      const current=nativeLocal.getItem(prefix+key);let empty=current===null;try{const x=JSON.parse(current);empty=empty||(Array.isArray(x)?x.length===0:x&&Array.isArray(x.notes)?x.notes.length===0:x&&Object.keys(x).length===0);}catch{}
      if(!empty){alert('Bu firmada bu tür kayıtlar zaten var. Üzerine yazılmadı.');return;}
      const assigned=nativeLocal.getItem('sw:legacy-assigned:'+key);
      if(assigned&&assigned!==companyId){alert('Bu kayıt daha önce '+(names[assigned]||assigned)+' firmasına aktarıldı. Karışıklığı önlemek için yeniden aktarılmadı.');return;}
      if(!confirm(label+' kayıtlarının tamamı '+names[companyId]+' firmasına kopyalansın mı?'))return;
      nativeLocal.setItem(prefix+key,raw);nativeLocal.setItem('sw:legacy-assigned:'+key,companyId);button.textContent='Kopyalandı';button.disabled=true;
      const p=document.createElement('p');p.textContent='Aktarım tamamlandı. Kaydetmediğin bir işlem varsa tamamla, ardından sayfayı yenile.';dialog.append(p);
    };row.append(title,button);dialog.append(row);}
    if(window.indexedDB){
      const row=document.createElement('div');row.className='sw-legacy-row';const title=document.createElement('span');title.textContent='Eski satın alma görsel arşivi';const copy=document.createElement('button');copy.type='button';copy.textContent='Görselleri bu firmaya kopyala';copy.onclick=async()=>{
        const assigned=nativeLocal.getItem('sw:legacy-assigned:sf_receipts_v1')||nativeLocal.getItem('sw:legacy-assigned:images');
        if(assigned&&assigned!==companyId){alert('Eski satın alma kayıtları '+(names[assigned]||assigned)+' firmasına aktarıldı. Görselleri de o firma içinde aktarın.');return;}
        if(!confirm('Eski görsel arşivinin tamamı '+names[companyId]+' firmasına kopyalansın mı? Kaynak arşiv silinmez.'))return;
        copy.disabled=true;let source,target;
        try{
          const open=(name,existing)=>new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{if(existing)request.transaction.abort();else request.result.createObjectStore('images');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error(existing?'Eski görsel arşivi bulunamadı.':'Görsel arşivi açılamadı.'));request.onblocked=()=>reject(Error('Diğer açık uygulama sekmelerini kapatıp yeniden deneyin.'));});
          source=await open('FaturaCanavariSatinalma',true);target=await open(prefix+'FaturaCanavariSatinalma',false);
          const read=(db,key)=>new Promise((resolve,reject)=>{const r=db.transaction('images','readonly').objectStore('images')[key===undefined?'getAllKeys':'get'](key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Görsel okunamadı.'));});
          const keys=await read(source);let copied=0;
          for(const key of keys){if(await read(target,key)!==undefined)continue;const value=await read(source,key);await new Promise((resolve,reject)=>{const tx=target.transaction('images','readwrite');tx.objectStore('images').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Yeterli tarayıcı depolama alanı yok. Kaynak görseller korunuyor.'));tx.onabort=tx.onerror;});copied++;copy.textContent=copied+' görsel kopyalandı';}
          nativeLocal.setItem('sw:legacy-assigned:images',companyId);copy.textContent='Görseller aktarıldı';
        }catch(error){alert(error.message);copy.disabled=false;}finally{source?.close();target?.close();}
      };row.append(title,copy);dialog.append(row);
    }
    if(!count){const p=document.createElement('p');p.textContent='Bu tarayıcıda firması belirsiz eski not veya satın alma kaydı bulunamadı. Firması belli satış kayıtları kendi firmalarına otomatik kopyalanır.';dialog.append(p);}
    const close=document.createElement('button');close.type='button';close.textContent='Kapat';close.onclick=()=>dialog.close();dialog.append(close);document.body.append(dialog);dialog.showModal();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
