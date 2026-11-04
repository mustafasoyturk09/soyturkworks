import {createHash,randomUUID} from 'node:crypto';
import {statusNotifications,notificationSections} from './notification-format.mjs';
import {enqueueNotification} from './push.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const DAY=86400000;

// Persist the fan-out before starting any company. Repeating a dispatch is safe.
export class InvoiceCycles{
  constructor({storage,companies,archive,connected,schedule,now=()=>Date.now()}){
    Object.assign(this,{storage,companies,archive,connected,schedule,now});
  }
  async begin({manual=false,slot=this.now()}={}){
    const id=hash(manual?'manual:'+randomUUID():'scheduled:'+Math.floor(slot/3600000)),key='push:cycle:'+id;
    if(!await this.storage.get(key)){
      const companies=(await this.companies()).filter(c=>c.active&&!c.deleted);
      const enableTracking=manual||!await this.storage.get('automation:all-firms-v2');
      await this.storage.transaction(async tx=>{
        if(!await tx.get(key))await tx.put(key,{id,manual,enableTracking,created:this.now(),deadline:this.now()+120000,expires:this.now()+DAY,companies,results:{}});
        await tx.put('automation:all-firms-v2',true);
      });
    }
    await this.schedule(this.now()+1000);
    return {id,...await this.dispatch(id)};
  }
  async dispatch(id){
    const cycle=await this.storage.get('push:cycle:'+id);if(!cycle)return {results:[]};
    const results=await Promise.all(cycle.companies.map(async company=>{
      if(cycle.results[company.id])return {id:company.id,name:company.name,status:cycle.results[company.id].status||'completed'};
      try{
        if(!await this.connected(company.id)){
          await this.record({cycleId:id,company:company.id,status:'not-connected',error:'İzibiz bağlantısı yok'});
          return {id:company.id,name:company.name,status:'not-connected'};
        }
        const response=await this.archive(company.id,cycle.manual?'scan':'tick','POST',{cycleId:id,enableTracking:!!cycle.enableTracking});
        const data=await response.json();
        if(!response.ok)throw Error(data.error||'Kontrol başlatılamadı');
        if(data.skipped){
          const summaryResponse=await this.archive(company.id,'notification-summary','GET');
          if(!summaryResponse.ok)throw Error('Firma özeti alınamadı');
          const summary=await summaryResponse.json();
          await this.record({...summary,cycleId:id,company:company.id,fresh:0,status:'skipped',error:data.reason==='disabled'?'Otomatik takip kapalı':summary.error||null});
        }
        return {id:company.id,name:company.name,status:data.running?'started':'skipped',reason:data.reason||null};
      }catch(error){
        // Retry dispatch on the durable alarm; never call a failed start success.
        await this.storage.transaction(async tx=>{const current=await tx.get('push:cycle:'+id);if(current&&!current.results[company.id])await tx.put('push:cycle:'+id,{...current,startErrors:{...current.startErrors,[company.id]:String(error.message).slice(0,160)}});});
        return {id:company.id,name:company.name,status:'error',error:String(error.message).slice(0,160)};
      }
    }));
    return {results,started:results.filter(r=>r.status==='started').length,connected:results.filter(r=>r.status!=='not-connected').length};
  }
  async record(event){
    await this.storage.transaction(async tx=>{
      const key='push:cycle:'+event.cycleId,cycle=await tx.get(key),company=cycle?.companies.find(c=>c.id===event.company);
      if(!company||cycle.results[event.company])return;
      const result={fresh:Number(event.fresh)||0,monthly:event.monthly||[],error:event.error||null,status:event.status||'completed'};
      const monthly=event.monthly||[],{pending}=notificationSections(event,this.now());
      const notifications=statusNotifications(company,{...event,monthly,lastFinished:event.lastFinished||(!event.error?this.now():null)},'cycle:'+cycle.id,this.now(),event.error||'');
      for(const notification of notifications){
        notification.id=hash(notification.id);notification.kind='company-result';notification.title=company.name+' · '+(event.error?'Kontrol Uyarısı':pending?pending+' İşlenmemiş Fatura':'İşlenmemiş Fatura Yok');
        notification.tag='invoice-check-'+cycle.id+'-'+company.id+'-'+notifications.indexOf(notification);
        await enqueueNotification(tx,notification,true);
      }
      const results={...cycle.results,[event.company]:result};
      await tx.put(key,{...cycle,results,completed:cycle.companies.every(c=>results[c.id])?this.now():null});
    });
  }
  async maintain(){
    const now=this.now();
    for(const [key,cycle] of await this.storage.list({prefix:'push:cycle:'})){
      if(now>=(cycle.expires||cycle.created+DAY)){
        for(const company of cycle.companies.filter(c=>!cycle.results?.[c.id]))await this.record({cycleId:cycle.id,company:company.id,error:'Kontrol tamamlanamadı. İzibiz bağlantısını kontrol edin.'});
        await this.storage.delete(key);continue;
      }
      if(cycle.completed)continue;
      await this.dispatch(cycle.id);
      if(now>=cycle.deadline&&!cycle.warned)await this.storage.transaction(async tx=>{
        const current=await tx.get(key);if(!current||current.warned)return;
        for(const company of current.companies.filter(c=>!current.results[c.id]))await enqueueNotification(tx,{id:hash('waiting:'+cycle.id+':'+company.id),company:company.id,title:company.name+' · Kontrol Sürüyor',body:current.startErrors?.[company.id]?'Bağlantı yeniden deneniyor. Tamamlandığında sonuç ayrıca gelecek.':'Faturalar hazırlanıyor. Tamamlandığında sonuç ayrıca gelecek.',kind:'company-result',tag:'invoice-check-'+cycle.id+'-'+company.id+'-0',url:'/workspace/'+company.id+'/takip/',created:now},true);
        await tx.put(key,{...current,warned:true});
      });
    }
    const pending=[...(await this.storage.list({prefix:'push:cycle:'})).values()].some(c=>!c.completed);
    if(pending)await this.schedule(now+60000);
  }
}
