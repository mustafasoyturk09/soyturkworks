import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../src/app.html',import.meta.url);
let source=await readFile(path,'utf8');
const match=source.match(/(<script\b[^>]*id="fc153PortableTemplate"[^>]*>)([\s\S]*?)(<\/script>)/);
if(!match)throw Error('Taşınabilir şablon bulunamadı.');
let template=JSON.parse(match[2]);
const branding=await readFile(new URL('../src/branding.css',import.meta.url),'utf8');
template=template.replace(/<style id="sw-responsive-branding">[\s\S]*?<\/style>/,()=>'<style id="sw-responsive-branding">'+branding+'</style>');
const css=await readFile(new URL('../src/workspace.css',import.meta.url),'utf8');
const js=await readFile(new URL('../src/workspace.js',import.meta.url),'utf8');
template=template.replace(/<style id="sw-workspace-ui">[\s\S]*?<\/style>/,()=>'<style id="sw-workspace-ui">'+css+'</style>');
template=template.replace(/<script>\/\* Company context is fixed[\s\S]*?<\/script>/,()=>'<script>'+js+'</script>');
const mobile=await readFile(new URL('../src/mobile.js',import.meta.url),'utf8');
template=template.replace(/<script>\s*\(\(\) => \{\n  'use strict';\n  const sidebar=document.querySelector[\s\S]*?<\/script>/,()=>'<script>\n'+mobile+'</script>');
const iziCSS=await readFile(new URL('../src/izibiz.css',import.meta.url),'utf8');
const iziJS=await readFile(new URL('../src/izibiz.js',import.meta.url),'utf8');
const mobileCSS=await readFile(new URL('../src/mobile.css',import.meta.url),'utf8');
const salesCSS=await readFile(new URL('../src/sales-issue.css',import.meta.url),'utf8');
const salesJS=await readFile(new URL('../src/sales-issue.js',import.meta.url),'utf8');
const salesHTML=await readFile(new URL('../src/sales-issue.html',import.meta.url),'utf8');
// Both web and portable builds contain the same module markup. User files are
// browser-local and are never serialized into the distributed source template.
source=source.replace(/<div class="page" id="page-satis-kesme"[\s\S]*?(?=<div class="page" id="page-satis")/,()=>salesHTML+'\n');
template=template.replace(/<div class="page" id="page-satis-kesme"[\s\S]*?(?=<div class="page" id="page-satis")/,()=>salesHTML+'\n');
// Keep the older Sales Invoices workspace identical in the portable export.
const salesPageStart='<div class="page" id="page-satis"';
const salesPageEnd='<div class="y-lightbox"';
function salesPage(content){
 const start=content.indexOf(salesPageStart),end=content.indexOf(salesPageEnd,start);
 if(start<0||end<0)throw Error('Satış faturaları sayfası bulunamadı.');
 return content.slice(start,end);
}
const currentSalesPage=salesPage(source);
template=template.replace(/<div class="page" id="page-satis"[\s\S]*?(?=<div class="y-lightbox")/,()=>currentSalesPage);
function salesInlineScript(content){
 const marker=content.indexOf('var MAX_FILES = 500;',content.indexOf(salesPageEnd));
 const start=content.lastIndexOf('<script>',marker),end=content.indexOf('</script>',marker)+9;
 if(marker<0||start<0||end<9)throw Error('Satış faturaları kodu bulunamadı.');
 return content.slice(start,end);
}
const currentSalesScript=salesInlineScript(source);
const oldSalesScript=salesInlineScript(template);
template=template.replace(oldSalesScript,()=>currentSalesScript);
const salesStyle='<style id="sw-sales-preparation-ui">'+salesCSS+mobileCSS.slice(mobileCSS.indexOf('/* Sales preparation'))+'</style>';
const salesScript='<script id="sw-sales-preparation-code">'+salesJS+'</script>';
if(template.includes('id="sw-sales-preparation-ui"'))template=template.replace(/<style id="sw-sales-preparation-ui">[\s\S]*?<\/style>/,()=>salesStyle);else template=template.replace('</head>',()=>salesStyle+'</head>');
if(template.includes('id="sw-sales-preparation-code"'))template=template.replace(/<script id="sw-sales-preparation-code">[\s\S]*?<\/script>/,()=>salesScript);else template=template.replace('</body>',()=>salesScript+'</body>');
const iziMedia=mobileCSS.slice(mobileCSS.indexOf('@media(max-width:600px)'),mobileCSS.indexOf('.sw-mobile-bar, .sw-nav-backdrop'));
const iziStyle='<style id="sw-izibiz-ui">'+iziCSS+iziMedia+'</style>';
const iziScript='<script id="sw-izibiz-code">'+iziJS+'</script>';
if(template.includes('id="sw-izibiz-ui"'))template=template.replace(/<style id="sw-izibiz-ui">[\s\S]*?<\/style>/,()=>iziStyle);else template=template.replace('</head>',()=>iziStyle+'</head>');
if(template.includes('id="sw-izibiz-code"'))template=template.replace(/<script id="sw-izibiz-code">[\s\S]*?<\/script>/,()=>iziScript);else template=template.replace('</body>',()=>iziScript+'</body>');
const serialized=JSON.stringify(template).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
source=source.replace(match[0],()=>match[1]+serialized+match[3]);
await writeFile(path,source);
