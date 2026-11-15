/** Shared image appearance for editor, preview and PNG rendering. Values use document pixels. */
export type ImageEffects = { grayscale: boolean; blur: number; brightness: number; contrast: number; saturation: number; border: number; borderColor: string; shadow: number; grain: number; paper: number }
export const defaultImageEffects: ImageEffects = { grayscale:false, blur:0, brightness:100, contrast:100, saturation:100, border:0, borderColor:'#ffffff', shadow:0, grain:0, paper:0 }
export function imageEffects(w:any): ImageEffects { return {...defaultImageEffects,...w.effects} }
export function imageFilterStyle(w:any) {
 const e=imageEffects(w), blur=Math.max(0,Number(e.blur)||0)
 return {filter:`grayscale(${e.grayscale?1:0}) brightness(${e.brightness}%) contrast(${e.contrast}%) saturate(${e.saturation}%) blur(${blur}px)`,scale:blur?String(1+6*blur/Math.max(1,Math.min(w.width,w.height))):undefined}
}
export function imageFrameStyle(w:any) { const e=imageEffects(w);return {boxShadow:e.shadow?`0 ${e.shadow/3}px ${e.shadow}px rgba(0,0,0,.3)`:undefined,borderRadius:(w.radius||0)+'px'} }
export function resolveLinkedImage(w:any,layers:any[]):any {
 const seen=new Set<string>(); let source=w
 while(source.linkedPhotoId && !seen.has(source.uuid)){seen.add(source.uuid);const next=layers.find(x=>x.uuid===source.linkedPhotoId&&x.type==='w-image');if(!next)break;source=next}
 return source
}
export function syncLinkedImages(layers:any[]) { for(const w of layers||[]){if(!w.linkedPhotoId)continue;const source=resolveLinkedImage(w,layers);if(source!==w){w.imgUrl=source.imgUrl;if(source.origin)w.origin={...source.origin};else delete w.origin;w.slot=false}} }
export function remapImageLinks(layers:any[],ids:Map<string,string>) { for(const w of layers)if(w.linkedPhotoId&&ids.has(String(w.linkedPhotoId)))w.linkedPhotoId=ids.get(String(w.linkedPhotoId)) }
export function textureUrl(paper=false) { return 'url("data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${paper?'.09 .65':'.85'}" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".8"/></svg>`)+'")' }
