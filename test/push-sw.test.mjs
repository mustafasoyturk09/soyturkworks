import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../src/push-sw.js',import.meta.url),'utf8');
function fixture(windows=[]){
 const handlers={},opened=[],shown=[];
 const self={location:{origin:'https://soyturkworks.com'},navigator:{},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(code,{self,URL});
 const click=async url=>{let promise;handlers.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>promise=p});await promise;};
 const push=async data=>{let promise;handlers.push({data:{json:()=>data},waitUntil:p=>promise=p});await promise;};
 return {opened,shown,click,push};
}
test('Invoice notification opens its own firm without navigating a different firm window',async()=>{
 let navigated=false;
 const f=fixture([{url:'https://soyturkworks.com/workspace/COMED/takip/',navigate:async()=>{navigated=true;},focus:async()=>{}}]);
 await f.click('/takip?company=PUSULA&view=invoices');
 assert.equal(navigated,false);assert.deepEqual(f.opened,['https://soyturkworks.com/workspace/PUSULA/takip/?view=invoices']);
});
test('Invoice notification focuses only the matching firm window and rejects external destinations',async()=>{
 const calls=[],f=fixture([{url:'https://soyturkworks.com/workspace/PUSULA/takip/?view=folders',navigate:async url=>calls.push(url),focus:async()=>calls.push('focus')}]);
 await f.click('/workspace/PUSULA/takip/?view=invoices');
 assert.deepEqual(calls,['https://soyturkworks.com/workspace/PUSULA/takip/?view=invoices','focus']);assert.deepEqual(f.opened,[]);
 await f.click('https://unrelated.invalid/workspace/PUSULA/takip/');await f.click('/account');assert.equal(calls.length,2);assert.deepEqual(f.opened,[]);
});
test('A late invoice notification preserves its invoice month when opening the company',async()=>{
 const f=fixture();await f.click('/takip?company=PUSULA&view=invoices&month=2026-10');assert.deepEqual(f.opened,['https://soyturkworks.com/workspace/PUSULA/takip/?view=invoices&month=2026-10']);
});
test('Two-hour summary shows company counts and re-alerts without an app-name title',async()=>{
 const f=fixture();await f.push({id:'digest-1',tag:'invoice-digest',kind:'digest',title:'3 Yeni Fatura · Pusula, Comed',body:'Pusula: 2 gelen · 4 bekleyen • Comed: 1 gelen · 1 bekleyen',url:'/companies',count:3});
 assert.equal(f.shown[0].title,'3 Yeni Fatura · Pusula, Comed');assert.equal(f.shown[0].tag,'invoice-digest');assert.equal(f.shown[0].renotify,true);assert.match(f.shown[0].body,/Pusula: 2 gelen/);assert(!f.shown[0].title.includes('Soyturk Works'));
});
