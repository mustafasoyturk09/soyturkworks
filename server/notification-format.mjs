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
