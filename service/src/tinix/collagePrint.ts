import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDesign } from '../db/designs'
import { planCollagePrint, markCorners } from '../../../src/utils/tinix/collage-print'
import { alphaFromRenders, buildCutSvg } from './cutPaths'
import { filePath, drawLink, serviceLink } from '../configs'
import { queueRun } from '../utils/node-queue'
import { MAX_EXPORT_SIDE, MAX_EXPORT_PIXELS } from '../utils/export-limits'
import { capturePagePixels, saveScreenshot, warmTrimBrowser } from '../utils/download-single' // [TINIX]
import type { RenderRegion } from '../utils/download-single' // [TINIX]
import {preflightPrint} from './printPreflight'
import {archiveApprovedPrint} from './approvedPrints'
import {createPrintArtifactCache, printArtifactKey} from './printArtifactCache' // [TINIX]
const sharp=require('sharp')
const router=express.Router(),jobs=new Map<string,any>()
const artifacts=createPrintArtifactCache()
// [TINIX] Detect frontend rebuilds even when the service stays running.
function sheetKey(job:any, layout:any, options:unknown){
 if(!job.designId)return undefined
 const origin=new URL(drawLink).origin
 if(origin!==new URL(serviceLink).origin)return undefined
 try{
  const renderer=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(process.cwd(),'../dist/index.html'))).digest('hex')
  return printArtifactKey(layout,[job.designId,job.dpi,options],filePath,origin,renderer)
 }catch(_){return undefined}
}
function oncePerJob<T>(job:any,key:string,build:()=>Promise<T>):Promise<T>{
 const pending:Map<string,Promise<T>>=job.pending||(job.pending=new Map())
 const existing=pending.get(key)
 if(existing)return existing
 const work=build().finally(()=>pending.delete(key))
 pending.set(key,work)
 return work
}
function dispose(id:string){const job=jobs.get(id);if(job)for(const file of Object.values(job.images||{}) as string[])try{fs.unlinkSync(file)}catch(_){};jobs.delete(id)}
function lookup(id:string){const job=jobs.get(id);if(!job||job.expires<Date.now()){dispose(id);throw new Error('Bộ xuất đã hết hạn. Hãy xuất lại.')}return job}
router.post('/api/tinix/collage-preview',(req:any,res:any)=>{
 try{
  for(const [id,j] of jobs)if(j.expires<Date.now())dispose(id)
  if(jobs.size>=10)throw new Error('Đang có nhiều bộ xuất. Hãy chờ rồi thử lại.')
  const layout=req.body.layout
  const plan=planCollagePrint(layout,{marginMm:0,gapMm:0})
  const id=crypto.randomBytes(16).toString('hex')
  jobs.set(id,{layouts:[plan.layouts.at(-1)],names:['thanh_pham.jpg'],dpi:plan.dpi,images:{},expires:Date.now()+30*60*1000})
  res.json({id})
 }catch(e){res.status(400).json({message:(e as Error).message})}
})
// [TINIX] Hide the Chrome launch time while the collage editor is opening.
router.post('/api/tinix/trim-renderer/warmup',async(_req:any,res:any)=>{
 try{await warmTrimBrowser();res.sendStatus(204)}
 catch(_){res.sendStatus(503)}
})
// Xuất một trang bất kỳ (từ dữ liệu gửi lên) thành PNG/JPG — không cần lưu thiết kế vào CSDL.
router.post('/api/tinix/export-render',async(req:any,res:any)=>{
 let temporary='',jobId=''
 try{
  const layout=req.body&&req.body.layout,format=req.body&&req.body.format==='jpg'?'jpg':'png'
  if(!layout||!layout.global||!Array.isArray(layout.layers)||layout.layers.length>2000)throw new Error('Dữ liệu trang không hợp lệ')
  const width=Math.round(Number(layout.global.width)),height=Math.round(Number(layout.global.height))
  if(!(width>0&&height>0)||width>MAX_EXPORT_SIDE||height>MAX_EXPORT_SIDE||width*height>MAX_EXPORT_PIXELS)throw new Error('Kích thước trang vượt giới hạn xuất ảnh')
  // [TINIX] A preview region uses page-space pixels and leaves the page layout intact.
  let region:RenderRegion|undefined
  if(req.body.region!==undefined){
   const candidate=req.body.region
   if(format!=='png'||!candidate||typeof candidate!=='object'||
    ![candidate.x,candidate.y,candidate.width,candidate.height].every(Number.isSafeInteger)||
    candidate.x<0||candidate.y<0||candidate.width<1||candidate.height<1||
    candidate.x+candidate.width>width||candidate.y+candidate.height>height){
    res.status(400).json({message:'Vùng xem trước phải nằm trong trang PNG.'});return
   }
   const {x,y,width:regionWidth,height:regionHeight}=candidate
   region={x,y,width:regionWidth,height:regionHeight}
  }
  const dpi=Math.min(1200,Math.max(30,Number(layout.global.dpi)||300))
  for(const [id,j] of jobs)if(j.expires<Date.now())dispose(id)
  if(jobs.size>=10)throw new Error('Đang có nhiều bộ xuất. Hãy chờ rồi thử lại.')
  // [TINIX] Trim needs native alpha at 1:1, with no matte, disk file or JPEG conversion.
  const trimAlpha=format==='png'&&req.body.trimAlpha===true
  const renderLayout=trimAlpha?{...layout,global:{...layout.global,backgroundColor:'transparent',backgroundImage:'',backgroundGradient:''}}:layout
  jobId=crypto.randomBytes(16).toString('hex');jobs.set(jobId,{layouts:[renderLayout],names:['trang'],dpi,images:{},expires:Date.now()+10*60*1000})
  const url=`${drawLink}?exportJob=${jobId}&index=0&hq=1&relaxed=1`
  // [TINIX] A disconnected crop preview releases its render slot for the group check.
  const cropPreview=format==='png'&&!trimAlpha&&req.body.cropPreview===true
  if(trimAlpha||region||cropPreview){
   const sign=crypto.randomBytes(16).toString('hex');req._queueSign=sign
   const previewAbort=cropPreview?new AbortController():undefined
   const cancelPreview=()=>{if(previewAbort)previewAbort.abort()}
   if(previewAbort){
    if(res.destroyed)cancelPreview()
    else res.once('close',cancelPreview)
   }
   try{
    const buffer=await queueRun(capturePagePixels,trimAlpha?url+'&trimAlpha=1':url,{width,height,region,signal:previewAbort&&previewAbort.signal},sign)
    if(!res.headersSent&&!res.destroyed)res.type('png').send(buffer)
   }finally{if(previewAbort)res.removeListener('close',cancelPreview)}
   return
  }
  const directory=path.join(filePath,'print-exports');fs.mkdirSync(directory,{recursive:true})
  const sign=crypto.randomBytes(16).toString('hex');temporary=path.join(directory,sign+'.png');req._queueSign=sign
  await queueRun(saveScreenshot,url,{width,height,path:temporary,prevent:true},sign)
  const image=sharp(temporary)
  const buffer=format==='jpg'?await image.flatten({background:'#ffffff'}).toColourspace('srgb').jpeg({quality:100,chromaSubsampling:'4:4:4'}).withMetadata({density:dpi}).toBuffer():await image.withMetadata({density:dpi}).png().toBuffer()
  if(!res.headersSent)res.type(format==='jpg'?'jpeg':'png').send(buffer)
 }catch(e){if(!res.headersSent&&!res.destroyed)res.status(500).json({message:(e as Error).message,issues:(e as any).issues||[]})}
 finally{if(jobId)dispose(jobId);if(temporary)try{fs.unlinkSync(temporary)}catch(_){} }
})
router.post('/api/tinix/collage-print', async(req:any,res:any)=>{
 try{
  for(const [id,j] of jobs)if(j.expires<Date.now())dispose(id)
  if(jobs.size>=10)throw new Error('Đang có nhiều bộ xuất. Hãy chờ rồi thử lại.')
  const saved=getDesign(Number(req.body.designId),0);if(!saved)throw new Error('Không tìm thấy thiết kế đã lưu')
  const data=JSON.parse(saved.data),index=Number(req.body.pageIndex)||0
  if(!Array.isArray(data)||!Number.isInteger(index)||!data[index])throw new Error('Trang không hợp lệ')
  // [TINIX] Revalidate prior positions against the current paper, dimensions and gap.
  const plan=planCollagePrint(data[index],req.body.options,req.body.previousPacking)
  const issues=await preflightPrint(data[index])
  if(issues.some(i=>i.severity==='error'))return res.status(400).json({message:'Cần sửa lỗi trước khi xuất.',issues})
  if(plan.layouts.length>52)throw new Error('Bộ xuất vượt 50 tờ cắt. Hãy kiểm tra kích thước các cụm.')
  const id=crypto.randomBytes(16).toString('hex');jobs.set(id,{...plan,designId:Number(req.body.designId),title:saved.title,options:req.body.options,images:{},expires:Date.now()+30*60*1000})
  res.json({id,issues,names:plan.names,widths:plan.layouts.map((l:any)=>l.global.width),heights:plan.layouts.map((l:any)=>l.global.height),dpi:plan.dpi,packing:plan.packing,packingMode:plan.packingMode,retained:plan.retained})
 }catch(e){res.status(400).json({message:(e as Error).message})}
})
router.get('/api/tinix/collage-print/:id/data',(req:any,res:any)=>{
 try{res.json({data:JSON.stringify(lookup(req.params.id).layouts)})}catch(e){res.status(404).json({message:(e as Error).message})}
})
router.delete('/api/tinix/collage-print/:id',(req:any,res:any)=>{dispose(req.params.id);res.json({ok:true})})
router.post('/api/tinix/collage-print/:id/approve',(req:any,res:any)=>{
 try{if(req.body.operatorReviewed!==true||req.body.customerApproved!==true)throw new Error('Cần xác nhận riêng người làm đã xem file và khách đã duyệt.');const job=lookup(req.params.id);const id=archiveApprovedPrint(job,req.params.id,String(req.body.note||'').trim().slice(0,1000));res.json({id})}catch(e){res.status(400).json({message:(e as Error).message})}
})
router.get('/api/tinix/collage-print/:id/image/:index',async(req:any,res:any)=>{
 try{
  const job=lookup(req.params.id),index=Number(req.params.index),layout=job.layouts[index]
  if(!Number.isInteger(index)||!layout)throw new Error('Tờ in không hợp lệ')
  if(job.images[index])return res.setHeader('X-Tinix-Print-Cache','job').type('jpeg').sendFile(job.images[index])
  const produced=await oncePerJob(job,'jpg:'+index,async()=>{
   const directory=path.join(filePath,'print-exports');fs.mkdirSync(directory,{recursive:true})
   const key=sheetKey(job,layout,'jpg')
   const reused=artifacts.get(key)
   const jpeg=reused||await renderJpeg(job,layout,req.params.id,index,req,directory)
   if(!reused&&key===sheetKey(job,layout,'jpg'))artifacts.set(key,jpeg)
   if(jobs.get(req.params.id)!==job)throw new Error('Bộ xuất đã hết hạn. Hãy xuất lại.')
   // Each job owns a complete set of JPG files for approval and cleanup.
   const cached=path.join(directory,req.params.id+'-'+index+'.jpg');fs.writeFileSync(cached,jpeg);job.images[index]=cached
   return {jpeg,reused:!!reused}
  })
  if(!res.headersSent)res.setHeader('X-Tinix-Print-Cache',produced.reused?'hit':'miss').type('jpeg').send(produced.jpeg)
 }catch(e){if(!res.headersSent)res.status(500).json({message:(e as Error).message,issues:(e as any).issues||[]})}
})
async function renderJpeg(job:any,layout:any,id:string,index:number,req:any,directory:string){
 const sign=crypto.randomBytes(16).toString('hex'),temporary=path.join(directory,sign+'.png');req._queueSign=sign
 try{
  await queueRun(saveScreenshot,`${drawLink}?exportJob=${id}&index=${index}&hq=1`,{width:layout.global.width,height:layout.global.height,path:temporary,prevent:true},sign)
  return await sharp(temporary).flatten({background:'#ffffff'}).toColourspace('srgb').jpeg({quality:100,chromaSubsampling:'4:4:4'}).withMetadata({density:job.dpi}).toBuffer() as Buffer
 }finally{try{fs.unlinkSync(temporary)}catch(_){}}
}
// ───────────── Đường cắt laser (SVG) cho từng tờ chi tiết cắt ─────────────
// Dựng tờ cắt (bỏ dấu căn) hai lần trên nền trắng và nền đen → alpha → đường viền lùi vào "giữa viền" → SVG mm 1:1.
async function renderRaw(job:any,layout:any){
 const tmpId=crypto.randomBytes(16).toString('hex'),sign=crypto.randomBytes(16).toString('hex')
 const directory=path.join(filePath,'print-exports');fs.mkdirSync(directory,{recursive:true})
 const temporary=path.join(directory,sign+'.png')
 jobs.set(tmpId,{layouts:[layout],names:['tam.png'],dpi:job.dpi,images:{},expires:Date.now()+10*60*1000})
 try{
  await queueRun(saveScreenshot,`${drawLink}?exportJob=${tmpId}&index=0&hq=1`,{width:layout.global.width,height:layout.global.height,path:temporary,prevent:true},sign)
  return await sharp(temporary).removeAlpha().raw().toBuffer({resolveWithObject:true})
 }finally{dispose(tmpId);try{fs.unlinkSync(temporary)}catch(_){} }
}
router.get('/api/tinix/collage-print/:id/cut/:index',async(req:any,res:any)=>{
 try{
  const job=lookup(req.params.id),index=Number(req.params.index)
  if(!Number.isInteger(index)||index<1||index>job.layouts.length-2)throw new Error('Không phải tờ chi tiết cắt')
  const inset=req.query.inset===undefined?0.3:Number(req.query.inset)
  if(!Number.isFinite(inset)||inset<0||inset>5)throw new Error('Khoảng lùi phải từ 0 đến 5 mm')
  job.cuts=job.cuts||{};const cacheKey=index+':'+inset
  if(job.cuts[cacheKey])return res.setHeader('X-Tinix-Print-Cache','job').type('image/svg+xml').send(job.cuts[cacheKey])
  const layout=job.layouts[index]
  const placements=job.placements.filter((p:any)=>p.sheet===index-1)
  const title=(job.title||'Đường cắt')+' · '+job.names[index]
  const settings=['svg',inset,placements,title]
  const produced=await oncePerJob(job,'svg:'+cacheKey,async()=>{
   const key=sheetKey(job,layout,settings)
   const reused=artifacts.get(key)
   const svg=reused||Buffer.from(await renderCut(job,layout,placements,inset,title))
   if(!reused&&key===sheetKey(job,layout,settings))artifacts.set(key,svg)
   if(jobs.get(req.params.id)!==job)throw new Error('Bộ xuất đã hết hạn. Hãy xuất lại.')
   job.cuts[cacheKey]=svg
   return {svg,reused:!!reused}
  })
  res.setHeader('X-Tinix-Print-Cache',produced.reused?'hit':'miss').type('image/svg+xml').send(produced.svg)
 }catch(e){if(!res.headersSent)res.status(500).json({message:(e as Error).message})}
})
async function renderCut(job:any,layout:any,placements:any[],inset:number,title:string){
  const {width,height}=layout.global
  const variant=(color:string)=>{const v=JSON.parse(JSON.stringify(layout));v.layers=v.layers.filter((l:any)=>!l.printMark);v.global.backgroundColor=color;v.global.backgroundImage='';v.global.backgroundGradient='';return v}
  const white=await renderRaw(job,variant('#ffffff')),black=await renderRaw(job,variant('#000000'))
  if(white.info.width!==width||white.info.height!==height||black.info.width!==width||black.info.height!==height)throw new Error('Ảnh dựng sai kích thước, không dò được đường cắt')
  const alpha=alphaFromRenders(white.data,black.data,width,height,white.info.channels)
  const hasMarks=layout.layers.some((l:any)=>l.printMark)
  const result=buildCutSvg({alpha,width,height,dpi:job.dpi,placements,defaultInsetMm:inset,marks:hasMarks?markCorners(width,height,job.dpi):[],title})
  if(!result.pieces)throw new Error('Không dò được mảnh nào trên tờ này')
  return result.svg
}
export default router
