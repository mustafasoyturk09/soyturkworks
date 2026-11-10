import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cents,parseReceipt,issues,guessCategory,duplicateIds,exportReadiness} from '../src/expenses/model.mjs';
import {ExpenseStore,limitedBytes} from '../server/expenses.mjs';

const sample='ÖRNEK LOKANTA\nVKN: 1234567890\nTARİH: 10.11.2026\nFİŞ NO: 0072\nYEMEK %10 110,00\nTOPKDV 10,00\nTOPLAM 110,00';
const receipt=()=>({...parseReceipt(sample,92),id:'one',reviewed:true});
class Storage{
  data=new Map();queue=Promise.resolve();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
  transaction(fn){const next=this.queue.then(async()=>{const before=structuredClone(this.data);try{return await fn(this);}catch(e){this.data=before;throw e;}});this.queue=next.catch(()=>{});return next;}
}
const jpg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(200000,42)]),id=createHash('sha256').update(jpg).digest('hex');
const call=(store,path,body,raw=false)=>store.handle(new Request('https://expense-store.internal/'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:raw?body:JSON.stringify(body)}));

test('Expense OCR extracts explicit receipt fields without inventing missing identifiers or amounts',()=>{
  const r=receipt();assert.equal(r.number,'0072');assert.equal(r.date,'2026-11-10');assert.equal(r.total,11000);assert.equal(r.vat,1000);assert.equal(r.lines[0].category,'meal');assert.deepEqual(issues(r),[]);
  const unknown=parseReceipt('EKÜ NO: 8888\nZ NO: 1234\nNAKİT 999,00\nSAAT 10:11');assert.equal(unknown.number,'');assert.equal(unknown.total,null);assert.equal(unknown.date,'');assert.equal(unknown.lines[0].vatRate,null);assert(issues(unknown).length>=5);
});
test('Ambiguous dates, totals and tax rates stay unresolved rather than choosing a convenient value',()=>{
  const r=parseReceipt('ÖRNEK\n10.11.2026\n11.11.2026\nTOPLAM 110,00\nTOPLAM 220,00\nKDV ORANI %10\nKDV ORANI %20');assert.equal(r.date,'');assert.equal(r.total,null);assert.equal(r.lines[0].vatRate,null);assert(r.notes.some(n=>n.includes('Birden fazla')));
  assert.equal(parseReceipt('ÖRNEK\n31.02.2026').date,'');
});
test('Mixed VAT and categories use separate lines and reconcile to the printed totals',()=>{
  const r=parseReceipt('ÖRNEK\nVKN: 1234567890\n10.11.2026\nFİŞ NO: 42\nYEMEK %10 110,00\nMOTORİN %20 120,00\nTOPKDV 30,00\nTOPLAM 230,00');assert.equal(r.lines.length,2);assert.deepEqual(r.lines.map(l=>l.category),['meal','fuel']);assert.deepEqual(issues(r),[]);
  r.lines[0].gross=10000;assert(issues(r).some(n=>n.includes('Satır toplamları')));r.vat=0;assert(issues(r).some(n=>n.includes('KDV ile uyuşmuyor')));
});
test('Money parser preserves kuruş precision and rejects malformed and negative amounts',()=>{
  for(const [value,expected] of [['1.234,56',123456],['1234.56',123456],['1.234',123400],['0,00',0],['',null],['12,34,56',null],['-100,00',null],['1O0,00',null]])assert.equal(cents(value),expected,value);
});
test('Category suggestions are conservative and never infer a tax rate or accounting code',()=>{
  assert.equal(guessCategory('UNLU MAMÜLLER'),'bakery');assert.equal(guessCategory('MOTORİN'),'fuel');assert.equal(guessCategory('OTOPARK'),'parking');assert.equal(guessCategory('TURKISH AIRLINES'),'flight');assert.equal(guessCategory('Lokanta ve akaryakıt'),'other');
  const r=parseReceipt('OTOPARK\nTOPLAM 100,00');assert.equal(r.lines[0].vatRate,null);assert.equal(r.lines[0].category,'parking');
});
test('Duplicate receipts are flagged independently of amounts and archived entries do not block review',()=>{
  const a=receipt(),b={...receipt(),id:'two',total:99999};assert.deepEqual([...duplicateIds([a,b])].sort(),['one','two']);b.archived=true;assert.equal(duplicateIds([a,b]).size,0);
});
test('Logo XML export cannot be enabled with unverified category mappings or imported verification flags',()=>{
  const result=exportReadiness([receipt()],{verified:true,categories:{meal:{verified:true}}});assert.equal(result.ready,false);assert(result.reasons.some(n=>n.includes('şablonu')));
});
test('Receipt source uploads are byte-exact, idempotent and isolated by company store',async()=>{
  const s=new Storage(),a=new ExpenseStore(s,'PUSULA'),b=new ExpenseStore(new Storage(),'COMED');
  assert.equal((await call(a,'image/'+id,jpg,true)).status,201);assert.equal((await(await call(a,'image/'+id,jpg,true)).json()).duplicate,true);
  assert.deepEqual(Buffer.from(await(await call(a,'image/'+id)).arrayBuffer()),jpg);assert.equal((await(await call(a,'list')).json()).receipts.length,1);
  await assert.rejects(()=>call(b,'image/'+id),e=>e.status===404);assert.equal((await(await call(b,'list')).json()).receipts.length,0);
});
test('Receipt updates use optimistic concurrency, preserve originals and reject incomplete approval',async()=>{
  const s=new Storage(),store=new ExpenseStore(s,'PUSULA');await call(store,'image/'+id,jpg,true);const r=await(await call(store,'record/'+id)).json();
  await assert.rejects(()=>call(store,'record/'+id,{...r,reviewed:true}),/onaylanamaz/);
  const patch={...r,...receipt(),id:'forged',company:'COMED',source:{size:0}};const saved=await(await call(store,'record/'+id,patch)).json();assert.equal(saved.id,id);assert.equal(saved.company,'PUSULA');assert.equal(saved.source.size,jpg.length);
  await assert.rejects(()=>call(store,'record/'+id,patch),e=>e.status===409);
  await call(store,'record/'+id,{...saved,archived:true});assert.deepEqual(Buffer.from(await(await call(store,'image/'+id)).arrayBuffer()),jpg);
});
test('Concurrent edits cannot silently overwrite the other device',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const r=(await(await call(store,'image/'+id,jpg,true)).json()).receipt;
  const results=await Promise.allSettled([call(store,'record/'+id,{...r,seller:'A'}),call(store,'record/'+id,{...r,seller:'B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
});
test('Profiles are per-company, revision checked and cannot claim verification',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');const saved=await(await call(store,'profiles',{revision:0,categories:{meal:{accountCode:'770.TEST',verified:true}},verified:true})).json();assert.equal(saved.verified,false);assert.equal(saved.categories.meal.accountCode,'770.TEST');assert.equal(saved.categories.meal.verified,undefined);
  await assert.rejects(()=>call(store,'profiles',{revision:0,categories:{}}),e=>e.status===409);
});
test('Upload limits, content signatures and source hashes are enforced without trusting Content-Length',async()=>{
  const store=new ExpenseStore(new Storage(),'PUSULA');await assert.rejects(()=>call(store,'image/'+id,Buffer.from('<script>bad</script>'),true),/JPEG/);
  await assert.rejects(()=>call(store,'image/'+'0'.repeat(64),jpg,true),/bütünlüğü/);
  const request=new Request('https://example.invalid',{method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(11));c.close();}}),duplex:'half'});await assert.rejects(()=>limitedBytes(request,10),e=>e.status===413);
});
test('Build ships the standalone module and pinned OCR assets without changing the existing OCR engine',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../release-manifest.json',import.meta.url)));
  for(const file of ['expenses/index.html','expenses/model.mjs','expenses/app.mjs','expenses/ocr-worker.js','expenses/ocr-core.js','expenses/tur.traineddata','expenses/eng.traineddata'])assert(manifest.files.some(f=>f.file===file));
  const html=await readFile(new URL('../src/expenses/index.html',import.meta.url),'utf8');assert.match(html,/capture="environment"/);assert.match(html,/id="xml"[^>]+disabled/);
});
