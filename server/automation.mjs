import {randomUUID,createHash} from 'node:crypto';
import {IzibizConnector} from './izibiz.mjs';
import {folderName,excelName,safeName,makeExcel,unwrapDocument,supplierFromXML,streamZip} from './invoice-files.mjs';

const CHUNK=512*1024,MAX_BYTES=512*1024*1024;
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
const sha=s=>createHash('sha256').update(s).digest('hex');
export const localDate=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export function workHours(ms){const d=new Date(ms+3*3600000);return d.getUTCDay()>0&&d.getUTCDay()<6&&d.getUTCHours()>=9&&d.getUTCHours()<18;}
export function nextCheck(ms){let n=Math.floor(ms/3600000)*3600000+3600000;for(let i=0;i<200;i++,n+=3600000){const d=new Date(n+3*3600000);if(d.getUTCDay()>0&&d.getUTCDay()<6&&[9,11,13,15,17].includes(d.getUTCHours()))return n;}throw Error('Sonraki kontrol hesaplanamadı.');}
export function previousMonth(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,10);}
const disposition=name=>"attachment; filename=\"archive.zip\"; filename*=UTF-8''"+encodeURIComponent(name);
const fileKeys=file=>Array.from({length:file.parts},(_,i)=>'blob:'+file.id+':'+i);

export class InvoiceArchive{
  constructor({storage,company,getConnection,notify,now=()=>Date.now()}){
    Object.assign(this,{storage,company,getConnection,notify,now});this.busy=false;
  }
  async all(){return [...(await this.storage.list({prefix:'invoice:'})).values()];}
  async settings(){return await this.storage.get('settings')||{enabled:true};}
  async status(){return await this.storage.get('status')||{};}
  async connector(){
    const {saved,key,active}=await this.getConnection(this.company.id);
    if(!active)fail('Firma etkin değil.',403);
    if(!saved)fail('Bu firmanın İzibiz bağlantısı henüz kayıtlı değil.',409);
    const base=this.storage,company=this.company.id;
    const storage={get:k=>k==='izibiz:config:'+company?Promise.resolve(saved):base.get(k),put:(k,v)=>base.put(k,v),delete:k=>base.delete(k)};
    return {connector:new IzibizConnector({storage,key,now:this.now}),identifier:saved.identifier};
  }
  async start(manual=false){
    const settings=await this.settings();if(!manual&&!settings.enabled)return {skipped:true};
    if(await this.storage.get('job'))return {running:true};
    const state=await this.status();if(state.lastAttempt&&this.now()-state.lastAttempt<300000){if(manual)fail('Yeni kontrolü beş dakika sonra başlatabilirsiniz.',429);return {skipped:true};}
    for(const row of (await this.all()).filter(r=>r.pdfError&&!r.file&&!r.deletedAt))await this.storage.put('invoice:'+row.uuid,{...row,pdfAttempts:0,pdfError:null});
    const date=localDate(this.now()),start=state.lastSuccess?localDate(state.lastSuccess-2*86400000):previousMonth(date);
    await this.storage.put('job',{id:randomUUID(),manual,phase:'delivery',page:0,start,end:date,documentStart:previousMonth(date),started:this.now(),attempts:0,received:0,seen:[]});
    await this.storage.put('status',{...state,lastAttempt:this.now(),error:null,progress:'İzibiz listesi bekleniyor'});
    await this.storage.setAlarm(this.now()+1000);return {running:true};
  }
  async saveFile(id,name,bytes,transaction=this.storage){
    const file={id,name,size:bytes.byteLength,parts:Math.ceil(bytes.byteLength/CHUNK)};
    for(let i=0;i<file.parts;i++)await transaction.put('blob:'+id+':'+i,bytes.slice(i*CHUNK,(i+1)*CHUNK));
    return file;
  }
  async removeFile(file){if(!file)return;const keys=fileKeys(file);for(let i=0;i<keys.length;i+=100)await this.storage.delete(keys.slice(i,i+100));}
  async *chunks(file){for(let i=0;i<file.parts;i++){const bytes=await this.storage.get('blob:'+file.id+':'+i);if(!bytes)throw Error('Arşiv dosyasının bir bölümü okunamadı.');yield bytes;}}
  async advance(){
    if(this.busy)return;this.busy=true;
    try{
      const deleted=(await this.all()).filter(r=>r.deletedAt&&r.file).slice(0,2);
      for(const row of deleted){await this.removeFile(row.file);await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);if(current?.file?.id===row.file.id){await tx.put('invoice:'+row.uuid,{...current,file:null});await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-row.file.size));}});}
      let job=await this.storage.get('job');if(!job){if(deleted.length)await this.storage.setAlarm(this.now()+1000);return;}
      if(!(await this.settings()).enabled&&!job.manual){await this.storage.delete('job');return;}
      const {connector,identifier}=await this.connector();
      if(job.phase!=='pdf'){
        const body={run:job.id,page:job.page,startDate:job.phase==='delivery'?job.start:job.documentStart,endDate:job.end,dateType:job.phase==='delivery'?'DELIVERY':'DOCUMENT'};
        const result=await(await connector.handle(this.company.id,'list','POST',body)).json();
        const expectedKey=job.phase+'Total';if(job[expectedKey]!==undefined&&job[expectedKey]!==result.total)throw Error('Liste kontrol sırasında değişti; sonraki kontrolde yeniden denenecek.');
        job[expectedKey]=result.total;
        const seen=new Set(job.seen||[]);
        for(const incoming of result.rows){
          if(seen.has(incoming.uuid.toLowerCase()))throw Error('Liste aynı faturayı birden çok kez içeriyor.');seen.add(incoming.uuid.toLowerCase());
          const uuid=incoming.uuid.toLowerCase(),key='invoice:'+uuid;
          await this.storage.transaction(async tx=>{
            const current=await tx.get(key),baseline=await tx.get('baseline:'+sha(incoming.fatno.replace(/\s/g,'').toLocaleUpperCase('tr')));
            if(current&&(current.fatno!==incoming.fatno||current.tarih!==incoming.tarih))fail('Aynı ETTN için fatura kimliği değişti.',409);
            const {ticket,...data}=incoming;
            await tx.put(key,{...data,unvan:current?.file?current.unvan:data.unvan,uuid,firstSeen:current?.firstSeen||this.now(),done:current?.done??!!baseline,revision:current?.revision||0,file:current?.file||null,folder:current?.folder||null,deletedAt:current?.deletedAt||null,notified:current?.notified||false,pdfError:current?.pdfError||null,pdfAttempts:current?.pdfAttempts||0,...current?.doneAt?{doneAt:current.doneAt}:{}});
          });
          job.received++;
        }
        job.page++;job.attempts=0;job.seen=[...seen];
        if(job.page>=result.pages){if(seen.size!==result.total)throw Error('Listenin tamamı alınamadı.');if(job.phase==='delivery'){job.phase='document';job.page=0;job.seen=[];}else{job.phase='pdf';job.seen=[];}}
        await this.storage.put('job',job);
        await this.storage.put('status',{...await this.status(),progress:job.phase==='pdf'?'Yeni PDF’ler hazırlanıyor':(job.phase==='delivery'?'Geliş tarihleri':'Önceki ve güncel ay')+' · sayfa '+(job.page+1)});
        await this.storage.setAlarm(this.now()+1000);return;
      }
      const todos=(await this.all()).filter(r=>!r.file&&!r.deletedAt&&!r.isRet&&(r.pdfAttempts||0)<3).slice(0,2);
      for(const row of todos){
        try{
          const saved=(await this.getConnection(this.company.id)).saved,config=connector.unseal(this.company.id,saved),ticket=connector.ticket(this.company.id,config,row);
          const xml=unwrapDocument(await(await connector.handle(this.company.id,'download','POST',{ticket,format:'ubl'})).arrayBuffer(),'ubl');
          const title=supplierFromXML(xml,row,identifier),bytes=unwrapDocument(await(await connector.handle(this.company.id,'download','POST',{ticket,format:'pdf'})).arrayBuffer(),'pdf');
          const date=localDate(this.now()),month=row.tarih.slice(0,7),baseFolder=month+'_'+date;
          await this.storage.transaction(async tx=>{
            const current=await tx.get('invoice:'+row.uuid);if(current.deletedAt||current.file)return;
            const used=await tx.get('totalBytes')||0;if(used+bytes.byteLength>MAX_BYTES)fail('Firma arşivi 512 MB sınırına ulaştı. Kullanmadığınız klasörleri silin.',507);
            const file=await this.saveFile('pdf-'+row.uuid,safeName(title+' - '+row.fatno)+'.pdf',bytes,tx);
            let folder=await tx.get('active-folder:'+baseFolder)||baseFolder,group=await tx.get('folder:'+folder);
            if(group?.deletedAt){folder=baseFolder+'_'+randomUUID().slice(0,8);group=null;}
            group=group||{id:folder,month,date,created:this.now(),revision:0};
            await tx.put('active-folder:'+baseFolder,folder);
            await tx.put('invoice:'+row.uuid,{...current,unvan:title,file,folder,pdfError:null,pdfAttempts:0});
            await tx.put('folder:'+folder,{...group,revision:group.revision+1});await tx.put('totalBytes',used+bytes.byteLength);
          });
        }catch(e){
          await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);if(current&&!current.deletedAt)await tx.put('invoice:'+row.uuid,{...current,pdfAttempts:(current.pdfAttempts||0)+1,pdfError:e.message});});
        }
      }
      if(todos.length){await this.storage.setAlarm(this.now()+2000);return;}
      const rows=await this.all(),unnotified=rows.filter(r=>r.file&&!r.deletedAt&&!r.notified&&!r.isRet),fresh=unnotified.filter(r=>!r.done),errors=rows.filter(r=>!r.deletedAt&&!r.file&&!r.isRet&&r.pdfError);
      if(fresh.length){
        const id=sha(this.company.id+':'+fresh.map(r=>r.uuid).sort().join(','));
        const pending=rows.filter(r=>!r.deletedAt&&!r.done&&!r.isRet).length;
        const months=[...new Set(fresh.map(r=>r.tarih.slice(0,7)))];
        await this.notify({id,company:this.company.id,title:this.company.name+' · '+fresh.length+' yeni fatura',body:fresh.length+' yeni faturanın PDF’i hazır. İşlem bekleyen toplam: '+pending+'.'+(months.length>1?' '+months.length+' farklı aya ait fatura var.':'')+' Kontrol etmek için dokun.',url:'/takip?company='+this.company.id+'&view=invoices',kind:'invoices',count:fresh.length,pending,created:this.now()});
        }
      for(const row of unnotified)await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);if(current)await tx.put('invoice:'+row.uuid,{...current,notified:true});});
      if(errors.length)await this.notify({id:sha(this.company.id+':pdf-error:'+localDate(this.now())),company:this.company.id,title:this.company.name+' · '+errors.length+' PDF hazırlanamadı',body:'Faturalar listede duruyor. Sonraki kontrolde tekrar denenecek. Detayları görmek için dokun.',url:'/takip?company='+this.company.id+'&view=invoices',kind:'error',created:this.now()});
      await this.storage.put('status',{...await this.status(),lastSuccess:errors.length?(await this.status()).lastSuccess||null:this.now(),lastFinished:this.now(),error:errors.length?errors.length+' faturanın PDF’i hazırlanamadı. Şimdi kontrol et ile yeniden deneyebilirsiniz.':null,progress:null});
      await this.storage.delete('job');
    }catch(e){
      const job=await this.storage.get('job');
      await this.storage.put('status',{...await this.status(),error:e.status?e.message:'İzibiz kontrolü tamamlanamadı. Bağlantı veya belge doğrulamasında hata oluştu.',progress:null});
      if(job&&job.attempts<2){await this.storage.put('job',{...job,attempts:job.attempts+1});await this.storage.setAlarm(this.now()+30000);}else{
        await this.storage.delete('job');
        const errorText=e.status?e.message:'İzibiz bağlantısı veya belge doğrulaması tamamlanamadı.';
        await this.notify({id:sha(this.company.id+':error:'+localDate(this.now())+':'+errorText),company:this.company.id,title:this.company.name+' · Kontrol tamamlanamadı',body:errorText+' Sonuç “yeni fatura yok” olarak kaydedilmedi. Detayları görmek için dokun.',url:'/takip?company='+this.company.id,kind:'error',created:this.now()});
      }
    }finally{this.busy=false;}
  }
  async summary(){
    const rows=(await this.all()).filter(r=>!r.deletedAt),folders=[...(await this.storage.list({prefix:'folder:'})).values()].filter(f=>!f.deletedAt);
    return {company:this.company,settings:await this.settings(),status:await this.status(),running:!!await this.storage.get('job'),nextCheck:nextCheck(this.now()),counts:{total:rows.length,fresh:rows.filter(r=>!r.done&&!r.isRet).length,done:rows.filter(r=>r.done).length,pdfs:rows.filter(r=>r.file).length,errors:rows.filter(r=>r.pdfError&&!r.file).length,folders:folders.length},bytes:await this.storage.get('totalBytes')||0,capacity:MAX_BYTES};
  }
  async handle(action,method,body={},params=new URLSearchParams()){
    if(action==='summary'&&method==='GET')return json(await this.summary());
    if(action==='scan'&&method==='POST'){
      return json(await this.start(true));
    }
    if(action==='tick'&&method==='POST')return json(await this.start(false));
    if(action==='settings'&&method==='POST'){if(typeof body.enabled!=='boolean')fail('Geçersiz otomasyon ayarı.');await this.storage.put('settings',{...await this.settings(),enabled:body.enabled});if(!body.enabled)await this.storage.delete('job');return json({ok:true});}
    if(action==='invoices'&&method==='GET'){
      let rows=(await this.all()).filter(r=>!r.deletedAt);
      if(params.get('month'))rows=rows.filter(r=>r.tarih.startsWith(params.get('month')));
      if(params.get('folder'))rows=rows.filter(r=>r.folder===params.get('folder'));
      if(params.get('status')==='new')rows=rows.filter(r=>!r.done&&!r.isRet);if(params.get('status')==='done')rows=rows.filter(r=>r.done);
      const q=(params.get('q')||'').toLocaleUpperCase('tr');if(q)rows=rows.filter(r=>(r.fatno+' '+r.unvan).toLocaleUpperCase('tr').includes(q));
      rows.sort((a,b)=>b.firstSeen-a.firstSeen||b.tarih.localeCompare(a.tarih)||a.uuid.localeCompare(b.uuid));
      const offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0)),limit=100;
      return json({total:rows.length,rows:rows.slice(offset,offset+limit).map(r=>{const {file,...data}=r;return {...data,pdfReady:!!file};}),months:[...new Set((await this.all()).filter(r=>!r.deletedAt).map(r=>r.tarih.slice(0,7)))].sort().reverse()});
    }
    if(action==='mark'&&method==='POST'){
      if(!Array.isArray(body.items)||!body.items.length||body.items.length>100||new Set(body.items.map(x=>x?.uuid)).size!==body.items.length||typeof body.done!=='boolean')fail('En fazla 100 fatura seçin.');
      const result=await this.storage.transaction(async tx=>{
        const changes=[];for(const item of body.items){
          if(typeof item.uuid!=='string'||!/^[a-f0-9-]{36}$/.test(item.uuid))fail('Fatura kimliği geçersiz.');
          const key='invoice:'+item.uuid,row=await tx.get(key);if(!row||row.deletedAt)fail('Fatura bulunamadı.',404);if(row.isRet)fail('Reddedilmiş fatura işlenmiş olarak işaretlenemez.');
          if(item.revision!==row.revision)fail('Bu fatura başka bir ekranda değişti. Listeyi yenileyin.',409);
          changes.push({key,row});
        }
        const out=[];for(const {key,row} of changes){const updated={...row,done:body.done,doneAt:body.done?this.now():null,revision:row.revision+1};await tx.put(key,updated);if(row.folder){const group=await tx.get('folder:'+row.folder);if(group)await tx.put('folder:'+row.folder,{...group,revision:group.revision+1});}out.push({uuid:row.uuid,revision:updated.revision});}
        const audit=await tx.get('audit')||[];audit.unshift({at:this.now(),done:body.done,invoices:changes.map(x=>x.row.fatno)});await tx.put('audit',audit.slice(0,100));return out;
      });return json({ok:true,items:result});
    }
    if(action==='baseline'&&method==='POST'){
      if(!Array.isArray(body.numbers)||body.numbers.length>300||!body.numbers.every(x=>typeof x==='string'&&x.length>0&&x.length<100))fail('Geçersiz başlangıç listesi.');
      const numbers=new Set(body.numbers.map(n=>n.replace(/\s/g,'').toLocaleUpperCase('tr')));
      for(const n of numbers)await this.storage.put('baseline:'+sha(n),{at:this.now()});
      const matches=(await this.all()).filter(r=>!r.deletedAt&&!r.done&&!r.isRet&&numbers.has(r.fatno.replace(/\s/g,'').toLocaleUpperCase('tr')));
      for(const row of matches)await this.handle('mark','POST',{done:true,items:[{uuid:row.uuid,revision:row.revision}]});
      return json({ok:true,matched:matches.length});
    }
    if(action==='folders'&&method==='GET'){
      const rows=await this.all(),groups=[...(await this.storage.list({prefix:'folder:'})).values()].filter(f=>!f.deletedAt).map(f=>({...f,name:folderName(this.company.name,f.month,f.date),pdfs:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&r.file).length,pending:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&!r.done&&!r.isRet).length,excel:f.excel?{name:f.excel.name,at:f.excelAt,current:f.excelRevision===f.revision}:null}));
      return json({folders:groups.sort((a,b)=>b.date.localeCompare(a.date)||b.month.localeCompare(a.month))});
    }
    if(action==='audit'&&method==='GET')return json({events:await this.storage.get('audit')||[]});
    if(action==='delete-folder'&&method==='POST'){
      const group=await this.storage.get('folder:'+body.folder);if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);
      await this.storage.put('folder:'+group.id,{...group,deletedAt:this.now(),excel:null});
      if(group.excel){await this.removeFile(group.excel);await this.storage.transaction(async tx=>{await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-group.excel.size));});}
      for(const row of (await this.all()).filter(r=>r.folder===group.id&&!r.deletedAt))await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);await tx.put('invoice:'+row.uuid,{...current,deletedAt:this.now()});});
      await this.storage.setAlarm(this.now()+1000);return json({ok:true});
    }
    if(action==='excel'&&method==='POST'){
      const group=await this.storage.get('folder:'+body.folder);if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);
      const rows=(await this.all()).filter(r=>r.folder===group.id&&!r.deletedAt).sort((a,b)=>a.tarih.localeCompare(b.tarih)||a.fatno.localeCompare(b.fatno));
      const bytes=makeExcel(this.company.name,group.month,localDate(this.now()),rows),name=excelName(this.company.name,group.month,localDate(this.now()));
      await this.storage.transaction(async tx=>{const current=await tx.get('folder:'+group.id);if(current.deletedAt||current.revision!==group.revision)fail('Faturalar değişti. Excel’i yeniden hazırlayın.',409);const used=await tx.get('totalBytes')||0;if(used+bytes.length>MAX_BYTES)fail('Arşiv dolu.',507);const file=await this.saveFile('excel-'+randomUUID(),name,bytes,tx);await tx.put('folder:'+group.id,{...current,excel:file,excelAt:this.now(),excelRevision:current.revision});await tx.put('totalBytes',used+bytes.length);});
      if(group.excel){await this.removeFile(group.excel);await this.storage.transaction(async tx=>{await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-group.excel.size));});}
      return json({ok:true,name});
    }
    if(action==='pdf'&&method==='GET'){
      const row=await this.storage.get('invoice:'+params.get('id'));if(!row||row.deletedAt||!row.file)fail('PDF bulunamadı.',404);
      const chunks=this.chunks(row.file),stream=new ReadableStream({async pull(controller){const {value,done}=await chunks.next();if(done)controller.close();else controller.enqueue(value);},cancel(){return chunks.return();}});
      return new Response(stream,{headers:{'Content-Type':'application/pdf','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(row.file.name),'Cache-Control':'private, no-store'}});
    }
    if(action==='export'&&method==='GET'){
      const group=await this.storage.get('folder:'+params.get('folder'));if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);
      if(params.get('excel')==='1'){
        if(!group.excel)fail('Önce Excel’i hazırlayın.',409);
        const chunks=this.chunks(group.excel),stream=new ReadableStream({async pull(c){const {value,done}=await chunks.next();if(done)c.close();else c.enqueue(value);},cancel(){return chunks.return();}});
        return new Response(stream,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':disposition(group.excel.name),'Cache-Control':'private, no-store'}});
      }
      const root=folderName(this.company.name,group.month,group.date),rows=(await this.all()).filter(r=>r.folder===group.id&&!r.deletedAt&&r.file),names=new Set();
      const entries=rows.map(r=>{let name=r.file.name;if(names.has(name))name=safeName(name.replace(/\.pdf$/i,'')).slice(0,130)+' - '+r.uuid+'.pdf';names.add(name);return {name:root+'/'+name,file:r.file};});
      if(group.excel)entries.push({name:root+'/'+group.excel.name,file:group.excel});
      return new Response(streamZip(entries,file=>this.chunks(file)),{headers:{'Content-Type':'application/zip','Content-Disposition':disposition(root+'.zip'),'Cache-Control':'private, no-store'}});
    }
    return json({error:'İşlem bulunamadı.'},404);
  }
}
