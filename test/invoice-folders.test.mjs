import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/automation/app.js',import.meta.url),'utf8');
const functions=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to));
function fixture(api){
 const nodes=new Map();
 const context=vm.createContext({URLSearchParams,Map,Set,Intl,Date,console,api,company:'PUSULA',companyContext:{id:'PUSULA'},status:'waiting',month:'2026-10',query:'test',rows:[],offset:0,more:false,selected:new Map(),invoiceRequest:0,folderRequest:0,folderPageRequest:0,currentFolder:null,view:'folders',viewHistory:[],periodPinned:false,location:{},
  $:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',open:false,scrollIntoView(){this.scrolled=true;},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);},
  apiURL:(id,action)=>'/api/automation/'+id+'/'+action,escape:s=>String(s??''),icon:()=>'<svg></svg>',info:()=>({period:{startMonth:'2026-10'}}),monthName:m=>m,calendarDate:d=>d,datetime:d=>d,collectionDates:g=>g.receivedDates.join(', '),receivedLabel:r=>r.receivedDate,localMonth:()=> '2026-11',stateLabel:()=> 'BEKLENİYOR',pdfLink:(id,uuid,download=false)=>'href="/'+uuid+(download?'?download=1':'')+'"',pdfActions:()=>'<a>PDF önizle</a><a>PDF indir</a>',
  renderSelection(){},renderFilters(){},updateButtons(){},invoiceHeader:()=>'<header>',invoiceHTML:r=>r.uuid,empty:()=>'',toast(){},changeView:async view=>{context.view=view;},
 });
 vm.runInContext(functions('async function loadInvoices(','const invoiceColumns='),context);
 vm.runInContext(functions('async function loadFolders(','function pushEnvironment()'),context);
 return {context,nodes,run:code=>vm.runInContext(code,context)};
}
const group={id:'monthly',name:'Pusula Ekim 2026 Gelen E-Faturalar',month:'2026-10',pdfs:205,fresh:0,waiting:205,receivedDates:['2026-11-01','2026-11-06']};
const row=i=>({uuid:String(i),unvan:'Örnek',fatno:'TEST'+i,tarih:'2026-10-27',receivedDate:'2026-11-06'});

test('Invoice next/previous pages replace rows, preserve filters and commit offsets only after success',async()=>{
 let fail=false;const calls=[],f=fixture(async url=>{const p=new URL(url,'https://example.test').searchParams;calls.push(p);if(fail)throw Error('Offline');const offset=+p.get('offset');return {offset,total:205,rows:Array.from({length:Math.min(100,205-offset)},(_,i)=>row(offset+i))};});
 await f.run('loadInvoices()');assert.equal(f.context.rows.length,100);assert.equal(f.nodes.get('previousInvoices').disabled,true);
 await f.run('navigateInvoices(100)');assert.equal(f.context.rows.length,100);assert.equal(f.context.rows[0].uuid,'100');assert.equal(f.context.offset,100);assert.equal(f.nodes.get('previousInvoices').disabled,false);assert(f.nodes.get('invoiceList').scrolled);
 await f.run('loadInvoices(200)');assert.equal(f.context.rows.length,5);assert.equal(f.nodes.get('loadMore').disabled,true);assert.equal(f.nodes.get('invoicePageInfo').textContent,'201–205 / 205 fatura');
 fail=true;await assert.rejects(()=>f.run('loadInvoices(100)'),/Offline/);assert.equal(f.context.offset,200);assert.equal(f.context.rows[0].uuid,'200');
 fail=false;await f.run('loadInvoices(100)');assert.equal(f.context.rows[0].uuid,'100');
 for(const p of calls){assert.equal(p.get('month'),'2026-10');assert.equal(p.get('status'),'waiting');assert.equal(p.get('q'),'test');}
});

test('Late invoice page responses cannot replace a newer page',async()=>{
 const pending=[];const f=fixture(()=>new Promise(resolve=>pending.push(resolve)));
 const first=f.run('loadInvoices(100)'),second=f.run('loadInvoices(200)');pending[1]({offset:200,total:205,rows:[row(200)]});await second;pending[0]({offset:100,total:205,rows:[row(100)]});await first;
 assert.equal(f.context.offset,200);assert.equal(f.context.rows[0].uuid,'200');
});

test('Folder cards show the invoice month, collection dates, accounting icon and their own delete action',async()=>{
 const f=fixture(async()=>({folders:[group]}));await f.run('loadFolders()');const html=f.nodes.get('folderList').innerHTML;
 assert(html.includes(group.name));assert(html.includes('2026-11-01, 2026-11-06'));assert(html.includes('data-delete-folder="monthly"'));assert(html.includes('data-folder="monthly"'));assert(!html.includes('İlk 100'));
});

test('Folder dialog displays every page, separate PDF actions and each invoice collection date',async()=>{
 const offsets=[];const f=fixture(async url=>{if(url.includes('/folders'))return {folders:[group]};const offset=+new URL(url,'https://example.test').searchParams.get('offset');offsets.push(offset);return {offset,total:205,limit:100,rows:[row(offset)]};});
 await f.run("openFolder('PUSULA','monthly')");let html=f.nodes.get('folderContent').innerHTML;assert(html.includes('data-folder-page="100"'));assert(html.includes('PDF önizle'));assert(html.includes('PDF indir'));assert(html.includes('Alınma: 2026-11-06'));assert(f.nodes.get('folderDialog').open);
 f.nodes.get('folderDialog').scrollTop=1000;await f.run("openFolder('PUSULA','monthly',100)");assert.equal(f.context.currentFolder.offset,100);assert.equal(f.nodes.get('folderDialog').scrollTop,0);html=f.nodes.get('folderContent').innerHTML;assert(html.includes('data-folder-page="0"'));assert(html.includes('data-folder-page="200"'));
 await f.run("openFolder('PUSULA','monthly',200)");assert.equal(f.context.currentFolder.offset,200);assert.deepEqual(offsets,[0,100,200]);
});

test('Closing a folder discards its pending page response and Previous Page returns to the prior view',async()=>{
 let resolve;const f=fixture(url=>url.includes('/folders')?Promise.resolve({folders:[group]}):new Promise(r=>resolve=r));
 const pending=f.run("openFolder('PUSULA','monthly',100)");f.run('closeFolder()');resolve({offset:100,total:205,rows:[row(100)]});await pending;assert.equal(f.nodes.get('folderDialog').open,false);assert.equal(f.context.currentFolder,null);
 f.context.viewHistory.push({view:'invoices',month:'2026-09',status:'done',query:'previous'});await f.run('previousPage()');assert.equal(f.context.view,'invoices');assert.equal(f.context.month,'2026-09');assert.equal(f.context.status,'done');assert.equal(f.context.query,'previous');
 await f.run('previousPage()');assert.equal(f.context.location.href,'/workspace/PUSULA/');
});
