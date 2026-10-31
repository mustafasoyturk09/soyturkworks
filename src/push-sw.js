'use strict';
// No app HTML, invoice, password or authenticated response is cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data={};try{data=event.data?.json()||{};}catch{}
    const path=typeof data.url==='string'&&/^\/takip(?:[/?]|$)/.test(data.url)?data.url:'/takip';
    await self.registration.showNotification(String(data.title||'Fatura Takibi').slice(0,120),{
      body:String(data.body||'Fatura takibinde yeni bir gelişme var. Detayları görmek için dokun.').slice(0,500),
      icon:'/assets/brand/apple-touch-icon.png',badge:'/assets/brand/favicon-48.png',
      tag:String(data.id||'invoice-update'),renotify:false,lang:'tr',silent:false,data:{url:path},
      timestamp:Number(data.created)||Date.now()
    });
    if(self.navigator.setAppBadge)await self.navigator.setAppBadge().catch(()=>{});
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL(event.notification.data?.url||'/takip',self.location.origin);
    if(url.origin!==self.location.origin||!url.pathname.startsWith('/takip'))return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const target=windows.find(c=>new URL(c.url).pathname.startsWith('/takip'));
    if(target){await target.navigate(url.href);await target.focus();}else await self.clients.openWindow(url.href);
  })());
});
