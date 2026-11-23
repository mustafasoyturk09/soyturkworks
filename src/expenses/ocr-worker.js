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
    const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale))),ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let paper=null;try{const {receiptPaperFromPixels}=await import('/expenses/crop.mjs');const ratio=Math.min(1,600/Math.max(canvas.width,canvas.height)),small=new OffscreenCanvas(Math.max(1,Math.round(canvas.width*ratio)),Math.max(1,Math.round(canvas.height*ratio))),context=small.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0,small.width,small.height);paper=receiptPaperFromPixels(context.getImageData(0,0,small.width,small.height).data,small.width,small.height);}catch{}
    const results=[];
    for(const [index,psm] of [6,3].entries()){
      self.postMessage({progress:(index+1)+'/2 · Metin ve tutarlar okunuyor…'});
      if(index){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),v=pixels.data;for(let i=0;i<v.length;i+=4){const g=Math.max(0,Math.min(255,(v[i]*.299+v[i+1]*.587+v[i+2]*.114-128)*1.25+128));v[i]=v[i+1]=v[i+2]=g;}ctx.putImageData(pixels,0,0);}
      const bytes=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      mod.FS.writeFile('/input',bytes);api.SetPageSegMode(psm);if(api.SetImageFile(1,0)===1)continue;api.Recognize(null);
      const tsv=api.GetTSVText(0);let crop=null;try{const {receiptCropFromTSV}=await import('/expenses/crop.mjs');crop=receiptCropFromTSV(tsv,canvas.width,canvas.height);}catch{}
      results.push({text:api.GetUTF8Text(),confidence:api.MeanTextConf(),crop,...(data.includeLayout?{tsv,width:canvas.width,height:canvas.height}:{})});
    }
    if(!results.length)throw Error('Fotoğraf okunamadı. Daha net ve düz bir çekim dene.');
    let headerText='';
    if(!data.includeLayout){
      try{
        self.postMessage({progress:'Firma unvanı ayrıca okunuyor…'});
        const x=paper?Math.floor(paper.x*canvas.width):0,y=paper?Math.floor(paper.y*canvas.height):0,w=paper?Math.ceil(paper.width*canvas.width):canvas.width,h=paper?Math.ceil(paper.height*canvas.height*.38):Math.ceil(canvas.height*.38),factor=Math.min(2,2800/Math.max(w,h));
        const header=new OffscreenCanvas(Math.max(1,Math.round(w*factor)),Math.max(1,Math.round(h*factor)));header.getContext('2d').drawImage(canvas,x,y,w,h,0,0,header.width,header.height);
        mod.FS.writeFile('/input',new Uint8Array(await(await header.convertToBlob({type:'image/png'})).arrayBuffer()));api.SetPageSegMode(6);if(api.SetImageFile(1,0)!==1){api.Recognize(null);headerText=api.GetUTF8Text();}
      }catch{}
    }
    results.sort((a,b)=>b.confidence-a.confidence);const best=results[0],textCrop=results.find(r=>r.crop)?.crop;if(paper){if(textCrop&&textCrop.y+textCrop.height>paper.y+paper.height*.35&&textCrop.y+textCrop.height<paper.y+paper.height)paper.height=textCrop.y+textCrop.height-paper.y;best.crop=paper;}else if(textCrop)best.crop={...textCrop,v:2};
    // Retain disagreements rather than treating confidence as proof of accuracy.
    self.postMessage({result:{...best,headerText,alternatives:results.map(r=>r.text)}});
  }catch(e){self.postMessage({error:e.message||'Fotoğraf okunamadı.'});}
};
