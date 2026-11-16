// Export a saved design without editing it; prepare a physical print-and-assembly trial.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:7012'
;(async()=>{
 const id=Number(process.argv[2]||41),db=new DB('service/data/poster.db',{readonly:true})
 const saved=db.prepare('select * from designs where id=?').get(id);db.close();assert(saved,'Không tìm thấy thiết kế')
 const layout=JSON.parse(saved.data)[0],folder=path.resolve('.runtime','production-pilot',`${id}-${Date.now()}`)
 fs.mkdirSync(folder,{recursive:true});let job
 try{
  const response=await fetch(base+'/api/tinix/collage-print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:id,pageIndex:0,options:{marginMm:10,gapMm:5}})})
  job=await response.json();assert.equal(response.status,200,JSON.stringify(job));const files=[]
  for(let i=0;i<job.names.length;i++){
   const r=await fetch(`${base}/api/tinix/collage-print/${job.id}/image/${i}`),bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,bytes.toString().slice(0,300))
   const m=await sharp(bytes).metadata();assert.equal(m.format,'jpeg');assert.equal(m.width,layout.global.width);assert.equal(m.height,layout.global.height);assert.equal(m.density,job.dpi)
   fs.writeFileSync(path.join(folder,job.names[i]),bytes);files.push({name:job.names[i],width:m.width,height:m.height,dpi:m.density})
  }
  const check=new DB('service/data/poster.db',{readonly:true});assert.equal(check.prepare('select data from designs where id=?').get(id).data,saved.data);check.close()
  const widthMm=layout.global.width/job.dpi*25.4,heightMm=layout.global.height/job.dpi*25.4
  fs.writeFileSync(path.join(folder,'ket_qua.json'),JSON.stringify({designId:id,title:saved.title,widthMm,heightMm,files,issues:job.issues,physicalTrial:'pending'},null,2))
  fs.writeFileSync(path.join(folder,'HUONG_DAN_IN_THU.txt'),`BỘ IN THỬ — chưa phải đơn khách đã duyệt\nKhổ thành phẩm: ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm, ${job.dpi} DPI.\nIn nền và các tờ chi tiết cùng tỷ lệ 100%; tắt Fit to page/co giãn tự động. Chọn giấy phù hợp khổ trên.\nẢnh thành phẩm dùng để đối chiếu lắp ráp; không cần in nếu chỉ xem trên màn hình.\nĐo chiều rộng/cao bản nền sau in; ghi số đo thực tế.\nCắt các cụm trên tờ chi tiết, kiểm tra đủ viền trắng và không mất chi tiết.\nƯớm các cụm theo ảnh thành phẩm trước khi dán; ghi lại cụm khó cắt hoặc khó đặt.\nGhi thời gian in, cắt và lắp; kiểm tra màu, tóc, chữ nhỏ và độ nổi sau lắp.\nKết quả: CHỜ IN VÀ LẮP THỰC TẾ.\n`)
  console.log(JSON.stringify({pass:true,folder,widthMm,heightMm,files,physicalTrial:'pending'}))
 }finally{if(job?.id)await fetch(`${base}/api/tinix/collage-print/${job.id}`,{method:'DELETE'})}
})().catch(e=>{console.error(e);process.exitCode=1})
