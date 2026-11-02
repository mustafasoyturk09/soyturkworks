import webpush from 'web-push';
import {createHash} from 'node:crypto';

const COMPANY_IDS=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'];
const touchDevice=(storage,id,revision)=>storage.transaction(async tx=>{const device=await tx.get('push:device:'+id);if(device&&device.revision===revision)await tx.put('push:device:'+id,{...device,lastSent:Date.now()});});
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
  const req=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:digest?43200:86400,urgency:'high',topic:digest?'invoice-digest':deviceId(payload.id).slice(0,28),vapidDetails:{subject:origin,publicKey:keys.publicKey,privateKey:keys.privateKey}});
  const response=await fetcher(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.ok)return 'sent';if([404,410].includes(response.status))return 'expired';throw Error('Bildirim sağlayıcısı isteği tamamlayamadı ('+response.status+').');
}
export async function pushAPI(storage,origin,action,method,body,fetcher=fetch){
  if(!COMPANY_IDS.includes(body.company))fail('Önce bir firma seçin.');
  const keys=await vapidKeys(storage);
  if(action==='config'&&method==='GET')return json({publicKey:keys.publicKey});
  if(action==='devices'&&method==='GET')return json({devices:[...(await storage.list({prefix:'push:device:'})).values()].map(d=>({id:d.id,name:d.name,created:d.created,lastSent:d.lastSent||null,active:d.revision===body.revision,accountWide:true}))});
  if(action==='subscribe'&&method==='POST'){
    const subscription=validateSubscription(body.subscription),id=deviceId(subscription.endpoint);
    const devices=await storage.list({prefix:'push:device:'});if(devices.size>=10&&!devices.has('push:device:'+id))fail('En fazla 10 bildirim cihazı kaydedilebilir.');
    const previous=devices.get('push:device:'+id);await storage.put('push:device:'+id,{id,subscription,name:String(body.name||previous?.name||'Cihazım').trim().slice(0,60),created:previous?.created||Date.now(),revision:body.revision,accountWide:true,lastSent:previous?.lastSent||null});return json({ok:true,id,accountWide:true});
  }
  if(action==='unsubscribe'&&method==='POST'){
    if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))fail('Cihaz kaydı geçersiz.');await storage.delete('push:device:'+body.id);return json({ok:true,remaining:0});
  }
  if(action==='test'&&method==='POST'){
    const device=await storage.get('push:device:'+body.id);if(!device||device.revision!==body.revision)fail('Önce bu cihazda bildirimleri açın.');
    const result=await deliver(device.subscription,{id:'test-'+Date.now(),title:body.companyName+' · Bildirim Denemesi',body:'Bu cihaz tüm firmaların iki saatlik fatura özetlerini alacak.',url:'/takip?company='+body.company+'&view=notifications',kind:'test'},keys,origin,fetcher);
    if(result==='expired'){await storage.delete('push:device:'+device.id);fail('Bildirim iznini bu cihazda yeniden açın.',409);}
    await touchDevice(storage,device.id,body.revision);return json({ok:true});
  }
  return json({error:'İşlem bulunamadı.'},404);
}
export async function enqueueNotification(storage,event){
  if(await storage.get('push:event:'+event.id))return;
  await storage.put('push:event:'+event.id,{...event,created:Date.now()});
  const devices=await storage.list({prefix:'push:device:'});
  for(const device of devices.values())await storage.put('push:outbox:'+event.id+':'+device.id,{event,device:device.id,attempts:0});
  const events=await storage.list({prefix:'push:event:'});const old=[...events].sort((a,b)=>b[1].created-a[1].created).slice(100);if(old.length)await storage.delete(old.map(([k])=>k));
}
export async function flushNotifications(storage,origin,revision,fetcher=fetch){
  const keys=await vapidKeys(storage),items=await storage.list({prefix:'push:outbox:',limit:20});
  for(const [key,item] of items){
    if(item.nextAttempt>Date.now())continue;
    const device=await storage.get('push:device:'+item.device);
    if(!device||device.revision!==revision||Date.now()-item.event.created>86400000){await storage.delete(key);continue;}
    try{const result=await deliver(device.subscription,item.event,keys,origin,fetcher);if(result==='expired')await storage.delete('push:device:'+device.id);else await touchDevice(storage,device.id,revision);await storage.delete(key);}
    catch{item.attempts++;if(item.attempts>=5)await storage.delete(key);else await storage.put(key,{...item,nextAttempt:Date.now()+Math.min(3600000,60000*2**(item.attempts-1))});}
  }
}

export function digestNotification(cycle){
  const companies=cycle.companies.map(company=>({...company,result:cycle.results?.[company.id]}));
  const fresh=companies.reduce((sum,company)=>sum+(Number(company.result?.fresh)||0),0);
  const pending=companies.reduce((sum,company)=>sum+(Number(company.result?.pending??company.pending)||0),0);
  const newCompanies=companies.filter(company=>company.result?.fresh>0);
  const names=newCompanies.map(company=>company.name).join(', ');
  const incomplete=companies.some(company=>company.connected&&company.enabled&&!company.result),limited=companies.some(company=>!company.connected||!company.enabled||company.result?.error);
  const title=fresh?(newCompanies.length===1?newCompanies[0].name+' · '+fresh+' Yeni Fatura':fresh+' Yeni Fatura · '+names):incomplete?'Tüm Firmalar · Kontrol Sürüyor':limited?'Tüm Firmalar · Kontrol Özeti':'Tüm Firmalar · Yeni Fatura Yok';
  const body=companies.map(company=>{
    if(!company.connected)return company.name+': İzibiz bağlantısı yok';
    if(!company.enabled)return company.name+': otomatik takip kapalı';
    if(!company.result)return company.name+': kontrol sürüyor';
    if(company.result.error)return company.name+': kontrol tamamlanamadı';
    return company.name+': '+(Number(company.result.fresh)||0)+' gelen · '+(Number(company.result.pending)||0)+' bekleyen'+(company.result.errors?' · '+company.result.errors+' PDF hatası':'');
  }).join(' • ');
  return {id:createHash('sha256').update('digest:'+cycle.id).digest('hex'),company:'ALL',title,body,url:'/companies',kind:'digest',tag:'invoice-digest',count:fresh,pending,created:cycle.created||Date.now()};
}
