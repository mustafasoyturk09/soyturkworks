/* Dashboard adapters never combine the Excel and İzibiz registers. */
(() => {
  'use strict';
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function day(value) {
    const s=String(value??''),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/),t=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if(!m&&!t)return '';
    const y=+(m?m[1]:t[3]),mo=+(m?m[2]:t[2]),d=+(m?m[3]:t[1]),date=new Date(Date.UTC(y,mo-1,d));
    return y>=1900&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  }
  function monthRange(month) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!day(month+'-01'))throw Error('Geçerli bir ay seçin.');
    const [y,m]=month.split('-').map(Number);
    return {start:month+'-01',end:month+'-'+new Date(Date.UTC(y,m,0)).getUTCDate()};
  }
  function range(start,end) {
    if(!day(start)||!day(end)||start>end)throw Error('Başlangıç tarihi bitişten sonra olamaz; tarihleri kontrol edin.');
    return {start,end};
  }
  function previous(period) {
    const full=monthRange(period.start.slice(0,7));
    if(full.start===period.start&&full.end===period.end){const d=new Date(period.start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return monthRange(d.toISOString().slice(0,7));}
    const n=(Date.parse(period.end)-Date.parse(period.start))/86400000+1,end=new Date(Date.parse(period.start)-86400000).toISOString().slice(0,10);
    return {start:new Date(Date.parse(end)-(n-1)*86400000).toISOString().slice(0,10),end};
  }
  const within=(value,period)=>{const d=day(value);return !!d&&d>=period.start&&d<=period.end;};
  const norm=v=>String(v??'').replace(/\s+/g,'').toLocaleUpperCase('tr-TR');
  function invoices(rows,period) {
    const unique=new Map();
    for(const row of rows||[])if(norm(row.fatno)&&within(row.tarih,period))unique.set(norm(row.fatno),row);
    const list=[...unique.values()];
    return {rows:list,new:list.filter(r=>!r.islendi&&!r.isRet).length,processed:list.filter(r=>r.islendi&&!r.isRet).length,returned:list.filter(r=>r.isRet).length,foreign:list.filter(r=>r.birim&&!['TRY','TL','₺'].includes(norm(r.birim))).length};
  }
  function change(current,prior) {return prior>0?Math.round((current-prior)/prior*100):null;}
  function sales(records,company,period) {
    const rows=records.filter(r=>(!r.company||r.company===company)&&within(r.tarih,period));
    // The sales history contains the existing module's validated TL total.
    const valid=rows.every(r=>typeof r.tutar==='number'&&Number.isFinite(r.tutar));
    return {rows,total:valid?rows.reduce((sum,r)=>sum+r.tutar,0):null};
  }
  function read(storage,key,validate,fallback) {
    const raw=storage.getItem(key);if(raw===null)return fallback;
    const value=JSON.parse(raw);if(!validate(value))throw Error('Kayıt okunamadı: '+key);return value;
  }
  globalThis.SWHomeModel=Object.freeze({today,day,monthRange,range,previous,within,invoices,change,sales,read});
})();
