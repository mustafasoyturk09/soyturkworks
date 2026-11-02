import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createECDH,verify,createPublicKey,createHash} from 'node:crypto';
import ece from 'http_ece';
import {unzipSync,strFromU8} from 'fflate';
import {InvoiceArchive,nextCheck,workHours,previousMonth,trackingPeriod} from '../server/automation.mjs';
import {folderName,makeExcel,supplierFromXML,unwrapDocument} from '../server/invoice-files.mjs';
import {IzibizConnector} from '../server/izibiz.mjs';
import {validateSubscription,vapidKeys,deliver,pushAPI,enqueueNotification,flushNotifications,digestNotification} from '../server/push.mjs';

function storage(){
 const data=new Map();
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const db={get:async k=>clone(data.get(k)),put:async(k,v)=>{data.set(k,clone(v));},delete:async keys=>{for(const k of [keys].flat())data.delete(k);},list:async({prefix='',limit=Infinity}={})=>new Map([...data].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([k,v])=>[k,clone(v)])),setAlarm:async at=>{db.alarm=at;},transaction:async fn=>{const before=clone(data);try{return await fn(db);}catch(e){data.clear();for(const [k,v]of before)data.set(k,v);throw e;}},data};
 return db;
}
const company={id:'PUSULA',name:'Pusula'},identifier='7330782805';
const remoteInvoice=(n,date)=>({id:n,uuid:'11111111-2222-4333-8444-'+String(n).padStart(12,'0'),documentNo:'TEST2026'+String(n).padStart(7,'0'),issueDate:date,direction:'IN',accountingCustomer:{identifier},accountingSupplier:{name:'Test supplier'},amount:100,currency:'TRY',profile:'TEMELFATURA',invoiceType:'SATIS',invoiceStatus:'RECEIVED'});
function fixture({date='2026-11-01T06:00:00Z',startMonth='2026-10'}={}){
 let now=Date.parse(date),remote=[remoteInvoice(1,'2026-10-27'),remoteInvoice(2,'2026-11-01')],failPdf=false,failList=false;
 const db=storage(),key=randomBytes(32).toString('base64url'),connector=new IzibizConnector({storage:db,key});
 if(startMonth)db.data.set('settings',{enabled:true,startMonth,periodVersion:1});
 const config={username:'synthetic-test',password:'synthetic',identifier,revision:'test-revision'},saved={...connector.seal(company.id,config),name:'Synthetic company',identifier},events=[],calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url,body:options.body?JSON.parse(options.body):null});
  const answer=data=>new Response(JSON.stringify({data,error:null}),{headers:{'Content-Type':'application/json'}});
  if(url.endsWith('/auth/token'))return answer({accessToken:'synthetic'});
  if(url.endsWith('/customers/me'))return answer({identifier,commercialName:'Synthetic company'});
  if(url.includes('/inbox?'))return failList?new Response('Unavailable',{status:503}):answer({contents:remote,pageable:{totalElements:remote.length,totalPages:remote.length?1:0}});
  const body=JSON.parse(options.body),row=remote.find(r=>r.id===body[0].id);
  if(url.endsWith('/pdf'))return failPdf?new Response('Unavailable',{status:503}):new Response('%PDF-1.7\nSYNTHETIC',{headers:{'Content-Type':'application/pdf'}});
  if(url.endsWith('/ubl'))return new Response('<Invoice><ID>'+row.documentNo+'</ID><UUID>'+row.uuid+'</UUID><AccountingCustomerParty><Party><PartyIdentification><ID schemeID="VKN">'+identifier+'</ID></PartyIdentification></Party></AccountingCustomerParty><AccountingSupplierParty><Party><PartyLegalEntity><RegistrationName>Test &amp; Bilişim A.Ş.</RegistrationName></PartyLegalEntity></Party></AccountingSupplierParty></Invoice>',{headers:{'Content-Type':'application/xml'}});
  throw Error('Unexpected request');
 };
 const engine=new InvoiceArchive({storage:db,company,now:()=>now,getConnection:async()=>({saved,key,active:true}),notify:async e=>events.push(e)});
 return {engine,db,events,calls,fetcher,advanceTime:(hours=2)=>{now+=hours*3600000;},setRemote:r=>remote=r,failPdf:()=>failPdf=true,failList:()=>failList=true};
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
test('Tracking checks at most ten days across month/year boundaries and preserves historical archives',async()=>{
 assert.deepEqual(trackingPeriod('2026-10-31','2026-10'),{startMonth:'2026-10',from:'2026-10-21',to:'2026-10-31'});
 assert.equal(trackingPeriod('2026-11-01','2026-10').from,'2026-10-22');
 assert.equal(trackingPeriod('2026-12-01','2026-10').from,'2026-11-21');
 assert.equal(trackingPeriod('2027-01-01','2026-10').from,'2026-12-22');
 const f=fixture({date:'2026-10-31T06:00:00Z',startMonth:null}),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  const old=remoteInvoice(1,'2026-08-20'),september=remoteInvoice(2,'2026-09-27'),processed=remoteInvoice(3,'2026-10-27'),fresh=remoteInvoice(4,'2026-10-30');
  f.setRemote([old,september,processed,fresh,remoteInvoice(5,'2026-11-01')]);
  await f.engine.handle('baseline','POST',{numbers:[processed.documentNo]});
  await f.engine.start(true);await drain(f.engine,f.db);
  assert.equal((await f.db.get('settings')).startMonth,'2026-10');
  assert.equal((await f.engine.summary()).counts.total,2);assert.equal((await f.engine.summary()).counts.done,1);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/pdf')).length,2);assert.equal(f.events[0].count,1);assert.equal(f.events[0].pending,1);
  assert(f.calls.filter(c=>c.url.includes('/inbox?')).every(c=>c.url.includes('startDate=2026-10-21')));
  const before=f.calls.length;f.advanceTime(24);f.setRemote([september,remoteInvoice(6,'2026-10-31'),remoteInvoice(7,'2026-11-01')]);
  await f.engine.start(true);await drain(f.engine,f.db);
  assert(f.calls.slice(before).filter(c=>c.url.includes('/inbox?')).every(c=>c.url.includes('startDate=2026-10-')));
  assert.equal((await f.engine.summary()).counts.total,4);
  const december=f.calls.length;f.advanceTime(30*24);f.setRemote([remoteInvoice(8,'2026-10-28'),remoteInvoice(9,'2026-11-30'),remoteInvoice(10,'2026-12-01')]);
  await f.engine.start(true);await drain(f.engine,f.db);
  assert(f.calls.slice(december).filter(c=>c.url.includes('/inbox?')).every(c=>c.url.includes('startDate=2026-11-21')));
  assert.equal((await f.engine.all()).some(r=>r.uuid===remoteInvoice(8,'2026-10-28').uuid),false);
  assert.equal((await f.engine.summary()).counts.total,6);assert.equal((await f.engine.summary()).counts.done,1);
  assert((await f.engine.handle('folders','GET').then(r=>r.json())).folders.some(g=>g.month==='2026-10'),'Valid October archive remains available in December');
 }finally{globalThis.fetch=original;}
});
test('A first scan in November does not import October without an earlier tracking start',async()=>{
 const f=fixture({startMonth:null}),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{await f.engine.start(true);await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.total,1);assert.equal((await f.db.get('settings')).startMonth,'2026-11');assert((await f.engine.all()).every(r=>r.tarih.startsWith('2026-11')));}finally{globalThis.fetch=original;}
});
test('Opening the tracking summary never waits for monthly Excel regeneration',async()=>{
 const f=fixture();f.engine.refreshMonthlyExcels=()=>assert.fail('Summary must not rebuild spreadsheets');const summary=await f.engine.summary();assert.equal(summary.company.id,'PUSULA');assert.equal(summary.counts.total,0);
});
test('Opening an invoice page reads the company archive only once',async()=>{
 const f=fixture();let reads=0;const all=f.engine.all.bind(f.engine);f.engine.all=async()=>{reads++;return all();};
 const page=await f.engine.handle('invoices','GET',{},new URLSearchParams({month:'2026-11'})).then(response=>response.json());assert.equal(page.total,0);assert.equal(reads,1);
});
test('Every scheduled cycle reports a company result even when no new invoice arrived',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  const first='a'.repeat(64),second='b'.repeat(64);await f.engine.start(false,first);await drain(f.engine,f.db);
  assert.equal(f.events.length,1);assert.equal(f.events[0].kind,'cycle-result');assert.equal(f.events[0].cycleId,first);assert.equal(f.events[0].fresh,2);assert.equal(f.events[0].company,'PUSULA');
  f.advanceTime();await f.engine.start(false,second);await drain(f.engine,f.db);
  assert.equal(f.events.length,2);assert.equal(f.events[1].cycleId,second);assert.equal(f.events[1].fresh,0);assert.equal(f.events[1].pending,2);
 }finally{globalThis.fetch=original;}
});
test('Invoice dates stay oldest first across pages, filters and refreshes regardless of arrival order',async()=>{
 const f=fixture(),expected=[];
 for(let n=1;n<=205;n++){
  const date=new Date(Date.UTC(2026,9,1+(n*17)%48)).toISOString().slice(0,10),source=remoteInvoice(n,date);
  const row={uuid:source.uuid,fatno:source.documentNo,tarih:date,firstSeen:1000-n,done:n%2===0,revision:0};
  await f.db.put('invoice:'+row.uuid,row);expected.push(row);
 }
 expected.sort((a,b)=>a.tarih.localeCompare(b.tarih)||a.firstSeen-b.firstSeen||a.fatno.localeCompare(b.fatno,'tr')||a.uuid.localeCompare(b.uuid));
 const load=async params=>(await f.engine.handle('invoices','GET',{},new URLSearchParams(params))).json();
 const actual=[];for(const offset of [0,100,200]){const page=await load({offset:String(offset)});assert.equal(page.total,205);actual.push(...page.rows);}
 assert.deepEqual(actual.map(r=>r.uuid),expected.map(r=>r.uuid));
 assert.deepEqual((await load({})).rows.map(r=>r.uuid),expected.slice(0,100).map(r=>r.uuid));
 const filtered=await load({status:'waiting',month:'2026-10'});
 assert.deepEqual(filtered.rows.map(r=>r.uuid),expected.filter(r=>!r.done&&r.tarih.startsWith('2026-10')).map(r=>r.uuid));
 const incoming={...expected.at(-1),uuid:remoteInvoice(206,expected.at(-1).tarih).uuid,fatno:'AAA2026000000001',firstSeen:2000};await f.db.put('invoice:'+incoming.uuid,incoming);
 assert.equal((await load({offset:'200'})).rows.at(-1).uuid,incoming.uuid,'A newly arrived invoice on the latest date goes last, even with an alphabetically earlier number');
});
test('An unconnected or paused company does not fix its first tracking month prematurely',async()=>{
 const f=fixture({date:'2026-10-31T06:00:00Z',startMonth:null}),connection=f.engine.getConnection;
 f.engine.getConnection=async()=>({saved:null,active:true});
 await assert.rejects(()=>f.engine.start(true),e=>e.status===409);assert.equal(await f.db.get('settings'),undefined);
 await f.db.put('settings',{enabled:false});assert((await f.engine.start()).skipped);assert.equal((await f.db.get('settings')).startMonth,undefined);
 f.advanceTime(24);await f.db.put('settings',{enabled:true});f.engine.getConnection=connection;
 const original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{await f.engine.start(true);await drain(f.engine,f.db);assert.equal((await f.db.get('settings')).startMonth,'2026-11');}finally{globalThis.fetch=original;}
});
test('A running legacy job restarts within the new period instead of continuing its old PDF queue',async()=>{
 const f=fixture({date:'2026-10-31T06:00:00Z',startMonth:null}),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  f.setRemote([remoteInvoice(1,'2026-09-20'),remoteInvoice(2,'2026-10-27')]);
  await f.db.put('job',{id:'11111111-2222-4333-8444-555555555555',phase:'pdf',documentStart:'2026-09-01',end:'2026-10-31',manual:true});
  await f.engine.advance();assert(f.calls.some(c=>c.url.includes('/inbox?')&&c.url.includes('startDate=2026-10-21')));assert(!f.calls.some(c=>c.url.endsWith('/pdf')));
  await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.total,1);assert.equal((await f.engine.summary()).counts.pdfs,1);
 }finally{globalThis.fetch=original;}
});
test('Refreshing legacy archives removes pre-start months, reclaims files and preserves imported numbers and current-month status',async()=>{
 const f=fixture({date:'2026-10-31T06:00:00Z',startMonth:null}),at=Date.parse('2026-10-31T06:00:00Z');
 await f.db.put('settings',{enabled:false});await f.db.put('baseline:synthetic',{at:Date.parse('2026-10-27T06:00:00Z')});
 let used=0;
 for(const [i,date] of ['2026-08-20','2026-09-27','2026-10-27'].entries()){
  const uuid=remoteInvoice(i+1,date).uuid,folder=date.slice(0,7)+'_2026-10-31';
  const file=await f.engine.saveFile('pdf-'+uuid,'synthetic.pdf',new TextEncoder().encode('%PDF-1.7 synthetic'));
  const excel=await f.engine.saveFile('excel-'+uuid,'synthetic.xlsx',new TextEncoder().encode('synthetic XLSX'));
  used+=file.size+excel.size;
  await f.db.put('invoice:'+uuid,{uuid,tarih:date,fatno:'TEST'+i,firstSeen:at,revision:7,done:true,doneAt:at,file,folder});
  await f.db.put('folder:'+folder,{id:folder,month:date.slice(0,7),date:'2026-10-31',revision:0,excel});
 }
 await f.db.put('totalBytes',used);
 // Existing jobs must not continue the old September query/PDF queue after deployment.
 await f.db.put('job',{id:'11111111-2222-4333-8444-555555555555',phase:'pdf',documentStart:'2026-09-01',end:'2026-10-31',manual:false});
 const summary=await f.engine.summary();assert.equal(summary.period.startMonth,'2026-10');assert.equal(summary.counts.total,1);assert.equal(summary.counts.done,1);assert.equal(summary.counts.folders,1);assert.equal(summary.settings.enabled,false);
 const groups=(await f.engine.handle('folders','GET').then(r=>r.json())).folders;assert.deepEqual(groups.map(g=>g.month),['2026-10']);
 assert.equal((await f.engine.handle('invoices','GET').then(r=>r.json())).total,1);
 await assert.rejects(()=>f.engine.handle('pdf','GET',{},new URLSearchParams({id:remoteInvoice(1,'2026-08-20').uuid})),e=>e.status===404);
 await assert.rejects(()=>f.engine.handle('export','GET',{},new URLSearchParams({folder:'2026-09_2026-10-31'})),e=>e.status===404);
 for(let i=0;i<4;i++)await f.engine.advance();
 assert(await f.db.get('baseline:synthetic'));const current=await f.db.get('invoice:'+remoteInvoice(3,'2026-10-27').uuid);assert(current.file);assert.equal(current.revision,8);assert(current.done);assert(!current.deletedAt);
 assert((await f.engine.all()).filter(r=>r.tarih<'2026-10-01').every(r=>r.deletedAt&&r.excludedBeforeStart&&!r.file));
 const measured=[...f.db.data].filter(([k])=>k.startsWith('blob:')).reduce((n,[,v])=>n+v.length,0);assert.equal(await f.db.get('totalBytes'),measured);assert(measured>=current.file.size+(await f.db.get('folder:'+current.folder)).excel.size);
});
test('Automatic archive catches recent previous-month invoices, prepares Excel and preserves done/undo through rescans',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);
  const summary=await f.engine.summary();assert.equal(summary.counts.total,2);assert.equal(summary.counts.pdfs,2);assert.equal(summary.counts.fresh,2);assert(summary.status.lastSuccess);
  const groups=(await(await f.engine.handle('folders','GET')).json()).folders;assert.equal(groups.length,2);assert(groups.every(g=>g.excel?.current));
  assert(groups.some(g=>g.name==='Pusula Ekim 2026 Gelen E-Faturalar (01.11.2026)'));
  assert(groups.some(g=>g.name==='Pusula Kasım 2026 Gelen E-Faturalar (01.11.2026)'));
  assert.equal(f.events.length,1);assert.equal(f.events[0].title,'Pusula · Yeni Gelen 2 Fatura');assert(!f.events[0].title.includes('Soyturk'));assert.equal(f.events[0].count,2);assert.equal(f.events[0].pending,2);
  assert(f.calls.some(c=>c.url.includes('dateType=DELIVERY')));assert(f.calls.some(c=>c.url.includes('dateType=DOCUMENT')&&c.url.includes('startDate=2026-10-22')));
  const row=(await f.engine.all())[0];
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision}],done:true});
  await assert.rejects(f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:0}],done:false}),e=>e.status===409);
  f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  assert.equal((await f.engine.all()).find(r=>r.uuid===row.uuid).done,true);assert.equal(f.events.length,1);
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision+1}],done:false});assert.equal((await f.engine.summary()).counts.fresh,2);
  const folder=groups.find(g=>g.month==='2026-10');await f.engine.handle('excel','POST',{folder:folder.id});
  const excel=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id,excel:'1'})),files=unzipSync(new Uint8Array(await excel.arrayBuffer()));
  const xml=strFromU8(files['xl/worksheets/sheet1.xml']);assert(xml.includes('YENİ GELEN'));assert(xml.includes('PUSULA EKİM 2026 GELEN E-FATURALAR'));assert.equal((await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.id===folder.id).excel.current,true);
  await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision+2}],done:true});
  assert.equal((await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.id===folder.id).excel.current,true);
  await f.engine.handle('excel','POST',{folder:folder.id});
  const zipped=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id})),archive=unzipSync(new Uint8Array(await zipped.arrayBuffer()));
  assert.equal(Object.keys(archive).length,2);assert(Object.keys(archive).every(n=>n.startsWith(folder.name+'/')));
  const xlsx=Object.entries(archive).find(([n])=>n.endsWith('.xlsx'))[1];assert(strFromU8(unzipSync(xlsx)['xl/worksheets/sheet1.xml']).includes('İŞLENDİ'));
  const pdfCount=f.calls.filter(c=>c.url.endsWith('/pdf')).length;
  await f.engine.handle('delete-folder','POST',{folder:folder.id});await f.engine.advance();
  f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  const deleted=(await f.engine.all()).find(r=>r.uuid===row.uuid);assert(deleted.deletedAt);assert.equal(deleted.file,null);assert(deleted.done);assert.equal(f.calls.filter(c=>c.url.endsWith('/pdf')).length,pdfCount);
  f.setRemote([remoteInvoice(1,'2026-10-27'),remoteInvoice(2,'2026-11-01'),remoteInvoice(3,'2026-10-28')]);f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  const replacement=(await f.engine.all()).find(r=>r.uuid.endsWith('000000000003'));assert(replacement.file);assert(!replacement.deletedAt);assert.notEqual(replacement.folder,folder.id);
  assert.equal((await f.engine.all()).find(r=>r.uuid===row.uuid).deletedAt,deleted.deletedAt);
  const measured=[...f.db.data].filter(([k])=>k.startsWith('blob:')).reduce((n,[,v])=>n+v.length,0);assert.equal(await f.db.get('totalBytes'),measured);
 }finally{globalThis.fetch=original;}
});
test('Monthly Excel automatically retains older unresolved rows and updates immediately after marking',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);
  f.setRemote([remoteInvoice(1,'2026-10-27'),remoteInvoice(2,'2026-11-01'),remoteInvoice(3,'2026-10-28')]);f.advanceTime(24);await f.engine.start();await drain(f.engine,f.db);
  const groups=(await(await f.engine.handle('folders','GET')).json()).folders,folder=groups.find(g=>g.month==='2026-10'&&g.date==='2026-11-02');assert(folder);
  await f.engine.handle('excel','POST',{folder:folder.id});
  const response=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id,excel:'1'}));const xml=strFromU8(unzipSync(new Uint8Array(await response.arrayBuffer()))['xl/worksheets/sheet1.xml']);
  assert(xml.includes(remoteInvoice(1,'2026-10-27').documentNo));assert(xml.includes(remoteInvoice(3,'2026-10-28').documentNo));assert(!xml.includes(remoteInvoice(2,'2026-11-01').documentNo));
  const earlier=(await f.engine.all()).find(r=>r.uuid.endsWith('000000000001'));await f.engine.handle('mark','POST',{items:[{uuid:earlier.uuid,revision:earlier.revision}],done:true});
  assert.equal((await(await f.engine.handle('folders','GET')).json()).folders.find(g=>g.id===folder.id).excel.current,true);
 }finally{globalThis.fetch=original;}
});
test('Failed PDF fetches never become successful archives or new invoice success notifications',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;f.failPdf();
 try{await f.engine.start();await drain(f.engine,f.db);const summary=await f.engine.summary();assert.equal(summary.counts.pdfs,0);assert.equal(summary.counts.errors,2);assert(summary.status.error);assert.equal(summary.status.lastSuccess,null);assert.equal(f.events.filter(e=>e.kind==='invoices').length,0);assert.equal(f.events.filter(e=>e.kind==='error').length,1);}finally{globalThis.fetch=original;}
});
test('Initial processed-number import is company-local and does not require recurring Excel uploads',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{await f.engine.handle('baseline','POST',{numbers:[' '+remoteInvoice(1,'2026-10-27').documentNo+' ' ]});await f.engine.start();await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.done,1);assert.equal((await f.engine.summary()).counts.fresh,1);}finally{globalThis.fetch=original;}
});
test('Clear all empties every invoice and archive, retains company setup and marks, then permits immediate reacquisition',async()=>{
 const f=fixture(),other=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  const a=remoteInvoice(1,'2026-10-27'),b=remoteInvoice(2,'2026-11-01'),rejected={...remoteInvoice(3,'2026-10-31'),invoiceStatus:'REJECTED'};f.setRemote([a,b,rejected]);
  await f.engine.handle('baseline','POST',{numbers:[a.documentNo]});await f.engine.start(true);await drain(f.engine,f.db);
  let records=await f.engine.all();const first=records.find(r=>r.uuid===a.uuid),second=records.find(r=>r.uuid===b.uuid);
  await f.engine.handle('mark','POST',{items:[{uuid:first.uuid,revision:first.revision}],done:false});await f.engine.handle('mark','POST',{items:[{uuid:second.uuid,revision:second.revision}],done:true});
  const folder=(await f.engine.handle('folders','GET').then(r=>r.json())).folders[0];await f.engine.handle('excel','POST',{folder:folder.id});
  await f.db.put('automation:company',company.id);await f.db.put('push:device:synthetic',{id:'keep'});await other.db.put('invoice:other',{uuid:'other',tarih:'2026-11-01'});
  const before=await f.engine.summary();assert.equal(before.counts.rejected,1);assert.equal(before.monthly['2026-10'].rejected,1);assert.equal(before.monthly['2026-11'].done,1);
  await assert.rejects(()=>f.engine.handle('clear-all','POST',{}),e=>e.status===400);assert.equal((await f.engine.all()).length,3);
  await f.engine.handle('clear-all','POST',{confirm:true});
  const empty=await f.engine.summary();assert.equal(empty.counts.total,0);assert.equal(empty.counts.folders,0);assert.equal(empty.bytes,0);assert.deepEqual(empty.monthly,{});assert(!empty.running);assert.equal(empty.settings.enabled,true);assert.equal(empty.period.startMonth,'2026-10');
  assert.equal((await f.db.list({prefix:'blob:'})).size,0);assert.equal((await f.db.list({prefix:'invoice:'})).size,0);assert.equal((await f.db.list({prefix:'folder:'})).size,0);assert.equal((await f.db.list({prefix:'month-revision:'})).size,0);assert.equal((await f.db.list({prefix:'active-folder:'})).size,0);
  assert.equal(await f.db.get('automation:company'),company.id);assert(await f.db.get('push:device:synthetic'));assert(await other.db.get('invoice:other'));
  await f.engine.queueTypeRefresh(records.map(r=>({...r,profile:undefined})));assert.equal(await f.db.get('job'),undefined,'A stale summary cannot queue an old metadata job after clearing');
  await assert.rejects(()=>f.engine.handle('pdf','GET',{},new URLSearchParams({id:a.uuid})),e=>e.status===404);await assert.rejects(()=>f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id})),e=>e.status===404);
  await f.engine.start(true);await drain(f.engine,f.db);records=await f.engine.all();assert.equal(records.length,3);assert.equal(records.find(r=>r.uuid===a.uuid).done,false);assert.equal(records.find(r=>r.uuid===b.uuid).done,true);
  assert.equal(records.filter(r=>r.file).length,2);assert.equal((await f.engine.handle('invoices','GET',{},new URLSearchParams({status:'done'})).then(r=>r.json())).total,1);assert.equal((await f.engine.handle('invoices','GET',{},new URLSearchParams({status:'rejected'})).then(r=>r.json())).total,1);
  assert((await f.engine.handle('folders','GET',{},new URLSearchParams({month:'2026-10'})).then(r=>r.json())).folders.every(g=>g.month==='2026-10'));assert.equal((await f.engine.handle('folders','GET',{},new URLSearchParams({month:'2026-01'})).then(r=>r.json())).folders.length,0);
 }finally{globalThis.fetch=original;}
});
for(const phase of ['list','pdf','metadata'])test('Clearing while '+phase+' is in flight cannot resurrect records or overwrite a new run',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  if(phase==='metadata'){await f.engine.start(true);await drain(f.engine,f.db);for(const row of await f.engine.all()){const {profile,...legacy}=row;await f.db.put('invoice:'+row.uuid,legacy);}await f.engine.summary();}
  else{await f.engine.start(true);if(phase==='pdf'){await f.engine.advance();await f.engine.advance();assert.equal((await f.db.get('job')).phase,'pdf');}}
  let unblock,started;const waiting=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);let blocked=false;
  globalThis.fetch=async(url,options)=>{if(!blocked&&(phase==='pdf'?url.endsWith('/pdf'):url.includes('/inbox?'))){blocked=true;started();await gate;}return f.fetcher(url,options);};
  const pending=f.engine.advance();await waiting;await f.engine.handle('clear-all','POST',{confirm:true});const clearedAt=(await f.engine.status()).clearedAt;
  let newJob;if(phase==='list'){await f.engine.start(true);newJob=await f.db.get('job');assert.equal(newJob.generation,1);}
  unblock();await pending;assert.equal((await f.engine.all()).length,0);assert.equal((await f.db.list({prefix:'blob:'})).size,0);assert.equal((await f.engine.status()).clearedAt,clearedAt);assert.equal((await f.engine.status()).error,null);
  if(newJob){assert.equal((await f.db.get('job')).id,newJob.id);globalThis.fetch=f.fetcher;await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.pdfs,2);}else assert.equal(await f.db.get('job'),undefined);
 }finally{globalThis.fetch=original;}
});
test('Legacy invoice scenarios refresh without downloads, new invoices, notifications or changes to accounting marks',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);
  const row=(await f.engine.all())[0];await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision}],done:true});
  const folder=(await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.month==='2026-10');await f.engine.handle('excel','POST',{folder:folder.id});
  const before=await f.engine.all(),status=await f.engine.status(),used=await f.db.get('totalBytes'),pdfs=f.calls.filter(c=>c.url.endsWith('/pdf')).length,events=f.events.length;
  for(const r of before){const {profile,...legacy}=r;await f.db.put('invoice:'+r.uuid,legacy);}
  await f.db.put('settings',{...await f.engine.settings(),enabled:false});
  f.setRemote([{...remoteInvoice(1,'2026-10-27'),profile:'TICARIFATURA'},remoteInvoice(2,'2026-11-01'),remoteInvoice(3,'2026-11-01')]);
  const summary=await f.engine.summary();assert(summary.updatingTypes);assert(summary.running);
  await drain(f.engine,f.db);
  const after=await f.engine.all();assert.equal(after.length,before.length);assert.equal(f.events.length,events);assert.equal(f.calls.filter(c=>c.url.endsWith('/pdf')).length,pdfs);assert.equal(await f.db.get('totalBytes'),[...f.db.data].filter(([k])=>k.startsWith('blob:')).reduce((n,[,v])=>n+v.length,0));
  for(const r of after){const old=before.find(x=>x.uuid===r.uuid);assert.deepEqual({...r,profile:old.profile},old);}
  const displayed=(await f.engine.handle('invoices','GET').then(r=>r.json())).rows;assert(displayed.some(r=>r.tipLabel==='Ticari - Satış'));assert(displayed.some(r=>r.tipLabel==='Temel - Satış'));
  assert.equal((await f.engine.status()).lastSuccess,status.lastSuccess);assert.equal((await f.engine.status()).lastAttempt,status.lastAttempt);assert.equal((await f.engine.settings()).enabled,false);assert.equal((await f.engine.summary()).updatingTypes,false);
  assert.equal((await f.engine.handle('folders','GET').then(r=>r.json())).folders.find(g=>g.id===folder.id).excel.current,true);
  await f.engine.handle('excel','POST',{folder:folder.id});const excel=await f.engine.handle('export','GET',{},new URLSearchParams({folder:folder.id,excel:'1'}));assert(strFromU8(unzipSync(new Uint8Array(await excel.arrayBuffer()))['xl/worksheets/sheet1.xml']).includes('Ticari - Satış'));
 }finally{globalThis.fetch=original;}
});
test('A failed scenario refresh leaves scan success and invoice files intact and sends no invoice alert',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);const before=await f.engine.all(),status=await f.engine.status(),events=f.events.length;
  for(const r of before){const {profile,...legacy}=r;await f.db.put('invoice:'+r.uuid,legacy);}
  f.failList();await f.engine.summary();await drain(f.engine,f.db);
  assert.equal((await f.engine.status()).lastSuccess,status.lastSuccess);assert.equal((await f.engine.status()).error,status.error);assert((await f.engine.status()).typeRefreshError);assert.equal(f.events.length,events);
  assert.deepEqual((await f.engine.all()).map(r=>r.file),before.map(r=>r.file));assert.equal((await f.engine.summary()).updatingTypes,false);
 }finally{globalThis.fetch=original;}
});
test('New means first discovery in the latest monthly batch; repeats, baseline, old dates and other months stay distinct',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 const processed=remoteInvoice(1,'2026-10-27'),old=remoteInvoice(2,'2026-10-01'),oct=remoteInvoice(3,'2026-10-28'),nov=remoteInvoice(4,'2026-11-01'),later=remoteInvoice(5,'2026-10-30');
 const load=async status=>(await f.engine.handle('invoices','GET',{},new URLSearchParams(status?{status}:{}))).json();
 const sheet=async month=>{const r=await f.engine.handle('month-excel','GET',{},new URLSearchParams({month}));return strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))['xl/worksheets/sheet1.xml']);};
 const statusRow=(xml,no)=>xml.match(/<row\b[^>]*>.*?<\/row>/g).find(row=>row.includes(no));
 try{
  await f.engine.handle('baseline','POST',{numbers:[processed.documentNo]});f.setRemote([processed,old,oct,nov]);await f.engine.start();await drain(f.engine,f.db);
  assert.equal((await load()).total,3);assert.equal((await load('new')).total,2);assert.equal((await load('done')).total,1);assert.equal((await load('waiting')).total,0);assert(!f.calls.some(c=>c.body?.[0]?.id===old.id));
  const firstOct=await sheet('2026-10'),firstNov=await sheet('2026-11');assert(statusRow(firstOct,processed.documentNo).includes('İŞLENDİ'));assert(statusRow(firstOct,oct.documentNo).includes('YENİ GELEN'));assert(!firstOct.includes(nov.documentNo));assert(firstNov.includes(nov.documentNo)&&!firstNov.includes(oct.documentNo));
  const events=f.events.length,firstFile=(await f.db.get('monthly-excel:2026-10')).file.id;f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  assert.equal(f.events.length,events);assert.equal((await load('new')).total,2);assert.equal((await f.db.get('monthly-excel:2026-10')).file.id,firstFile,'An unchanged check does not churn Excel or demote new arrivals');
  f.setRemote([processed,old,oct,nov,later]);f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  const rows=(await load()).rows;assert.equal(rows.find(r=>r.fatno===oct.documentNo).state,'waiting');assert.equal(rows.find(r=>r.fatno===later.documentNo).state,'new');assert.equal(rows.find(r=>r.fatno===nov.documentNo).state,'new','November arrivals do not get moved into October');assert.equal(rows.find(r=>r.fatno===processed.documentNo).state,'done');
  const nextOct=await sheet('2026-10');assert(statusRow(nextOct,oct.documentNo).includes('BEKLENİYOR'));assert(statusRow(nextOct,later.documentNo).includes('YENİ GELEN'));assert(statusRow(nextOct,processed.documentNo).includes('İŞLENDİ'));assert.equal(f.events.length,events+1);assert.equal(f.events.at(-1).count,1);
  const beforeUndo=(await load()).rows.find(r=>r.fatno===processed.documentNo);await f.engine.handle('mark','POST',{items:[{uuid:beforeUndo.uuid,revision:beforeUndo.revision}],done:false});assert.equal((await load()).rows.find(r=>r.uuid===beforeUndo.uuid).state,'waiting','Undoing an old processed invoice never calls it newly arrived');
  f.advanceTime(11*24);assert.equal((await f.engine.summary()).counts.fresh,0);assert((await sheet('2026-10')).includes('BEKLENİYOR'));
 }finally{globalThis.fetch=original;}
});
test('Legacy unmatched October 1 invoices migrate to waiting; imported processed numbers restore completion and no old invoice is announced',async()=>{
 const f=fixture(),at=Date.parse('2026-10-31T06:00:00Z'),old=remoteInvoice(1,'2026-10-01'),done=remoteInvoice(2,'2026-10-01');
 await f.db.put('baseline:'+createHash('sha256').update(done.documentNo).digest('hex'),{at});
 for(const source of [old,done])await f.db.put('invoice:'+source.uuid,{uuid:source.uuid,fatno:source.documentNo,tarih:source.issueDate,unvan:'Synthetic',tip:'SATIS',profile:'TEMELFATURA',tutar:100,birim:'TRY',yanit:'Kanunen kabul',firstSeen:at,done:false,revision:3});
 const summary=await f.engine.summary();assert.equal(summary.counts.fresh,0);assert.equal(summary.counts.waiting,1);assert.equal(summary.counts.done,1);assert.equal(f.events.length,0);
 const rows=(await f.engine.handle('invoices','GET').then(r=>r.json())).rows;assert.equal(rows.find(r=>r.fatno===old.documentNo).state,'waiting');assert.equal(rows.find(r=>r.fatno===done.documentNo).state,'done');assert(rows.every(r=>r.published));
 await f.engine.clearAll();const original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{f.setRemote([remoteInvoice(1,'2026-10-01'),remoteInvoice(2,'2026-10-01')]);await f.engine.start(true);await drain(f.engine,f.db);assert.equal((await f.engine.summary()).counts.total,0,'A reset does not pull old October 1 invoices into a November recent scan');}finally{globalThis.fetch=original;}
});
test('A reset can reacquire a recent invoice but does not announce it as new again',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{await f.engine.start();await drain(f.engine,f.db);const events=f.events.length;await f.engine.clearAll();await f.engine.start(true);await drain(f.engine,f.db);const summary=await f.engine.summary();assert.equal(summary.counts.fresh,0);assert.equal(summary.counts.waiting,2);assert.equal(summary.counts.pdfs,2);assert.equal(f.events.length,events);assert((await f.db.list({prefix:'monthly-excel:'})).size===2);}finally{globalThis.fetch=original;}
});
for(const action of ['clear','mark'])test('A stale monthly Excel snapshot cannot overwrite '+action+' while generation is in flight',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);const row=(await f.engine.all()).find(r=>r.tarih.startsWith('2026-10')),revisionKey='month-revision:2026-10';await f.db.put(revisionKey,(await f.db.get(revisionKey))+1);
  const get=f.db.get;let unblock,started,blocked=false;const gate=new Promise(r=>unblock=r),waiting=new Promise(r=>started=r);
  f.db.get=async key=>{if(!blocked&&key==='monthly-excel:2026-10'){blocked=true;started();await gate;}return get(key);};
  const pending=f.engine.refreshMonthlyExcels();await waiting;
  if(action==='clear')await f.engine.clearAll();else await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision}],done:true});
  unblock();await pending;f.db.get=get;
  if(action==='clear'){assert.equal((await f.db.list({prefix:'monthly-excel:'})).size,0);assert.equal((await f.db.list({prefix:'blob:'})).size,0);assert.equal(await f.db.get('totalBytes'),0);}
  else{const result=await f.engine.handle('month-excel','GET',{},new URLSearchParams({month:'2026-10'})),xml=strFromU8(unzipSync(new Uint8Array(await result.arrayBuffer()))['xl/worksheets/sheet1.xml']);assert(xml.includes('İŞLENDİ'));assert(!xml.includes('YENİ GELEN'));assert.equal((await f.db.get('monthly-excel:2026-10')).revision,await f.db.get(revisionKey));}
 }finally{globalThis.fetch=original;}
});
test('Undoing a processed invoice after a later arrival batch restores waiting rather than reviving the earlier new batch',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
 try{
  await f.engine.start();await drain(f.engine,f.db);let row=(await f.engine.all()).find(r=>r.tarih.startsWith('2026-10'));await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision}],done:true});
  f.setRemote([remoteInvoice(1,'2026-10-27'),remoteInvoice(2,'2026-11-01'),remoteInvoice(3,'2026-10-30')]);f.advanceTime();await f.engine.start();await drain(f.engine,f.db);
  row=(await f.engine.all()).find(r=>r.uuid===row.uuid);assert(row.done);assert.equal(row.arrivalState,'waiting');await f.engine.handle('mark','POST',{items:[{uuid:row.uuid,revision:row.revision}],done:false});
  const display=(await f.engine.handle('invoices','GET').then(r=>r.json())).rows.find(r=>r.uuid===row.uuid);assert.equal(display.state,'waiting');assert.equal((await f.engine.summary()).counts.fresh,2);
 }finally{globalThis.fetch=original;}
});
test('Document validation rejects foreign recipients, wrong identities, DTDs and non-PDF bytes',()=>{
 const row={fatno:'TEST',uuid:'11111111-2222-4333-8444-555555555555'},enc=s=>new TextEncoder().encode(s);
 assert.throws(()=>supplierFromXML(enc('<!DOCTYPE Invoice><Invoice/>'),row,identifier));
 assert.throws(()=>supplierFromXML(enc('<Invoice><ID>WRONG</ID></Invoice>'),row,identifier));
 assert.throws(()=>unwrapDocument(enc('not a pdf'),'pdf'));
 assert.equal(folderName('KİB Dijital Tek','2026-10','2026-11-01'),'KİB Dijital Tek Ekim 2026 Gelen E-Faturalar (01.11.2026)');
 const bytes=makeExcel('KİB Dijital Tek','2026-10','2026-11-01',[{fatno:'<test>',tarih:'2026-10-01',unvan:'Test & <script>',tip:'SATIS',tutar:123.5,birim:'TRY',yanit:'Yanıt gerekmiyor',done:false}]);
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
 const event={id:'event-one',company:'PUSULA',title:'Pusula',body:'Yeni fatura var',created:Date.now()};await enqueueNotification(db,event);await enqueueNotification(db,event);
 assert.equal((await db.list({prefix:'push:outbox:'})).size,1);
 await flushNotifications(db,'https://soyturkworks.com','current',async()=>new Response('',{status:410}));assert.equal((await db.list({prefix:'push:device:'})).size,0);assert.equal((await db.list({prefix:'push:outbox:'})).size,0);
 await db.put('push:device:two',{id:'two',subscription:sub.value,revision:'old'});await enqueueNotification(db,{...event,id:'event-two'});
 await flushNotifications(db,'https://soyturkworks.com','new',()=>assert.fail('Old session must not receive notifications'));
});

test('Test notification leads with the company without repeating the app name or inventing invoices',async()=>{
 const db=storage(),sub=subscription();await db.put('push:device:test-device',{id:'test-device',subscription:sub.value,revision:'current'});
 let payload;
 const response=await pushAPI(db,'https://soyturkworks.com','test','POST',{id:'test-device',company:'PUSULA',companyName:'Pusula',revision:'current'},async(url,options)=>{
  payload=JSON.parse(ece.decrypt(options.body,{version:'aes128gcm',privateKey:sub.client,authSecret:sub.auth}).toString());return new Response('',{status:201});
 });
 assert.equal(response.status,200);assert.equal(payload.title,'Pusula · Bildirim Denemesi');assert(!payload.title.includes('Soyturk Works'));assert.equal(payload.kind,'test');assert(!/\d+ Fatura/.test(payload.title));
});

test('One phone subscription automatically covers every company and one removal disables the device',async()=>{
 const db=storage(),sub=subscription(),call=(action,company,body={})=>pushAPI(db,'https://soyturkworks.com',action,action==='devices'?'GET':'POST',{...body,company,companyName:company,revision:'current'});
 const first=await (await call('subscribe','PUSULA',{subscription:sub.value})).json(),id=first.id;
 assert(first.accountWide);assert.equal((await (await call('devices','COMED')).json()).devices.length,1);
 const event={id:'scoped',company:'PUSULA',title:'Pusula',body:'PDF hazır',created:Date.now()};
 await enqueueNotification(db,event);assert.equal((await db.list({prefix:'push:outbox:'})).size,1);
 const removed=await (await call('unsubscribe','COMED',{id})).json();assert.equal(removed.remaining,0);
 assert.equal((await (await call('devices','PUSULA')).json()).devices.length,0);
 await flushNotifications(db,'https://soyturkworks.com','current',()=>assert.fail('Removed device must not receive queued events'));
});

test('Existing company-scoped subscriptions migrate to account-wide delivery without user action',async()=>{
 const db=storage(),sub=subscription(),id='a'.repeat(64);await db.put('push:device:'+id,{id,subscription:sub.value,revision:'current'});
 const devices=await (await pushAPI(db,'https://soyturkworks.com','devices','GET',{company:'KIB_DIJITAL',revision:'current'})).json();assert.equal(devices.devices.length,1);assert(devices.devices[0].accountWide);
 await enqueueNotification(db,{id:'legacy-global',company:'COMED',title:'Comed',body:'PDF hazır',created:Date.now()});assert.equal((await db.list({prefix:'push:outbox:'})).size,1);
});

test('Completing an in-flight push never recreates a device removed during delivery',async()=>{
 const db=storage(),sub=subscription(),id='b'.repeat(64);await db.put('push:device:'+id,{id,subscription:sub.value,revision:'current',companies:['PUSULA','COMED']});
 await enqueueNotification(db,{id:'in-flight',company:'COMED',title:'Comed',body:'PDF hazır',created:Date.now()});
 await flushNotifications(db,'https://soyturkworks.com','current',async()=>{
  await pushAPI(db,'https://soyturkworks.com','unsubscribe','POST',{id,company:'PUSULA',revision:'current'});
  return new Response('',{status:201});
 });
 assert.equal(await db.get('push:device:'+id),undefined);
});

test('Two-hour digest leads with company names and includes every company count',()=>{
 const event=digestNotification({id:'cycle-one',created:1,results:{PUSULA:{fresh:2,pending:4},COMED:{fresh:1,pending:1}},companies:[{id:'PUSULA',name:'Pusula',connected:true,enabled:true},{id:'COMED',name:'Comed',connected:true,enabled:true},{id:'KIB',name:'Kendine İyi Bak',connected:false,enabled:true}]});
 assert.equal(event.title,'3 Yeni Fatura · Pusula, Comed');assert.equal(event.company,'ALL');assert.equal(event.tag,'invoice-digest');assert.equal(event.count,3);assert.match(event.body,/Pusula: 2 gelen · 4 bekleyen/);assert.match(event.body,/Comed: 1 gelen · 1 bekleyen/);assert.match(event.body,/Kendine İyi Bak: İzibiz bağlantısı yok/);assert(!event.title.includes('Soyturk Works'));
 const waiting=digestNotification({id:'cycle-two',companies:[{id:'PUSULA',name:'Pusula',connected:true,enabled:true}],results:{}});assert.equal(waiting.title,'Tüm Firmalar · Kontrol Sürüyor');assert.match(waiting.body,/Pusula: kontrol sürüyor/);
});
