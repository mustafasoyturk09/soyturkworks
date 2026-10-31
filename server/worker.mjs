import {DurableObject} from 'cloudflare:workers';
import {randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {IzibizConnector} from './izibiz.mjs';
import {InvoiceArchive,workHours,nextCheck} from './automation.mjs';
import {pushAPI,enqueueNotification,flushNotifications} from './push.mjs';
import {generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse} from '@simplewebauthn/server';

const derive = promisify(scrypt);
const COMPANIES = [
  {id:'PUSULA', name:'Pusula', initials:'P', color:'#54d2b0'},
  {id:'COMED', name:'Comed', initials:'C', color:'#7aabff'},
  {id:'KIB', name:'Kendine İyi Bak', initials:'K', color:'#d6b77e'},
  {id:'DIJITAL_GARAJ', name:'Dijital Garaj', initials:'DG', color:'#9c9bff'},
  {id:'KIB_DIJITAL', name:'KİB Dijital Tek', initials:'KD', color:'#75ccd5'},
];
const DAY = 86400000;
const token = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cookie = (value, secure, maxAge=14*86400) => `${secure?'__Host-':''}sw_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
const local = env => env.LOCAL_MAILBOX==='1' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.APP_ORIGIN||'');
const sessionValue = request => (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(new URL(request.url).protocol==='https:'?'__Host-sw_session=':'sw_session='))?.split('=')[1] || '';
const fail = (message, status=400) => {throw Object.assign(new Error(message), {status});};

async function passwordHash(password, salt=randomBytes(16).toString('hex')) {
  const derived=await derive(password, salt, 32, {N:32768,r:8,p:3,maxmem:64*1024*1024});
  return {salt, digest:derived.toString('hex')};
}
function validPassword(value) {
  if(typeof value!=='string'||value.length<7||value.length>128) fail('Parola 7–128 karakter olmalı.');
}
async function checkPassword(password, saved) {
  const test=await passwordHash(typeof password==='string'?password.slice(0,128):'', saved?.salt||'00000000000000000000000000000000');
  return !!saved && timingSafeEqual(Buffer.from(test.digest,'hex'), Buffer.from(saved.digest,'hex'));
}
function publicAccount(account) {return {username:account.username, recoveryEmail:account.email.replace(/^(.{2}).*(@.*)$/, '$1••••$2')};}

export default {
  async scheduled(event,env,ctx){
    const store=env.AUTH.get(env.AUTH.idFromName('single-owner-v1'));
    ctx.waitUntil(store.fetch(new Request('https://automation.internal/tick',{method:'POST'})).then(async r=>{if(!r.ok)throw Error('Otomatik kontrol başlatılamadı.');}));
  },
  async fetch(request, env) {
    const url=new URL(request.url);
    const origin=env.APP_ORIGIN;
    if(!origin || url.origin!==origin) return json({error:'Uygulama adresi yapılandırılmadı.'},503);
    const store=env.AUTH.get(env.AUTH.idFromName('single-owner-v1'));
    let response;
    try {
      if(url.pathname.startsWith('/api/')) {
        if(request.method!=='GET' && (request.headers.get('Origin')!==origin || request.headers.get('Content-Type')?.split(';')[0]!=='application/json')) return json({error:'Geçersiz istek kaynağı.'},403);
        if(Number(request.headers.get('Content-Length')||0)>32768) return json({error:'İstek çok büyük.'},413);
        response=await store.fetch(request);
      } else if(url.pathname==='/__local/mail' && local(env)) {
        response=await store.fetch(new Request(new URL('/api/local-mail',origin)));
      } else {
        if(!['GET','HEAD'].includes(request.method)) return new Response('Yöntem desteklenmiyor.',{status:405});
        const publicAsset=/^\/portal\/(?:portal\.(?:css|js)|passkeys\.js)$/.test(url.pathname) || /^\/assets\/brand\/(?:sw-logo|favicon-\d+|apple-touch-icon)\.png$/.test(url.pathname) || ['/favicon.ico','/robots.txt','/manifest.webmanifest','/push-sw.js'].includes(url.pathname);
        if(publicAsset) response=await env.ASSETS.fetch(request);
        else {
          const sessionResponse=await store.fetch(new Request(new URL('/api/session',origin), {headers:request.headers}));
          const auth=await sessionResponse.json();
          if(url.pathname==='/' || url.pathname==='/login' || url.pathname==='/companies' || url.pathname==='/account') {
            response=await asset(env,request,'/portal/index.html');
          } else if(url.pathname==='/takip'||url.pathname==='/takip/'){
            if(!auth.account)return Response.redirect(origin+'/login?next='+encodeURIComponent(url.pathname+url.search),303);
            const company=auth.companies.find(c=>c.id===url.searchParams.get('company')&&c.active&&!c.deleted);
            const view=url.searchParams.get('view');
            return Response.redirect(origin+(company?'/workspace/'+company.id+'/takip/'+(['invoices','folders','notifications'].includes(view)?'?view='+view:''):'/companies'),303);
          } else if(url.pathname.startsWith('/workspace/')) {
            if(!auth.account) return Response.redirect(origin+'/login?next='+encodeURIComponent(url.pathname+url.search),303);
            const route=url.pathname.match(/^\/workspace\/([A-Z_]+)(\/takip)?\/?$/);
            const id=route?.[1];
            const company=auth.companies.find(c=>c.id===id&&c.active&&!c.deleted);
            if(!company) return Response.redirect(origin+'/companies',303);
            response=await asset(env,request,route[2]?'/automation/index.html':'/index.html');
            const context=JSON.stringify({company,account:auth.account,origin}).replace(/</g,'\\u003c');
            response=new HTMLRewriter().on('head',{element(element){element.prepend('<base href="/"><script>window.SW_CONTEXT='+context+';</script>',{html:true});}}).transform(response);
          } else if(!auth.account) response=json({error:'Oturum açmanız gerekiyor.'},401);
          else if(url.pathname==='/index.html' || url.pathname.startsWith('/portal/')) response=new Response('Sayfa bulunamadı.',{status:404});
          else response=await env.ASSETS.fetch(request);
        }
      }
    } catch(error) {response=json({error:error.status?error.message:'İşlem tamamlanamadı. Lütfen yeniden deneyin.'},error.status||500);}
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','no-referrer');
    headers.set('X-Frame-Options','DENY');
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)');
    headers.set('Cache-Control','no-store');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
};
async function asset(env,request,path) {
  const url=new URL(request.url);url.pathname=path;url.search='';
  const headers=new Headers(request.headers);for(const key of ['If-None-Match','If-Modified-Since','Range','If-Range'])headers.delete(key);
  return env.ASSETS.fetch(new Request(url,{method:'GET',headers}));
}

export class AuthStore extends DurableObject {
  constructor(ctx,env) {super(ctx,env);this.storage=ctx.storage;this.env=env;}
  async session(request) {
    const raw=sessionValue(request);if(!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    const key='session:'+hash(raw), entry=await this.storage.get(key), account=await this.storage.get('account');
    if(!entry||entry.expires<Date.now()||!account||entry.revision!==account.revision) {if(entry)await this.storage.delete(key);return null;}
    return {...entry,key};
  }
  async rate(request,kind,limit=10,minutes=15) {
    const ip=request.headers.get('CF-Connecting-IP')||'local';
    const key='rate:'+kind+':'+hash(ip).slice(0,20), now=Date.now();
    const value=await this.storage.get(key)||{until:now+minutes*60000,count:0};
    if(value.until<now){value.until=now+minutes*60000;value.count=0;}
    value.count++;await this.storage.put(key,value);
    if(value.count>limit)fail('Çok fazla deneme yapıldı. Bir süre sonra yeniden deneyin.',429);
  }
  async issueSession(revision) {
    const raw=token();await this.storage.transaction(async tx=>{const account=await tx.get('account');if(!account||account.revision!==revision)fail('Hesap bilgileri değişti. Yeniden giriş yapın.',401);await tx.put('session:'+hash(raw),{revision,created:Date.now(),expires:Date.now()+14*DAY});});
    await this.scheduleMaintenance(Date.now()+DAY);
    return cookie(raw, new URL(this.env.APP_ORIGIN).protocol==='https:');
  }
  ownerSetup(raw,email,account) {
    if(account||typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw)||!Number.isFinite(Number(this.env.OWNER_SETUP_EXPIRES))||Number(this.env.OWNER_SETUP_EXPIRES)<Date.now()||!/^[a-f0-9]{64}$/.test(this.env.OWNER_SETUP_SHA256||''))return null;
    if(!timingSafeEqual(Buffer.from(hash(raw),'hex'),Buffer.from(this.env.OWNER_SETUP_SHA256,'hex')))return null;
    if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Geçerli bir kurtarma e-posta adresi gerekiyor.');
    return {kind:'setup',expires:Number(this.env.OWNER_SETUP_EXPIRES),email:email.trim().toLowerCase()};
  }
  async sendRecovery(account,setupEmail) {
    const recipient=account?.email||setupEmail||this.env.OWNER_EMAIL;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))fail('İlk hesap kurulumu uygulama sahibi tarafından tamamlanmalı.',503);
    const raw=token(), kind=account?'reset':'setup';
    const link=this.env.APP_ORIGIN+'/login#'+kind+'='+raw;
    const message={from:{email:'giris@soyturkworks.com',name:'Soyturk Works'},to:recipient,
      subject:account?'Soyturk Works — Parola yenileme':'Soyturk Works — Hesabını oluştur',
      text:`${account?'Parolanı yenilemek':'Hesabını oluşturmak'} için bu bağlantıyı aç:\n${link}\n\nBağlantı 15 dakika geçerlidir ve bir kez kullanılabilir. Bu işlemi sen istemediysen mesajı yok say.`,
      html:`<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px;background:#101d30;color:#fff;border-radius:20px"><h1>Soyturk Works</h1><p>${account?'Parolanı yenile.':'Hesabını oluştur.'}</p><p><a style="display:inline-block;padding:14px 24px;background:#54d2b0;color:#091a24;text-decoration:none;border-radius:10px" href="${link}">${account?'Parolayı yenile':'Hesabı oluştur'}</a></p><p>Bu bağlantı 15 dakika geçerlidir ve bir kez kullanılabilir.</p><p>Bu işlemi sen istemediysen mesajı yok say.</p></div>`};
    const pending={kind,email:recipient,expires:Date.now()+15*60000};
    await this.storage.put('recovery:'+hash(raw),pending);
    try {
      if(local(this.env)) await this.storage.put('local-mail',{...message,link});
      else if(this.env.EMAIL) await this.env.EMAIL.send(message);
      else fail('Kurtarma e-postası hizmeti henüz bağlanmadı.',503);
    } catch(error) {await this.storage.delete('recovery:'+hash(raw));if(error.status)throw error;fail('E-posta gönderilemedi. E-posta bağlantısını kontrol edin.',503);}
    await this.scheduleMaintenance(Date.now()+DAY);
  }
  async fetch(request) {
    try {return await this.handle(request);}catch(error){return json({error:error.status?error.message:'İşlem tamamlanamadı. Lütfen yeniden deneyin.'},error.status||500);}
  }
  async handle(request) {
    const url=new URL(request.url), path=url.pathname;
    // This origin is reachable only through the internal Durable Object binding.
    // The public Worker rejects every origin except APP_ORIGIN before routing.
    // Keep the encryption key in a separate private object from credentials.
    if(url.origin==='https://izibiz-key.internal'&&path==='/key'&&request.method==='POST'){
      const key=await this.storage.transaction(async tx=>{let key=await tx.get('encryption-key:v1');if(!key){key=token();await tx.put('encryption-key:v1',key);}return key;});
      return json({key});
    }
    if(url.origin==='https://invoice-store.internal'){
      const match=path.match(/^\/([A-Z_]+)\/([a-z-]+)$/),company=match&&COMPANIES.find(c=>c.id===match[1]);
      if(!company)fail('Geçersiz firma.',400);
      const assigned=await this.storage.get('automation:company');
      if(assigned&&assigned!==company.id)fail('Firma bağlamı eşleşmiyor.',403);
      if(!assigned)await this.storage.put('automation:company',company.id);
      if(!this.archive)this.archive=new InvoiceArchive({storage:this.storage,company,
        getConnection:async id=>{const owner=this.env.AUTH.get(this.env.AUTH.idFromName('single-owner-v1'));const r=await owner.fetch(new Request('https://automation.internal/connection/'+id,{method:'POST'}));if(!r.ok)fail('Firma bağlantısı alınamadı.',503);return r.json();},
        notify:async event=>{const owner=this.env.AUTH.get(this.env.AUTH.idFromName('single-owner-v1'));const r=await owner.fetch(new Request('https://automation.internal/notify',{method:'POST',body:JSON.stringify(event)}));if(!r.ok)throw Error('Bildirim sıraya alınamadı.');}
      });
      const body=request.method==='GET'?{}:await readJSON(request);
      return this.archive.handle(match[2],request.method,body,url.searchParams);
    }
    if(url.origin==='https://automation.internal'){
      const account=await this.storage.get('account');if(!account)return json({error:'Hesap hazır değil.'},409);
      if(path.startsWith('/connection/')){
        const id=path.split('/').pop(),company=(await this.companies()).find(c=>c.id===id);if(!company)fail('Firma bulunamadı.',404);
        return json({saved:await this.storage.get('izibiz:config:'+id)||null,key:await this.izibizKey(),active:company.active&&!company.deleted});
      }
      if(path==='/tick'){
        const enabled=(await this.companies()).filter(c=>c.active&&!c.deleted);
        await Promise.all(enabled.map(c=>this.companyArchive(c.id,'tick','POST',{})));
        if(workHours(Date.now()))await this.flushPush(account.revision);
        return json({ok:true});
      }
      if(path==='/notify'){
        const event=await readJSON(request);if(!/^[a-f0-9]{64}$/.test(event.id||'')||!COMPANIES.some(c=>c.id===event.company))fail('Bildirim geçersiz.');
        await enqueueNotification(this.storage,event);
        if(workHours(Date.now()))await this.flushPush(account.revision);
        return json({ok:true});
      }
      return json({error:'İşlem bulunamadı.'},404);
    }
    const account=await this.storage.get('account');
    if(path==='/api/local-mail'&&local(this.env))return json(await this.storage.get('local-mail')||{});
    if(path==='/api/session'&&request.method==='GET') {
      const session=await this.session(request);
      return json({initialized:!!account,setupMethod:this.env.OWNER_EMAIL?'email':'owner-link',account:session&&account?publicAccount(account):null,companies:session?await this.companies():[],localMailbox:local(this.env)});
    }
    const body=request.method==='GET'?{}:await readJSON(request);
    if(path==='/api/login'&&request.method==='POST') {
      await this.rate(request,'login',15);
      const correct=await this.ctx.blockConcurrencyWhile(()=>checkPassword(body.password,account?.password));
      if(!account||body.username!==account.username||!correct)fail('Kullanıcı adı veya parola yanlış.',401);
      return json({ok:true},200,{'Set-Cookie':await this.issueSession(account.revision)});
    }
    if(path==='/api/recovery'&&request.method==='POST') {
      await this.rate(request,'recovery',3,30);
      const owner=!account?this.ownerSetup(body.ownerToken,body.recoveryEmail,account):null;
      await this.sendRecovery(account,owner?.email);
      return json({ok:true,message:'Bağlantı kayıtlı kurtarma e-posta adresine gönderildi.'});
    }
    if(path==='/api/recovery/complete'&&request.method==='POST') {
      await this.rate(request,'recovery-complete',10);
      if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token))fail('Bağlantı geçersiz veya süresi dolmuş.');
      const key='recovery:'+hash(body.token), recovery=await this.storage.get(key)||this.ownerSetup(body.token,body.recoveryEmail,account);
      if(!recovery||recovery.expires<Date.now()||recovery.kind!==(account?'reset':'setup'))fail('Bağlantı geçersiz veya süresi dolmuş.');
      validPassword(body.password);
      const username=account?.username||String(body.username||'').trim();
      if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))fail('Kullanıcı adı 3–40 harf, rakam, nokta veya alt çizgi içermeli.');
      const password=await this.ctx.blockConcurrencyWhile(()=>passwordHash(body.password)), revision=token();
      // All links are single use. A completed recovery also revokes other links,
      // sessions and passkeys, so a lost device cannot keep access.
      await this.storage.transaction(async tx=>{
        const currentAccount=await tx.get('account'),current=await tx.get(key)||this.ownerSetup(body.token,body.recoveryEmail,currentAccount);
        if(!current||current.expires<Date.now()||current.kind!==(currentAccount?'reset':'setup'))fail('Bu bağlantı daha önce kullanıldı.');
        await tx.put('account',{username,email:account?.email||current.email||this.env.OWNER_EMAIL,password,revision,webauthnId:account?.webauthnId||token(),created:account?.created||Date.now()});
        for(const prefix of ['recovery:','session:','passkey:','challenge:']){const records=await tx.list({prefix});if(records.size)await tx.delete([...records.keys()]);}
      });
      return json({ok:true},200,{'Set-Cookie':await this.issueSession(revision)});
    }
    if(path==='/api/passkeys/login/options'&&request.method==='POST') {
      await this.rate(request,'passkey-login',20);
      const passkeys=await this.storage.list({prefix:'passkey:'});
      if(!account||!passkeys.size)fail('Önce parola ile giriş yapıp bu cihaz için geçiş anahtarı ekleyin.',404);
      const options=await generateAuthenticationOptions({rpID:new URL(this.env.APP_ORIGIN).hostname,userVerification:'required',allowCredentials:[...passkeys.values()].map(k=>({id:k.id,transports:k.transports}))});
      const id=token();await this.storage.put('challenge:'+hash(id),{kind:'login',value:options.challenge,expires:Date.now()+5*60000});
      return json({options,id});
    }
    if(path==='/api/passkeys/login/verify'&&request.method==='POST') {
      await this.rate(request,'passkey-verify',20);
      const challenge=await this.takeChallenge(body.id,'login');
      const saved=typeof body.response?.id==='string'?await this.storage.get('passkey:'+body.response.id):null;
      if(!saved)fail('Geçiş anahtarı doğrulanamadı.',401);
      let verification;
      try{verification=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.value,expectedOrigin:this.env.APP_ORIGIN,expectedRPID:new URL(this.env.APP_ORIGIN).hostname,requireUserVerification:true,credential:{id:saved.id,publicKey:new Uint8Array(saved.publicKey),counter:saved.counter,transports:saved.transports}});}catch{fail('Geçiş anahtarı doğrulanamadı.',401);}
      if(!verification.verified)fail('Geçiş anahtarı doğrulanamadı.',401);
      await this.storage.transaction(async tx=>{const current=await tx.get('passkey:'+saved.id);if(!current||current.counter!==saved.counter)fail('Cihaz kaydı değişti. Yeniden giriş yapın.',401);await tx.put('passkey:'+saved.id,{...saved,counter:verification.authenticationInfo.newCounter});});
      return json({ok:true},200,{'Set-Cookie':await this.issueSession(account.revision)});
    }
    const session=await this.session(request);
    if(!session||!account)fail('Oturum açmanız gerekiyor.',401);
    if(path.startsWith('/api/push/')){
      const company=(await this.companies()).find(c=>c.id===url.searchParams.get('company')&&c.active&&!c.deleted);
      if(!company)fail('Bildirim işlemi için etkin bir firma seçin.',400);
      const action=path.slice('/api/push/'.length);return pushAPI(this.storage,this.env.APP_ORIGIN,action,request.method,{...body,company:company.id,companyName:company.name,revision:account.revision});
    }
    if(path==='/api/automation'&&request.method==='GET'){
      fail('Önce bir firma seçin. Toplu takip ekranı kullanılmıyor.',400);
    }
    if(path.startsWith('/api/automation/')){
      const match=path.match(/^\/api\/automation\/([A-Z_]+)\/([a-z-]+)$/),company=match&&(await this.companies()).find(c=>c.id===match[1]&&c.active&&!c.deleted);
      if(!company)fail('Firma bulunamadı veya etkin değil.',403);
      if(match[2]==='events'&&request.method==='GET')return json({events:[...(await this.storage.list({prefix:'push:event:'})).values()].filter(e=>e.company===company.id).sort((a,b)=>b.created-a.created).slice(0,50)});
      if(match[2]==='summary'&&request.method==='GET'){const r=await this.companyArchive(company.id,'summary','GET');if(!r.ok)return r;return json({...await r.json(),connected:!!await this.storage.get('izibiz:config:'+company.id)});}
      if(!['summary','scan','settings','invoices','mark','baseline','folders','audit','delete-folder','excel','pdf','export'].includes(match[2]))return json({error:'İşlem bulunamadı.'},404);
      if(['scan','excel'].includes(match[2])&&request.method==='POST')await this.rate(request,'archive-'+match[2]+':'+company.id,20,15);
      return this.companyArchive(company.id,match[2],request.method,body,url.search);
    }
    if(path.startsWith('/api/izibiz/')){
      const match=path.match(/^\/api\/izibiz\/([A-Z_]+)\/(status|connect|disconnect|list|download)$/);
      const company=match&&(await this.companies()).find(c=>c.id===match[1]&&c.active&&!c.deleted);
      if(!company)fail('Firma bulunamadı veya etkin değil.',403);
      if(match[2]==='connect')await this.rate(request,'izibiz-connection:'+company.id,5,15);
      if(!this.izibiz){
        let key=this.env.IZIBIZ_ENCRYPTION_KEY;
        if(!key){const vault=this.env.AUTH.get(this.env.AUTH.idFromName('izibiz-encryption-key-v1'));const result=await vault.fetch(new Request('https://izibiz-key.internal/key',{method:'POST'}));key=(await result.json()).key;}
        this.izibiz=new IzibizConnector({storage:this.storage,key});
      }
      try{return await this.izibiz.handle(company.id,match[2],request.method,body);}catch(error){
        // Infrastructure errors must not consume the user's login attempts.
        if(match[2]==='connect'&&error.status>=500){const ip=request.headers.get('CF-Connecting-IP')||'local',key='rate:izibiz-connection:'+company.id+':'+hash(ip).slice(0,20);await this.storage.transaction(async tx=>{const value=await tx.get(key);if(value){value.count=Math.max(0,value.count-1);await tx.put(key,value);}});}
        throw error;
      }
    }
    if(path==='/api/logout'&&request.method==='POST'){await this.storage.delete(session.key);return json({ok:true},200,{'Set-Cookie':cookie('',new URL(this.env.APP_ORIGIN).protocol==='https:',0)});}
    if(path==='/api/companies'&&request.method==='GET')return json({companies:await this.companies()});
    if(path==='/api/companies'&&request.method==='PATCH') {
      if(!COMPANIES.some(c=>c.id===body.id)||typeof body.active!=='boolean'||typeof body.deleted!=='boolean')fail('Geçersiz firma.');
      await this.storage.put('company:'+body.id,{active:body.active,deleted:body.deleted});return json({companies:await this.companies()});
    }
    if(path==='/api/account/password'&&request.method==='POST') {
      await this.rate(request,'password',5);
      if(!await this.ctx.blockConcurrencyWhile(()=>checkPassword(body.currentPassword,account.password)))fail('Mevcut parola yanlış.',401);
      validPassword(body.password);const previousRevision=account.revision;account.password=await this.ctx.blockConcurrencyWhile(()=>passwordHash(body.password));account.revision=token();
      await this.storage.transaction(async tx=>{const current=await tx.get('account');if(current.revision!==previousRevision)fail('Hesap bilgileri değişti. Yeniden giriş yapın.',401);await tx.put('account',account);const sessions=await tx.list({prefix:'session:'});if(sessions.size)await tx.delete([...sessions.keys()]);});
      return json({ok:true},200,{'Set-Cookie':await this.issueSession(account.revision)});
    }
    if(path==='/api/passkeys'&&request.method==='GET')return json({passkeys:[...(await this.storage.list({prefix:'passkey:'})).values()].map(k=>({id:k.id,name:k.name,created:k.created}))});
    if(path==='/api/passkeys'&&request.method==='DELETE') {
      if(typeof body.id!=='string'||body.id.length>1500)fail('Geçersiz geçiş anahtarı.');await this.storage.delete('passkey:'+body.id);return json({ok:true});
    }
    if(path==='/api/passkeys/register/options'&&request.method==='POST') {
      if(Date.now()-session.created>10*60000)fail('Geçiş anahtarı eklemek için yeniden parola ile giriş yapın.',401);
      const keys=await this.storage.list({prefix:'passkey:'});
      if(keys.size>=20)fail('En fazla 20 geçiş anahtarı kaydedilebilir.');
      const options=await generateRegistrationOptions({rpName:'Soyturk Works',rpID:new URL(this.env.APP_ORIGIN).hostname,userName:account.username,userID:Uint8Array.from(Buffer.from(account.webauthnId,'base64url')),attestationType:'none',excludeCredentials:[...keys.values()].map(k=>({id:k.id,transports:k.transports})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
      const id=token();await this.storage.put('challenge:'+hash(id),{kind:'register',session:session.key,value:options.challenge,expires:Date.now()+5*60000});return json({options,id});
    }
    if(path==='/api/passkeys/register/verify'&&request.method==='POST') {
      const challenge=await this.takeChallenge(body.id,'register');
      if(challenge.session!==session.key)fail('Doğrulama oturumu geçersiz.',403);
      let verification;
      try{verification=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.value,expectedOrigin:this.env.APP_ORIGIN,expectedRPID:new URL(this.env.APP_ORIGIN).hostname,requireUserVerification:true});}catch{fail('Cihaz doğrulanamadı. Yeniden deneyin.');}
      if(!verification.verified)fail('Cihaz doğrulanamadı.');
      const credential=verification.registrationInfo.credential;
      await this.storage.transaction(async tx=>{const current=await tx.get('account');if(current.revision!==account.revision||!await tx.get(session.key))fail('Oturum değişti. Yeniden giriş yapın.',401);await tx.put('passkey:'+credential.id,{id:credential.id,publicKey:[...credential.publicKey],counter:credential.counter,transports:credential.transports||[],name:String(body.name||'Cihazım').slice(0,60),created:Date.now()});});return json({ok:true});
    }
    return json({error:'İşlem bulunamadı.'},404);
  }
  async scheduleMaintenance(at){
    const current=await this.storage.getAlarm();await this.storage.setAlarm(current&&current>Date.now()?Math.min(current,at):at);
  }
  async flushPush(revision){
    this.pushQueue=(this.pushQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      await flushNotifications(this.storage,this.env.APP_ORIGIN,revision);
      const remaining=await this.storage.list({prefix:'push:outbox:'});
      if(remaining.size){const soon=Math.min(...[...remaining.values()].map(v=>v.nextAttempt||Date.now()+60000));await this.scheduleMaintenance(workHours(soon)?Math.max(Date.now()+1000,soon):nextCheck(soon));}
    });
    return this.pushQueue;
  }
  async izibizKey(){
    if(this.env.IZIBIZ_ENCRYPTION_KEY)return this.env.IZIBIZ_ENCRYPTION_KEY;
    const vault=this.env.AUTH.get(this.env.AUTH.idFromName('izibiz-encryption-key-v1'));
    return (await(await vault.fetch(new Request('https://izibiz-key.internal/key',{method:'POST'}))).json()).key;
  }
  async companyArchive(company,action,method,body,search=''){
    const object=this.env.AUTH.get(this.env.AUTH.idFromName('invoice-archive-v1:'+company));
    return object.fetch(new Request('https://invoice-store.internal/'+company+'/'+action+search,{method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body||{})}));
  }
  async takeChallenge(id,kind) {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(id))fail('Doğrulama süresi doldu.');
    const key='challenge:'+hash(id), value=await this.storage.transaction(async tx=>{const value=await tx.get(key);await tx.delete(key);return value;});
    if(!value||value.kind!==kind||value.expires<Date.now())fail('Doğrulama süresi doldu. Yeniden deneyin.');return value;
  }
  async companies() {return Promise.all(COMPANIES.map(async c=>({...c,active:true,deleted:false,...await this.storage.get('company:'+c.id)})));}
  async alarm() {
    const company=await this.storage.get('automation:company');
    if(company){
      if(!this.archive)await this.handle(new Request('https://invoice-store.internal/'+company+'/summary'));
      await this.archive.advance();return;
    }
    const account=await this.storage.get('account');if(account&&workHours(Date.now()))await this.flushPush(account.revision);
    for(const prefix of ['session:','challenge:','recovery:','rate:']){const items=await this.storage.list({prefix});const expired=[...items].filter(([,v])=>(v.expires||v.until)<Date.now()).map(([k])=>k);if(expired.length)await this.storage.delete(expired);}await this.scheduleMaintenance(Date.now()+DAY);}
}
async function readJSON(request) {
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){reader.cancel().catch(()=>{});fail('İstek çok büyük.',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(data);
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))fail('Geçersiz istek.');return value;}catch{fail('Geçersiz istek.');}
}
