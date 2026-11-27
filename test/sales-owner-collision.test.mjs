import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../src/app.html',import.meta.url),'utf8');
const source=html.slice(html.lastIndexOf('  function s151SameOwner('),html.lastIndexOf('  function s151ReservedOwners('));
const ctx={
  s102Identity:r=>r.identity,
  s151Expected:()=>'',
  s151Title:r=>r.title,
  s150Text:s=>String(s||'').toUpperCase(),
  s151Lookup:(_company,_vkn,_title,address)=>address==='branch'?{branch:true}:{branch:false,known:true,code:'120.01.192'}
};
vm.runInNewContext(source,ctx);
const row={vkn:'1234567890',arpCode:'120.01.192',title:'TEST SAĞLIK A.Ş.',identity:'a',sourceRecipient:'address A'};
test('Verified same customer may have different recipient blocks without code conflict',()=>{
  assert.equal(ctx.s151SameOwner('PUSULA',row,{...row,identity:'b',sourceRecipient:'address B'}),true);
});
test('Different taxpayer, title, branch or unverified account never uses the shortcut',()=>{
  for(const other of [{...row,vkn:'9876543210',identity:'b'}, {...row,title:'DİĞER ŞİRKET',identity:'b'}, {...row,sourceAddress:'branch',identity:'b'}, {...row,arpCode:'120.01.999',identity:'b'}])assert.equal(ctx.s151SameOwner('PUSULA',row,other),false);
  assert.equal(ctx.s151SameOwner('DIGER',row,{...row,identity:'b'}),false);
});
