import {createHash} from 'node:crypto';
import {categories,issues} from '../src/expenses/model.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const MAX_FILE=8*1024*1024,CHUNK=96*1024;
export async function limitedBytes(request,max){
  if(Number(request.headers.get('Content-Length'))>max)fail('Dosya / istek boyutu sınırı aşıldı.',413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const pieces=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();fail('Dosya / istek boyutu sınırı aşıldı.',413);}pieces.push(value);}
  const result=new Uint8Array(length);let offset=0;for(const p of pieces){result.set(p,offset);offset+=p.length;}return result;
}
function cleanReceipt(input){
  if(!input||typeof input!=='object'||!Array.isArray(input.lines)||input.lines.length>40)fail('Fiş satırları geçersiz (en fazla 40).');
  const out={};for(const [key,max] of Object.entries({seller:200,taxId:11,date:10,number:40,currency:3,rawText:18000,error:300}))out[key]=String(input[key]??'').slice(0,max);
  const money=v=>v===null||v===undefined||v===''?null:Number.isSafeInteger(v)&&v>=0&&v<=1e11?v:fail('Tutar geçersiz.');
  out.total=money(input.total);out.vat=money(input.vat);
  out.lines=input.lines.map(l=>({description:String(l.description??'').slice(0,200),category:Object.hasOwn(categories,l.category)?l.category:'other',gross:money(l.gross),vatRate:l.vatRate===null||l.vatRate===undefined?null:typeof l.vatRate==='number'&&Number.isFinite(l.vatRate)&&l.vatRate>=0&&l.vatRate<=100?l.vatRate:fail('KDV oranı geçersiz.')}));
  out.notes=Array.isArray(input.notes)?input.notes.slice(0,12).map(n=>String(n).slice(0,250)):[];
  out.confidence=typeof input.confidence==='number'&&Number.isFinite(input.confidence)?Math.max(0,Math.min(100,input.confidence)):null;
  out.reviewed=input.reviewed===true;out.archived=input.archived===true;out.ocrDone=input.ocrDone===true;
  if(out.reviewed&&issues(out).length)fail('Eksik veya tutarsız alanlar varken fiş onaylanamaz.');
  return out;
}
export class ExpenseStore{
  constructor(storage,company){this.storage=storage;this.company=company;}
  async handle(request){
    const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),action=parts[0],id=parts[1];
    if(action==='list'&&request.method==='GET'){
      const records=[...(await this.storage.list({prefix:'receipt:'})).values()].map(({rawText,...r})=>r);
      return json({company:this.company,receipts:records.sort((a,b)=>b.created-a.created),profiles:await this.storage.get('profiles')||{revision:0,categories:{}}});
    }
    if(action==='profiles'&&request.method==='POST'){
      const body=JSON.parse(new TextDecoder().decode(await limitedBytes(request,16000))),map={};
      for(const key of Object.keys(categories)){const p=body.categories?.[key]||{};map[key]={};for(const field of ['serviceCode','accountCode','costCenter'])map[key][field]=String(p[field]||'').trim().slice(0,60);}
      return this.storage.transaction(async tx=>{const previous=await tx.get('profiles')||{revision:0};if(body.revision!==previous.revision)fail('Eşleştirmeler başka cihazda değişti. Yenileyip tekrar dene.',409);const value={revision:previous.revision+1,categories:map,verified:false};await tx.put('profiles',value);return json(value);});
    }
    if(!/^[a-f0-9]{64}$/.test(id||''))fail('Fiş kimliği geçersiz.');
    if(action==='image'&&request.method==='POST'){
      const bytes=await limitedBytes(request,MAX_FILE);let type;
      if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
      else if(Buffer.from(bytes.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
      else if(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-')type='application/pdf';
      else fail('JPEG, PNG veya PDF seç. HEIC görüntüsünü JPEG olarak paylaş.');
      if(createHash('sha256').update(bytes).digest('hex')!==id)fail('Dosya bütünlüğü doğrulanamadı.');
      return this.storage.transaction(async tx=>{
        const previous=await tx.get('receipt:'+id);if(previous)return json({receipt:previous,duplicate:true});
        const count=await tx.get('count')||0,total=await tx.get('bytes')||0;if(count>=500||total+bytes.length>250*1024*1024)fail('Masraf arşivi sınırına ulaşıldı. Dosyalar korunuyor.',409);
        const chunks=Math.ceil(bytes.length/CHUNK);for(let i=0;i<chunks;i++)await tx.put('image:'+id+':'+i,bytes.slice(i*CHUNK,(i+1)*CHUNK));
        const receipt={id,company:this.company,created:Date.now(),updated:Date.now(),revision:1,source:{type,size:bytes.length,chunks},seller:'',taxId:'',number:'',date:'',currency:'TRY',total:null,vat:null,lines:[],notes:[],rawText:'',reviewed:false,ocrDone:false,archived:false};
        await tx.put('receipt:'+id,receipt);await tx.put('count',count+1);await tx.put('bytes',total+bytes.length);return json({receipt,duplicate:false},201);
      });
    }
    const record=await this.storage.get('receipt:'+id);if(!record)fail('Fiş bulunamadı.',404);
    if(action==='image'&&request.method==='GET'){
      let i=0;const storage=this.storage;return new Response(new ReadableStream({async pull(controller){if(i===record.source.chunks){controller.close();return;}const chunk=await storage.get('image:'+id+':'+i++);if(!chunk){controller.error(Error('Görsel parçası bulunamadı.'));return;}controller.enqueue(chunk);}}),{headers:{'Content-Type':record.source.type,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(action==='record'&&request.method==='GET')return json(record);
    if(action==='record'&&request.method==='POST'){
      const body=JSON.parse(new TextDecoder().decode(await limitedBytes(request,64000))),clean=cleanReceipt(body);
      return this.storage.transaction(async tx=>{const current=await tx.get('receipt:'+id);if(current.revision!==body.revision)fail('Bu fiş başka cihazda değişti. Düzenlemeni yedekle, sonra yeniden aç.',409);const value={...current,...clean,revision:current.revision+1,updated:Date.now()};await tx.put('receipt:'+id,value);return json(value);});
    }
    fail('İşlem bulunamadı.',404);
  }
}
