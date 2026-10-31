import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
const portable=JSON.parse(html.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
const live=html.replace(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>[\s\S]*?<\/script>/,'');

for(const [name,source] of [['web',live],['portable',portable]]){
 test(name+': saved mixed-case company mappings and custom titles use Turkish capitals',()=>{
  const context={ENTEGRATOR_MAP:{'pusulafinansal.com':'KİB Dijital Sağlık Tek. A.Ş.','custom.invalid':'Kendine İyi Bak A.Ş.'}};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function detectEntegrator('),source.indexOf('/* ============ MAP EDITOR UI')),context);
  assert.equal(context.detectEntegrator('pusulafinansal.com'),'KİB DİJİTAL SAĞLIK TEK. A.Ş.');
  assert.equal(context.detectEntegrator('custom.invalid'),'KENDİNE İYİ BAK A.Ş.');
  const input={value:'KİB Dijital Sağlık Tek. A.Ş.',selectionStart:4,selectionEnd:4,setSelectionRange(a,b){assert.equal(a,4);assert.equal(b,4);},addEventListener(event,handler){this.handler=handler;}};
  context.document={getElementById:()=>input};
  const start=source.indexOf("document.getElementById('titleInput').addEventListener('input'");
  vm.runInContext(source.slice(start,source.indexOf('async function buildAndDownloadExcel',start)),context);
  input.handler.call(input);assert.equal(input.value,'KİB DİJİTAL SAĞLIK TEK. A.Ş.');
 });
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
  const document={dispatchEvent(){},getElementById(id){if(!elements.has(id))elements.set(id,{style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});return elements.get(id);}};
  const context={document,parsedRows:[{fatno:'TEST-1',isRet:false},{fatno:'TEST-2',isRet:false},{fatno:'TEST-3',isRet:true}],eskiIslenmisSet:null,eskiToplamAdet:0,efaturaUploads:{reference:{token:0,loading:false,error:''},raw:{token:0,loading:false,error:''}},ef115:{selected:new Set()},normFatno:s=>s,ef115Render(){},updateCounts(){},renderEfaturaUploads(){},Event,setTimeout(){},toast(){},console};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function applyMatching(){'),source.indexOf('function ef116Period(')),context);
  context.applyMatching();assert(context.parsedRows.every(r=>r.islendi===false));
  context.eskiIslenmisSet=new Set(['TEST-1','TEST-3']);context.applyMatching();assert.deepEqual(context.parsedRows.map(r=>r.islendi),[true,false,false]);
  vm.runInContext(source.slice(source.indexOf('function resetEfaturaModule(){'),source.indexOf("document.getElementById('efaturaClearBtn').addEventListener")),context);
  document.getElementById('step2').attrs['data-locked']='true';context.resetEfaturaModule();
  assert.equal(context.parsedRows.length,0);assert.equal(context.eskiIslenmisSet,null);
  assert.equal(document.getElementById('step2').attrs['data-locked'],undefined);assert.equal(document.getElementById('step3').attrs['data-locked'],'true');
  assert(!/<section[^>]*id="step2"[^>]*data-locked/.test(source));
  assert(!source.includes('Önce eski Excel dosyasını yükle'));
 });
 test(name+': reference workbooks accept late headers, legacy labels and multiple worksheets',()=>{
  const context={XLSX:{utils:{sheet_to_json:sheet=>sheet}}};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function normFatno('),source.indexOf('/* ============ HELPERS')),context);
  const sheet=[...Array.from({length:8},()=>['Başlık']),['FATURA\nNUMARASI'],[' test 1 '],['TEST2'],['GENEL TOPLAM']];
  const result=context.referenceNumbers({SheetNames:['Kapak','Faturalar','Diğer'],Sheets:{Kapak:[['Açıklama']],Faturalar:sheet,Diğer:[['Fatura No.'],['TEST2'],['TEST3']]}});
  assert.deepEqual([...result],['TEST1','TEST2','TEST3']);
  assert.equal(context.extractFatnoList(sheet).headerIdx,8);
  assert.throws(()=>context.referenceNumbers({SheetNames:['Kapak'],Sheets:{Kapak:[['Boş dosya']]}}),/sütunu bulunamadı/);
  assert.equal(context.referenceNumbers({SheetNames:['Boş şablon'],Sheets:{'Boş şablon':[['Fatura No']]}}).length,0);
 });
 test(name+': upload failures survive table redraws until a retry or reset',()=>{
  const nodes={ef115Loaded1:{dataset:{}},ef115Loaded2:{dataset:{}}};
  const context={document:{getElementById:id=>nodes[id]},parsedRows:[{fatno:'TEST1'}],eskiIslenmisSet:null,eskiToplamAdet:0};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const efaturaUploads='),source.indexOf('// Fatura No\'ları')),context);
  vm.runInContext("efaturaUploads.reference.error='Eski Excel okunamadı';renderEfaturaUploads();renderEfaturaUploads();",context);
  assert.equal(nodes.ef115Loaded1.textContent,'Eski Excel okunamadı');assert.equal(nodes.ef115Loaded1.dataset.state,'error');
  assert.equal(nodes.ef115Loaded2.textContent,'✓ 1 fatura yüklendi');
 });
}
