const assert=require('node:assert/strict'),fs=require('fs'),DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:7001'
;(async()=>{
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=39').get(),layouts=JSON.parse(source.data)
 const layout=layouts[0];for(const w of layout.layers){if(w.slot||w.name.startsWith('Khung kỷ niệm'))w.printRole='raised';else if(!w.name.includes('cắt nổi'))w.printRole='base';const m=/^(Khung|Ảnh) kỷ niệm (\d+)$/.exec(w.name);if(m)w.printGroup='photo-'+m[2]}
 const id=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,source.template_id,'QA bộ JPG cắt dán',JSON.stringify([layout]),'',source.width,source.height).lastInsertRowid)
 const options={paperWidthMm:148,paperHeightMm:210,marginMm:10,gapMm:5}
 const response=await fetch(base+'/api/tinix/collage-print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:id,pageIndex:0,options})})
 const job=await response.json();assert.equal(response.status,200,JSON.stringify(job));assert(job.names.length>=3,'Need cut sheets');assert(job.widths.every(w=>w===layout.global.width));assert(job.heights.every(h=>h===layout.global.height))
 const data=await(await fetch(base+`/api/tinix/collage-print/${job.id}/data`)).json(),snapshot=JSON.parse(data.data)
 assert(snapshot[0].layers.every(w=>!w.cutoutEdit&&!w.name.includes('cắt nổi')))
 assert.equal(snapshot.at(-1).layers.length,layout.layers.length)
 for(const w of layout.layers.filter(w=>w.printRole==='raised')){const placed=snapshot.slice(1,-1).flatMap(p=>p.layers).find(x=>x.uuid===w.uuid);assert(placed);assert.equal(placed.width,w.width);assert.equal(placed.height,w.height)}
 db.prepare('update designs set data=? where id=?').run(JSON.stringify([{...layout,layers:[]}]),id)
 const again=await(await fetch(base+`/api/tinix/collage-print/${job.id}/data`)).json();assert.equal(again.data,data.data,'Export snapshot must not follow later edits')
 db.prepare('update designs set data=? where id=?').run(JSON.stringify([layout]),id);db.close()
 for(let i=0;i<job.names.length;i++){
  const r=await fetch(base+`/api/tinix/collage-print/${job.id}/image/${i}`),bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,bytes.toString().slice(0,200))
  const m=await sharp(bytes).metadata();assert.equal(m.format,'jpeg');assert.equal(m.width,job.widths[i]);assert.equal(m.height,job.heights[i]);assert.equal(m.density,300)
  fs.writeFileSync('.runtime/'+job.names[i],bytes)
 }
 const released=await fetch(base+`/api/tinix/collage-print/${job.id}`,{method:'DELETE'});assert.equal(released.status,200)
 assert.equal((await fetch(base+`/api/tinix/collage-print/${job.id}/data`)).status,404)
 console.log(JSON.stringify({pass:true,designId:id,files:job.names,cutSheets:job.names.length-2,dpi:job.dpi,snapshotImmutable:true}))
})().catch(e=>{console.error(e);process.exitCode=1})
