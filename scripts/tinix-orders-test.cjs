const assert=require('node:assert/strict'),DB=require('../service/node_modules/better-sqlite3')
const base='http://127.0.0.1:7009'
;(async()=>{
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=41').get(),id=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,0,'QA đơn kiểm thử',source.data,'',source.width,source.height).lastInsertRowid)
 const post=async(status,approvalId)=>{const r=await fetch(`${base}/api/tinix/collage-orders/${id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,approvalId})});return {status:r.status,body:await r.json()}}
 try{
  let list=await(await fetch(base+'/api/tinix/collage-orders?q='+encodeURIComponent('QA đơn kiểm thử'))).json();assert.equal(list.list.length,1);assert.equal(list.list[0].status,'working')
  assert.equal((await post('approved')).status,400);assert.equal((await post('printed')).status,400);assert.equal((await post('completed')).status,400)
  assert.equal((await post('waiting')).status,200)
  const approval='qa-order-'+Date.now();db.prepare('insert into approved_prints(id,design_id,source_job,title,note,created_at,snapshot,files) values(?,?,?,?,?,?,?,?)').run(approval,id,approval,'QA','','2026-01-01T00:00:00Z','{}','[]')
  assert.equal((await post('approved')).status,200);assert.equal((await post('printed','wrong-order')).status,400);assert.equal((await post('printed',approval)).body.printedApproval,approval);assert.equal((await post('completed')).body.printedApproval,approval)
  list=await(await fetch(base+'/api/tinix/collage-orders?status=completed&q='+id)).json();assert.equal(list.list[0].printedApproval,approval)
  assert.equal(db.prepare('select count(*) n from collage_order_events where design_id=?').get(id).n,4)
  db.prepare('delete from approved_prints where id=?').run(approval);console.log('PASS search, filtering, approval guards, selected printed version, completion and event history')
 }finally{db.prepare('delete from collage_order_events where design_id=?').run(id);db.prepare('delete from collage_orders where design_id=?').run(id);db.prepare('delete from designs where id=?').run(id);db.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
