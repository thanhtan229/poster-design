const assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto'),DB=require('../service/node_modules/better-sqlite3')
const base='http://127.0.0.1:7001',post=(url,body)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
;(async()=>{
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=41').get()
 const designId=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,0,'QA lưu bản khách duyệt',source.data,'',source.width,source.height).lastInsertRowid)
 const start=await post('/api/tinix/collage-print',{designId,pageIndex:0,options:{marginMm:10,gapMm:5}}),job=await start.json();assert.equal(start.status,200,JSON.stringify(job))
 let r=await post(`/api/tinix/collage-print/${job.id}/approve`,{operatorReviewed:true,customerApproved:false});assert.equal(r.status,400,'Operator viewed is not customer approval')
 r=await post(`/api/tinix/collage-print/${job.id}/approve`,{operatorReviewed:true,customerApproved:true});assert.equal(r.status,400,'Incomplete bundle cannot be approved')
 const bytes=[]
 for(let i=0;i<job.names.length;i++){r=await fetch(base+`/api/tinix/collage-print/${job.id}/image/${i}`);assert.equal(r.status,200);bytes.push(Buffer.from(await r.arrayBuffer()))}
 r=await post(`/api/tinix/collage-print/${job.id}/approve`,{operatorReviewed:true,customerApproved:true,note:'Khách xác nhận mẫu thử'});const approved=await r.json();assert.equal(r.status,200,JSON.stringify(approved))
 r=await post(`/api/tinix/collage-print/${job.id}/approve`,{operatorReviewed:true,customerApproved:true,note:'retry'});assert.equal((await r.json()).id,approved.id,'Retry must not create duplicate approval')
 db.prepare('update designs set title=?,data=? where id=?').run('Đã sửa sau duyệt',JSON.stringify([{global:{width:1,height:1},layers:[]}]),designId)
 await fetch(base+`/api/tinix/collage-print/${job.id}`,{method:'DELETE'})
 const list=await(await fetch(base+`/api/tinix/approved-prints?designId=${designId}`)).json();assert.equal(list.list.length,1);assert.equal(list.list[0].title,'QA lưu bản khách duyệt')
 for(let i=0;i<bytes.length;i++){r=await fetch(base+`/api/tinix/approved-prints/${approved.id}/image/${i}`);assert.equal(r.status,200);assert(Buffer.from(await r.arrayBuffer()).equals(bytes[i]),'Archived bytes must survive design changes and release of temp snapshot')}
 const row=db.prepare('select * from approved_prints where id=?').get(approved.id),snapshot=JSON.parse(row.snapshot);assert.equal(snapshot.customerApproved,true);assert.equal(snapshot.operatorReviewed,true);assert(snapshot.layouts.at(-1).layers.length>0)
 const file=`service/data/approved-prints/${approved.id}/0.jpg`,original=fs.readFileSync(file);fs.writeFileSync(file,Buffer.from('corrupted'));assert.equal((await fetch(base+`/api/tinix/approved-prints/${approved.id}/image/0`)).status,404);fs.writeFileSync(file,original)
 fs.writeFileSync('.runtime/approved-test-result.json',JSON.stringify({designId,archiveId:approved.id,hashes:bytes.map(b=>crypto.createHash('sha256').update(b).digest('hex'))}))
 db.close();console.log(JSON.stringify({pass:true,designId,archiveId:approved.id,exactBytes:true,approvalSeparated:true,corruptionDetected:true}))
})().catch(e=>{console.error(e);process.exitCode=1})
