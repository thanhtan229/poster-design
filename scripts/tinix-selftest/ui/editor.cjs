// Shared UI fixtures are in-memory only; no design is saved to the service.
const assert = require('node:assert/strict')
const pause = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms))
const appUrl = (process.env.TINIX_APP_URL || 'http://127.0.0.1:7001').replace(/\/$/, '')

async function createEditor(browser) {
  const page = await browser.newPage()
  try {
    const directHover = page.hover.bind(page)
    const directClick = page.click.bind(page)
    async function revealMenuPath(selector) {
      const branches = await page.evaluate(selector => {
        const item = document.querySelector(selector)
        if (!item?.closest('#menu-bg')) return []
        const result = []
        for (let parent = item.parentElement; parent; parent = parent.parentElement) {
          if (parent.matches('li[data-menu-branch]')) result.unshift(parent.getAttribute('data-action'))
        }
        return result
      }, selector)
      for (const branch of branches) {
        await directHover(`#menu-bg [data-action="${branch}"]`)
        await pause(40)
      }
    }
    page.hover = async selector => { await revealMenuPath(selector); return directHover(selector) }
    page.click = async (selector, options) => { await revealMenuPath(selector); return directClick(selector, options) }
    async function assertMenu(expected, message) {
      const expanded = expected.flatMap(label => label === 'Căn chỉnh ›'
        ? ['Căn trái', 'Căn phải', 'Căn trên', 'Căn dưới', 'Căn giữa ngang', 'Căn giữa dọc']
        : label === 'Phân bố đều ›' ? ['Theo chiều ngang', 'Theo chiều dọc'] : [label])
      const actual = await page.$$eval('#menu-bg li[data-action]:not([data-menu-branch]) > [data-menu-label]', els => els.map(el => el.textContent.trim()))
      assert.deepEqual(actual.sort(), expanded.sort(), message)
    }
    await page.setViewport({ width: 1440, height: 1000 })
    const errors = []
    const networkErrors = []
    page.on('requestfailed', request => networkErrors.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack) })
    await page.goto(appUrl + '/home', { waitUntil: 'networkidle2', timeout: 60000 })
    await page.waitForSelector('#page-design')
    await page.evaluate(async () => {
      const defaults = {name:'Test image',type:'w-image',uuid:'-1',left:0,top:0,width:300,height:300,zoom:1,transform:'',radius:0,opacity:1,parent:'-1',imgUrl:'',mask:'',isContainer:false,setting:[],rotate:0,record:{width:0,height:0,minWidth:10,minHeight:10,dir:'all'},lock:false,isNinePatch:false,flip:'',sliceData:{ratio:0,left:0}}
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      window.testStore = pinia._s.get('widgetStore')
      window.testCanvas = pinia._s.get('canvasStore')
      window.testForce = pinia._s.get('forceStore')
      testCanvas.dPage.width = 800
      testCanvas.dPage.height = 600
      const image = (uuid, left, extra = {}) => ({
        ...structuredClone(defaults), uuid, left, top: 100, width: 60, height: 60,
        imgUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="lightblue"/></svg>'),
        parent: '-1', ...extra,
      })
      window.testImage = image
      window.testFixture = [image('bg', 0, { top: 0, width: 800, height: 600 }), image('a', 100), image('b', 240), image('c', 400)]
      window.testGroupFixture = [
        image('bg', 0, { top: 0, width: 800, height: 600 }),
        image('g1', 100, { type: 'w-group', isContainer: true }), image('child1', 100, { parent: 'g1' }),
        image('g2', 240, { type: 'w-group', isContainer: true }), image('child2', 240, { parent: 'g2' }),
        image('c', 400),
      ]
      window.testReset = (group = false) => {
        testStore.dWidgets = structuredClone(group ? testGroupFixture : testFixture)
        testStore.dLayouts[testCanvas.dCurrentPage].layers = testStore.dWidgets
        testStore.dSelectWidgets = []
        testStore.dActiveElement = testCanvas.dPage
      }
      testReset()
    })
    await pause()
    async function selectRegion() {
      const box = await page.$eval('.design-canvas', el => {
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 800 }
      })
      await page.keyboard.down('Control')
      await page.mouse.move(box.x + 80 * box.scale, box.y + 80 * box.scale)
      await page.mouse.down()
      await page.mouse.move(box.x + 320 * box.scale, box.y + 180 * box.scale, { steps: 8 })
      await page.mouse.up()
      await page.keyboard.up('Control')
      await pause()
    }
    const state = () => page.evaluate(() => ({
      selected: testStore.dSelectWidgets.map(w => w.uuid),
      widgets: testStore.dWidgets.map(w => ({ uuid: w.uuid, parent: w.parent, left: w.left, top: w.top, isContainer: w.isContainer })),
      copied: testStore.dCopyElement.map(w => w.uuid),
    }))
    async function openMenu(x = 120, y = 120) {
      const point = await page.$eval('.design-canvas', (el, p) => {
        const r = el.getBoundingClientRect(); return { x: r.x + p.x * r.width / 800, y: r.y + p.y * r.width / 800 }
      }, { x, y })
      await page.mouse.click(point.x, point.y, { button: 'right' })
      await page.waitForSelector('#menu-bg', { visible: true })
    }
    async function command(text) {
      const type = await page.evaluate(text => {
        const item = Array.from(document.querySelectorAll('#menu-bg li[data-action]:not([data-menu-branch])')).find(el => el.querySelector('[data-menu-label]')?.textContent.trim() === text)
        if (!item) throw new Error('Missing menu action: ' + text)
        return item.getAttribute('data-action')
      }, text)
      await page.click(`#menu-bg [data-action="${type}"]`)
      // Paste/duplicate/ungroup refresh Moveable after 400ms; ordinary commands are synchronous.
      await pause(['paste', 'duplicate', 'ungroup'].includes(type) ? 450 : 170)
    }

    async function openLayerMenu(uuid) {
      await page.click(`.widget-list li[data-uuid="${uuid}"] .widget-name`, { button: 'right' })
      await page.waitForSelector('#menu-bg', { visible: true })
    }
    async function openBlankLayerMenu() {
      const p = await blankPoint()
      await page.mouse.click(p.x, p.y, { button: 'right' })
      await page.waitForSelector('#menu-bg', { visible: true })
    }
    const blankPoint = () => page.$eval('#style-panel .layer-wrap', el => {
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 20 }
    })
    async function prepareLayers() {
      await page.click('#style-panel .style-tab .tab:nth-child(2)')
      await page.evaluate(() => {
        document.querySelectorAll('.moveable-control-box').forEach(el => el.style.removeProperty('pointer-events'))
      })
      return blankPoint()
    }
    async function prepareOtherPage() {
      await page.evaluate(() => {
        if (!testStore.dLayouts[1]) testStore.dLayouts.push({
          global: { ...testCanvas.dPage },
          layers: [{ ...testFixture[0], uuid: 'other-page', hidden: false, lock: false }],
        })
      })
    }
    return { page, browser, errors, networkErrors, pause, assert, appUrl, selectRegion, state, openMenu, command,
      assertMenu, openLayerMenu, openBlankLayerMenu, prepareLayers, prepareOtherPage }
  } catch (error) {
    await page.close()
    throw error
  }
}
module.exports = { createEditor, pause, appUrl }
