// Deployment ownership is proved by a random 256-bit secret kept only on the
// owner's computer. The public configuration contains its digest, never the link.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
const root=new URL('../',import.meta.url),privateFile=new URL('.secrets/owner-setup.json',root);
const mode=process.argv[2];
if(mode==='prepare'){
  const email=process.env.SW_RECOVERY_EMAIL;
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Kurtarma adresi yerel ortam değişkeninde belirtilmeli.');
  await mkdir(new URL('.secrets/',root),{recursive:true,mode:0o700});
  const value={token:randomBytes(32).toString('base64url'),email,expires:Date.now()+86400000};
  await writeFile(privateFile,JSON.stringify(value),{mode:0o600});
  const cfgFile=new URL('wrangler.jsonc',root),cfg=JSON.parse(await readFile(cfgFile,'utf8'));
  cfg.vars.OWNER_SETUP_SHA256=createHash('sha256').update(value.token).digest('hex');cfg.vars.OWNER_SETUP_EXPIRES=String(value.expires);
  await writeFile(cfgFile,JSON.stringify(cfg,null,2)+'\n');
  console.log('Özel ilk kurulum hazır. Gizli bağlantı yalnızca bu bilgisayarda saklanıyor.');
}else if(mode==='serve'){
  const value=JSON.parse(await readFile(privateFile,'utf8'));
  if(value.expires<Date.now())throw Error('İlk kurulum bağlantısının süresi doldu.');
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const fragment=new URLSearchParams({setup:value.token,owner:value.email}).toString();
  const target=cfg.vars.APP_ORIGIN+'/login#'+fragment;
  const server=createServer((request,response)=>{
    if(request.headers.host!=='127.0.0.1:4181'||request.url!=='/'||request.method!=='GET'){response.writeHead(404);response.end();return;}
    response.writeHead(302,{'Location':target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});response.end();
  });
  server.listen(4181,'127.0.0.1',()=>console.log('İlk hesap kurulumu: http://127.0.0.1:4181'));
}else if(mode==='check-mail'){
  const value=JSON.parse(await readFile(privateFile,'utf8'));
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8')),origin=cfg.vars.APP_ORIGIN;
  const response=await fetch(origin+'/api/recovery',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({ownerToken:value.token,recoveryEmail:value.email})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'E-posta gönderilemedi.');
  console.log('Cloudflare kurtarma e-postası gönderimini kabul etti.');
}else throw Error('prepare, serve veya check-mail komutu gerekli.');
