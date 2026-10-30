/* İzibiz incoming invoices: documents stay on the device, credentials stay on
   the authenticated server. Portable exports contain no connection secrets. */
(() => {
  'use strict';
  const workspace=window.SWWorkspace;
  const company=workspace.companyId;
  const $=id=>document.getElementById(id);
  const norm=value=>String(value||'').replace(/\s+/g,'').toLocaleUpperCase('tr');
  const safe=value=>String(value||'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').trim()||'Firma';
  const folderName=()=>safe(workspace.companyName)+' - Gelen E-Faturalar';
  function pdfName(title,number){if(!String(title||'').trim())throw Error('Faturanın tam firma unvanı bulunamadı.');return safe(String(title).trim()+' - '+String(number).trim()+'.pdf');}
  async function writeUnique(target,name,bytes){
    const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):'';
    for(let index=0;index<1000;index++){
      const candidate=index?stem+' ('+(index+1)+')'+extension:name;
      let existing;try{existing=await target.getFileHandle(candidate);}catch(e){if(e.name!=='NotFoundError')throw e;}
      if(existing){
        if(extension.toLowerCase()==='.pdf'){const file=await existing.getFile();if(file.size===bytes.byteLength){const old=new Uint8Array(await file.arrayBuffer()),data=new Uint8Array(bytes.buffer||bytes,bytes.byteOffset||0,bytes.byteLength);if(old.every((v,i)=>v===data[i]))return {name:candidate,created:false};}}
        continue;
      }
      const file=await target.getFileHandle(candidate,{create:true}),writer=await file.createWritable();
      try{await writer.write(bytes);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
      return {name:candidate,created:true};
    }
    throw Error('Aynı adlı çok fazla dosya var. Farklı bir kayıt klasörü seçin.');
  }
  window.SWIzibizFiles=Object.freeze({folderName,pdfName,writeUnique});
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let dialog,connected=false,directory=null,running=false,controller=null,db=null,ready=Promise.resolve(),datesEdited=false;
  function status(message){$('swIziStatus').textContent=message;if($('swIziInlineStatus')){$('swIziInlineStatus').textContent=message;$('swIziProgress').hidden=dialog.open;}}
  async function api(action,body,signal){
    const response=await fetch('/api/izibiz/'+company+'/'+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal});
    if(!response.ok){let result;try{result=await response.json();}catch{}throw Error(result?.error||'Bağlantı tamamlanamadı. Yeniden deneyin.');}
    return response;
  }
  async function directoryStore(value){
    if(!db)db=await new Promise((resolve,reject)=>{const request=indexedDB.open(workspace.databaseName('izibiz-downloads'),1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings',value===undefined?'readonly':'readwrite'),store=tx.objectStore('settings');const request=value===undefined?store.get('directory'):store.put(value,'directory');let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=reject;});
  }
  function destination(){if($('swIziDestination'))$('swIziDestination').textContent=directory?'Kayıt yeri: '+directory.name+' / '+folderName():'İndirilenler klasörünü bir kez seçin. PDF’ler ve karşılaştırılmış Excel “'+folderName()+'” klasörüne kaydedilecek.';}
  async function connection(){
    if(!window.SW_CONTEXT){status('Otomatik bağlantı için soyturkworks.com üzerinden bu firmayı açın. Taşınabilir dosyada Excel karşılaştırmasını kullanabilirsiniz.');$('swIziRun').disabled=true;$('swIziConnect').disabled=true;return;}
    try{const result=await (await api('status')).json();connected=result.connected;$('swIziConnection').textContent=connected?result.name+' · '+result.identifier:'Bu firma henüz bağlı değil';$('swIziSetup').open=!connected;$('swIziDisconnect').hidden=!connected;if(!result.configured)status('İzibiz bağlantı anahtarı sunucuda henüz tanımlı değil.');}catch(e){status(e.message);}
  }
  function setDates(){
      if(datesEdited)return;
      const rows=window.SWInvoiceBridge.snapshot().rows,dates=rows.map(r=>String(r.tarih).split('.').reverse().join('-')).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
      $('swIziFrom').value=(dates[0]||today()).slice(0,8)+'01';$('swIziTo').value=today();
  }
  async function open(){
    if(running)return;await ready;setDates();dialog.showModal();$('swIziProgress').hidden=true;
    status('Bağlantıyı ve klasörü bir kez kaydedin. Sonraki İzibiz tıklamalarında indirme doğrudan başlayacak.');await connection();destination();
  }
  async function chooseFolder(){
    if(!window.showDirectoryPicker){status('Bu tarayıcı klasöre doğrudan kaydetmeyi desteklemiyor. Bilgisayarda Chrome veya Edge ile açın.');return false;}
    try{directory=await window.showDirectoryPicker({id:'sw-izibiz-downloads',startIn:'downloads',mode:'readwrite'});try{await directoryStore(directory);}catch{}destination();return true;}catch(e){if(e.name!=='AbortError')status('Klasör seçilemedi. İndirilenler klasörünü yeniden seçin.');return false;}
  }
  async function activate(){
    if(running)return;await ready;setDates();
    if(!connected){await open();return;}
    await run();
  }
  function bootDialog(){
    dialog=document.createElement('dialog');dialog.id='swIziDialog';dialog.className='sw-izi-dialog';dialog.setAttribute('aria-labelledby','swIziTitle');
    dialog.innerHTML=`<div class="sw-izi-heading"><div><small>GELEN E-FATURA</small><h2 id="swIziTitle">İzibiz · <span></span></h2></div><button type="button" id="swIziClose" aria-label="Kapat">×</button></div>
      <p>Bir kez bağlan ve İndirilenler klasörünü seç. Sonrasında İzibiz düğmesi yeni faturaların PDF’lerini ve karşılaştırılmış Excel’i doğrudan firma klasörüne kaydeder.</p>
      <p id="swIziConnection"></p>
      <details id="swIziSetup"><summary>Firma bağlantısı</summary><p>Bu firmanın mevcut İzibiz hesabını bir kez bağla. Bilgiler sunucuda şifreli tutulur; dışa aktardığın HTML ve Excel dosyalarına eklenmez.</p>
      <form id="swIziForm"><label>Firmanın VKN / TCKN bilgisi<input id="swIziTax" name="identifier" inputmode="numeric" pattern="[0-9]{10,11}" maxlength="11" required autocomplete="off"></label>
      <label>İzibiz kullanıcı adı<input id="swIziUser" name="username" required maxlength="200" autocomplete="username"></label>
      <label>Mevcut İzibiz şifresi<input id="swIziPassword" name="password" type="password" required maxlength="500" autocomplete="current-password"></label>
      <div class="sw-izi-actions"><button type="submit" id="swIziConnect">Bağlantıyı doğrula ve kaydet</button><button type="button" id="swIziDisconnect" hidden>Bağlantıyı kaldır</button></div></form></details>
      <fieldset id="swIziDates"><legend>Fatura tarihi aralığı</legend><div class="sw-izi-dates"><label>Başlangıç<input type="date" id="swIziFrom" required></label><label>Bitiş<input type="date" id="swIziTo" required></label></div></fieldset>
      <div class="sw-izi-actions"><button type="button" id="swIziFolder">İndirilenler klasörünü seç</button></div><p id="swIziDestination"></p>
      <p class="sw-izi-status" id="swIziStatus" role="status" aria-live="polite"></p><div class="sw-izi-actions"><button type="button" id="swIziRun">Kaydet ve indir</button></div>`;
    dialog.querySelector('#swIziTitle span').textContent=workspace.companyName;document.body.append(dialog);
    $('swIziClose').onclick=()=>{if(!running)dialog.close();};dialog.addEventListener('cancel',e=>{if(running)e.preventDefault();});
    $('swIziForm').onsubmit=async e=>{
      e.preventDefault();const button=$('swIziConnect');button.disabled=true;status('İzibiz hesabı, firma kimliği ve fatura okuma yetkisi kontrol ediliyor…');
      try{await api('connect',{username:$('swIziUser').value,password:$('swIziPassword').value,identifier:$('swIziTax').value});$('swIziPassword').value='';await connection();$('swIziSetup').open=false;status('Bağlantı doğrulandı. Bu firmanın faturalarını alabilirsiniz.');}catch(err){status(err.message);}finally{button.disabled=false;}
    };
    $('swIziDisconnect').onclick=async()=>{try{await api('disconnect',{});$('swIziPassword').value='';await connection();status('Bu firmanın bağlantısı kaldırıldı.');}catch(e){status(e.message);}};
    $('swIziFolder').onclick=chooseFolder;
    $('swIziRun').onclick=run;
    $('swIziFrom').onchange=$('swIziTo').onchange=()=>{datesEdited=true;};
  }
  async function documentBytes(response,format){
    let bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes[0]===0x50&&bytes[1]===0x4b){
      const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files).filter(f=>!f.dir&&f.name.toLowerCase().endsWith(format==='ubl'?'.xml':'.pdf'));
      if(entries.length!==1)throw Error('İzibiz arşivindeki belge tekil olarak doğrulanamadı.');
      if(entries[0]._data?.uncompressedSize>25*1024*1024)throw Error('Belge açıldığında boyut sınırını aşıyor.');
      bytes=await entries[0].async('uint8array');
    }
    if(!bytes.length||bytes.length>25*1024*1024)throw Error('Belge boyutu doğrulanamadı.');
    if(format==='pdf'&&!new TextDecoder().decode(bytes.slice(0,5)).startsWith('%PDF-'))throw Error('Geçerli PDF alınamadı.');
    return bytes;
  }
  function verifyXml(bytes,row,identifier){
    const xml=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
    if(xml.querySelector('parsererror')||xml.documentElement.localName!=='Invoice')throw Error('Geçerli fatura XML’i alınamadı.');
    const root=xml.documentElement,child=name=>Array.from(root.children).find(n=>n.localName===name);
    if(norm(child('ID')?.textContent)!==norm(row.fatno)||child('UUID')?.textContent.trim().toLowerCase()!==row.uuid.toLowerCase())throw Error('İndirilen XML’in fatura numarası veya ETTN bilgisi eşleşmiyor.');
    const party=child('AccountingCustomerParty'),ids=party?Array.from(party.getElementsByTagNameNS('*','ID')).filter(n=>['VKN','TCKN'].includes(n.getAttribute('schemeID'))).map(n=>n.textContent.trim()):[];
    if(!ids.includes(identifier))throw Error('İndirilen XML’in alıcı firması eşleşmiyor.');
    const supplier=child('AccountingSupplierParty'),find=(parent,name)=>parent?.getElementsByTagNameNS('*',name)[0];
    return find(find(supplier,'PartyLegalEntity'),'RegistrationName')?.textContent.trim()||find(find(supplier,'PartyName'),'Name')?.textContent.trim()||[find(supplier,'FirstName')?.textContent.trim(),find(supplier,'FamilyName')?.textContent.trim()].filter(Boolean).join(' ');
  }
  const headers=['Fatura No','Tarih','Unvan','Ad Soyad','Tip','Tutar','Birim','Yanıt','Durum','Alıcı Bilgisi(PK)'];
  function gridFor(rows){return [headers,...rows.map(r=>[r.fatno,String(r.tarih||'').slice(0,10).split('-').reverse().join('.'),r.unvan,'',r.tip==='IADE'?'İade':r.tip,r.tutar,r.birim,r.yanit,r.isRet?'RET':'',''])];}
  async function run(){
    if(running)return;
    if(!connected){$('swIziSetup').open=true;status('Önce bu firmanın bağlantısını bir kez doğrulayın.');return;}
    const snapshot=window.SWInvoiceBridge.snapshot();
    if(snapshot.loading){status('Excel dosyası okunuyor. Okuma tamamlanınca yeniden deneyin.');return;}
    if(snapshot.referenceError){status(snapshot.referenceError+' Eski dosyayı yeniden seçin veya ilk kullanım için Temizle ile kaldırın.');return;}
    if(!directory&&!await chooseFolder())return;
    const startDate=$('swIziFrom').value,endDate=$('swIziTo').value;
    if(!startDate||!endDate||startDate>endDate){status('Geçerli başlangıç ve bitiş tarihlerini seçin.');return;}
    running=true;controller=new AbortController();const signal=controller.signal;
    const controls=Array.from(dialog.querySelectorAll('input,button,fieldset')),states=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);
    $('swIziButton').disabled=true;$('swIziSettings').disabled=true;$('swIziButton').textContent='İndiriliyor…';
    if(dialog.open)dialog.close();$('swIziProgress').hidden=false;$('swIziInlineCancel').hidden=false;
    const locked=['step1','step2','efaturaClearBtn','tableWrap','bulkBtns'].map(id=>$(id)).filter(Boolean),inert=locked.map(n=>n.inert);locked.forEach(n=>n.inert=true);
    let target=null,stored=0,existing=0;const runId=crypto.randomUUID(),folder=folderName();
    try{
      if(await directory.queryPermission({mode:'readwrite'})!=='granted'&&await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('Klasöre yazma izni verilmedi. İndirilenler klasörünü yeniden seçin.');target=directory.name===folder?directory:await directory.getDirectoryHandle(folder,{create:true});
      const rows=[],ids=new Set(),uuids=new Set(),numbers=new Set();let expected=null,pages=1,identifier='';
      for(let page=0;page<pages;page++){
        status('İzibiz listesi alınıyor · sayfa '+(page+1)+' / '+pages);
        const result=await (await api('list',{startDate,endDate,page,run:runId},signal)).json();
        if(result.company!==company||expected!==null&&expected!==result.total)throw Error('İzibiz listesi işlem sırasında değişti. Eksik indirmeyi önlemek için yeniden başlayın.');
        expected=result.total;pages=result.pages;identifier=result.identifier;
        for(const row of result.rows){if(ids.has(row.id)||uuids.has(row.uuid)||numbers.has(norm(row.fatno)))throw Error('İzibiz listesinde tekrarlayan fatura bulundu. İşlem durduruldu.');ids.add(row.id);uuids.add(row.uuid);numbers.add(norm(row.fatno));rows.push(row);}
      }
      if(rows.length!==expected)throw Error('İzibiz listesinin tamamı alınamadı. İşlem durduruldu.');
      signal.throwIfAborted();
      const latest=window.SWInvoiceBridge.snapshot();
      if(JSON.stringify(latest.reference)!==JSON.stringify(snapshot.reference)||JSON.stringify(latest.rows)!==JSON.stringify(snapshot.rows))throw Error('Excel listesi işlem sırasında değişti. Dosyanın okunmasını bekleyip yeniden başlayın.');
      if(!rows.length){status('Seçilen tarih aralığında gelen fatura yok.');return;}
      const grid=gridFor(rows);window.SWInvoiceBridge.load(grid);
      const newNumbers=new Set(window.SWInvoiceBridge.snapshot().rows.filter(r=>!r.isRet&&!r.islendi).map(r=>norm(r.fatno))),fresh=rows.filter(r=>newNumbers.has(norm(r.fatno)));
      for(let index=0;index<fresh.length;index++){
        const row=fresh[index];
        status('Yeni faturalar indiriliyor · '+(index+1)+' / '+fresh.length+' · '+row.fatno);
        const xml=await documentBytes(await api('download',{ticket:row.ticket,format:'ubl'},signal),'ubl'),title=verifyXml(xml,row,identifier),name=pdfName(title,row.fatno);
        const pdf=await documentBytes(await api('download',{ticket:row.ticket,format:'pdf'},signal),'pdf');
        signal.throwIfAborted();const saved=await writeUnique(target,name,pdf);if(saved.created)stored++;else existing++;
      }
      const formatted=await window.SWInvoiceBridge.excel();signal.throwIfAborted();
      await writeUnique(target,safe(formatted.name),formatted.bytes);
      signal.throwIfAborted();
      if(!fresh.length)status('Yeni fatura yok. '+rows.length+' fatura kontrol edildi; '+(snapshot.reference?'eski Excel’de bulunan veya işlenmiş/reddedilmiş faturalar tekrar indirilmedi.':'işlenmiş veya reddedilmiş faturalar indirilmedi.')+' Güncel Excel kaydedildi: '+folder);
      else status((snapshot.reference?'Tamamlandı. ':'İlk liste alındı. Eski Excel olmadığı için işlenmemiş faturalar yeni sayıldı. ')+stored+' yeni PDF'+(existing?', '+existing+' PDF zaten klasörde mevcut':'')+' ve güncel Excel kaydedildi: '+folder);
    }catch(e){
      const message=e.name==='AbortError'?'İşlem durduruldu.':e.message;
      status(message+' İşlem tamamlanmadı. '+stored+' fatura kaydedildi; karşılaştırılmış Excel’in kaydı tamamlanamadı.');
    }finally{running=false;controller=null;controls.forEach((n,i)=>n.disabled=states[i]);locked.forEach((n,i)=>n.inert=inert[i]);$('swIziInlineCancel').hidden=true;$('swIziButton').disabled=false;$('swIziSettings').disabled=false;$('swIziButton').textContent='İzibiz';}
  }
  function boot(){
    bootDialog();setDates();const button=document.createElement('button');button.type='button';button.id='swIziButton';button.textContent='İzibiz';button.onclick=activate;
    const settings=document.createElement('button');settings.type='button';settings.id='swIziSettings';settings.textContent='⚙';settings.setAttribute('aria-label','İzibiz ayarları');settings.title='İzibiz ayarları';settings.onclick=open;
    const top=$('ef115Top');if(top){top.prepend(button,settings);const progress=document.createElement('div');progress.id='swIziProgress';progress.hidden=true;progress.innerHTML='<p id="swIziInlineStatus" role="status" aria-live="polite"></p><button type="button" id="swIziInlineCancel" hidden>Durdur</button>';top.after(progress);$('swIziInlineCancel').onclick=()=>controller?.abort();}
    ready=Promise.all([connection(),directoryStore().then(value=>{directory=value||null;}).catch(()=>{})]).then(destination);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
