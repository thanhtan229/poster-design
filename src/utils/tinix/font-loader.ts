import {useFontStore} from '@/common/methods/fonts'
import {readFontProfile,fontDescriptors,FontProfile} from '../../../shared/font-profile'
type FontRef={id?:number;value:string;url?:string;technical?:string}
const loads=new Map<string,Promise<void>>()
let catalog:Promise<void>|null=null
async function initCatalog(){if(useFontStore.list.length)return;if(!catalog)catalog=useFontStore.init().finally(()=>{catalog=null});await catalog}
export function fontRenderInfo(font:FontRef):{url:string;profile:FontProfile|null} {
 const row=useFontStore.list.find(f=>(font.id&&f.id===font.id&&f.value===font.value)||f.value===font.value)
 const profile=readFontProfile(row?row.technical:font.technical)
 return {url:profile?.local_url||row?.url||font.url||'',profile}
}
/** One file/descriptor registration, shared by measuring, editor and PNG render. Failed loads may be retried. */
export async function loadLibraryFont(font:FontRef):Promise<void> {
 if(!font.value)return
 await initCatalog();const {url,profile}=fontRenderInfo(font);if(!url)return
 const descriptors=fontDescriptors(profile); const key=JSON.stringify([font.value,url,descriptors])
 if(loads.has(key))return loads.get(key)!
 const pending=(async()=>{for(const d of descriptors){const face=new FontFace(font.value,`url(${JSON.stringify(url)})`,d);await face.load();document.fonts.add(face)}})()
 loads.set(key,pending)
 try{await pending}catch(e){loads.delete(key);throw e}
}
export function fontFaceCss(font:FontRef):string {
 const {url,profile}=fontRenderInfo(font);if(!url)return ''
 return fontDescriptors(profile).map(d=>`@font-face{font-family:${JSON.stringify(font.value)};src:url(${JSON.stringify(url)});font-weight:${d.weight};font-style:${d.style};font-stretch:${d.stretch};}`).join('\n')
}
