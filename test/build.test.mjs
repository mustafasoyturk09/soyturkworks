import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);

test('Cloudflare assets stay within the upload limit and match the release manifest',async()=>{
 const manifest=JSON.parse(await readFile(new URL('release-manifest.json',root),'utf8'));
 const {createHash}=await import('node:crypto');
 for(const entry of manifest.files){
  const url=new URL('dist/'+entry.file,root);
  assert((await stat(url)).size<=25*1024*1024,entry.file+' exceeds 25 MiB');
  assert.equal(createHash('sha256').update(await readFile(url)).digest('hex'),entry.sha256,entry.file);
 }
});

test('External OCR loaders preserve all embedded data and the complete portable source',async()=>{
 const original=await readFile(new URL('src/app.html',root),'utf8');
 let restored=await readFile(new URL('dist/index.html',root),'utf8');
 const nodes=new Map();
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id);}};
 for(const id of ['sfOcrCoreData','sfOcrLangData','sfOcrLangDataEng']){
  const loader='<script src="./app/'+id+'.js"></script>';
  const marker='<script id="'+id+'" type="application/octet-stream"></script>'+loader;
  assert(restored.includes(marker),'OCR must be populated synchronously at its original location');
  vm.runInNewContext(await readFile(new URL('dist/app/'+id+'.js',root),'utf8'),{document});
  const value=nodes.get(id).textContent;
  assert(value.trim().length>0);
  restored=restored.replace(marker,()=>'<script id="'+id+'" type="application/octet-stream">'+value+'</script>');
 }
 assert.equal(restored,original,'The deployed source must reconstruct the original byte for byte');
});
