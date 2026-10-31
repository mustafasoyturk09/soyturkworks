import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createECDH,verify,createPublicKey} from 'node:crypto';
import ece from 'http_ece';
import {unzipSync,strFromU8} from 'fflate';
import {InvoiceArchive,nextCheck,workHours,previousMonth} from '../server/automation.mjs';
import {folderName,makeExcel,supplierFromXML,unwrapDocument} from '../server/invoice-files.mjs';
import {IzibizConnector} from '../server/izibiz.mjs';
import {validateSubscription,vapidKeys,deliver,enqueueNotification,flushNotifications} from '../server/push.mjs';

function storage(){
 const data=new Map();
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const db={get:async k=>clone(data.get(k)),put:async(k,v)=>{data.set(k,clone(v));},delete:async keys=>{for(const k of [keys].flat())data.delete(k);},list:async({prefix='',limit=Infinity}={})=>new Map([...data].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([k,v])=>[k,clone(v)])),setAlarm:async at=>{db.alarm=at;},transaction:async fn=>{const before=clone(data);try{return await fn(db);}catch(e){data.clear();for(const [k,v]of before)data.set(k,v);throw e;}},data};
 return db;
}
const company={id:'PUSULA',name:'Pusula'},identifier='7330782805';
const remoteInvoice=(n,date)=>({id:n,uuid:'11111111-2222-4333-8444-'+String(n).padStart(12,'0'),documentNo:'TEST2026'+String(n).padStart(7,'0'),issueDate:date,direction:'IN',accountingCustomer:{identifier},accountingSupplier:{name:'Test supplier'},amount:100,currency:'TRY',invoiceType:'SATIS',invoiceStatus:'RECEIVED'});
function fixture(){
 let now=Date.parse('2026-11-17T06:00:00Z'),remote=[remoteInvoice(1,'2026-10-20'),remoteInvoice(2,'2026-11-17')],failPdf=false;
 const db=storage(),key=randomBytes(32).toString('base64url'),connector=new IzibizConnector({storage:db,key});
 const config={username:'synthetic-test',password:'synthetic',identifier,revision:'test-revision'},saved={...connector.seal(company.id,config),name:'Synthetic company',identifier},events=[],calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url,body:options.body?JSON.parse(options.body):null});
  const answer=data=>new Response(JSON.stringify({data,error:null}),{headers:{'Content-Type':'application/json'}});
  if(url.endsWith('/auth/token'))return answer({accessToken:'synthetic'});
  if(url.endsWith('/customers/me'))return answer({identifier,commercialName:'Synthetic company'});
  if(url.includes('/inbox?'))return answer({contents:remote,pageable:{totalElements:remote.length,totalPages:remote.length?1:0}});
  const body=JSON.parse(options.body),row=remote.find(r=>r.id===body[0].id);
  if(url.endsWith('/pdf'))return failPdf?new Response('Unavailable',{status:503}):new Response('%PDF-1.7\nSYNTHETIC',{headers:{'Content-Type':'application/pdf'}});
  if(url.endsWith('/ubl'))return new Response('<Invoice><ID>'+row.documentNo+'</ID><UUID>'+row.uuid+'</UUID><AccountingCustomerParty><Party><PartyIdentification><ID schemeID="VKN">'+identifier+'</ID></PartyIdentification></Party></AccountingCustomerParty><AccountingSupplierParty><Party><PartyLegalEntity><RegistrationName>Test &amp; Bilişim A.Ş.</RegistrationName></PartyLegalEntity></Party></AccountingSupplierParty></Invoice>',{headers:{'Content-Type':'application/xml'}});
  throw Error('Unexpected request');
 };
 const engine=new InvoiceArchive({storage:db,company,now:()=>now,getConnection:async()=>({saved,key,active:true}),notify:async e=>events.push(e)});
 return {engine,db,events,calls,fetcher,advanceTime:()=>{now+=2*3600000;},setRemote:r=>remote=r,failPdf:()=>failPdf=true};
}
async function drain(engine,db){
 for(let i=0;i<30;i++){if(!await db.get('job'))return;await engine.advance();}
 assert.fail('Job did not finish');
}
test('Istanbul weekday schedule includes month/year changes and never runs on weekends',()=>{
 assert.equal(new Date(nextCheck(Date.parse('2026-10-30T14:00:00Z'))).toISOString(),'2026-11-02T06:00:00.000Z');
 assert.equal(new Date(nextCheck(Date.parse('2026-12-31T14:00:00Z'))).toISOString(),'2027-01-01T06:00:00.000Z');
 assert.equal(previousMonth('2027-01-02'),'2026-12-01');
 assert(workHours(Date.parse('2026-11-17T06:00:00Z')));assert(!workHours(Date.parse('2026-11-17T15:00:00Z')));assert(!workHours(Date.parse('2026-10-31T06:00:00Z')));
});
test('Automatic archive catches previous-month invoices, saves only PDFs and preserves done/undo through rescans',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);
  const summary=await f.engine.summary();assert.equal(summary.counts.total,2);assert.equal(summary.counts.pdfs,2);assert.equal(summary.counts.fresh,2);assert(summary.status.lastSuccess);
  const groups=(await(await f.engine.handle('folders','GET')).json()).folders;assert.equal(groups.length,2);assert(groups.every(g=>g.excel===null));
  assert(groups.some(g=>g.name==='Pusula Ekim 2026 Gelen E-Faturalar (17.11.2026)'));
  assert(groups.some(g=>g.name==='Pusula Kasım 2026 Gelen E-Faturalar (17.11.2026)'));
  assert.equal(f.events.length,1);assert.equal(f.events[0].count,2);assert.equal(f.events[0].pending,2);
  assert(f.calls.some(c=>c.url.includes('dateType=DELIVERY')));assert(f.calls.some(c=>c.url.includes('dateType=DOCUMENT')&&c.url.includes('startDate=2026-10-01')));
  const row=(await f.engine.all())[0];
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:0}],done:true});
  await assert.rejects(f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:0}],done:false}),e=>e.status===409);
  f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  assert.equal((await f.engine.all()).find(r=>r.uuid===row.uuid).done,true);assert.equal(f.events.length,1);
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:1}],done:false});assert.equal((await f.engine.summary()).counts.fresh,2);
  const folder=groups.find(g=>g.month==='2026-10');await f.engine.handle('excel','POST',{folder:folder.id});
  const excel=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id,excel:'1'})),files=unzipSync(new Uint8Array(await excel.arrayBuffer()));
  const xml=strFromU8(files['xl/worksheets/sheet1.xml']);assert(xml.includes('YENİ GELEN'));assert(xml.includes('PUSULA EKİM 2026 GELEN E-FATURALAR'));assert.equal((await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.id===folder.id).excel.current,true);
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:2}],done:true});
  assert.equal((await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.id===folder.id).excel.current,false);
  await f.engine.handle('excel','POST',{folder:folder.id});
  const zipped=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id})),archive=unzipSync(new Uint8Array(await zipped.arrayBuffer()));
  assert.equal(Object.keys(archive).length,2);assert(Object.keys(archive).every(n=>n.startsWith(folder.name+'/')));
  const xlsx=Object.entries(archive).find(([n])=>n.endsWith('.xlsx'))[1];assert(strFromU8(unzipSync(xlsx)['xl/worksheets/sheet1.xml']).includes('İŞLENDİ'));
  const pdfCount=f.calls.filter(c=>c.url.endsWith('/pdf')).length;
  await f.engine.handle('delete-folder','POST',{folder:folder.id});await f.engine.advance();
  f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  const deleted=(await f.engine.all()).find(r=>r.uuid===row.uuid);assert(deleted.deletedAt);assert.equal(deleted.file,null);assert(deleted.done);assert.equal(f.calls.filter(c=>c.url.endsWith('/pdf')).length,pdfCount);
  f.setRemote([remoteInvoice(1,'2026-10-20'),remoteInvoice(2,'2026-11-17'),remoteInvoice(3,'2026-10-25')]);f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  const replacement=(await f.engine.all()).find(r=>r.uuid.endsWith('000000000003'));assert(replacement.file);assert(!replacement.deletedAt);assert.notEqual(replacement.folder,folder.id);
  assert.equal((await f.engine.all()).find(r=>r.uuid===row.uuid).deletedAt,deleted.deletedAt);
  const measured=[...f.db.data].filter(([k])=>k.startsWith('blob:')).reduce((n,[,v])=>n+v.length,0);assert.equal(await f.db.get('totalBytes'),measured);
 }finally{globalThis.fetch=original;}
});
test('Failed PDF fetches never become successful archives or new invoice success notifications',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;f.failPdf();
 try{await f.engine.start();await drain(f.engine,f.db);const summary=await f.engine.summary();assert.equal(summary.counts.pdfs,0);assert.equal(summary.counts.errors,2);assert(summary.status.error);assert.equal(summary.status.lastSuccess,null);assert.equal(f.events.filter(e=>e.kind==='invoices').length,0);assert.equal(f.events.filter(e=>e.kind==='error').length,1);}finally{globalThis.fetch=original;}
});
test('Initial processed-number import is company-local and does not require recurring Excel uploads',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{await f.engine.handle('baseline','POST',{numbers:[' '+remoteInvoice(1,'2026-10-20').documentNo+' ' ]});await f.engine.start();await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.done,1);assert.equal((await f.engine.summary()).counts.fresh,1);}finally{globalThis.fetch=original;}
});
test('Document validation rejects foreign recipients, wrong identities, DTDs and non-PDF bytes',()=>{
 const row={fatno:'TEST',uuid:'11111111-2222-4333-8444-555555555555'},enc=s=>new TextEncoder().encode(s);
 assert.throws(()=>supplierFromXML(enc('<!DOCTYPE Invoice><Invoice/>'),row,identifier));
 assert.throws(()=>supplierFromXML(enc('<Invoice><ID>WRONG</ID></Invoice>'),row,identifier));
 assert.throws(()=>unwrapDocument(enc('not a pdf'),'pdf'));
 assert.equal(folderName('KİB Dijital Tek','2026-10','2026-11-17'),'KİB Dijital Tek Ekim 2026 Gelen E-Faturalar (17.11.2026)');
 const bytes=makeExcel('KİB Dijital Tek','2026-10','2026-11-17',[{fatno:'<test>',tarih:'2026-10-01',unvan:'Test & <script>',tip:'SATIS',tutar:123.5,birim:'TRY',yanit:'Yanıt gerekmiyor',done:false}]);
 assert(strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']).includes('KİB DİJİTAL TEK EKİM'));
});
function subscription(){const client=createECDH('prime256v1');client.generateKeys();const auth=randomBytes(16);return {client,auth,value:{endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:client.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}}};}
test('Push requests use real encrypted Web Push payloads and VAPID signatures without exposing private keys',async()=>{
 const db=storage(),keys=await vapidKeys(db),sub=subscription(),payload={id:'test-event',title:'Pusula · 4 yeni fatura',body:'PDF’ler hazır.',url:'/takip?company=PUSULA'};
 validateSubscription(sub.value);
 let request;
 assert.equal(await deliver(sub.value,payload,keys,'https://soyturkworks.com',async(url,options)=>{request={url,...options};return new Response('',{status:201});}),'sent');
 assert.equal(request.redirect,'manual');assert(!request.body.includes(Buffer.from('PDF’ler')));
 const decrypted=ece.decrypt(request.body,{version:'aes128gcm',privateKey:sub.client,authSecret:sub.auth});
 assert.deepEqual(JSON.parse(decrypted.toString()),payload);
 const token=request.headers.Authorization.match(/t=([^,]+)/)[1],parts=token.split('.'),publicBytes=Buffer.from(keys.publicKey,'base64url');
 const jwk={kty:'EC',crv:'P-256',x:publicBytes.subarray(1,33).toString('base64url'),y:publicBytes.subarray(33).toString('base64url')};
 assert(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
 assert.throws(()=>validateSubscription({...sub.value,endpoint:'https://127.0.0.1/private'}));assert.throws(()=>validateSubscription({...sub.value,endpoint:'https://web.push.apple.com.attacker.invalid/test'}));
});
test('Push outbox deduplicates events and revokes expired or old-session subscriptions',async()=>{
 const db=storage(),sub=subscription();await db.put('push:device:one',{id:'one',subscription:sub.value,revision:'current'});
 const event={id:'event-one',title:'Pusula',body:'Yeni fatura var',created:Date.now()};await enqueueNotification(db,event);await enqueueNotification(db,event);
 assert.equal((await db.list({prefix:'push:outbox:'})).size,1);
 await flushNotifications(db,'https://soyturkworks.com','current',async()=>new Response('',{status:410}));assert.equal((await db.list({prefix:'push:device:'})).size,0);assert.equal((await db.list({prefix:'push:outbox:'})).size,0);
 await db.put('push:device:two',{id:'two',subscription:sub.value,revision:'old'});await enqueueNotification(db,{...event,id:'event-two'});
 await flushNotifications(db,'https://soyturkworks.com','new',()=>assert.fail('Old session must not receive notifications'));
});
