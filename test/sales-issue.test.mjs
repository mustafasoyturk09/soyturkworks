import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../src/sales-issue.js',import.meta.url),'utf8');
const context={};vm.runInNewContext(script,context);const core=context.SWSalesPreparationCore;
const utils={encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1),decode_range:()=>({s:{r:0,c:0},e:{r:8,c:3}})};
const cell=(v,rgb='FFFF00')=>({v,s:{fgColor:{rgb}}});
const options={branch:0,customer:1,channel:2,amount:3,yellowOnly:true};
function sheet(){return {'!ref':'A1:D9',A1:cell('ŞUBE'),B1:cell('CARİ'),C1:cell('KANAL'),D1:cell('MATRAH'),A2:cell('İlk şube'),B2:cell('Z şirketi'),C2:cell('E-Fatura'),D2:cell(1250.55),A3:cell('İkinci şube'),B3:cell('A şirketi'),C3:cell('SS NO:12345'),D3:cell(2200),A4:cell('Arşiv'),B4:cell('Arşiv şirketi'),C4:cell('E-Arşiv'),D4:cell(3000),A5:cell('Sıfır'),B5:cell('Sıfır şirketi'),C5:cell('E-Fatura'),D5:cell(0),A6:cell('BİRÜNİ'),B6:cell('Ay sonu şirketi'),C6:cell('E-Fatura'),D6:cell(4000,'FF0000'),A7:cell('Seçilmemiş'),B7:cell('Şirket'),C7:cell('E-Fatura'),D7:cell(5000,'FFFFFF'),A8:cell('Hatalı'),B8:cell('Şirket'),C8:cell('E-Fatura'),D8:cell('1,250.00'),A9:cell('Toplam'),D9:cell(99999)};}
test('Preparation money parser preserves kuruş and rejects mixed/ambiguous input',()=>{
  for(const [value,expected] of [[1250.55,125055],['1.250,55',125055],['1250,55',125055],['1.250',125000],['1250.55',125055],['0',0],['-12,50',-1250],['₺ 1.000,01',100001]])assert.equal(core.cents(value),expected,String(value));
  for(const value of ['','1,250.00','1,234,56','abc',NaN,Infinity,'12.3456',12.3456])assert.equal(core.cents(value),null,String(value));
});
test('Source import preserves Excel order, excludes E-Arşiv and zero, and never assumes SS NO means verified E-Fatura',()=>{
  const {rows,counts}=core.importSheet(sheet(),options,{utils});
  assert.deepEqual(Array.from(rows,r=>r.sourceRow),[2,3,6,8]);
  assert.equal(rows[0].customer,'Z şirketi');assert.equal(rows[0].amountCents,125055);
  assert.equal(rows[1].channel,'pending');assert.equal(rows[1].ssno,'12345');assert.equal(rows[1].ssnoRequired,true);
  assert.equal(rows[2].schedule,'month-end');assert.equal(rows[3].amountCents,null);
  assert.equal(counts.earchive,1);assert.equal(counts.zero,1);assert.equal(counts.unselected,1);
  assert(rows.every(r=>r.amountConfirmed===false&&r.referenceReviewed===false));
});
test('Merged branch/title cells are read from their source instead of inherited from unrelated rows',()=>{
  const s=sheet();delete s.A3;delete s.B3;s['!merges']=[{s:{r:1,c:0},e:{r:2,c:0}},{s:{r:1,c:1},e:{r:2,c:1}}];
  const {rows}=core.importSheet(s,options,{utils});assert.equal(rows[1].branch,rows[0].branch);assert.equal(rows[1].customer,rows[0].customer);
});
test('Excel display precision and currency remain explicit; missing formula results stay visible as issues',()=>{
  const s=sheet();s.D2={...s.D2,v:1250.555,z:'[$USD] #,##0.00'};s.D3={...s.D3,v:undefined,f:'SUM(D1:D2)'};
  const lib={utils,SSF:{format:(format,value)=>value.toFixed(2)}};
  const {rows}=core.importSheet(s,options,lib);assert.equal(rows[0].amountCents,125056);assert.equal(rows[0].currency,'USD');assert.equal(rows[0].displayRounded,true);assert.equal(rows[0].amountConfirmed,false);
  assert.equal(rows[1].sourceRow,3);assert.equal(rows[1].amountCents,null);
  s.A2=cell('Sentez farklı şube');s.D2=cell(1000);assert.equal(core.importSheet(s,options,{utils}).rows[0].schedule,'beginning','Yellow branch rows must not inherit a red sibling’s schedule');
});
test('Dates cannot cross the selected accounting month, including leap day',()=>{
  assert(core.validDate('2028-02-29','2028-02'));assert(!core.validDate('2026-02-29','2026-02'));assert(!core.validDate('2026-10-31','2026-11'));assert(!core.validDate('2026-11-31','2026-11'));assert(!core.validPeriod('2026-13'));
});
test('Historical period headings and branch schedules cannot leak across companies sharing the same legal name',()=>{
  assert.equal(core.periodFromHeader('Ekim_2026 Bakım-Kira'),'2026-10');assert.equal(core.periodFromHeader('KASIM 2026'),'2026-11');assert.equal(core.periodFromHeader('Matrah'),null);
  assert(core.monthEnd('Biruni Diş'));assert(core.monthEnd('Sentez'));assert(!core.monthEnd('Başka hastane','Sentez Sağlık'));
});
test('Complete local information still requires external customer verification; unavailable reference files and SS NO remain blocking',()=>{
  const {rows}=core.importSheet(sheet(),options,{utils});const row={...rows[0],amountConfirmed:true,referenceReviewed:true,vkn:'1234567890',address:'Test adresi',description:'Test hizmeti',referencePdf:'test.pdf'};
  const project={period:'2026-11',invoiceDate:'2026-11-02'};
  assert.deepEqual(Array.from(core.issues(row,project,new Set(['test.pdf']))),['İzibiz cari ve posta kutusu doğrulaması bekleniyor.']);
  assert(core.issues({...row,ssnoRequired:true,ssno:''},project,new Set()).some(x=>x.includes('SS NO eksik')));
  assert(core.issues(row,project,new Set()).some(x=>x.includes('Referans PDF')));
  assert(core.issues({...row,taxType:'withholding'},project,new Set()).some(x=>x.includes('Tevkifat kodu')));
});
test('Backup restores only Pusula preparation data and discards forged issuance and accounting state',()=>{
  const {rows}=core.importSheet(sheet(),options,{utils});
  const source={version:1,company:'PUSULA',period:'2026-11',invoiceDate:'2026-10-01',rows:[{...rows[0],issued:true,customerVerified:true,izibizCustomerId:'forged',logoPosted:true}],source:{name:'source.xls',secret:'ignored'}};
  const restored=core.readBackup(source);assert.equal(restored.invoiceDate,'');assert(!Object.hasOwn(restored.rows[0],'issued'));assert(!Object.hasOwn(restored.rows[0],'customerVerified'));assert(!Object.hasOwn(restored.rows[0],'logoPosted'));assert(!Object.hasOwn(restored.source,'secret'));
  assert.throws(()=>core.readBackup({...source,company:'KIB'}));assert.throws(()=>core.readBackup({...source,rows:[rows[0],rows[0]]}));
});
test('Published and portable modules retain isolation, a consistent interface and no network mutation capability',async()=>{
  const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
  const template=JSON.parse(html.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const fragment=await readFile(new URL('../src/sales-issue.html',import.meta.url),'utf8');
  assert(html.includes(fragment));assert(template.includes(fragment));assert(template.includes(script));
  assert(script.includes("workspace?.companyId!=='PUSULA'"));
  assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//.test(script),'Preparation module must not call invoice/Logo services');
  for(const app of [html,template])assert(app.includes("pageId === 'satis-kesme' && window.SWWorkspace?.companyId !== 'PUSULA'"));
});
