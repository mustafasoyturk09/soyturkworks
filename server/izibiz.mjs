import {randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual} from 'node:crypto';

const ORIGIN='https://api.izibiz.com.tr';
const error=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const text=value=>typeof value==='string'?value.trim():'';
const knownIdentifiers={PUSULA:'7330782805',KIB:'5441391853',KIB_DIJITAL:'7331039353'};
export function verifyCompany(company,identity){
  const name=identity.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toUpperCase();
  if(knownIdentifiers[company]){if(identity.identifier!==knownIdentifiers[company])error('İzibiz hesabı seçili Soyturk Works firmasına ait değil.',409);}
  else if(!(company==='COMED'&&/\bCOMED\b/.test(name)||company==='DIJITAL_GARAJ'&&/\bDIJITAL\s+GARAJ\b/.test(name)))error('İzibiz firma unvanı seçili Soyturk Works firmasıyla eşleşmiyor.',409);
}
export function validPeriod(start,end){
  const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>366*86400000)error('En fazla bir yıllık geçerli tarih aralığı seçin.');
}
export function customerIdentity(data){
  const value=data?.customer||data;
  const identifier=String(value?.vknTckno||value?.identifier||value?.vkn||value?.taxNumber||'').trim();
  if(!/^\d{10,11}$/.test(identifier))error('İzibiz firma kimliği doğrulanamadı. Bağlantı kaydedilmedi.',502);
  return {identifier,name:text(value.commercialName||value.name||value.title||value.companyName)||[value.firstName,value.lastName].filter(Boolean).join(' ')||identifier};
}
export function invoiceReply(row){
  // responseDescription contains free-form response notes. The portal's Yanıt
  // column follows the invoice response state, separately from delivery status.
  const state=String(row.invoiceStatus||row.documentStatus?.value||'').replace(/[^a-z]/gi,'').toUpperCase();
  return ({WAITINGFORRESPONSE:'Yanıt bekliyor',RESPONSETIMEEXPIRED:'Kanunen kabul',RECEIVED:'Yanıt gerekmiyor',ACCEPTED:'Kabul edildi',REJECTED:'Reddedildi',RESPONSEUNDELIVERED:'Yanıt iletilemedi',CANCEL:'İptal',CANCELLED:'İptal'})[state]||text(row.documentStatus?.label);
}
export function invoiceRow(row,identifier){
  if(!row||!Number.isSafeInteger(Number(row.id))||Number(row.id)<=0||!text(row.documentNo)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.uuid||''))error('İzibiz eksik fatura bilgisi döndürdü. İşlem durduruldu.',502);
  if(row.direction!=='IN'||String(row.accountingCustomer?.identifier||row.customerSSN||'')!==identifier)error('Faturanın alıcısı seçili firmayla eşleşmiyor. İşlem durduruldu.',409);
  const date=String(row.issueDate||'').slice(0,10);try{validPeriod(date,date);}catch{error('İzibiz geçerli fatura tarihi döndürmedi.',502);}
  let amount=row.amount;
  if(typeof amount==='string'){
    amount=amount.replace(/\s/g,'');const comma=amount.lastIndexOf(','),dot=amount.lastIndexOf('.');
    if(comma>=0&&dot>=0)amount=comma>dot?amount.replace(/\./g,'').replace(',','.'):amount.replace(/,/g,'');else if(comma>=0)amount=amount.replace(',','.');
    amount=/^[+-]?\d+(?:\.\d+)?$/.test(amount)?Number(amount):NaN;
  }
  if(typeof amount!=='number'||!Number.isFinite(amount)||!text(row.currency))error('İzibiz fatura tutarı veya para birimi doğrulanamadı.',502);
  return {id:Number(row.id),uuid:row.uuid,fatno:row.documentNo,tarih:date,unvan:row.accountingSupplier?.name||[row.accountingSupplier?.person?.firstName,row.accountingSupplier?.person?.familyName].filter(Boolean).join(' '),tip:row.invoiceType||row.documentType,tutar:amount,birim:row.currency,yanit:invoiceReply(row),isRet:[row.invoiceStatus,row.documentStatus?.value].some(v=>/^(REJECTED|REJECT|RED|RET)$/i.test(v||''))};
}

// Only the official live API is reachable. Credentials are encrypted separately
// for each company; API tokens and invoice lists are never persisted.
export class IzibizConnector {
  constructor({storage,key,fetcher=(url,options)=>fetch(url,options),now=()=>Date.now()}){this.storage=storage;this.secret=key;this.fetcher=fetcher;this.now=now;this.sessions=new Map();this.busy=new Set();}
  key(){if(!/^[A-Za-z0-9_-]{43}$/.test(this.secret||''))error('İzibiz bağlantı anahtarı sunucuda henüz tanımlı değil.',503);return Buffer.from(this.secret,'base64url');}
  seal(company,value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key(),iv);cipher.setAAD(Buffer.from(company));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {iv:iv.toString('base64url'),data:data.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};}
  unseal(company,value){try{const decipher=createDecipheriv('aes-256-gcm',this.key(),Buffer.from(value.iv,'base64url'));decipher.setAAD(Buffer.from(company));decipher.setAuthTag(Buffer.from(value.tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64url')),decipher.final()]).toString('utf8'));}catch(e){if(e.status)throw e;error('İzibiz bağlantısı açılamadı. Bu firmayı yeniden bağlayın.',409);}}
  ticket(company,config,row){const payload=Buffer.from(JSON.stringify({company,revision:config.revision,id:row.id,expires:this.now()+2*3600000})).toString('base64url');return payload+'.'+createHmac('sha256',this.key()).update(payload).digest('base64url');}
  verifyTicket(company,config,ticket){
    if(typeof ticket!=='string'||ticket.length>1000)error('İndirme bağlantısı geçersiz.');
    const [payload,signature,...rest]=ticket.split('.'),expected=createHmac('sha256',this.key()).update(payload||'').digest('base64url');
    if(rest.length||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))error('İndirme bağlantısı geçersiz.',403);
    let value;try{value=JSON.parse(Buffer.from(payload,'base64url'));}catch{error('İndirme bağlantısı geçersiz.');}
    if(value.company!==company||value.revision!==config.revision||!Number.isSafeInteger(value.id)||value.expires<this.now())error('İndirme bağlantısının süresi doldu veya firma değişti. Listeyi yeniden alın.',409);
    return value.id;
  }
  async remote(path,options={},token){
    let response;
    try{response=await this.fetcher(ORIGIN+path,{...options,redirect:'manual',signal:AbortSignal.timeout(45000),headers:{Accept:'application/json',...options.body?{'Content-Type':'application/json'}:{},...token?{Authorization:'Bearer '+token}:{}}});}catch{error('İzibiz’e ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.',502);}
    if(response.status>=300&&response.status<400)error('İzibiz beklenmeyen yönlendirme döndürdü. Giriş bilgileri başka adrese gönderilmedi.',502);
    if(!response.ok||response.headers.get('Content-Type')?.includes('json')){
      let result;try{result=await response.json();}catch{error('İzibiz beklenen yanıtı vermedi. Daha sonra yeniden deneyin.',502);}
      if(result.error||!response.ok){const code=String(result.error?.code||'');const expired=['10004','10002'].includes(code)||response.status===401;error(expired?'İzibiz oturumu yenilenmeli.':response.status===403?'İzibiz bu işlem için izin vermedi. Hesabın fatura okuma yetkisini kontrol edin.':'İzibiz işlemi tamamlayamadı'+(/^\d{1,8}$/.test(code)?' (kod '+code+')':'')+'.',expired?428:502);}
      return result.data;
    }
    return response;
  }
  async login(config){
    let auth;try{auth=await this.remote('/v1/auth/token',{method:'POST',body:JSON.stringify({username:config.username,password:config.password})});}catch(e){if(e.status===428)error('İzibiz kullanıcı adı veya şifresi doğrulanamadı. Mevcut giriş bilgilerini kontrol edin.');throw e;}
    if(!text(auth?.accessToken))error('İzibiz oturum bilgisi alınamadı.',502);
    const identity=customerIdentity(await this.remote('/v1/customers/me',{},auth.accessToken));
    if(identity.identifier!==config.identifier)error('Bu İzibiz hesabının VKN/TCKN bilgisi seçtiğiniz firmayla eşleşmiyor.',409);
    return {...identity,token:auth.accessToken,expires:this.now()+5*60000,revision:config.revision};
  }
  async authenticated(company,config,path,options){
    let session=this.sessions.get(company);
    if(!session||session.expires<this.now()||session.revision!==config.revision){session=await this.login(config);this.sessions.set(company,session);}
    try{return await this.remote(path,options,session.token);}catch(e){
      if(e.status!==428)throw e;
      this.sessions.delete(company);session=await this.login(config);this.sessions.set(company,session);
      return this.remote(path,options,session.token);
    }
  }
  async handle(company,action,method,body){
    const saved=await this.storage.get('izibiz:config:'+company);
    if(action==='status'&&method==='GET')return json({connected:!!saved,company,configured:!!this.secret,...saved?{name:saved.name,identifier:saved.identifier}:{}});
    if(action==='connect'&&method==='POST'){
      if(this.busy.has(company))error('Bu firmanın bağlantısı şu anda kontrol ediliyor.',409);
      const username=text(body.username),identifier=text(body.identifier),password=body.password;
      if(!username||username.length>200||typeof password!=='string'||!password||password.length>500||!/^\d{10,11}$/.test(identifier))error('İzibiz kullanıcı adı, mevcut şifre ve firmanın VKN/TCKN bilgisini girin.');
      this.key();this.busy.add(company);
      try{
        const config={username,password,identifier,revision:randomBytes(16).toString('hex')},session=await this.login(config);
        verifyCompany(company,session);
        // Probe the actual read permission before saving any credentials.
        await this.remote('/v1/einvoices/inbox?dateType=DELIVERY&page=0&pageSize=1',{},session.token);
        await this.storage.put('izibiz:config:'+company,{...this.seal(company,config),identifier,name:session.name});this.sessions.set(company,session);
        return json({connected:true,company,name:session.name,identifier});
      }finally{this.busy.delete(company);}
    }
    if(action==='disconnect'&&method==='POST'){await this.storage.delete('izibiz:config:'+company);this.sessions.delete(company);return json({connected:false});}
    if(!saved)error('Bu firma için İzibiz bağlantısını bir kez tanımlayın.',409);
    const config=this.unseal(company,saved);
    if(action==='list'&&method==='POST'){
      validPeriod(body.startDate,body.endDate);
      const page=Number(body.page);if(!Number.isSafeInteger(page)||page<0||page>=200)error('Geçersiz sayfa. Tarih aralığını daraltın.');
      if(typeof body.run!=='string'||!/^[a-f0-9-]{36}$/.test(body.run))error('Geçersiz indirme oturumu.');
      // Concurrent tabs cannot start repeated scans. Persist only run metadata.
      const current=await this.storage.get('izibiz:scan:'+company);
      if(page===0){
        if(current&&current.run!==body.run&&this.now()-current.started<300000)error('Yeni listeyi beş dakika sonra tekrar alabilirsiniz.',429);
        await this.storage.put('izibiz:scan:'+company,{run:body.run,started:current?.run===body.run?current.started:this.now(),start:body.startDate,end:body.endDate});
      }else if(!current||current.run!==body.run||current.start!==body.startDate||current.end!==body.endDate||this.now()-current.started>2*3600000)error('Listeleme oturumu değişti. Baştan başlayın.',409);
      const dateType=body.dateType||'DOCUMENT';if(!['DOCUMENT','DELIVERY'].includes(dateType))error('Geçersiz tarih türü.');
      const query=new URLSearchParams({dateType,startDate:body.startDate,endDate:body.endDate,page:String(page),pageSize:'100',sortProperty:'createDate',sort:'asc'});
      const result=await this.authenticated(company,config,'/v1/einvoices/inbox?'+query,{});
      if(!Array.isArray(result?.contents))error('İzibiz fatura listesi okunamadı.',502);
      const rows=result.contents.map(value=>invoiceRow(value,config.identifier)).map(row=>({...row,ticket:this.ticket(company,config,row)}));
      const total=Number(result.pageable?.totalElements),pages=Number(result.pageable?.totalPages);
      if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(pages)||pages<0||pages>200||total>20000||rows.length>100||total>0&&(rows.length===0||pages===0))error('İzibiz sayfalama bilgisi doğrulanamadı. Tarih aralığını daraltıp yeniden deneyin.',502);
      return json({rows,total,pages,company,name:saved.name,identifier:config.identifier});
    }
    if(action==='download'&&method==='POST'){
      if(!['pdf','ubl'].includes(body.format))error('Geçersiz belge biçimi.');
      const id=this.verifyTicket(company,config,body.ticket);
      const response=await this.authenticated(company,config,'/v1/einvoices/inbox/download/'+body.format,{method:'POST',body:JSON.stringify([{id}])});
      let bytes;
      if(response instanceof Response)bytes=new Uint8Array(await response.arrayBuffer());
      else if(typeof response?.content==='string'){
        const content=response.content.replace(/^data:[\w.+/-]+;base64,/i,'').replace(/\s/g,'');
        if(!content||content.length>36*1024*1024||content.length%4===1||!/^[A-Za-z0-9+/]*={0,2}$/.test(content))error('İzibiz belge içeriği doğrulanamadı.',502);
        bytes=new Uint8Array(Buffer.from(content,'base64'));
      }else error('İzibiz belge yerine beklenmeyen yanıt döndürdü.',502);
      if(!bytes.length||bytes.length>25*1024*1024)error('Belge boş veya indirme sınırını aşıyor.',502);
      const prefix=new TextDecoder().decode(bytes.slice(0,250)).trimStart();
      const zip=bytes[0]===0x50&&bytes[1]===0x4b;
      if(!zip&&!(body.format==='pdf'?prefix.startsWith('%PDF-'):prefix.startsWith('<?xml')||/<(?:\w+:)?Invoice\b/.test(prefix)))error('İzibiz geçerli PDF/XML döndürmedi. Belge kaydedilmedi.',502);
      return new Response(bytes,{headers:{'Content-Type':zip?'application/zip':body.format==='pdf'?'application/pdf':'application/xml','Cache-Control':'no-store'}});
    }
    return json({error:'İşlem bulunamadı.'},404);
  }
}
