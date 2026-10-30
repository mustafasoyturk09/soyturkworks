import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {IzibizConnector,validPeriod,invoiceRow,verifyCompany} from '../server/izibiz.mjs';

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
  assert(script.includes("xml.documentElement.localName!=='Invoice'"));assert(script.includes('İŞLEM TAMAMLANMADI'));
  assert(!script.includes('localStorage'));assert(!script.includes('accessToken'));
});
