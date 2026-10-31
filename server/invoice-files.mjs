import {zipSync, unzipSync, Zip, ZipPassThrough, strToU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

export const safeName=value=>String(value||'Firma').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').trim().slice(0,180)||'Firma';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
export const monthLabel=month=>new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z')).replace(/^./,c=>c.toLocaleUpperCase('tr-TR'));
export const trDate=date=>String(date).slice(0,10).split('-').reverse().join('.');
export function folderName(company,month,date){return safeName(company+' '+monthLabel(month)+' Gelen E-Faturalar ('+trDate(date)+')');}
export function excelName(company,month,date){return safeName(company+' '+monthLabel(month)+' - Gelen Faturalar ('+trDate(date)+').xlsx');}

export function unwrapDocument(input,format){
  let bytes=new Uint8Array(input);
  if(bytes[0]===80&&bytes[1]===75){
    const entries=unzipSync(bytes,{filter:file=>{if(file.originalSize>25*1024*1024)throw Error('Belge açıldığında boyut sınırını aşıyor.');return file.name.toLowerCase().endsWith(format==='pdf'?'.pdf':'.xml');}});
    const values=Object.values(entries);if(values.length!==1)throw Error('Arşivde tek bir fatura belgesi doğrulanamadı.');bytes=values[0];
  }
  if(!bytes.length||bytes.length>25*1024*1024)throw Error('Belge boyutu doğrulanamadı.');
  if(format==='pdf'&&!new TextDecoder().decode(bytes.slice(0,5)).startsWith('%PDF-'))throw Error('Geçerli PDF alınamadı.');
  return bytes;
}
export function supplierFromXML(bytes,row,identifier){
  if(bytes.byteLength>8*1024*1024)throw Error('Fatura XML’i otomatik doğrulama sınırını aşıyor.');
  const text=new TextDecoder().decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Fatura XML yapısı desteklenmiyor.');
  const doc=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:true}).parse(text);
  const invoice=doc.Invoice;if(!invoice||String(invoice.ID).trim()!==row.fatno||String(invoice.UUID).trim().toLowerCase()!==row.uuid.toLowerCase())throw Error('Fatura XML numarası veya ETTN bilgisi eşleşmiyor.');
  const party=invoice.AccountingCustomerParty?.Party,ids=[party?.PartyIdentification].flat().filter(Boolean).map(x=>x.ID).flat();
  if(!ids.some(x=>['VKN','TCKN'].includes(x?.['@_schemeID'])&&String(x?.['#text']).trim()===identifier))throw Error('Faturanın alıcı firması doğrulanamadı.');
  const supplier=invoice.AccountingSupplierParty?.Party;
  const title=supplier?.PartyLegalEntity?.RegistrationName||supplier?.PartyName?.Name||[supplier?.Person?.FirstName,supplier?.Person?.FamilyName].filter(Boolean).join(' ');
  if(!title||typeof title!=='string')throw Error('Faturanın tam gönderen unvanı bulunamadı.');
  return title.trim();
}
export function makeExcel(company,month,date,rows){
  const xmlHeader='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const headers=['Fatura No','Tarih','Unvan','Tip','Tutar','Birim','Yanıt','İşlem Durumu'];
  const cell=(value,col,row,style=0)=>typeof value==='number'&&Number.isFinite(value)?'<c r="'+col+row+'" s="'+style+'"><v>'+value+'</v></c>':'<c r="'+col+row+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+escape(value)+'</t></is></c>';
  const title=(company+' '+monthLabel(month)+' GELEN E-FATURALAR ('+trDate(date)+')').toLocaleUpperCase('tr-TR');
  const lines=['<row r="1" ht="54" customHeight="1">'+cell(title,'A',1,1)+'</row>','<row r="2" ht="32" customHeight="1">'+headers.map((h,i)=>cell(h,String.fromCharCode(65+i),2,2)).join('')+'</row>'];
  rows.forEach((r,i)=>{const n=i+3;lines.push('<row r="'+n+'" ht="26" customHeight="1">'+[r.fatno,trDate(r.tarih),r.unvan,r.tip,r.tutar,r.birim,r.yanit,r.done?'İŞLENDİ':r.isRet?'REDDEDİLDİ':'YENİ GELEN'].map((v,j)=>cell(v,String.fromCharCode(65+j),n,j===7?(r.done?4:r.isRet?5:3):j===4?6:0)).join('')+'</row>');});
  const files={
    '[Content_Types].xml':xmlHeader+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':xmlHeader+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':xmlHeader+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="GELEN E-FATURALAR" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':xmlHeader+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':xmlHeader+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+[28,16,85,20,22,14,24,22].map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+lines.join('')+'</sheetData><autoFilter ref="A2:H'+Math.max(2,rows.length+2)+'"/><mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells></worksheet>',
    'xl/styles.xml':xmlHeader+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="14"/><name val="Arial"/></font><font><b/><sz val="28"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+['17283C','FFC000','D5F0E1','F7D5D5'].map(c=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+c+'"/><bgColor indexed="64"/></patternFill></fill>').join('')+'</fills><borders count="1"><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">'+[[0,0,0],[1,0,0],[2,2,0],[0,3,0],[0,4,0],[0,5,0],[0,0,4]].map(([f,fill,num])=>'<xf numFmtId="'+num+'" fontId="'+f+'" fillId="'+fill+'" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>').join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),{level:6});
}
export function streamZip(entries,readChunks){
  let cancelled=false,release=null;
  return new ReadableStream({
    start(controller){
      const zip=new Zip((err,data,final)=>{if(cancelled)return;if(err){cancelled=true;controller.error(err);return;}controller.enqueue(data);if(final)controller.close();});
      (async()=>{try{for(const entry of entries){if(cancelled)return;const file=new ZipPassThrough(entry.name);zip.add(file);for await(const chunk of readChunks(entry.file)){if(cancelled)return;file.push(new Uint8Array(chunk),false);if(controller.desiredSize<=0&&!cancelled)await new Promise(resolve=>{release=resolve;});}file.push(new Uint8Array(),true);}zip.end();}catch(e){if(!cancelled){cancelled=true;controller.error(e);}}})();
    },
    pull(){if(release){const resolve=release;release=null;resolve();}},
    cancel(){cancelled=true;if(release)release();}
  });
}
