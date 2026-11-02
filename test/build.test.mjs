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
 const portable=restored.match(/<script type="application\/json" id="fc153PortableTemplate" data-src="\.\/app\/(portable-template-[a-f0-9]{16}\.json)"><\/script>/);
 assert(portable,'Portable template must be lazy loaded');
 const portableSource=await readFile(new URL('dist/app/'+portable[1],root),'utf8');
 assert(portableSource.length>5*1024*1024,'Portable template must retain the complete offline application');
 restored=restored.replace(portable[0],()=>'<script type="application/json" id="fc153PortableTemplate">'+portableSource+'</script>');
 for(;;){
  const match=restored.match(/<script src="\.\/app\/(inline-script-[a-f0-9]{16}\.js)"><\/script>/);if(!match)break;
  const source=await readFile(new URL('dist/app/'+match[1],root),'utf8');
  restored=restored.replace(match[0],()=>'<script>'+source+'</script>');
 }
 for(;;){
  const match=restored.match(/<link rel="stylesheet" href="\.\/app\/(inline-style-[a-f0-9]{16}\.css)">/);if(!match)break;
  const source=await readFile(new URL('dist/app/'+match[1],root),'utf8');
  restored=restored.replace(match[0],()=>'<style>'+source+'</style>');
 }
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
 assert((await stat(new URL('dist/index.html',root))).size<1024*1024,'Workspace HTML must stay below 1 MiB for fast company switches');
});

test('Invoice tracking starts without the Excel bundle and loads its first screen in one request',async()=>{
 const page=await readFile(new URL('src/automation/index.html',root),'utf8'),app=await readFile(new URL('src/automation/app.js',root),'utf8');
 assert(!page.includes('xlsx.full.min.js'),'The 1 MB spreadsheet reader must not block first paint');
 assert(page.includes('id="testPush"'),'One global phone test must remain available without per-company test controls');
 assert(app.includes("script.src='/assets/vendor/xlsx.full.min.js'"),'Spreadsheet import must retain lazy loading');
 assert(app.includes("api(apiURL(company,'bootstrap')"),'Summary and the first invoice page must use one server round trip');
 assert(app.includes('refreshDevicesInBackground()'),'Push device checks must not block the first invoice screen');
});

test('Company selection prefetches every cached workspace chunk without downloading the portable template',async()=>{
 const workspace=await readFile(new URL('dist/index.html',root),'utf8'),portal=await readFile(new URL('dist/portal/index.html',root),'utf8');
 const chunks=[...workspace.matchAll(/\.\/app\/(inline-(?:script|style)-[a-f0-9]{16}\.(?:js|css))/g)].map(match=>match[1]);
 assert(chunks.length>=2,'Workspace must contain cached script and style chunks');
 for(const chunk of chunks)assert(portal.includes('"/app/'+chunk+'"'),'Company selection must prepare '+chunk+' for prefetch');
 assert(!/portable-template-[a-f0-9]{16}\.json/.test(portal),'Large portable template must stay on demand');
});
