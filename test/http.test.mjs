import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreview} from '../scripts/preview.mjs';
for(const base of ['/','/works/'])test('HTTP ve alt dizin '+base,async()=>{
 const server=createPreview(base);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(origin+base)).status,200);
  assert.match((await (await fetch(origin+base+'app/pdf-loader.mjs')).text()),/isEvalSupported:false/);
  const icon=await fetch(origin+base+'favicon.ico');
  assert.equal(icon.status,200);
  assert.match(icon.headers.get('content-type'),/image\/x-icon/);
  assert.deepEqual([...new Uint8Array(await icon.arrayBuffer()).slice(0,6)],[0,0,1,0,3,0]);
  const logo=await fetch(origin+base+'assets/brand/sw-logo.png');
  assert.equal(logo.status,200);
  assert.match(logo.headers.get('content-type'),/image\/png/);
  for(const path of ['missing.js','.env','package.json','Caddyfile','src/app.html','%2e%2e%2f.env'])assert.equal((await fetch(origin+base+path)).status,404);
  assert.equal((await fetch(origin+base,{method:'POST'})).status,405);
  if(base!=='/')assert.equal((await fetch(origin+base.slice(0,-1),{redirect:'manual'})).status,308);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
