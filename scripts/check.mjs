import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const raw=await readFile(root+'/dist/index.html','utf8');
const live=raw.replace(/<script type="application\/json" id="fc153PortableTemplate">[\s\S]*?<\/script>/,'');
assert(!/nt144Token|127\.0\.0\.1:38471|ef166Panel/.test(raw));
const seed=raw.match(/<script[^>]+id="fc153PortableData">([\s\S]*?)<\/script>/);
if(seed)for(const [key,value] of Object.entries(JSON.parse(seed[1]).values))if(/history|undo/.test(key))assert.equal(value,'[]');
for(const m of live.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(m[2].trim()&&!/type\s*=\s*["'](?!text\/javascript|application\/javascript|module)/i.test(m[1]))new vm.Script(m[2]);
for(const name of ['workspace.js','mobile.js','calculator-ui.js','izibiz.js'])new vm.Script(await readFile(root+'/src/'+name,'utf8'));
new vm.Script(await readFile(root+'/src/portal/portal.js','utf8'));
new vm.Script(await readFile(root+'/src/automation/app.js','utf8'));
new vm.Script(await readFile(root+'/src/push-sw.js','utf8'));
const workerConfig=JSON.parse(await readFile(root+'/wrangler.jsonc','utf8'));
assert.equal(workerConfig.assets.run_worker_first,true,'Giriş koruması varlıklardan önce çalışmalı.');
assert.equal(workerConfig.assets.binding,'ASSETS');
assert.equal(workerConfig.send_email[0].name,'EMAIL');
assert(!workerConfig.vars.OWNER_EMAIL,'Kişisel kurtarma adresini Cloudflare değişkeninde saklayın.');
for(const m of live.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)){
 assert(m[1].startsWith('./'),'Dış kaynak veya kök yola bağlı varlık: '+m[1]);
 // Cache versions and fragments are URL metadata, not part of the filename.
 await readFile(new URL(m[1],new URL('../dist/index.html',import.meta.url)));
}
assert(live.includes('s177Description'));
assert(!live.includes("console.log('[Satınalma OCR]"));
const cfg=await readFile(root+'/Caddyfile','utf8');
assert(cfg.indexOf('basic_auth')<cfg.indexOf('file_server'));assert(!cfg.includes('Access-Control-Allow-Origin'));
console.log('PASS: JavaScript, yerel varlıklar, hassas Windows bağlantısının kaldırılması, boş başlangıç, korumalı sunucu yapılandırması.');
