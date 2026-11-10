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
    const results=[];
    for(const [index,psm] of [6,3].entries()){
      self.postMessage({progress:(index+1)+'/2 · Metin ve tutarlar okunuyor…'});
      if(index){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),v=pixels.data;for(let i=0;i<v.length;i+=4){const g=Math.max(0,Math.min(255,(v[i]*.299+v[i+1]*.587+v[i+2]*.114-128)*1.25+128));v[i]=v[i+1]=v[i+2]=g;}ctx.putImageData(pixels,0,0);}
      const bytes=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      mod.FS.writeFile('/input',bytes);api.SetPageSegMode(psm);if(api.SetImageFile(1,0)===1)continue;api.Recognize(null);
      results.push({text:api.GetUTF8Text(),confidence:api.MeanTextConf()});
    }
    if(!results.length)throw Error('Fotoğraf okunamadı. Daha net ve düz bir çekim dene.');
    results.sort((a,b)=>b.confidence-a.confidence);const best=results[0];
    // Retain disagreements rather than treating confidence as proof of accuracy.
    self.postMessage({result:{...best,alternatives:results.map(r=>r.text)}});
  }catch(e){self.postMessage({error:e.message||'Fotoğraf okunamadı.'});}
};
