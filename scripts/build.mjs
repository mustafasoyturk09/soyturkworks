import {readFile,writeFile,mkdir,copyFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const vendor=join(root,'vendor');
const manifest=JSON.parse(await readFile(join(vendor,'manifest.json'),'utf8'));
for(const entry of manifest){
 if(!/^[\w.-]+$/.test(entry.file))throw Error('Geçersiz varlık adı');
 const hash=createHash('sha256').update(await readFile(join(vendor,entry.file))).digest('hex');
 if(hash!==entry.sha256)throw Error('Varlık bütünlüğü uyuşmuyor: '+entry.file);
}
const dist=join(root,'dist');await mkdir(join(dist,'app'),{recursive:true});await mkdir(join(dist,'assets/vendor'),{recursive:true});
const ocrIds=['sfOcrCoreData','sfOcrLangData','sfOcrLangDataEng'];
const allowed=new Set(['index.html','robots.txt','404.html','_headers','app/runtime.js','app/pdf-loader.mjs',...ocrIds.map(id=>'app/'+id+'.js'),...manifest.map(x=>'assets/vendor/'+x.file)]);
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
let html=await readFile(join(root,'src/app.html'),'utf8');
for(const id of ocrIds){
 const pattern=new RegExp('(<script id="'+id+'" type="application/octet-stream">)([\\s\\S]*?)(</script>)');
 const match=html.match(pattern);
 if(!match)throw Error('OCR verisi bulunamadı: '+id);
 const filename='app/'+id+'.js';
 await writeFile(join(dist,filename),'document.getElementById('+JSON.stringify(id)+').textContent='+JSON.stringify(match[2])+';\n');
 html=html.replace(pattern,()=>match[1]+match[3]+'<script src="./'+filename+'"></script>');
}
await writeFile(join(dist,'index.html'),html);
await copyFile(join(root,'src/_headers'),join(dist,'_headers'));
for(const name of ['runtime.js','pdf-loader.mjs'])await copyFile(join(root,'src',name),join(dist,'app',name));
for(const entry of manifest)await copyFile(join(vendor,entry.file),join(dist,'assets/vendor',entry.file));
await writeFile(join(dist,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(join(dist,'404.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sayfa bulunamadı</title><h1>Sayfa bulunamadı</h1><p>Soyturk Works ana adresini açın.</p></html>');
const inventory=[];
async function walk(dir,prefix=''){for(const name of await readdir(dir)){const file=join(dir,name),rel=prefix+name;if((await stat(file)).isDirectory())await walk(file,rel+'/');else inventory.push({file:rel,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}}
await walk(dist);
for(const entry of inventory)if((await stat(join(dist,entry.file))).size>25*1024*1024)throw Error('Cloudflare dosya boyutu sınırı aşıldı: '+entry.file);
await writeFile(join(root,'release-manifest.json'),JSON.stringify({version:180,files:inventory},null,2)+'\n');
console.log('180 web dağıtımı hazır: dist/ ('+inventory.length+' dosya). Sunucuda yalnızca bu dizini, kimlik doğrulaması arkasında sunun.');
