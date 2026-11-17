import {readFile,writeFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
let source=await read('src/app.html');
const match=source.match(/(<script\b[^>]*id="fc153PortableTemplate"[^>]*>)([\s\S]*?)(<\/script>)/);
if(!match)throw Error('Taşınabilir şablon bulunamadı.');
let template=JSON.parse(match[2]);
source=source.replace(match[0],'<!--SW_HOME_PORTABLE_TEMPLATE-->');
const markup=await read('src/home.html'),bridge=await read('src/home-notes-bridge.js');
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10"/></svg>';
function integrate(html,homeMarkup){
  if(html.includes('<!--SW_HOME_START-->'))html=html.replace(/<!--SW_HOME_START-->[\s\S]*?<!--SW_HOME_END-->/,()=>'<!--SW_HOME_START-->'+homeMarkup+'<!--SW_HOME_END-->');
  else html=html.replace('<main>',()=>'<main>\n<!--SW_HOME_START-->'+homeMarkup+'<!--SW_HOME_END-->');
  html=html.replace(/\s*<div class="nav-item" data-page="notlar">[^\n]*\n/,'\n');
  if(!html.includes('class="nav-item" data-page="home"'))html=html.replace('<div class="nav-label">Modüller</div>',()=>'<div class="nav-label">Modüller</div>\n<div class="nav-item" data-page="home">'+icon+' Ana Sayfa</div>');
  html=html.replace(/const FC_KNOWN_PAGES = \[[^;]+;/,"const FC_KNOWN_PAGES = ['home','efatura','satis','satis-kesme','yevmiye','mutabakat'];");
  html=html.replace("if(FC_KNOWN_PAGES.indexOf(pageId) === -1) pageId = 'efatura';","if(FC_KNOWN_PAGES.indexOf(pageId) === -1) pageId = 'home';");
  html=html.replace(/var saved = 'efatura';\s*try\{ saved = window.SWWorkspace.session.getItem\(FC_ACTIVE_PAGE_KEY\) \|\| 'efatura'; \}catch\(e\)\{ saved = 'efatura'; \}/,"var saved = 'home';\n  try{ saved = window.SWWorkspace.session.getItem(FC_ACTIVE_PAGE_KEY) || 'home'; }catch(e){ saved = 'home'; }");
  html=html.replace(/<div class="page[^\"]*" id="page-notlar"[^>]*>/,'<div id="page-notlar" hidden aria-hidden="true">');
  html=html.replace("$('ntSaveState').textContent='✓ Kaydedildi';nt144ScheduleSync();return true;","$('ntSaveState').textContent='✓ Kaydedildi';nt144ScheduleSync();document.dispatchEvent(new Event('sw:notes-changed'));return true;");
  html=html.replace('function nt127Extras(n){const x={angle:',"function nt127Extras(n){const x={notebookId:typeof n.notebookId==='string'?n.notebookId:'',taskDay:/^\\d{4}-\\d{2}-\\d{2}$/.test(n.taskDay||'')?n.taskDay:'',angle:");
  if(html.includes('// SW_HOME_NOTES_START'))html=html.replace(/\/\/ SW_HOME_NOTES_START[\s\S]*?\/\/ SW_HOME_NOTES_END/,()=>'// SW_HOME_NOTES_START\n'+bridge+'\n// SW_HOME_NOTES_END');
  else html=html.replace(/\s+setInterval\(reminders,1000\);document.addEventListener/,()=> '\n// SW_HOME_NOTES_START\n'+bridge+'\n// SW_HOME_NOTES_END\n setInterval(reminders,1000);document.addEventListener');
  return html;
}
source=integrate(source,markup);
if(!source.includes('href="./app/home.css"'))source=source.replace('<link rel="stylesheet" href="./app/mobile.css',()=>'<link rel="stylesheet" href="./app/home.css">\n<link rel="stylesheet" href="./app/mobile.css');
if(!source.includes('src="./app/home.js"'))source=source.replace('</head>','<script defer src="./app/home-model.js"></script>\n<script defer src="./app/home.js"></script>\n</head>');
// Offline exports have no external home dependencies, including the panoramas.
let offlineMarkup=markup;
for(const name of ['erciyes-day.jpg','erciyes-night.jpg']){const data=await readFile(new URL('../src/assets/home/'+name,import.meta.url));offlineMarkup=offlineMarkup.replace('./assets/home/'+name,'data:image/jpeg;base64,'+data.toString('base64'));}
template=integrate(template,offlineMarkup);
const responsive=(await read('src/mobile.css')).split('/* Dashboard uses')[1].split('@media(max-width:600px){\n  body .sw-izi-dialog')[0];
const style='<style id="sw-home-style">'+await read('src/home.css')+'\n/* Dashboard uses'+responsive+'</style>';
template=template.includes('id="sw-home-style"')?template.replace(/<style id="sw-home-style">[\s\S]*?<\/style>/,()=>style):template.replace('</head>',()=>style+'</head>');
const scripts='<script id="sw-home-code">'+await read('src/home-model.js')+'\n'+await read('src/home.js')+'</script>';
template=template.includes('id="sw-home-code"')?template.replace(/<script id="sw-home-code">[\s\S]*?<\/script>/,()=>scripts):template.replace('</body>',()=>scripts+'</body>');
const serialized=JSON.stringify(template).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
source=source.replace('<!--SW_HOME_PORTABLE_TEMPLATE-->',()=>match[1]+serialized+match[3]);
await writeFile(new URL('../src/app.html',import.meta.url),source);
console.log('Ana sayfa ve taşınabilir sürüm eşitlendi.');
