'use strict';
// No app HTML, invoice, password or authenticated response is cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data={};try{data=event.data?.json()||{};}catch{}
    const path=typeof data.url==='string'&&/^(?:\/takip(?:[/?]|$)|\/workspace\/[A-Z_]+\/takip\/(?:[?]|$))/.test(data.url)?data.url:'/companies';
    const digest=['digest','status','company-result'].includes(data.kind);
    await self.registration.showNotification(String(data.title||'Firma Fatura Takibi').slice(0,120),{
      body:String(data.body||'Fatura takibinde yeni bir gelişme var. Detayları görmek için dokun.').slice(0,500),
      icon:'/assets/brand/apple-touch-icon.png',badge:'/assets/brand/favicon-48.png',
      tag:String(data.tag||data.id||'invoice-update'),renotify:digest,lang:'tr',silent:false,data:{url:path},
      timestamp:Number(data.created)||Date.now()
    });
    if(self.navigator.setAppBadge){const count=Math.max(0,Number(data.count)||0);if(count)await self.navigator.setAppBadge(count).catch(()=>{});else if(self.navigator.clearAppBadge)await self.navigator.clearAppBadge().catch(()=>{});}
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL(event.notification.data?.url||'/companies',self.location.origin);
    if(url.origin!==self.location.origin)return;
    if(/^\/takip\/?$/.test(url.pathname)){const id=url.searchParams.get('company');if(id&&/^[A-Z_]+$/.test(id)){url.pathname='/workspace/'+id+'/takip/';url.searchParams.delete('company');}else url.pathname='/companies';}
    if(url.pathname!=='/companies'&&!/^\/workspace\/[A-Z_]+\/takip\/$/.test(url.pathname))return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const target=windows.find(c=>new URL(c.url).pathname===url.pathname);
    if(target){await target.navigate(url.href);await target.focus();}else await self.clients.openWindow(url.href);
  })());
});
