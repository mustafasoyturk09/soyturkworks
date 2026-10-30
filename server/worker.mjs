import {DurableObject} from 'cloudflare:workers';
import {randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
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
  if(typeof value!=='string'||value.length<12||value.length>128) fail('Parola 12–128 karakter olmalı.');
}
async function checkPassword(password, saved) {
  const test=await passwordHash(typeof password==='string'?password.slice(0,128):'', saved?.salt||'00000000000000000000000000000000');
  return !!saved && timingSafeEqual(Buffer.from(test.digest,'hex'), Buffer.from(saved.digest,'hex'));
}
function publicAccount(account) {return {username:account.username, recoveryEmail:account.email.replace(/^(.{2}).*(@.*)$/, '$1••••$2')};}

export default {
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
        const publicAsset=/^\/portal\/(?:portal\.(?:css|js)|passkeys\.js)$/.test(url.pathname) || /^\/assets\/brand\/(?:sw-logo|favicon-\d+|apple-touch-icon)\.png$/.test(url.pathname) || ['/favicon.ico','/robots.txt'].includes(url.pathname);
        if(publicAsset) response=await env.ASSETS.fetch(request);
        else {
          const sessionResponse=await store.fetch(new Request(new URL('/api/session',origin), {headers:request.headers}));
          const auth=await sessionResponse.json();
          if(url.pathname==='/' || url.pathname==='/login' || url.pathname==='/companies' || url.pathname==='/account') {
            response=await asset(env,request,'/portal/index.html');
          } else if(url.pathname.startsWith('/workspace/')) {
            if(!auth.account) return Response.redirect(origin+'/login',303);
            const id=url.pathname.match(/^\/workspace\/([A-Z_]+)\/?$/)?.[1];
            const company=auth.companies.find(c=>c.id===id&&c.active&&!c.deleted);
            if(!company) return Response.redirect(origin+'/companies',303);
            response=await asset(env,request,'/index.html');
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
    await this.storage.setAlarm(Date.now()+DAY);
    return cookie(raw, new URL(this.env.APP_ORIGIN).protocol==='https:');
  }
  async sendRecovery(account) {
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.env.OWNER_EMAIL||''))fail('Kurtarma e-posta adresi sunucuda henüz tanımlanmadı.',503);
    const raw=token(), kind=account?'reset':'setup';
    const link=this.env.APP_ORIGIN+'/login#'+kind+'='+raw;
    const message={from:{email:'giris@soyturkworks.com',name:'Soyturk Works'},to:this.env.OWNER_EMAIL,
      subject:account?'Soyturk Works — Parola yenileme':'Soyturk Works — Hesabını oluştur',
      text:`${account?'Parolanı yenilemek':'Hesabını oluşturmak'} için bu bağlantıyı aç:\n${link}\n\nBağlantı 15 dakika geçerlidir ve bir kez kullanılabilir. Bu işlemi sen istemediysen mesajı yok say.`,
      html:`<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px;background:#101d30;color:#fff;border-radius:20px"><h1>Soyturk Works</h1><p>${account?'Parolanı yenile.':'Hesabını oluştur.'}</p><p><a style="display:inline-block;padding:14px 24px;background:#54d2b0;color:#091a24;text-decoration:none;border-radius:10px" href="${link}">${account?'Parolayı yenile':'Hesabı oluştur'}</a></p><p>Bu bağlantı 15 dakika geçerlidir ve bir kez kullanılabilir.</p><p>Bu işlemi sen istemediysen mesajı yok say.</p></div>`};
    const pending={kind,expires:Date.now()+15*60000};
    await this.storage.put('recovery:'+hash(raw),pending);
    try {
      if(local(this.env)) await this.storage.put('local-mail',{...message,link});
      else if(this.env.EMAIL) await this.env.EMAIL.send(message);
      else fail('Kurtarma e-postası hizmeti henüz bağlanmadı.',503);
    } catch(error) {await this.storage.delete('recovery:'+hash(raw));if(error.status)throw error;fail('E-posta gönderilemedi. E-posta bağlantısını kontrol edin.',503);}
    await this.storage.setAlarm(Date.now()+DAY);
  }
  async fetch(request) {
    try {return await this.handle(request);}catch(error){return json({error:error.status?error.message:'İşlem tamamlanamadı. Lütfen yeniden deneyin.'},error.status||500);}
  }
  async handle(request) {
    const url=new URL(request.url), path=url.pathname;
    const account=await this.storage.get('account');
    if(path==='/api/local-mail'&&local(this.env))return json(await this.storage.get('local-mail')||{});
    if(path==='/api/session'&&request.method==='GET') {
      const session=await this.session(request);
      return json({initialized:!!account,account:session&&account?publicAccount(account):null,companies:session?await this.companies():[],localMailbox:local(this.env)});
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
      await this.sendRecovery(account);
      return json({ok:true,message:'Bağlantı kayıtlı kurtarma e-posta adresine gönderildi.'});
    }
    if(path==='/api/recovery/complete'&&request.method==='POST') {
      await this.rate(request,'recovery-complete',10);
      if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token))fail('Bağlantı geçersiz veya süresi dolmuş.');
      const key='recovery:'+hash(body.token), recovery=await this.storage.get(key);
      if(!recovery||recovery.expires<Date.now()||recovery.kind!==(account?'reset':'setup'))fail('Bağlantı geçersiz veya süresi dolmuş.');
      validPassword(body.password);
      const username=account?.username||String(body.username||'').trim();
      if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))fail('Kullanıcı adı 3–40 harf, rakam, nokta veya alt çizgi içermeli.');
      const password=await this.ctx.blockConcurrencyWhile(()=>passwordHash(body.password)), revision=token();
      // All links are single use. A completed recovery also revokes other links,
      // sessions and passkeys, so a lost device cannot keep access.
      await this.storage.transaction(async tx=>{
        const current=await tx.get(key), currentAccount=await tx.get('account');
        if(!current||current.expires<Date.now()||current.kind!==(currentAccount?'reset':'setup'))fail('Bu bağlantı daha önce kullanıldı.');
        await tx.put('account',{username,email:this.env.OWNER_EMAIL,password,revision,webauthnId:account?.webauthnId||token(),created:account?.created||Date.now()});
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
  async takeChallenge(id,kind) {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(id))fail('Doğrulama süresi doldu.');
    const key='challenge:'+hash(id), value=await this.storage.transaction(async tx=>{const value=await tx.get(key);await tx.delete(key);return value;});
    if(!value||value.kind!==kind||value.expires<Date.now())fail('Doğrulama süresi doldu. Yeniden deneyin.');return value;
  }
  async companies() {return Promise.all(COMPANIES.map(async c=>({...c,active:true,deleted:false,...await this.storage.get('company:'+c.id)})));}
  async alarm() {for(const prefix of ['session:','challenge:','recovery:','rate:']){const items=await this.storage.list({prefix});const expired=[...items].filter(([,v])=>(v.expires||v.until)<Date.now()).map(([k])=>k);if(expired.length)await this.storage.delete(expired);}await this.storage.setAlarm(Date.now()+DAY);}
}
async function readJSON(request) {
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){reader.cancel().catch(()=>{});fail('İstek çok büyük.',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(data);
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))fail('Geçersiz istek.');return value;}catch{fail('Geçersiz istek.');}
}
