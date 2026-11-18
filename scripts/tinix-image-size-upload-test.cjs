const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:7018'
;(async()=>{
 const folder='cli-size-check-'+crypto.randomBytes(8).toString('hex'),name='fixture.png',target=path.resolve('service/static',folder,name)
 try{
  const png=await sharp({create:{width:37,height:23,channels:3,background:'#1b58aa'}}).png().toBuffer(),form=new FormData()
  form.append('file',new Blob([png],{type:'image/png'}),name);form.append('folder',folder);form.append('name',name)
  const response=await fetch(base+'/api/file/upload',{method:'POST',body:form}),data=await response.json()
  assert.equal(data.code,200,JSON.stringify(data));assert.equal(data.result.url,`/static/${folder}/${name}`)
  const meta=await sharp(target).metadata();assert.equal(meta.width,37);assert.equal(meta.height,23)
  const remote=await fetch(base+data.result.url);assert.equal(remote.status,200);assert(Buffer.from(await remote.arrayBuffer()).equals(png))
  console.log('PASS image-size v2: upload, persisted PNG and dimensions')
 }finally{try{fs.unlinkSync(target)}catch(e){if(e.code!=='ENOENT')throw e}try{fs.rmdirSync(path.dirname(target))}catch(e){if(e.code!=='ENOENT')throw e}}
})().catch(e=>{console.error(e);process.exitCode=1})
