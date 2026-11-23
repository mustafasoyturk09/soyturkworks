/* All recognition stays on the user's device. The original image is preserved. */
let engine;
async function initialize(){
  if(engine)return engine;
  importScripts('/expenses/ocr-core.js');
  const mod=await TesseractCore();
  for(const lang of ['tur','eng']){
    const r=await fetch('/expenses/'+lang+'.traineddata');if(!r.ok)throw Error('Okuma bileşeni yüklenemedi. Oturumunu ve bağlantını kontrol et.');
    mod.FS.writeFile(lang+'.traineddata',new Uint8Array(await r.arrayBuffer()));
  }
  const api=new mod.TessBaseAPI();if(api.Init(null,'tur+eng',1)<0)throw Error('Türkçe okuma motoru başlatılamadı.');
  engine={mod,api};return engine;
}
self.onmessage=async({data})=>{
  try{
    if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw Error('Bu tarayıcı fotoğraf okumayı desteklemiyor. Güncel tarayıcı kullan veya alanları elle tamamla.');
    self.postMessage({progress:'Türkçe okuma motoru hazırlanıyor…'});
    const {mod,api}=await initialize(),bitmap=await createImageBitmap(data.blob),scale=Math.min(1.5,2400/Math.max(bitmap.width,bitmap.height));
    let canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale))),ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let paper=null;try{const {receiptPaperFromPixels}=await import('/expenses/crop.mjs');const ratio=Math.min(1,600/Math.max(canvas.width,canvas.height)),small=new OffscreenCanvas(Math.max(1,Math.round(canvas.width*ratio)),Math.max(1,Math.round(canvas.height*ratio))),context=small.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0,small.width,small.height);paper=receiptPaperFromPixels(context.getImageData(0,0,small.width,small.height).data,small.width,small.height);}catch{}
    let originalPaper=null;
    if(paper){
      try{const original=await createImageBitmap(data.blob),x=Math.floor(paper.x*original.width),y=Math.floor(paper.y*original.height),w=Math.min(original.width-x,Math.ceil(paper.width*original.width)),h=Math.min(original.height-y,Math.ceil(paper.height*original.height)),factor=Math.min(2,2600/Math.max(w,h)),cropped=new OffscreenCanvas(Math.max(1,Math.round(w*factor)),Math.max(1,Math.round(h*factor))),context=cropped.getContext('2d',{willReadFrequently:true});context.fillStyle='white';context.fillRect(0,0,cropped.width,cropped.height);context.drawImage(original,x,y,w,h,0,0,cropped.width,cropped.height);original.close();canvas=cropped;ctx=context;originalPaper=paper;paper=null;}catch{}
    }
    const results=[];
    for(const [index,psm] of [6,3].entries()){
      self.postMessage({progress:index?'Eksik bilgiler yeniden kontrol ediliyor…':'Fiş okunuyor…'});
      if(index){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),v=pixels.data;for(let i=0;i<v.length;i+=4){const g=Math.max(0,Math.min(255,(v[i]*.299+v[i+1]*.587+v[i+2]*.114-128)*1.25+128));v[i]=v[i+1]=v[i+2]=g;}ctx.putImageData(pixels,0,0);}
      const bytes=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      mod.FS.writeFile('/input',bytes);api.SetPageSegMode(psm);if(api.SetImageFile(1,0)===1)continue;api.Recognize(null);
      const tsv=api.GetTSVText(0);let crop=null;try{const {receiptCropFromTSV}=await import('/expenses/crop.mjs');crop=receiptCropFromTSV(tsv,canvas.width,canvas.height);}catch{}
      const text=api.GetUTF8Text(),confidence=api.MeanTextConf();results.push({text,confidence,crop});
      const complete=/\b\d{2}[.\/-]\d{2}[.\/-]20\d{2}\b/.test(text)&&/\b(?:TOPLAM|ÖDENECEK)\b/i.test(text)&&/(?:F[İI][ŞS]|FATURA|BELGE)[ \t]*(?:NO|NUMARASI)[ \t.:#-]*\d/i.test(text);
      const header=text.split(/\r?\n/).slice(0,3).join(' '),suspicious=/[A-ZÇĞİÖŞÜ]{3}/.test(header)&&/(?:^|\s)[a-zçğıöşü]{1,2}(?=\s|$)/.test(header);
      if(confidence>=75&&complete&&!suspicious)break;
    }
    if(!results.length)throw Error('Fotoğraf okunamadı. Daha net ve düz bir çekim dene.');
    let headerText='';
    const top=(results[0].text||'').split(/\r?\n/).slice(0,5).join(' ');
    if(/\b(?:T[İI]C|SAN|LTD)\b/i.test(top)&&!/\b(?:ŞT[İI]|ST[İI]|Ş[İI]RKET[İI])\b/i.test(top)){
      try{
        self.postMessage({progress:'Firma unvanı ayrıca okunuyor…'});
        const x=paper?Math.floor(paper.x*canvas.width):0,y=paper?Math.floor(paper.y*canvas.height):0,w=paper?Math.ceil(paper.width*canvas.width):canvas.width,h=paper?Math.ceil(paper.height*canvas.height*.38):Math.ceil(canvas.height*.38),factor=Math.min(2,2800/Math.max(w,h));
        const header=new OffscreenCanvas(Math.max(1,Math.round(w*factor)),Math.max(1,Math.round(h*factor)));header.getContext('2d').drawImage(canvas,x,y,w,h,0,0,header.width,header.height);
        mod.FS.writeFile('/input',new Uint8Array(await(await header.convertToBlob({type:'image/png'})).arrayBuffer()));api.SetPageSegMode(6);if(api.SetImageFile(1,0)!==1){api.Recognize(null);headerText=api.GetUTF8Text();}
      }catch{}
    }
    results.sort((a,b)=>b.confidence-a.confidence);const best=results[0],textCrop=results.find(r=>r.crop)?.crop;if(originalPaper)best.crop=originalPaper;else if(paper){if(textCrop&&textCrop.y+textCrop.height>paper.y+paper.height*.35&&textCrop.y+textCrop.height<paper.y+paper.height)paper.height=textCrop.y+textCrop.height-paper.y;best.crop=paper;}else if(textCrop)best.crop={...textCrop,v:2};
    // Retain disagreements rather than treating confidence as proof of accuracy.
    self.postMessage({result:{...best,headerText,alternatives:results.map(r=>r.text)}});
  }catch(e){self.postMessage({error:e.message||'Fotoğraf okunamadı.'});}
};
