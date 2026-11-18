// [TINIX] 'subject' = khung tách nền (đưa ảnh vào → tự tách nền + thêm viền, xem subject-fill.ts)
export function photoRole(w:any):'main'|'subject'|'linked'|'decoration' { return w.linkedPhotoId?'linked':w.slot?(w.templateRole==='subject'?'subject':'main'):'decoration' }
export function templatePhotoStatus(layers:any[]) {
 const images=layers.filter(w=>w.type==='w-image')
 const frames=images.filter(w=>w.slot&&!w.linkedPhotoId&&!w.hidden)
 const issues:Array<{uuid:string;message:string}>=[]
 for(const w of images.filter(w=>w.linkedPhotoId)) {
  const source=images.find(s=>s.uuid===w.linkedPhotoId)
  if(!source||source.linkedPhotoId||!source.slot||source.hidden)issues.push({uuid:w.uuid,message:`${w.name||'Nền liên kết'}: khung chính bị thiếu, bị ẩn hoặc không còn là ảnh chính.`})
 }
 return {count:frames.length,linked:images.filter(w=>w.linkedPhotoId).length,issues}
}
