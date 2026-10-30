import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createHash,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {encodeCBOR} from '@levischuck/tiny-cbor';

const b64=value=>Buffer.from(value).toString('base64url');
const sha=value=>createHash('sha256').update(value).digest();
const counter=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value);return b;};
test('Worker protects assets, sessions, company lifecycle, recovery and real WebAuthn signatures', {timeout:60000}, async t=>{
  const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const origin='http://127.0.0.1:'+port;
  const directory=await mkdtemp(join(tmpdir(),'sw-auth-test-'));
  const ownerToken=randomBytes(32).toString('base64url'),ownerDigest=sha(ownerToken).toString('hex');
  let logs='';
  const child=spawn(process.execPath,[new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname,'dev','--ip','127.0.0.1','--port',String(port),'--var','APP_ORIGIN:'+origin,'--var','LOCAL_MAILBOX:1','--var','OWNER_SETUP_SHA256:'+ownerDigest,'--var','OWNER_SETUP_EXPIRES:'+String(Date.now()+120000),'--persist-to',directory],{cwd:new URL('../',import.meta.url),env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  try {
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/session')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await pause(100);}
    assert(ready,'Wrangler did not start: '+logs.slice(-2500));
    const request=async(path,body,cookie,method=body?'POST':'GET',extra={})=>{
      const response=await fetch(origin+path,{method,headers:{Origin:origin,...body?{'Content-Type':'application/json'}:{},...cookie?{Cookie:cookie}:{},...extra},body:body?JSON.stringify(body):undefined,redirect:'manual'});
      const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}return {status:response.status,headers:response.headers,value};
    };
    const mail=async()=>{const {value}=await request('/__local/mail');const link=new URL(value.link);assert.equal(link.search,'');return new URLSearchParams(link.hash.slice(1));};
    const sessionCookie=response=>response.headers.get('set-cookie').split(';')[0];
    const password='Qa2026!';
    await t.test('Unauthenticated requests cannot bypass login through HTML or app assets',async()=>{
      for(const path of ['/index.html','/app/runtime.js','/app/sfOcrCoreData.js','/assets/vendor/pdf.min.js'])assert.equal((await request(path)).status,401,path);
      assert.equal((await request('/workspace/PUSULA/')).status,303);
      assert.match((await request('/')).value,/loginTemplate/);
      assert.equal((await request('/portal/portal.css')).status,200);
      assert.equal((await request('/api/companies')).status,401);
      assert.equal((await request('/api/login',{username:'x',password},null,'POST',{Origin:'https://other.example'})).status,403);
      assert.equal((await request('/api/login',{username:'x',password})).status,401);
      assert.equal((await request('/api/login',{username:'x',password:'x'.repeat(33000)})).status,413);
    });
    let cookie;
    await t.test('Only deployment ownership can initialize the account; private setup links work once',async()=>{
      assert.equal((await request('/api/recovery',{})).status,503);
      assert.equal((await request('/api/recovery/complete',{token:randomBytes(32).toString('base64url'),username:'attacker',password,recoveryEmail:'attacker@example.invalid'})).status,400);
      assert.equal((await request('/api/recovery',{ownerToken,recoveryEmail:'auth-test@example.invalid'})).status,200);const mailToken=(await mail()).get('setup');assert(mailToken);
      const token=ownerToken,recoveryEmail='auth-test@example.invalid';
      assert.equal((await request('/api/recovery/complete',{token,username:'qa-user',password:'123456',recoveryEmail})).status,400);
      const created=await request('/api/recovery/complete',{token,username:'qa-user',password,recoveryEmail});assert.equal(created.status,200);cookie=sessionCookie(created);
      assert.match(created.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
      assert.equal((await request('/api/recovery/complete',{token,username:'qa-user',password})).status,400);
      assert.equal((await request('/api/recovery/complete',{token:mailToken,username:'attacker',password})).status,400);
      assert.equal((await request('/api/login',{username:'qa-user',password:'incorrect'})).status,401);
      assert.equal((await request('/api/session',null,cookie)).value.account.username,'qa-user');
    });
    await t.test('Company deactivation and recoverable removal apply on the server',async()=>{
      const companies=(await request('/api/companies',null,cookie)).value.companies;assert.equal(companies.length,5);
      for(const company of companies){const app=await request('/workspace/'+company.id+'/',null,cookie);assert.equal(app.status,200);assert(app.value.includes('"id":"'+company.id+'"'));assert(app.value.includes('<base href="/">'));}
      assert.equal((await request('/api/companies',{id:'PUSULA',active:false,deleted:false},cookie,'PATCH')).status,200);
      assert.equal((await request('/workspace/PUSULA/',null,cookie)).status,303);
      assert.equal((await request('/api/companies',{id:'PUSULA',active:false,deleted:true},cookie,'PATCH')).status,200);
      assert.equal((await request('/api/companies',null,cookie)).value.companies[0].deleted,true);
      assert.equal((await request('/api/companies',{id:'PUSULA',active:true,deleted:false},cookie,'PATCH')).status,200);
      assert.equal((await request('/workspace/PUSULA/',null,cookie)).status,200);
      assert.equal((await request('/api/companies',{id:'UNKNOWN',active:true,deleted:false},cookie,'PATCH')).status,400);
    });
    let credentialId,privateKey;
    await t.test('WebAuthn requires verification, validates signatures and rejects replay',async()=>{
      const challenge=(await request('/api/passkeys/register/options',{},cookie)).value;
      assert.equal(challenge.options.authenticatorSelection.userVerification,'required');
      const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});privateKey=pair.privateKey;const jwk=pair.publicKey.export({format:'jwk'});
      const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
      const id=randomBytes(32);credentialId=b64(id);const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
      const authData=Buffer.concat([sha('127.0.0.1'),Buffer.from([0x45]),counter(0),Buffer.alloc(16),length,id,Buffer.from(cose)]);
      const clientData=b64(JSON.stringify({type:'webauthn.create',challenge:challenge.options.challenge,origin,crossOrigin:false}));
      const response={id:credentialId,rawId:credentialId,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:clientData,attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))),transports:['internal']}};
      const registration=await request('/api/passkeys/register/verify',{id:challenge.id,response,name:'Synthetic test authenticator'},cookie);assert.equal(registration.status,200,JSON.stringify(registration.value));
      assert.equal((await request('/api/passkeys/register/verify',{id:challenge.id,response},cookie)).status,400);
      const auth=(await request('/api/passkeys/login/options',{})).value;assert.equal(auth.options.userVerification,'required');
      const data=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:auth.options.challenge,origin,crossOrigin:false}));
      const authenticatorData=Buffer.concat([sha('127.0.0.1'),Buffer.from([0x05]),counter(1)]);
      const signature=sign('sha256',Buffer.concat([authenticatorData,sha(data)]),privateKey);
      const assertion={id:credentialId,rawId:credentialId,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(data),authenticatorData:b64(authenticatorData),signature:b64(signature)}};
      const authenticated=await request('/api/passkeys/login/verify',{id:auth.id,response:assertion});assert.equal(authenticated.status,200,JSON.stringify(authenticated.value));
      assert.equal((await request('/api/passkeys/login/verify',{id:auth.id,response:assertion})).status,400);
      const bad=(await request('/api/passkeys/login/options',{})).value;
      assert.equal((await request('/api/passkeys/login/verify',{id:bad.id,response:assertion})).status,401);
    });
    await t.test('Recovery invalidates old passwords, sessions, links and passkeys',async()=>{
      await request('/api/recovery',{recoveryEmail:'attacker@example.invalid'});const token=(await mail()).get('reset');assert(token);
      assert.equal((await request('/__local/mail')).value.to,'auth-test@example.invalid');
      const recovered=await request('/api/recovery/complete',{token,password:password+'-new'});assert.equal(recovered.status,200);
      assert.equal((await request('/api/companies',null,cookie)).status,401);
      assert.equal((await request('/api/login',{username:'qa-user',password})).status,401);
      cookie=sessionCookie(recovered);
      assert.equal((await request('/api/passkeys',null,cookie)).value.passkeys.length,0);
      assert.equal((await request('/api/recovery/complete',{token,password})).status,400);
      assert.equal((await request('/api/logout',{},cookie)).status,200);
      assert.equal((await request('/api/companies',null,cookie)).status,401);
    });
  } finally {
    child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);if(child.exitCode===null)child.kill('SIGKILL');await rm(directory,{recursive:true,force:true});
  }
});
