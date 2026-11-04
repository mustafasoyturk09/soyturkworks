import webpush from 'web-push';
import {createHash} from 'node:crypto';
import {formatNotificationMonths,formatCompanyNotificationLine,normalizeNotificationMonths} from './notification-format.mjs';

const COMPANY_IDS=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'];
const touchDevice=(storage,id,revision,company=null,status='sent',httpStatus=null)=>storage.transaction(async tx=>{
  const device=await tx.get('push:device:'+id);if(!device||device.revision!==revision)return;
  const at=Date.now(),deliveries=company?{...device.deliveries,[company]:{status,at,httpStatus}}:device.deliveries;
  await tx.put('push:device:'+id,{...device,...status==='sent'?{lastSent:at}:{},deliveries});
});
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(text,status=400)=>{throw Object.assign(Error(text),{status});};
export const deviceId=endpoint=>createHash('sha256').update(endpoint).digest('hex');
export function validateSubscription(value){
  let url;try{url=new URL(value?.endpoint);}catch{fail('Bildirim aboneliği doğrulanamadı.');}
  const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='wns2-db5p.notify.windows.com'||url.hostname.endsWith('.notify.windows.com');
  if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed||value.endpoint.length>2048)fail('Bildirim sağlayıcısı desteklenmiyor.');
  const p=value.keys?.p256dh,a=value.keys?.auth;
  if(typeof p!=='string'||!/^[\w-]+={0,2}$/.test(p)||Buffer.from(p,'base64url').length!==65||Buffer.from(p,'base64url')[0]!==4||typeof a!=='string'||!/^[\w-]+={0,2}$/.test(a)||Buffer.from(a,'base64url').length!==16)fail('Bildirim anahtarları doğrulanamadı.');
  return {endpoint:value.endpoint,keys:{p256dh:p,auth:a}};
}
export async function vapidKeys(storage){
  return storage.transaction(async tx=>{let keys=await tx.get('push:vapid');if(!keys){keys=webpush.generateVAPIDKeys();await tx.put('push:vapid',keys);}return keys;});
}
export async function deliver(subscription,payload,keys,origin,fetcher=fetch){
  const digest=payload.kind==='digest';
  const req=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:digest?43200:86400,urgency:'high',topic:deviceId(payload.tag||payload.id).slice(0,28),vapidDetails:{subject:origin,publicKey:keys.publicKey,privateKey:keys.privateKey}});
  const response=await fetcher(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.ok)return 'sent';if([404,410].includes(response.status))return 'expired';throw Object.assign(Error('Bildirim sağlayıcısı isteği tamamlayamadı ('+response.status+').'),{httpStatus:response.status});
}
export async function pushAPI(storage,origin,action,method,body,fetcher=fetch){
  if(!COMPANY_IDS.includes(body.company))fail('Önce bir firma seçin.');
  if(action==='devices'&&method==='GET')return json({devices:[...(await storage.list({prefix:'push:device:'})).values()].map(d=>({id:d.id,name:d.name,created:d.created,lastSent:d.lastSent||null,active:d.revision===body.revision,accountWide:true}))});
  const keys=await vapidKeys(storage);
  if(action==='config'&&method==='GET')return json({publicKey:keys.publicKey});
  if(action==='subscribe'&&method==='POST'){
    const subscription=validateSubscription(body.subscription),id=deviceId(subscription.endpoint);
    const devices=await storage.list({prefix:'push:device:'});if(devices.size>=10&&!devices.has('push:device:'+id))fail('En fazla 10 bildirim cihazı kaydedilebilir.');
    const previous=devices.get('push:device:'+id);await storage.put('push:device:'+id,{id,subscription,name:String(body.name||previous?.name||'Cihazım').trim().slice(0,60),created:previous?.created||Date.now(),revision:body.revision,accountWide:true,lastSent:previous?.lastSent||null,deliveries:previous?.revision===body.revision?previous.deliveries||{}:{}});return json({ok:true,id,accountWide:true,created:!previous});
  }
  if(action==='unsubscribe'&&method==='POST'){
    if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))fail('Cihaz kaydı geçersiz.');await storage.delete('push:device:'+body.id);return json({ok:true,remaining:0});
  }
  if(action==='test'&&method==='POST'){
    const device=await storage.get('push:device:'+body.id);if(!device||device.revision!==body.revision)fail('Önce bu cihazda bildirimleri açın.');
    const result=await deliver(device.subscription,{id:'test-'+Date.now(),title:'Bildirim Testi',body:'Telefon Bağlantısı Hazır\nTüm Firmalar Tek Seferde Bağlandı',url:'/takip?company='+body.company+'&view=notifications',kind:'test'},keys,origin,fetcher);
    if(result==='expired'){await storage.delete('push:device:'+device.id);fail('Bildirim iznini bu cihazda yeniden açın.',409);}
    await touchDevice(storage,device.id,body.revision);return json({ok:true});
  }
  return json({error:'İşlem bulunamadı.'},404);
}
export async function enqueueNotification(storage,event,inTransaction=false){
  if(!inTransaction)return storage.transaction(tx=>enqueueNotification(tx,event,true));
  if(await storage.get('push:event:'+event.id))return;
  event={...event,created:event.created||Date.now()};
  await storage.put('push:event:'+event.id,event);
  const devices=await storage.list({prefix:'push:device:'});
  for(const device of devices.values())await storage.put('push:outbox:'+event.id+':'+device.id,{event,device:device.id,attempts:0});
  const events=await storage.list({prefix:'push:event:'});const old=[...events].sort((a,b)=>b[1].created-a[1].created).slice(100);if(old.length)await storage.delete(old.map(([k])=>k));
}
export async function notificationHistory(storage,company){
  return [...(await storage.list({prefix:'push:event:'})).values()].filter(e=>!e.historyDeletedAt&&(e.company===company||e.company==='ALL')).sort((a,b)=>b.created-a.created);
}
export async function clearNotificationHistory(storage,company,body){
  const all=body.all===true,ids=body.ids;
  if(!all&&(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!id.length||id.length>180)))fail('Silmek istediğiniz bildirimleri seçin.');
  return storage.transaction(async tx=>{
    const events=await tx.list({prefix:'push:event:'}),selected=new Set(all?[]:ids);
    const matches=[...events].filter(([,event])=>all||selected.has(event.id));
    if(!all&&matches.some(([,event])=>event.company!==company&&event.company!=='ALL'))fail('Başka firmanın bildirimi bu ekrandan silinemez.',403);
    let deleted=0;
    for(const [key,event] of matches)if(!event.historyDeletedAt){await tx.put(key,{...event,historyDeletedAt:Date.now()});deleted++;}
    // Retain the event ID for idempotency; history deletion never cancels a push
    // already queued or recreates an old invoice notification on retry.
    return {ok:true,deleted};
  });
}
export async function flushNotifications(storage,origin,revision,fetcher=fetch){
  const keys=await vapidKeys(storage),items=[...(await storage.list({prefix:'push:outbox:'}))].filter(([,item])=>!(item.nextAttempt>Date.now())).slice(0,20);
  // One slow/offline provider must not hold every other phone and company.
  for(let i=0;i<items.length;i+=5)await Promise.all(items.slice(i,i+5).map(async([key,item])=>{
    const device=await storage.get('push:device:'+item.device);
    if(!device||device.revision!==revision||Date.now()-item.event.created>86400000){await storage.delete(key);return;}
    try{const result=await deliver(device.subscription,item.event,keys,origin,fetcher);if(result==='expired')await storage.delete('push:device:'+device.id);else await touchDevice(storage,device.id,revision,item.event.company);await storage.delete(key);}
    catch(error){await touchDevice(storage,device.id,revision,item.event.company,'retrying',Number(error.httpStatus)||null);item.attempts++;await storage.put(key,{...item,nextAttempt:Date.now()+Math.min(3600000,15000*2**Math.min(8,item.attempts-1))});}
  }));
}

export function digestNotification(cycle){
  const companies=cycle.companies.map(company=>({...company,result:cycle.results?.[company.id]}));
  const fresh=companies.reduce((sum,company)=>sum+(Number(company.result?.fresh)||0),0);
  const pending=companies.reduce((sum,company)=>sum+(Number(company.result?.pending??company.pending)||0),0);
  const newCompanies=companies.filter(company=>company.result?.fresh>0);
  const incomplete=companies.some(company=>company.connected&&company.enabled&&!company.result),limited=companies.some(company=>!company.connected||!company.enabled||company.result?.error);
  let title,body;
  if(newCompanies.length===1){
    title=newCompanies[0].name;
    body=formatNotificationMonths(newCompanies[0].result?.monthly)||newCompanies[0].name+' · '+fresh+' Yeni Gelen';
  }else if(newCompanies.length>1){
    title=newCompanies.length+' Firmada Yeni Fatura';
    body=newCompanies.map(company=>formatCompanyNotificationLine(company.name,company.result?.monthly)).join('\n');
  }else{
    title=incomplete?'Tüm Firmalar · Kontrol Sürüyor':limited?'Tüm Firmalar · Kontrol Özeti':'Tüm Firmalar · Yeni Fatura Yok';
    body=companies.map(company=>{
      if(!company.connected)return company.name+' · İzibiz Bağlantısı Yok';
      if(!company.enabled)return company.name+' · Otomatik Takip Kapalı';
      if(!company.result)return company.name+' · Kontrol Sürüyor';
      if(company.result.error)return company.name+' · Kontrol Tamamlanamadı';
      const monthly=normalizeNotificationMonths(company.result.monthly);
      return monthly.length?formatCompanyNotificationLine(company.name,monthly):company.name+' · Yeni Fatura Yok';
    }).join('\n');
  }
  return {id:createHash('sha256').update('digest:'+cycle.id).digest('hex'),company:'ALL',title,body,url:'/companies',kind:'digest',tag:'invoice-digest',count:fresh,pending,created:cycle.created||Date.now()};
}
