const MONTH_NAMES=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function previousMonthKey(month){
  if(!validMonth(month))return null;
  const date=new Date(month+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()-1);
  return date.toISOString().slice(0,7);
}

export function monthLabel(month){
  if(!validMonth(month))return '';
  return MONTH_NAMES[Number(month.slice(5,7))-1];
}

export function notificationMonthCounts(rows,date){
  const current=String(date||'').slice(0,7);
  if(!validMonth(current))return [];
  const includePrevious=Number(String(date).slice(8,10))<=15;
  const keys=includePrevious?[previousMonthKey(current),current]:[current];
  const eligible=(Array.isArray(rows)?rows:[]).filter(row=>!row?.deletedAt&&!row?.isRet&&typeof row?.tarih==='string');
  return keys.map(month=>({month,count:eligible.filter(row=>row.tarih.startsWith(month)).length}))
    .filter((entry,index)=>index===keys.length-1||entry.count>0);
}

export function normalizeNotificationMonths(value){
  if(!Array.isArray(value))return [];
  const seen=new Set(),months=[];
  for(const item of value){
    const month=item?.month,count=Math.max(0,Math.floor(Number(item?.count)||0));
    if(!validMonth(month)||seen.has(month))continue;
    seen.add(month);months.push({month,count});
    if(months.length===2)break;
  }
  return months.sort((a,b)=>a.month.localeCompare(b.month));
}

export function formatNotificationMonths(value){
  return normalizeNotificationMonths(value).map(item=>monthLabel(item.month)+' · '+item.count+' Yeni Gelen').join('\n');
}

export function formatCompanyNotificationLine(name,value){
  const months=normalizeNotificationMonths(value);
  if(!months.length)return String(name||'Firma')+' · Veri Bekleniyor';
  return String(name||'Firma')+' — '+months.map(item=>monthLabel(item.month)+' '+item.count).join(' · ')+' Yeni Gelen';
}

// A status snapshot includes the whole retained archive, not just the cron window.
export function allNotificationMonthCounts(rows){
  const counts=new Map();
  for(const row of rows||[]){
    const month=String(row?.tarih||'').slice(0,7);
    if(!row?.deletedAt&&!row?.isRet&&validMonth(month))counts.set(month,(counts.get(month)||0)+1);
  }
  return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([month,count])=>({month,count}));
}

export function statusNotifications(company,summary,id,created=Date.now(),note=''){
  const months=summary.allMonthly||summary.monthly||[],parts=[];
  const years=new Set(months.map(m=>m.month.slice(0,4)));
  const lines=months.map(m=>monthLabel(m.month)+(years.size>1?' '+m.month.slice(0,4):'')+' '+m.count+' Adet');
  for(let i=0;i<Math.max(1,lines.length);i+=6)parts.push(lines.slice(i,i+6));
  const time=summary.lastFinished?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(summary.lastFinished)):'Henüz tamamlanmadı';
  return parts.map((part,index)=>({id:createStatusId(id,company.id,index),company:company.id,
    title:company.name+' · Faturalar Anlık Durum'+(parts.length>1?' ('+(index+1)+'/'+parts.length+')':''),
    body:['Gelen: '+(part.join(' · ')||(summary.error?'Güncel durum doğrulanamadı':'Kayıtlı fatura yok')),note,summary.running?'Kontrol sürüyor':summary.error?'Son kontrol tamamlanamadı':'', 'Son kontrol: '+time].filter(Boolean).join('\n'),
    url:'/workspace/'+company.id+'/takip/?view=invoices',kind:'status',tag:'invoice-status-'+company.id+'-'+index,created}));
}
const createStatusId=(id,company,index)=>id+':'+company+':'+index;
