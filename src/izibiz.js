/* İzibiz incoming invoices: documents stay on the device, credentials stay on
   the authenticated server. Portable exports contain no connection secrets. */
(() => {
  'use strict';
  const workspace=window.SWWorkspace;
  const company=workspace.companyId;
  const $=id=>document.getElementById(id);
  const norm=value=>String(value||'').replace(/\s+/g,'').toLocaleUpperCase('tr');
  const safe=value=>String(value||'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,120)||'Firma';
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let dialog,connected=false,directory=null,running=false,controller=null,readyZip=null,saveName='',db=null;
  function status(message){$('swIziStatus').textContent=message;}
  async function api(action,body,signal){
    const response=await fetch('/api/izibiz/'+company+'/'+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal});
    if(!response.ok){let result;try{result=await response.json();}catch{}throw Error(result?.error||'Bağlantı tamamlanamadı. Yeniden deneyin.');}
    return response;
  }
  async function directoryStore(value){
    if(!db)db=await new Promise((resolve,reject)=>{const request=indexedDB.open(workspace.databaseName('izibiz-downloads'),1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings',value===undefined?'readonly':'readwrite'),store=tx.objectStore('settings');const request=value===undefined?store.get('directory'):store.put(value,'directory');let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=reject;});
  }
  function destination(){if($('swIziDestination'))$('swIziDestination').textContent=directory?'Kayıt yeri: '+directory.name+' / '+workspace.companyName:'Kayıt yeri: İndirilenler’e firma klasörü içeren ZIP';}
  async function connection(){
    if(!window.SW_CONTEXT){status('Otomatik bağlantı için soyturkworks.com üzerinden bu firmayı açın. Taşınabilir dosyada Excel karşılaştırmasını kullanabilirsiniz.');$('swIziRun').disabled=true;$('swIziConnect').disabled=true;return;}
    try{const result=await (await api('status')).json();connected=result.connected;$('swIziConnection').textContent=connected?result.name+' · '+result.identifier:'Bu firma henüz bağlı değil';$('swIziSetup').open=!connected;$('swIziDisconnect').hidden=!connected;if(!result.configured)status('İzibiz bağlantı anahtarı sunucuda henüz tanımlı değil.');}catch(e){status(e.message);}
  }
  async function open(){
    if(!dialog)bootDialog();
    dialog.showModal();
    if(!running){
      const rows=window.SWInvoiceBridge.snapshot().rows,dates=rows.map(r=>String(r.tarih).split('.').reverse().join('-')).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
      $('swIziFrom').value=dates[0]||today().slice(0,8)+'01';$('swIziTo').value=dates.at(-1)||today();
      status('Eski işlenmiş Excel’i yükledikten sonra güncel listeyi ve yeni faturaları alabilirsiniz.');
      await connection();
      if(!directory)try{directory=await directoryStore();}catch{}
      destination();
    }
  }
  function bootDialog(){
    dialog=document.createElement('dialog');dialog.id='swIziDialog';dialog.className='sw-izi-dialog';dialog.setAttribute('aria-labelledby','swIziTitle');
    dialog.innerHTML=`<div class="sw-izi-heading"><div><small>GELEN E-FATURA</small><h2 id="swIziTitle">İzibiz · <span></span></h2></div><button type="button" id="swIziClose" aria-label="Kapat">×</button></div>
      <p>Eski Excel’inle güncel İzibiz listesini karşılaştır. Yeni faturaların PDF ve XML dosyalarını, güncel listeyi ve biçimlenmiş Excel’i firma klasöründe kaydet.</p>
      <p id="swIziConnection"></p>
      <details id="swIziSetup"><summary>Firma bağlantısı</summary><p>Bu firmanın mevcut İzibiz hesabını bir kez bağla. Bilgiler sunucuda şifreli tutulur; dışa aktardığın HTML ve Excel dosyalarına eklenmez.</p>
      <form id="swIziForm"><label>Firmanın VKN / TCKN bilgisi<input id="swIziTax" name="identifier" inputmode="numeric" pattern="[0-9]{10,11}" maxlength="11" required autocomplete="off"></label>
      <label>İzibiz kullanıcı adı<input id="swIziUser" name="username" required maxlength="200" autocomplete="username"></label>
      <label>Mevcut İzibiz şifresi<input id="swIziPassword" name="password" type="password" required maxlength="500" autocomplete="current-password"></label>
      <div class="sw-izi-actions"><button type="submit" id="swIziConnect">Bağlantıyı doğrula ve kaydet</button><button type="button" id="swIziDisconnect" hidden>Bağlantıyı kaldır</button></div></form></details>
      <fieldset id="swIziDates"><legend>Fatura tarihi aralığı</legend><div class="sw-izi-dates"><label>Başlangıç<input type="date" id="swIziFrom" required></label><label>Bitiş<input type="date" id="swIziTo" required></label></div></fieldset>
      <div class="sw-izi-actions"><button type="button" id="swIziFolder">İndirilenler klasörünü seç</button><button type="button" id="swIziZip">ZIP olarak indir</button></div><p id="swIziDestination"></p>
      <p class="sw-izi-status" id="swIziStatus" role="status" aria-live="polite"></p><div class="sw-izi-actions"><button type="button" id="swIziRun">İzibiz’den al ve kaydet</button><button type="button" id="swIziCancel" hidden>Durdur</button><button type="button" id="swIziSave" hidden>Hazırlanan ZIP’i indir</button></div>`;
    dialog.querySelector('#swIziTitle span').textContent=workspace.companyName;document.body.append(dialog);
    $('swIziClose').onclick=()=>{if(!running)dialog.close();};dialog.addEventListener('cancel',e=>{if(running)e.preventDefault();});
    $('swIziForm').onsubmit=async e=>{
      e.preventDefault();const button=$('swIziConnect');button.disabled=true;status('İzibiz hesabı, firma kimliği ve fatura okuma yetkisi kontrol ediliyor…');
      try{await api('connect',{username:$('swIziUser').value,password:$('swIziPassword').value,identifier:$('swIziTax').value});$('swIziPassword').value='';await connection();$('swIziSetup').open=false;status('Bağlantı doğrulandı. Bu firmanın faturalarını alabilirsiniz.');}catch(err){status(err.message);}finally{button.disabled=false;}
    };
    $('swIziDisconnect').onclick=async()=>{try{await api('disconnect',{});$('swIziPassword').value='';await connection();status('Bu firmanın bağlantısı kaldırıldı.');}catch(e){status(e.message);}};
    $('swIziFolder').hidden=!window.showDirectoryPicker;
    $('swIziFolder').onclick=async()=>{try{directory=await window.showDirectoryPicker({id:'sw-izibiz-downloads',startIn:'downloads',mode:'readwrite'});try{await directoryStore(directory);}catch{}destination();}catch(e){if(e.name!=='AbortError')status('Klasör seçilemedi. ZIP olarak indirebilirsiniz.');}};
    $('swIziZip').onclick=()=>{directory=null;directoryStore(null).catch(()=>{});destination();};
    $('swIziRun').onclick=run;$('swIziCancel').onclick=()=>controller?.abort();$('swIziSave').onclick=downloadZip;
  }
  function downloadZip(){if(!readyZip)return;const url=URL.createObjectURL(readyZip),anchor=document.createElement('a');anchor.href=url;anchor.download=saveName;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
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
  }
  const headers=['Fatura No','Tarih','Unvan','Ad Soyad','Tip','Tutar','Birim','Yanıt','Durum','Alıcı Bilgisi(PK)'];
  function gridFor(rows){return [headers,...rows.map(r=>[r.fatno,String(r.tarih||'').slice(0,10).split('-').reverse().join('.'),r.unvan,'',r.tip==='IADE'?'İade':r.tip,r.tutar,r.birim,r.yanit,r.isRet?'RET':'',''])];}
  async function run(){
    if(running)return;
    if(!connected){$('swIziSetup').open=true;status('Önce bu firmanın bağlantısını bir kez doğrulayın.');return;}
    const snapshot=window.SWInvoiceBridge.snapshot();
    if(!snapshot.reference){status('Önce eski işlenmiş Excel’i yükleyin. Faturalar bu dosyayla karşılaştırılacak.');return;}
    const startDate=$('swIziFrom').value,endDate=$('swIziTo').value;
    if(!startDate||!endDate||startDate>endDate){status('Geçerli başlangıç ve bitiş tarihlerini seçin.');return;}
    running=true;readyZip=null;$('swIziSave').hidden=true;controller=new AbortController();const signal=controller.signal;
    const controls=Array.from(dialog.querySelectorAll('input,button,fieldset')).filter(n=>n.id!=='swIziCancel'),states=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);$('swIziCancel').hidden=false;
    const locked=['step1','step2','efaturaClearBtn','tableWrap','bulkBtns'].map(id=>$(id)).filter(Boolean),inert=locked.map(n=>n.inert);locked.forEach(n=>n.inert=true);
    let target=null,stored=0,totalBytes=0;const zip=new JSZip(),runId=crypto.randomUUID(),runName=today()+'_'+new Date().toTimeString().slice(0,8).replaceAll(':','-')+'_'+runId.slice(0,8),folder=safe(workspace.companyName)+'/Gelen E-Faturalar/'+runName;
    async function write(name,bytes){
      signal.throwIfAborted();
      if(target){let parent=target;const parts=name.split('/');for(const part of parts.slice(0,-1))parent=await parent.getDirectoryHandle(part,{create:true});const file=await parent.getFileHandle(parts.at(-1),{create:true}),writer=await file.createWritable();try{await writer.write(bytes);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}}
      else{totalBytes+=bytes.byteLength||bytes.size||bytes.length;if(totalBytes>200*1024*1024)throw Error('ZIP 200 MB sınırına ulaştı. Klasör seçerek veya tarih aralığını daraltarak yeniden alın.');zip.file(folder+'/'+name,bytes);}
    }
    try{
      if(directory){if(await directory.queryPermission({mode:'readwrite'})!=='granted'&&await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('Klasöre yazma izni verilmedi. ZIP seçeneğini kullanabilirsiniz.');target=directory;for(const part of folder.split('/'))target=await target.getDirectoryHandle(part,{create:true});await write('Durum.txt','İŞLEM TAMAMLANMADI. İndirme sürüyor.\n');}
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
      if(!rows.length){status('Seçilen tarih aralığında gelen fatura yok. Mevcut Excel tablosu korundu.');if(target)await write('Durum.txt','TAMAMLANDI. Seçilen tarih aralığında fatura yok.\n');return;}
      const grid=gridFor(rows);window.SWInvoiceBridge.load(grid);
      const newNumbers=new Set(window.SWInvoiceBridge.snapshot().rows.filter(r=>!r.isRet&&!r.islendi).map(r=>norm(r.fatno))),fresh=rows.filter(r=>newNumbers.has(norm(r.fatno)));
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(grid),'Gelen Faturalar');
      await write('Guncel_Izibiz_Listesi.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}));
      const formatted=await window.SWInvoiceBridge.excel();await write(safe(formatted.name),formatted.bytes);
      for(let index=0;index<fresh.length;index++){
        const row=fresh[index],name=safe(row.fatno)+'_'+safe(row.uuid);
        status('Yeni faturalar indiriliyor · '+(index+1)+' / '+fresh.length+' · '+row.fatno);
        const xml=await documentBytes(await api('download',{ticket:row.ticket,format:'ubl'},signal),'ubl');verifyXml(xml,row,identifier);
        const pdf=await documentBytes(await api('download',{ticket:row.ticket,format:'pdf'},signal),'pdf');
        await write('XML/'+name+'.xml',xml);await write('PDF/'+name+'.pdf',pdf);stored++;
      }
      await write('Durum.txt','TAMAMLANDI\nFirma: '+workspace.companyName+'\nTarih aralığı: '+startDate+' – '+endDate+'\nListelenen fatura: '+rows.length+'\nYeni fatura: '+fresh.length+'\nPDF ve XML kaydedilen: '+stored+'\n');
      signal.throwIfAborted();
      if(target)status('Tamamlandı. '+stored+' yeni faturanın PDF/XML dosyaları ve iki Excel kaydedildi: '+directory.name+' / '+folder);
      else{status('Firma klasörü içeren ZIP hazırlanıyor…');readyZip=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});signal.throwIfAborted();saveName=safe(workspace.companyName)+'_Gelen_E-Faturalar_'+runName+'.zip';$('swIziSave').hidden=false;downloadZip();status(stored+' yeni faturanın PDF/XML dosyaları ve iki Excel ZIP olarak hazırlandı. Tarayıcının İndirilenler bölümünden kontrol edebilirsiniz.');}
    }catch(e){
      const message=e.name==='AbortError'?'İşlem durduruldu.':e.message;
      if(target)try{const file=await target.getFileHandle('Durum.txt',{create:true}),writer=await file.createWritable();await writer.write('İŞLEM TAMAMLANMADI\n'+message+'\nPDF ve XML çifti kaydedilen fatura: '+stored+'\n');await writer.close();}catch{}
      status(message+(target?' Klasörde kısmi dosyalar olabilir; Durum.txt dosyasına bakın.':' ZIP indirilmedi.'));
    }finally{running=false;controller=null;controls.forEach((n,i)=>n.disabled=states[i]);locked.forEach((n,i)=>n.inert=inert[i]);$('swIziCancel').hidden=true;}
  }
  function boot(){const button=document.createElement('button');button.type='button';button.id='swIziButton';button.textContent='İzibiz';button.onclick=open;const top=$('ef115Top');if(top)top.prepend(button);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
