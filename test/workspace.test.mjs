import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../src/workspace.js',import.meta.url),'utf8');
function workspace(id,local=new Map(),tabs=new Map(),seed=null){
  const storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
  const window={SW_CONTEXT:{company:{id}},localStorage:storage(local),sessionStorage:storage(tabs)};
  const document={readyState:'loading',addEventListener(){},getElementById:()=>seed?{textContent:JSON.stringify(seed)}:null};
  vm.runInNewContext(script,{window,document});return window.SWWorkspace;
}
test('All five workspaces isolate records, preferences and image databases',()=>{
  const local=new Map(),tabs=new Map();
  const ids=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'];
  for(const id of ids){const w=workspace(id,local,tabs);assert.equal(w.storage.getItem('notes'),null);w.storage.setItem('notes',id);w.session.setItem('page',id);assert(w.allows(id));assert(!w.allows('OTHER'));}
  for(const id of ids){const w=workspace(id,local,tabs);assert.equal(w.storage.getItem('notes'),id);assert.equal(w.session.getItem('page'),id);assert(w.databaseName('images').includes(':'+id+':'));w.storage.removeItem('notes');assert.equal(w.storage.getItem('notes'),null);}
  assert.throws(()=>workspace('UNKNOWN'));
});
test('Legacy migration copies only records explicitly assigned to the selected company and preserves originals',()=>{
  const records=JSON.stringify([{company:'PUSULA',code:'P'},{company:'KIB',code:'K'},{code:'unassigned'}]);
  const key='fc153:fc153-test-copy:fc_sales_branch_memory_v1';
  const local=new Map([[key,records],['fc_notes_v1','legacy-notes'],['sf_receipts_v1','legacy-receipts']]);
  const p=workspace('PUSULA',local),k=workspace('KIB',local),c=workspace('COMED',local);
  assert.deepEqual(JSON.parse(p.storage.getItem(key)),[{company:'PUSULA',code:'P'}]);
  assert.deepEqual(JSON.parse(k.storage.getItem(key)),[{company:'KIB',code:'K'}]);
  assert.deepEqual(JSON.parse(c.storage.getItem(key)),[]);
  assert.equal(local.get(key),records);
  assert.equal(p.storage.getItem('fc_notes_v1'),null);
  assert.equal(k.storage.getItem('sf_receipts_v1'),null);
  assert.equal(local.get('fc_notes_v1'),'legacy-notes');
  const work=JSON.stringify({PUSULA:[{company:'KIB',id:'wrong'},{company:'PUSULA',id:'p'}],KIB:[{company:'KIB',id:'k'}]});
  assert.deepEqual(JSON.parse(p.filterCompanyValue('fc_sales_work_v156',work)),{PUSULA:[{company:'PUSULA',id:'p'}]});
});
test('Portable and deployed app retain company guards and synchronized workspace assets',async()=>{
  const source=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
  const template=JSON.parse(source.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const web=source.replace(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>[\s\S]*?<\/script>/,'');
  assert(template.includes(script));
  for(const app of [template,web]){
    assert(!app.includes('id="page-home"'));
    assert(app.includes('if(!window.SWWorkspace.allows(company))return;'));
    assert(app.includes('window.SWWorkspace.databaseName('));
    assert(!/(?<![\w.])localStorage\./.test(app.replace(/<script>\/\* Company context is fixed[\s\S]*?<\/script>/,'')));
    assert(app.includes("workspace:{companyId:window.SWWorkspace.companyId}"));
  }
});
