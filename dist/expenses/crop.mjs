// The crop is only a display suggestion; the original document is never altered.
export function receiptCropFromTSV(tsv,width,height){
  if(!width||!height||typeof tsv!=='string')return null;
  const words=[];for(const row of tsv.split(/\r?\n/).slice(1)){const a=row.split('\t');if(a.length<12)continue;const x=Number(a[6]),y=Number(a[7]),w=Number(a[8]),h=Number(a[9]),confidence=Number(a[10]),text=(a.slice(11).join(' ')||'').trim();if(text&&confidence>=25&&[x,y,w,h].every(Number.isFinite)&&w>0&&h>0)words.push({x,y,w,h,confidence,text:text.toLocaleUpperCase('tr-TR').replace(/İ/g,'I').replace(/^[^A-Z]+|[^A-Z]+$/g,'')});}
  if(words.length<8)return null;
  const totals=words.filter(w=>w.confidence>=35&&/^(TOPLAM|GENEL)$/.test(w.text)),credit=words.filter(w=>w.confidence>=35&&/^(KREDI)$/.test(w.text));
  const candidates=credit.filter(c=>totals.some(t=>t.y<c.y&&c.y-t.y<height*.45)&&c.y>height*.25).sort((a,b)=>a.y-b.y);if(candidates.length!==1)return null;
  const line=candidates[0],visible=words.filter(w=>w.y<=line.y+line.h*.75),xs=visible.map(w=>w.x),rights=visible.map(w=>w.x+w.w),ys=visible.map(w=>w.y);
  const left=Math.max(0,Math.min(...xs)-width*.05),right=Math.min(width,Math.max(...rights)+width*.05),top=Math.max(0,Math.min(...ys)-height*.08),bottom=Math.min(height,line.y+line.h+height*.035);
  if(right-left<width*.18||bottom-top<height*.25||bottom<=top||right<=left)return null;
  return {x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height};
}
