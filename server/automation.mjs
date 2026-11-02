import {randomUUID,createHash} from 'node:crypto';
import {IzibizConnector,invoiceTypeLabel} from './izibiz.mjs';
import {invoiceState,recentInvoiceDate} from './invoice-state.mjs';
import {folderName,excelName,safeName,makeExcel,unwrapDocument,supplierFromXML,streamZip} from './invoice-files.mjs';
import {notificationMonthCounts,formatNotificationMonths} from './notification-format.mjs';

const CHUNK=512*1024,MAX_BYTES=512*1024*1024;
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
const sha=s=>createHash('sha256').update(s).digest('hex');
export const localDate=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export function workHours(ms){const d=new Date(ms+3*3600000);return d.getUTCDay()>0&&d.getUTCDay()<6&&d.getUTCHours()>=9&&d.getUTCHours()<18;}
export function nextCheck(ms){let n=Math.floor(ms/3600000)*3600000+3600000;for(let i=0;i<200;i++,n+=3600000){const d=new Date(n+3*3600000);if(d.getUTCDay()>0&&d.getUTCDay()<6&&[9,11,13,15,17].includes(d.getUTCHours()))return n;}throw Error('Sonraki kontrol hesaplanamadı.');}
export function previousMonth(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,10);}
export function trackingPeriod(date,startMonth){return {startMonth,from:[startMonth+'-01',previousMonth(date),recentInvoiceDate(date)].sort().at(-1),to:date};}
const disposition=name=>"attachment; filename=\"archive.zip\"; filename*=UTF-8''"+encodeURIComponent(name);
const fileKeys=file=>Array.from({length:file.parts},(_,i)=>'blob:'+file.id+':'+i);

export class InvoiceArchive{
  constructor({storage,company,getConnection,notify,now=()=>Date.now()}){
    Object.assign(this,{storage,company,getConnection,notify,now});this.busy=false;
  }
  async all(){return [...(await this.storage.list({prefix:'invoice:'})).values()];}
  async settings(){return await this.storage.get('settings')||{enabled:true};}
  async status(){return await this.storage.get('status')||{};}
  async jobCurrent(job,storage=this.storage){const current=await storage.get('job');return current?.id===job.id&&(current.generation||0)===(job.generation||0);}
  async requireJob(job,storage=this.storage){if(!await this.jobCurrent(job,storage))throw Object.assign(Error('İş iptal edildi.'),{cancelled:true});}
  async clearAll(){
    return this.storage.transaction(async tx=>{
      const rows=[...(await tx.list({prefix:'invoice:'})).values()],folders=[...(await tx.list({prefix:'folder:'})).values()],keys=new Set(['job','audit','izibiz:scan:'+this.company.id]);
      for(const row of rows){
        if(row.file)for(const key of fileKeys(row.file))keys.add(key);
        await tx.put('seen:'+row.uuid,{firstSeen:row.firstSeen||this.now(),done:!!row.done,manualOverride:!!row.manualOverride,published:true});
      }
      for(const folder of folders)if(folder.excel)for(const key of fileKeys(folder.excel))keys.add(key);
      for(const [key,excel] of await tx.list({prefix:'monthly-excel:'})){keys.add(key);for(const part of fileKeys(excel.file))keys.add(part);}
      for(const prefix of ['invoice:','folder:','active-folder:','month-revision:'])for(const key of (await tx.list({prefix})).keys())keys.add(key);
      const list=[...keys];for(let i=0;i<list.length;i+=100)await tx.delete(list.slice(i,i+100));
      const generation=(await tx.get('archive-generation')||0)+1;await tx.put('archive-generation',generation);await tx.put('totalBytes',0);await tx.put('status',{clearedAt:this.now(),error:null,progress:null});
      return {ok:true,generation};
    });
  }
  async period(initialize=false){
    const date=localDate(this.now());
    let settings=await this.settings();
    if(!settings.startMonth||settings.periodVersion!==1){
      let cleanup=false;
      await this.storage.transaction(async tx=>{
        settings=await tx.get('settings')||{enabled:true};
        if(settings.startMonth&&settings.periodVersion===1)return;
        const rows=[...(await tx.list({prefix:'invoice:'})).values()],baselines=[...(await tx.list({prefix:'baseline:'})).values()],state=await tx.get('status')||{},job=await tx.get('job');
        // Establish the first tracking month from collection/import time, never invoice dates.
        const times=[...rows.map(r=>r.firstSeen),...baselines.map(b=>b.at),state.lastSuccess,...(state.lastSuccess?[state.lastFinished,job?.started]:[])].filter(t=>Number.isFinite(t)&&t>0&&t<=this.now());
        const startMonth=settings.startMonth||localDate(times.length?Math.min(...times):this.now()).slice(0,7);
        settings={...settings,startMonth,periodVersion:1};
        if(!initialize&&!times.length&&!rows.length)return;
        for(const row of rows.filter(r=>r.tarih<startMonth+'-01'&&!r.deletedAt)){
          await tx.put('invoice:'+row.uuid,{...row,deletedAt:this.now(),excludedBeforeStart:true});cleanup=true;
        }
        for(const group of (await tx.list({prefix:'folder:'})).values())if(group.month<startMonth&&!group.deletedAt){await tx.put('folder:'+group.id,{...group,deletedAt:this.now(),excludedBeforeStart:true});cleanup=true;}
        await tx.put('settings',settings);
      });
      if(cleanup)await this.storage.setAlarm(this.now()+1000);
    }
    await this.reconcileWorkflow();
    return trackingPeriod(date,settings.startMonth);
  }
  async reconcileWorkflow(){
    const date=localDate(this.now());
    await this.storage.transaction(async tx=>{
      const settings=await tx.get('settings');if(!settings?.startMonth)return;
      const migrate=settings.workflowVersion!==2;if(!migrate&&settings.workflowDay===date)return;
      for(const row of (await tx.list({prefix:'invoice:'})).values()){
        const baseline=row.fatno?await tx.get('baseline:'+sha(row.fatno.replace(/\s/g,'').toLocaleUpperCase('tr'))):null;
        const done=migrate&&baseline?true:!!row.done,arrivalState=migrate||invoiceState(row,date)==='waiting'||row.arrivalState==='new'&&row.tarih<recentInvoiceDate(date)?'waiting':row.arrivalState;
        if(migrate||row.done!==done||row.arrivalState!==arrivalState){
          await tx.put('invoice:'+row.uuid,{...row,done,arrivalState,published:migrate?true:row.published,revision:(row.revision||0)+1});
          if(!row.deletedAt){const key='month-revision:'+row.tarih.slice(0,7);await tx.put(key,(await tx.get(key)||0)+1);}
        }
        if(migrate)await tx.put('seen:'+row.uuid,{firstSeen:row.firstSeen||this.now(),done,manualOverride:!!row.manualOverride,published:true});
      }
      await tx.put('settings',{...settings,workflowVersion:2,workflowDay:date});
    });
  }
  async refreshMonthlyExcels(job){
    const {generation,rows,versions}=await this.storage.transaction(async tx=>{
      if(job)await this.requireJob(job,tx);
      const generation=await tx.get('archive-generation')||0,rows=[...(await tx.list({prefix:'invoice:'})).values()].filter(r=>!r.deletedAt),versions={};
      for(const month of new Set(rows.map(r=>r.tarih.slice(0,7))))versions[month]=await tx.get('month-revision:'+month)||0;
      for(const [key,excel] of await tx.list({prefix:'monthly-excel:'}))if(!(excel.month in versions)){
        await tx.delete(fileKeys(excel.file));await tx.delete(key);await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-excel.file.size));
      }
      return {generation,rows,versions};
    }),date=localDate(this.now());
    for(const month of Object.keys(versions)){
      const key='monthly-excel:'+month,revision=versions[month],previous=await this.storage.get(key);
      if(previous?.revision===revision)continue;
      const monthly=rows.filter(r=>r.tarih.startsWith(month)).sort((a,b)=>a.tarih.localeCompare(b.tarih)||a.fatno.localeCompare(b.fatno));
      const bytes=makeExcel(this.company.name,month,date,monthly),name=excelName(this.company.name,month,date);
      await this.storage.transaction(async tx=>{
        if(job)await this.requireJob(job,tx);
        if((await tx.get('archive-generation')||0)!==generation||(await tx.get('month-revision:'+month)||0)!==revision)return;
        const current=await tx.get(key);if(current?.revision===revision)return;
        const used=(await tx.get('totalBytes')||0)-(current?.file.size||0);if(used+bytes.length>MAX_BYTES)fail('Firma arşivi dolu. Excel güncellenemedi.',507);
        if(current?.file)await tx.delete(fileKeys(current.file));
        const file=await this.saveFile('monthly-excel-'+randomUUID(),name,bytes,tx);await tx.put(key,{month,revision,file,at:this.now()});await tx.put('totalBytes',used+bytes.length);
      });
    }
  }
  async publishArrivals(job){
    const date=localDate(this.now());
    await this.storage.transaction(async tx=>{
      await this.requireJob(job,tx);const rows=[...(await tx.list({prefix:'invoice:'})).values()];
      const candidates=rows.filter(r=>!r.deletedAt&&!r.isRet&&!r.done&&r.file&&!r.published&&r.tarih>=recentInvoiceDate(date)),months=new Set(candidates.map(r=>r.tarih.slice(0,7))),ids=new Set(candidates.map(r=>r.uuid));
      for(const row of rows){
        const isNew=ids.has(row.uuid);if(!isNew&&!(months.has(row.tarih.slice(0,7))&&row.arrivalState==='new'&&row.arrivalBatch!==job.id))continue;
        const updated={...row,arrivalState:isNew?'new':'waiting',published:true,arrivalBatch:isNew?job.id:row.arrivalBatch,revision:(row.revision||0)+1};
        await tx.put('invoice:'+row.uuid,updated);await tx.put('seen:'+row.uuid,{...await tx.get('seen:'+row.uuid),published:true});
        const key='month-revision:'+row.tarih.slice(0,7);await tx.put(key,(await tx.get(key)||0)+1);
      }
    });
  }
  async connector(){
    const {saved,key,active}=await this.getConnection(this.company.id);
    if(!active)fail('Firma etkin değil.',403);
    if(!saved)fail('Bu firmanın İzibiz bağlantısı henüz kayıtlı değil.',409);
    const base=this.storage,company=this.company.id;
    const storage={get:k=>k==='izibiz:config:'+company?Promise.resolve(saved):base.get(k),put:(k,v)=>base.put(k,v),delete:k=>base.delete(k)};
    return {connector:new IzibizConnector({storage,key,now:this.now}),identifier:saved.identifier};
  }
  async queueTypeRefresh(rows){
    const generation=await this.storage.get('archive-generation')||0;
    const missing=rows.filter(r=>r.profile===undefined);
    if(!missing.length||await this.storage.get('job'))return;
    const state=await this.status();if(state.typeRefreshAttempt&&this.now()-state.typeRefreshAttempt<300000)return;
    const connection=await this.getConnection(this.company.id);if(!connection.saved||!connection.active)return;
    let queued=false;
    await this.storage.transaction(async tx=>{
      if(await tx.get('job')||(await tx.get('archive-generation')||0)!==generation)return;
      const pending=[...(await tx.list({prefix:'invoice:'})).values()].filter(r=>!r.deletedAt&&r.profile===undefined);if(!pending.length)return;
      const scan=await tx.get('izibiz:scan:'+this.company.id);
      await tx.put('job',{id:scan&&this.now()-scan.started<300000?scan.run:randomUUID(),generation,metadataOnly:true,months:[...new Set(pending.map(r=>r.tarih.slice(0,7)))].sort(),monthIndex:0,page:0,seen:[],attempts:0,started:this.now()});
      await tx.put('status',{...await tx.get('status'),typeRefreshAttempt:this.now(),typeRefreshError:null,progress:'Fatura senaryoları güncelleniyor'});queued=true;
    });
    if(queued)await this.storage.setAlarm(this.now()+1000);
  }
  async advanceTypes(job){
    const month=job.months[job.monthIndex],startDate=month+'-01',monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),endDate=[monthEnd,localDate(this.now())].sort()[0];
    const {connector}=await this.connector(),result=await(await connector.handle(this.company.id,'list','POST',{run:job.id,page:job.page,startDate,endDate,dateType:'DOCUMENT'})).json();
    await this.requireJob(job);
    if(job.total!==undefined&&job.total!==result.total)throw Error('Fatura listesi güncelleme sırasında değişti.');
    job.total=result.total;const seen=new Set(job.seen);
    for(const incoming of result.rows){
      const uuid=incoming.uuid.toLowerCase();if(seen.has(uuid))throw Error('Fatura listesinde mükerrer kayıt var.');seen.add(uuid);
      await this.storage.transaction(async tx=>{
        await this.requireJob(job,tx);
        const row=await tx.get('invoice:'+uuid);if(!row||row.deletedAt||!row.tarih.startsWith(month))return;
        if(row.fatno!==incoming.fatno||row.tarih!==incoming.tarih)fail('Fatura kimliği değişti.',409);
        if(row.profile!==incoming.profile||row.tip!==incoming.tip){const key='month-revision:'+month;await tx.put(key,(await tx.get(key)||0)+1);}
        await tx.put('invoice:'+uuid,{...row,profile:incoming.profile,tip:incoming.tip});
      });
    }
    job.page++;job.seen=[...seen];job.attempts=0;
    if(job.page>=result.pages){
      if(seen.size!==result.total)throw Error('Fatura listesinin tamamı alınamadı.');
      // A record no longer returned by the portal has an unknown scenario, never an assumed one.
      for(const row of (await this.all()).filter(r=>!r.deletedAt&&r.tarih.startsWith(month)&&r.profile===undefined))await this.storage.transaction(async tx=>{await this.requireJob(job,tx);const current=await tx.get('invoice:'+row.uuid);if(current&&!current.deletedAt&&current.profile===undefined)await tx.put('invoice:'+row.uuid,{...current,profile:''});});
      job.monthIndex++;job.page=0;job.seen=[];delete job.total;
    }
    await this.storage.transaction(async tx=>{await this.requireJob(job,tx);if(job.monthIndex>=job.months.length){await tx.delete('job');await tx.put('status',{...await tx.get('status'),progress:null,typeRefreshError:null});}else await tx.put('job',job);});
    if(job.monthIndex<job.months.length)await this.storage.setAlarm(this.now()+1000);else await this.refreshMonthlyExcels();
  }
  async start(manual=false,cycleId=null){
    const generation=await this.storage.get('archive-generation')||0;
    const settings=await this.settings();if(!manual&&!settings.enabled)return {skipped:true,reason:'disabled'};
    await this.connector();
    const period=await this.period(true);
    const result=await this.storage.transaction(async tx=>{
      if((await tx.get('archive-generation')||0)!==generation)return {skipped:true,reason:'generation'};
      const existing=await tx.get('job');if(existing){if(existing.metadataOnly)return {skipped:true,reason:'metadata'};if(cycleId&&!existing.cycleId)await tx.put('job',{...existing,cycleId});return {running:true};}
      const state=await tx.get('status')||{};if(state.lastAttempt&&this.now()-state.lastAttempt<300000){if(manual)fail('Yeni kontrolü beş dakika sonra başlatabilirsiniz.',429);return {skipped:true,reason:'recent'};}
      for(const row of (await tx.list({prefix:'invoice:'})).values())if(row.pdfError&&!row.file&&!row.deletedAt&&row.tarih>=period.from&&row.tarih<=period.to)await tx.put('invoice:'+row.uuid,{...row,pdfAttempts:0,pdfError:null});
      const start=state.lastSuccess?[period.from,localDate(state.lastSuccess-2*86400000)].sort().at(-1):period.from;
      await tx.put('job',{id:randomUUID(),generation,manual,cycleId:manual?null:cycleId,phase:'delivery',page:0,start,end:period.to,documentStart:period.from,periodVersion:2,started:this.now(),attempts:0,received:0,seen:[]});
      await tx.put('status',{...state,lastAttempt:this.now(),error:null,progress:'İzibiz listesi bekleniyor'});return {running:true};
    });
    if(result.running)await this.storage.setAlarm(this.now()+1000);return result;
  }
  async saveFile(id,name,bytes,transaction=this.storage){
    const file={id,name,size:bytes.byteLength,parts:Math.ceil(bytes.byteLength/CHUNK)};
    for(let i=0;i<file.parts;i++)await transaction.put('blob:'+id+':'+i,bytes.slice(i*CHUNK,(i+1)*CHUNK));
    return file;
  }
  async removeFile(file){if(!file)return;const keys=fileKeys(file);for(let i=0;i<keys.length;i+=100)await this.storage.delete(keys.slice(i,i+100));}
  async *chunks(file){for(let i=0;i<file.parts;i++){const bytes=await this.storage.get('blob:'+file.id+':'+i);if(!bytes)throw Error('Arşiv dosyasının bir bölümü okunamadı.');yield bytes;}}
  async advance(){
    if(this.busy){if(await this.storage.get('job'))await this.storage.setAlarm(this.now()+1000);return;}this.busy=true;let cleanupPending=false,runId=null;
    try{
      const period=await this.period(true);
      const deleted=(await this.all()).filter(r=>r.deletedAt&&r.file).slice(0,2);
      for(const row of deleted){await this.removeFile(row.file);await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);if(current?.file?.id===row.file.id){await tx.put('invoice:'+row.uuid,{...current,file:null});await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-row.file.size));}});}
      const deletedGroups=[...(await this.storage.list({prefix:'folder:'})).values()].filter(f=>f.deletedAt&&f.excel).slice(0,2);
      cleanupPending=!!(deleted.length||deletedGroups.length);
      for(const group of deletedGroups){await this.removeFile(group.excel);await this.storage.transaction(async tx=>{const current=await tx.get('folder:'+group.id);if(current?.excel?.id===group.excel.id){await tx.put('folder:'+group.id,{...current,excel:null});await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-group.excel.size));}});}
      let job=await this.storage.get('job');if(!job){if(deleted.length||deletedGroups.length)await this.storage.setAlarm(this.now()+1000);return;}
      runId=job.id;
      if(job.metadataOnly){await this.advanceTypes(job);return;}
      if(!(await this.settings()).enabled&&!job.manual){await this.storage.delete('job');return;}
      if(job.periodVersion!==2||job.documentStart<period.from||job.end<period.from){
        const previous=job;job={id:randomUUID(),generation:previous.generation||0,manual:job.manual,cycleId:previous.cycleId||null,phase:'delivery',page:0,start:period.from,end:period.to,documentStart:period.from,periodVersion:2,started:this.now(),attempts:0,received:0,seen:[]};
        await this.storage.transaction(async tx=>{await this.requireJob(previous,tx);await tx.put('job',job);});runId=job.id;
      }
      const {connector,identifier}=await this.connector();
      if(job.phase!=='pdf'){
        const body={run:job.id,page:job.page,startDate:job.phase==='delivery'?job.start:job.documentStart,endDate:job.end,dateType:job.phase==='delivery'?'DELIVERY':'DOCUMENT'};
        const result=await(await connector.handle(this.company.id,'list','POST',body)).json();
        await this.requireJob(job);
        const expectedKey=job.phase+'Total';if(job[expectedKey]!==undefined&&job[expectedKey]!==result.total)throw Error('Liste kontrol sırasında değişti; sonraki kontrolde yeniden denenecek.');
        job[expectedKey]=result.total;
        const seen=new Set(job.seen||[]);
        for(const incoming of result.rows){
          if(seen.has(incoming.uuid.toLowerCase()))throw Error('Liste aynı faturayı birden çok kez içeriyor.');seen.add(incoming.uuid.toLowerCase());
          if(incoming.tarih<period.from||incoming.tarih>job.end)continue;
          const uuid=incoming.uuid.toLowerCase(),key='invoice:'+uuid;
          await this.storage.transaction(async tx=>{
            await this.requireJob(job,tx);
            const current=await tx.get(key),seen=await tx.get('seen:'+uuid),baseline=await tx.get('baseline:'+sha(incoming.fatno.replace(/\s/g,'').toLocaleUpperCase('tr')));
            if(current&&(current.fatno!==incoming.fatno||current.tarih!==incoming.tarih))fail('Aynı ETTN için fatura kimliği değişti.',409);
            const {ticket,tipLabel,...data}=incoming;
            if(!current||['fatno','tarih','unvan','tip','profile','tutar','birim','yanit','isRet'].some(k=>k!=='unvan'&&current[k]!==data[k])){
              const versionKey='month-revision:'+incoming.tarih.slice(0,7);await tx.put(versionKey,(await tx.get(versionKey)||0)+1);
            }
            await tx.put(key,{...data,unvan:current?.file?current.unvan:data.unvan,uuid,firstSeen:current?.firstSeen||seen?.firstSeen||this.now(),done:current?.done??(seen?.manualOverride?!!seen.done:!!baseline),manualOverride:current?.manualOverride||seen?.manualOverride||false,arrivalState:current?.arrivalState||'waiting',published:current?.published??seen?.published??!!baseline,arrivalBatch:current?.arrivalBatch||null,revision:current?.revision||0,file:current?.file||null,folder:current?.folder||null,deletedAt:current?.deletedAt||null,notified:current?.notified||false,pdfError:current?.pdfError||null,pdfAttempts:current?.pdfAttempts||0,...current?.doneAt?{doneAt:current.doneAt}:{}});
            if(!seen)await tx.put('seen:'+uuid,{firstSeen:this.now(),published:!!baseline});
          });
          job.received++;
        }
        job.page++;job.attempts=0;job.seen=[...seen];
        if(job.page>=result.pages){if(seen.size!==result.total)throw Error('Listenin tamamı alınamadı.');if(job.phase==='delivery'){job.phase='document';job.page=0;job.seen=[];}else{job.phase='pdf';job.seen=[];}}
        await this.storage.transaction(async tx=>{await this.requireJob(job,tx);await tx.put('job',job);await tx.put('status',{...await tx.get('status'),progress:job.phase==='pdf'?'Yeni PDF’ler hazırlanıyor':'Faturalar alınıyor · sayfa '+(job.page+1)});});
        await this.storage.setAlarm(this.now()+1000);return;
      }
      const todos=(await this.all()).filter(r=>r.tarih>=period.from&&r.tarih<=job.end&&!r.file&&!r.deletedAt&&!r.isRet&&(r.pdfAttempts||0)<3).slice(0,2);
      for(const row of todos){
        try{
          const saved=(await this.getConnection(this.company.id)).saved,config=connector.unseal(this.company.id,saved),ticket=connector.ticket(this.company.id,config,row);
          const xml=unwrapDocument(await(await connector.handle(this.company.id,'download','POST',{ticket,format:'ubl'})).arrayBuffer(),'ubl');
          const title=supplierFromXML(xml,row,identifier),bytes=unwrapDocument(await(await connector.handle(this.company.id,'download','POST',{ticket,format:'pdf'})).arrayBuffer(),'pdf');
          await this.requireJob(job);
          const date=localDate(this.now()),month=row.tarih.slice(0,7),baseFolder=month+'_'+date;
          await this.storage.transaction(async tx=>{
            await this.requireJob(job,tx);const current=await tx.get('invoice:'+row.uuid);if(!current||current.deletedAt||current.file)return;
            const used=await tx.get('totalBytes')||0;if(used+bytes.byteLength>MAX_BYTES)fail('Firma arşivi 512 MB sınırına ulaştı. Kullanmadığınız klasörleri silin.',507);
            const file=await this.saveFile('pdf-'+row.uuid+'-'+randomUUID(),safeName(title+' - '+row.fatno)+'.pdf',bytes,tx);
            let folder=await tx.get('active-folder:'+baseFolder)||baseFolder,group=await tx.get('folder:'+folder);
            if(group?.deletedAt){folder=baseFolder+'_'+randomUUID().slice(0,8);group=null;}
            group=group||{id:folder,month,date,created:this.now(),revision:0};
            await tx.put('active-folder:'+baseFolder,folder);
            await tx.put('invoice:'+row.uuid,{...current,unvan:title,file,folder,pdfError:null,pdfAttempts:0});
            await tx.put('folder:'+folder,{...group,revision:group.revision+1});const versionKey='month-revision:'+month;await tx.put(versionKey,(await tx.get(versionKey)||0)+1);await tx.put('totalBytes',used+bytes.byteLength);
          });
        }catch(e){
          if(e.cancelled)throw e;await this.storage.transaction(async tx=>{await this.requireJob(job,tx);const current=await tx.get('invoice:'+row.uuid);if(current&&!current.deletedAt)await tx.put('invoice:'+row.uuid,{...current,pdfAttempts:(current.pdfAttempts||0)+1,pdfError:e.message});});
        }
      }
      await this.requireJob(job);if(todos.length){await this.storage.setAlarm(this.now()+2000);return;}
      await this.publishArrivals(job);await this.refreshMonthlyExcels(job);
      const rows=await this.all(),today=localDate(this.now()),monthly=notificationMonthCounts(rows,today),inPeriod=r=>r.tarih>=period.from&&r.tarih<=job.end,unnotified=rows.filter(r=>inPeriod(r)&&r.file&&!r.deletedAt&&!r.notified&&!r.isRet),fresh=unnotified.filter(r=>invoiceState(r,today)==='new'&&r.arrivalBatch===job.id),errors=rows.filter(r=>inPeriod(r)&&!r.deletedAt&&!r.file&&!r.isRet&&r.pdfError);
      if(job.cycleId){
        const id=sha(this.company.id+':cycle:'+job.cycleId);
        const pending=rows.filter(r=>!r.deletedAt&&!r.done&&!r.isRet).length;
        await this.notify({id,company:this.company.id,cycleId:job.cycleId,kind:'cycle-result',fresh:fresh.length,pending,errors:errors.length,monthly,created:this.now()});
      }else if(fresh.length){
        const id=sha(this.company.id+':'+fresh.map(r=>r.uuid).sort().join(','));
        const pending=rows.filter(r=>!r.deletedAt&&!r.done&&!r.isRet).length;
        const months=[...new Set(fresh.map(r=>r.tarih.slice(0,7)))],currentMonth=localDate(this.now()).slice(0,7),notificationMonth=months.includes(currentMonth)?currentMonth:months.sort().at(-1);
        await this.notify({id,company:this.company.id,title:this.company.name,body:formatNotificationMonths(monthly),url:'/workspace/'+this.company.id+'/takip/?view=invoices&month='+notificationMonth,kind:'invoices',count:fresh.length,pending,monthly,created:this.now()});
        }
      for(const row of unnotified)await this.storage.transaction(async tx=>{await this.requireJob(job,tx);const current=await tx.get('invoice:'+row.uuid);if(current)await tx.put('invoice:'+row.uuid,{...current,notified:true});});
      if(errors.length)await this.notify({id:sha(this.company.id+':pdf-error:'+localDate(this.now())),company:this.company.id,title:this.company.name+' · '+errors.length+' PDF Hazırlanamadı',body:'Faturalar listede duruyor. Sonraki kontrolde tekrar denenecek. Detayları görmek için dokun.',url:'/takip?company='+this.company.id+'&view=invoices',kind:'error',created:this.now()});
      await this.storage.transaction(async tx=>{await this.requireJob(job,tx);const state=await tx.get('status')||{};await tx.put('status',{...state,lastSuccess:errors.length?state.lastSuccess||null:this.now(),lastFinished:this.now(),lastResult:{fresh:fresh.length,pdfs:unnotified.length,errors:errors.length},error:errors.length?errors.length+' faturanın PDF’i hazırlanamadı. İzibiz Sistemini Başlat ile yeniden deneyebilirsiniz.':null,progress:null});await tx.delete('job');});
    }catch(e){
      if(e.cancelled)return;
      const outcome=await this.storage.transaction(async tx=>{
        const job=await tx.get('job');if(!job||job.id!==runId)return null;
        const metadata=!!job.metadataOnly,retry=job.attempts<2,status=await tx.get('status')||{};
        await tx.put('status',{...status,...(metadata?{typeRefreshError:'Fatura senaryoları güncellenemedi. Yenile ile tekrar denenecek.'}:{error:e.status?e.message:'İzibiz kontrolü tamamlanamadı. Bağlantı veya belge doğrulamasında hata oluştu.'}),progress:null});
        if(retry)await tx.put('job',{...job,attempts:job.attempts+1});else await tx.delete('job');
        return {metadata,retry,generation:job.generation||0,cycleId:job.cycleId||null};
      });
      if(!outcome)return;
      if(outcome.retry)await this.storage.setAlarm(this.now()+30000);
      else if(!outcome.metadata&&(await this.storage.get('archive-generation')||0)===outcome.generation){
        const errorText=e.status?e.message:'İzibiz bağlantısı veya belge doğrulaması tamamlanamadı.';
        if(outcome.cycleId){const rows=await this.all(),pending=rows.filter(r=>!r.deletedAt&&!r.done&&!r.isRet).length,monthly=notificationMonthCounts(rows,localDate(this.now()));await this.notify({id:sha(this.company.id+':cycle:'+outcome.cycleId),company:this.company.id,cycleId:outcome.cycleId,kind:'cycle-result',fresh:0,pending,monthly,error:errorText,created:this.now()});}
        else await this.notify({id:sha(this.company.id+':error:'+localDate(this.now())+':'+errorText),company:this.company.id,title:this.company.name+' · Kontrol Tamamlanamadı',body:errorText+' Sonuç “yeni fatura yok” olarak kaydedilmedi. Detayları görmek için dokun.',url:'/takip?company='+this.company.id,kind:'error',created:this.now()});
      }
    }finally{try{const job=await this.storage.get('job');if((cleanupPending&&!job)||(job&&runId&&job.id!==runId))await this.storage.setAlarm(this.now()+1000);}finally{this.busy=false;}}
  }
  excelResponse(file){
    const chunks=this.chunks(file),stream=new ReadableStream({async pull(c){const {value,done}=await chunks.next();if(done)c.close();else c.enqueue(value);},cancel(){return chunks.return();}});
    return new Response(stream,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':disposition(file.name),'Cache-Control':'private, no-store'}});
  }
  async summary(period=null,existingRows=null){
    period=period||await this.period();
    const [storedRows,storedFolders]=await Promise.all([existingRows||this.all(),this.storage.list({prefix:'folder:'})]);
    const rows=storedRows.filter(r=>!r.deletedAt),folders=[...storedFolders.values()].filter(f=>!f.deletedAt);
    await this.queueTypeRefresh(rows);const [job,settings,status,bytes]=await Promise.all([this.storage.get('job'),this.settings(),this.status(),this.storage.get('totalBytes')]);
    const count=items=>({total:items.length,fresh:items.filter(r=>invoiceState(r,localDate(this.now()))==='new').length,waiting:items.filter(r=>invoiceState(r,localDate(this.now()))==='waiting').length,done:items.filter(r=>r.done&&!r.isRet).length,rejected:items.filter(r=>r.isRet).length,pdfs:items.filter(r=>r.file).length,errors:items.filter(r=>r.pdfError&&!r.file&&!r.isRet).length});
    const months=[...new Set([...rows.map(r=>r.tarih.slice(0,7)),...folders.map(f=>f.month)])],monthly=Object.fromEntries(months.map(month=>[month,{...count(rows.filter(r=>r.tarih.startsWith(month))),folders:folders.filter(f=>f.month===month).length}]));
    return {company:this.company,period,monthly,settings,status,running:!!job,updatingTypes:!!job?.metadataOnly,nextCheck:nextCheck(this.now()),counts:{...count(rows),folders:folders.length},bytes:bytes||0,capacity:MAX_BYTES};
  }
  async notificationSummary(){
    const [storedRows,settings,status]=await Promise.all([this.all(),this.settings(),this.status()]),rows=storedRows.filter(r=>!r.deletedAt);
    return {company:this.company,enabled:!!settings.enabled,pending:rows.filter(r=>!r.done&&!r.isRet).length,monthly:notificationMonthCounts(rows,localDate(this.now())),lastFinished:status.lastFinished||null,lastResult:status.lastResult||null,error:status.error||null};
  }
  async handle(action,method,body={},params=new URLSearchParams()){
    if(action==='notification-summary'&&method==='GET')return json(await this.notificationSummary());
    const period=await this.period(action==='baseline'&&method==='POST');
    if(action==='clear-all'&&method==='POST'){if(body.confirm!==true)fail('Tümünü temizleme onayı gerekli.');return json(await this.clearAll());}
    if(action==='summary'&&method==='GET')return json(await this.summary(period));
    if(action==='bootstrap'&&method==='GET'){
      const storedRows=await this.all(),[summary,invoices]=await Promise.all([this.summary(period,storedRows),this.invoicePage(params,storedRows)]);
      return json({summary,invoices});
    }
    if(action==='scan'&&method==='POST'){
      return json(await this.start(true));
    }
    if(action==='tick'&&method==='POST')return json(await this.start(false,typeof body.cycleId==='string'&&/^[a-f0-9]{64}$/.test(body.cycleId)?body.cycleId:null));
    if(action==='settings'&&method==='POST'){if(typeof body.enabled!=='boolean')fail('Geçersiz otomasyon ayarı.');await this.storage.put('settings',{...await this.settings(),enabled:body.enabled});if(!body.enabled)await this.storage.delete('job');return json({ok:true});}
    if(action==='invoices'&&method==='GET')return json(await this.invoicePage(params));
    if(action==='mark'&&method==='POST'){
      if(!Array.isArray(body.items)||!body.items.length||body.items.length>100||new Set(body.items.map(x=>x?.uuid)).size!==body.items.length||typeof body.done!=='boolean')fail('En fazla 100 fatura seçin.');
      const result=await this.storage.transaction(async tx=>{
        const changes=[];for(const item of body.items){
          if(typeof item.uuid!=='string'||!/^[a-f0-9-]{36}$/.test(item.uuid))fail('Fatura kimliği geçersiz.');
          const key='invoice:'+item.uuid,row=await tx.get(key);if(!row||row.deletedAt)fail('Fatura bulunamadı.',404);if(row.isRet)fail('Reddedilmiş fatura işlenmiş olarak işaretlenemez.');
          if(item.revision!==row.revision)fail('Bu fatura başka bir ekranda değişti. Listeyi yenileyin.',409);
          changes.push({key,row});
        }
        const out=[];for(const {key,row} of changes){const updated={...row,done:body.done,manualOverride:true,doneAt:body.done?this.now():null,revision:row.revision+1};await tx.put(key,updated);await tx.put('seen:'+row.uuid,{...await tx.get('seen:'+row.uuid),done:body.done,manualOverride:true});const versionKey='month-revision:'+row.tarih.slice(0,7);await tx.put(versionKey,(await tx.get(versionKey)||0)+1);if(row.folder){const group=await tx.get('folder:'+row.folder);if(group)await tx.put('folder:'+row.folder,{...group,revision:group.revision+1});}out.push({uuid:row.uuid,revision:updated.revision});}
        const audit=await tx.get('audit')||[];audit.unshift({at:this.now(),done:body.done,invoices:changes.map(x=>x.row.fatno)});await tx.put('audit',audit.slice(0,100));return out;
      });await this.refreshMonthlyExcels();return json({ok:true,items:result});
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
      await this.refreshMonthlyExcels();const rows=await this.all(),storedGroups=[...(await this.storage.list({prefix:'folder:'})).values()].filter(f=>!f.deletedAt&&(!params.get('month')||f.month===params.get('month')));
      const versions=Object.fromEntries(await Promise.all([...new Set(storedGroups.map(f=>f.month))].map(async month=>[month,await this.storage.get('month-revision:'+month)||0])));
      const monthExcels=new Map(await this.storage.list({prefix:'monthly-excel:'}));
      const groups=storedGroups.map(f=>({...f,name:folderName(this.company.name,f.month,f.date),pdfs:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&r.file).length,pending:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&!r.done&&!r.isRet).length,fresh:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&invoiceState(r,localDate(this.now()))==='new').length,waiting:rows.filter(r=>r.folder===f.id&&!r.deletedAt&&invoiceState(r,localDate(this.now()))==='waiting').length,excel:monthExcels.has('monthly-excel:'+f.month)?{name:monthExcels.get('monthly-excel:'+f.month).file.name,at:monthExcels.get('monthly-excel:'+f.month).at,current:monthExcels.get('monthly-excel:'+f.month).revision===versions[f.month]}:null}));
      return json({folders:groups.sort((a,b)=>b.date.localeCompare(a.date)||b.month.localeCompare(a.month))});
    }
    if(action==='audit'&&method==='GET')return json({events:await this.storage.get('audit')||[]});
    if(action==='delete-folder'&&method==='POST'){
      const group=await this.storage.transaction(async tx=>{
        const group=await tx.get('folder:'+body.folder);if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);
        await tx.put('folder:'+group.id,{...group,deletedAt:this.now(),excel:null});
        const versionKey='month-revision:'+group.month;await tx.put(versionKey,(await tx.get(versionKey)||0)+1);return group;
      });
      if(group.excel){await this.removeFile(group.excel);await this.storage.transaction(async tx=>{await tx.put('totalBytes',Math.max(0,(await tx.get('totalBytes')||0)-group.excel.size));});}
      for(const row of (await this.all()).filter(r=>r.folder===group.id&&!r.deletedAt))await this.storage.transaction(async tx=>{const current=await tx.get('invoice:'+row.uuid);if(current&&!current.deletedAt&&current.folder===group.id)await tx.put('invoice:'+row.uuid,{...current,deletedAt:this.now()});});
      await this.storage.setAlarm(this.now()+1000);return json({ok:true});
    }
    if(action==='excel'&&method==='POST'){
      const group=await this.storage.get('folder:'+body.folder);if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);await this.refreshMonthlyExcels();return json({ok:true});
    }
    if(action==='month-excel'&&method==='GET'){
      const month=params.get('month');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))fail('Geçerli bir ay seçin.');
      await this.refreshMonthlyExcels();const monthly=await this.storage.get('monthly-excel:'+month);if(!monthly)fail('Bu ayda henüz fatura yok.',404);
      if(monthly.revision!==(await this.storage.get('month-revision:'+month)||0))fail('Excel güncelleniyor. Biraz sonra yeniden deneyin.',409);
      return this.excelResponse(monthly.file);
    }
    if(action==='pdf'&&method==='GET'){
      const row=await this.storage.get('invoice:'+params.get('id'));if(!row||row.deletedAt||!row.file)fail('PDF bulunamadı.',404);
      const chunks=this.chunks(row.file),stream=new ReadableStream({async pull(controller){const {value,done}=await chunks.next();if(done)controller.close();else controller.enqueue(value);},cancel(){return chunks.return();}});
      return new Response(stream,{headers:{'Content-Type':'application/pdf','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(row.file.name),'Cache-Control':'private, no-store'}});
    }
    if(action==='export'&&method==='GET'){
      await this.refreshMonthlyExcels();
      const group=await this.storage.get('folder:'+params.get('folder'));if(!group||group.deletedAt)fail('Klasör bulunamadı.',404);
      const monthly=await this.storage.get('monthly-excel:'+group.month);
      if(monthly&&monthly.revision!==(await this.storage.get('month-revision:'+group.month)||0))fail('Excel güncelleniyor. Biraz sonra yeniden deneyin.',409);
      if(params.get('excel')==='1'){if(!monthly)fail('Excel hazırlanıyor.',409);return this.excelResponse(monthly.file);}
      const root=folderName(this.company.name,group.month,group.date),rows=(await this.all()).filter(r=>r.folder===group.id&&!r.deletedAt&&r.file),names=new Set();
      const entries=rows.map(r=>{let name=r.file.name;if(names.has(name))name=safeName(name.replace(/\.pdf$/i,'')).slice(0,130)+' - '+r.uuid+'.pdf';names.add(name);return {name:root+'/'+name,file:r.file};});
      if(monthly)entries.push({name:root+'/'+monthly.file.name,file:monthly.file});
      return new Response(streamZip(entries,file=>this.chunks(file)),{headers:{'Content-Type':'application/zip','Content-Disposition':disposition(root+'.zip'),'Cache-Control':'private, no-store'}});
    }
    return json({error:'İşlem bulunamadı.'},404);
  }
  async invoicePage(params,existingRows=null){
    const allRows=(existingRows||await this.all()).filter(r=>!r.deletedAt);let rows=allRows;
    if(params.get('month'))rows=rows.filter(r=>r.tarih.startsWith(params.get('month')));
    if(params.get('folder'))rows=rows.filter(r=>r.folder===params.get('folder'));
    if(params.get('status')==='new')rows=rows.filter(r=>invoiceState(r,localDate(this.now()))==='new');if(params.get('status')==='waiting')rows=rows.filter(r=>invoiceState(r,localDate(this.now()))==='waiting');if(params.get('status')==='done')rows=rows.filter(r=>r.done&&!r.isRet);if(params.get('status')==='rejected')rows=rows.filter(r=>r.isRet);
    const q=(params.get('q')||'').toLocaleUpperCase('tr');if(q)rows=rows.filter(r=>(r.fatno+' '+r.unvan).toLocaleUpperCase('tr').includes(q));
    rows.sort((a,b)=>a.tarih.localeCompare(b.tarih)||(a.firstSeen||0)-(b.firstSeen||0)||a.fatno.localeCompare(b.fatno,'tr')||a.uuid.localeCompare(b.uuid));
    const offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0)),limit=100;
    return {total:rows.length,rows:rows.slice(offset,offset+limit).map(r=>{const {file,...data}=r;return {...data,state:invoiceState(r,localDate(this.now())),tipLabel:invoiceTypeLabel(r.profile,r.tip),pdfReady:!!file};}),months:[...new Set(allRows.map(r=>r.tarih.slice(0,7)))].sort().reverse()};
  }
}
