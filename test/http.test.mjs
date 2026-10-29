import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreview} from '../scripts/preview.mjs';
for(const base of ['/','/works/'])test('HTTP ve alt dizin '+base,async()=>{
 const server=createPreview(base);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(origin+base)).status,200);
  assert.match((await (await fetch(origin+base+'app/pdf-loader.mjs')).text()),/isEvalSupported:false/);
  for(const path of ['missing.js','.env','package.json','Caddyfile','src/app.html','%2e%2e%2f.env'])assert.equal((await fetch(origin+base+path)).status,404);
  assert.equal((await fetch(origin+base,{method:'POST'})).status,405);
  if(base!=='/')assert.equal((await fetch(origin+base.slice(0,-1),{redirect:'manual'})).status,308);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
