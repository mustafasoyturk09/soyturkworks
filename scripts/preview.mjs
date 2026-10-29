import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
export function createPreview(base=process.env.BASE_PATH||'/'){
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))throw Error('BASE_PATH / veya /works/ biçiminde olmalı.');
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{
   const url=new URL(req.url,'http://preview.invalid');
   if(base!=='/'&&url.pathname===base.slice(0,-1)){res.writeHead(308,{Location:base}).end();return;}
   if(!url.pathname.startsWith(base)){res.writeHead(404).end();return;}
   const rel=decodeURIComponent(url.pathname.slice(base.length))||'index.html';
   if(rel.includes('\\')||rel.split('/').some(x=>x.startsWith('.'))){res.writeHead(404).end();return;}
   const file=resolve(root,rel);
   if(!file.startsWith(root+sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
   const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404).end();}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4173);if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT geçersiz.');
 const server=createPreview();server.listen(port,'127.0.0.1',()=>console.log(`Yerel önizleme (yayın sunucusu değildir): http://127.0.0.1:${port}${process.env.BASE_PATH||'/'}`));
 server.on('error',()=>{console.error('Önizleme başlatılamadı; PORT değerini kontrol edin.');process.exitCode=1;});
}
