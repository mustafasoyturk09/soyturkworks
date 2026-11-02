
/* =====================================================================
   v86 - SATIŞ FATURALARI: Pusula / KİB PDF -> kontrollü Logo SALES_INVOICES.
   İki firmanın çalışma listeleri, rapor geçmişleri ve XML kuralları ayrıdır.
   Yalnızca #page-satis ve s79- önekli öğelerle çalışır.
   ===================================================================== */
(function(){
  'use strict';
  var page = document.getElementById('page-satis');
  if(!page || !document.getElementById('s79Drop')) return;

  var MAX_FILES = 500;
  // A new seller must register its own prefix, accounts and history key. No default seller.
  var SALES_COMPANIES=Object.fromEntries(Object.entries(window.SWWorkspace.names).map(([id,label])=>[id,{label,prefix:id==='PUSULA'?'PUS':id==='KIB'?'KIB':''}]));
  var SALES_BRANCH_RULES={PUSULA:{
      '6200443970':[['NISA HASTANESI','120.01.185'],['ACIBADEM BOLGE','120.01.206'],['MEGA HASTANESI','120.01.050'],['ISTANBUL MEDIPOL HASTANESI','120.01.184']],
      '7060030488':[['ATAPARK','120.01.255'],['KEMALOZ','120.01.061']],
      '6130582094':[['ISTANBUL ONKOLOJI','120.04.022'],['GEBZE FATIH','120.04.021'],['ATASEHIR','120.04.020'],['BAHCELIEVLER','120.04.013'],['TRABZON YILDIZLI','120.04.007'],['TRABZON KARADENIZ','120.04.017'],['PENDIK','120.04.004'],['GOZTEPE','120.04.010'],['BURSA','120.04.016'],['MERSIN','120.04.005'],['ULUS LIV','120.04.014'],['ORDU','120.04.012'],['BATIKENT','120.04.009'],['ANTALYA','120.04.011'],['INCEK','120.04.019']],
      '7420398563':[['VADI LIV','120.01.146'],['SEYHAN','120.01.182'],['MERKEZ','120.01.134']],
      '4810611692':[['BAHCESEHIR','120.03.002'],['GAZIOSMANPASA','120.03.001'],['ISU DENT','120.03.003'],['TOPKAPI','120.03.004'],['TIP FAKULTESI','120.03.005']],
      '6130721685':[['GEBZE','120.01.099'],['KOCAELI','120.01.133']],
      '6850466349':[['SILIVRI','120.01.207'],['EREGLI','120.01.208'],['AVCILAR','120.01.209']]
    },KIB:{
        '6200443970':[['NISA HASTANESI','120.01.004'],['MEDIPOL MEGA','120.01.005'],['ACIBADEM BOLGE','120.01.026'],['ISTANBUL MEDIPOL HASTANESI','120.01.003'],['KOSUYOLU','120.01.003']],
        '4810552613':[['SUAM DIS','120.01.006'],['SEFAKOY','120.01.007'],['SUAM ESENLER','120.01.008'],['SUAM CAMLICA','120.01.009'],['PENDIK','120.01.010']],
        '7060030488':[['KEMALOZ','120.01.014']]
      }};
  var s153Seed=s153ReadSeed(),s153Storage=s153MakeStorage(s153Seed);
  var s156ExtraCompanies=s156LoadCompanies();
  var s151Undo=s151LoadUndo(),s151MemoryOpen=false,s151MigrationMessage='';
  var s150ServiceKey='fc_sales_service_memory_v1',s150Services=s150LoadServices(),s150Dirty=false;
  var s102Busy=false,s102LastMatch={},s102MemoryKey='fc_sales_branch_memory_v1';
  var s102Memory=s102LoadMemory();
  var activeCompany = window.SWWorkspace.companyId;
  var HISTORY_KEYS = Object.fromEntries(Object.keys(SALES_COMPANIES).map(c=>[c,c==='PUSULA'?'fc_sales_history_v1':c==='KIB'?'fc_sales_history_kib_v1':'fc_sales_history_'+c.toLowerCase()+'_v1']));
  function emptyState(company){return{company:company,records:[],filter:'all',issueFilter:'',search:'',history:loadHistory(company),fileUrls:{},pendingExport:[],historyOpen:false,reportMode:'single'};}
  Object.keys(s156ExtraCompanies).forEach(function(c){HISTORY_KEYS[c]='fc_sales_history_'+c.toLowerCase()+'_v1';});
  var companyStates={};Object.keys(SALES_COMPANIES).forEach(function(c){companyStates[c]=emptyState(c);});
  var state = companyStates[activeCompany];
  /* Temmuz 2026 Logo dışa aktarımı ile doğrulanan tekil VKN -> cari kodları.
     Aynı VKN'de birden fazla şube kodu olan firmalar bu tabloda bilinçli olarak yoktur. */
  var CUSTOMER_BY_VKN = {
    '0012637028':'120.01.197','0080783717':'120.01.003','0081950962':'120.01.250','0100467727':'120.01.191','0250878733':'120.01.194','0680061327':'120.01.243','0680578123':'120.01.126','0690158528':'120.01.046','0700086545':'120.01.149','0700675761':'120.01.180','0850347484':'120.01.106','0900668135':'120.01.193','1050602704':'120.01.007','1271180696':'120.01.220','1550565770':'120.01.221','1710019769':'120.01.254','1780748276':'120.01.069','1910572062':'120.01.173','1910572175':'120.01.172','2710839371':'120.01.154','2720805474':'120.01.155','2940338626':'120.01.022','2990076074':'120.01.114','3292178406':'120.01.223','3340187736':'120.01.025','3360066741':'120.01.188','3540351012':'120.01.204','3770885673':'120.01.228','3800537069':'120.01.028','3880693450':'120.01.178','3881273840':'120.01.179','4510016851':'120.01.131','4810037012':'120.01.145','4810552613':'120.01.037','4810975206':'120.01.239','5280597407':'120.01.170','5440012219':'120.01.101','5601097560':'120.01.166','6080063965':'120.01.218','6110524223':'120.01.235','6130702624':'120.01.048','6130718916':'120.01.108','6130759810':'120.01.051','6221732027':'120.01.137','6222248171':'120.01.165','6222502550':'120.01.213','6230322595':'120.01.089','6300435303':'120.01.132','6300714041':'120.01.189','6310103199':'120.01.054','6581128668':'120.01.203','6850048173':'120.01.222','6850064236':'120.01.059','6850439355':'120.01.058','6850457662':'120.01.060','6850522139':'120.01.199','7440066456':'120.01.241','7450380053':'120.01.162','7610089282':'120.01.110','7640051114':'120.01.224','7750434067':'120.01.130','7890017136':'120.01.251','8010654664':'120.01.068','8170192551':'120.01.071','8370071590':'120.01.128','8720075424':'120.01.093','8940046700':'120.01.075'
  };
  var KIB_CUSTOMER_BY_VKN = {
    '3340187736':'120.01.011','2090063434':'120.01.016','6850452258':'120.01.021','4220964054':'120.01.018','2940338626':'120.01.022','6311972431':'120.01.027','1271180696':'120.01.029','3360066741':'120.01.032','6850048173':'120.01.031','7290441180':'120.01.017'
  };
  var CONFLICT_VKNS = {'6200443970':1,'7060030488':1,'6130582094':1,'7420398563':1,'4810611692':1,'6130721685':1,'6850466349':1};
  var KNOWN_DOC_ARP = {
    'PUS2026000001074':'120.01.184','PUS2026000001075':'120.01.185','PUS2026000001076':'120.01.050','PUS2026000001077':'120.01.206','PUS2026000001087':'120.01.061','PUS2026000001088':'120.01.255','PUS2026000001098':'120.01.052','PUS2026000001099':'120.01.052','PUS2026000001100':'120.01.052','PUS2026000001101':'120.04.004','PUS2026000001102':'120.04.013','PUS2026000001103':'120.04.010','PUS2026000001104':'120.04.016','PUS2026000001105':'120.04.005','PUS2026000001106':'120.04.014','PUS2026000001107':'120.04.012','PUS2026000001108':'120.04.007','PUS2026000001109':'120.04.017','PUS2026000001110':'120.04.009','PUS2026000001111':'120.04.011','PUS2026000001112':'120.04.019','PUS2026000001113':'120.04.021','PUS2026000001114':'120.04.020','PUS2026000001115':'120.04.022','PUS2026000001119':'120.01.091','PUS2026000001120':'120.01.146','PUS2026000001121':'120.01.134','PUS2026000001122':'120.01.140','PUS2026000001123':'120.01.181','PUS2026000001124':'120.01.182','PUS2026000001126':'120.03.002','PUS2026000001127':'120.03.001','PUS2026000001128':'120.03.003','PUS2026000001129':'120.03.004','PUS2026000001130':'120.03.005','PUS2026000001131':'120.01.099','PUS2026000001132':'120.01.133','PUS2026000001175':'120.01.207','PUS2026000001176':'120.01.208','PUS2026000001177':'120.01.209'
  };
  var KIB_KNOWN_DOC_ARP = {
    'KIB2026000000219':'120.01.003','KIB2026000000220':'120.01.004','KIB2026000000221':'120.01.005','KIB2026000000222':'120.01.026','KIB2026000000223':'120.01.006','KIB2026000000224':'120.01.007','KIB2026000000225':'120.01.008','KIB2026000000226':'120.01.009','KIB2026000000227':'120.01.010','KIB2026000000228':'120.01.011','KIB2026000000229':'120.01.014','KIB2026000000230':'120.01.016','KIB2026000000231':'120.01.021','KIB2026000000232':'120.01.018','KIB2026000000233':'120.01.022','KIB2026000000234':'120.01.027','KIB2026000000235':'120.01.029','KIB2026000000236':'120.01.032','KIB2026000000237':'120.01.031','KIB2026000000246':'120.01.016','KIB2026000000247':'120.01.022','KIB2026000000248':'120.01.011','KIB2026000000249':'120.01.018','KIB2026000000250':'120.01.017'
  };
  var KNOWN_LINE_DESCRIPTION = {
    'PUS2026000001079':'SUAM DİŞ','PUS2026000001080':'SEFAKÖY','PUS2026000001081':'SUAM ESENLER','PUS2026000001082':'SUAM ÇAMLICA','PUS2026000001083':'PENDİK','PUS2026000001098':'LABORATUAR YAZILIMI COMED LIS','PUS2026000001099':'MERKEZ BAKIM','PUS2026000001100':'MP TEM ŞUBESİ','PUS2026000001136':'KAYSERİ','PUS2026000001137':'KAYSERİ TÜP BEBEK MERKEZİ','PUS2026000001138':'DİCLE HASTANESİ','PUS2026000001139':'DİYARBAKIR HASTANESİ','PUS2026000001140':'MERKEZ','PUS2026000001141':'ANTALYA HASTANESİ','PUS2026000001142':'ANKARA HASTANESİ','PUS2026000001143':'ATAŞEHİR HASTANESİ','PUS2026000001144':'BAHÇELİEVLER HASTANESİ','PUS2026000001145':'ŞİŞLİ HASTANESİ','PUS2026000001146':'MEDROYALTIP MERKEZİ','PUS2026000001147':'EVDE BAKIM TIP MERKEZİ','PUS2026000001148':'KIBRIS TIP MERKEZİ','PUS2026000001149':'BODRUM HASTANESİ','PUS2026000001150':'GÖZTEPE HASTANESİ','PUS2026000001181':'Entegrasyon Geliştirme/Bakım Bedeli'
  };
  var SERVICE_DEFS = {
    'P01.09':'HBYS PACS Kiralama Hizmeti','P01.12':'Pusula HBYS Bakım Hizmeti','P01.13':'Pusula HBYS Ek Yazılım Geliştirme','P01.14':'Pusula HBYS Kiralama Hizmeti','P01.23':'Mobil Hasta Uygulaması','P01.34':'Pusula HBYS Kiralama Hizmeti (Tevkifatlı)','P02.14':'CoMed LIS Kiralama Hizmeti','P04.01':'İş Ortakları Komisyon Gelirleri','P06.02':'White Label Mobil Uygulama Bakım-Destek','P09.01':'Allianz Sigorta Ent./Bakım/Destek Hiz.Bedeli'
  };
  var KIB_SERVICE_DEFS = {'03':'KİB Mobil Uygulama Hizmet Bedeli','06':'KİB Uygulama Komisyon Bedeli'};
  var KIB_SERVICE_GL = {'03':'600.01.001','06':'602.02.001'};
  /* Logo dışa aktarımlarında doğrulanan cari kartı -> muhasebe hesabı
     istisnaları. Pusula ve KİB tabloları bilinçli olarak ayrıdır. */
  var SALES_GL_BY_ARP = {
    PUSULA: {
      '120.01.208':'120.01.207','120.01.209':'120.01.207'
    },
    KIB: {
      '120.01.004':'120.01.003','120.01.005':'120.01.003','120.01.026':'120.01.003',
      '120.01.006':'120.01.004','120.01.007':'120.01.004','120.01.008':'120.01.004',
      '120.01.009':'120.01.004','120.01.010':'120.01.004'
    }
  };
  function salesGlCode(company,arpCode){
    var map=SALES_GL_BY_ARP[company]||{};
    return map[arpCode]||arpCode;
  }
  var SERVICE_RULES = [
    {test:/PACS\s+KİRA\s+BEDELİ/i,code:'P01.09'},
    {test:/MOBİL\s+UYGULAMA\s+BAKIM\s+BEDELİ/i,code:'P01.23'},
    {test:/LABORATUAR\s+YAZILIMI\s*-?\s*COMED\s+LIS/i,code:'P02.14'},
    {test:/ENTEGRASYON\s+GELİŞTİRME\s*\/\s*BAKIM\s+BEDELİ/i,code:'P04.01'},
    {test:/ALLIANZ\s+SİGORTA\s+ENTEGRASYON\s*\/\s*BAKIM\s*\/\s*DESTEK\s+HİZMETLERİ\s+BEDELİ/i,code:'P09.01'},
    {test:/AYLIK\s+BAKIM\s*-\s*GÜNCELLEME\s+BEDELİ/i,code:'P06.02'},
    {test:/EK\s+GELİŞTİRME\s+BEDELİ/i,code:'P01.13'},
    {test:/HBYS\s+LİSANS\s+KİRALAMA\s+KDV\s+TEVKİFAT\s+BEDELİ/i,code:'P01.34'},
    {test:/(?:HBYS\s+)?(?:LİSANS\s+)?KİRA(?:LAMA)?\s+BEDELİ/i,code:'P01.14'},
    {test:/(?:HBYS\s+HİZMET|HBYS\s+BAKIM|MERKEZ\s+BAKIM|MERKEZ\s+HBYS\s+BAKIM|HASTANE\s+BİLGİ\s+YÖNETİM\s+SİSTEMİ\s+BAKIM)\s+BEDELİ/i,code:'P01.12'}
  ];
  var ISO_MAP = {0x011E:0xD0,0x0130:0xDD,0x015E:0xDE,0x011F:0xF0,0x0131:0xFD,0x015F:0xFE};

  function loadHistory(company){ if(!s151CompanyKnown(company)||!HISTORY_KEYS[company])return [];try{return JSON.parse(s153Storage.getItem(HISTORY_KEYS[company])||'[]')||[];}catch(e){return [];} }
  function saveHistory(){ if(!s151CompanyKnown(activeCompany)||state.company!==activeCompany)throw new Error('Firma bağlamı geçersiz.');try{s153Storage.setItem(HISTORY_KEYS[activeCompany],JSON.stringify(state.history));}catch(e){showNotice('Aylık geçmiş kaydedilemedi: tarayıcı depolama alanı dolu olabilir.');} }
  function uid(){ return 's79-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
  function xmlEsc(s){ return String(s==null?'':s).normalize('NFC').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
  function htmlEsc(s){ var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function uuid(){ if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().toUpperCase(); var h='0123456789ABCDEF',p=function(n){var s='';while(n--)s+=h[Math.floor(Math.random()*16)];return s;};return p(8)+'-'+p(4)+'-'+p(4)+'-'+p(4)+'-'+p(12); }
  function money(n){ return (Number(n)||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function num(raw){
    var s=String(raw==null?'':raw).replace(/\s|TL|TRY|₺/gi,'').trim(); if(!s)return 0;
    var c=s.lastIndexOf(','),d=s.lastIndexOf('.');
    if(c>=0&&d>=0) s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(c>=0) s=s.replace(/\./g,'').replace(',','.');
    else if(/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
    else if((s.match(/\./g)||[]).length>1) s=s.replace(/\./g,'');
    var n=parseFloat(s); return isFinite(n)?n:0;
  }
  function trDate(raw){ var m=String(raw||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/); return m?m[1].padStart(2,'0')+'.'+m[2].padStart(2,'0')+'.'+m[3]:''; }
  function isoDate(tr){ var p=String(tr||'').split('.'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:''; }
  function addDays(tr,days){ var p=String(tr||'').split('.'); if(p.length!==3)return tr; var d=new Date(+p[2],+p[1]-1,+p[0]);d.setDate(d.getDate()+days);return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear(); }
  function showNotice(msg){ var n=document.getElementById('s79Notice'); n.textContent=msg||''; n.classList.toggle('show',!!msg); }

  function groupedLines(items){
    var groups=[];
    items.forEach(function(it){
      var y=Math.round((it.transform&&it.transform[5])||0),g=groups.find(function(x){return Math.abs(x.y-y)<=2;});
      if(!g){g={y:y,items:[]};groups.push(g);} g.items.push(it);
    });
    return groups.sort(function(a,b){return b.y-a.y;}).map(function(g){return g.items.sort(function(a,b){return a.transform[4]-b.transform[4];}).map(function(x){return x.str;}).join(' ').replace(/\s+/g,' ').trim();}).filter(Boolean);
  }
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'I').toUpperCase().replace(/\s+/g,' ').trim();}
  function serviceForDescription(desc){
    if(!s151CompanyKnown(activeCompany))return null;
    var n=norm(desc);
    if(activeCompany!=='PUSULA'&&activeCompany!=='KIB'){var custom=(s156ExtraCompanies[activeCompany]||{}).serviceRules||[],found=custom.find(function(x){return n===norm(x.phrase)||n.indexOf(norm(x.phrase)+' ')===0;});return found?{code:found.code,def:s156Defs(activeCompany)[found.code]}:null;}
    if(activeCompany==='KIB'){
      if(/KIB UYGULAMA KOMISYON BEDELI/.test(n))return{code:'06',def:KIB_SERVICE_DEFS['06']};
      return /KENDINE IYI BAK MOBIL UYGULAMA HIZMET BEDELI/.test(n)?{code:'03',def:KIB_SERVICE_DEFS['03']}:null;
    }
    /* Logo örneklerinde bu ifade hem P01.12 hem P01.14 ile işlendiği için
       otomatik seçim yapılmaz; kullanıcı kontrolü zorunludur. */
    if(/HBYS LISANS BAKIM BEDELI/.test(n))return null;
    var rule=SERVICE_RULES.find(function(x){return x.test.test(String(desc||'').normalize('NFC'));});
    if(!rule)rule=SERVICE_RULES.find(function(x){
      if(x.code==='P01.14'&&!/^(?:HBYS\s+)?(?:LISANS\s+)?KIRA(?:LAMA)?\s+BEDELI(?:\s|$)/.test(n))return false;
      var pattern=x.test.source.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
      return new RegExp(pattern,'i').test(n);
    });
    return rule?{code:rule.code,def:SERVICE_DEFS[rule.code]||''}:null;
  }
  function serviceMatches(code,desc){
    if(!s151CompanyKnown(activeCompany))return false;
    if(!code||!String(desc||'').trim())return false;
    var n=norm(desc),c=String(code).trim().toUpperCase();
    if(activeCompany==='KIB')return (c==='03'&&/KENDINE IYI BAK MOBIL UYGULAMA HIZMET BEDELI/.test(n))||(c==='06'&&/KIB UYGULAMA KOMISYON BEDELI/.test(n));
    if(/HBYS LISANS BAKIM BEDELI/.test(n))return c==='P01.12'||c==='P01.14';
    var r=serviceForDescription(desc);return !!r&&r.code===c;
  }
  function resolveArp(vkn,unvan,flat,docNo){
    var match=s151Lookup(activeCompany,vkn,unvan);s102LastMatch=Object.assign({},match);
    if(!s151CompanyKnown(activeCompany))return '';
    var docs=s156Docs(activeCompany);
    return match.code||(!match.branch?docs[docNo]||'':'');
  }
  function inferLineDescription(unvan){
    var u=String(unvan||'').normalize('NFC').toLocaleUpperCase('tr');
    if(u.indexOf('SUAM DİŞ')>=0||u.indexOf('DİŞ HASTANESİ')>=0)return 'SUAM DİŞ';
    if(u.indexOf('SEFAKÖY')>=0)return 'SEFAKÖY';
    var dash=String(unvan||'').lastIndexOf('-'); return dash>=0?String(unvan).slice(dash+1).trim():'';
  }
  function parseLines(lines,flat){
    var out=[];
    lines.forEach(function(line){
      var m=line.match(/^\s*(\d+)\s+(.+?)\s+([\d.,]+)\s+(Adet|ADET|Saat|Ay|Gün)\s+([\d.,]+)\s*(?:TL|TRY|₺)\s+%?([\d.,]+)/i);
      if(!m)return;
      var desc=m[2].trim(),rule=serviceForDescription(desc);
      out.push({sourceDescription:desc,quantity:num(m[3]),unit:String(m[4]).toLocaleUpperCase('tr'),price:num(m[5]),vat:num(m[6]),code:rule?rule.code:'',masterDef:rule?rule.def:'',lineDescription:''});
    });
    if(!out.length){
      var tableText=flat;
      if(activeCompany==='PUSULA'){
        var start=tableText.search(/Malzeme\s*\/\s*Hizmet\s+Açıklaması/i);
        if(start>=0)tableText=tableText.slice(start);
      }
      var m=tableText.match(/(?:^|\s)1\s+(.+?)\s+([\d.,]+)\s+Adet\s+([\d.,]+)\s*(?:TL|TRY|₺)\s+%?([\d.,]+)/i);
      if(m){var rule=serviceForDescription(m[1]);out.push({sourceDescription:m[1].trim(),quantity:num(m[2]),unit:'ADET',price:num(m[3]),vat:num(m[4]),code:rule?rule.code:'',masterDef:rule?rule.def:'',lineDescription:''});}
    }
    if(!out.length){
      var fm=String(flat||'').match(/(KİB\s+Uygulama\s+Komisyon\s+Bedeli|Kendine\s+İyi\s+Bak\s+Mobil\s+Uygulama\s+Hizmet\s+Bedeli|HBYS\s+LİSANS\s+KİRALAMA\s+KDV\s+TEVKİFAT\s+BEDELİ|HBYS\s+LİSANS\s+KİRALAMA\s+BEDELİ(?:\s*-\s*[A-ZÇĞİÖŞÜ ]+)?|HBYS\s+LİSANS\s+KİRA\s+BEDELİ(?:\s*-\s*[A-ZÇĞİÖŞÜ ]+)?|Hastane\s+Bilgi\s+Yönetim\s+Sistemi\s+Bakım\s+Bedeli|HBYS\s+BAKIM\s+BEDELİ|HBYS\s+HİZMET\s+BEDELİ|PACS\s+KİRA\s+BEDELİ|MOBİL\s+UYGULAMA\s+BAKIM\s+BEDELİ|LABORATUAR\s+YAZILIMI\s*-\s*COMED\s+LIS|Entegrasyon\s+Geliştirme\/Bakım\s+Bedeli|Allianz\s+Sigorta\s+Entegrasyon\/Bakım\/Destek\s+Hizmetleri\s+Bedeli|Aylık\s+Bakım\s*-\s*Güncelleme\s+Bedeli|EK\s+GELİŞTİRME\s+BEDELİ)[\s\S]{0,180}?(\d+[.,]?\d*)\s+Adet\s+([\d.,]+)\s*(?:TL|TRY|₺)[\s\S]{0,80}?%?([\d.,]+)/i);
      if(fm){var fr=serviceForDescription(fm[1]);out.push({sourceDescription:fm[1].replace(/\s+/g,' ').trim(),quantity:num(fm[2]),unit:'ADET',price:num(fm[3]),vat:num(fm[4]),code:fr?fr.code:'',masterDef:fr?fr.def:'',lineDescription:''});}
    }
    return out;
  }
  async function readPdf(file){
    var rec={company:activeCompany,id:uid(),file:file,fileName:file.name,status:'reading',warnings:[],date:'',docNo:'',unvan:'',vkn:'',arpCode:'',lines:[],sourceNet:0,open:false,linesOpen:false};
    state.records.push(rec); render();
    try{
      if(typeof pdfjsLib==='undefined')throw new Error('PDF.js yüklenemedi. İnternet bağlantısını kontrol edip sayfayı yenileyin.');
      var buffer=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({isEvalSupported:false,data:buffer.slice(0)}).promise,textParts=[],lines=[],s149Recipient=null;
      for(var p=1;p<=Math.min(pdf.numPages,3);p++){var pg=await pdf.getPage(p),ct=await pg.getTextContent();textParts.push(ct.items.map(function(x){return x.str;}).join(' '));lines=lines.concat(groupedLines(ct.items));if(p===1)s149Recipient=s149ReadRecipient(ct.items);}
      var flat=textParts.join(' ').replace(/\s+/g,' '),vkns=[];
      lines.filter(function(line){return /\bVKN\b/i.test(line);}).forEach(function(line){var m=line.match(/\b(\d{10})\b/);if(m)vkns.push(m[1]);});
      rec.vkn=vkns.length?vkns[vkns.length-1]:'';
      var nm=flat.match(/Fatura\s*No\s*:\s*([A-Z0-9-]{8,})/i); rec.docNo=nm?nm[1]:((file.name.match(/(?:PUS|KIB)\d{13}/i)||[])[0]||'');
      var dm=flat.match(/Fatura\s*Tarihi\s*:\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i); rec.date=dm?trDate(dm[1]):'';
      var fileTitle=file.name.replace(/\.pdf$/i,'').replace(/^(?:PUS|KIB)\d{13}\s*-\s*/i,'').trim().normalize('NFC');
      var um=flat.match(/SAYIN\s+(.+?)\s+Özelleştirme\s*No/i); rec.unvan=fileTitle||(um?um[1].replace(/\s+/g,' ').trim():'');
      rec.s150OriginalTitle=rec.unvan;rec.sourceRecipient=s102Recipient(lines);rec.sourceFileTitle=fileTitle;rec.sourceFlat=flat;rec.sourceVkn=rec.vkn;
      if(s149Recipient){
        rec.s149LegacyIdentity=s102Identity(rec);
        rec.s149PdfTitle=s149Recipient.title;rec.s149PdfRecipient=s149Recipient.text;
        rec.s149PdfVkn=s149Recipient.vkn;
        rec.unvan=s149Recipient.title;rec.vkn=s149Recipient.vkn;
        rec.sourceRecipient=s149Recipient.text;rec.sourceVkn=rec.vkn;
      }
      rec.s149Withholding=activeCompany==='PUSULA'&&/Fatura\s*Tipi\s*:\s*TEVK[Iİ]FAT/i.test(flat);
      rec.arpCode=resolveArp(rec.vkn,rec.unvan,flat,rec.docNo);rec.s102Match=Object.assign({},s102LastMatch);s102Restore(rec);
      rec.lines=parseLines(lines,flat);
      var totalMatches=[],tm,tr=/Ödenecek\s+Tutar\s+([\d.,]+)\s*(?:TL|TRY|₺)/gi; while((tm=tr.exec(flat)))totalMatches.push(num(tm[1])); rec.sourceNet=totalMatches.length?totalMatches[totalMatches.length-1]:0;
      s154PrepareDescriptions(rec);
      rec.status='review'; evaluate(rec);
      state.fileUrls[rec.id]=URL.createObjectURL(file);
    }catch(err){rec.status='error';rec.error=err&&err.message?err.message:String(err);}
    render();
  }

  function s177University(r){return String(r.vkn||'')==='4810552613';}
  function s177Branch(value){
    var names=['SUAM DİŞ','SEFAKÖY','SUAM ESENLER','SUAM ÇAMLICA','PENDİK'],text=' '+norm(value||'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ')+' ';
    var found=names.filter(function(name){return text.indexOf(' '+norm(name)+' ')>=0;});
    if(!found.length&&text.indexOf(' DIS HASTANESI ')>=0)found=['SUAM DİŞ'];
    return found.length===1?found[0]:'';
  }
  function s177Description(r,l){
    if(!s177University(r))return '';
    var current=String(l.lineDescription||'').trim(),branch=s177Branch(current);
    if(branch&&norm(current)===norm(branch)&&(l.s150Edited||l.s156Editing))return branch;
    var recipient=[r.s149PdfTitle,r.s149PdfRecipient,r.sourceRecipient,r.unvan,r.sourceFileTitle].filter(Boolean).join(' ');
    branch=s177Branch(recipient);if(branch)return branch;
    branch=s177Branch(l.pdfDescription||l.sourceDescription);if(branch)return branch;
    return s177Branch(KNOWN_LINE_DESCRIPTION[r.docNo]||'');
  }
  function s154PrepareDescriptions(rec){
    rec.lines.forEach(function(l){
      l.pdfDescription=l.sourceDescription;
      s150ApplyService(rec,l);
      l.lineDescription=s177Description(rec,l);
    });
  }

  function evaluate(rec){
    if(rec.status==='error'||rec.status==='reading')return rec.status;
    if(!s151CompanyKnown(activeCompany)||state.company!==activeCompany||rec.company&&rec.company!==activeCompany){rec.warnings=['FİRMA ÇELİŞKİSİ: Bu kayıt seçili firmaya ait değil.'];rec.status='review';return rec.status;}
    if(!rec.s102NeedsConfirmation&&rec.s102Confirmed!==s102Signature(rec))s102Restore(rec);
    rec.lines.forEach(function(l){if(!l.s156Editing)l.lineDescription=s177Description(rec,l);});
    var w=s102Warnings(rec);if(s156HasDraft(rec))w.push('Kaydedilmemiş satır veya cari değişikliği var.');
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(rec.date))w.push('Fatura tarihi okunamadı veya geçersiz.');
    if(!rec.docNo)w.push('Belge numarası okunamadı.');
    else if(activeCompany==='KIB'&&!/^KIB/i.test(rec.docNo))w.push('Bu belge Kendine İyi Bak faturası değil; KİB tarafında XML\'e alınamaz.');
    else if(activeCompany==='PUSULA'&&!/^PUS/i.test(rec.docNo))w.push('Bu belge Pusula faturası değil; Pusula tarafında XML\'e alınamaz.');
    if(!rec.unvan)w.push('Cari unvan okunamadı.');
    if(!rec.vkn)w.push('Alıcı VKN okunamadı.');
    if(!rec.arpCode)w.push('Cari hesap kodu tanınmadı; elle girin.');
    if(!rec.lines.length)w.push('Fatura hizmet satırı okunamadı.');
    rec.lines.forEach(function(l,i){
      if(!String(l.sourceDescription||'').trim())w.push((i+1)+'. satırın PDF açıklaması okunamadı; Açıklama alanını PDF ile aynı girin.');
      if(!l.code)w.push((i+1)+'. satırın hizmet kodu tanınmadı.');
      var serviceWarning=s150ServiceWarning(rec,l);if(serviceWarning)w.push((i+1)+'. satır: '+serviceWarning);
      if(!s150Gl(l))w.push((i+1)+'. satırın hizmet muhasebe hesabını girin.');
      if(!(l.quantity>0))w.push((i+1)+'. satırın adedi geçersiz.');if(!(l.price>0))w.push((i+1)+'. satırın birim fiyatı geçersiz.');if(!(l.vat>=0))w.push((i+1)+'. satırın KDV oranı geçersiz.');
      if(s177University(rec)&&!s177Description(rec,l))w.push((i+1)+'. satır açıklaması Medipol için zorunlu.');
    });
    var dup=state.records.filter(function(x){return x!==rec&&x.docNo&&x.docNo===rec.docNo;}).length||state.history.some(function(x){return x.docNo&&x.docNo===rec.docNo;});
    if(dup)w.push('Belge No mükerrer: '+rec.docNo+' çalışma listesinde veya geçmişte birden fazla bulunuyor. İki kaydın da Belge No alanını kontrol edin.');
    var calc=totals(rec).net;if(rec.sourceNet&&Math.abs(calc-rec.sourceNet)>.05)w.push(rec.s149Withholding?'Tevkifatlı fatura: PDF’de kesilen KDV nedeniyle ödenecek tutar farklı. Bu aktarım tevkifat bilgisini desteklemediğinden normal fatura olarak XML oluşturulamaz.':'PDF toplamı ile hesaplanan toplam uyuşmuyor.');
    rec.warnings=w;rec.status=w.length?'review':'ready';
    if(!w.length)rec.lines.forEach(function(l){s150RememberService(rec,l);});
    if(rec.lines.some(function(l){return !!s150ServiceWarning(rec,l);})){rec.linesOpen=true;}
    return rec.status;
  }
  function totals(rec){var base=0,vat=0;(rec.lines||[]).forEach(function(l){var b=(+l.quantity||0)*(+l.price||0);base+=b;vat+=b*(+l.vat||0)/100;});return{base:round2(base),vat:round2(vat),net:round2(base+vat)};}
  function round2(n){return Math.round((n+1e-9)*100)/100;}

  function render(){
    if(s102Busy){document.getElementById('s79XmlBtn').disabled=true;document.getElementById('s79Total').textContent=state.records.length;s152RenderCounters();return;}
    state.records.forEach(function(r){if(r.status!=='reading'&&r.status!=='error')evaluate(r);});
    var ready=state.records.filter(function(r){return r.status==='ready';}),review=state.records.filter(function(r){return r.status==='review';}),errors=state.records.filter(function(r){return r.status==='error';});
    document.getElementById('s79Total').textContent=state.records.length;document.getElementById('s79Ready').textContent=ready.length;document.getElementById('s79Review').textContent=review.length;document.getElementById('s79Error').textContent=errors.length;document.getElementById('s79Amount').textContent=money(ready.reduce(function(s,r){return s+totals(r).net;},0));document.getElementById('s79XmlBtn').disabled=!ready.length||ready.length!==state.records.length||s102Busy;
    var filterCounts={all:state.records.length,ready:ready.length,review:review.length,error:errors.length},filterLabels={all:'Tümü',ready:'Hazır',review:'Kontrol Gerekli',error:'Hata'};
    document.querySelectorAll('#s79Filters [data-filter]').forEach(function(b){var key=b.dataset.filter;b.textContent=filterLabels[key]+' ('+filterCounts[key]+')';b.classList.toggle('active',!state.issueFilter&&key===state.filter);});
    var shown=s152Shown();
    document.getElementById('s79List').innerHTML=shown.length?shown.map(cardHtml).join(''):state.issueFilter?'<div class="s79-empty" role="status"><b>Bu Türde Sorun Kalmadı</b><p><button type="button" class="s79-btn" data-clear-issue>Tüm Faturaları Göster</button></p></div>':'<div class="s79-empty">Bu filtrede gösterilecek fatura yok.</div>';
    s152RenderCounters();
    s150Flush();renderMonth();s151RenderMemory();s156Persist();
  }
  function statusInfo(r){if(r.status==='reading')return{c:'review',t:'Okunuyor…'};if(r.status==='ready')return{c:'ready',t:'XML\'e hazır'};if(r.status==='error')return{c:'error',t:'Okunamadı'};return{c:'review',t:'Kontrol gerekli'};}
  function validationIssues(r){
    var issue={fields:{},lines:[]},f=issue.fields;
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(r.date))f.date=1;
    if(!r.docNo||(activeCompany==='KIB'&&!/^KIB/i.test(r.docNo))||(activeCompany==='PUSULA'&&!/^PUS/i.test(r.docNo)))f.docNo=1;
    if(!r.unvan)f.unvan=1;if(!r.vkn)f.vkn=1;if(!r.arpCode||s102Warnings(r).length)f.arpCode=1;
    var dup=r.docNo&&(state.records.filter(function(x){return x!==r&&x.docNo===r.docNo;}).length||state.history.some(function(x){return x.docNo===r.docNo;}));
    if(dup)f.docNo=1;
    (r.lines||[]).forEach(function(l){var x={};if(!String(l.sourceDescription||'').trim())x.sourceDescription=1;if(!l.code||s150ServiceWarning(r,l)){x.code=1;x.sourceDescription=1;x.lineDescription=1;}if(!s150Gl(l))x.glCode=1;if(!(l.quantity>0))x.quantity=1;if(!(l.price>0))x.price=1;if(!(l.vat>=0))x.vat=1;if(s177University(r)&&!s177Description(r,l))x.lineDescription=1;issue.lines.push(x);});
    if(r.sourceNet&&Math.abs(totals(r).net-r.sourceNet)>.05)issue.lines.forEach(function(x){x.price=1;});
    return issue;
  }
  function cardHtml(r){
    var st=statusInfo(r),t=totals(r),warn=r.error||r.warnings.join(' '),issues=validationIssues(r);
    return '<article class="s79-card status-'+st.c+' '+s151CardClasses(r)+(r.open?' open':'')+'" data-id="'+r.id+'"><div class="s79-summary" data-action="toggle">'+
      '<div class="s79-title"><strong>'+htmlEsc(r.unvan||r.fileName)+'</strong><small>'+htmlEsc(r.docNo||r.fileName)+'</small>'+ s151Badges(r)+'</div><div class="s79-cell"><label>Tarih</label><b>'+htmlEsc(r.date||'—')+'</b></div><div class="s79-cell"><label>Net toplam</label><b>'+money(t.net)+' ₺</b></div><div class="s79-cell"><label>Satır</label><b>'+r.lines.length+'</b></div><span class="s79-status '+st.c+'">'+st.t+'</span><button type="button" class="s79-expand" aria-label="Fatura ayrıntısını aç">'+(r.open?'−':'+')+'</button></div>'+
      '<div class="s79-detail"><div class="s79-grid">'+field(r,'date','Tarih',r.date,'',issues.fields.date)+field(r,'docNo','Belge No',r.docNo,'',issues.fields.docNo)+field(r,'unvan','Cari Unvan',r.unvan,'wide',issues.fields.unvan)+field(r,'vkn','Alıcı VKN',r.vkn,'',issues.fields.vkn)+field(r,'arpCode','Cari Hesap Kodu',r.arpCode,'',issues.fields.arpCode)+'</div>'+
      s156Actions('record',r.s156Editing,r.s156Undo)+s102ReviewHtml(r)+s151WarningHtml(r)+'<div class="s79-row-head"><b>Fatura satırları ('+r.lines.length+')</b><button type="button" class="s79-btn" data-action="lines">'+(r.linesOpen?'Satırları gizle':'Satırı göster / düzelt')+'</button></div><div class="s79-lines'+(r.linesOpen?' open':'')+'">'+r.lines.map(function(l,i){return lineHtml(r,l,i,issues.lines[i]||{});}).join('')+'</div><div class="s79-card-foot"><button type="button" class="s79-btn s79-pdf-link" data-action="pdf"'+(state.fileUrls[r.id]?'':' disabled title="PDF bu oturumda yüklü değil"')+'>PDF\'yi aç</button><button type="button" class="s79-btn danger" data-action="delete">Listeden kaldır</button></div></div></article>';
  }
  function field(r,key,label,value,extra,problem){if(r.s156Draft&&Object.prototype.hasOwnProperty.call(r.s156Draft,key))value=r.s156Draft[key];return '<div class="s79-field '+(extra||'')+(problem?' s90-issue':'')+'"><label>'+label+(problem?' — KONTROL EDİN':'')+'</label><input data-field="'+key+'" value="'+htmlEsc(value)+'"'+(r.s156Editing?'':' readonly')+'></div>';}
  function lineHtml(r,l,i,issues){
    l=Object.assign({},l,l.s156Draft||{});
    function cls(k,base){return (base||'')+(issues[k]?' s90-issue':'');}
    var problem=s150ServiceWarning(r,l);
    return '<div class="s79-line'+(problem?' s150-description-issue':'')+'" data-line="'+i+'">'+
      '<div class="'+cls('code')+'"><label>Hizmet kodu</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="code" value="'+htmlEsc(l.code)+'"></div>'+
      '<div class="'+cls('sourceDescription','s80-desc')+'"><label>PDF’deki açıklama</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="sourceDescription" readonly value="'+htmlEsc(l.pdfDescription||l.sourceDescription)+'"></div>'+
      '<div class="'+cls('quantity')+'"><label>Adet</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="quantity" inputmode="decimal" value="'+htmlEsc(l.quantity)+'"></div><div><label>Birim</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="unit" value="'+htmlEsc(l.unit)+'"></div>'+
      '<div class="'+cls('price')+'"><label>Birim fiyat</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="price" inputmode="decimal" value="'+htmlEsc(money(l.price))+'"></div>'+
      '<div class="'+cls('lineDescription')+'"><label>Logo satır açıklaması</label><input '+(l.s156Editing&&s177University(r)?'':'readonly ')+'data-line-field="lineDescription" value="'+htmlEsc(s177Description(r,l))+'"></div>'+
      '<div class="s80-desc s150-master"><label>Logo hizmet kartı açıklaması</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="masterDef" value="'+htmlEsc(l.masterDef||'')+'"></div>'+
      '<div class="'+cls('glCode','s150-gl')+'"><label>Hizmet muhasebe hesabı</label><input '+(l.s156Editing?'':'readonly ')+'data-line-field="glCode" value="'+htmlEsc(s150Gl(l))+'"></div>'+
      '<div class="s150-line-preview">XML açıklaması: <strong>'+htmlEsc(s150ExportDescription(r,l))+'</strong> · KDV %'+htmlEsc(l.vat)+'</div>'+
      (problem?'<div class="s150-line-review" tabindex="-1">'+htmlEsc(problem)+'</div>':'')+s156Actions('line',l.s156Editing,l.s156Undo)+'</div>';

  }
  function invoiceXml(r){
    if(!/^120\.[0-9A-Za-z.]+$/.test(r.arpCode)||!/^120\.[0-9A-Za-z.]+$/.test(salesGlCode(activeCompany,r.arpCode)))throw new Error('Satış cari hesabı 120 ile başlamalıdır.');
    if(s177University(r)&&r.lines.some(function(l){return !s177Description(r,l);}))throw new Error('İstanbul Medipol Üniversitesi şube adını tamamlayın.');
    if(!s151CompanyKnown(activeCompany)||r.company&&r.company!==activeCompany||s151HardIssues(r).length)throw new Error('Cari veya firma çelişkisi çözülmeden XML oluşturulamaz.');
    if(!s156Profile(activeCompany))throw new Error('Bu firma için hesap planı ve XML profili tanımlanmalı.');
    var t=totals(r),month=String(r.date.split('.')[1]||''),year=String(r.date.split('.')[2]||''),isKib=s156Profile(activeCompany)==='KIB',rows=[];
    function tag(n,v,indent){rows.push((indent||'    ')+'<'+n+'>'+xmlEsc(v)+'</'+n+'>');}
    rows.push('  <INVOICE DBOP="INS" >');tag('TYPE','9');tag('NUMBER','');tag('DATE',r.date);tag('DOC_NUMBER',r.docNo);tag('ARP_CODE',r.arpCode);tag('GL_CODE',salesGlCode(activeCompany,r.arpCode));tag('VAT_RATE',dominantVat(r));tag('TOTAL_DISCOUNTED',fmtXml(t.base));tag('TOTAL_VAT',fmtXml(t.vat));tag('TOTAL_GROSS',fmtXml(t.base));tag('TOTAL_NET',fmtXml(t.net));if(!isKib)tag('PAYMENT_CODE','30');tag('CURRSEL_TOTALS','1');rows.push('    <DISPATCHES>\n    </DISPATCHES>');rows.push('    <TRANSACTIONS>');
    r.lines.forEach(function(l){var base=round2(l.quantity*l.price),vat=round2(base*l.vat/100),head=[['TYPE','4'],['MASTER_CODE',l.code]];if(!isKib)head.push(['OHP_CODE1','GM.01']);head=head.concat([['GL_CODE1',s150Gl(l)],['GL_CODE2',isKib?'391.01.002':'391.01.004'],['QUANTITY',fmtXml(l.quantity)],['PRICE',fmtXml(l.price)],['TOTAL',fmtXml(base)]]);rows.push('      <TRANSACTION>');head.forEach(function(x){tag(x[0],x[1],'        ');});tag('DESCRIPTION',s150ExportDescription(r,l),'        ');[['UNIT_CODE',l.unit||'ADET'],['UNIT_CONV1','1'],['UNIT_CONV2','1'],['VAT_RATE',fmtXml(l.vat)],['VAT_AMOUNT',fmtXml(vat)],['VAT_BASE',fmtXml(base)],['BILLED','1'],['TOTAL_NET',fmtXml(base)],['DIST_ORD_REFERENCE','0'],['MULTI_ADD_TAX','0'],['EDT_CURR','1'],['MONTH',month],['YEAR',year],['ADD_TAX_EFFECT_KDV','1'],['GUID',uuid()],['MASTER_DEF',l.masterDef||l.sourceDescription],['FOREIGN_TRADE_TYPE','0'],['DISTRIBUTION_TYPE_WHS','0'],['DISTRIBUTION_TYPE_FNO','0']].forEach(function(x){tag(x[0],x[1],'        ');});rows.push('      </TRANSACTION>');});
    rows.push('    </TRANSACTIONS>');rows.push('    <PAYMENT_LIST>\n      <PAYMENT>');var payment=[['INTERNAL_REFERENCE','0'],['DATE',isKib?r.date:addDays(r.date,30)],['MODULENR','4'],['TRCODE','9'],['TOTAL',fmtXml(t.net)]];if(!isKib)payment.push(['DAYS','30']);payment=payment.concat([['PROCDATE',r.date],['DATA_REFERENCE','0'],['DISCOUNT_DUEDATE',isKib?r.date:addDays(r.date,30)],['PAY_NO','1']]);payment.forEach(function(x){tag(x[0],x[1],'        ');});rows.push('        <DISCTRLIST>\n        </DISCTRLIST>\n        <DISCTRDELLIST>0</DISCTRDELLIST>\n      </PAYMENT>\n    </PAYMENT_LIST>');tag('DEDUCTIONPART1','2');tag('DEDUCTIONPART2','3');if(!isKib)tag('GRPFIRMTRANS','1');tag('AFFECT_RISK','0');tag('DOC_DATE',r.date);tag('GUID',uuid());tag('EDURATION_TYPE','0');tag('TOTAL_SERVICES',fmtXml(t.base));tag('EXIMVAT','0');tag('EARCHIVEDETR_INTPAYMENTTYPE','0');tag('EBOOK_DOCTYPE','99');rows.push('  </INVOICE>');return rows.join('\n');
  }
  function dominantVat(r){return r.lines.length?fmtXml(r.lines[0].vat):'20';}
  function fmtXml(n){n=round2(Number(n)||0);return Number.isInteger(n)?String(n):n.toFixed(2);}
  function toISO(str){str=String(str||'').normalize('NFC');var bytes=new Uint8Array(str.length),lost=false;for(var i=0;i<str.length;i++){var cp=str.charCodeAt(i);if(ISO_MAP[cp]!==undefined)bytes[i]=ISO_MAP[cp];else if(cp<=255)bytes[i]=cp;else{bytes[i]=63;lost=true;}}return{bytes:bytes,lost:lost};}
  function downloadXml(){
    if(s102Busy){showNotice('PDF okuma tamamlanmadan XML üretilemez.');return;}
    var ready=state.records.filter(function(r){return evaluate(r)==='ready';}).sort(s102Compare);if(ready.length!==state.records.length){showNotice('XML indirilmedi: tüm faturaların cari/şube ve diğer kontrollerini tamamlayın. Eksik kayıtlar atlanarak aktarım yapılmaz.');render();return;}if(!ready.length){showNotice('XML üretmek için hazır fatura bulunmuyor. Sarı kayıtları kontrol edin.');render();return;}
    var xml='<?xml version="1.0" encoding="ISO-8859-9"?>\n<SALES_INVOICES>\n'+ready.map(invoiceXml).join('\n')+'\n</SALES_INVOICES>',parsed=new DOMParser().parseFromString(xml,'text/xml');if(parsed.querySelector('parsererror')){showNotice('XML doğrulama hatası oluştu; dosya indirilmedi.');return;}
    var enc=toISO(xml);if(enc.lost){showNotice('ISO-8859-9 ile kodlanamayan karakter bulundu; XML indirilmedi. İlgili açıklamaları düzeltin.');return;}
    var blob=new Blob([enc.bytes],{type:'application/xml'}),url=URL.createObjectURL(blob),a=document.createElement('a'),now=new Date(),filePrefix=activeCompany==='KIB'?'KIB':'Pusula';a.href=url;a.download=filePrefix+'_Satis_Faturalari_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.XML';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1200);
    state.pendingExport=ready.map(function(r){var t=totals(r);return{company:activeCompany,docNo:r.docNo,tarih:isoDate(r.date),tutar:t.net,unvan:r.unvan,vkn:r.vkn,arpCode:r.arpCode,customerKey:r.vkn||r.arpCode||norm(r.unvan),createdAt:new Date().toISOString()};});updateCommitButton();showNotice(ready.length+' fatura XML olarak indirildi.');
  }
  function updateCommitButton(){var b=document.getElementById('s83CommitBtn'),n=state.pendingExport.length;b.style.display=n?'inline-block':'none';b.textContent=n?'✓ Logo\'ya Aktarıldı — '+n+' Faturayı Rapora Kaydet':'✓ Logo\'ya Aktarıldı — Rapor Geçmişine Kaydet';}
  function commitPendingExport(){
    if(!state.pendingExport.length)return;
    if(!confirm(state.pendingExport.length+' faturanın Logo\'ya başarıyla aktarıldığını ve aylık rapora kalıcı kaydedileceğini onaylıyor musunuz?'))return;
    state.pendingExport.forEach(function(item){var idx=state.history.findIndex(function(x){return x.docNo===item.docNo;});if(idx>=0)state.history[idx]=item;else state.history.push(item);});var n=state.pendingExport.length;state.pendingExport=[];saveHistory();updateCommitButton();renderMonth();try{fcUpdateMonthlySalesSummary();}catch(e){}showNotice(n+' fatura Logo\'ya aktarıldı olarak aylık rapora kaydedildi.');
  }
  var MONTH_NAMES=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  function historyMonth(year,month){return state.history.filter(function(x){var d=new Date(x.tarih);return !isNaN(d)&&d.getFullYear()===+year&&d.getMonth()+1===+month;});}
  function historyCustomerKey(x){return String(x.customerKey||x.vkn||x.arpCode||norm(x.unvan));}
  function initReportSelectors(){
    var yearEl=document.getElementById('s82Year'),a=document.getElementById('s82MonthA'),b=document.getElementById('s82MonthB'),now=new Date(),years=[now.getFullYear()];
    state.history.forEach(function(x){var y=new Date(x.tarih).getFullYear();if(isFinite(y)&&years.indexOf(y)<0)years.push(y);});years.sort(function(x,y){return y-x;});
    var oldYear=yearEl.value;yearEl.innerHTML=years.map(function(y){return '<option value="'+y+'">'+y+'</option>';}).join('');yearEl.value=oldYear&&years.indexOf(+oldYear)>=0?oldYear:String(now.getFullYear());
    if(!a.options.length){a.innerHTML=MONTH_NAMES.map(function(n,i){return '<option value="'+(i+1)+'">'+n+'</option>';}).join('');a.value=String(now.getMonth()+1);b.innerHTML='<option value="">Karşılaştırma yok</option>'+MONTH_NAMES.map(function(n,i){return '<option value="'+(i+1)+'">'+n+'</option>';}).join('');}
  }
  function compactMoney(n){n=Number(n)||0;if(Math.abs(n)>=1000000)return (n/1000000).toLocaleString('tr-TR',{maximumFractionDigits:1})+' Mn ₺';if(Math.abs(n)>=1000)return (n/1000).toLocaleString('tr-TR',{maximumFractionDigits:0})+' B ₺';return money(n)+' ₺';}
  function verticalChart(title,items,valueKey,formatter){var max=Math.max.apply(null,items.map(function(x){return +x[valueKey]||0;}).concat([1]));return '<div class="s84-vchart"><h4>'+htmlEsc(title)+'</h4><div class="s84-columns">'+items.map(function(x){var v=+x[valueKey]||0,h=v?Math.max(5,v/max*100):1;return '<div class="s84-column '+(x.compare?'compare':'')+'" data-report-month="'+x.month+'" title="'+htmlEsc(x.label+': '+formatter(v))+'"><span class="s84-value">'+htmlEsc(formatter(v))+'</span><div class="s84-vbar" style="height:'+h+'%"></div><span class="s84-label">'+htmlEsc(x.shortLabel||x.label)+'</span></div>';}).join('')+'</div></div>';}
  function setReportMode(mode){state.reportMode=mode;document.querySelectorAll('[data-report-mode]').forEach(function(b){b.classList.toggle('active',b.dataset.reportMode===mode);});document.getElementById('s84MonthAWrap').style.display=mode==='annual'?'none':'flex';document.getElementById('s84MonthBWrap').style.display=mode==='compare'?'flex':'none';document.getElementById('s82ClearCompare').style.display=mode==='compare'?'inline-block':'none';document.getElementById('s83ClearMonth').textContent=mode==='annual'?'Seçili yılın raporunu temizle':'Seçili ayın raporunu temizle';}
  function renderMonth(){
    initReportSelectors();setReportMode(state.reportMode);var year=+document.getElementById('s82Year').value,ma=+document.getElementById('s82MonthA').value,mb=+document.getElementById('s82MonthB').value;if(state.reportMode==='compare'&&!mb){mb=ma===1?12:ma-1;document.getElementById('s82MonthB').value=String(mb);}var a=historyMonth(year,ma),b=mb?historyMonth(year,mb):[],sumA=a.reduce(function(s,x){return s+(+x.tutar||0);},0),sumB=b.reduce(function(s,x){return s+(+x.tutar||0);},0),panel=document.getElementById('s82Report');
    panel.classList.add('show');var kpis='',text='',chart='',newHtml='',historyList=a;
    if(state.reportMode==='annual'){
      var annual=MONTH_NAMES.map(function(n,i){var list=historyMonth(year,i+1),sum=list.reduce(function(s,x){return s+(+x.tutar||0);},0);return{month:i+1,label:n,shortLabel:n.slice(0,3),count:list.length,total:sum};}),yearCount=annual.reduce(function(s,x){return s+x.count;},0),yearTotal=annual.reduce(function(s,x){return s+x.total;},0),activeMonths=annual.filter(function(x){return x.count;}).length,customerSet={};state.history.filter(function(x){return new Date(x.tarih).getFullYear()===year;}).forEach(function(x){customerSet[historyCustomerKey(x)]=1;});
      document.getElementById('s82ReportTitle').textContent=year+' yıllık satış görünümü';text=yearCount?'Ocak–Aralık dönemi tek grafikte gösteriliyor. Bir aya tıklayarak o ayın ayrıntısına geçebilirsiniz.':'Bu yıl için Logo aktarımı onaylanmış fatura bulunmuyor.';kpis='<div class="s82-kpi blue"><b>'+yearCount+'</b><span>Yıllık fatura adedi</span></div><div class="s82-kpi green"><b>'+money(yearTotal)+' ₺</b><span>Yıllık toplam</span></div><div class="s82-kpi gold"><b>'+activeMonths+'</b><span>İşlem bulunan ay</span></div><div class="s82-kpi blue"><b>'+Object.keys(customerSet).length+'</b><span>Yıllık cari sayısı</span></div>';chart=yearCount?'<div class="s84-vcharts annual">'+verticalChart('12 aylık toplam tutar',annual,'total',compactMoney)+verticalChart('12 aylık fatura adedi',annual,'count',function(v){return String(v);})+'</div>':'<div class="s85-empty-chart"><b>Bu yıl için grafik verisi yok</b>Faturalar yalnızca Logo aktarımı onaylandıktan sonra burada gösterilir.</div>';historyList=a;
    }else if(state.reportMode==='compare'){
      var diff=sumA-sumB,countDiff=a.length-b.length,bKeys={};b.forEach(function(x){bKeys[historyCustomerKey(x)]=1;});var newMap={};a.forEach(function(x){var k=historyCustomerKey(x);if(k&&!bKeys[k])newMap[k]=x.unvan||x.arpCode||x.vkn;});var newNames=Object.keys(newMap).map(function(k){return newMap[k];});
      document.getElementById('s82ReportTitle').textContent=MONTH_NAMES[ma-1]+' – '+MONTH_NAMES[mb-1]+' '+year+' karşılaştırması';kpis='<div class="s82-kpi blue"><b>'+a.length+' / '+b.length+'</b><span>Fatura adedi</span></div><div class="s82-kpi green"><b>'+money(sumA)+' / '+money(sumB)+' ₺</b><span>Toplam tutarlar</span></div><div class="s82-kpi '+(diff>=0?'gold':'red')+'"><b>'+(diff>0?'+':'')+money(diff)+' ₺</b><span>Tutar farkı</span></div><div class="s82-kpi '+(newNames.length?'gold':'blue')+'"><b>'+newNames.length+'</b><span>Yeni cari</span></div>';
      text=MONTH_NAMES[ma-1]+', '+MONTH_NAMES[mb-1]+' ayına göre '+money(Math.abs(diff))+' ₺ '+(diff>0?'daha fazla':diff<0?'daha az':'aynı tutarda')+'; fatura adedi '+(countDiff>0?countDiff+' fazla':countDiff<0?Math.abs(countDiff)+' az':'aynı')+'.';
      var pair=[{month:ma,label:MONTH_NAMES[ma-1],count:a.length,total:sumA},{month:mb,label:MONTH_NAMES[mb-1],count:b.length,total:sumB,compare:true}];chart='<div class="s84-vcharts">'+verticalChart('Toplam tutar karşılaştırması',pair,'total',compactMoney)+verticalChart('Fatura adedi karşılaştırması',pair,'count',function(v){return String(v);})+'</div><div class="s84-legend"><span><i class="s84-dot"></i>'+htmlEsc(MONTH_NAMES[ma-1])+'</span><span><i class="s84-dot compare"></i>'+htmlEsc(MONTH_NAMES[mb-1])+'</span></div>';
      newHtml=newNames.length?'<b>Yeni cariler ('+newNames.length+')</b><br>'+newNames.map(htmlEsc).join('<br>'):'Karşılaştırılan aya göre yeni cari bulunmuyor.';
    }else{document.getElementById('s82ReportTitle').textContent=MONTH_NAMES[ma-1]+' '+year+' satış özeti';kpis='<div class="s82-kpi blue"><b>'+a.length+'</b><span>Fatura adedi</span></div><div class="s82-kpi green"><b>'+money(sumA)+' ₺</b><span>Toplam tutar</span></div>';text=a.length?MONTH_NAMES[ma-1]+' ayında '+a.length+' fatura Logo aktarımı onayıyla rapora kaydedildi.':'Bu ay için onaylanmış işlem kaydı bulunmuyor.';var single=[{month:ma,label:MONTH_NAMES[ma-1],count:a.length,total:sumA}];chart='<div class="s84-vcharts">'+verticalChart('Seçilen ayın toplam tutarı',single,'total',compactMoney)+verticalChart('Seçilen ayın fatura adedi',single,'count',function(v){return String(v);})+'</div>';}
    document.getElementById('s82ReportText').textContent=text;document.getElementById('s82Kpis').innerHTML=kpis;document.getElementById('s82Chart').innerHTML=chart;document.getElementById('s82NewCaris').innerHTML=newHtml;renderHistoryList(historyList);
  }
  function renderHistoryList(list){
    var box=document.getElementById('s83History');box.classList.toggle('open',state.historyOpen);document.getElementById('s83ToggleHistory').textContent=state.historyOpen?'Rapor kayıtlarını gizle':'Rapor kayıtlarını göster';
    if(!list.length){box.innerHTML='<div class="s83-history-empty">Seçili ayda rapora kaydedilmiş fatura yok.</div>';return;}
    box.innerHTML=list.slice().sort(function(a,b){return String(a.tarih).localeCompare(String(b.tarih));}).map(function(x){return '<div class="s83-history-row"><span><b>'+htmlEsc(x.docNo||'Belge no yok')+'</b><br>'+htmlEsc(x.tarih||'')+'</span><span>'+htmlEsc(x.unvan||x.arpCode||x.vkn||'Cari bilgisi yok')+'</span><b>'+money(x.tutar)+' ₺</b><button type="button" class="s79-btn danger" data-history-doc="'+encodeURIComponent(x.docNo||'')+'">Sil</button></div>';}).join('');
  }
  function clearSelectedMonth(){var year=+document.getElementById('s82Year').value,month=+document.getElementById('s82MonthA').value,isAnnual=state.reportMode==='annual',list=isAnnual?state.history.filter(function(x){return new Date(x.tarih).getFullYear()===year;}):historyMonth(year,month),period=isAnnual?String(year):MONTH_NAMES[month-1]+' '+year;if(!list.length){showNotice(period+' döneminde temizlenecek rapor kaydı yok.');return;}var total=list.reduce(function(s,x){return s+(+x.tutar||0);},0);if(!confirm(period+' dönemindeki '+list.length+' fatura ve '+money(total)+' ₺ rapor geçmişinden silinecek. Devam edilsin mi?'))return;state.history=state.history.filter(function(x){var d=new Date(x.tarih);return isAnnual?d.getFullYear()!==year:(d.getFullYear()!==year||d.getMonth()+1!==month);});saveHistory();renderMonth();try{fcUpdateMonthlySalesSummary();}catch(e){}showNotice(period+' rapor geçmişi temizlendi.');}

  function switchSalesCompany(company){
    if(!window.SWWorkspace.allows(company))return;
    if(s102Busy){showNotice('PDF okuma bitene kadar firma değiştirilemez.');return;}
    if(!s151CompanyKnown(company)||!companyStates[company])return;
    activeCompany=company;state=companyStates[company];
    document.querySelectorAll('[data-sales-company]').forEach(function(b){var selected=b.dataset.salesCompany===company;b.classList.toggle('active',selected);b.classList.remove('disabled');var small=b.querySelector('small');if(small)small.textContent=selected?'AKTİF':'';});
    document.getElementById('s86PageDesc').textContent=window.SWWorkspace.names[company]+' satış e-faturalarını PDF\'den oku, kritik alanları kontrol et ve Logo Tiger 3 için tek toplu XML hazırla.';
    document.querySelectorAll('#s79Filters [data-filter]').forEach(function(b){b.classList.toggle('active',b.dataset.filter===state.filter);});
    if(s156Ready){document.getElementById('s156Search').value=state.search||'';s151MemoryOpen=!!state.search;}updateCommitButton();showNotice('');render();
  }

  async function acceptFiles(list){
    if(s102Busy){showNotice('Önce mevcut PDF grubunun okunmasını bekleyin.');return;}
    var files=Array.prototype.slice.call(list||[]).filter(function(f){return f.type==='application/pdf'||/\.pdf$/i.test(f.name);});
    if(!files.length){showNotice('Lütfen PDF dosyası seçin.');return;}var excess=Math.max(0,files.length-MAX_FILES);files=files.slice(0,MAX_FILES);s102Busy=true;
    document.querySelectorAll('[data-sales-company],#s79ClearBtn').forEach(function(b){b.disabled=true;});
    try{for(var i=0;i<files.length;i++){showNotice((i+1)+' / '+files.length+' PDF okunuyor…');await readPdf(files[i]);}}
    finally{s102Busy=false;document.querySelectorAll('[data-sales-company],#s79ClearBtn').forEach(function(b){b.disabled=false;});render();var count=state.records.filter(function(r){return r.status!=='ready';}).length;showNotice((excess?excess+' PDF 500 dosya sınırı nedeniyle eklenmedi; bunları sonraki grupta yükleyin. ':'')+(count?count+' fatura kontrol bekliyor. Renkli uyarılardaki sorunlar giderilmeden XML oluşturulmaz.':state.records.length+' fatura hazır. XML belge numarasına göre sıralanacak.'));}
  }

  var drop=document.getElementById('s79Drop'),input=document.getElementById('s79Files');drop.addEventListener('click',function(){input.click();});input.addEventListener('change',function(){acceptFiles(input.files);input.value='';});['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('drag');});});['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('drag');});});drop.addEventListener('drop',function(e){acceptFiles(e.dataTransfer.files);});
  document.getElementById('s148Sort').addEventListener('change',render);
  document.getElementById('s79Filters').addEventListener('click',function(e){var b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;state.issueFilter='';this.querySelectorAll('[data-filter]').forEach(function(x){x.classList.toggle('active',x===b);});render();});
  ['s82Year','s82MonthA','s82MonthB'].forEach(function(id){document.getElementById(id).addEventListener('change',renderMonth);});document.getElementById('s84ViewTabs').addEventListener('click',function(e){var b=e.target.closest('[data-report-mode]');if(!b)return;setReportMode(b.dataset.reportMode);renderMonth();});document.getElementById('s82ClearCompare').addEventListener('click',function(){state.reportMode='single';document.getElementById('s82MonthB').value='';renderMonth();});document.getElementById('s82Chart').addEventListener('click',function(e){var col=e.target.closest('[data-report-month]');if(!col)return;document.getElementById('s82MonthA').value=col.dataset.reportMonth;state.reportMode='single';renderMonth();});document.getElementById('s79XmlBtn').addEventListener('click',downloadXml);document.getElementById('s83CommitBtn').addEventListener('click',commitPendingExport);
  document.getElementById('s83ToggleHistory').addEventListener('click',function(){state.historyOpen=!state.historyOpen;renderMonth();});document.getElementById('s83ClearMonth').addEventListener('click',clearSelectedMonth);document.getElementById('s83History').addEventListener('click',function(e){var b=e.target.closest('[data-history-doc]');if(!b)return;var doc=decodeURIComponent(b.dataset.historyDoc||''),item=state.history.find(function(x){return x.docNo===doc;});if(!item)return;if(!confirm((item.docNo||'Bu kayıt')+' rapor geçmişinden silinsin mi?'))return;state.history=state.history.filter(function(x){return x!==item;});saveHistory();renderMonth();try{fcUpdateMonthlySalesSummary();}catch(err){}showNotice((item.docNo||'Kayıt')+' rapor geçmişinden silindi.');});
  document.getElementById('s79ClearBtn').addEventListener('click',function(){Object.keys(state.fileUrls).forEach(function(k){URL.revokeObjectURL(state.fileUrls[k]);});state.fileUrls={};state.records=[];state.pendingExport=[];state.filter='all';state.issueFilter='';state.search='';if(s156Ready)document.getElementById('s156Search').value='';showNotice('');render();});
  document.querySelectorAll('[data-sales-company]').forEach(function(b){b.addEventListener('click',function(){switchSalesCompany(b.dataset.salesCompany);});});
  var pdfModal=document.getElementById('s80PdfModal'),pdfViewer=document.getElementById('s80PdfViewer');
  var pdfCanvas=document.getElementById('s90PdfCanvas'),pdfZoomLabel=document.getElementById('s90PdfZoom'),pdfDoc=null,pdfPage=null,pdfFitScale=1,pdfZoom=1,pdfRenderTask=null,pdfOpenToken=0;
  function fitPdfScale(){
    if(!pdfPage)return 1;
    var base=pdfPage.getViewport({scale:1}),w=Math.max(120,pdfViewer.clientWidth-36),h=Math.max(120,pdfViewer.clientHeight-84);
    return Math.min(w/base.width,h/base.height);
  }
  async function renderPdfPage(resetFit){
    if(!pdfPage||!pdfCanvas)return;
    if(resetFit)pdfFitScale=fitPdfScale();
    if(pdfRenderTask){try{pdfRenderTask.cancel();}catch(e){}}
    var viewport=pdfPage.getViewport({scale:pdfFitScale*pdfZoom}),ratio=Math.min(window.devicePixelRatio||1,2),ctx=pdfCanvas.getContext('2d');
    pdfCanvas.width=Math.ceil(viewport.width*ratio);pdfCanvas.height=Math.ceil(viewport.height*ratio);
    pdfCanvas.style.width=Math.ceil(viewport.width)+'px';pdfCanvas.style.height=Math.ceil(viewport.height)+'px';
    pdfZoomLabel.textContent=Math.round(pdfZoom*100)+'%';
    var task=pdfPage.render({canvasContext:ctx,viewport:viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});pdfRenderTask=task;
    try{await task.promise;}catch(err){if(!err||err.name!=='RenderingCancelledException')throw err;}finally{if(pdfRenderTask===task)pdfRenderTask=null;}
  }
  async function openPdf(url){
    if(!url)return;
    var token=++pdfOpenToken;pdfModal.classList.add('open');pdfModal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';pdfZoom=1;pdfZoomLabel.textContent='100%';
    try{
      await new Promise(function(resolve){requestAnimationFrame(resolve);});
      pdfDoc=await pdfjsLib.getDocument({url:url,isEvalSupported:false}).promise;if(token!==pdfOpenToken)return;
      pdfPage=await pdfDoc.getPage(1);if(token!==pdfOpenToken)return;
      await renderPdfPage(true);pdfViewer.scrollTop=0;pdfViewer.scrollLeft=0;
    }catch(err){if(token===pdfOpenToken){closePdf();showNotice('PDF önizleme açılamadı. Dosyayı yeniden yükleyip tekrar deneyin.','err');}}
  }
  function closePdf(){
    ++pdfOpenToken;if(pdfRenderTask){try{pdfRenderTask.cancel();}catch(e){}}pdfRenderTask=null;
    if(pdfDoc){try{pdfDoc.destroy();}catch(e){}}pdfDoc=null;pdfPage=null;
    if(pdfCanvas){pdfCanvas.width=1;pdfCanvas.height=1;pdfCanvas.style.width='';pdfCanvas.style.height='';}
    pdfModal.classList.remove('open');pdfModal.setAttribute('aria-hidden','true');document.body.style.overflow='';
  }
  document.getElementById('s90PdfMinus').addEventListener('click',function(){if(!pdfPage)return;pdfZoom=Math.max(.5,Math.round((pdfZoom-.2)*10)/10);renderPdfPage(false);});
  document.getElementById('s90PdfPlus').addEventListener('click',function(){if(!pdfPage)return;pdfZoom=Math.min(3,Math.round((pdfZoom+.2)*10)/10);renderPdfPage(false);});
  document.getElementById('s80PdfClose').addEventListener('click',closePdf);
  pdfModal.addEventListener('click',function(e){if(e.target===pdfModal)closePdf();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&pdfModal.classList.contains('open'))closePdf();});
  document.getElementById('s79List').addEventListener('click',function(e){if(e.target.closest('[data-clear-issue]')){s152ClearFilter();return;}var jump=e.target.closest('[data-issue-jump]');if(jump){var host=jump.closest('.s79-card'),record=state.records.find(function(x){return host&&x.id===host.dataset.id;});if(record)s152GoToIssue(record,jump.dataset.issueJump);return;}var card=e.target.closest('.s79-card');if(!card)return;var r=state.records.find(function(x){return x.id===card.dataset.id;});if(!r)return;var action=e.target.closest('[data-action]');if(!action)return;if(s156RowClick(e,r,action))return;if(action.dataset.action==='toggle'){r.open=!r.open;}else if(action.dataset.action==='lines'){r.linesOpen=!r.linesOpen;}else if(action.dataset.action==='delete'){if(state.fileUrls[r.id])URL.revokeObjectURL(state.fileUrls[r.id]);delete state.fileUrls[r.id];state.records=state.records.filter(function(x){return x!==r;});}else if(action.dataset.action==='s102-confirm'){s102Confirm(r);}else if(action.dataset.action==='s150-confirm-service'){var box=action.closest('[data-line]');if(box)s150ConfirmService(r,r.lines[+box.dataset.line]);}else if(action.dataset.action==='pdf'&&state.fileUrls[r.id])openPdf(state.fileUrls[r.id]);render();});
  document.getElementById('s79List').addEventListener('change',s156DraftChange);
  render();
  function s149ReadRecipient(items){
    var sayin=items.find(function(x){return norm(x.str)==='SAYIN';});if(!sayin)return null;
    var top=sayin.transform[5],left=sayin.transform[4];
    var meta=items.filter(function(x){return x.transform[4]>left+180&&/OZELLESTIRME|SENARYO|FATURA TIPI/.test(norm(x.str));});
    var right=meta.length?Math.min.apply(null,meta.map(function(x){return x.transform[4];}))-12:left+280;
    var block=items.filter(function(x){return x.transform[4]>=left-4&&x.transform[4]<right&&x.transform[5]<top-2&&x.transform[5]>top-185;});
    var rows=groupedLines(block),end=rows.findIndex(function(x){return /\bVKN\s*:?\s*\d{10}\b/i.test(x);});
    if(end<1)return null;rows=rows.slice(0,end+1);
    var title=[];
    for(var i=0;i<rows.length-1;i++){
      var line=rows[i],n=norm(line);
      if(i&&/(?:\bMAH(?:ALLE(?:SI)?)?\b|\bMAH\.|\bCAD(?:DE(?:SI)?)?\b|\bCAD\.|\bSOK(?:AK|AGI)?\b|\bSOK\.|\bNO\s*[:.]|\bPK\s*[:.]|E-?POSTA|VERGI DAIRESI|\bTEL\s*:|\bFAX\s*:|\bBULVAR|\bCADDES|\bSOKAK|\bAPARTMAN)/.test(n))break;
      title.push(line);
    }
    if(!title.length)return null;
    return {title:title.join(' ').trim(),text:rows.join(' ').slice(0,3000),vkn:(rows[end].match(/\b\d{10}\b/)||[])[0]};
  }
  function s149ExistingMatch(r){
    if(r.s102NeedsConfirmation||!r.s149PdfTitle||!r.arpCode||r.vkn!==r.s149PdfVkn)return false;
    var match=s151Lookup(activeCompany,r.vkn,r.s149PdfTitle);
    if(match.code!==r.arpCode||!(match.known||match.branch&&match.candidates.length===1)||s151HardIssues(r).length)return false;
    return !s102Memory.some(function(x){return x.company===activeCompany&&s150MemoryIdentity(x)===s102Identity(r)&&(x.verified===false||x.arpCode!==r.arpCode);});
  }
  function s102LoadMemory(){try{var x=JSON.parse(s153Storage.getItem('fc_sales_branch_memory_v1')||'[]');return Array.isArray(x)?x.filter(s102ValidMemory):[];}catch(e){return [];}}
  function s102ValidMemory(x){return x&&s151CompanyKnown(x.company)&&typeof x.identity==='string'&&x.identity.length<6000&&typeof x.vkn==='string'&&/^\d{10,11}$/.test(x.vkn)&&typeof x.unvan==='string'&&typeof x.arpCode==='string'&&/^120\.[0-9A-Za-z.]+$/.test(x.arpCode);}
  function s102Identity(r){
    var title=r.s149PdfTitle||r.pdfTitle||r.s150OriginalTitle||r.unvan,raw=String(r.vkn||'')+'\u001f'+String(title||'')+'\u001f'+String(r.sourceRecipient||'');
    if(r.s150IdentityInput===raw)return r.s150IdentityValue;
    var identity=JSON.stringify([String(r.vkn||''),s150Text(title),s150Text(r.sourceRecipient||'')]);
    Object.defineProperty(r,'s150IdentityInput',{value:raw,writable:true,configurable:true});Object.defineProperty(r,'s150IdentityValue',{value:identity,writable:true,configurable:true});return identity;
  }
  function s102Signature(r){return s102Identity(r)+'|'+r.docNo+'|'+r.arpCode;}
  function s102Recipient(lines){
    var start=lines.findIndex(function(l){return /^\s*SAYIN\b/i.test(norm(l));});if(start<0)return '';
    var result=[];for(var i=start;i<Math.min(lines.length,start+12);i++){
      var l=lines[i].replace(/^\s*SAYIN\s*/i,'').trim();
      l=l.split(/Özelleştirme\s*No|Senaryo\s*:|Fatura\s*(?:No|Tarihi)|ETTN\s*:/i)[0].trim();
      if(l)result.push(l);if(/Özelleştirme\s*No|Senaryo\s*:|Fatura\s*(?:No|Tarihi)|ETTN\s*:/i.test(lines[i]))break;
    }return result.join(' ').slice(0,3000);
  }
  function s102Choose(vkn,title,flat,rules,single,docs,docNo){
    var names=norm(title),codes=[];
    if(activeCompany==='KIB'&&/\bPINAR\b/.test(names)&&/\bMEDIKAL\b/.test(names)){
      var pinar=s102PinarCode(title);s102LastMatch={branch:true,candidates:pinar?[pinar]:[],reason:pinar?'Pınar Medikal şube kodu kullanıcı ve Logo XML örneğiyle doğrulandı.':'Pınar Medikal şubesi belirsiz; Bayrampaşa / Beylikdüzü ayrımı gerekli.'};return pinar;
    }
    rules.forEach(function(pair){if(names.indexOf(pair[0])>=0&&codes.indexOf(pair[1])<0)codes.push(pair[1]);});
    // A branch hint is only a suggestion. The whole PDF is never a branch selector.
    if(rules.length){s102LastMatch={branch:true,candidates:codes,reason:codes.length>1?'Unvanda birden fazla şube adayı var.':codes.length===1?'Şube kodu önerildi; PDF alıcısı ve Logo kartını doğrulayın.':'Şube kesin belirlenemedi; Logo cari kodunu girin.'};return codes.length===1?codes[0]:'';}
    var code=single[vkn]||docs[docNo]||'';s102LastMatch={branch:false,known:!!single[vkn],reason:code?'Kod önerisi var; bu alıcının unvanı/şubesi henüz doğrulanmadı.':'Cari kodu tanınmadı.'};return code;
  }
  function s102Restore(r){
    var matches=s102Memory.filter(function(x){return x.company===activeCompany&&s150MemoryIdentity(x)===s102Identity(r);});
    var codes=Array.from(new Set(matches.map(function(x){return x.arpCode;})));
    if(codes.length===1&&matches.every(function(x){return x.verified!==false;})&&r.sourceRecipient){
      r.arpCode=codes[0];if(matches[0].unvan)r.unvan=matches[0].unvan;r.s102FromMemory=true;
      if(!s151HardIssues(r).length){r.s102Confirmed=s102Signature(r);r.s102NeedsConfirmation=false;}else{r.s102Confirmed='';r.s102NeedsConfirmation=true;}
    }
    if(codes.length>1||matches.some(function(x){return x.verified===false;})){r.s102Confirmed='';r.s102NeedsConfirmation=true;}
  }
  function s102Related(r){
    return state.records.filter(function(x){return x!==r&&x.vkn&&x.vkn===r.vkn&&s102Identity(x)!==s102Identity(r);})
      .concat(s102Memory.filter(function(x){return x.company===activeCompany&&x.vkn===r.vkn&&s150MemoryIdentity(x)!==s102Identity(r);}))
      .concat(state.history.filter(function(x){return x.vkn&&x.vkn===r.vkn&&norm(x.unvan)!==norm(r.unvan);}));
  }
  function s102Warnings(r){
    var w=s151HardIssues(r),m=r.s102Match||{},confirmed=r.s102Confirmed===s102Signature(r);
    if(!confirmed&&s149ExistingMatch(r))confirmed=true;
    if(!w.length&&!confirmed)w.push('YENİ / BELİRSİZ CARİ: '+(m.reason||'PDF alıcısının cari kodunu tanıtın.'));
    if(r.arpCode&&!/^120\.[0-9A-Za-z.]+$/.test(r.arpCode))w.push('Satış cari kodu 120 ile başlamalıdır; 320 alış cari koduyla satış XML’i oluşturulamaz.');
    return w;
  }
  function s102PinarCode(title){var n=norm(title);if(!/\bPINAR\b/.test(n)||!/\bMEDIKAL\b/.test(n))return '';var a=/\bBAYRAMPASA\b/.test(n),b=/\bBEYLIKDUZU\b/.test(n);return a===b?'':a?'120.01.017':'120.01.025';}
  function s102AutoSave(r){
    if(!r.unvan||!/^\d{10,11}$/.test(r.vkn)||!/^120\.[0-9A-Za-z.]+$/.test(r.arpCode))return;
    var problems=s151HardIssues(r,true);if(problems.length){r.s102Confirmed='';r.s102NeedsConfirmation=true;showNotice(problems.join(' '));return;}
    s102Confirm(r);
  }
  function s102ReviewHtml(r){return s102Warnings(r).length?'<div class="s102-review"><b>PDF Alıcısı:</b> '+htmlEsc(r.sourceRecipient||'Okunamadı')+'</div>':'';}
  function s102Confirm(r){
    if(!r.unvan||!/^\d{10,11}$/.test(r.vkn)||!/^120\.[0-9A-Za-z.]+$/.test(r.arpCode)){showNotice('Alıcı unvanı, VKN ve geçerli cari kodunu doldurun.');return;}
    var problems=s151HardIssues(r,true);if(problems.length){showNotice(problems.join(' '));r.s102Confirmed='';r.s102NeedsConfirmation=true;return;}
    if(!r.sourceRecipient){showNotice('PDF alıcısı okunamadığı için eşleşme hatırlanamaz.');return;}
    s151Checkpoint(activeCompany,'Cari eşleşmesi düzeltildi / tanıtıldı');
    if(s151SaveBranch(r))showNotice('Cari eşleşmesi yalnızca '+SALES_COMPANIES[activeCompany].label+' için kaydedildi. Aynı alıcı tekrar sorulmayacak.');
  }
  function s102Compare(a,b){return String(a.docNo).localeCompare(String(b.docNo),'en',{numeric:true,sensitivity:'base'})||isoDate(a.date).localeCompare(isoDate(b.date));}
  // v150: recipient identities and multiple service variants, isolated by company.
  function s150Text(value){return norm(value).replace(/[^A-Z0-9]+/g,' ').trim();}
  function s150MemoryIdentity(x){return s102Identity(x);}
  function s150Description(value){
    return s150Text(String(value||'').replace(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g,' '))
      .replace(/\b(?:OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)\b/g,' ')
      .replace(/\b20\d{2}\b/g,' ').replace(/\s+/g,' ').trim();
  }
  function s150Gl(l){if(!s151CompanyKnown(activeCompany))return '';return String(l.glCode||(s156ServiceGL(activeCompany)[l.code]||s156DefaultGL(activeCompany))||'').trim();}
  function s150ExportDescription(r,l){return s177Description(r,l);}
  function s150ValidService(x){return x&&s151CompanyKnown(x.company)&&typeof x.identity==='string'&&x.identity.length<6000&&/^120\.[0-9A-Za-z.]+$/.test(x.arpCode)&&typeof x.description==='string'&&!!x.description&&x.description.length<4000&&/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(x.code)&&typeof x.masterDef==='string'&&!!x.masterDef.trim()&&typeof x.lineDescription==='string'&&/^\d{3}(?:\.[0-9A-Za-z]+)+$/.test(x.glCode);}
  function s150LoadServices(){try{var a=JSON.parse(s153Storage.getItem('fc_sales_service_memory_v1')||'[]');return Array.isArray(a)?a.filter(s150ValidService):[];}catch(e){return [];}}
  function s150Profile(r){return s150Services.filter(function(x){return x.company===activeCompany&&x.identity===s102Identity(r)&&x.arpCode===r.arpCode;});}
  function s150ServiceEntries(r,l){var desc=s150Description(l.pdfDescription||l.sourceDescription);return s150Profile(r).filter(function(x){return x.description===desc;});}
  function s150ServiceSignature(l){return JSON.stringify([String(l.code||''),s150Text(l.masterDef),s150Gl(l)]);}
  function s150ApplyService(r,l){
    if(l.s150Edited)return;
    var matches=s150ServiceEntries(r,l),signatures=Array.from(new Set(matches.map(s150ServiceSignature)));
    if(signatures.length!==1||matches.some(function(x){return x.forgotten;}))return;
    var x=matches[0];l.code=x.code;l.masterDef=x.masterDef;l.glCode=x.glCode;
    l.lineDescription=x.usePdfDescription?l.sourceDescription:s150CurrentPeriod(x,l);l.s150FromMemory=true;
  }
  function s150CurrentPeriod(entry,line){
    var result=entry.lineDescription,old=String(entry.sourceDescription||''),current=String(line.pdfDescription||line.sourceDescription||'');
    // Adapt only explicit period tokens found in both PDFs; never invent a period from the invoice date.
    var months=['OCAK','SUBAT','MART','NISAN','MAYIS','HAZIRAN','TEMMUZ','AGUSTOS','EYLUL','EKIM','KASIM','ARALIK'];
    var patterns=[/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g,/[A-Za-zÇĞİÖŞÜçğıöşü]+/g,/\b20\d{2}\b/g];
    patterns.forEach(function(pattern,index){
      function selected(value){return index!==1||months.indexOf(norm(value))>=0;}
      var before=(old.match(pattern)||[]).filter(selected),after=(current.match(pattern)||[]).filter(selected);
      if(!before.length||before.length!==after.length)return;
      result=result.replace(pattern,function(token){var positions=[];before.forEach(function(value,i){if(norm(value)===norm(token))positions.push(i);});if(!positions.length)return token;var replacements=Array.from(new Set(positions.map(function(i){return after[i];})));return replacements.length===1?replacements[0]:token;});
    });return result;
  }
  function s150Builtin(r,l){
    if(activeCompany!=='KIB'&&activeCompany!=='PUSULA')return !l.s150Edited&&((s156ExtraCompanies[activeCompany]||{}).serviceRules||[]).some(function(x){return x.code===l.code&&s150Description(x.phrase)===s150Description(l.pdfDescription||l.sourceDescription)&&s150Text(l.masterDef)===s150Text(s156Defs(activeCompany)[l.code]);});
    var n=s150Description(l.pdfDescription||l.sourceDescription),known={
      '03':['KENDINE IYI BAK MOBIL UYGULAMA HIZMET BEDELI'],
      '06':['KIB UYGULAMA KOMISYON BEDELI'],
      'P01.09':['PACS KIRA BEDELI'], 'P01.23':['MOBIL UYGULAMA BAKIM BEDELI'],
      'P02.14':['LABORATUAR YAZILIMI COMED LIS'],
      'P04.01':['ENTEGRASYON GELISTIRME BAKIM BEDELI'],
      'P09.01':['ALLIANZ SIGORTA ENTEGRASYON BAKIM DESTEK HIZMETLERI BEDELI'],
      'P06.02':['AYLIK BAKIM GUNCELLEME BEDELI'], 'P01.13':['EK GELISTIRME BEDELI'],
      'P01.34':['HBYS LISANS KIRALAMA KDV TEVKIFAT BEDELI'],
      'P01.14':['HBYS LISANS KIRALAMA BEDELI','HBYS LISANS KIRA BEDELI','HBYS KIRALAMA BEDELI','HBYS KIRA BEDELI','LISANS KIRALAMA BEDELI','LISANS KIRA BEDELI'],
      'P01.12':['HBYS HIZMET BEDELI','HBYS BAKIM BEDELI','MERKEZ BAKIM BEDELI','MERKEZ HBYS BAKIM BEDELI','HASTANE BILGI YONETIM SISTEMI BAKIM BEDELI']
    },list=known[l.code]||[],defs=s156Defs(activeCompany);
    if(!defs[l.code]||s150Text(l.masterDef)!==s150Text(defs[l.code])||l.s150Edited)return false;
    return list.some(function(base){
      if(n===base)return true;
      // Only a known recipient branch may extend a built-in service description.
      var suffix=n.indexOf(base+' ')===0?n.slice(base.length+1):'';
      return !!suffix&&suffix===s150Description(inferLineDescription(r.s149PdfTitle||r.unvan));
    });
  }
  function s150ServiceWarning(r,l){
    if(!s150Description(l.pdfDescription||l.sourceDescription))return 'PDF açıklaması okunamadı.';
    if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(l.code||''))return 'Hizmet kodunu girin.';
    if(!String(l.masterDef||'').trim())return 'Logo hizmet kartı açıklamasını girin.';
    if(!/^\d{3}(?:\.[0-9A-Za-z]+)+$/.test(s150Gl(l)))return 'Hizmet muhasebe hesabını girin.';
    var entries=s150ServiceEntries(r,l),signatures=Array.from(new Set(entries.map(s150ServiceSignature)));
    if(entries.some(function(x){return x.forgotten;}))return 'Bu açıklamanın eşleşmesi unutuldu; doğru hizmet ve açıklamayı bir kez hatırlatın.';
    if(signatures.length>1)return 'Bu PDF açıklaması için hafızada çelişen hizmet eşleşmeleri var; doğru eşleşmeyi seçip hatırlatın.';
    if(entries.length){return s150ServiceSignature(entries[0])===s150ServiceSignature(l)?'':'PDF açıklamasının hatırlanan Logo kodu veya açıklaması değişti; kontrol edin.';}
    if(!s150Profile(r).length&&s150Builtin(r,l))return '';
    return 'Yeni / farklı PDF açıklaması. Logo hizmet kodu ve açıklamasıyla uyumunu bir kez kontrol edin.';
  }
  function s150RememberService(r,l){
    if(!r.sourceRecipient||s102Warnings(r).length)return false;
    var item=s155ServiceItem(r,l);
    if(!s150ValidService(item))return false;
    var entries=s150ServiceEntries(r,l);
    if(entries.length===1&&!entries[0].forgotten&&s150ServiceSignature(entries[0])===s150ServiceSignature(item))return true;
    s150Services=s150Services.filter(function(x){return !(x.company===item.company&&x.identity===item.identity&&x.arpCode===item.arpCode&&x.description===item.description);});
    s150Services.push(item);s150Dirty=true;return true;
  }
  function s150ConfirmService(r,l){
    if(s102Warnings(r).length){showNotice('Önce bu faturanın belirsiz cari / şube eşleşmesini düzeltin; açıklama doğru cariye kaydedilsin.');return;}
    if(!s150ValidService(s155ServiceItem(r,l))){showNotice('PDF açıklaması, hizmet kodu, Logo hizmet açıklaması ve muhasebe hesabını doldurun.');return;}
    s151Checkpoint(activeCompany,'Açıklama eşleşmesi hatırlandı / düzeltildi');
    if(!s150RememberService(r,l)){showNotice('PDF açıklaması, hizmet kodu, Logo hizmet açıklaması ve muhasebe hesabını doldurun.');return;}
    state.records.forEach(function(other){other.lines.forEach(function(line){if(other!==r||line!==l)s150ApplyService(other,line);});});
    showNotice('Bu açıklama ayrı bir hizmet alternatifi olarak hatırlandı. Aynı cari ve açıklama sonraki aylarda yeniden sorulmayacak.');s150Flush();
  }
  function s150Flush(){if(!s150Dirty)return;try{s153Storage.setItem(s150ServiceKey,JSON.stringify(s150Services));s150Dirty=false;}catch(e){showNotice('Eşleşmeler bu oturumda kullanılıyor; tarayıcı kalıcı kaydedemedi. Eşleşme hafızasını yedekleyin.');}}
  function s150DescriptionBanner(r){return r.lines.some(function(l){return !!s150ServiceWarning(r,l);})?'<div class="s150-description-banner">Yeni veya farklı hizmet açıklaması var. Turuncu işaretli satırı PDF ile karşılaştırın; doğru eşleşmeyi bir kez hatırlatın.</div>':'';}
  function s150DownloadMemory(){
    var data={format:'soyturk-works-memory',version:1,branches:s102Memory,services:s150Services};
    var url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Soyturk_Works_Eslesme_Hafizasi.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  async function s150ImportMemory(file){
    try{
      var data=JSON.parse(await file.text());
      if(!['soyturk-works-memory','fatura-canavari-memory'].includes(data.format)||!Array.isArray(data.branches)||!Array.isArray(data.services)||!data.branches.every(s102ValidMemory)||!data.services.every(s150ValidService))throw new Error('Geçerli bir Soyturk Works eşleşme yedeği seçin.');
      Object.keys(SALES_COMPANIES).forEach(function(company){s151Checkpoint(company,'Hafıza yedeği yüklendi');});
      // Preserve competing choices as conflicts instead of silently picking a code.
      data.branches.forEach(function(x){if(!s102Memory.some(function(y){return JSON.stringify(x)===JSON.stringify(y);}))s102Memory.push(x);});
      data.services.forEach(function(x){if(!s150Services.some(function(y){return JSON.stringify(x)===JSON.stringify(y);}))s150Services.push(x);});
      s151RepairNisa();s153Storage.setItem(s102MemoryKey,JSON.stringify(s102Memory));s150Dirty=true;s150Flush();
      Object.keys(companyStates).forEach(function(c){companyStates[c].records.forEach(function(r){r.s102Confirmed='';r.s102FromMemory=false;});});
      state.records.forEach(function(r){s102Restore(r);r.lines.forEach(function(l){s150ApplyService(r,l);});});render();showNotice(s151MigrationMessage||'Cari/şube ve açıklama hafızası yüklendi. Çelişen eşleşmeler kontrol için işaretlenir.');
    }catch(e){showNotice('Hafıza yüklenemedi: '+e.message);}
  }
  var s150Style=document.createElement('style');s150Style.textContent='#page-satis .s150-description-issue{border:2px solid #df8b19;background:#fff8e9}#page-satis .s150-description-banner,#page-satis .s150-new-description{background:#fff0cf;color:#824b00;padding:7px 10px;border-radius:6px;font-weight:700}#page-satis .s150-new-description{display:inline-block;margin-top:5px;font-size:11px}#page-satis .s150-line-review,#page-satis .s150-line-preview{grid-column:1/-1;font-size:12px;overflow-wrap:anywhere}#page-satis .s150-line-review{color:#824b00}#page-satis .s150-memory-tools{display:flex;gap:8px;flex-wrap:wrap;margin:0;flex-basis:100%;order:3}#page-satis .s150-master{grid-column:1/4}#page-satis .s150-gl{grid-column:4/-1}@media(max-width:1100px){#page-satis .s150-master,#page-satis .s150-gl{grid-column:auto}}';document.head.append(s150Style);
  var s150Tools=document.createElement('div');s150Tools.className='s150-memory-tools';s150Tools.innerHTML='<button class="s79-btn" type="button" id="s150Backup">Eşleşme hafızasını yedekle</button><button class="s79-btn" type="button" id="s150Restore">Eşleşme hafızasını yükle</button><input type="file" id="s150MemoryFile" accept=".json,application/json" hidden>';
  document.getElementById('s79Drop').parentNode.insertBefore(s150Tools,document.getElementById('s79Drop'));
  document.getElementById('s150Backup').addEventListener('click',s150DownloadMemory);
  document.getElementById('s150Restore').addEventListener('click',function(){document.getElementById('s150MemoryFile').click();});
  document.getElementById('s150MemoryFile').addEventListener('change',function(e){if(e.target.files[0])s150ImportMemory(e.target.files[0]);e.target.value='';});

  function s151CompanyKnown(company){return !!(SALES_COMPANIES&&Object.prototype.hasOwnProperty.call(SALES_COMPANIES,company));}
  function s151Title(r){return r.s149PdfTitle||r.pdfTitle||r.s150OriginalTitle||r.unvan||'';}
  function s151Lookup(company,vkn,title){
    if(!s151CompanyKnown(company))return {code:'',known:false,branch:false,candidates:[],reason:'Firma için ayrı hesap planı tanımlanmalı.'};
    var names=s150Text(title),rules=(SALES_BRANCH_RULES[company]||{})[vkn]||[],codes=[];
    // Pusula's verified chart intentionally uses one customer account for these units;
    // KIB has different branch codes. Only the enumerated units share this exception.
    if(company==='PUSULA'&&vkn==='4810552613')rules=['SUAM DIS','SEFAKOY','SUAM ESENLER','SUAM CAMLICA','PENDIK'].map(function(name){return [name,CUSTOMER_BY_VKN[vkn]];});
    if(company==='KIB'&&/\bPINAR\b/.test(names)&&/\bMEDIKAL\b/.test(names)){
      var p=s102PinarCode(title);return {code:p,branch:true,candidates:p?[p]:[],reason:p?'Pınar Medikal şubesi tanındı.':'Pınar Medikal şubesi belirsiz.'};
    }
    if((company==='KIB'||company==='PUSULA')&&vkn==='6200443970'){
      // The generic hospital title can coexist with Nisa in the legal title.
      // Explicit, conflicting branch names must still remain ambiguous.
      var explicit=company==='KIB'?[['NISA','120.01.004'],['KOSUYOLU','120.01.003'],['MEDIPOL MEGA','120.01.005'],['MEGA HASTANESI','120.01.005'],['ACIBADEM BOLGE','120.01.026']]:[['NISA','120.01.185'],['MEGA HASTANESI','120.01.050'],['ACIBADEM BOLGE','120.01.206'],['KOSUYOLU','120.01.184']];
      explicit.forEach(function(pair){if((' '+names+' ').indexOf(' '+pair[0]+' ')>=0&&codes.indexOf(pair[1])<0)codes.push(pair[1]);});
    }
    if(!codes.length)rules.forEach(function(pair){if((' '+names+' ').indexOf(' '+s150Text(pair[0])+' ')>=0&&codes.indexOf(pair[1])<0)codes.push(pair[1]);});
    if(rules.length)return {code:codes.length===1?codes[0]:'',branch:true,candidates:codes,reason:codes.length>1?'PDF alıcısında birden fazla şube adı var.':codes.length?'PDF alıcısındaki şube tanındı.':'Şube kesin belirlenemedi; cari kodunu tanıtın.'};
    var singles=s156Customers(company),code=singles[vkn]||'';
    return {code:code,known:!!code,branch:false,candidates:code?[code]:[],reason:code?'Kayıtlı tekil cari.':'Yeni cari; Logo cari kodunu girin.'};
  }
  function s151Expected(company,r){var m=s151Lookup(company,r.sourceVkn||r.vkn,s151Title(r));return m.branch&&m.candidates.length===1?m.code:'';}
  function s151SameOwner(company,a,b){
    if(a.vkn!==b.vkn)return false;
    // User-confirmed shared Pusula account for Istanbul Memorial units.
    if(company==='PUSULA'&&a.vkn==='4810037012'&&a.arpCode==='120.01.145'&&b.arpCode==='120.01.145')return true;
    if(s102Identity(a)===s102Identity(b))return true;
    var ea=s151Expected(company,a),eb=s151Expected(company,b);
    if(ea&&eb&&ea===eb)return true;
    // Old report rows have no recipient block. Only the complete same title is reusable.
    return (!a.sourceRecipient||!b.sourceRecipient)&&s150Text(s151Title(a))===s150Text(s151Title(b));
  }
  function s151ReservedOwners(company,code){
    var singles=s156Customers(company),owners=[];
    Object.keys(singles).forEach(function(vkn){if(singles[vkn]===code)owners.push(vkn);});
    var rules=SALES_BRANCH_RULES[company]||{};
    Object.keys(rules).forEach(function(vkn){if(rules[vkn].some(function(pair){return pair[1]===code;})&&owners.indexOf(vkn)<0)owners.push(vkn);});return owners;
  }
  function s151HardIssues(r,replacingMemory){
    var company=activeCompany,w=[];
    if(!s151CompanyKnown(company)||r.company&&r.company!==company)return ['FİRMA ÇELİŞKİSİ: Kayıt seçili firmaya ait değil.'];
    if(r.docNo&&!String(r.docNo).toUpperCase().startsWith(SALES_COMPANIES[company].prefix))w.push('FİRMA ÇELİŞKİSİ: Belge numarası seçili firmaya ait değil; bu firmaya eşleşme kaydedilemez.');
    if(r.sourceVkn&&r.sourceVkn!==r.vkn)w.push('CARİ ÇELİŞKİSİ: VKN, PDF alıcısının VKN bilgisiyle farklı.');
    var expected=s151Expected(company,r),lookup=s151Lookup(company,r.sourceVkn||r.vkn,s151Title(r));
    if(lookup.branch&&lookup.candidates.length>1)w.push('ŞUBE ÇELİŞKİSİ: PDF alıcısında birden fazla şube adı var; tek bir şube doğrulanamadı.');
    if(expected&&r.arpCode&&expected!==r.arpCode)w.push('CARİ KODU ÇELİŞKİSİ: '+s151Title(r)+' için doğru kod '+expected+'; seçilen '+r.arpCode+'. Bu kod onaylanamaz.');
    if(lookup.known&&r.arpCode&&lookup.code!==r.arpCode)w.push('CARİ KODU ÇELİŞKİSİ: Bu VKN için kayıtlı cari kodu '+lookup.code+'; seçilen '+r.arpCode+'.');
    if(!r.arpCode)return w;
    var reserved=s151ReservedOwners(company,r.arpCode);
    if(reserved.length&&reserved.indexOf(r.vkn)<0)w.push('KOD ÇAKIŞMASI: '+r.arpCode+' bu firmada başka bir VKN’ye ait kayıtlı cari kodudur.');
    var rows=state.records.filter(function(x){return x!==r;}).concat(s102Memory.filter(function(x){return x.company===company;})).concat(state.history);
    var owners=rows.filter(function(x){
      if(x.arpCode!==r.arpCode||!x.vkn||x.company&&x.company!==company||s151SameOwner(company,r,x))return false;
      // An old, provably wrong mapping cannot reserve the real owner's code.
      var correct=s151Expected(company,x);return !correct||correct===x.arpCode;
    });
    if(owners.length){var other=owners[0];w.push('KOD ÇAKIŞMASI: '+r.arpCode+' aynı firmada başka cari/şube için de kullanılıyor: '+(s151Title(other)||other.vkn)+'. Yanlış eşleşmeyi hafızadan düzeltin.');}
    if(!replacingMemory&&s102Memory.some(function(x){return x.company===company&&s150MemoryIdentity(x)===s102Identity(r)&&x.arpCode!==r.arpCode;}))w.push('HAFIZA ÇELİŞKİSİ: Bu alıcı için farklı cari kodları kayıtlı. Eşleşme hafızasından doğru kodu kaydedin.');
    return Array.from(new Set(w));
  }
  function s151LoadUndo(){try{var data=JSON.parse(s153Storage.getItem('fc_sales_memory_undo_v1')||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(e){return {};}}
  function s151Checkpoint(company,reason){
    if(!s151CompanyKnown(company))return;
    s151Undo[company]={reason:reason,branches:JSON.parse(JSON.stringify(s102Memory.filter(function(x){return x.company===company;}))),services:JSON.parse(JSON.stringify(s150Services.filter(function(x){return x.company===company;})))};
    try{s153Storage.setItem('fc_sales_memory_undo_v1',JSON.stringify(s151Undo));}catch(e){}
  }
  function s151Persist(){
    try{s153Storage.setItem(s102MemoryKey,JSON.stringify(s102Memory));s153Storage.setItem(s150ServiceKey,JSON.stringify(s150Services));s150Dirty=false;return true;}catch(e){showNotice('Değişiklik bu oturumda geçerli; tarayıcı kalıcı kaydedemedi. Eşleşme hafızasını yedekleyin.');return false;}
  }
  function s151SaveBranch(r){
    var identity=s102Identity(r),company=activeCompany;
    var item={company:company,identity:identity,vkn:r.vkn,unvan:r.unvan,arpCode:r.arpCode,sourceRecipient:r.sourceRecipient,pdfTitle:s151Title(r),verified:true,updatedAt:new Date().toISOString()};
    s102Memory=s102Memory.filter(function(x){return !(x.company===company&&s150MemoryIdentity(x)===identity);});s102Memory.push(item);
    // A service learned under the wrong customer code must be reviewed again.
    s150Services=s150Services.filter(function(x){return !(x.company===company&&x.identity===identity&&x.arpCode!==item.arpCode);});
    r.s102Confirmed=s102Signature(r);r.s102NeedsConfirmation=false;r.s102FromMemory=false;
    state.records.forEach(function(other){if(s102Identity(other)===identity){other.arpCode=item.arpCode;other.s102NeedsConfirmation=false;other.s102Confirmed='';s102Restore(other);}});
    return s151Persist();
  }
  function s151RepairNisa(){
    var entries=s102Memory.filter(function(x){return x.company==='KIB'&&x.vkn==='6200443970'&&x.arpCode==='120.01.003'&&s151Expected('KIB',x)==='120.01.004';});
    if(!entries.length)return 0;
    s151Checkpoint('KIB','Eski Nisa 120.01.003 eşleşmesi 120.01.004 olarak düzeltildi');
    entries.forEach(function(x){var identity=s150MemoryIdentity(x);x.arpCode='120.01.004';x.identity=identity;x.verified=true;x.correctedFrom='120.01.003';x.updatedAt=new Date().toISOString();s150Services=s150Services.filter(function(y){return !(y.company==='KIB'&&y.identity===identity&&y.arpCode==='120.01.003');});});
    s151MigrationMessage='KİB: Nisa için '+entries.length+' eski 120.01.003 eşleşmesi 120.01.004 olarak düzeltildi. Koşuyolu 120.01.003 olarak korundu.';s151Persist();return entries.length;
  }
  function s151MemoryRows(){return s102Memory.filter(function(x){return x.company===activeCompany;});}
  function s151EditMemory(index,code){
    var entry=s151MemoryRows()[index];if(!entry)return false;
    var candidate=Object.assign({},entry,{arpCode:String(code||'').trim(),sourceVkn:entry.vkn});
    if(!/^120\.[0-9A-Za-z.]+$/.test(candidate.arpCode)){showNotice('Geçerli bir Logo cari kodu girin.');return false;}
    var hard=s151HardIssues(candidate,true);if(hard.length){showNotice(hard.join(' '));return false;}
    s151Checkpoint(activeCompany,'Hafızadaki cari kodu düzeltildi');var saved=s151SaveBranch(candidate);render();if(saved)showNotice('Hafızadaki kod düzeltildi. Bu alıcının çalışma listesindeki faturaları da güncellendi.');return true;
  }
  function s151ForgetMemory(index){
    var entry=s151MemoryRows()[index];if(!entry)return;
    var identity=s150MemoryIdentity(entry);s151Checkpoint(activeCompany,'Cari eşleşmesi unutuldu');
    s102Memory=s102Memory.filter(function(x){return !(x.company===activeCompany&&s150MemoryIdentity(x)===identity);});
    s150Services=s150Services.filter(function(x){return !(x.company===activeCompany&&x.identity===identity);});
    state.records.forEach(function(r){if(s102Identity(r)===identity){r.s102Confirmed='';r.s102FromMemory=false;r.s102NeedsConfirmation=false;r.arpCode=resolveArp(r.vkn,s151Title(r),'',r.docNo);r.s102Match=Object.assign({},s102LastMatch);}});
    var saved=s151Persist();render();if(saved)showNotice('Öğrenilen cari ve hizmet eşleşmeleri unutuldu. Yerleşik doğrulanmış cari kuralları kullanılmaya devam eder. Son değişikliği geri alabilirsiniz.');
  }
  function s151UndoMemory(){
    var previous=s151Undo[activeCompany];if(!previous||!Array.isArray(previous.branches)||!Array.isArray(previous.services))return;
    if(!previous.branches.every(function(x){return s102ValidMemory(x)&&x.company===activeCompany;})||!previous.services.every(function(x){return s150ValidService(x)&&x.company===activeCompany;})){showNotice('Geri alma kaydı geçersiz.');return;}
    var s155BeforeServices=s150Services.slice();
    s102Memory=s102Memory.filter(function(x){return x.company!==activeCompany;}).concat(previous.branches);s150Services=s150Services.filter(function(x){return x.company!==activeCompany;}).concat(previous.services);
    delete s151Undo[activeCompany];try{s153Storage.setItem('fc_sales_memory_undo_v1',JSON.stringify(s151Undo));}catch(e){}
    state.records.forEach(function(r){r.s102Confirmed='';r.s102FromMemory=false;r.s102NeedsConfirmation=false;s102Restore(r);});s155RefreshChangedServices(s155BeforeServices,s150Services);var saved=s151Persist();render();if(saved)showNotice('Bu firmanın son hafıza değişikliği geri alındı. Kod çelişkileri yine engellenir.');
  }
  function s151IssueType(message){
    var n=norm(message);
    if(/CAKISMA|CELISKI|BASKA.*VKN|BU BELGE.*FATURASI DEGIL/.test(n))return 'conflict';
    if(/MUKERRER/.test(n))return 'duplicate';
    if(/TOPLAM|TEVKIFAT|ADEDI|BIRIM FIYATI|KDV ORANI/.test(n))return 'amount';
    if(/ACIKLAMA|HIZMET KOD|HIZMET KART|MUHASEBE HESAB/.test(n))return 'description';
    if(/CARI|SUBE/.test(n))return 'customer';return 'missing';
  }
  function s151IssueLabels(){return {conflict:'Kod / Firma Çakışması',duplicate:'Mükerrer Belge',amount:'Tutar / Hesap Hatası',description:'Yeni / Farklı Açıklama',customer:'Yeni / Belirsiz Cari',missing:'Eksik / Okunamayan Bilgi'};}
  function s151IssueGroups(r){var groups={};(r.error?[r.error]:(r.warnings||[])).forEach(function(message){var type=s151IssueType(message);(groups[type]||(groups[type]=[])).push(message);});return groups;}
  function s151Badges(r){var labels=s151IssueLabels();return '<div class="s151-badges">'+Object.keys(s151IssueGroups(r)).map(function(type){return '<button type="button" class="s151-tag s151-'+type+' s152-jump" data-issue-jump="'+type+'" aria-label="'+labels[type]+' — Sorunlu Alana Git">'+labels[type]+'</button>';}).join('')+'</div>';}
  function s151WarningHtml(r){var labels=s151IssueLabels(),groups=s151IssueGroups(r);return Object.keys(groups).map(function(type){return '<div class="s151-warning s151-'+type+'" data-issue-section="'+type+'" tabindex="-1"><b>'+labels[type]+'</b><ul>'+groups[type].map(function(message){return '<li>'+htmlEsc(message)+'</li>';}).join('')+'</ul></div>';}).join('');}
  function s151CardClasses(r){return Object.keys(s151IssueGroups(r)).map(function(type){return 's151-has-'+type;}).join(' ');}
  function s155ServiceIdentity(x){
    var parts=[];try{parts=JSON.parse(x.identity);}catch(e){}
    if(!Array.isArray(parts))parts=[];
    return {vkn:String(x.vkn||parts[0]||''),unvan:String(x.unvan||parts[1]||''),sourceRecipient:String(x.sourceRecipient||parts[2]||'')};
  }
  function s155ServiceKey(x){return JSON.stringify([x.company,x.identity,x.arpCode,x.description]);}
  function s155ServiceItem(r,l){
    return {company:activeCompany,identity:s102Identity(r),vkn:r.vkn,unvan:s151Title(r)||r.unvan,sourceRecipient:r.sourceRecipient,arpCode:r.arpCode,description:s150Description(l.pdfDescription||l.sourceDescription),sourceDescription:l.pdfDescription||l.sourceDescription,code:l.code,masterDef:l.masterDef,lineDescription:s177Description(r,l),glCode:s150Gl(l),usePdfDescription:false,updatedAt:new Date().toISOString()};
  }
  function s155ServiceRows(search){
    search=s150Text(search||'');var rows=[];
    s150Services.forEach(function(x,index){
      if(x.company!==activeCompany||x.forgotten)return;
      var who=s155ServiceIdentity(x),text=[who.vkn,who.unvan,who.sourceRecipient,x.arpCode,x.sourceDescription,x.description,x.lineDescription,x.code,x.masterDef,x.glCode].join(' ');
      if(!search||s150Text(text).indexOf(search)>=0)rows.push({entry:x,index:index,who:who});
    });return rows;
  }
  function s155RefreshService(entry){
    if(entry.company!==activeCompany)return;
    state.records.forEach(function(r){
      if(r.arpCode!==entry.arpCode||s102Identity(r)!==entry.identity)return;
      r.lines.forEach(function(l){
        if(s150Description(l.pdfDescription||l.sourceDescription)!==entry.description)return;
        l.s150Edited=false;l.s150FromMemory=false;
        var matches=s150ServiceEntries(r,l);
        if(matches.length&&!matches.some(function(x){return x.forgotten;}))s150ApplyService(r,l);
        else{
          var rule=serviceForDescription(l.pdfDescription||l.sourceDescription);
          l.code=rule?rule.code:'';l.masterDef=rule?rule.def:'';l.glCode='';l.lineDescription=l.pdfDescription||l.sourceDescription;
        }
      });
    });
  }
  function s155RefreshChangedServices(before,after){
    var keys={};before.concat(after).forEach(function(x){if(x.company===activeCompany)keys[s155ServiceKey(x)]=x;});
    Object.keys(keys).forEach(function(key){
      var a=before.filter(function(x){return s155ServiceKey(x)===key;}),b=after.filter(function(x){return s155ServiceKey(x)===key;});
      if(JSON.stringify(a)!==JSON.stringify(b))s155RefreshService(keys[key]);
    });
  }
  function s155EditService(index,fields){
    var entry=s150Services[index];if(!entry||entry.company!==activeCompany||entry.forgotten||s102Busy)return false;
    var who=s155ServiceIdentity(entry),candidate=Object.assign({},entry);
    ['code','masterDef','lineDescription','glCode'].forEach(function(k){candidate[k]=String(fields[k]===undefined?entry[k]:fields[k]).trim();});candidate.code=candidate.code.toUpperCase();
    candidate.usePdfDescription=s150Description(candidate.lineDescription)===s150Description(candidate.sourceDescription);candidate.updatedAt=new Date().toISOString();
    candidate.lineDescription=s177Description(who,Object.assign({},candidate,{s150Edited:true}));candidate.usePdfDescription=false;
    if(!s150ValidService(candidate)||(s177University(who)&&!candidate.lineDescription)){showNotice('Hizmet kodunu, hizmet kartı açıklamasını ve muhasebe hesabını tamamlayın. İstanbul Medipol Üniversitesi için yalnızca şube adını girin.');return false;}
    var guard=Object.assign({},who,{company:activeCompany,sourceVkn:who.vkn,pdfTitle:who.unvan,arpCode:entry.arpCode});
    var problems=s151HardIssues(guard);if(problems.length){showNotice(problems.join(' '));return false;}
    s151Checkpoint(activeCompany,'Açıklama eşleşmesi düzeltildi');var key=s155ServiceKey(entry);
    s150Services=s150Services.filter(function(x){return s155ServiceKey(x)!==key;});s150Services.push(candidate);
    s155RefreshService(candidate);var saved=s151Persist();render();
    if(saved)showNotice('Bu PDF açıklamasının hafızası düzeltildi. Yüklü eşleşen satırlar da güncellendi; diğer açıklamalar ve tutarlar korundu.');return saved;
  }
  function s155ForgetService(index){
    var entry=s150Services[index];if(!entry||entry.company!==activeCompany||entry.forgotten||s102Busy)return false;
    s151Checkpoint(activeCompany,'Açıklama eşleşmesi unutuldu');var key=s155ServiceKey(entry),forgotten=Object.assign({},entry,{forgotten:true,updatedAt:new Date().toISOString()});
    // Keep a disabled marker so a built-in default cannot immediately relearn it.
    // The next explicit confirmation replaces this marker; it travels with the file.
    s150Services=s150Services.filter(function(x){return s155ServiceKey(x)!==key;});s150Services.push(forgotten);
    s155RefreshService(forgotten);var saved=s151Persist();render();if(saved)showNotice('Yalnızca bu açıklamanın eşleşmesi unutuldu. Cari kodu ve diğer açıklamalar korundu. İsterseniz Son Hafıza Değişikliğini Geri Al düğmesini kullanın.');return saved;
  }
  function s155KnownCustomers(search){
    var rows=[],single=s156Customers(activeCompany),services=s155ServiceRows('');
    Object.keys(single).forEach(function(vkn){
      var code=single[vkn],loaded=state.records.find(function(r){return r.vkn===vkn;}),learned=services.find(function(x){return x.who.vkn===vkn;}),title=loaded?s151Title(loaded):learned?learned.who.unvan:'Hazır Tanımlı Cari';
      if(s151MemoryRows().some(function(x){return x.vkn===vkn&&x.arpCode===code;}))return;
      if(!search&&!loaded&&!learned)return;
      if(search&&s150Text(vkn+' '+code+' '+title).indexOf(search)<0)return;
      rows.push({vkn:vkn,arpCode:code,title:title});
    });return rows;
  }
  function s151RenderMemory(){
    var panel=document.getElementById('s151MemoryPanel');if(!panel||!s151MemoryOpen)return;
    var search=s150Text((document.getElementById('s151MemorySearch')||{}).value||''),rows=s151MemoryRows(),services=s155ServiceRows(search),known=s155KnownCustomers(search),customerCount=0;
    document.getElementById('s151MemoryHeading').textContent=SALES_COMPANIES[activeCompany].label+' · Cari ve Açıklama Hafızası';
    document.getElementById('s151MemoryUndo').disabled=!s151Undo[activeCompany]||s102Busy;
    var customerHtml=rows.map(function(x,index){
      if(search&&s150Text(x.unvan+' '+x.vkn+' '+x.arpCode).indexOf(search)<0)return '';customerCount++;
      var problems=s151HardIssues(x),expected=s151Expected(activeCompany,x);
      return '<div class="s151-memory-row '+(problems.length?'s151-conflict':'')+'" data-memory-row="'+index+'"><div><b>'+htmlEsc(s151Title(x))+'</b><p>VKN: '+htmlEsc(x.vkn)+'</p><small>'+htmlEsc(x.sourceRecipient||'')+'</small>'+(expected?'<p>Kayıtlı şube kodu: '+htmlEsc(expected)+'</p>':'')+'</div><div><label>Cari Kodu <input data-memory-code value="'+htmlEsc(x.arpCode)+'"></label><button class="s79-btn" type="button" data-memory-action="save">Kodu Düzelt ve Kaydet</button><button class="s79-btn" type="button" data-memory-action="forget">Bu Cari Eşleşmesini Unut</button><p>'+htmlEsc(problems.join(' '))+'</p></div></div>';
    }).join('');
    customerHtml+=known.map(function(x){return '<div class="s151-memory-row s155-known"><div><b>'+htmlEsc(x.title)+'</b><p>VKN: '+htmlEsc(x.vkn)+'</p></div><div><b>Cari Kodu: '+htmlEsc(x.arpCode)+'</b><p>Hazır tanımlı cari kaydı. Öğrenilmiş satır açıklamaları aşağıda ayrı ayrı düzenlenir.</p></div></div>';}).join('');
    var serviceHtml=services.map(function(row){
      var x=row.entry,who=row.who;
      function field(key,label){return '<label>'+label+'<input data-service-field="'+key+'" value="'+htmlEsc(x[key]||'')+'"></label>';}
      return '<div class="s151-memory-row s155-service" data-service-memory-row="'+row.index+'"><div><b>'+htmlEsc(who.unvan||'Öğrenilmiş Alıcı')+'</b><p>VKN: '+htmlEsc(who.vkn)+' · Cari Kodu: '+htmlEsc(x.arpCode)+'</p><b>PDF’deki Açıklama</b><p class="s155-pdf-description">'+htmlEsc(x.sourceDescription||x.description)+'</p></div><div>'+field('lineDescription','Logo Satır Açıklaması')+field('code','Hizmet Kodu')+field('masterDef','Logo Hizmet Kartı Açıklaması')+field('glCode','Hizmet Muhasebe Hesabı')+'<button type="button" class="s79-btn" data-service-memory-action="save">Düzelt ve Kaydet</button><button type="button" class="s79-btn danger" data-service-memory-action="forget">Bu Açıklamayı Unut</button></div></div>';
    }).join('');
    document.getElementById('s151MemoryRows').innerHTML='<h4>Cari Kayıtları ('+(customerCount+known.length)+')</h4>'+(customerHtml||'<p>Bu aramada cari kodu kaydı bulunamadı.</p>')+'<h4>Öğrenilmiş Açıklamalar ('+services.length+')</h4>'+(serviceHtml||'<p>Bu aramada öğrenilmiş açıklama bulunamadı.</p>');
    document.getElementById('s151MigrationNote').textContent=activeCompany==='KIB'?s151MigrationMessage:'';
  }
  var s151Style=document.createElement('style');s151Style.textContent=
    '#page-satis .s151-conflict{--issue:#bb2929;--paper:#ffebeb}#page-satis .s151-customer,#page-satis .s151-new-customer{--issue:#936600;--paper:#fff5ce}#page-satis .s151-description{--issue:#b95c00;--paper:#fff0dc}#page-satis .s151-duplicate{--issue:#7736ac;--paper:#f3e9ff}#page-satis .s151-amount{--issue:#186b9e;--paper:#e7f3ff}#page-satis .s151-missing{--issue:#505965;--paper:#eef0f3}'+
    '#page-satis .s151-warning,#page-satis .s102-review.s151-conflict,#page-satis .s102-review.s151-new-customer{border:1px solid var(--issue);border-left:5px solid var(--issue);background:var(--paper);color:var(--issue);padding:12px;border-radius:8px;margin:10px 0;font-size:12px}#page-satis .s151-warning ul{margin:6px 0 0;padding-left:18px}#page-satis .s151-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}#page-satis .s151-tag{font-size:11px;padding:5px 8px;background:var(--paper);color:var(--issue);border:1px solid var(--issue);border-radius:6px}'+
    '#page-satis .s151-has-conflict{border-left:5px solid #bb2929}#page-satis .s151-has-conflict [data-field="arpCode"],#page-satis .s151-has-conflict [data-field="vkn"]{background:#ffebeb;border-color:#bb2929}#page-satis .s151-has-duplicate [data-field="docNo"]{background:#f3e9ff;border-color:#7736ac}#page-satis .s151-has-amount [data-line-field="price"],#page-satis .s151-has-amount [data-line-field="quantity"]{background:#e7f3ff;border-color:#186b9e}'+
    '#page-satis .s150-description-issue .s90-issue input{background:#fff0dc;border-color:#b95c00;box-shadow:0 0 0 2px #b95c0020}'+
    '#page-satis .s151-memory-panel{padding:16px;background:#fff;border:1px solid #bbcbd8;border-radius:10px;margin:10px 0;width:100%;box-sizing:border-box}#page-satis .s151-memory-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;border:1px solid #ccd6df;padding:12px;margin:8px 0;border-radius:8px;overflow-wrap:anywhere;font-size:12px}#page-satis .s151-memory-row.s151-conflict{background:var(--paper);border-color:var(--issue)}#page-satis .s151-memory-row input{display:block;padding:8px;margin:6px 0;border:1px solid #9faebb;border-radius:6px}#page-satis .s151-legend{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px}@media(max-width:700px){#page-satis .s151-memory-row{grid-template-columns:1fr}}';document.head.append(s151Style);
  var s151Manager=document.createElement('div');s151Manager.style.cssText='width:100%;flex-basis:100%;order:4';s151Manager.innerHTML='<button class="s79-btn" id="s151MemoryToggle" type="button">Eşleşme hafızasını yönet / düzelt</button><section class="s151-memory-panel" id="s151MemoryPanel" hidden><h3 id="s151MemoryHeading"></h3><p>Seçili firmanın cari kodları ve öğrenilmiş satır açıklamaları burada görünür. Açıklama düzeltmesi yalnızca aynı alıcı ve PDF açıklamasına uygulanır; tutarlar değişmez.</p><input id="s151MemorySearch" placeholder="Cari adı, VKN, kod veya açıklama ara" aria-label="Cari ve açıklama hafızasında ara"><button class="s79-btn" id="s151MemoryUndo" type="button">Son hafıza değişikliğini geri al</button><p id="s151MigrationNote" role="status"></p><div id="s151MemoryRows"></div></section>';
  document.getElementById('s79Drop').parentNode.insertBefore(s151Manager,document.getElementById('s79Drop'));
  document.getElementById('s151MemoryToggle').addEventListener('click',function(){s151MemoryOpen=!s151MemoryOpen;document.getElementById('s151MemoryPanel').hidden=!s151MemoryOpen;s151RenderMemory();});
  document.getElementById('s151MemorySearch').addEventListener('input',s151RenderMemory);
  document.getElementById('s151MemoryUndo').addEventListener('click',s151UndoMemory);
  document.getElementById('s151MemoryRows').addEventListener('click',function(e){var serviceButton=e.target.closest('[data-service-memory-action]');if(serviceButton){var serviceRow=serviceButton.closest('[data-service-memory-row]');if(!serviceRow)return;var serviceIndex=+serviceRow.dataset.serviceMemoryRow;if(serviceButton.dataset.serviceMemoryAction==='save'){var fields={};serviceRow.querySelectorAll('[data-service-field]').forEach(function(input){fields[input.dataset.serviceField]=input.value;});s155EditService(serviceIndex,fields);}else s155ForgetService(serviceIndex);return;}var button=e.target.closest('[data-memory-action]');if(!button)return;var row=button.closest('[data-memory-row]'),index=+row.dataset.memoryRow;if(button.dataset.memoryAction==='save')s151EditMemory(index,row.querySelector('[data-memory-code]').value);else s151ForgetMemory(index);});
  var s155Style=document.createElement('style');s155Style.textContent='#page-satis .s155-service input{width:100%;box-sizing:border-box}#page-satis .s155-service label{display:block;margin-bottom:10px}#page-satis .s155-service .s79-btn{margin:4px 6px 4px 0}#page-satis .s155-pdf-description{background:#f1f6fb;padding:10px;border-radius:6px}#page-satis .s155-known{background:#f3f8fc}#page-satis #s151MemorySearch{min-width:260px;padding:8px;border:1px solid #9faebb;border-radius:6px}';document.head.append(s155Style);
  function s152Counts(){
    var counts={};Object.keys(s151IssueLabels()).forEach(function(type){counts[type]=0;});
    state.records.forEach(function(r){if(r.status==='reading')return;Object.keys(s151IssueGroups(r)).forEach(function(type){if(counts[type]!==undefined)counts[type]++;});});return counts;
  }
  function s152Shown(){
    var shown=state.records.filter(function(r){return (!state.search||s156SearchMatches(r,state.search))&&(state.issueFilter?!!s151IssueGroups(r)[state.issueFilter]:state.filter==='all'||r.status===state.filter);}),order=document.getElementById('s148Sort').value;
    return shown.sort(function(a,b){if(order==='document')return s102Compare(a,b);var result=String(a.unvan||a.fileName||'').localeCompare(String(b.unvan||b.fileName||''),'tr',{sensitivity:'base',numeric:true});return (order==='nameDesc'?-result:result)||s102Compare(a,b);});
  }
  function s152RenderCounters(){
    if(!s151Legend)return;
    var counts=s152Counts(),labels=s151IssueLabels();
    Object.keys(labels).forEach(function(type){
      var button=document.getElementById('s152Issue-'+type);if(!button)return;
      button.disabled=s102Busy||counts[type]===0;button.classList.toggle('s152-lit',counts[type]>0);button.classList.toggle('s152-selected',state.issueFilter===type);
      button.setAttribute('aria-pressed',String(state.issueFilter===type));button.setAttribute('aria-label',labels[type]+': '+counts[type]+' Fatura');
      document.getElementById('s152Count-'+type).textContent=counts[type];
    });
    document.getElementById('s152Total').textContent=state.records.length;
    var clear=document.getElementById('s152ClearFilter');clear.hidden=!state.issueFilter;clear.disabled=s102Busy;
  }
  function s152ClearFilter(){state.issueFilter='';state.filter='all';render();}
  function s152SelectIssue(type){
    if(s102Busy||!Object.prototype.hasOwnProperty.call(s151IssueLabels(),type))return;
    if(state.issueFilter===type){s152ClearFilter();return;}
    if(!s152Counts()[type])return;
    if(s156Ready){state.search='';document.getElementById('s156Search').value='';document.getElementById('s151MemoryPanel').hidden=true;}state.issueFilter=type;state.filter='all';var first=s152Shown()[0];if(first)s152GoToIssue(first,type);else render();
  }
  function s152IssueTarget(r,type){
    var groups=s151IssueGroups(r),messages=norm((groups[type]||[]).join(' '));
    if(type==='conflict'){
      if(/FIRMA CELISKISI|BU BELGE.*FATURASI DEGIL/.test(messages))return '[data-field="docNo"]';
      if(/VKN, PDF/.test(messages))return '[data-field="vkn"]';
      if(/BIRDEN FAZLA SUBE/.test(messages))return '[data-issue-section="conflict"]';
      return '[data-field="arpCode"]';
    }
    if(type==='customer')return '[data-field="arpCode"]';
    if(type==='duplicate')return '[data-field="docNo"]';
    if(type==='description'){
      for(var i=0;i<r.lines.length;i++){
        var l=r.lines[i];if(!s150ServiceWarning(r,l))continue;
        var base='[data-line="'+i+'"] ';
        if(!String(l.pdfDescription||l.sourceDescription||'').trim())return '[data-issue-section="description"]';
        if(!l.code)return base+'[data-line-field="code"]';
        if(!String(l.masterDef||'').trim())return base+'[data-line-field="masterDef"]';
        if(!/^\d{3}(?:\.[0-9A-Za-z]+)+$/.test(s150Gl(l)))return base+'[data-line-field="glCode"]';
        return base+'.s150-line-review';
      }
    }
    if(type==='amount'){
      if(/TEVKIFAT/.test(messages))return '[data-issue-section="amount"]';
      for(var j=0;j<r.lines.length;j++){
        var line=r.lines[j],prefix='[data-line="'+j+'"] ';
        if(!(line.quantity>0))return prefix+'[data-line-field="quantity"]';
        if(!(line.price>0))return prefix+'[data-line-field="price"]';
        if(!(line.vat>=0))return '[data-issue-section="amount"]';
      }
      if(r.lines.length)return '[data-line="0"] [data-line-field="price"]';
    }
    if(type==='missing'&&r.status!=='error'){
      if(!/^\d{2}\.\d{2}\.\d{4}$/.test(r.date))return '[data-field="date"]';
      if(!r.docNo)return '[data-field="docNo"]';
      if(!r.unvan)return '[data-field="unvan"]';
      if(!r.vkn)return '[data-field="vkn"]';
    }
    return '[data-issue-section="'+type+'"]';
  }
  function s152GoToIssue(r,type){
    if(s102Busy||!s151IssueGroups(r)[type])return;
    r.open=true;if(type==='description'||type==='amount'){r.linesOpen=true;var selector=s152IssueTarget(r,type),match=selector.match(/data-line="(\d+)"/);var line=r.lines[match?+match[1]:0];if(line&&!line.s156Editing){line.s156Draft=s156LineValues(line);line.s156Editing=true;}}else if(!r.s156Editing){r.s156Draft=s156RecordValues(r);r.s156Editing=true;}
    var company=activeCompany;render();
    requestAnimationFrame(function(){
      if(activeCompany!==company||state.records.indexOf(r)<0)return;
      var card=Array.prototype.find.call(document.querySelectorAll('#s79List .s79-card'),function(el){return el.dataset.id===r.id;});if(!card)return;
      var target=card.querySelector(s152IssueTarget(r,type))||card.querySelector('[data-issue-section="'+type+'"]');if(!target)return;
      document.querySelectorAll('#s79List .s152-target').forEach(function(el){el.classList.remove('s152-target');delete el.dataset.issueFocus;});
      target.classList.add('s152-target');target.dataset.issueFocus=type;
      if(!/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(target.tagName))target.setAttribute('tabindex','-1');
      var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.focus({preventScroll:true});target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
      setTimeout(function(){target.classList.remove('s152-target');delete target.dataset.issueFocus;},2400);
    });
  }
  var s151Legend=document.createElement('div');s151Legend.className='s151-legend s152-toolbar';s151Legend.setAttribute('aria-label','Fatura Sorun Filtreleri');
  s151Legend.innerHTML='<div class="s152-issue-buttons">'+Object.keys(s151IssueLabels()).map(function(type){return '<button type="button" id="s152Issue-'+type+'" class="s151-tag s151-'+type+' s152-issue-button" data-issue-filter="'+type+'" aria-controls="s79List" aria-pressed="false" disabled><span class="s152-light" aria-hidden="true"></span><span>'+s151IssueLabels()[type]+' (<b id="s152Count-'+type+'">0</b>)</span></button>';}).join('')+'</div><div class="s152-total"><span>Toplam Kesilen Fatura</span><output id="s152Total" aria-live="polite" aria-atomic="true" aria-label="Toplam Kesilen Fatura">0</output></div><button type="button" class="s79-btn s152-clear" id="s152ClearFilter" hidden>Tüm Faturaları Göster</button>';
  s150Tools.appendChild(s151Legend);
  s151Legend.addEventListener('click',function(e){var button=e.target.closest('[data-issue-filter]');if(button&&!button.disabled)s152SelectIssue(button.dataset.issueFilter);});
  document.getElementById('s152ClearFilter').addEventListener('click',s152ClearFilter);
  var s152Style=document.createElement('style');s152Style.textContent=
    '#page-satis .s152-toolbar{align-items:center;gap:12px}#page-satis .s152-issue-buttons{display:flex;flex:1 1 640px;flex-wrap:wrap;gap:7px}#page-satis .s152-issue-button{display:inline-flex;align-items:center;gap:7px;min-height:38px;font-family:inherit;font-size:11px;font-weight:600;text-align:left;cursor:pointer;transition:box-shadow .2s}#page-satis .s152-issue-button:disabled{opacity:.5;cursor:default}#page-satis .s152-selected{outline:2px solid var(--issue);outline-offset:2px}#page-satis .s152-light{flex:none;display:inline-block;width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.35}#page-satis .s152-lit .s152-light{animation:s152Pulse 1.8s ease-in-out infinite}'+
    '@keyframes s152Pulse{0%,100%{opacity:1;box-shadow:0 0 8px 2px currentColor}50%{opacity:.4;box-shadow:0 0 0 0 transparent}}'+
    '#page-satis .s152-total{margin-left:auto;display:flex;gap:14px;align-items:center;padding:10px 14px;border:1px solid #b7cbdc;border-radius:9px;background:#edf5fc;color:#17324f;white-space:nowrap}#page-satis .s152-total span{font-size:12px;font-weight:700;text-transform:none}#page-satis .s152-total output{font-size:25px;font-weight:800}#page-satis .s152-clear{flex-basis:100%}#page-satis .s152-clear[hidden]{display:none}#page-satis .s152-jump{cursor:pointer;font-family:inherit;text-align:left}#page-satis .s152-jump:focus-visible,#page-satis .s152-issue-button:focus-visible{outline:3px solid var(--issue);outline-offset:3px}'+
    '#page-satis [data-issue-focus="conflict"]{--s152-ring:#bb2929}#page-satis [data-issue-focus="duplicate"]{--s152-ring:#7736ac}#page-satis [data-issue-focus="amount"]{--s152-ring:#186b9e}#page-satis [data-issue-focus="description"]{--s152-ring:#b95c00}#page-satis [data-issue-focus="customer"]{--s152-ring:#936600}#page-satis [data-issue-focus="missing"]{--s152-ring:#505965}#page-satis .s152-target{outline:3px solid var(--s152-ring);outline-offset:4px;scroll-margin:100px 0}'+
    '@media(max-width:700px){#page-satis .s152-total{margin-left:0;flex-basis:100%;justify-content:space-between}#page-satis .s152-issue-buttons{flex-basis:100%}}@media(prefers-reduced-motion:reduce){#page-satis .s152-lit .s152-light{animation:none;opacity:1;box-shadow:0 0 5px 1px currentColor}#page-satis .s152-issue-button{transition:none}}';document.head.append(s152Style);
  s152RenderCounters();

  // Portable copies keep their own browser storage: reopening an older copy cannot
  // overwrite another workspace, and local edits take precedence over its seed.
  function s153ReadSeed(){
    try{
      var node=document.getElementById('fc153PortableData'),x=node&&JSON.parse(node.textContent||'null');
      if(!x||x.format!=='fc-portable-sales-v1'||!/^fc153-[a-zA-Z0-9-]+$/.test(x.id)||!x.values||typeof x.values!=='object')return null;
      const values={};for(const [key,value] of Object.entries(x.values)){const filtered=window.SWWorkspace.filterCompanyValue(key,value);if(filtered!==null)values[key]=filtered;}x.values=values;
      return x;
    }catch(e){return null;}
  }
  function s153MakeStorage(seed){
    var session={};
    return {
      getItem:function(key){
        if(Object.prototype.hasOwnProperty.call(session,key))return session[key];
        try{var local=window.SWWorkspace.storage.getItem(seed?'fc153:'+seed.id+':'+key:key);if(local!==null)return local;}catch(e){}
        return seed&&typeof seed.values[key]==='string'?seed.values[key]:null;
      },
      setItem:function(key,value){
        session[key]=String(value);
        window.SWWorkspace.storage.setItem(seed?'fc153:'+seed.id+':'+key:key,String(value));
      }
    };
  }
  function s153Snapshot(){
    var values={};
    values.efatura_monthly_v1=efMonthly.serialize();
    values[s102MemoryKey]=JSON.stringify(s102Memory);
    values[s150ServiceKey]=JSON.stringify(s150Services);
    values.fc_sales_memory_undo_v1=JSON.stringify(s151Undo);
    Object.keys(HISTORY_KEYS).forEach(function(c){values[HISTORY_KEYS[c]]=JSON.stringify(companyStates[c].history);});
    return {format:'fc-portable-sales-v1',workspace:{companyId:window.SWWorkspace.companyId},id:'fc153-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),createdAt:new Date().toISOString(),values:values};
  }
  function s153Json(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
  var s153TemplatePromise=null;
  function s153LoadTemplate(){
    var node=document.getElementById('fc153PortableTemplate');
    if(!node)return Promise.reject(new Error('Taşınabilir kopya şablonu bulunamadı.'));
    if(node.textContent){try{return Promise.resolve(JSON.parse(node.textContent));}catch(e){return Promise.reject(e);}}
    var templateUrl=node.getAttribute('data-src');
    if(!templateUrl)return Promise.reject(new Error('Taşınabilir kopya şablonu bulunamadı.'));
    if(!s153TemplatePromise)s153TemplatePromise=fetch(templateUrl,{credentials:'same-origin',cache:'force-cache'}).then(function(response){
      if(!response.ok)throw new Error('Taşınabilir kopya şablonu indirilemedi.');
      return response.text();
    }).then(function(text){return JSON.parse(text);}).catch(function(error){s153TemplatePromise=null;throw error;});
    return s153TemplatePromise;
  }
  async function s153BuildPortable(snapshot){
    var template=await s153LoadTemplate(),source=template;
    ['sfOcrCoreData','sfOcrLangData','sfOcrLangDataEng'].forEach(function(id){
      var data=document.getElementById(id);if(!data||!data.textContent)throw new Error('PDF okuma bileşeni eksik: '+id);
      source=source.replace('<!--FC153_BINARY_'+id+'-->',function(){return data.textContent;});
    });
    // Split closing tags so this function remains safe inside an HTML script.
    var additions='<script type="application/json" id="fc153PortableTemplate">'+s153Json(template)+'</scr'+'ipt>'+
      '<script type="application/json" id="fc153PortableData">'+s153Json(snapshot)+'</scr'+'ipt>';
    return source.replace('<!--FC153_PORTABLE_DATA-->',function(){return additions;});
  }
  async function s153DownloadPortable(){
    if(s102Busy){showNotice('PDF okuma tamamlandığında ayarlı kopyayı kaydedebilirsiniz.');return;}
    try{
      var snapshot=s153Snapshot(),source=await s153BuildPortable(snapshot);
      var url=URL.createObjectURL(new Blob([source],{type:'text/html;charset=utf-8'})),a=document.createElement('a');
      a.href=url;a.download='Soyturk_Works_Ayarlarimla_'+snapshot.createdAt.slice(0,10)+'.html';a.click();
      setTimeout(function(){URL.revokeObjectURL(url);},3000);
      showNotice('Ayarlarınızla tek HTML dosyası indirildi. Outlook ile bu yeni dosyayı gönderin; iş yerinde doğrudan açın. Cari, hizmet açıklaması ve rapor geçmişi içindedir. Açık PDF çalışma listesi dahil değildir.');
    }catch(e){showNotice('Ayarlı kopya oluşturulamadı: '+e.message);}
  }
  var s153PortableButton=document.createElement('button');s153PortableButton.type='button';s153PortableButton.className='s79-btn';s153PortableButton.id='s153Portable';s153PortableButton.textContent='Ayarlarımla Birlikte Kaydet / Gönder';s153PortableButton.addEventListener('click',s153DownloadPortable);s150Tools.insertBefore(s153PortableButton,s150Tools.firstChild);
  var s153PortableHelp=document.createElement('div');s153PortableHelp.style.cssText='flex-basis:100%;font-size:12px;color:#425a72;line-height:1.5';s153PortableHelp.textContent='Başka bilgisayarda devam etmek için ayarlı kopyayı indirin ve o dosyayı gönderin. Pusula ve KİB eşleşmeleri otomatik açılır; tutarlar her yeni PDF’den okunur.';s150Tools.appendChild(s153PortableHelp);

  s151RepairNisa();if(s151MigrationMessage)showNotice(s151MigrationMessage);

  var s102Style=document.createElement('style');s102Style.textContent='#page-satis .s102-review{padding:12px;margin:12px 0;background:#f5f7f1;border:1px solid #c9d5c2;border-radius:8px;font-size:12px;overflow-wrap:anywhere}#page-satis .s102-review p{margin:7px 0}#page-satis .s102-memory{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0;font-size:11px;color:#5c6b58}';document.head.append(s102Style);
  var s149Style=document.createElement('style');s149Style.textContent='#page-satis .s149-attention{border:2px solid #d69b20;background:#fff8df;color:#44360e}#page-satis .s149-attention>b{display:block;font-size:14px}';document.head.append(s149Style);

  function s156Defs(company){return company==='KIB'?KIB_SERVICE_DEFS:company==='PUSULA'?SERVICE_DEFS:(s156ExtraCompanies[company]||{}).serviceDefs||{};}
  function s156ServiceGL(company){return company==='KIB'?KIB_SERVICE_GL:(s156ExtraCompanies[company]||{}).serviceGL||{};}
  function s156DefaultGL(company){return company==='PUSULA'?'600.01.001':(s156ExtraCompanies[company]||{}).defaultServiceGL||'';}
  function s156Customers(company){return company==='KIB'?KIB_CUSTOMER_BY_VKN:company==='PUSULA'?CUSTOMER_BY_VKN:(s156ExtraCompanies[company]||{}).customers||{};}
  function s156Docs(company){return company==='KIB'?KIB_KNOWN_DOC_ARP:company==='PUSULA'?KNOWN_DOC_ARP:{};}
  function s156Profile(company){return company==='KIB'?'KIB':company==='PUSULA'?'PUSULA':(s156ExtraCompanies[company]||{}).xmlProfile;}
  function s156ValidateCompany(c){return !!(c&&/^[A-Z][A-Z0-9_]{1,29}$/.test(c.id)&&c.id!=='PUSULA'&&c.id!=='KIB'&&typeof c.label==='string'&&c.label.trim()&&/^[A-Z]{3}$/.test(c.prefix)&&['PUSULA','KIB'].indexOf(c.xmlProfile)>=0&&c.customers&&typeof c.customers==='object'&&Object.keys(c.customers).every(function(vkn){return /^\d{10,11}$/.test(vkn)&&/^120\.[0-9A-Za-z.]+$/.test(c.customers[vkn]);})&&c.serviceDefs&&c.serviceGL&&Array.isArray(c.serviceRules)&&c.serviceRules.every(function(r){return r&&typeof r.phrase==='string'&&typeof r.code==='string'&&!!c.serviceDefs[r.code]&&/^\d{3}(?:\.[0-9A-Za-z]+)+$/.test(c.serviceGL[r.code]||c.defaultServiceGL||'');}));}
  function s156LoadCompanies(){var result={};try{var parsed=JSON.parse(s153Storage.getItem('fc_sales_companies_v156')||'{}');Object.keys(parsed).forEach(function(key){var c=parsed[key];if(key===c.id&&s156ValidateCompany(c)){result[key]=c;SALES_COMPANIES[key]={label:c.label,prefix:c.prefix};SALES_BRANCH_RULES[key]=c.branches||{};}});}catch(e){}return result;}
  function s156RegisterCompany(config){
    if(!window.SWWorkspace.allows(config?.id))return false;
    if(!s156ValidateCompany(config)||Object.keys(SALES_COMPANIES).some(function(key){return key!==config.id&&SALES_COMPANIES[key].prefix===config.prefix;}))return false;
    var c=s156Clone(config);s156ExtraCompanies[c.id]=c;SALES_COMPANIES[c.id]={label:c.label,prefix:c.prefix};SALES_BRANCH_RULES[c.id]=c.branches||{};HISTORY_KEYS[c.id]='fc_sales_history_'+c.id.toLowerCase()+'_v1';if(!companyStates[c.id])companyStates[c.id]=emptyState(c.id);
    s153Storage.setItem('fc_sales_companies_v156',JSON.stringify(s156ExtraCompanies));if(s156Ready){s156RenderCompanyButtons();s156Persist();}return true;
  }
  function s156RenderCompanyButtons(){
    var box=document.querySelector('#page-satis .s79-company');if(!box)return;
    box.innerHTML=Object.keys(SALES_COMPANIES).map(function(c){return '<button type="button" class="'+(c===activeCompany?'active':'')+'" data-sales-company="'+c+'">'+htmlEsc(SALES_COMPANIES[c].label)+'<small>'+(c===activeCompany?'AKTİF':'')+'</small></button>';}).join('');
    box.querySelectorAll('[data-sales-company]').forEach(function(button){button.addEventListener('click',function(){switchSalesCompany(button.dataset.salesCompany);});});
  }

  // One editing/search/save UI for every registered seller.
  var s156MemoryEdits={},s156MemoryUndo={},s156PersistTimer=null,s156SavedStamp='',s156Ready=false;
  function s156Clone(x){return JSON.parse(JSON.stringify(x));}
  function s156LineValues(l){var x={};['code','masterDef','lineDescription','glCode','quantity','price','vat','unit'].forEach(function(k){x[k]=l[k];});return x;}
  function s156RecordValues(r){var x={};['date','docNo','unvan','vkn','arpCode'].forEach(function(k){x[k]=r[k];});return x;}
  function s156HasDraft(r){return !!r.s156Changed||r.lines.some(function(l){return !!l.s156Changed;});}
  function s156Actions(kind,editing,undo){return '<div class="s156-row-actions"><button type="button" class="s79-btn" data-action="s156-'+kind+'-edit"'+(editing?' disabled':'')+'>Düzelt</button><button type="button" class="s79-btn s156-row-save" data-action="s156-'+kind+'-save"'+(!editing?' disabled':'')+'>Kaydet</button><button type="button" class="s79-btn" data-action="s156-'+kind+'-undo"'+(!editing&&!undo?' disabled':'')+'>Geri Al</button></div>';}
  function s156StartEdit(r,index){var x=index===null?r:r.lines[index];if(!x)return;if(!x.s156Editing){x.s156Draft=index===null?s156RecordValues(r):s156LineValues(x);x.s156Editing=true;x.s156Changed=false;}render();}
  function s156Related(entry){return s150Services.filter(function(x){return s155ServiceKey(x)===s155ServiceKey(entry);});}
  function s156SaveLine(r,index){
    var l=r.lines[index];if(!l||!l.s156Editing||s102Busy)return false;
    var draft=Object.assign({},s156LineValues(l),l.s156Draft||{}),trial=Object.assign({},l,draft),entry=s155ServiceItem(r,trial);
    trial.s150Edited=true;draft.lineDescription=s177Description(r,trial);entry.lineDescription=draft.lineDescription;
    if(!s150ValidService(entry)||(s177University(r)&&!draft.lineDescription)||!(draft.quantity>0)||!(draft.price>0)||!(draft.vat>=0&&draft.vat<=100)){showNotice('Satırdaki eksik veya geçersiz alanları düzeltin.');return false;}
    if(s102Warnings(r).length){showNotice('Önce bu faturanın cari bilgilerini düzeltin.');return false;}
    var undo={values:s156LineValues(l),services:s156Clone(s156Related(entry))};
    Object.assign(l,draft);l.s150Edited=true;
    if(!s150RememberService(r,l)){showNotice('Satır kaydedilemedi.');return false;}
    l.s156Undo=undo;l.s156Editing=false;l.s156Changed=false;delete l.s156Draft;
    state.records.forEach(function(other){other.lines.forEach(function(line){if(line!==l)s150ApplyService(other,line);});});
    s151Persist();render();showNotice('Kaydedildi.');return true;
  }
  function s156UndoLine(r,index){
    var l=r.lines[index];if(!l||s102Busy)return;
    if(l.s156Editing){delete l.s156Draft;l.s156Editing=false;l.s156Changed=false;render();return;}
    var undo=l.s156Undo;if(!undo)return;
    var entry=s155ServiceItem(r,l),key=s155ServiceKey(entry);
    s150Services=s150Services.filter(function(x){return s155ServiceKey(x)!==key;}).concat(s156Clone(undo.services));
    s155RefreshService(entry);Object.assign(l,undo.values);l.s150Edited=true;delete l.s156Undo;
    if(!undo.services.length){s150Services.push(Object.assign({},entry,{forgotten:true}));}
    s151Persist();render();showNotice('Son satır işlemi geri alındı.');
  }
  function s156SaveRecord(r){
    if(!r.s156Editing||s102Busy)return false;
    var candidate=Object.assign({},r,r.s156Draft||{}),problems=s151HardIssues(candidate,true);
    if(!candidate.unvan||!/^\d{10,11}$/.test(candidate.vkn)||!/^120\.[0-9A-Za-z.]+$/.test(candidate.arpCode)||!/^\d{2}\.\d{2}\.\d{4}$/.test(candidate.date)||!candidate.docNo){showNotice('Cari ve belge bilgilerini tamamlayın.');return false;}
    if(problems.length){showNotice(problems[0]);return false;}
    var identity=s102Identity(r),undo={values:s156RecordValues(r),identity:identity,branches:s156Clone(s102Memory.filter(function(x){return x.company===activeCompany&&s150MemoryIdentity(x)===identity;})),services:s156Clone(s150Services.filter(function(x){return x.company===activeCompany&&x.identity===identity;}))};
    Object.assign(r,s156RecordValues(candidate));r.s102Confirmed='';s102Confirm(r);
    if(s102Warnings(r).length)return false;
    r.s156Undo=undo;r.s156Editing=false;r.s156Changed=false;delete r.s156Draft;render();showNotice('Kaydedildi.');return true;
  }
  function s156UndoRecord(r){
    if(s102Busy)return;
    if(r.s156Editing){delete r.s156Draft;r.s156Editing=false;r.s156Changed=false;render();return;}
    var undo=r.s156Undo;if(!undo)return;var identity=s102Identity(r),before=s150Services.slice();
    s102Memory=s102Memory.filter(function(x){return !(x.company===activeCompany&&s150MemoryIdentity(x)===identity);}).concat(s156Clone(undo.branches));
    s150Services=s150Services.filter(function(x){return !(x.company===activeCompany&&x.identity===identity);}).concat(s156Clone(undo.services));
    Object.assign(r,undo.values);r.s102Confirmed='';r.s102NeedsConfirmation=false;s102Restore(r);delete r.s156Undo;
    state.records.forEach(function(other){if(other!==r&&s102Identity(other)===identity){other.arpCode=r.arpCode;other.unvan=r.unvan;other.s102Confirmed='';other.s102NeedsConfirmation=false;s102Restore(other);}});
    s155RefreshChangedServices(before,s150Services);s151Persist();render();showNotice('Son cari işlemi geri alındı.');
  }
  function s156DraftChange(e){
    var card=e.target.closest('.s79-card');if(!card)return;var r=state.records.find(function(x){return x.id===card.dataset.id;});if(!r)return;
    var key=e.target.dataset.field,lineKey=e.target.dataset.lineField,x;
    if(key&&r.s156Editing){x=r;x.s156Draft[key]=e.target.value.trim();}
    else if(lineKey&&lineKey!=='sourceDescription'){
      var box=e.target.closest('[data-line]');if(!box)return;x=r.lines[+box.dataset.line];if(!x||!x.s156Editing)return;
      x.s156Draft[lineKey]=['quantity','price','vat'].indexOf(lineKey)>=0?num(e.target.value):e.target.value.trim();
      if(lineKey==='code'){var code=String(x.s156Draft.code).toUpperCase();x.s156Draft.code=code;x.s156Draft.masterDef=s156Defs(activeCompany)[code]||'';x.s156Draft.glCode=s156ServiceGL(activeCompany)[code]||s156DefaultGL(activeCompany);['masterDef','glCode'].forEach(function(k){var input=box.querySelector('[data-line-field="'+k+'"]');if(input)input.value=x.s156Draft[k];});}
    }
    if(x){x.s156Changed=true;s156QueuePersist();var save=document.getElementById('s156SaveAll');if(save)save.classList.add('s156-unsaved');}
  }
  function s156RowClick(e,r,action){
    var name=action.dataset.action;if(name.indexOf('s156-')!==0)return false;
    var box=action.closest('[data-line]'),index=box?+box.dataset.line:null;
    if(name==='s156-line-edit')s156StartEdit(r,index);else if(name==='s156-line-save')s156SaveLine(r,index);else if(name==='s156-line-undo')s156UndoLine(r,index);
    else if(name==='s156-record-edit')s156StartEdit(r,null);else if(name==='s156-record-save')s156SaveRecord(r);else if(name==='s156-record-undo')s156UndoRecord(r);return true;
  }
  function s156SearchMatches(r,query){return s150Text([r.unvan,r.vkn,r.arpCode,r.docNo,r.sourceRecipient].concat(r.lines.map(function(l){return [l.sourceDescription,l.lineDescription,l.code,l.masterDef].join(' ');})).join(' ')).indexOf(s150Text(query))>=0;}
  function s156Search(query){
    state.search=String(query||'').trim();state.issueFilter='';state.filter='all';document.getElementById('s156Search').value=state.search;
    s151MemoryOpen=!!state.search;document.getElementById('s151MemoryPanel').hidden=!s151MemoryOpen;document.getElementById('s151MemorySearch').value=state.search;
    var first=state.records.find(function(r){return s156SearchMatches(r,state.search);});if(first&&state.search){first.open=true;first.linesOpen=true;}render();
  }
  function s156MemoryMarkup(search){
    var html='',services=s155ServiceRows(search),branches=s151MemoryRows();
    s155KnownCustomers(search).forEach(function(x){html+='<div class="s156-known-result"><b>'+htmlEsc(x.title)+'</b><span>'+htmlEsc(x.vkn)+' · '+htmlEsc(x.arpCode)+'</span></div>';});
    branches.forEach(function(x,index){if(s150Text(x.unvan+' '+x.vkn+' '+x.arpCode).indexOf(s150Text(search))<0)return;
      var key='c:'+activeCompany+':'+s150MemoryIdentity(x),edit=!!s156MemoryEdits[key];
      html+='<div class="s156-memory-result" data-s156-kind="customer" data-s156-index="'+index+'" data-s156-key="'+encodeURIComponent(key)+'"><b>'+htmlEsc(x.unvan)+'</b><span>'+htmlEsc(x.vkn)+'</span><div class="s156-memory-fields"><label>Cari Adı / Unvan<input data-s156-value="unvan" value="'+htmlEsc(x.unvan)+'"'+(edit?'':' readonly')+'></label><label>VKN<input data-s156-value="vkn" value="'+htmlEsc(x.vkn)+'"'+(edit?'':' readonly')+'></label><label>Cari Kodu<input data-s156-value="arpCode" value="'+htmlEsc(x.arpCode)+'"'+(edit?'':' readonly')+'></label></div>'+s156MemoryButtons(edit,!!s156MemoryUndo[key])+'</div>';
    });
    services.forEach(function(row){var x=row.entry,key='s:'+s155ServiceKey(x),edit=!!s156MemoryEdits[key];
      html+='<div class="s156-memory-result" data-s156-kind="service" data-s156-index="'+row.index+'" data-s156-key="'+encodeURIComponent(key)+'"><div><b>'+htmlEsc(row.who.unvan)+'</b><span>'+htmlEsc(row.who.vkn)+' · '+htmlEsc(x.arpCode)+'</span><small>PDF: '+htmlEsc(x.sourceDescription||x.description)+'</small></div><div class="s156-memory-fields">';
      [['lineDescription','Logo Satır Açıklaması'],['code','Hizmet Kodu'],['masterDef','Hizmet Açıklaması'],['glCode','Muhasebe Hesabı']].forEach(function(pair){html+='<label>'+pair[1]+'<input data-s156-value="'+pair[0]+'" value="'+htmlEsc(x[pair[0]]||'')+'"'+(edit?'':' readonly')+'></label>';});
      html+='</div>'+s156MemoryButtons(edit,!!s156MemoryUndo[key])+'</div>';
    });return html||'<div class="s156-no-memory">Kayıtlı eşleşme bulunamadı.</div>';
  }
  function s156MemoryButtons(edit,undo){return '<div class="s156-row-actions"><button type="button" class="s79-btn" data-s156-memory="edit"'+(edit?' disabled':'')+'>Düzelt</button><button type="button" class="s79-btn s156-row-save" data-s156-memory="save"'+(!edit?' disabled':'')+'>Kaydet</button><button type="button" class="s79-btn" data-s156-memory="undo"'+(!edit&&!undo?' disabled':'')+'>Geri Al</button></div>';}
  function s156EditCustomer(index,fields){
    var entry=s151MemoryRows()[index];if(!entry||s102Busy)return false;
    var candidate=Object.assign({},entry,{unvan:String(fields.unvan===undefined?entry.unvan:fields.unvan).trim(),vkn:String(fields.vkn===undefined?entry.vkn:fields.vkn).trim(),arpCode:String(fields.arpCode===undefined?entry.arpCode:fields.arpCode).trim(),sourceVkn:entry.vkn,pdfTitle:s151Title(entry)});
    if(!candidate.unvan||!/^\d{10,11}$/.test(candidate.vkn)||!/^120\.[0-9A-Za-z.]+$/.test(candidate.arpCode)){showNotice('Cari bilgilerini tamamlayın.');return false;}
    var problems=s151HardIssues(candidate,true);if(problems.length){showNotice(problems[0]);return false;}
    s151Checkpoint(activeCompany,'Cari bilgileri düzeltildi');var saved=s151SaveBranch(candidate);render();return saved;
  }
  function s156MemoryClick(e){
    var button=e.target.closest('[data-s156-memory]');if(!button||s102Busy)return;var row=button.closest('[data-s156-key]');if(!row)return;
    var key=decodeURIComponent(row.dataset.s156Key),index=+row.dataset.s156Index,kind=row.dataset.s156Kind,action=button.dataset.s156Memory;
    if(action==='edit'){s156MemoryEdits[key]=true;s151RenderMemory();return;}
    if(action==='save'){
      var fields={};row.querySelectorAll('[data-s156-value]').forEach(function(input){fields[input.dataset.s156Value]=input.value;});
      var entry=kind==='service'?s150Services[index]:s151MemoryRows()[index];if(!entry)return;
      var before=kind==='service'?s156Clone(s156Related(entry)):s156Clone(s102Memory.filter(function(x){return x.company===activeCompany&&s150MemoryIdentity(x)===s150MemoryIdentity(entry);}));
      var serviceBefore=s156Clone(s150Services.filter(function(x){return x.company===activeCompany&&x.identity===(kind==='service'?entry.identity:s150MemoryIdentity(entry));}));
      var ok=kind==='service'?s155EditService(index,fields):s156EditCustomer(index,fields);
      if(ok){s156MemoryUndo[key]={kind:kind,entry:s156Clone(entry),before:before,services:serviceBefore};delete s156MemoryEdits[key];s151RenderMemory();s156Persist();showNotice('Kaydedildi.');}return;
    }
    if(s156MemoryEdits[key]){delete s156MemoryEdits[key];s151RenderMemory();return;}
    var undo=s156MemoryUndo[key];if(!undo)return;
    if(kind==='service'){var serviceKey=s155ServiceKey(undo.entry);s150Services=s150Services.filter(function(x){return s155ServiceKey(x)!==serviceKey;}).concat(undo.before);s155RefreshService(undo.entry);}
    else{var identity=s150MemoryIdentity(undo.entry),old=s150Services.slice();s102Memory=s102Memory.filter(function(x){return !(x.company===activeCompany&&s150MemoryIdentity(x)===identity);}).concat(undo.before);s150Services=s150Services.filter(function(x){return !(x.company===activeCompany&&x.identity===identity);}).concat(undo.services);state.records.forEach(function(r){if(s102Identity(r)===identity){r.arpCode=undo.entry.arpCode;r.unvan=undo.entry.unvan;r.s102Confirmed='';r.s102NeedsConfirmation=false;s102Restore(r);}});s155RefreshChangedServices(old,s150Services);}
    delete s156MemoryUndo[key];s151Persist();render();showNotice('Geri alındı.');
  }
  function s156PackRecord(r){
    var x=s156Clone(r);['open','linesOpen','warnings','sourceFlat','s102Match'].forEach(function(k){delete x[k];});x.company=x.company||activeCompany;
    if(!x.s156Changed){delete x.s156Draft;delete x.s156Editing;delete x.s156Changed;}
    x.lines.forEach(function(l){if(!l.s156Changed){delete l.s156Draft;delete l.s156Editing;delete l.s156Changed;}});return x;
  }
  function s156WorkValues(){var result={};Object.keys(companyStates).forEach(function(c){result[c]=companyStates[c].records.filter(function(r){return r.status!=='reading';}).map(function(r){var x=s156PackRecord(r);x.company=c;return x;});});return result;}
  function s156Persist(){
    if(!s156Ready||s102Busy)return;
    try{s153Storage.setItem('fc_sales_work_v156',JSON.stringify(s156WorkValues()));s153Storage.setItem('fc_sales_row_undo_v156',JSON.stringify(s156MemoryUndo));}catch(e){showNotice('Tarayıcıya kayıt yapılamadı. Kaydet ve Güncelle ile dosyanızı alın.');}
    s156UpdateSaveLight();
  }
  function s156QueuePersist(){if(s156PersistTimer)clearTimeout(s156PersistTimer);s156PersistTimer=setTimeout(s156Persist,250);}
  function s156LoadWork(){
    try{var all=JSON.parse(s153Storage.getItem('fc_sales_work_v156')||'{}');Object.keys(companyStates).forEach(function(c){if(!Array.isArray(all[c]))return;companyStates[c].records=all[c].filter(function(r){return r&&r.company===c&&typeof r.id==='string'&&Array.isArray(r.lines);}).slice(0,500);});s156MemoryUndo=JSON.parse(s153Storage.getItem('fc_sales_row_undo_v156')||'{}')||{};}catch(e){}
  }
  function s156FileValues(){var values={};values[s102MemoryKey]=JSON.stringify(s102Memory);values[s150ServiceKey]=JSON.stringify(s150Services);values.fc_sales_memory_undo_v1=JSON.stringify(s151Undo);Object.keys(HISTORY_KEYS).forEach(function(c){values[HISTORY_KEYS[c]]=JSON.stringify(companyStates[c].history);});values.fc_sales_work_v156=JSON.stringify(s156WorkValues());values.fc_sales_row_undo_v156=JSON.stringify(s156MemoryUndo);values.fc_sales_companies_v156=JSON.stringify(s156ExtraCompanies);return values;}
  function s156Stamp(values){var text=JSON.stringify(Object.keys(values).filter(function(k){return k!=='fc156_file_stamp';}).sort().map(function(k){return [k,values[k]];})),hash=2166136261;for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return String(hash>>>0)+':'+text.length;}
  function s156UpdateSaveLight(){var button=document.getElementById('s156SaveAll');if(!button||!s156Ready)return;var dirty=s156Stamp(s156FileValues())!==s156SavedStamp;button.classList.toggle('s156-unsaved',dirty);button.setAttribute('aria-label',dirty?'Kaydet ve Güncelle — Dosyaya Alınmamış Değişiklik Var':'Kaydet ve Güncelle');button.disabled=s102Busy;}
  async function s156Download(){
    if(s102Busy)return;s156Persist();
    try{var values=s156FileValues(),stamp=s156Stamp(values);values.fc156_file_stamp=stamp;
      var snapshot={format:'fc-portable-sales-v1',workspace:{companyId:window.SWWorkspace.companyId},id:'fc153-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),createdAt:new Date().toISOString(),values:values};
      var source=await s153BuildPortable(snapshot),url=URL.createObjectURL(new Blob([source],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Soyturk_Works_Guncel.html';a.click();setTimeout(function(){URL.revokeObjectURL(url);},3000);
      s156SavedStamp=stamp;try{s153Storage.setItem('fc156_file_stamp',stamp);}catch(e){}s156UpdateSaveLight();showNotice('Güncel dosya indirildi. Diğer bilgisayara bu dosyayı gönderin.');
    }catch(e){showNotice('Dosya kaydedilemedi: '+e.message);}
  }
  function s156Keyboard(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='f'&&page.style.display!=='none'){e.preventDefault();s157OpenSearch();}}
  // Reports remain stored for duplicate checks; the reporting UI is removed.
  renderMonth=function(){};updateCommitButton=function(){};
  s151RenderMemory=function(){if(!s156Ready)return;var panel=document.getElementById('s151MemoryPanel');panel.hidden=!state.search||state.records.some(function(r){return s156SearchMatches(r,state.search);});if(!state.search)return;document.getElementById('s151MemoryRows').innerHTML=s156MemoryMarkup(state.search);};
  ['s150Backup','s150Restore','s150MemoryFile','s151MemoryToggle','s151MemoryUndo','s153Portable','s82Report','s83CommitBtn'].forEach(function(id){var node=document.getElementById(id);if(node)node.remove();});
  if(s153PortableHelp)s153PortableHelp.remove();
  document.querySelectorAll('#page-satis .s82-report-controls,#page-satis .eyebrow,#page-satis .s79-topline p,#page-satis .s151-memory-panel>p,#page-satis .s151-memory-panel>h3').forEach(function(node){node.remove();});
  document.getElementById('s151MemorySearch').hidden=true;var migrationNote=document.getElementById('s151MigrationNote');if(migrationNote)migrationNote.hidden=true;
  var s156SearchBar=document.createElement('form');s156SearchBar.className='s156-searchbar';s156SearchBar.innerHTML='<input id="s156Search" type="search" placeholder="VKN, cari adı, kod veya açıklama ara…" aria-label="Cari ve fatura ara"><button type="submit" class="s79-btn">Ara</button><button id="s156SaveAll" type="button" class="s79-btn s156-save-all">Kaydet ve Güncelle</button>';
  s150Tools.insertBefore(s156SearchBar,s150Tools.firstChild);s156SearchBar.addEventListener('submit',function(e){e.preventDefault();s156Search(document.getElementById('s156Search').value);});
  document.getElementById('s156Search').addEventListener('input',function(e){if(!e.target.value)s156Search('');});document.getElementById('s156SaveAll').addEventListener('click',s156Download);
  document.getElementById('s151MemoryRows').addEventListener('click',s156MemoryClick);document.addEventListener('keydown',s156Keyboard);
  document.getElementById('s79List').addEventListener('input',s156DraftChange);
  document.getElementById('s79Filters').addEventListener('click',function(e){if(e.target.closest('[data-filter]')){state.search='';document.getElementById('s156Search').value='';s151MemoryOpen=false;document.getElementById('s151MemoryPanel').hidden=true;render();}});
  var s156Style=document.createElement('style');s156Style.textContent=
    '#page-satis .s156-searchbar{display:flex;gap:8px;width:100%;align-items:center}#page-satis #s156Search{flex:1;min-width:160px;font-size:14px;padding:13px 16px;border:1px solid #b5c7d8;border-radius:10px;background:#fff}#page-satis .s156-save-all{margin-left:auto;background:#173953;color:#fff;min-height:43px}#page-satis .s156-save-all.s156-unsaved{background:#d88d17;box-shadow:0 0 18px #e9b145aa;color:#172b40}'+
    '#page-satis .s79-company [data-sales-company]{transition:background .2s,box-shadow .2s;border-radius:10px}#page-satis .s79-company [data-sales-company="PUSULA"].active{background:#087cac;color:#fff;box-shadow:0 0 18px #42bfe777;border-color:#62d4f5}#page-satis .s79-company [data-sales-company="KIB"].active{background:#6b43af;color:#fff;box-shadow:0 0 18px #af88ec88;border-color:#c2a0fa}#page-satis .s79-company button.active{background:#237c76;color:#fff;box-shadow:0 0 16px #64d0bf77}#page-satis .s79-company button.active small{color:inherit}#page-satis .s79-company button:not(.active){opacity:.65}'+
    '#page-satis .s156-row-actions{display:flex;gap:7px;grid-column:1/-1;margin-top:8px}#page-satis .s156-row-save{background:#257b63;color:#fff}#page-satis input[readonly]{background:#f4f7fa;color:#41546b;cursor:default}#page-satis .s151-memory-panel{padding:12px;margin:0;box-shadow:none}#page-satis .s156-memory-result{padding:14px;border:1px solid #c8d6e3;border-radius:10px;margin:8px 0;background:#fff}#page-satis .s156-memory-result span,#page-satis .s156-memory-result small,#page-satis .s156-known-result span{display:block;color:#64758a;margin-top:5px}#page-satis .s156-memory-fields{display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:10px;margin-top:10px}#page-satis .s156-memory-result label{font-size:11px;font-weight:600;color:#53677b}#page-satis .s156-memory-result input{display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:5px;border:1px solid #bacbda;border-radius:6px}#page-satis .s156-known-result{padding:9px 14px;border-bottom:1px solid #dbe5ee}'+
    '#page-satis .page-desc,#page-satis .s79-stats,#page-satis .s82-report-controls,#page-satis #s82Report,#page-satis #s83CommitBtn,#page-satis .s150-description-banner,#page-satis .s102-review button{display:none!important}#page-satis .sales-shell>div[style*="font-size:9.5px"]{display:none}#page-satis .s156-row-actions button:disabled{opacity:.35;cursor:default}#page-satis .s151-warning{padding:8px 10px;font-size:11px}#page-satis .s150-line-review{font-size:11px}'+
    '@media(max-width:800px){#page-satis .s156-searchbar{flex-wrap:wrap}#page-satis #s156Search{flex-basis:65%}#page-satis .s156-memory-fields{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){#page-satis .s79-company button{transition:none}}';document.head.append(s156Style);
  // Compact upload/search controls, shared by every company.
  var s157Toolbar=document.createElement('div');s157Toolbar.className='s157-upload-search';
  drop.parentNode.insertBefore(s157Toolbar,drop);
  s157Toolbar.appendChild(drop);s157Toolbar.appendChild(s156SearchBar);
  s157Toolbar.appendChild(document.getElementById('s156SaveAll'));
  drop.setAttribute('role','button');drop.setAttribute('tabindex','0');
  drop.setAttribute('aria-label','PDF Sürükle/Bırak Tıklayıp Seç');
  drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
  document.getElementById('s156Search').placeholder='VKN, Cari Adı, Kod veya Açıklama Ara..';
  var s157Dialog=document.createElement('dialog');s157Dialog.id='s157SearchDialog';
  s157Dialog.setAttribute('aria-label','Fatura Ara');
  s157Dialog.innerHTML='<form id="s157SearchForm"><input id="s157SearchInput" type="search" placeholder="VKN, Cari Adı, Kod veya Açıklama Ara.." aria-label="VKN, Cari Adı, Kod veya Açıklama Ara" autocomplete="off"><button type="submit" class="s79-btn">Ara</button><button id="s157SearchClose" type="button" class="s79-btn" aria-label="Aramayı Kapat">×</button></form>';
  page.appendChild(s157Dialog);
  function s157OpenSearch(){var field=document.getElementById('s157SearchInput');field.value=state.search||'';if(!s157Dialog.open)s157Dialog.showModal();field.focus();field.select();}
  function s157SubmitSearch(e){e.preventDefault();var query=document.getElementById('s157SearchInput').value;s157Dialog.close();s156Search(query);var target=document.getElementById(document.getElementById('s151MemoryPanel').hidden?'s79List':'s151MemoryPanel');if(target&&target.scrollIntoView)target.scrollIntoView({block:'start'});}
  document.getElementById('s157SearchForm').addEventListener('submit',s157SubmitSearch);
  document.getElementById('s157SearchClose').addEventListener('click',function(){s157Dialog.close();});
  s157Dialog.addEventListener('keydown',function(e){if(e.key==='Escape'&&s157Dialog.open){e.preventDefault();e.stopPropagation();s157Dialog.close();}},true);
  s157Dialog.addEventListener('cancel',function(e){e.preventDefault();if(s157Dialog.open)s157Dialog.close();});
  s157Dialog.addEventListener('click',function(e){if(e.target===s157Dialog){var rect=s157Dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)s157Dialog.close();}});
  var s157Style=document.createElement('style');s157Style.textContent=
    '#page-satis .s157-upload-search{display:flex;align-items:center;gap:16px;flex:0 0 100%;min-width:0;flex-wrap:wrap}'+
    '#page-satis #s79Drop{flex:0 0 270px;width:270px;box-sizing:border-box;min-height:216px;padding:15px 18px;align-items:flex-start;text-align:left;border-radius:10px}'+
    '#page-satis #s79Drop strong{font-size:13px}#page-satis #s79Drop span{font-size:11px}'+
    '#page-satis .s156-searchbar{flex:0 1 auto;width:auto;max-width:100%;flex-wrap:nowrap;gap:6px}'+
    '#page-satis #s156Search{flex:0 1 285px;width:285px;min-width:0;box-sizing:border-box;font-size:13px;padding:11px 10px}'+
    '#page-satis #s156Search::placeholder,#s157SearchInput::placeholder{color:#8b97a5;opacity:1}'+
    '#page-satis #s157SearchDialog{padding:14px;border:1px solid #cbd6e1;border-radius:12px;background:#fff;color:#17324f;box-shadow:0 15px 55px #17324f33;width:420px;max-width:calc(100vw - 32px);box-sizing:border-box;margin:15vh auto auto}'+
    '#s157SearchDialog::backdrop{background:#142e4b33}#s157SearchForm{display:flex;align-items:center;gap:7px}#s157SearchInput{flex:1;min-width:0;padding:11px 10px;border:1px solid #b5c7d8;border-radius:8px;font:inherit;font-size:13px;box-sizing:border-box}'+
    '#page-satis #s156Search:focus,#s157SearchInput:focus{outline:2px solid #498ab8;outline-offset:2px}'+
    '@media(max-width:600px){#page-satis .s157-upload-search{gap:10px}#page-satis #s79Drop{flex-basis:250px;width:250px}#page-satis #s156Search{width:285px;flex-basis:285px}#page-satis .s157-upload-search>.s156-save-all{margin-left:0}}';
  document.head.append(s157Style);

  s156LoadWork();s156Ready=true;s156SavedStamp=s153Storage.getItem('fc156_file_stamp')||s156Stamp(s156FileValues());
  s156RenderCompanyButtons();switchSalesCompany(activeCompany);
  if(window.addEventListener)window.addEventListener('pagehide',s156Persist);

})();
