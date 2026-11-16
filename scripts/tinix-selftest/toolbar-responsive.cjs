const assert = require('node:assert/strict')
const puppeteer = require('../../service/node_modules/puppeteer')
;(async () => {
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']})
  try {
    const page = await browser.newPage()
    for (const mode of ['guest','admin']) {
    await page.evaluateOnNewDocument(mode => { if(mode==='admin') localStorage.setItem('xp_user',JSON.stringify({account:'long-admin-account@example.com',role:1})); else localStorage.removeItem('xp_user') },mode)
    for (const width of [360, 480, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewport({width,height:1000})
      await page.goto('http://127.0.0.1:7001',{waitUntil:'networkidle2'})
      const result = await page.evaluate(() => {
        const bar = document.querySelector('.top-nav-wrap'), box=bar.getBoundingClientRect()
        const buttons = [...bar.querySelectorAll('button,.operation-item,.top-title')].filter(el=>el.getBoundingClientRect().width>0)
        const clipped = buttons.filter(el=>{ const r=el.getBoundingClientRect();return r.left<0 || r.right>innerWidth+1 || r.bottom>box.bottom+1 }).map(el=>el.textContent.trim())
        const library=document.querySelector('.canvas-library-button'), r=library.getBoundingClientRect()
        return {clipped,visible:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===library,height:box.height}
      })
      assert.deepEqual(result.clipped,[],`${width}px clips: ${result.clipped}`)
      assert(result.visible,`${width}px library obscured`)
      await page.click('.canvas-library-button')
      await page.waitForSelector('.el-dialog__title')
      assert.equal(await page.$eval('.el-dialog__title',el=>el.textContent),'Thư viện kích thước')
      if (width===360 || width===1440) await page.screenshot({path:`.runtime/toolbar-${mode}-${width}.png`})
      console.log(`PASS ${mode} ${width}px: controls fit, library clickable; toolbar height ${result.height}`)
    }
    }
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exit(1)})
