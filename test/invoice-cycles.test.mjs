import test from 'node:test';
import assert from 'node:assert/strict';
import {InvoiceCycles} from '../server/invoice-cycles.mjs';
import {allNotificationMonthCounts,statusNotifications,notificationMonthCounts,notificationSections} from '../server/notification-format.mjs';

function fixture(){
  const data=new Map();let queue=Promise.resolve(),now=Date.parse('2026-11-03T06:00:00Z');
  const tx={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async keys=>{for(const k of [keys].flat())data.delete(k);},list:async({prefix=''})=>new Map([...data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))};
  const storage={...tx,transaction(fn){const run=queue.then(async()=>{const before=structuredClone(data);try{return await fn(tx);}catch(e){data.clear();for(const [k,v] of before)data.set(k,v);throw e;}});queue=run.catch(()=>{});return run;}};
  const companies=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'].map(id=>({id,name:id,active:true,deleted:false}));
  const calls=[],schedules=[],disconnected=new Set(),disabled=new Set(),failed=new Set();
  const cycles=new InvoiceCycles({storage,now:()=>now,companies:async()=>companies,connected:async id=>!disconnected.has(id),schedule:async at=>schedules.push(at),archive:async(id,action,method,body)=>{
    calls.push({id,action,method,body});if(failed.has(id))throw Error('Synthetic unavailable');
    if(body?.enableTracking)disabled.delete(id);
    return Response.json(action==='notification-summary'?{enabled:!disabled.has(id),monthly:[{month:'2026-11',count:0}]}:disabled.has(id)?{skipped:true,reason:'disabled'}:{running:true});
  }});
  return {cycles,storage,data,calls,schedules,disconnected,disabled,failed,advance:ms=>now+=ms,events:async()=>[...(await tx.list({prefix:'push:event:'})).values()]};
}

test('Every connected company starts from one manual request; disabled tracking is explicitly enabled',async()=>{
  const f=fixture(),result=await f.cycles.begin({manual:true});assert.equal(result.started,5);
  assert.equal(f.calls.length,5);assert(f.calls.every(c=>c.action==='scan'&&c.body.enableTracking&&c.body.cycleId===result.id));
  assert(f.schedules.length);assert(await f.storage.get('push:cycle:'+result.id));
});
test('A fast company notifies immediately, zero arrivals notify too, and late results survive the old eight minute deadline',async()=>{
  const f=fixture(),{id}=await f.cycles.begin();
  await f.cycles.record({cycleId:id,company:'PUSULA',fresh:0,allMonthly:[{month:'2026-10',count:22},{month:'2026-11',count:2}]});
  let events=await f.events();assert.equal(events.length,1);assert.match(events[0].body,/Ekim 22 Adet · Kasım 2 Adet/);assert.match(events[0].title,/24 İşlenmemiş Fatura/);
  f.advance(9*60000);await f.cycles.maintain();assert(await f.storage.get('push:cycle:'+id));
  assert.equal((await f.events()).filter(e=>/Kontrol Sürüyor/.test(e.title)).length,4);
  await f.cycles.record({cycleId:id,company:'COMED',fresh:3,monthly:[{month:'2026-11',count:3}]});
  events=await f.events();assert(events.some(e=>e.company==='COMED'&&/3 İşlenmemiş Fatura/.test(e.title)));
  const count=events.length;await f.cycles.record({cycleId:id,company:'COMED',fresh:3});assert.equal((await f.events()).length,count);
});
test('Duplicate scheduled trigger never erases earlier company results or sends them again',async()=>{
  const f=fixture(),{id}=await f.cycles.begin();
  await f.cycles.record({cycleId:id,company:'PUSULA',fresh:1});
  await Promise.all([f.cycles.begin(),f.cycles.begin()]);
  assert.equal((await f.events()).length,1);assert.equal((await f.storage.get('push:cycle:'+id)).results.PUSULA.fresh,1);
});
test('A disconnected, disabled or failed company cannot conceal another company result; failed starts are retried',async()=>{
  const f=fixture();await f.storage.put('automation:all-firms-v2',true);f.disconnected.add('COMED');f.disabled.add('KIB');f.failed.add('DIJITAL_GARAJ');
  const result=await f.cycles.begin();assert.equal(result.results.find(r=>r.id==='COMED').status,'not-connected');assert.equal(result.results.find(r=>r.id==='DIJITAL_GARAJ').status,'error');
  await f.cycles.record({cycleId:result.id,company:'PUSULA',fresh:5});
  let events=await f.events();assert(events.some(e=>e.company==='COMED'&&e.body.includes('bağlantısı yok')));assert(events.some(e=>e.company==='KIB'&&e.body.includes('takip kapalı')));assert(events.some(e=>e.company==='PUSULA'));
  f.failed.clear();f.advance(60000);await f.cycles.maintain();assert(f.calls.filter(c=>c.id==='DIJITAL_GARAJ').length>=2);
  await f.cycles.record({cycleId:result.id,company:'DIJITAL_GARAJ',fresh:0});assert((await f.events()).some(e=>e.company==='DIJITAL_GARAJ'));
});
test('The first scheduled migration enables every connected company once; later pauses remain paused',async()=>{
  const f=fixture();f.disabled.add('KIB');await f.cycles.begin();assert(!f.disabled.has('KIB'));
  f.disabled.add('KIB');f.advance(2*3600000);const result=await f.cycles.begin();assert(f.disabled.has('KIB'));assert.equal(result.results.find(r=>r.id==='KIB').reason,'disabled');
});
test('Concurrent company results persist all five notifications atomically',async()=>{
  const f=fixture(),{id}=await f.cycles.begin();
  await Promise.all(['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'].map(company=>f.cycles.record({cycleId:id,company,fresh:1})));
  const cycle=await f.storage.get('push:cycle:'+id);assert.equal(Object.keys(cycle.results).length,5);assert(cycle.completed);assert.equal((await f.events()).length,5);
});
test('Snapshot includes all archive months across years and splits readable notification pages without losing months',()=>{
  const rows=Array.from({length:20},(_,i)=>({tarih:new Date(Date.UTC(2025,3+i,2)).toISOString().slice(0,10)}));
  rows.push({tarih:'2025-04-05',done:true},{tarih:'2025-04-06',deletedAt:1},{tarih:'2025-04-07',isRet:true});
  const months=allNotificationMonthCounts(rows);assert.equal(months.length,20);assert.equal(months[0].count,1);
  const events=statusNotifications({id:'PUSULA',name:'Pusula'},{allMonthly:months,lastFinished:Date.parse('2026-11-03T06:00Z')},'id',Date.parse('2026-11-03T06:00Z'));
  assert.equal(events.length,4);assert(events.every(e=>e.body.length<500&&Buffer.byteLength(JSON.stringify(e))<3500));assert(events[0].body.includes('Nisan 2025 1 Adet'));assert(events[0].body.includes('Kasım 2026'));
  assert.equal(new Set(events.map(e=>e.tag)).size,4);
});

test('All five companies repeat outstanding totals without a new arrival, with distinct alert tags per control',async()=>{
  const f=fixture(),ids=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'];
  const allMonthly=[{month:'2026-09',count:2},{month:'2026-10',count:3},{month:'2026-11',count:4}];
  for(let round=0;round<2;round++){
    const {id}=await f.cycles.begin();
    for(const company of ids)await f.cycles.record({cycleId:id,company,fresh:round?0:4,allMonthly,monthly:allMonthly.slice(1)});
    f.advance(2*3600000);
  }
  const events=await f.events();assert.equal(events.length,10);assert.equal(new Set(events.map(e=>e.tag)).size,10);
  for(const company of ids){
    const pair=events.filter(e=>e.company===company);assert.equal(pair.length,2);
    for(const event of pair){assert.match(event.title,/9 İşlenmemiş Fatura/);assert.match(event.body,/Ekim 3 Adet · Kasım 4 Adet/);assert.match(event.body,/Önceki aylardan bekleyen: Eylül 2 Adet/);}
  }
});

test('Processed, rejected and deleted invoices leave totals; older outstanding months survive the 15th and year rollover',()=>{
  const rows=[{tarih:'2026-10-01',arrivalState:'waiting',notified:true},{tarih:'2026-11-01',arrivalState:'new',notified:true},{tarih:'2026-11-02',done:true},{tarih:'2026-11-03',isRet:true},{tarih:'2026-11-04',deletedAt:1}];
  assert.deepEqual(notificationMonthCounts(rows,'2026-11-15'),[{month:'2026-10',count:1},{month:'2026-11',count:1}]);
  let sections=notificationSections({allMonthly:allNotificationMonthCounts(rows)},Date.parse('2026-11-15T21:00:00Z'));
  assert.deepEqual(sections,{monthly:[{month:'2026-11',count:1}],olderMonthly:[{month:'2026-10',count:1}],pending:2});
  rows[0].done=true;sections=notificationSections({allMonthly:allNotificationMonthCounts(rows)},Date.parse('2026-11-16T06:00Z'));assert.equal(sections.pending,1);assert.equal(sections.olderMonthly.length,0);
  rows[0].done=false;sections=notificationSections({allMonthly:allNotificationMonthCounts(rows)},Date.parse('2026-12-01T06:00Z'));assert.equal(sections.pending,2);assert.deepEqual(sections.monthly,[{month:'2026-11',count:1},{month:'2026-12',count:0}]);assert.equal(sections.olderMonthly[0].month,'2026-10');
  const event=statusNotifications({id:'COMED',name:'Comed'},{allMonthly:[{month:'2026-12',count:1},{month:'2027-01',count:2}]},'rollover',Date.parse('2027-01-01T06:00Z'))[0];assert.match(event.body,/Aralık 2026 1 Adet · Ocak 2027 2 Adet/);
});
