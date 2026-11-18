import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {getDB} from '../db'
const router=express.Router()
function db(){const d=getDB();d.exec(`CREATE TABLE IF NOT EXISTS approved_prints(id TEXT PRIMARY KEY,design_id INTEGER NOT NULL,source_job TEXT UNIQUE NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,snapshot TEXT NOT NULL,files TEXT NOT NULL)`);return d}
const directory=(id:string)=>path.join(process.cwd(),'data','approved-prints',id)
export function archiveApprovedPrint(job:any,jobId:string,note:string){
 const database=db(),existing=database.prepare('SELECT id FROM approved_prints WHERE source_job=?').get(jobId)
 if(existing)return existing.id
 if(!job.images||job.names.some((_:string,i:number)=>!job.images[i]||!fs.existsSync(job.images[i])))throw new Error('Cần tạo và xem đủ tất cả JPG trước khi lưu bản khách duyệt.')
 const id=crypto.randomBytes(16).toString('hex'),folder=directory(id);fs.mkdirSync(folder,{recursive:true})
 try{
  const files=job.names.map((name:string,i:number)=>{const bytes=fs.readFileSync(job.images[i]);fs.writeFileSync(path.join(folder,i+'.jpg'),bytes,{flag:'wx'});return {name,index:i,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length}})
  const createdAt=new Date().toISOString()
  const snapshot=JSON.stringify({layouts:job.layouts,options:job.options,designId:job.designId,title:job.title,dpi:job.dpi,operatorReviewed:true,customerApproved:true,createdAt})
  fs.writeFileSync(path.join(folder,'snapshot.json'),snapshot,{flag:'wx'})
  database.prepare('INSERT INTO approved_prints VALUES(?,?,?,?,?,?,?,?)').run(id,job.designId,jobId,job.title,note,createdAt,snapshot,JSON.stringify(files))
  return id
 }catch(e){fs.rmSync(folder,{recursive:true,force:true});throw e}
}
router.get('/api/tinix/approved-prints',(req:any,res:any)=>{
 try{const rows=db().prepare('SELECT id,design_id,title,note,created_at,files FROM approved_prints WHERE design_id=? ORDER BY created_at DESC,id DESC').all(Number(req.query.designId));res.json({list:rows.map((r:any)=>({...r,files:JSON.parse(r.files)}))})}catch(e){res.status(500).json({message:(e as Error).message})}
})
router.get('/api/tinix/approved-prints/:id/image/:index',(req:any,res:any)=>{
 try{const row=db().prepare('SELECT files FROM approved_prints WHERE id=?').get(req.params.id);if(!row)throw new Error('Không tìm thấy bản khách duyệt');const index=Number(req.params.index),file=JSON.parse(row.files)[index];if(!Number.isInteger(index)||!file)throw new Error('File không hợp lệ');const bytes=fs.readFileSync(path.join(directory(req.params.id),index+'.jpg'));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('File lưu trữ bị thay đổi hoặc hỏng. Hãy khôi phục từ bản sao lưu.');res.type('jpeg').send(bytes)}catch(e){res.status(404).json({message:(e as Error).message})}
})
export default router
