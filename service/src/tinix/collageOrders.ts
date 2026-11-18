import express from 'express'
import {getDB} from '../db'
const router=express.Router()
const states=['working','waiting','approved','printed','completed']
function database(){const d=getDB();d.exec(`CREATE TABLE IF NOT EXISTS collage_orders(design_id INTEGER PRIMARY KEY,status TEXT NOT NULL DEFAULT 'working',printed_approval TEXT,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS collage_order_events(id INTEGER PRIMARY KEY AUTOINCREMENT,design_id INTEGER NOT NULL,status TEXT NOT NULL,approval_id TEXT,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS approved_prints(id TEXT PRIMARY KEY,design_id INTEGER NOT NULL,source_job TEXT UNIQUE NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,snapshot TEXT NOT NULL,files TEXT NOT NULL);`);return d}
router.get('/api/tinix/collage-orders',(req:any,res:any)=>{
 try{const d=database(),q=String(req.query.q||'').trim().toLocaleLowerCase(),filter=String(req.query.status||'');const records=d.prepare('SELECT id,title,data,cover,width,height,updated_at FROM designs ORDER BY updated_at DESC,id DESC').all(),list:any[]=[]
  for(const row of records){let pages:any[];try{pages=JSON.parse(row.data)}catch(_){continue}if(!Array.isArray(pages))continue;const page=pages.find(p=>p?.global?.collage);if(!page)continue;const order=d.prepare('SELECT * FROM collage_orders WHERE design_id=?').get(row.id),status=order?.status||'working',customer=page.global.collage.customer||'';if(q&&!`${customer} ${row.title} ${row.id}`.toLocaleLowerCase().includes(q))continue;if(filter&&status!==filter)continue;const approvals=d.prepare('SELECT id,title,note,created_at,files FROM approved_prints WHERE design_id=? ORDER BY created_at DESC,id DESC').all(row.id).map((a:any)=>({...a,files:JSON.parse(a.files)}));list.push({id:row.id,title:row.title,customer,cover:row.cover,width:page.global.width,height:page.global.height,dpi:page.global.dpi||300,updated_at:row.updated_at,status,printedApproval:order?.printed_approval||null,approvals})}
  res.json({list})
 }catch(e){res.status(500).json({message:(e as Error).message})}
})
router.get('/api/tinix/collage-orders/:id/events',(req:any,res:any)=>{try{const rows=database().prepare('SELECT status,approval_id,created_at FROM collage_order_events WHERE design_id=? ORDER BY id DESC').all(Number(req.params.id));res.json({list:rows})}catch(e){res.status(500).json({message:(e as Error).message})}})
router.post('/api/tinix/collage-orders/:id/status',(req:any,res:any)=>{
 try{const d=database(),id=Number(req.params.id),status=String(req.body.status||''),approvalId=req.body.approvalId?String(req.body.approvalId):null;if(!Number.isSafeInteger(id)||id<1||!states.includes(status))throw new Error('Đơn hoặc trạng thái không hợp lệ');const design=d.prepare('SELECT data FROM designs WHERE id=?').get(id);if(!design||!JSON.parse(design.data).some((p:any)=>p?.global?.collage))throw new Error('Không tìm thấy đơn cắt dán')
  const approved=approvalId&&d.prepare('SELECT id FROM approved_prints WHERE id=? AND design_id=?').get(approvalId,id);const previous=d.prepare('SELECT * FROM collage_orders WHERE design_id=?').get(id)
  if(status==='approved'&&!d.prepare('SELECT 1 FROM approved_prints WHERE design_id=?').get(id))throw new Error('Chưa có bản khách đã duyệt cho đơn này.')
  if(status==='printed'&&!approved)throw new Error('Chọn bản khách đã duyệt đã in của đúng đơn.')
  if(status==='completed'&&(!previous?.printed_approval||!d.prepare('SELECT 1 FROM approved_prints WHERE id=? AND design_id=?').get(previous.printed_approval,id)))throw new Error('Hãy ghi nhận bản đã in trước khi hoàn thành.')
  const printId=status==='printed'?approvalId:status==='completed'?previous.printed_approval:null,now=new Date().toISOString()
  d.transaction(()=>{d.prepare('INSERT INTO collage_orders(design_id,status,printed_approval,updated_at) VALUES(?,?,?,?) ON CONFLICT(design_id) DO UPDATE SET status=excluded.status,printed_approval=excluded.printed_approval,updated_at=excluded.updated_at').run(id,status,printId,now);d.prepare('INSERT INTO collage_order_events(design_id,status,approval_id,created_at) VALUES(?,?,?,?)').run(id,status,printId,now)})();res.json({ok:true,status,printedApproval:printId})
 }catch(e){res.status(400).json({message:(e as Error).message})}
})
export default router
