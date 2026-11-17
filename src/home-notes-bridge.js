// This bridge runs inside the existing Notes closure. It preserves its rich
// editor, backup/recovery and reminder engine without exposing a separate page.
function homeTransaction(change){
  if(nt145StorageBlocked)throw Error('Not kaydı okunamadı. Yedekten ekle ile kurtarın; mevcut kayıt korunuyor.');
  const raw=window.SWWorkspace.storage.getItem(key);
  if(raw&&raw!==lastSaved){const fresh=nt145ReadNotes(raw);notes=fresh.notes;theme=fresh.theme;lastSaved=JSON.stringify({version:1,theme,notes});}
  const before=structuredClone(notes);
  try{change();if(!save())throw Error('Not kaydedilemedi. Mevcut kayıt korundu.');render();}
  catch(error){notes=before;throw error;}
}
window.SWHomeNotes=Object.freeze({
  list(){
    if(nt145StorageBlocked)throw Error('Notlar okunamadı; mevcut kayıt korunuyor.');
    const raw=window.SWWorkspace.storage.getItem(key);
    if(raw&&raw!==lastSaved){const fresh=nt145ReadNotes(raw);notes=fresh.notes;theme=fresh.theme;lastSaved=JSON.stringify({version:1,theme,notes});}
    return structuredClone(notes);
  },
  put(value){homeTransaction(()=>{
    const old=notes.find(n=>n.id===value.id),n={paper:'cream',ink:'black',category:'work',finish:'strike',created:Date.now(),burn:false,ack:false,...old,...value};
    if(!valid(n))throw Error('Not bilgilerini kontrol edin.');
    if(old?.title!==n.title)delete n.titleRuns;if(old?.body!==n.body)delete n.bodyRuns;if(old?.due!==n.due)n.ack=false;
    const index=notes.findIndex(x=>x.id===n.id);if(index<0)notes.push(normalize(n));else notes[index]=normalize(n);
  });},
  toggle(id,done){homeTransaction(()=>{const n=notes.find(n=>n.id===id);if(!n)throw Error('Not artık mevcut değil.');n.done=done;});},
  remove(id){homeTransaction(()=>{notes=notes.filter(n=>n.id!==id);});},
  edit(id){nt127Open(id);}
});
