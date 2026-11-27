import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
const code=html.slice(html.lastIndexOf('  function s102Warnings('),html.lastIndexOf('  function s102AutoSave('));
const ctx={activeCompany:'PUSULA',s151HardIssues:r=>r.hard||[],s102Signature:()=> 'signature',s149ExistingMatch:()=>false,s151Title:r=>r.title,s151Lookup:(_c,v)=>v==='1234567890'?{known:true,code:'120.01.007'}:{branch:true,candidates:[],code:''}};
vm.runInNewContext(code,ctx);
test('Restored XML recovers known account match after transient metadata was removed',()=>{
  const row={sourceKind:'xml',sourceVkn:'1234567890',vkn:'1234567890',title:'TEST',arpCode:'120.01.007'};
  assert.equal(ctx.s102Warnings(row).length,0);
  assert(ctx.s102Warnings({...row,arpCode:'120.01.999'}).length);
});
test('Unknown branches, conflicting identities and non-XML remain flagged',()=>{
  const row={sourceKind:'xml',vkn:'9999999999',arpCode:'120.01.007'};
  assert(ctx.s102Warnings(row).length);
  assert(ctx.s102Warnings({...row,vkn:'1234567890',hard:['conflict']}).length);
  assert(ctx.s102Warnings({...row,sourceKind:'pdf',vkn:'1234567890'}).length);
});
