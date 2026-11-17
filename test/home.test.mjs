import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/home-model.js',import.meta.url),'utf8');
const context={Date,Intl};context.globalThis=context;vm.runInNewContext(source,context);
const model=context.SWHomeModel;

test('custom ranges include both endpoints and previous periods keep the same length',()=>{
  const period=model.range('2026-11-03','2026-11-15');
  assert.equal(model.within('03.11.2026',period),true);
  assert.equal(model.within('15.11.2026',period),true);
  assert.equal(model.within('02.11.2026',period),false);
  assert.equal(model.within('16.11.2026',period),false);
  assert.deepEqual({...model.previous(period)},{start:'2026-10-21',end:'2026-11-02'});
  assert.deepEqual({...model.previous(model.monthRange('2027-01'))},{start:'2026-12-01',end:'2026-12-31'});
  assert.throws(()=>model.range('2026-11-16','2026-11-03'));
  assert.equal(model.day('31.02.2026'),'');
});

test('invoice counts use one list and sales totals remain company scoped',()=>{
  const period=model.range('2026-11-03','2026-11-15');
  const rows=[{fatno:'A',tarih:'03.11.2026',islendi:false},{fatno:'A',tarih:'03.11.2026',islendi:false},{fatno:'B',tarih:'15.11.2026',islendi:true},{fatno:'C',tarih:'15.11.2026',isRet:true},{fatno:'D',tarih:'15.11.2026',birim:'USD'},{fatno:'E',tarih:'16.11.2026'}];
  const result=model.invoices(rows,period);
  assert.equal(result.rows.length,4);assert.equal(result.new,2);assert.equal(result.processed,1);assert.equal(result.returned,1);assert.equal(result.foreign,1);
  const sales=[{company:'PUSULA',tarih:'03.11.2026',tutar:100},{company:'KIB',tarih:'03.11.2026',tutar:999},{company:'PUSULA',tarih:'16.11.2026',tutar:50}];
  assert.equal(model.sales(sales,'PUSULA',period).total,100);
  assert.equal(model.sales(sales,'KIB',period).total,999);
  assert.equal(model.sales([{company:'PUSULA',tarih:'03.11.2026',tutar:'100'}],'PUSULA',period).total,null);
});
