const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('../service/node_modules/puppeteer'),DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:7012',anchor=process.env.TINIX_TEST_ANCHOR||'bottom'
assert(['bottom','center'].includes(anchor))
const effectCase=process.env.TINIX_TEST_EFFECTS==='1',subjectZoom=Number(process.env.TINIX_TEST_SUBJECT_ZOOM||1.5)
;(async()=>{
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=41').get(),original=JSON.parse(source.data)[0]
 const sourceId=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,0,'QA template fixture',source.data,'',source.width,source.height).lastInsertRowid)
 let templateId,orderId;const browser=await puppeteer.launch({headless:true})
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>/^https?:/.test(r.url())&&!r.url().startsWith(base)?r.abort():r.continue());await page.setViewport({width:1600,height:1100})
  await page.goto(`${base}/home?id=${sourceId}`,{waitUntil:'domcontentloaded'});await page.waitForSelector('.w-image')
  if(effectCase)await page.evaluate(()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore');for(const w of s.dWidgets.filter(w=>w.slot&&!w.cutoutEdit)){w.flip='Y';w.radius=40;w.mask='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><ellipse cx="50" cy="50" rx="48" ry="48" fill="white"/></svg>');w.effects={brightness:115,contrast:110,saturation:70,warmth:15,blur:2,border:12,borderColor:'#ffcc55',shadow:15,grain:30,paper:20}}s.updateDWidgets()})
  // Add two linked image layers referencing two independent slots.
  await page.evaluate(()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore');const photos=s.dWidgets.filter(w=>w.slot&&!w.cutoutEdit);for(let i=0;i<2;i++){const p=photos[i];s.dWidgets.push({...JSON.parse(JSON.stringify(p)),uuid:'qa-linked-'+i,name:'QA linked '+i,linkedPhotoId:p.uuid,slot:false,left:100+i*100,top:100,width:60,height:60,printGroup:undefined})}s.updateDWidgets()})
  await page.evaluate(()=>[...document.querySelectorAll('.classify-item')].find(e=>e.textContent.includes('Cắt dán')).click());await page.waitForSelector('.custom-templates')
  await page.evaluate(()=>[...document.querySelectorAll('.custom-templates button')].find(e=>e.textContent==='Lưu trang hiện tại thành mẫu').click());await page.waitForSelector('.el-dialog .slot')
  await page.evaluate(()=>{const d=[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Lưu mẫu cắt dán'));const inputs=d.querySelectorAll('input');inputs[0].value='QA mẫu vòng đời';inputs[0].dispatchEvent(new Event('input',{bubbles:true}));for(const row of d.querySelectorAll('.slot')){const text=row.querySelector('span').textContent,sel=row.querySelector('select');if(text.includes('Chủ thể'))sel.value='subject';else if(text.includes('Ảnh kỷ niệm'))sel.value='photo';else if(text.includes('Tiêu đề'))sel.value='text';sel.dispatchEvent(new Event('change',{bubbles:true}))}})
  await page.evaluate(anchor=>{const d=[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Lưu mẫu cắt dán'));const row=[...d.querySelectorAll('.slot')].find(e=>e.querySelector('span')?.textContent.includes('Chủ thể'));const select=row.querySelectorAll('select')[1];select.value=anchor;select.dispatchEvent(new Event('change',{bubbles:true}))},anchor)
  await page.evaluate(()=>[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Lưu mẫu cắt dán')).querySelector('.el-dialog__footer .el-button--primary').click())
  await page.waitForFunction(()=>document.querySelector('.custom-templates [role=status]')?.textContent.includes('Đã lưu mẫu phiên bản'))
  const t=(await(await fetch(base+'/api/tinix/collage-templates')).json()).list.find(t=>t.name==='QA mẫu vòng đời');templateId=t.id;assert(templateId)
  await page.evaluate(()=>[...document.querySelectorAll('.template-row')].find(e=>e.textContent.includes('QA mẫu vòng đời')).querySelector('button').click())
  await page.waitForFunction(()=>[...document.querySelectorAll('.el-dialog')].some(e=>e.textContent.includes('Tạo đơn khách từ mẫu')&&e.getClientRects().length))
  await page.evaluate(()=>{const d=[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Tạo đơn khách từ mẫu'));const i=d.querySelector('input');i.value='QA khách vòng đời';i.dispatchEvent(new Event('input',{bubbles:true}))})
  const inputs=await page.$$('.custom-template-order input[type=file]');assert.equal(inputs.length,3)
  const photo=path.resolve('service/static/photos/a0e4c310d56fc1fb5b472f1b3b12287a7a64ba32.jpg');for(const input of inputs)await input.uploadFile(photo)
  const previewCaptures=[];let fullPixels
  async function confirmAlignment(){
   await page.waitForSelector('.align-stage',{visible:true,timeout:190000})
   const stage=await page.$('.align-stage'),box=await stage.boundingBox();assert(box.width>20&&box.height>20)
   await page.waitForFunction(()=>{const x=document.querySelector('.preview-world');return x&&!x.style.transform.includes('scale(1)')})
   await new Promise(resolve=>setTimeout(resolve,500))
   const before=await page.$eval('.preview-world',e=>e.outerHTML)
   await page.evaluate(()=>{const d=document.querySelector('.align-stage').closest('.el-dialog');const s=d.querySelector('input[type=range]');s.value='1.7';s.dispatchEvent(new Event('input',{bubbles:true}))})
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6,{steps:4});await page.mouse.up()
   const changed=await page.$eval('.preview-world',e=>e.outerHTML);assert.notEqual(changed,before,'Zoom or drag must change preview')
   await page.evaluate(()=>[...document.querySelector('.align-stage').closest('.el-dialog').querySelectorAll('button')].find(e=>e.textContent.trim()==='Đặt lại').click())
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   const reset=await page.$eval('.preview-world',e=>e.outerHTML);if(reset!==before){fs.writeFileSync('.runtime/reset-before.txt',before);fs.writeFileSync('.runtime/reset-after.txt',reset)}assert.equal(reset,before,'Reset must restore preview')
   await page.evaluate(z=>{const d=document.querySelector('.align-stage').closest('.el-dialog');const slider=d.querySelector('input[type=range]');slider.value=d.textContent.includes('Chủ thể')?String(z):'1.35';slider.dispatchEvent(new Event('input',{bubbles:true}))},subjectZoom)
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   await page.$eval('.align-stage',e=>e.style.background='#fff');await new Promise(resolve=>setTimeout(resolve,500))
   const label=await page.$eval('.align-stage',e=>e.closest('.el-dialog').querySelector('p').textContent.replace(/ · Kéo ảnh để căn vị trí$/, '').trim())
   const isSubject=label.includes('Chủ thể');if(!isSubject){await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.53,{steps:4});await page.mouse.up()}
   if(isSubject){await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.53,box.y+box.height*.52,{steps:4});await page.mouse.up()}
   let geometry=null;if(isSubject){fs.mkdirSync('.runtime/collage-compare',{recursive:true});await stage.screenshot({path:`.runtime/collage-compare/${anchor}-subject${subjectZoom}-whole-view.png`});geometry=await page.evaluate(()=>{const w=document.querySelector('.preview-world'),f=document.querySelector('.preview-frame'),o=document.querySelector('.original-frame');o.style.visibility='hidden';const scale=w.getBoundingClientRect().width/parseFloat(w.style.width),s=document.querySelector('.align-stage').getBoundingClientRect(),b=f.getBoundingClientRect();if(b.left<s.left-1||b.top<s.top-1||b.right>s.right+1||b.bottom>s.bottom+1)throw new Error('Subject clipped in preview');return {x:parseFloat(f.style.left),y:parseFloat(f.style.top),width:parseFloat(f.style.width),height:parseFloat(f.style.height)}})}
   previewCaptures.push({label,geometry,bytes:Buffer.from(await (isSubject?await page.$('.preview-frame'):stage).screenshot())})
   await page.evaluate(()=>document.querySelector('.align-stage').closest('.el-dialog').querySelector('.el-dialog__footer .el-button--primary').click())
   await page.waitForFunction(()=>!document.querySelector('.align-stage')?.getClientRects().length)
  }
  async function create(){await page.evaluate(()=>[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Tạo đơn khách từ mẫu')).querySelector('.el-dialog__footer .el-button--primary').click());await confirmAlignment();await confirmAlignment();await page.waitForSelector('.review-stage canvas',{visible:true,timeout:190000})}
  await create();await page.evaluate(()=>[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Kiểm tra và sửa tách nền')).querySelector('.el-dialog__footer .el-button:not(.el-button--primary)').click());await page.waitForFunction(()=>document.querySelector('.custom-template-order [role=alert]')?.textContent.includes('Đã hủy'))
  assert.equal(db.prepare("select count(*) n from designs where title like 'QA khách vòng đời%'").get().n,0,'Cancel must not save an order')
  previewCaptures.length=0
  await create();await page.evaluate(()=>[...document.querySelectorAll('.el-dialog')].find(e=>e.textContent.includes('Kiểm tra và sửa tách nền')).querySelector('.el-dialog__footer .el-button--primary').click())
  await confirmAlignment();await page.waitForFunction(()=>[...document.querySelectorAll('.el-dialog')].some(d=>d.textContent.includes('Xem thành phẩm trước khi lưu đơn')&&d.querySelector('img')?.complete&&d.querySelector('img')?.naturalWidth>0&&!d.querySelector('.el-dialog__footer .el-button--primary')?.disabled),{timeout:190000});fullPixels=await sharp(Buffer.from(await (await fetch(await page.$eval('.el-dialog img[src*="collage-print"]',e=>e.src))).arrayBuffer())).removeAlpha().raw().toBuffer();await page.evaluate(()=>[...document.querySelectorAll('.el-dialog')].find(d=>d.textContent.includes('Xem thành phẩm trước khi lưu đơn')).querySelector('.el-dialog__footer .el-button--primary').click());await page.waitForSelector('.custom-template-order a[href*="/home?id="]',{timeout:190000});orderId=Number(new URL(await page.$eval('.custom-template-order a[href*="/home?id="]',e=>e.href)).searchParams.get('id'))
  const old=db.prepare('select data from designs where id=?').get(orderId).data,layout=JSON.parse(old)[0],linked=layout.layers.filter(w=>w.name.startsWith('QA linked'))
  assert.equal(linked.length,2);for(const w of linked){const target=layout.layers.find(x=>x.uuid===w.linkedPhotoId);assert(target);assert.equal(w.imgUrl,target.imgUrl);assert(!original.layers.some(x=>x.uuid===w.uuid))}
  const sourceSubject=t.data.layers.find(w=>w.templateRole==='subject'),subject=layout.layers.find(w=>w.templateRole==='subject');assert.equal(sourceSubject.templateAnchor,anchor);assert(subject&&subject.cutoutEdit&&subject.cutoutBorderUrl);assert(Math.abs((subject.left+subject.width/2)-(sourceSubject.left+sourceSubject.width/2)-(previewCaptures.find(p=>p.geometry).geometry.x-(1-subjectZoom)/2*subject.width/subjectZoom))<5,'Subject drag X was not saved');const factor=anchor==='center'?.5:1;assert(Math.abs((subject.top+subject.height*factor)-(sourceSubject.top+sourceSubject.height*factor)-(previewCaptures.find(p=>p.geometry).geometry.y-(1-subjectZoom)*factor*subject.height/subjectZoom))<5,'Subject anchor or drag Y was not saved');assert.equal(new Set(layout.layers.map(w=>w.uuid)).size,layout.layers.length)
  // Create independent export jobs, so this compares new renders, not one job's cache.
  const options={marginMm:10,gapMm:5},jobs=[]
  async function exportSet(){
   const response=await fetch(base+'/api/tinix/collage-print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:orderId,pageIndex:0,options})})
   const job=await response.json();assert.equal(response.status,200,JSON.stringify(job));jobs.push(job.id)
   assert(job.names.length>=3,'Fixture must produce cut sheets')
   assert.equal(job.names[0],'01_nen.jpg');assert.equal(job.names.at(-1),'03_thanh_pham.jpg')
   const snapshot=JSON.parse((await (await fetch(base+`/api/tinix/collage-print/${job.id}/data`)).json()).data)
   assert.equal(snapshot.length,job.names.length)
   const raisedIds=new Set(layout.layers.filter(w=>w.printRole==='raised'||(!w.printRole&&w.name.includes('cắt nổi'))).map(w=>w.uuid))
   assert(raisedIds.size>=5);assert(snapshot[0].layers.every(w=>!raisedIds.has(w.uuid)),'Raised items must be absent from clean background')
   const cutLayers=snapshot.slice(1,-1).flatMap(p=>p.layers)
   for(const id of raisedIds){const original=layout.layers.find(w=>w.uuid===id),copies=cutLayers.filter(w=>w.uuid===id);assert.equal(copies.length,1,`Missing or repeated cut item: ${original.name}`);assert.equal(copies[0].width,original.width);assert.equal(copies[0].height,original.height)}
   const subject=cutLayers.find(w=>w.templateRole==='subject');assert(subject?.cutoutBorderUrl,'Cut sheet must retain subject border')
   assert.equal(snapshot.at(-1).layers.length,layout.layers.length,'Finished image must contain all layers')
   const pages=[]
   for(let i=0;i<job.names.length;i++){
    const r=await fetch(base+`/api/tinix/collage-print/${job.id}/image/${i}`),bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,bytes.toString().slice(0,500))
    const meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,layout.global.width);assert.equal(meta.height,layout.global.height);assert.equal(meta.density,300)
    if(i>0&&i<job.names.length-1){for(const w of snapshot[i].layers.filter(w=>w.templateRole==='photo'||w.templateRole==='subject')){const preview=previewCaptures.find(p=>p.label===w.name);assert(preview,'Missing preview for '+w.name);const x=Math.round(w.left),y=Math.round(w.top),width=Math.round(w.width),height=Math.round(w.height);assert(x>=0&&y>=0&&x+width<=meta.width&&y+height<=meta.height,'Cut image outside page: '+w.name);const pm=await sharp(preview.bytes).metadata(),crop=await sharp(bytes).extract({left:x,top:y,width,height}).resize(pm.width,pm.height).png().toBuffer();fs.mkdirSync('.runtime/collage-compare',{recursive:true});const tag=`${anchor}-subject${subjectZoom}-${effectCase?'effects':'plain'}-sheet${i}-${w.name.replace(/[^a-zA-Z0-9]/g,'_')}`;fs.writeFileSync(`.runtime/collage-compare/${tag}-preview.png`,preview.bytes);fs.writeFileSync(`.runtime/collage-compare/${tag}-export.png`,crop);const a=await sharp(preview.bytes).removeAlpha().raw().toBuffer(),b=await sharp(crop).removeAlpha().raw().toBuffer();let sum=0;const diff=Buffer.alloc(a.length);for(let k=0;k<a.length;k++){const delta=Math.abs(a[k]-b[k]);sum+=delta;diff[k]=Math.min(255,delta*4)}await sharp(diff,{raw:{width:pm.width,height:pm.height,channels:3}}).png().toFile(`.runtime/collage-compare/${tag}-diff.png`);const mae=sum/a.length;console.log(JSON.stringify({comparison:w.name,meanError:mae}));assert(mae<12,'Preview differs from JPG: '+mae)}}
    if(i===job.names.length-1)assert(fullPixels.equals(await sharp(bytes).removeAlpha().raw().toBuffer()),'Full preview differs from saved order JPG');
    const sample=await sharp(bytes).resize({width:200}).removeAlpha().raw().toBuffer();let coloured=0;for(let p=0;p<sample.length;p+=3)if(sample[p]<245||sample[p+1]<245||sample[p+2]<245)coloured++
    assert(coloured>100,`Rendered page looks blank: ${job.names[i]}`)
    pages.push({name:job.names[i],width:meta.width,height:meta.height,density:meta.density,pixels:await sharp(bytes).removeAlpha().raw().toBuffer()})
   }
   return pages
  }
  try{
   const before=await exportSet()
   t.data.layers.find(w=>w.templateRole==='text').text='Mẫu đã thay đổi'
   // Alter print placement and a linked image as well as text, to exercise version isolation.
   const templatePhoto=t.data.layers.find(w=>w.templateRole==='photo');templatePhoto.left+=50
   const raised=t.data.layers.find(w=>w.printRole==='raised');raised.printRole='base'
   const updated=await fetch(base+'/api/tinix/collage-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id,version:t.version,name:t.name,category:t.category,layout:t.data})});assert.equal(updated.status,200,await updated.clone().text())
   assert.equal(db.prepare('select data from designs where id=?').get(orderId).data,old,'Updating template must not mutate customer design')
   const after=await exportSet();assert.equal(after.length,before.length,'Sheet count must be unchanged')
   for(let i=0;i<before.length;i++){
    assert.equal(after[i].name,before[i].name);assert.equal(after[i].width,before[i].width);assert.equal(after[i].height,before[i].height);assert.equal(after[i].density,before[i].density)
    assert(after[i].pixels.equals(before[i].pixels),`Pixels changed: ${before[i].name}`)
   }
   assert.deepEqual(errors,[])
   console.log(JSON.stringify({pass:true,templateId,orderId,linked:linked.length,cancel:true,anchor,effectCase,versionIsolation:true,files:before.map(({name,width,height,density})=>({name,width,height,density}))}))
  }finally{for(const id of jobs)await fetch(base+`/api/tinix/collage-print/${id}`,{method:'DELETE'})}
 }finally{await browser.close();if(templateId){db.prepare('delete from collage_template_versions where template_id=?').run(templateId);db.prepare('delete from collage_templates where id=?').run(templateId)}if(orderId)db.prepare('delete from designs where id=?').run(orderId);db.prepare('delete from designs where id=?').run(sourceId);db.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
