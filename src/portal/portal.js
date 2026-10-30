(() => {
  'use strict';
  const $=id=>document.getElementById(id), main=$('main');
  let state, noticeTimer;
  const parameters=new URLSearchParams(location.hash.slice(1)||location.search);
  const recoveryToken=parameters.get('reset')||parameters.get('setup');
  const isSetup=parameters.has('setup');
  if(recoveryToken) history.replaceState(null,'',location.pathname);
  async function api(path,body,method=body?'POST':'GET') {
    const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const result=await response.json();
    if(!response.ok){if(response.status===401&&state?.account&&path!=='account/password')location.href='/login';throw Error(result.error||'İşlem tamamlanamadı.');}
    return result;
  }
  function message(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
  async function busy(button,action){if(button.disabled)return;button.disabled=true;try{await action();}catch(error){message(error.message);}finally{button.disabled=false;}}
  function template(id){main.replaceChildren($(id).content.cloneNode(true));}
  const field=(name,label,autocomplete='new-password')=>{const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.name=name;i.type='password';i.autocomplete=autocomplete;i.required=true;i.minLength=12;i.maxLength=128;l.append(i);return l;};
  function login() {
    template('loginTemplate');
    const form=$('loginForm');
    if(recoveryToken){
      $('loginHeading').textContent=isSetup?'Hesabını oluştur.':'Yeni parolanı belirle.';
      $('loginDescription').textContent='Parolanı yalnızca bu ekranda belirle. En az 12 karakter kullan.';
      if(!isSetup)form.querySelector('[name=username]').closest('label').remove();
      const password=form.querySelector('[name=password]');password.autocomplete='new-password';password.minLength=12;
      form.insertBefore(field('confirmPassword','Parola tekrar'),$('loginError'));
      form.querySelector('[type=submit]').textContent=isSetup?'Hesabı oluştur':'Parolayı yenile';
      $('forgot').hidden=true;$('passkeyLogin').hidden=true;
      main.querySelector('.divider').hidden=true;main.querySelector('.login-card>.fineprint').hidden=true;
    } else if(!state.initialized) {
      $('loginHeading').textContent='İlk adımı atalım.';$('loginDescription').textContent='Hesabını oluşturmak için kurtarma e-postana güvenli bir bağlantı gönder.';
      form.hidden=true;$('forgot').textContent='Hesap kurulum bağlantısı gönder';$('forgot').className='primary';$('forgot').style.width='100%';
      $('passkeyLogin').hidden=true;main.querySelector('.divider').hidden=true;main.querySelector('.login-card>.fineprint').hidden=true;
    }
    form.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));$('loginError').hidden=true;busy(form.querySelector('[type=submit]'),async()=>{
      try{if(recoveryToken){if(data.password!==data.confirmPassword)throw Error('Parolalar aynı olmalı.');await api('recovery/complete',{...data,token:recoveryToken});}else await api('login',data);location.href='/companies';}catch(error){$('loginError').textContent=error.message;$('loginError').hidden=false;}
    });});
    $('forgot').onclick=()=>busy($('forgot'),async()=>{const result=await api('recovery',{});message(result.message);if(state.localMailbox)localMail();});
    $('passkeyLogin').onclick=()=>busy($('passkeyLogin'),async()=>{
      if(!window.SWPasskeys?.browserSupportsWebAuthn())throw Error('Bu tarayıcı cihazla girişi desteklemiyor. Parolanla giriş yapabilirsin.');
      const challenge=await api('passkeys/login/options',{});
      try{const response=await window.SWPasskeys.startAuthentication({optionsJSON:challenge.options});await api('passkeys/login/verify',{id:challenge.id,response});location.href='/companies';}catch(error){throw Error(error.name==='NotAllowedError'?'Cihaz doğrulaması iptal edildi veya süresi doldu.':error.message);}
    });
  }
  async function localMail(){const mail=await fetch('/__local/mail').then(r=>r.json());let a=main.querySelector('.local-mail');if(!a){a=document.createElement('a');a.className='local-mail';main.querySelector('.login-card').append(a);}a.textContent='Yerel test e-postasını aç';a.href=mail.link;}
  function companyCard(company) {
    const card=document.createElement('article');card.className='company-card'+(!company.active?' is-inactive':'');card.style.setProperty('--accent',company.color);
    const open=document.createElement('button');open.type='button';open.className='company-open';open.disabled=!company.active;open.setAttribute('aria-label',company.name+' çalışma alanını aç');
    const symbol=document.createElement('span');symbol.className='company-symbol';symbol.textContent=company.initials;
    const name=document.createElement('span');name.className='company-name';name.textContent=company.name;
    const enter=document.createElement('span');enter.className='company-enter';enter.append(document.createTextNode(company.active?'Çalışma alanını aç':'Firma pasif'));const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');enter.append(arrow);
    open.append(symbol,name,enter);open.onclick=()=>location.href='/workspace/'+company.id+'/';
    const controls=document.createElement('div');controls.className='company-controls';
    const remove=document.createElement('button');remove.type='button';remove.className='remove-company';remove.textContent='Kaldır';remove.setAttribute('aria-label',company.name+' firmasını kaldır');
    remove.onclick=()=>{if(confirm(company.name+' firma seçiminden kaldırılsın mı? Kayıtları korunacak; daha sonra geri getirebilirsin.'))busy(remove,()=>updateCompany(company,{active:false,deleted:true}));};
    const toggle=document.createElement('button');toggle.type='button';toggle.className='status-toggle';toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(company.active));toggle.setAttribute('aria-label',company.name+' aktif');toggle.append(document.createTextNode(company.active?'AKTİF':'PASİF'));const track=document.createElement('span');track.className='switch-track';track.setAttribute('aria-hidden','true');toggle.append(track);toggle.onclick=()=>busy(toggle,()=>updateCompany(company,{active:!company.active,deleted:false}));
    controls.append(remove,toggle);card.append(open,controls);return card;
  }
  async function updateCompany(company,patch){const result=await api('companies',{id:company.id,...patch},'PATCH');state.companies=result.companies;renderCompanies();if($('archiveDialog').open)renderArchive();}
  function renderCompanies(){const grid=$('companyGrid');grid.replaceChildren(...state.companies.filter(c=>!c.deleted).map(companyCard));if(!grid.children.length){const p=document.createElement('p');p.textContent='Tüm firmalar kaldırıldı. Aşağıdan geri getirebilirsin.';grid.append(p);}}
  function companies(){template('companiesTemplate');renderCompanies();$('archiveButton').onclick=()=>{renderArchive();$('archiveDialog').showModal();};}
  function renderArchive(){const list=$('archiveList');list.replaceChildren();const archived=state.companies.filter(c=>c.deleted);if(!archived.length)list.textContent='Kaldırılan firma yok.';archived.forEach(company=>{const row=document.createElement('div');row.className='archive-row';const name=document.createElement('span');name.textContent=company.name;const restore=document.createElement('button');restore.type='button';restore.textContent='Geri getir';restore.onclick=()=>busy(restore,()=>updateCompany(company,{active:true,deleted:false}));row.append(name,restore);list.append(row);});}
  async function account(){
    template('accountTemplate');$('accountUsername').textContent=state.account.username;$('accountEmail').textContent=state.account.recoveryEmail;
    $('passwordForm').onsubmit=event=>{event.preventDefault();const form=event.target;busy(form.querySelector('button'),async()=>{const data=Object.fromEntries(new FormData(form));if(data.password!==data.confirmPassword)throw Error('Parolalar aynı olmalı.');await api('account/password',data);form.reset();message('Parolan güncellendi. Diğer açık oturumlar kapatıldı.');});};
    $('passkeyForm').onsubmit=event=>{event.preventDefault();const form=event.target;busy(form.querySelector('button'),async()=>{if(!window.SWPasskeys?.browserSupportsWebAuthn())throw Error('Bu tarayıcı geçiş anahtarını desteklemiyor.');const challenge=await api('passkeys/register/options',{});try{const response=await window.SWPasskeys.startRegistration({optionsJSON:challenge.options});await api('passkeys/register/verify',{id:challenge.id,response,name:form.elements.name.value});form.reset();await renderPasskeys();message('Cihaz kaydedildi. Artık cihazınla giriş yapabilirsin.');}catch(error){throw Error(error.name==='NotAllowedError'?'Cihaz doğrulaması iptal edildi veya süresi doldu.':error.message);}});};
    await renderPasskeys();
  }
  async function renderPasskeys(){const data=await api('passkeys'),list=$('passkeyList');list.replaceChildren();if(!data.passkeys.length)list.textContent='Henüz kayıtlı cihaz yok.';data.passkeys.forEach(key=>{const row=document.createElement('div');row.className='passkey-row';const name=document.createElement('span');name.textContent=key.name;const remove=document.createElement('button');remove.type='button';remove.textContent='Kaldır';remove.onclick=()=>{if(confirm(key.name+' cihazının giriş yetkisi kaldırılsın mı?'))busy(remove,async()=>{await api('passkeys',{id:key.id},'DELETE');await renderPasskeys();});};row.append(name,remove);list.append(row);});}
  $('closeArchive').onclick=()=>$('archiveDialog').close();
  $('archiveDialog').onclick=event=>{if(event.target===$('archiveDialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}};
  $('logout').onclick=()=>busy($('logout'),async()=>{await api('logout',{});location.href='/login';});
  (async()=>{try{state=await api('session');if(!state.account||recoveryToken){if(location.pathname!=='/login')history.replaceState(null,'','/login');login();return;}$('topActions').hidden=false;$('privateLabel').hidden=true;if(location.pathname==='/account')await account();else{if(location.pathname!=='/companies')history.replaceState(null,'','/companies');companies();}}catch(error){main.replaceChildren();const p=document.createElement('p');p.className='form-error';p.textContent=error.message;main.append(p);}})();
})();
