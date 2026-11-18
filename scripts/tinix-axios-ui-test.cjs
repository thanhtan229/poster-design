const p=require('../service/node_modules/puppeteer'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:5188'
;(async()=>{
 const folder='cli-axios-'+crypto.randomBytes(8).toString('hex'),target=path.resolve('service/static',folder,'fixture.png'),b=await p.launch({headless:true})
 try{
  const page=await b.newPage();await page.goto(base+'/home',{waitUntil:'domcontentloaded'});await page.waitForSelector('.design-canvas',{timeout:60000})
  const bytes=await sharp({create:{width:37,height:23,channels:3,background:'#336699'}}).png().toBuffer()
  const result=await page.evaluate(async({folder,data})=>{
   const api=(await import('/src/utils/axios.ts')).default
   let list;try{list=await api('/design/list',{page:1,pageSize:1,type:0},'get')}catch(e){throw new Error('GET: '+JSON.stringify({message:e.message,status:e.response?.status,data:e.response?.data}))}
   const raw=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),form=new FormData()
   form.append('file',new File([raw],'fixture.png',{type:'image/png'}));form.append('folder',folder);form.append('name','fixture.png')
   let uploaded;try{uploaded=await api('/api/file/upload',form,'post')}catch(e){throw new Error('UPLOAD: '+JSON.stringify({message:e.message,status:e.response?.status,data:e.response?.data}))}
   return {list,uploaded}
  },{folder,data:bytes.toString('base64')})
  assert(Array.isArray(result.list.list));assert.equal(result.uploaded.url,`/static/${folder}/fixture.png`)
  assert(fs.readFileSync(target).equals(bytes));console.log('PASS browser Axios GET result and multipart FormData upload')
 }finally{await b.close();try{fs.unlinkSync(target)}catch(e){if(e.code!=='ENOENT')throw e}try{fs.rmdirSync(path.dirname(target))}catch(e){if(e.code!=='ENOENT')throw e}}
})().catch(e=>{console.error(e);process.exitCode=1})
