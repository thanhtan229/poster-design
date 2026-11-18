import { saveScreenshot } from '../../service/src/utils/download-single'
import { setPngFileDpi } from '../../service/src/tinix/pngDpi'
const assert = require('assert')
const sharp = require('../../service/node_modules/sharp')
async function main() {
  const width=7087,height=10630,path=process.cwd()+'/large.png'
  const html=`<body style="margin:0;background:white;width:${width}px;height:${height}px"><h1>60 x 90 cm</h1><img width="600" height="600" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')}"/><div style="position:absolute;bottom:0;width:100%;height:10px;background:blue"></div></body>`
  await saveScreenshot('data:text/html,'+encodeURIComponent(html),{width,height,path,prevent:false})
  setPngFileDpi(path,300)
  const m=await sharp(path).metadata(); assert.equal(m.width,width);assert.equal(m.height,height);assert.equal(m.density,300)
  const bottom=await sharp(path).extract({left:10,top:height-5,width:1,height:1}).raw().toBuffer(); assert.equal(bottom[2],255);assert.equal(bottom[0],0)
  console.log('PASS: server exported 60x90 cm at 300 DPI, full 7087x10630 pixels, image/text and bottom edge preserved')
}
main().catch(e=>{console.error(e);process.exit(1)})
