import {readFile,writeFile,mkdir,copyFile,readdir,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const vendor=join(root,'vendor');
const manifest=JSON.parse(await readFile(join(vendor,'manifest.json'),'utf8'));
const vendorOutput=new Map();
for(const entry of manifest){
 if(!/^[\w.-]+$/.test(entry.file))throw Error('Geçersiz varlık adı');
 const bytes=await readFile(join(vendor,entry.file)),hash=createHash('sha256').update(bytes).digest('hex');
 // Git for Windows may check text vendors out with CRLF. Accept only the exact
 // manifest hash or its byte-for-byte LF equivalent; every other change fails.
 const normalized=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')),lfHash=createHash('sha256').update(normalized).digest('hex');
 if(hash!==entry.sha256&&lfHash!==entry.sha256)throw Error('Varlık bütünlüğü uyuşmuyor: '+entry.file);
 vendorOutput.set(entry.file,hash===entry.sha256?bytes:normalized);
}
const dist=join(root,'dist');await mkdir(join(dist,'app'),{recursive:true});await mkdir(join(dist,'assets/vendor'),{recursive:true});await mkdir(join(dist,'assets/brand'),{recursive:true});
const generatedAsset=/^(?:inline-(?:script|style)|portable-template)-[a-f0-9]{16}\.(?:js|css|json)$/;
for(const name of await readdir(join(dist,'app')))if(generatedAsset.test(name))await rm(join(dist,'app',name),{force:true});
const ocrIds=['sfOcrCoreData','sfOcrLangData','sfOcrLangDataEng'];
const brandFiles=['sw-logo.png','favicon-16.png','favicon-32.png','favicon-48.png','apple-touch-icon.png'];
const allowed=new Set(['index.html','robots.txt','404.html','_headers','favicon.ico','portal/index.html','portal/portal.css','portal/portal.js','portal/passkeys.js','automation/index.html','automation/style.css','automation/app.js','manifest.webmanifest','push-sw.js','app/workspace.js','app/workspace.css','app/izibiz.js','app/izibiz.css','app/sales-issue.js','app/sales-issue.css','app/runtime.js','app/pdf-loader.mjs','app/mobile.css','app/mobile.js','app/branding.css','app/calculator-ui.css','app/calculator-ui.js',...ocrIds.map(id=>'app/'+id+'.js'),...manifest.map(x=>'assets/vendor/'+x.file),...brandFiles.map(x=>'assets/brand/'+x)]);
const expenseFiles=['index.html','style.css','app.mjs','model.mjs','ocr-worker.js','ocr-core.js','tur.traineddata','eng.traineddata'];
for(const file of expenseFiles)allowed.add('expenses/'+file);
async function rejectUnexpected(dir,prefix=''){
 for(const name of await readdir(dir)){
  const file=join(dir,name),rel=prefix+name;
  if((await stat(file)).isDirectory())await rejectUnexpected(file,rel+'/');
  else if(!allowed.has(rel))throw Error('Dağıtım dizininde beklenmeyen dosya var; yeni boş bir sürüm klasöründe build yapın: '+rel);
 }
}
await rejectUnexpected(dist);
// Keep the original single-file source intact. Parser-blocking loaders restore
// the OCR data before application code uses it, including portable HTML export.
let html=(await readFile(join(root,'src/app.html'),'utf8')).replace(/\r\n/g,'\n');
for(const id of ocrIds){
 const pattern=new RegExp('(<script id="'+id+'" type="application/octet-stream">)([\\s\\S]*?)(</script>)');
 const match=html.match(pattern);
 if(!match)throw Error('OCR verisi bulunamadı: '+id);
 const filename='app/'+id+'.js';
 await writeFile(join(dist,filename),'document.getElementById('+JSON.stringify(id)+').textContent='+JSON.stringify(match[2])+';\n');
 html=html.replace(pattern,()=>match[1]+match[3]+'<script src="./'+filename+'"></script>');
}
// The full offline template is needed only when the user downloads a portable
// copy. Keep it out of the first workspace response and load it on demand.
const generated=new Map();
function generatedName(prefix,extension,content){
 const digest=createHash('sha256').update(content).digest('hex').slice(0,16);
 const name='app/'+prefix+'-'+digest+'.'+extension;
 generated.set(name,content);return name;
}
const portablePattern=/<script type="application\/json" id="fc153PortableTemplate">([\s\S]*?)<\/script>/;
const portable=html.match(portablePattern);
if(!portable)throw Error('Taşınabilir kopya şablonu bulunamadı.');
const portableName=generatedName('portable-template','json',portable[1]);
html=html.replace(portablePattern,'<script type="application/json" id="fc153PortableTemplate" data-src="./'+portableName+'"></script>');

// Large inline blocks make every company switch download and parse the whole
// application again. Content-addressed files are cached once and reused by all
// company workspaces while preserving the parser-blocking execution order.
html=html.replace(/<script>([\s\S]*?)<\/script>/g,(tag,content)=>{
 if(content.length<32768)return tag;
 const name=generatedName('inline-script','js',content);
 return '<script src="./'+name+'"></script>';
});
html=html.replace(/<style>([\s\S]*?)<\/style>/g,(tag,content)=>{
 if(content.length<32768)return tag;
 const name=generatedName('inline-style','css',content);
 return '<link rel="stylesheet" href="./'+name+'">';
});
for(const [name,content] of generated)await writeFile(join(dist,name),content);
await writeFile(join(dist,'index.html'),html);
await copyFile(join(root,'src/_headers'),join(dist,'_headers'));
for(const name of ['runtime.js','pdf-loader.mjs','mobile.css','mobile.js','branding.css','calculator-ui.css','calculator-ui.js','workspace.js','workspace.css','izibiz.js','izibiz.css','sales-issue.js','sales-issue.css'])await copyFile(join(root,'src',name),join(dist,'app',name));
await mkdir(join(dist,'portal'),{recursive:true});
for(const name of ['portal.css','portal.js'])await copyFile(join(root,'src/portal',name),join(dist,'portal',name));
let portalHtml=await readFile(join(root,'src/portal/index.html'),'utf8');
const workspacePrefetch=[...generated.keys()].filter(name=>/^app\/inline-(?:script|style)-/.test(name)).map(name=>'/'+name);
portalHtml=portalHtml.replace('</head>','<script type="application/json" id="workspacePrefetch">'+JSON.stringify(workspacePrefetch)+'</script></head>');
await writeFile(join(dist,'portal/index.html'),portalHtml);
await build({entryPoints:[join(root,'src/portal/passkeys-entry.js')],outfile:join(dist,'portal/passkeys.js'),bundle:true,format:'iife',globalName:'SWPasskeys',minify:true,target:'es2022',legalComments:'none'});
await mkdir(join(dist,'automation'),{recursive:true});
for(const name of ['index.html','style.css','app.js'])await copyFile(join(root,'src/automation',name),join(dist,'automation',name));
await mkdir(join(dist,'expenses'),{recursive:true});
for(const name of expenseFiles.filter(name=>!['ocr-core.js','tur.traineddata','eng.traineddata'].includes(name)))await copyFile(join(root,'src/expenses',name),join(dist,'expenses',name));
// Reuse the existing pinned OCR engine and dictionaries; never fetch a remote model.
const ocrSource=await readFile(join(root,'src/app.html'),'utf8');
for(const [id,file] of [['sfOcrCoreData','ocr-core.js'],['sfOcrLangData','tur.traineddata'],['sfOcrLangDataEng','eng.traineddata']]){
 const match=ocrSource.match(new RegExp('<script id="'+id+'" type="application/octet-stream">([\\s\\S]*?)</script>'));
 if(!match)throw Error('Masraf OCR verisi bulunamadı: '+id);
 await writeFile(join(dist,'expenses',file),Buffer.from(match[1].trim(),'base64'));
}
for(const name of ['manifest.webmanifest','push-sw.js'])await copyFile(join(root,'src',name),join(dist,name));
for(const name of brandFiles)await copyFile(join(root,'src/assets/brand',name),join(dist,'assets/brand',name));
await copyFile(join(root,'src/assets/brand/favicon.ico'),join(dist,'favicon.ico'));
for(const entry of manifest)await writeFile(join(dist,'assets/vendor',entry.file),vendorOutput.get(entry.file));
await writeFile(join(dist,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(join(dist,'404.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sayfa bulunamadı</title><h1>Sayfa bulunamadı</h1><p>Soyturk Works ana adresini açın.</p></html>');
const textAsset=/\.(?:css|html|js|json|mjs|txt)$|(?:^|\/)(?:_headers|robots\.txt)$/;
async function normalizeTextAssets(dir,prefix=''){
 for(const name of (await readdir(dir)).sort()){
  const file=join(dir,name),rel=prefix+name;
  if((await stat(file)).isDirectory())await normalizeTextAssets(file,rel+'/');
  else if(!rel.startsWith('assets/vendor/')&&textAsset.test(rel)){const source=await readFile(file,'utf8'),normalized=source.replace(/\r\n/g,'\n');if(source!==normalized)await writeFile(file,normalized);}
 }
}
await normalizeTextAssets(dist);
const inventory=[];
async function walk(dir,prefix=''){for(const name of (await readdir(dir)).sort()){const file=join(dir,name),rel=prefix+name;if((await stat(file)).isDirectory())await walk(file,rel+'/');else inventory.push({file:rel,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}}
await walk(dist);
for(const entry of inventory)if((await stat(join(dist,entry.file))).size>25*1024*1024)throw Error('Cloudflare dosya boyutu sınırı aşıldı: '+entry.file);
await writeFile(join(root,'release-manifest.json'),JSON.stringify({version:180,files:inventory},null,2)+'\n');
console.log('180 web dağıtımı hazır: dist/ ('+inventory.length+' dosya). Sunucuda yalnızca bu dizini, kimlik doğrulaması arkasında sunun.');
