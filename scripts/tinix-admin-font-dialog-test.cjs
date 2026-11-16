const p=require('../service/node_modules/puppeteer'),assert=require('node:assert/strict')
const base=process.env.TINIX_APP_URL||'http://127.0.0.1:5188'
;(async()=>{
 const browser=await p.launch({headless:true})
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.setViewport({width:1500,height:1000});await page.goto(base+'/admin',{waitUntil:'domcontentloaded'});await page.waitForSelector('.quick-actions')
  const actions=await page.$$('.quick-actions > *');assert(actions.length>=3);await actions[2].click()
  await page.waitForSelector('.el-dialog input',{visible:true});const input=await page.$$('.el-dialog input');assert(input.length>=4)
  await input[0].type('Test alias');await input[1].type('Test Family');await input[2].type('https://example.invalid/font.woff2')
  const values=await page.$$eval('.el-dialog input',nodes=>nodes.slice(0,3).map(n=>n.value))
  assert.deepEqual(values,['Test alias','Test Family','https://example.invalid/font.woff2'])
  await page.click('.el-dialog__headerbtn');await page.waitForFunction(()=>![...document.querySelectorAll('.el-dialog')].some(d=>d.getClientRects().length))
  assert.deepEqual(errors,[]);console.log('PASS admin font dialog inputs and cancel without saving')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
