// Arrival is independent from accounting completion and the portal's reply.
export function recentInvoiceDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-10);return d.toISOString().slice(0,10);}
export function invoiceState(row,date){
  if(row.isRet)return 'rejected';
  if(row.done)return 'done';
  return row.arrivalState==='new'&&(!date||row.tarih>=recentInvoiceDate(date))?'new':'waiting';
}
export function invoiceStateLabel(row,date){return {new:'YENİ GELEN',waiting:'BEKLENİYOR',done:'İŞLENDİ',rejected:'REDDEDİLDİ'}[invoiceState(row,date)];}
