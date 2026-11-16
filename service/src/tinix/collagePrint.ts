import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDesign } from '../db/designs'
import { planCollagePrint } from '../../../src/utils/tinix/collage-print'
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
export default router
