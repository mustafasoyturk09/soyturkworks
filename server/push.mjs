import webpush from 'web-push';
import {createHash} from 'node:crypto';

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
  const req=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:3600,urgency:'normal',topic:deviceId(payload.id).slice(0,28),vapidDetails:{subject:origin,publicKey:keys.publicKey,privateKey:keys.privateKey}});
  const response=await fetcher(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.ok)return 'sent';if([404,410].includes(response.status))return 'expired';throw Error('Bildirim sağlayıcısı isteği tamamlayamadı ('+response.status+').');
}
export async function pushAPI(storage,origin,action,method,body,fetcher=fetch){
  const keys=await vapidKeys(storage);
  if(action==='config'&&method==='GET')return json({publicKey:keys.publicKey});
  if(action==='devices'&&method==='GET')return json({devices:[...(await storage.list({prefix:'push:device:'})).values()].map(d=>({id:d.id,name:d.name,created:d.created,lastSent:d.lastSent||null,active:d.revision===body.revision}))});
  if(action==='subscribe'&&method==='POST'){
    const subscription=validateSubscription(body.subscription),id=deviceId(subscription.endpoint);
    const devices=await storage.list({prefix:'push:device:'});if(devices.size>=10&&!devices.has('push:device:'+id))fail('En fazla 10 bildirim cihazı kaydedilebilir.');
    const previous=devices.get('push:device:'+id);await storage.put('push:device:'+id,{id,subscription,name:String(body.name||'Cihazım').trim().slice(0,60),created:previous?.created||Date.now(),revision:body.revision});return json({ok:true,id});
  }
  if(action==='unsubscribe'&&method==='POST'){
    if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))fail('Cihaz kaydı geçersiz.');await storage.delete('push:device:'+body.id);return json({ok:true});
  }
  if(action==='test'&&method==='POST'){
    const device=await storage.get('push:device:'+body.id);if(!device)fail('Önce bu cihazın bildirimlerini açın.');
    const result=await deliver(device.subscription,{id:'test-'+Date.now(),title:'Bildirim Denemesi',body:'Bildirimlerin açık. Yeni fatura geldiğinde firma adı, fatura sayısı ve işlem bekleyen toplamı burada görünecek.',url:'/takip?view=notifications',kind:'test'},keys,origin,fetcher);
    if(result==='expired'){await storage.delete('push:device:'+device.id);fail('Bildirim iznini bu cihazda yeniden açın.',409);}
    await storage.put('push:device:'+device.id,{...device,lastSent:Date.now()});return json({ok:true});
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
    try{const result=await deliver(device.subscription,item.event,keys,origin,fetcher);if(result==='expired')await storage.delete('push:device:'+device.id);else await storage.put('push:device:'+device.id,{...device,lastSent:Date.now()});await storage.delete(key);}
    catch{item.attempts++;if(item.attempts>=5)await storage.delete(key);else await storage.put(key,{...item,nextAttempt:Date.now()+Math.min(3600000,60000*2**(item.attempts-1))});}
  }
}
