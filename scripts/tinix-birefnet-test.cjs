const assert=require('node:assert/strict'),fs=require('node:fs'),sharp=require('../service/node_modules/sharp')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:7009'
async function post(buffer){const body=new FormData();body.append('file',new Blob([buffer]),'photo.jpg');return fetch(base+'/api/tinix/cutout/birefnet',{method:'POST',body})}
;(async()=>{
 const source=await sharp(fs.readFileSync('service/static/photos/a0e4c310d56fc1fb5b472f1b3b12287a7a64ba32.jpg')).jpeg({quality:97}).toBuffer()
 const first=await post(source);assert.equal(first.status,200);const a=Buffer.from(await first.arrayBuffer())
 const meta=await sharp(a).metadata();assert.equal(meta.width,1365);assert.equal(meta.height,2048);assert(meta.hasAlpha)
 if(first.headers.get('x-cutout-cache')!=='hit')assert.match(first.headers.get('x-cutout-gpu'),/RTX 3090/)
 const originalRGB=await sharp(source).rotate().removeAlpha().raw().toBuffer(), outputRGB=await sharp(a).removeAlpha().raw().toBuffer()
 assert(originalRGB.equals(outputRGB),'Original RGB pixels must remain unchanged')
 const alpha=await sharp(a).extractChannel(3).stats();assert(alpha.channels[0].min<10);assert(alpha.channels[0].max>245)
 const second=await post(source);assert.equal(second.status,200);assert.equal(second.headers.get('x-cutout-cache'),'hit');assert(a.equals(Buffer.from(await second.arrayBuffer())))
 const invalid=await post(Buffer.from('not an image'));assert.equal(invalid.status,503)
 const retry=await post(source);assert.equal(retry.status,200,'worker must recover after bad input')
 console.log('PASS BiRefNet full-resolution alpha PNG, identical cache hit, invalid image rejection and recovery')
})().catch(e=>{console.error(e);process.exitCode=1})
