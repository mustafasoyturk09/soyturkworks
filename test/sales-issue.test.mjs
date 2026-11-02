import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../src/sales-issue.js',import.meta.url),'utf8');
const context={};vm.runInNewContext(script,context);const core=context.SWSalesPreparationCore;
const library={Uint8Array,ArrayBuffer};vm.runInNewContext(await readFile(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),library);const XLSX=library.XLSX;
const cell=(v,rgb='FFFFFF')=>({v,s:{fgColor:{rgb}}});
const options={branch:0,customer:1,channel:2,period:'2026-11'};
function sheet(){return {'!ref':'A1:F10',A1:cell('ŞUBE'),B1:cell('CARİ'),C1:cell('KANAL'),D1:cell('Ekim_2026 Bakım-Kira'),E1:cell('Kasım_2026 Bakım-Kira'),F1:cell('Kasım_2026 LİS-Diğer'),A2:cell('İlk şube'),B2:cell('Z şirketi'),C2:cell('E-Fatura'),D2:cell(1000),E2:cell(1250.55),F2:cell(99999),A3:cell('İkinci şube'),B3:cell('A şirketi'),C3:cell('SS NO:12345'),D3:cell(2200),E3:cell(2200),A4:cell('Arşiv'),B4:cell('Arşiv şirketi'),C4:cell('E-Arşiv'),E4:cell(3000),A5:cell('Sıfır'),B5:cell('Sıfır şirketi'),C5:cell('E-Fatura'),E5:cell(0),A6:cell('BİRÜNİ'),B6:cell('Üniversite'),C6:cell('E-Fatura'),E6:cell(4000),A7:cell('Boyasız'),B7:cell('Şirket'),C7:cell('E-Fatura'),E7:cell(5000),A8:cell('Hatalı'),B8:cell('Şirket'),C8:cell('E-Fatura'),E8:cell('1,250.00'),A9:cell('SENTEZ'),B9:cell('Sentez Sağlık Hizmetleri A.Ş.'),C9:cell('E-Fatura'),E9:cell(9000),A10:cell('BİRÜNİ DİŞ'),B10:cell('Diş Hastanesi'),C10:cell('E-Fatura'),E10:cell(4000)};}
test('Money parser preserves kuruş and rejects malformed or unformatted extra precision',()=>{
 for(const [v,want] of [[1250.55,125055],['1.250,55',125055],['1.250',125000],['1250.55',125055],['0',0],['-12,50',-1250],['₺ 1.000,01',100001]])assert.equal(core.cents(v),want);
 for(const v of ['','1,250.00','1,234,56','abc',NaN,Infinity,'12.3456',12.3456])assert.equal(core.cents(v),null);
});
test('Period selection uses exact month/year and Bakım-Kira; unpainted values are included without LİS amounts',()=>{
 const s=sheet(),result=core.importSheet(s,options,XLSX);
 assert.equal(result.binding.column,4);assert.deepEqual(Array.from(result.rows,r=>r.sourceRow),[2,3,7,8]);assert.equal(result.rows[0].amountCents,125055);assert.equal(result.rows[0].previousAmountCents,100000);assert.equal(result.rows[0].sourcePeriod,'2026-11');assert.equal(result.rows[0].sourceCell,'E2');
 assert.equal(result.rows[1].channel,'pending');assert.equal(result.rows[1].ssno,'12345');assert.equal(result.counts.earchive,1);assert.equal(result.counts.monthEnd,3);assert.equal(result.counts.zero,1);
 assert(result.rows.every(r=>r.amountConfirmed===false&&r.changeConfirmed===false&&r.schedule==='beginning'));
});
test('A missing current amount remains an explicit issue when last month was billed; it never inherits that amount',()=>{const s=sheet();delete s.E2;const result=core.importSheet(s,options,XLSX),row=result.rows.find(r=>r.sourceRow===2);assert.equal(row.amountCents,null);assert.equal(row.previousAmountCents,100000);assert.equal(result.counts.blank,1);assert.equal(core.amountState(row),'missing');});
test('Missing and ambiguous month columns block processing, including attempts to use a previous month or LİS alone',()=>{
 const s=sheet();assert.throws(()=>core.importSheet(s,{...options,amount:3},XLSX));assert.throws(()=>core.importSheet(s,{...options,period:'2026-12'},XLSX));assert.throws(()=>core.importSheet(s,{...options,period:'2025-11'},XLSX));
 s.F1=cell('Kasım_2026 Bakım-Kira');assert.throws(()=>core.resolveColumn(s,'2026-11',XLSX));s.E1=cell('Ekim_2026 Bakım-Kira');s.F1=cell('Kasım_2026 LİS-Diğer');assert.throws(()=>core.resolveColumn(s,'2026-11',XLSX));assert.throws(()=>core.resolveColumn(s,'',XLSX));
});
test('Date labels distinguish years and reject mixed month headers; calendar handling crosses December/January',()=>{
 assert.equal(core.periodFromHeader('Kasım_2026 Bakım-Kira'),'2026-11');assert.equal(core.periodFromHeader('Aralık 2026'),'2026-12');assert.equal(core.periodFromHeader('2027 Ocak'),'2027-01');assert.equal(core.periodFromHeader('Kasım ve Aralık 2026'),null);assert.equal(core.periodFromHeader('Kasım 2025-2026'),null);assert.equal(core.previousPeriod('2027-01'),'2026-12');assert(core.validDate('2028-02-29','2028-02'));assert(!core.validDate('2026-02-29','2026-02'));
 const s=sheet();s.D1=cell('Aralık 2026 Bakım-Kira');s.E1=cell('Ocak 2027 Bakım-Kira');assert.equal(core.importSheet(s,{...options,period:'2027-01'},XLSX).rows[0].previousAmountCents,100000);
});
test('Exclusions use company identity without requiring coloring or confusing an ESEA branch name with Sentez company',()=>{
 assert(core.monthEnd('Biruni Üniversitesi','Üniversite'));assert(core.monthEnd('Biruni Diş','Üniversite'));assert(core.monthEnd('SENTEZ SAĞLIK - İZMİR','Sentez Sağlık Hizmetleri A.Ş.'));assert(!core.monthEnd('SENTEZ SAĞLIK - GAZİANTEP','ESEA SAĞLIK VE YATIRIM A.Ş.'));
 const s=sheet();s.A7=cell('SENTEZ SAĞLIK - GAZİANTEP');s.B7=cell('ESEA SAĞLIK VE YATIRIM A.Ş.');assert(core.importSheet(s,options,XLSX).rows.some(r=>r.sourceRow===7));
});
test('Difference warnings require correction or an explicit confirmation; ordinary edits do not falsely turn a difference green',()=>{
 const row=core.importSheet(sheet(),options,XLSX).rows[0];assert.equal(core.amountState(row),'changed');assert(core.issues(row,{period:'2026-11',invoiceDate:'2026-11-02'}).some(x=>x.includes('tutar farkı')));
 assert.equal(core.amountState({...row,amountCents:110000,amountConfirmed:true}),'changed');assert.equal(core.amountState({...row,amountCents:100000}),'matched');assert.equal(core.amountState({...row,changeConfirmed:true}),'checked');assert.equal(core.amountState({...row,amountCents:100000,currency:'USD'}),'changed');assert.equal(core.amountState({...row,previousAmountCents:null,amountConfirmed:false}),'pending');
});
test('Merged identity cells and Excel display precision are retained; formula cells without cached results stay flagged',()=>{
 const s=sheet();delete s.A3;delete s.B3;s['!merges']=[{s:{r:1,c:0},e:{r:2,c:0}},{s:{r:1,c:1},e:{r:2,c:1}}];s.E2={...s.E2,v:1250.555,z:'[$USD] #,##0.00'};s.E3={...s.E3,v:undefined,f:'SUM(E1:E2)'};
 const {rows}=core.importSheet(s,options,XLSX);assert.equal(rows[0].amountCents,125056);assert.equal(rows[0].currency,'USD');assert.equal(rows[0].displayRounded,true);assert.equal(rows[1].customer,rows[0].customer);assert.equal(rows[1].amountCents,null);
});
test('Period rebinding takes new amounts and preserves only unique identities, while resetting approvals',()=>{
 const rows=core.importSheet(sheet(),options,XLSX).rows;const old=rows.map(r=>({...r,description:'SAVED',amountCents:1,amountConfirmed:true,changeConfirmed:true,referenceReviewed:true,removed:true}));const next=core.mergeRows(rows,old);
 assert.equal(next[0].amountCents,125055);assert.equal(next[0].description,'SAVED');assert.equal(next[0].removed,true);assert.equal(next[0].amountConfirmed,false);assert.equal(next[0].changeConfirmed,false);assert.equal(next[0].referenceReviewed,false);
 const ambiguous=core.mergeRows(rows,[old[0],old[0]]);assert.equal(ambiguous[0].description,'');
});
test('Per-row removal keys keep otherwise identical rows separate',()=>{
 const rows=core.importSheet(sheet(),options,XLSX).rows;const a={...rows[0],sourceRow:2},b={...rows[0],sourceRow:3};assert.notEqual(core.deletionKey(a),core.deletionKey(b));const restored=core.readBackup({version:1,company:'PUSULA',period:'2026-11',invoiceDate:'2026-11-02',rows:[{...a,removed:true},b],removedKeys:[core.deletionKey(a)]});assert.equal(restored.rows[0].removed,true);assert.equal(restored.rows[1].removed,false);assert.equal(restored.removedKeys.length,1);
});
test('Backups preserve preparation only, exclude month-end companies, and cannot manufacture issued/verified records',()=>{
 const rows=core.importSheet(sheet(),options,XLSX).rows;const src={version:1,company:'PUSULA',period:'2026-11',invoiceDate:'2026-10-01',rows:[{...rows[0],issued:true,customerVerified:true,logoPosted:true},{...rows[1],branch:'BİRÜNİ'}],source:{name:'test.xls',period:'2026-11',secret:'ignored'}};const out=core.readBackup(src);assert.equal(out.rows.length,1);assert.equal(out.invoiceDate,'');assert(!Object.hasOwn(out.rows[0],'issued'));assert(!Object.hasOwn(out.rows[0],'customerVerified'));assert(!Object.hasOwn(out.source,'secret'));assert.throws(()=>core.readBackup({...src,company:'KIB'}));
});
test('Complete local checks still cannot imply İzibiz validation',()=>{
 const row={...core.importSheet(sheet(),options,XLSX).rows[1],vkn:'1234567890',address:'Test',description:'Test',referencePdf:'test.pdf',amountConfirmed:true,referenceReviewed:true,channel:'einvoice'};
 assert.deepEqual(Array.from(core.issues(row,{period:'2026-11',invoiceDate:'2026-11-02'},new Set(['test.pdf']))),['İzibiz cari ve posta kutusu doğrulaması bekleniyor.']);assert(core.issues(row,{period:'2026-12',invoiceDate:'2026-12-02'}).some(t=>t.includes('yeniden okunmalı')));
});
test('Published and portable modules retain isolation, a consistent interface and no network mutation capability',async()=>{
  const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
  const template=JSON.parse(html.match(/<script\b[^>]*id="fc153PortableTemplate"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const fragment=await readFile(new URL('../src/sales-issue.html',import.meta.url),'utf8');
  const lf=value=>value.replace(/\r\n/g,'\n');assert(lf(html).includes(lf(fragment)));assert(lf(template).includes(lf(fragment)));assert(lf(template).includes(lf(script)));
  assert(script.includes("workspace?.companyId!=='PUSULA'"));
  assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//.test(script),'Preparation module must not call invoice/Logo services');
  for(const app of [html,template])assert(app.includes("pageId === 'satis-kesme' && window.SWWorkspace?.companyId !== 'PUSULA'"));
});
