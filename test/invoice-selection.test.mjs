import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/automation/app.js',import.meta.url),'utf8');
function functions(from,to){return source.slice(source.indexOf(from),source.indexOf(to));}
function fixture(api){
 const checkbox={setAttribute(){},checked:false,indeterminate:false,disabled:false},nodes=new Map();
 const context=vm.createContext({URLSearchParams,Map,Set,console,api,company:'PUSULA',companyContext:{id:'PUSULA'},status:'waiting',month:'2026-11',query:'test',rows:[],offset:0,more:true,selected:new Map(),invoiceRequest:0,selectingAll:false,marking:false,notices:[],
  $:id=>{if(!nodes.has(id))nodes.set(id,{querySelector:()=>checkbox,querySelectorAll:()=>[]});return nodes.get(id);},
  apiURL:(id,action)=>'/api/automation/'+id+'/'+action,renderUndo(){},renderInvoicePagination(){},invoiceHeader:()=>'<header>',invoiceHTML:r=>r.uuid,empty:()=>'',notice(text){context.notices.push(text);}});
 vm.runInContext(functions('function renderSelection(){','async function mark('),context);
 return {context,checkbox,nodes,run:code=>vm.runInContext(code,context)};
}

test('Select all reads every filtered page, excludes rejected rows and supports partial and cleared selection',async()=>{
 const data=Array.from({length:205},(_,i)=>({uuid:String(i),isRet:i===204})),calls=[];
 const f=fixture(async url=>{const p=new URL(url,'https://example.test').searchParams;calls.push(p);return {rows:data.slice(+p.get('offset'),+p.get('offset')+100),total:data.length};});
 await f.run('selectAllInvoices(true)');
 assert.equal(f.context.selected.size,204);assert.equal(f.context.rows.length,205);assert.equal(f.context.more,false);assert.equal(f.checkbox.checked,true);assert.equal(f.checkbox.indeterminate,false);
 assert.deepEqual(calls.map(p=>p.get('offset')),['0','100','200']);for(const p of calls){assert.equal(p.get('month'),'2026-11');assert.equal(p.get('status'),'waiting');assert.equal(p.get('q'),'test');}
 f.context.selected.delete('PUSULA:0');f.run('renderSelection()');assert.equal(f.checkbox.checked,false);assert.equal(f.checkbox.indeterminate,true);
 await f.run('selectAllInvoices(false)');assert.equal(f.context.selected.size,0);assert.equal(f.checkbox.checked,false);assert.equal(f.checkbox.indeterminate,false);
});

test('Selection loading errors preserve the existing list and cannot silently select a partial batch',async()=>{
 let n=0;const f=fixture(async()=>{if(n++)throw Error('Network unavailable');return {rows:Array.from({length:100},(_,i)=>({uuid:String(i)})),total:101};});
 f.context.rows=[{uuid:'previous',company:{id:'PUSULA'}}];await f.run('selectAllInvoices(true)');
 assert.equal(f.context.rows[0].uuid,'previous');assert.equal(f.context.selected.size,0);assert.equal(f.context.selectingAll,false);assert.deepEqual(f.context.notices,['Network unavailable']);
});

test('Changing filters or clearing selection while loading discards the late result',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.run('selectAllInvoices(true)');
 assert.equal(f.checkbox.disabled,true);f.context.invoiceRequest++;resolve({rows:[{uuid:'old-filter'}],total:1});await pending;
 assert.equal(f.context.selected.size,0);assert.equal(f.context.rows.length,0);assert.equal(f.context.selectingAll,false);
});

test('Empty and rejected-only lists do not select invoices',async()=>{
 for(const data of [[],[{uuid:'rejected',isRet:true}]]){const f=fixture(async()=>({rows:data,total:data.length}));await f.run('selectAllInvoices(true)');assert.equal(f.context.selected.size,0);assert.equal(f.checkbox.checked,false);assert.equal(f.checkbox.disabled,true);}
});

test('Preview and download remain separate on Windows, Mac and mobile',()=>{
 for(const platform of ['Win32','MacIntel','iPhone','Linux armv8l']){
  const context=vm.createContext({URLSearchParams,navigator:{userAgent:platform,platform},apiURL:()=>'/api/automation/PUSULA/pdf'});vm.runInContext(functions('function pdfLink(','function invoiceHTML('),context);
  const preview=vm.runInContext("pdfLink('PUSULA','test')",context),download=vm.runInContext("pdfLink('PUSULA','test',true)",context);
  assert(!preview.includes('download=1'));assert(preview.includes('target="_blank"'));assert(download.includes('download=1'));assert(!download.includes('target="_blank"'));
  const actions=vm.runInContext("pdfActions('PUSULA','test')",context);assert(actions.includes('PDF önizle'));assert(actions.includes('PDF indir'));
 }
});
