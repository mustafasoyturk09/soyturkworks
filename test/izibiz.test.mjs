import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {IzibizConnector,validPeriod,invoiceRow,verifyCompany,invoiceReply} from '../server/izibiz.mjs';

const identifier='7330782805',company='PUSULA';
const invoice={id:12,uuid:'11111111-2222-4333-8444-555555555555',documentNo:'TEST202600000001',issueDate:'2026-10-01',direction:'IN',accountingCustomer:{identifier},accountingSupplier:{name:'Test supplier'},amount:'252,00',currency:'TRY',invoiceType:'SATIS',invoiceStatus:'RECEIVED'};
const answer=data=>new Response(JSON.stringify({data,error:null}),{headers:{'Content-Type':'application/json'}});
function fixture(){
  let now=Date.now(),expired=false,wrong=false,readDenied=false,logins=0,jsonDownloads=false;const calls=[],saved=new Map();
  const storage={get:async key=>structuredClone(saved.get(key)),put:async(key,v)=>{saved.set(key,structuredClone(v));},delete:async key=>saved.delete(key)};
  const api=new IzibizConnector({storage,key:randomBytes(32).toString('base64url'),now:()=>now,fetcher:async(url,options)=>{
    calls.push({url,options});assert(url.startsWith('https://api.izibiz.com.tr/'));assert.equal(options.redirect,'manual');
    if(url.endsWith('/auth/token')){logins++;return answer({accessToken:'test-token-'+logins});}
    if(url.endsWith('/customers/me'))return answer({vknTckno:wrong?'9999999999':identifier,commercialName:'Test company'});
    if(readDenied||expired){expired=false;return new Response(JSON.stringify({error:{code:readDenied?'10006':'10004'}}),{status:403,headers:{'Content-Type':'application/json'}});}
    if(url.includes('/inbox?'))return answer({contents:[invoice],pageable:{totalElements:1,totalPages:1}});
    if(url.includes('/download/'))return jsonDownloads?answer({filename:'ignored.pdf',content:Buffer.from('%PDF-1.7\nmock').toString('base64')}):new Response('%PDF-1.7\nmock',{headers:{'Content-Type':'application/pdf'}});
    throw Error('Unexpected endpoint');
  }});
  return {api,saved,calls,connect:()=>api.handle(company,'connect','POST',{username:'test-user',password:'TEST-ONLY-SECRET',identifier}),jsonDownloads:()=>{jsonDownloads=true;},expire:()=>{expired=true;},wrong:()=>{wrong=true;},deny:()=>{readDenied=true;},advance:()=>{now+=6*60000;},logins:()=>logins};
}
const scan={run:'11111111-2222-4333-8444-555555555555',page:0,startDate:'2026-10-01',endDate:'2026-10-30'};
test('The default fetch adapter preserves the native fetch receiver in Workers',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=function(){assert(this===undefined||this===globalThis,'native fetch must not receive the connector as this');return Promise.resolve(answer({ok:true}));};
    const connector=new IzibizConnector({storage:{},key:randomBytes(32).toString('base64url')});
    assert.equal((await connector.remote('/v1/example')).ok,true);
  }finally{globalThis.fetch=original;}
});
test('Izibiz verifies identity and read access before storing company-bound encrypted credentials',async()=>{
  const f=fixture();await f.connect();
  assert(!JSON.stringify([...f.saved]).includes('TEST-ONLY-SECRET'));
  const value=f.saved.get('izibiz:config:PUSULA');assert(value.data&&value.tag);
  assert.equal(f.api.unseal(company,value).username,'test-user');
  assert.throws(()=>f.api.unseal('COMED',value));
  const status=await (await f.api.handle(company,'status','GET',{})).json();assert(status.connected);assert(!JSON.stringify(status).includes('test-token'));
  const wrong=fixture();wrong.wrong();await assert.rejects(wrong.connect(),/eşleşmiyor/);assert.equal(wrong.saved.size,0);
  const denied=fixture();denied.deny();await assert.rejects(denied.connect(),/izin vermedi/);assert.equal(denied.saved.size,0);
});
test('Izibiz refreshes expired sessions once and blocks cross-company invoice downloads',async()=>{
  const f=fixture();await f.connect();f.expire();
  const list=await (await f.api.handle(company,'list','POST',scan)).json();assert.equal(f.logins(),2);assert.equal(list.rows.length,1);
  const download=await f.api.handle(company,'download','POST',{format:'pdf',ticket:list.rows[0].ticket});assert.match(await download.text(),/^%PDF-/);
  f.jsonDownloads();const base64Download=await f.api.handle(company,'download','POST',{format:'pdf',ticket:list.rows[0].ticket});assert.match(await base64Download.text(),/^%PDF-/);
  const config=f.api.unseal(company,f.saved.get('izibiz:config:PUSULA'));
  assert.throws(()=>f.api.verifyTicket('COMED',config,list.rows[0].ticket),/firma değişti/);
  assert.throws(()=>f.api.verifyTicket(company,config,list.rows[0].ticket+'x'),/geçersiz/);
  await assert.rejects(f.api.handle(company,'download','POST',{format:'pdf',ticket:'12'}));
  await assert.rejects(f.api.handle(company,'list','POST',{...scan,run:'22222222-2222-4333-8444-555555555555'}),/beş dakika/);
  f.advance();await f.api.handle(company,'list','POST',scan);assert.equal(f.logins(),3);
  assert(f.calls.every(c=>!/(mark|respond|sendinvoice)/i.test(c.url)));
  await f.api.handle(company,'disconnect','POST',{});await assert.rejects(f.api.handle(company,'list','POST',scan),/bir kez/);
});
test('Izibiz rejects malformed periods, foreign recipients and changed credentials',async()=>{
  for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-30','2026-10-01'],['2020-01-01','2026-10-30']])assert.throws(()=>validPeriod(a,b));
  validPeriod('2026-10-01','2026-10-30');assert.throws(()=>invoiceRow({...invoice,customerSSN:'9999999999',accountingCustomer:null},identifier));
  assert.equal(invoiceRow(invoice,identifier).tutar,252);
  for(const amount of [null,'',undefined,'invalid',Infinity])assert.throws(()=>invoiceRow({...invoice,amount},identifier));
  assert.throws(()=>invoiceRow({...invoice,issueDate:'2026-02-30'},identifier));
  assert.throws(()=>invoiceRow({...invoice,direction:'OUT'},identifier));
  assert.throws(()=>verifyCompany('PUSULA',{identifier:'1234567890',name:'Pusula'}));
  assert.throws(()=>verifyCompany('COMED',{identifier:'1234567890',name:'Dijital Garaj'}));
  verifyCompany('COMED',{identifier:'1234567890',name:'COMED BİLİŞİM'});
  verifyCompany('DIJITAL_GARAJ',{identifier:'1234567890',name:'DİJİTAL GARAJ TEKNOLOJİ'});
  const f=fixture();await f.connect();const list=await (await f.api.handle(company,'list','POST',scan)).json();await f.connect();
  await assert.rejects(f.api.handle(company,'download','POST',{format:'pdf',ticket:list.rows[0].ticket}),/firma değişti/);
});
test('Izibiz controls and Excel bridge are included in portable exports without secrets',async()=>{
  const source=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
  const template=JSON.parse(source.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const script=await readFile(new URL('../src/izibiz.js',import.meta.url),'utf8');new vm.Script(script);
  assert(template.includes(script));assert(template.includes('SWInvoiceBridge'));assert(template.includes('sw-izibiz-ui'));
  assert(script.includes("workspace.databaseName('izibiz-downloads')"));
  assert(script.includes("xml.documentElement.localName!=='Invoice'"));assert(script.includes('İşlem tamamlanmadı'));
  assert(!script.includes('swIziZip'));assert(!script.includes('generateAsync'));assert(!script.includes('Guncel_Izibiz_Listesi.xlsx'));
  assert(!script.includes('localStorage'));assert(!script.includes('accessToken'));
});
test('Portal reply states are preserved independently from delivery labels and response notes',()=>{
  const states={WAITING_FOR_RESPONSE:'Yanıt bekliyor',RECEIVED:'Yanıt gerekmiyor',RESPONSE_TIME_EXPIRED:'Kanunen kabul',REJECTED:'Reddedildi',ACCEPTED:'Kabul edildi'};
  for(const [state,label] of Object.entries(states))assert.equal(invoiceReply({invoiceStatus:state,documentStatus:{label:'Alındı'},responseDescription:'Free form note'}),label);
  assert.equal(invoiceRow({...invoice,invoiceStatus:'WAITING_FOR_RESPONSE'},identifier).yanit,'Yanıt bekliyor');
});
async function fileHelpers(name='Pusula'){
  const window={SWWorkspace:{companyId:'PUSULA',companyName:name}};
  vm.runInNewContext(await readFile(new URL('../src/izibiz.js',import.meta.url),'utf8'),{window,document:{readyState:'loading',addEventListener(){}}});return window.SWIzibizFiles;
}
test('Every company uses a flat folder and full legal names; duplicate PDF/Excel files are safe',async()=>{
  for(const name of ['Pusula','Comed','Kendine İyi Bak','Dijital Garaj','KİB Dijital Tek'])assert.equal((await fileHelpers(name)).folderName(),name+' - Gelen E-Faturalar');
  const helpers=await fileHelpers(),title='ÖRNEK YAZILIM BİLGİSAYAR MEDİKAL İNŞAAT SANAYİ VE TİCARET A.Ş.';
  assert.equal(helpers.pdfName(title,'TEST202600000001'),title+' - TEST202600000001.pdf');
  assert.equal(helpers.pdfName('ÖRNEK LTD. ŞTİ.','TEST2'),'ÖRNEK LTD. ŞTİ. - TEST2.pdf');
  assert.throws(()=>helpers.pdfName('','TEST3'));
  const entries=new Map(),writes=[];
  const target={async getFileHandle(name,options={}){
    if(!entries.has(name)&&!options.create)throw Object.assign(Error('Missing'),{name:'NotFoundError'});
    return {async getFile(){const b=entries.get(name);return {size:b.byteLength,arrayBuffer:async()=>b.slice().buffer};},async createWritable(){return {write:async bytes=>{writes.push(name);entries.set(name,new Uint8Array(bytes));},close:async()=>{},abort:async()=>{}};}};
  }};
  const bytes=new Uint8Array([1,2,3]),name=helpers.pdfName(title,'TEST1');
  assert.equal((await helpers.writeUnique(target,name,bytes)).created,true);
  assert.equal((await helpers.writeUnique(target,name,bytes)).created,false);assert.equal(writes.length,1);
  assert((await helpers.writeUnique(target,name,new Uint8Array([4]))).name.endsWith(' (2).pdf'));
  await helpers.writeUnique(target,'Pusula.xlsx',bytes);assert.equal((await helpers.writeUnique(target,'Pusula.xlsx',bytes)).name,'Pusula (2).xlsx');
  assert([...entries.keys()].every(n=>!n.includes('/')));
});
test('Formatted Excel retains source reply cells for new, processed and rejected invoices',async()=>{
  const source=(await readFile(new URL('../src/app.html',import.meta.url),'utf8')).replace(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>[\s\S]*?<\/script>/,''),start=source.indexOf('async function buildAndDownloadExcel(options={}){');
  const formatter=source.slice(start,source.indexOf('// The connector uses the same comparison',start));
  const cells=new Map(),cell=(row,col)=>{const key=row+':'+col;if(!cells.has(key))cells.set(key,{});return cells.get(key);};
  const sheet={mergeCells(){},getCell:()=>({}),getRow:row=>({getCell:col=>cell(row,col)}),getColumn:()=>({})};
  class Workbook{addWorksheet(){return sheet;}xlsx={writeBuffer:async()=>new Uint8Array([1])};}
  const rows=[{islendi:false,isRet:false,yanit:'Yanıt bekliyor'},{islendi:false,isRet:false,yanit:'Yanıt gerekmiyor'},{islendi:true,isRet:false,yanit:'Kanunen kabul'},{islendi:false,isRet:true,yanit:'Reddedildi'}].map((r,i)=>({...r,fatno:'TEST'+i,tarih:'30.10.2026',unvan:'TEST A.Ş.',tip:'SATIS',tutar:1,birim:'TRY'}));
  const context=vm.createContext({ExcelJS:{Workbook},parsedRows:rows,window:{SWWorkspace:{companyName:'Pusula'}},document:{getElementById:()=>({value:'PUSULA GELEN E-FATURALAR'})},borderAll:()=>({}),HEADER_FILL:'000000',RET_FILL:'000000',YELLOW_FILL:'000000',USD_FILL:'000000',EUR_FILL:'000000',IADE_FILL:'000000'});
  vm.runInContext(formatter,context);await vm.runInContext('buildAndDownloadExcel({returnFile:true})',context);
  rows.forEach((row,i)=>assert.equal(cell(i+3,7).value,row.yanit));
  class DownloadDate extends Date{constructor(){super('2026-10-30T23:30:00Z');}}
  context.Date=DownloadDate;
  for(const companyName of ['Pusula','Comed','Kendine İyi Bak','Dijital Garaj','KİB Dijital Tek']){
    context.window.SWWorkspace.companyName=companyName;
    assert.equal((await vm.runInContext('buildAndDownloadExcel({returnFile:true})',context)).name,companyName+' - Gelen Faturalar (31.10.2026).xlsx');
  }
});
for(const [company,companyName] of [['PUSULA','Pusula'],['COMED','Comed'],['KIB','Kendine İyi Bak'],['DIJITAL_GARAJ','Dijital Garaj'],['KIB_DIJITAL','KİB Dijital Tek']])
test(companyName+': Izibiz distinguishes existing invoices, first use, read errors and custom dates',async()=>{
  const nodes=new Map(),events={},files=new Map(),folders=[],calls=[];let modals=0,loaded=[{fatno:'TEST202600000001',tarih:'01.10.2026',islendi:false}],reference=['TEST202600000001'],referenceError='',loading=false,remoteRows=[{...invoiceRow(invoice,identifier),ticket:'test'}];
  class Node{
    constructor(tag){this.tag=tag;this.hidden=false;this.disabled=false;this.inert=false;this.open=false;}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    set innerHTML(value){this.markup=value;for(const m of value.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)){const n=new Node(m[1]);n.id=m[2];}}
    setAttribute(){}append(){}prepend(){}after(){}addEventListener(){}
    querySelector(){return new Node('span');}querySelectorAll(){return [...nodes.values()].filter(n=>['input','button','fieldset'].includes(n.tag));}
    showModal(){modals++;this.open=true;}close(){this.open=false;}
  }
  const top=new Node('div');top.id='ef115Top';
  const document={readyState:'loading',body:new Node('body'),createElement:tag=>new Node(tag),getElementById:id=>nodes.get(id),addEventListener:(name,callback)=>{events[name]=callback;}};
  const folder={async getFileHandle(name,options={}){if(!files.has(name)&&!options.create)throw Object.assign(Error('Missing'),{name:'NotFoundError'});return {async createWritable(){return {write:async bytes=>files.set(name,bytes),close:async()=>{},abort:async()=>{}};}};}};
  const directory={name:'Downloads',queryPermission:async()=> 'granted',requestPermission:async()=>assert.fail('Permission was already granted'),getDirectoryHandle:async name=>{folders.push(name);return folder;}};
  const indexedDB={open(){const request={result:{transaction(){const tx={objectStore(){return {get(){const req={result:directory};queueMicrotask(()=>{req.onsuccess?.();tx.oncomplete?.();});return req;}};}};return tx;}}};queueMicrotask(()=>request.onsuccess());return request;}};
  const window={SW_CONTEXT:{},SWWorkspace:{companyId:company,companyName,databaseName:name=>company+':'+name},showDirectoryPicker:()=>assert.fail('Stored directory must be reused'),SWInvoiceBridge:{snapshot:()=>({reference,rows:loaded,referenceError,loading}),load:grid=>{loaded=grid.slice(1).map(r=>({fatno:r[0],tarih:r[1],islendi:true,isRet:false}));},excel:async()=>({name:companyName+' - Gelen Faturalar (31.10.2026).xlsx',bytes:new Uint8Array([1])})}};
  vm.runInNewContext(await readFile(new URL('../src/izibiz.js',import.meta.url),'utf8'),{window,document,indexedDB,AbortController,crypto:{randomUUID:()=>scan.run},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-30T23:30:00Z']));}},fetch:async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});return new Response(JSON.stringify(url.endsWith('/status')?{connected:true,configured:true,name:companyName,identifier}:{rows:remoteRows,total:remoteRows.length,pages:1,company,identifier}));
  }});
  events.DOMContentLoaded();await new Promise(resolve=>setImmediate(resolve));await nodes.get('swIziButton').onclick();
  assert.equal(modals,0);assert.deepEqual(folders,[companyName+' - Gelen E-Faturalar']);assert.deepEqual([...files.keys()],[companyName+' - Gelen Faturalar (31.10.2026).xlsx']);
  assert.equal(nodes.get('swIziProgress').hidden,false);assert.match(nodes.get('swIziInlineStatus').textContent,/Yeni fatura yok/);
  assert(calls.some(c=>c.url.endsWith('/list')));assert(!calls.some(c=>c.url.endsWith('/download')));
  const first=calls.find(c=>c.url.endsWith('/list')).body;
  assert.equal(first.startDate,'2026-10-01');assert.equal(first.endDate,'2026-10-31');
  const before=calls.length;referenceError='Eski Excel okunamadı';await nodes.get('swIziButton').onclick();assert.equal(calls.length,before);assert.match(nodes.get('swIziInlineStatus').textContent,/Eski Excel okunamadı/);
  referenceError='';loading=true;await nodes.get('swIziButton').onclick();assert.equal(calls.length,before);assert.match(nodes.get('swIziInlineStatus').textContent,/okunuyor/);
  loading=false;reference=null;loaded=[];remoteRows=[];await nodes.get('swIziButton').onclick();
  assert(calls.length>before);assert.match(nodes.get('swIziInlineStatus').textContent,/tarih aralığında gelen fatura yok/);
  nodes.get('swIziFrom').value='2026-09-01';nodes.get('swIziFrom').onchange();nodes.get('swIziTo').value='2026-09-30';await nodes.get('swIziButton').onclick();
  const custom=calls.filter(c=>c.url.endsWith('/list')).at(-1).body;assert.equal(custom.startDate,'2026-09-01');assert.equal(custom.endDate,'2026-09-30');
});
