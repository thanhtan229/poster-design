const assert = require('node:assert/strict')
const puppeteer = require('../../service/node_modules/puppeteer')

;(async () => {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1000 })
    await page.goto((process.env.TINIX_APP_URL || 'http://127.0.0.1:7001') + '/home', { waitUntil: 'networkidle2', timeout:60000 })
    await page.waitForSelector('#page-design')
    await page.evaluate(async () => {
      const defaults = {name:'Test image',type:'w-image',uuid:'-1',left:0,top:0,width:300,height:300,zoom:1,transform:'',radius:0,opacity:1,parent:'-1',imgUrl:'',mask:'',isContainer:false,setting:[],rotate:0,record:{width:0,height:0,minWidth:10,minHeight:10,dir:'all'},lock:false,isNinePatch:false,flip:'',sliceData:{ratio:0,left:0}}
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const canvas = pinia._s.get('canvasStore')
      const widgets = pinia._s.get('widgetStore')
      canvas.dPage.width = 800
      canvas.dPage.height = 600
      canvas.dZoom = 100
      const image = (uuid, left, top, width, height, extra = {}) => ({
        ...structuredClone(defaults), uuid, left, top, width, height,
        imgUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="lightblue"/></svg>'),
        parent: '-1', ...extra,
      })
      widgets.dWidgets = [
        image('test-bg', 0, 0, 800, 600),
        image('test-a', 100, 100, 60, 60),
        image('test-b', 240, 100, 60, 60),
        image('test-c', 400, 100, 60, 60),
        image('test-locked', 180, 100, 40, 40, { lock: true }),
        image('test-hidden', 180, 150, 40, 40, { hidden: true }),
      ]
      widgets.dSelectWidgets = []
      widgets.dActiveElement = canvas.dPage
    })
    const pause = () => new Promise(resolve => setTimeout(resolve, 150))
    await pause()
    const origin = await page.$eval('.design-canvas', el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 800 }
    })
    const selected = () => page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore')
      return (store.dSelectWidgets.length ? store.dSelectWidgets : [store.dActiveElement])
        .filter(w => w && w.uuid !== '-1').map(w => w.uuid).sort()
    })
    async function drag(x1, y1, x2, y2, modifiers = ['Control']) {
      for (const key of modifiers) await page.keyboard.down(key)
      await page.mouse.move(origin.x + x1 * origin.scale, origin.y + y1 * origin.scale)
      await page.mouse.down()
      await page.mouse.move(origin.x + x2 * origin.scale, origin.y + y2 * origin.scale, { steps: 10 })
      await page.mouse.up()
      for (const key of modifiers.reverse()) await page.keyboard.up(key)
      await pause()
    }
    await drag(80, 80, 320, 180)
    assert.deepEqual(await selected(), ['test-a', 'test-b'], 'Ctrl drag selects through full canvas background; skips locked/hidden layers')
    await drag(380, 80, 480, 180, ['Control', 'Shift'])
    assert.deepEqual(await selected(), ['test-a', 'test-b', 'test-c'], 'Ctrl+Shift drag adds')
    await drag(80, 80, 320, 180, ['Control', 'Shift'])
    assert.deepEqual(await selected(), ['test-a', 'test-b', 'test-c'], 'Overlapping additive regions do not deselect')
    await drag(480, 180, 380, 80)
    assert.deepEqual(await selected(), ['test-c'], 'Ctrl drag replaces; reverse direction works')
    assert(await page.$('.moveable-control-box .moveable-direction'), 'A single selected layer retains resize controls')
    await page.keyboard.down('Control')
    await page.mouse.click(origin.x + 120 * origin.scale, origin.y + 120 * origin.scale)
    await page.keyboard.up('Control')
    await pause()
    assert.deepEqual(await selected(), ['test-a', 'test-c'], 'Ctrl click still adds')
    await page.keyboard.down('Control')
    await page.mouse.click(origin.x + 120 * origin.scale, origin.y + 120 * origin.scale)
    await page.keyboard.up('Control')
    await pause()
    assert.deepEqual(await selected(), ['test-c'], 'Ctrl click still toggles off')
    await drag(500, 300, 600, 400)
    assert.deepEqual(await selected(), [], 'An empty replacement region clears selection')
    const positions = await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore').dWidgets.map(w => [w.uuid, w.left, w.top]))
    assert.deepEqual(positions.slice(0, 4), [['test-bg', 0, 0], ['test-a', 100, 100], ['test-b', 240, 100], ['test-c', 400, 100]], 'Marquee gestures never move layers')
    await drag(50, 400, 75, 425, [])
    const background = await page.$eval('[id="test-bg"]', el => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }))
    assert(background.left > 0 && background.top > 0, 'Ordinary drag still moves the background')
    await drag(80, 80, 320, 180)
    assert.deepEqual(await selected(), ['test-a', 'test-b'])
    await drag(120, 120, 140, 150, [])
    const moved = await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore').dWidgets.slice(0, 4).map(w => [w.uuid, w.left, w.top]))
    assert(moved[1][1] > 100 && moved[1][2] > 100 && moved[2][1] > 240 && moved[2][2] > 100, 'A marquee selection can be moved as a group')
    assert.deepEqual(moved[0], ['test-bg', background.left, background.top], 'Moving the selected group leaves the background alone')
    assert.deepEqual(moved[3], ['test-c', 400, 100], 'Moving the selected group leaves other layers alone')
    console.log('PASS: Ctrl marquee, additive union, replacement, reverse drag, Ctrl click, empty selection, locked/hidden filtering, unchanged positions, ordinary drag, group movement')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
