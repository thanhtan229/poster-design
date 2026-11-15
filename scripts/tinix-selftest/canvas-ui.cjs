const fs=require('fs'),p=require('../../service/node_modules/puppeteer');
(async()=>{const b=await p.launch({headless:true,args:['--no-sandbox']});const page=await b.newPage();await page.setViewport({width:1440,height:1100});await page.goto('http://127.0.0.1:7001',{waitUntil:'networkidle2'});await page.click('.canvas-library-button');await new Promise(r=>setTimeout(r,700));const assert=require('assert');
assert(await page.$('.sizes .el-select'));assert(await page.$('.sizes .el-checkbox input'));
await page.type('.sizes input[placeholder="Tìm tên hoặc kích thước"]','60x90');
await new Promise(r=>setTimeout(r,200));assert.equal(await page.$$eval('.sizes .row',r=>r.length),1);
await page.click('.sizes .select');
const dims=await page.$$eval('.el-dialog .position-size input',es=>es.map(e=>e.value));assert.equal(Number(dims[0]),60);assert.equal(Number(dims[1]),90);
await page.evaluate(()=>Array.from(document.querySelectorAll('.el-dialog button')).find(b=>b.textContent.trim()==='Áp dụng').click());
await new Promise(r=>setTimeout(r,500));
const read=()=>page.evaluate(()=>{const p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; return JSON.parse(JSON.stringify(p._s.get('canvasStore').dPage))});
const after=await read();assert.equal(after.width,7087);assert.equal(after.height,10630);
await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');await new Promise(r=>setTimeout(r,300));const undone=await read();assert.equal(undone.width,1920);assert.equal(undone.height,1080);
console.log('PASS UI: registered controls, search 60x90, choose cm preset, apply 7087x10630, undo restores 1920x1080');
await page.click('.canvas-library-button');await new Promise(r=>setTimeout(r,300));await page.screenshot({path:'.runtime/canvas-ui.png'});await page.click('.el-dialog__headerbtn');
await page.evaluate(()=>{const orig=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__exportBlob=b;return orig(b)}});
await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Xuất PSD').click());
await page.waitForFunction(()=>window.__exportBlob,{timeout:60000});
const header=await page.evaluate(async()=>Array.from(new Uint8Array(await window.__exportBlob.arrayBuffer()).slice(0,26)));
const bytes=Buffer.from(header);assert.equal(bytes.toString('ascii',0,4),'8BPS');assert.equal(bytes.readUInt32BE(14),1080);assert.equal(bytes.readUInt32BE(18),1920);
console.log('PASS UI PSD export: valid PSD signature, 1920x1080 dimensions');await b.close()})().catch(e=>{console.error(e);process.exit(1)})


