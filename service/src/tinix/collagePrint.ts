import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDesign } from '../db/designs'
import { planCollagePrint, markCorners } from '../../../src/utils/tinix/collage-print'
import { alphaFromRenders, buildCutSvg } from './cutPaths'
import { filePath, drawLink } from '../configs'
import { queueRun } from '../utils/node-queue'
import { saveScreenshot } from '../utils/download-single'
import {preflightPrint} from './printPreflight'
import {archiveApprovedPrint} from './approvedPrints'
const sharp=require('sharp')
const router=express.Router(),jobs=new Map<string,any>()
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
router.post('/api/tinix/collage-print', async(req:any,res:any)=>{
 try{
  for(const [id,j] of jobs)if(j.expires<Date.now())dispose(id)
  if(jobs.size>=10)throw new Error('Đang có nhiều bộ xuất. Hãy chờ rồi thử lại.')
  const saved=getDesign(Number(req.body.designId),0);if(!saved)throw new Error('Không tìm thấy thiết kế đã lưu')
  const data=JSON.parse(saved.data),index=Number(req.body.pageIndex)||0
  if(!Array.isArray(data)||!Number.isInteger(index)||!data[index])throw new Error('Trang không hợp lệ')
  const plan=planCollagePrint(data[index],req.body.options)
  const issues=await preflightPrint(data[index])
  if(issues.some(i=>i.severity==='error'))return res.status(400).json({message:'Cần sửa lỗi trước khi xuất.',issues})
  if(plan.layouts.length>52)throw new Error('Bộ xuất vượt 50 tờ cắt. Hãy kiểm tra kích thước các cụm.')
  const id=crypto.randomBytes(16).toString('hex');jobs.set(id,{...plan,designId:Number(req.body.designId),title:saved.title,options:req.body.options,images:{},expires:Date.now()+30*60*1000})
  res.json({id,issues,names:plan.names,widths:plan.layouts.map((l:any)=>l.global.width),heights:plan.layouts.map((l:any)=>l.global.height),dpi:plan.dpi})
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
 let temporary=''
 try{
  const job=lookup(req.params.id),index=Number(req.params.index),layout=job.layouts[index]
  if(!Number.isInteger(index)||!layout)throw new Error('Tờ in không hợp lệ')
  if(job.images[index])return res.type('jpeg').sendFile(job.images[index])
  const directory=path.join(filePath,'print-exports');fs.mkdirSync(directory,{recursive:true})
  const sign=crypto.randomBytes(16).toString('hex');temporary=path.join(directory,sign+'.png');req._queueSign=sign
  await queueRun(saveScreenshot,`${drawLink}?exportJob=${req.params.id}&index=${index}&hq=1`,{width:layout.global.width,height:layout.global.height,path:temporary,prevent:true},sign)
  const jpeg=await sharp(temporary).flatten({background:'#ffffff'}).toColourspace('srgb').jpeg({quality:100,chromaSubsampling:'4:4:4'}).withMetadata({density:job.dpi}).toBuffer()
  const cached=path.join(directory,req.params.id+'-'+index+'.jpg');fs.writeFileSync(cached,jpeg);job.images[index]=cached
  if(!res.headersSent)res.type('jpeg').send(jpeg)
 }catch(e){if(!res.headersSent)res.status(500).json({message:(e as Error).message,issues:(e as any).issues||[]})}
 finally{if(temporary)try{fs.unlinkSync(temporary)}catch(_){} }
})
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
  if(job.cuts[cacheKey])return res.type('image/svg+xml').send(job.cuts[cacheKey])
  const layout=job.layouts[index],width=layout.global.width,height=layout.global.height
  const variant=(color:string)=>{const v=JSON.parse(JSON.stringify(layout));v.layers=v.layers.filter((l:any)=>!l.printMark);v.global.backgroundColor=color;v.global.backgroundImage='';v.global.backgroundGradient='';return v}
  const white=await renderRaw(job,variant('#ffffff')),black=await renderRaw(job,variant('#000000'))
  if(white.info.width!==width||white.info.height!==height||black.info.width!==width||black.info.height!==height)throw new Error('Ảnh dựng sai kích thước, không dò được đường cắt')
  const alpha=alphaFromRenders(white.data,black.data,width,height,white.info.channels)
  const hasMarks=layout.layers.some((l:any)=>l.printMark)
  const result=buildCutSvg({alpha,width,height,dpi:job.dpi,placements:job.placements.filter((p:any)=>p.sheet===index-1),defaultInsetMm:inset,marks:hasMarks?markCorners(width,height,job.dpi):[],title:(job.title||'Đường cắt')+' · '+job.names[index]})
  if(!result.pieces)throw new Error('Không dò được mảnh nào trên tờ này')
  job.cuts[cacheKey]=result.svg
  res.type('image/svg+xml').send(result.svg)
 }catch(e){if(!res.headersSent)res.status(500).json({message:(e as Error).message})}
})
export default router
