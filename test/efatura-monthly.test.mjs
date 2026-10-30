import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
const portable=JSON.parse(html.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
const live=html.replace(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>[\s\S]*?<\/script>/,'');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const companies=['PUSULA','COMED','KIB','DIJITAL_GARAJ','KIB_DIJITAL'];
function fixture(source,company='PUSULA',saved=new Map(),seed=null){
 const nodes=new Map(),storage={getItem:key=>saved.get(company+':'+key)??null,setItem:(key,value)=>saved.set(company+':'+key,value)};
 const document={getElementById(id){if(id==='fc153PortableData')return seed?{textContent:JSON.stringify(seed)}:null;if(!nodes.has(id))nodes.set(id,{style:{},dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});return nodes.get(id);},dispatchEvent(){}};
 const context={window:{SWWorkspace:{companyId:company,storage}},document,parsedRows:[],eskiIslenmisSet:null,eskiToplamAdet:0,efaturaUploads:{reference:{token:0},raw:{token:0}},ef115:{selected:new Set()},renderEfaturaUploads(){},ef115Render(){},setTimeout(){},toast(){},Event,console};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function normFatno('),source.indexOf('// Biçimlenmiş Excel')),context);
 vm.runInContext(source.slice(source.indexOf('// Monthly totals'),source.indexOf('const efaturaUploads=')),context);
 context.monthly=vm.runInContext('efMonthly',context);
 return {context,nodes,saved,storage};
}
for(const [name,source] of [['web',live],['portable',portable]]){
 test(name+': all companies retain unique monthly invoice totals across reloads and Istanbul month/year boundaries',()=>{
  const saved=new Map(),october=new Date('2026-10-31T20:59:59Z'),november=new Date('2026-10-31T21:00:00Z'),january=new Date('2026-12-31T21:00:00Z');
  for(const company of companies){
   const {context}=fixture(source,company,saved),monthly=context.monthly;
   monthly.record([{fatno:' test 1 ',tarih:'01.10.2026'},{fatno:'TEST1',tarih:'01.10.2026'},{fatno:'TEST2',tarih:'2026-10-02',isRet:true}]);
   assert.equal(monthly.summary(october).total,2);assert.equal(monthly.summary(october).label,'EKİM 2026');
   assert.equal(monthly.summary(november).label,'KASIM 2026');assert.equal(monthly.summary(november).total,0);
   monthly.record([{fatno:'TEST1',tarih:'01.10.2026'},{fatno:'LATE-OCTOBER',tarih:'31.10.2026'},{fatno:'TEST3',tarih:'01.11.2026'}]);assert.equal(monthly.summary(november).total,1);assert.equal(monthly.summary(november,'2026-10').total,3);
   const reopened=fixture(source,company,saved).context.monthly;assert.equal(reopened.summary(october).total,3);assert.equal(reopened.summary(november).total,1);
   assert.equal(reopened.summary(january).label,'OCAK 2027');assert.equal(reopened.summary(january).total,0);
   reopened.record([{fatno:'TEST4',tarih:'01.01.2027'}]);assert.equal(reopened.summary(january).total,1);
  }
  assert.equal(saved.size,5);
 });
 test(name+': Clear blanks the three temporary card values and descriptions while retaining the monthly total',()=>{
  const {context,nodes}=fixture(source);context.monthly.record([{fatno:'TEST1',tarih:today()}]);context.parsedRows=[{fatno:'TEST1',islendi:false,isRet:false}];context.eskiIslenmisSet=new Set(['OLD']);context.eskiToplamAdet=1;
  vm.runInContext(source.slice(source.indexOf('function updateCounts(){'),source.indexOf('function renderNewInvoiceBanner(){')),context);
  context.updateCounts();assert.equal(nodes.get('cntRef').textContent,1);assert.equal(nodes.get('cntYeni').textContent,1);
  vm.runInContext(source.slice(source.indexOf('function resetEfaturaModule(){'),source.indexOf("document.getElementById('efaturaClearBtn').addEventListener")),context);context.resetEfaturaModule();
  for(const id of ['cntRef','cntHam','cntYeni','cntYeniSub'])assert.equal(nodes.get(id).textContent,'',id);
  assert.equal(nodes.get('cntIslenmis').textContent,'1');assert.match(nodes.get('cntMonthlyTitle').textContent,/TOPLAM İŞLENEN E-FATURALAR/);assert.equal(nodes.get('countPanel').style.display,'grid');
 });
 test(name+': parallel tabs merge totals and portable seeds cannot cross company boundaries',()=>{
  const saved=new Map(),a=fixture(source,'PUSULA',saved),b=fixture(source,'PUSULA',saved),now=new Date();
  a.context.monthly.record([{fatno:'A',tarih:today()}]);b.context.monthly.record([{fatno:'B',tarih:today()}]);a.context.monthly.sync();assert.equal(a.context.monthly.summary(now).total,2);
  const seed={workspace:{companyId:'PUSULA'},values:{efatura_monthly_v1:a.context.monthly.serialize()}};
  assert.equal(fixture(source,'PUSULA',new Map(),seed).context.monthly.summary(now).total,2);
  assert.equal(fixture(source,'COMED',new Map(),seed).context.monthly.summary(now).total,0);
 });
 test(name+': portable snapshots include only the active company monthly register',()=>{
  const {context}=fixture(source,'DIJITAL_GARAJ');context.monthly.record([{fatno:'SNAPSHOT1',tarih:today()}]);
  Object.assign(context,{s102MemoryKey:'memory',s102Memory:[],s150ServiceKey:'services',s150Services:[],s151Undo:[],HISTORY_KEYS:{},companyStates:{}});
  vm.runInContext(source.slice(source.indexOf('  function s153Snapshot(){'),source.indexOf('  function s153Json(')),context);
  const snapshot=context.s153Snapshot(),monthly=JSON.parse(snapshot.values.efatura_monthly_v1);
  assert.equal(monthly.company,'DIJITAL_GARAJ');assert.equal(monthly.entries.length,1);assert.equal(monthly.entries[0][0],'SNAPSHOT1');
 });
 test(name+': undated invoices remain separate and join their own month once a valid date arrives',()=>{
  const {context}=fixture(source),now=new Date('2026-11-15T12:00:00Z');
  context.monthly.record([{fatno:'NO-DATE',tarih:''},{fatno:'INVALID-DATE',tarih:'31.02.2026'}]);
  assert.equal(context.monthly.summary(now).total,0);assert.equal(context.monthly.summary(now).undated,2);
  context.monthly.record([{fatno:'NO-DATE',tarih:'31.10.2026'}]);
  assert.equal(context.monthly.summary(now).total,0);assert.equal(context.monthly.summary(now,'2026-10').total,1);assert.equal(context.monthly.summary(now).undated,1);
 });
 test(name+': unavailable browser storage keeps the session total and reports the saving failure',()=>{
  const {context,storage}=fixture(source);storage.setItem=()=>{throw Error('Quota');};context.monthly.record([{fatno:'A',tarih:today()}]);
  assert.equal(context.monthly.summary().total,1);assert.equal(context.monthly.summary().saveFailed,true);
 });
}
