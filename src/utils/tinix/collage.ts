import { nanoid } from 'nanoid'
import api from '@/api'
import templates from '@/assets/data/collage-templates.json'
import pageDefault from '@/store/design/canvas/page-default'
import imageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import { cutoutImage } from '@/components/business/image-cutout/ImageCutout/helper/useCutout'
import config from '@/config'
import {canvasOf,canvasBlob,renderSubject,releaseCanvas} from './cutout-edit'
export type CutoutEngine = 'birefnet' | 'u2net'
async function birefnetCutout(file: File): Promise<Blob> {
  const form = new FormData(); form.append('file', file)
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 200000)
  try {
    const response = await fetch(`${config.SCREEN_URL}/api/tinix/cutout/birefnet`, { method: 'POST', body: form, signal: controller.signal })
    if(!response.ok) { const error = await response.json(); throw new Error(error.message || 'BiRefNet chưa sẵn sàng') }
    if(!response.headers.get('content-type')?.includes('image/png')) throw new Error('BiRefNet trả về ảnh không hợp lệ')
    return await response.blob()
  } finally { clearTimeout(timer) }
}

export const collageTemplates=templates
export const COLLAGE_ID=templates[0].id
export const memoriesBackground=templates[0].background
export function getCollageTemplate(id=COLLAGE_ID){const t=templates.find(t=>t.id===id);if(!t)throw new Error('Mẫu không tồn tại');return t}
export function getSubjectBox(id=COLLAGE_ID){const t=getCollageTemplate(id);return {width:t.subject.maxWidth*t.width/t.designWidth,height:t.subject.maxHeight*t.height/t.designHeight}}
export type CollagePhoto = { url:string; width:number; height:number; borderUrl?:string; edit?:{sourceUrl:string;cutoutUrl:string;mm:number;frame:{left:number;top:number;width:number;height:number}};documentScale?:number }
export async function uploadCollagePhoto(blob: Blob, name: string): Promise<CollagePhoto> {
  const bitmap = await createImageBitmap(blob)
  const width=bitmap.width; const height=bitmap.height; bitmap.close()
  const result:any = await api.material.upload({file:new File([blob],name,{type:blob.type})},()=>{})
  if (!result?.url) throw new Error(result?.msg || 'Không lưu được ảnh')
  return {url:result.url,width,height}
}

export async function extractCollageSubject(file:File,progress:(s:string)=>void,transparent=false,engine:CutoutEngine='birefnet'):Promise<Blob> {
  progress('Đang tách nền local…')
  const blob=transparent?file:engine==='birefnet'?await birefnetCutout(file):await cutoutImage(file,p=>progress(`${p.text} ${p.progress}%`))
  if(!blob)throw new Error('Tách nền thất bại')
  return blob
}
export async function prepareEditedSubject(original:Blob,cutout:Blob,mm:number,documentScale?:number,dpi=300,box=getSubjectBox()):Promise<CollagePhoto> {
  const bitmap=await createImageBitmap(cutout)
  let c:HTMLCanvasElement|undefined; let rendered:ReturnType<typeof renderSubject>|undefined
  try {
    c=canvasOf(bitmap.width,bitmap.height);c.getContext('2d')!.drawImage(bitmap,0,0)
    rendered=renderSubject(c,mm,documentScale,dpi,box)
    const image=await uploadCollagePhoto(await canvasBlob(rendered.image),'collage-subject.png')
    const border=await uploadCollagePhoto(await canvasBlob(rendered.rim),'collage-border.png')
    const raw=await uploadCollagePhoto(cutout,'collage-alpha.png')
    const source=await uploadCollagePhoto(original,original.type==='image/jpeg'?'collage-original.jpg':'collage-original.png')
    return {...image,borderUrl:border.url,edit:{sourceUrl:source.url,cutoutUrl:raw.url,mm,frame:rendered.frame},documentScale:rendered.scale}
  }finally{bitmap.close();releaseCanvas(c);releaseCanvas(rendered?.image);releaseCanvas(rendered?.rim)}
}
export async function prepareCollageSubject(file:File,progress:(s:string)=>void,transparent=false,engine:CutoutEngine='birefnet') {
  return prepareEditedSubject(file,await extractCollageSubject(file,progress,transparent,engine),1.5)
}

export function buildMemoriesLayers(subject:CollagePhoto, photos:CollagePhoto[], title:string, body:string,templateId=COLLAGE_ID):any[] {
  const template=getCollageTemplate(templateId)
  const layers:any[]=[]
  const image=(name:string,url:string,x:number,y:number,w:number,h:number,extra:any={})=>layers.push({...JSON.parse(JSON.stringify(imageSetting)),uuid:nanoid(),name,imgUrl:url,left:x,top:y,width:w,height:h,...extra})
  const text=(name:string,value:string,x:number,y:number,w:number,size:number,color:string,font:any)=>layers.push({...JSON.parse(JSON.stringify(wTextSetting)),uuid:nanoid(),name,text:value,left:x,top:y,width:w,height:size*3,fontSize:size,lineHeight:1.35,textAlign:'center',color,fontClass:font,fontFamily:font.value})
  image('Nền '+template.name+' · cố định',template.background,0,0,template.designWidth,template.designHeight,{lock:true})
  if(photos.length>template.maxPhotos)throw new Error('Số ảnh vượt giới hạn của mẫu')
  photos.forEach((p,i)=>{
    const slot=template.photoSlots[i]
    const printGroup=nanoid()
    image(`Khung kỷ niệm ${i+1}`,template.assets.frame,slot.x,slot.y,slot.w,slot.h,{printGroup,printRole:'base'})
    image(`Ảnh kỷ niệm ${i+1}`,p.url,slot.x+slot.inset,slot.y+slot.inset,slot.w-slot.inset*2,slot.photoHeight,{fit:'cover',slot:true,printGroup,printRole:'base'})
  })
  const spec=template.subject
  const scale=subject.documentScale?subject.documentScale/(template.width/template.designWidth):Math.min(spec.maxWidth/subject.width,spec.maxHeight/subject.height)
  image('Chủ thể · cắt nổi',subject.url,spec.centerX-subject.width*scale/2,spec.bottom-subject.height*scale,subject.width*scale,subject.height*scale,{slot:true,cutoutBorderUrl:subject.borderUrl,cutoutEdit:subject.edit,printRole:'raised'})
  for(const decoration of template.decorations)image(decoration.name,(template.assets as Record<string,string>)[decoration.asset],decoration.x,decoration.y,decoration.w,decoration.h,{printRole:(decoration as any).printRole||'raised'})
  for(const region of template.texts)text(region.name,region.role==='title'?title:body,region.x,region.y,region.w,region.size,region.color,{...region.font})
  return layers
}

export function buildCustomerLayout(subject:CollagePhoto,photos:CollagePhoto[],title:string,body:string,customer:string,templateId=COLLAGE_ID){
 const template=getCollageTemplate(templateId); const layers=buildMemoriesLayers(subject,photos,title,body,templateId)
 const sx=template.width/template.designWidth; const sy=template.height/template.designHeight
 layers.forEach(w=>{w.left*=sx;w.top*=sy;w.width*=sx;w.height*=sy;if(w.fontSize)w.fontSize*=sy})
 return {global:{...JSON.parse(JSON.stringify(pageDefault)),width:template.width,height:template.height,dpi:template.dpi,backgroundColor:template.backgroundColor,backgroundImage:'',backgroundGradient:'',collage:{template:template.id,version:template.version,customer:customer.trim(),printWorkflow:'separate-sheets'}},layers}
}
export async function saveCustomerDesign(subject:CollagePhoto,photos:CollagePhoto[],title:string,body:string,customer:string,templateId=COLLAGE_ID){
 if(!customer.trim())throw new Error('Nhập tên khách hoặc mã đơn')
 const template=getCollageTemplate(templateId); const layout=buildCustomerLayout(subject,photos,title,body,customer,templateId)
 // Deliberately omit id: never update the customer currently open in the editor.
 const result:any=await api.home.saveWorks({title:`${customer.trim()} — ${template.name}`,data:JSON.stringify([layout]),width:template.width,height:template.height})
 if(!result?.id)throw new Error(result?.msg||'Không lưu được thiết kế mới')
 return result.id as number|string
}
