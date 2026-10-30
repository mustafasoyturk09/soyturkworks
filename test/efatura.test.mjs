import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
const portable=JSON.parse(html.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
const live=html.replace(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>[\s\S]*?<\/script>/,'');

for(const [name,source] of [['web',live],['portable',portable]]){
 test(name+': Excel dropzones support one picker per click, keyboard and dropped files',()=>{
  class Element extends EventTarget{
   attrs={};classList={add(){},remove(){}};clicks=0;
   setAttribute(k,v){this.attrs[k]=v;}
   querySelector(){return {textContent:'Excel seç'};}
   click(){this.clicks++;}
  }
  const dz=new Element(),input=new Element(),files=[];
  const context={document:{getElementById:id=>id==='dz'?dz:input}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function setupDropzone('),source.indexOf('// ADIM 1: ESKİ')),context);
  context.setupDropzone('dz','file',file=>files.push(file));
  dz.dispatchEvent(new Event('click'));assert.equal(input.clicks,1);
  const bubbled=new Event('click');Object.defineProperty(bubbled,'target',{value:input});dz.dispatchEvent(bubbled);assert.equal(input.clicks,1);
  for(const key of ['Enter',' ']){const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:key});dz.dispatchEvent(event);assert(event.defaultPrevented);}
  assert.equal(input.clicks,3);assert.equal(dz.tabIndex,0);assert.equal(dz.attrs.role,'button');
  input.files=[{name:'selected.xlsx'}];input.dispatchEvent(new Event('change'));
  const dropped=new Event('drop',{cancelable:true});Object.defineProperty(dropped,'dataTransfer',{value:{files:[{name:'dropped.xlsx'}]}});dz.dispatchEvent(dropped);
  assert.deepEqual(files.map(f=>f.name),['selected.xlsx','dropped.xlsx']);assert(dropped.defaultPrevented);
 });
 test(name+': new uploads stay available after reset and a late reference rematches invoices',()=>{
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});return elements.get(id);}};
  const context={document,parsedRows:[{fatno:'TEST-1',isRet:false},{fatno:'TEST-2',isRet:false},{fatno:'TEST-3',isRet:true}],eskiIslenmisSet:null,eskiToplamAdet:0,ef115:{selected:new Set()},normFatno:s=>s,ef115Render(){},setTimeout(){},toast(){},console};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function applyMatching(){'),source.indexOf('function ef116Period(')),context);
  context.applyMatching();assert(context.parsedRows.every(r=>r.islendi===false));
  context.eskiIslenmisSet=new Set(['TEST-1','TEST-3']);context.applyMatching();assert.deepEqual(context.parsedRows.map(r=>r.islendi),[true,false,false]);
  vm.runInContext(source.slice(source.indexOf('function resetEfaturaModule(){'),source.indexOf("document.getElementById('efaturaClearBtn').addEventListener")),context);
  document.getElementById('step2').attrs['data-locked']='true';context.resetEfaturaModule();
  assert.equal(context.parsedRows.length,0);assert.equal(context.eskiIslenmisSet,null);
  assert.equal(document.getElementById('step2').attrs['data-locked'],undefined);assert.equal(document.getElementById('step3').attrs['data-locked'],'true');
  assert(!/<section[^>]*id="step2"[^>]*data-locked/.test(source));
 });
}
