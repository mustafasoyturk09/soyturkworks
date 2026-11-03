import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Use the production owner methods with a minimal Durable Object host. Invoice
// network/crypto and the actual Cloudflare host are covered by other suites.
const source=(await readFile(new URL('../server/worker.mjs',import.meta.url),'utf8'))
  .replace("import {DurableObject} from 'cloudflare:workers';",'class DurableObject {constructor(ctx){this.ctx=ctx;}}')
  .replace(/from '([^']+)'/g,(_,path)=>"from '"+(path.startsWith('.')?new URL('../server/'+path,import.meta.url).href:import.meta.resolve(path))+"'");
const {AuthStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('The durable owner alarm starts the scheduled slot without cron or a browser and arms the next slot',async t=>{
  const now=Date.parse('2026-11-03T08:00:00Z');t.mock.timers.enable({apis:['Date'],now});
  const data=new Map([['account',{revision:'synthetic'}],['automation:next-check',now]]);let alarm=null,queue=Promise.resolve();
  const tx={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>{data.set(k,structuredClone(v));},delete:async keys=>{for(const k of [keys].flat())data.delete(k);},list:async({prefix=''})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),getAlarm:async()=>alarm,setAlarm:async at=>{alarm=at;}};
  const storage={...tx,transaction(fn){const run=queue.then(()=>fn(tx));queue=run.catch(()=>{});return run;}};
  const owner=new AuthStore({storage},{APP_ORIGIN:'https://example.invalid'}),calls=[];
  owner.companies=async()=>[{id:'PUSULA',name:'Pusula',active:true,deleted:false}];
  await storage.put('izibiz:config:PUSULA',{synthetic:true});
  owner.companyArchive=async(id,action,method,body)=>{calls.push({id,action,body});return Response.json({running:true});};
  owner.flushPush=async()=>{};
  await owner.alarm();
  assert(calls.some(c=>c.id==='PUSULA'&&c.action==='tick'&&c.body.cycleId));
  assert.equal(await storage.get('automation:next-check'),now+2*3600000);
  assert(alarm>now&&alarm<=now+60000);
  const cycleId=calls[0].body.cycleId;
  await owner.cycles().record({cycleId,company:'PUSULA',fresh:0});
  const prior=(await storage.list({prefix:'push:event:'})).size;
  await owner.handle(new Request('https://automation.internal/tick',{method:'POST',body:JSON.stringify({slot:now})}));
  assert.equal((await storage.list({prefix:'push:event:'})).size,prior);
  assert.equal((await storage.list({prefix:'push:cycle:'})).size,1);
});
