import * as pdfjs from '../assets/vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../assets/vendor/pdf.worker.min.mjs',import.meta.url).href;
window.pdfjsLib={...pdfjs,getDocument(source){
  let options=typeof source==='string'||source instanceof URL?{url:String(source)}:source instanceof ArrayBuffer||ArrayBuffer.isView(source)?{data:source}:source;
  return pdfjs.getDocument({...options,isEvalSupported:false});
}};
