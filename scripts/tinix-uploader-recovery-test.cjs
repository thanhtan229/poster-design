const p=require('../service/node_modules/puppeteer'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:5188'
;(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tinix-uploader-')),a=path.join(dir,'one.png'),b=path.join(dir,'two.png'),harness='tinix-uploader-'+path.basename(dir)+'.html',harnessFile=path.resolve('public',harness),browser=await p.launch({headless:true})
 try{
  const bytes=await sharp({create:{width:30,height:20,channels:3,background:'#d02020'}}).png().toBuffer();fs.writeFileSync(a,bytes);fs.writeFileSync(b,bytes);fs.writeFileSync(harnessFile,'<!doctype html><html><body></body></html>',{flag:'wx'})
  const page=await browser.newPage();let uploads=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warn')errors.push(m.text())})
  await page.setRequestInterception(true);page.on('request',r=>{
   if(r.url().includes('/api/file/upload')&&r.method()==='POST'){
    uploads++;return r.respond({status:uploads===1?500:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(uploads===1?{code:500,msg:'fixture failure'}:{code:200,result:{url:'/static/test-recovered.png',key:'test'}})})
   }
   r.continue()
  })
  await page.goto(base+'/'+harness,{waitUntil:'domcontentloaded'})
  await page.evaluate(async()=>{
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js'),{createPinia}=await import('/node_modules/.vite/deps/pinia.js'),Uploader=(await import('/src/components/common/Uploader/index.vue')).default,i18n=(await import('/src/languages/index.ts')).default
   const el=document.createElement('div');el.id='uploader-test';document.body.appendChild(el);window.__uploadDone=[]
   const app=createApp({render:()=>h(Uploader,{onDone:data=>window.__uploadDone.push(data)})});app.use(createPinia());app.use(i18n);app.mount(el)
  })
  const input=await page.$('#uploader-test input[type=file]');assert(input);await input.uploadFile(a,b)
  try{await page.waitForFunction(()=>window.__uploadDone?.length===1,{timeout:10000})}catch(e){throw new Error(JSON.stringify({uploads,errors,html:await page.$eval('#uploader-test',e=>e.innerHTML),notices:await page.$$eval('.el-notification',nodes=>nodes.map(n=>n.textContent))}))}
  assert.equal(uploads,2);const done=await page.evaluate(()=>window.__uploadDone);assert.equal(done[0].url,'/static/test-recovered.png');assert.equal(done[0].width,30);assert.equal(done[0].height,20)
  console.log('PASS upload queue recovers after a failed request and processes next image')
 }finally{await browser.close();try{fs.unlinkSync(harnessFile)}catch(e){if(e.code!=='ENOENT')throw e}fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1})
