import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const runtime=await readFile(new URL('../dist/app/runtime.js',import.meta.url),'utf8');

for(const [name,src,blocked] of [
 ['optional third-party analytics','https://static.cloudflareinsights.com/beacon.min.js',false],
 ['required local library','https://soyturkworks.com/assets/vendor/xlsx.full.min.js',true]
])test('Loading failure: '+name,()=>{
 const windowEvents={},documentEvents={};
 const element=()=>({style:{},setAttribute(){},replaceChildren(){},append(){},remove(){}});
 const document={body:element(),getElementById:element,createElement:element,createTextNode:s=>s,
  addEventListener(name,fn){documentEvents[name]=fn;}};
 const window={addEventListener(name,fn){windowEvents[name]=fn;}};
 for(const name of ['XLSX','ExcelJS','pdfjsLib','PDFLib','fontkit','JSZip'])window[name]={};
 vm.runInNewContext(runtime,{window,document,URL,
  location:{href:'https://soyturkworks.com/',origin:'https://soyturkworks.com'},
  localStorage:{setItem(){},removeItem(){}}});
 windowEvents.error({target:{tagName:'SCRIPT',src}});
 windowEvents.load();
 let prevented=false;
 documentEvents.click({target:{closest(){return {}; }},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
 assert.equal(prevented,blocked);
});
