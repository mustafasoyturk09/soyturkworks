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
// Only accept a clearly separated, light paper region; leave uncertain photos intact.
export function receiptPaperFromPixels(data,width,height){
  if(!data||width<20||height<20||data.length<width*height*4)return null;
  const n=width*height,seen=new Uint8Array(n),queue=new Int32Array(n);let best=null;
  const paper=i=>{const k=i*4,r=data[k],g=data[k+1],b=data[k+2];return r*.299+g*.587+b*.114>=145&&Math.max(r,g,b)-Math.min(r,g,b)<80;};
  for(let start=0;start<n;start++){if(seen[start]||!paper(start))continue;let head=0,tail=0,minX=width,minY=height,maxX=0,maxY=0;queue[tail++]=start;seen[start]=1;
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const j of [x?i-1:-1,x+1<width?i+1:-1,y?i-width:-1,y+1<height?i+width:-1])if(j>=0&&!seen[j]){seen[j]=1;if(paper(j))queue[tail++]=j;}}
    const w=maxX-minX+1,h=maxY-minY+1,area=w*h;if(h>w*1.25&&area>n*.03&&area<n*.9&&tail/area>.48&&(!best||tail>best.count))best={minX,minY,maxX,maxY,count:tail};
  }
  if(!best)return null;const pad=Math.max(2,Math.round(Math.min(width,height)*.012)),left=Math.max(0,best.minX-pad),top=Math.max(0,best.minY-pad),right=Math.min(width,best.maxX+1+pad),bottom=Math.min(height,best.maxY+1+pad);
  return {x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height,v:2};
}
