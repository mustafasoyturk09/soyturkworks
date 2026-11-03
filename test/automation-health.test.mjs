import test from 'node:test';
import assert from 'node:assert/strict';
import {automationHealth} from '../server/automation-health.mjs';

test('Automation health separates incomplete firms and queued delivery without private data',async()=>{
  const now=Date.now(),data=new Map([
    ['push:cycle:a',{created:now,manual:false,companies:[{id:'PUSULA',name:'private-company'},{id:'COMED'}],results:{PUSULA:{status:'completed',fresh:123,error:'private-error'}}}],
    ['push:device:a',{revision:2,subscription:{endpoint:'private-endpoint'}}],
    ['push:device:b',{revision:1}],['push:outbox:a',{attempts:2,event:{body:'private-invoice'}}],['automation:next-check',now+1000]
  ]);
  const storage={list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),get:async k=>data.get(k),getAlarm:async()=>now+1000};
  const health=await automationHealth(storage,2,now);
  assert.equal(health.activeDevices,1);assert.equal(health.devices,2);assert.equal(health.queued,1);assert.equal(health.retrying,1);
  assert.deepEqual(health.cycles[0].companies,[{id:'PUSULA',status:'completed',error:true,startError:false},{id:'COMED',status:'pending',error:false,startError:false}]);
  assert(!JSON.stringify(health).includes('private-'));
});
