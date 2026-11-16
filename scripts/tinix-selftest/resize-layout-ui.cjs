const puppeteer = require('../../service/node_modules/puppeteer')
const { createEditor } = require('./ui/editor.cjs')

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const { page, pause, assert, errors } = await createEditor(browser)
    const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify(testStore.dLayouts)))
    for (const [width, height, adaptive] of [[300, 450, true], [250, 350, true], [150, 300, true], [250, 350, false]]) {
      console.log(`Checking ${width}x${height}, adaptive=${adaptive}`)
      await page.evaluate(() => {
        testCanvas.dPage.width = 200
        testCanvas.dPage.height = 300
        testCanvas.dPage.dpi = 300
        testStore.dWidgets = [
          testImage('g', 20, { type: 'w-group', top: 30, width: 100, height: 150, isContainer: true, record: { width: 100, height: 150 } }),
          testImage('child', 30, { parent: 'g', top: 45, width: 80, height: 100, lock: true }),
          { type: 'w-text', uuid: 'text', name: 'Text', parent: '-1', left: 10, top: 220, width: 180, height: 36, text: 'Tinix Poster', fontSize: 20,
            lineHeight: 1.5, letterSpacing: 0, opacity: 1, color: '#000000', textAlign: 'left', fontWeight: 'normal',
            fontClass: { value: 'be-vietnam-pro', url: '/static/fonts/be-vietnam-pro-400.woff2' }, record: { width: 180, height: 36, minWidth: 20, minHeight: 30 } },
        ]
        testStore.dLayouts[testCanvas.dCurrentPage].layers = testStore.dWidgets
        testStore.dSelectWidgets = []
        testStore.dActiveElement = testCanvas.dPage
      })
      await pause(400)
      await page.click('.canvas-size-toolbar > .el-button')
      await page.waitForSelector('.el-dialog .size-editor', { visible: true })
      await page.click('.el-dialog .unit-switch button:first-child')
      const checkbox = '.el-dialog .el-checkbox input'
      if (await page.$eval(checkbox, el => el.checked) !== adaptive) await page.click('.el-dialog .el-checkbox')
      for (const [index, value] of [[1, width], [2, height]]) {
        const selector = `.el-dialog .position-size > :nth-child(${index === 1 ? 1 : 3}) input`
        await page.click(selector)
        await page.$eval(selector, el => el.select())
        await page.keyboard.type(String(value))
        await page.keyboard.press('Tab')
      }
      await pause(200)
      await page.evaluate(() => {
        const h = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('historyStore')
        h.dHistoryStack.changes = []
        h.dHistoryStack.inverseChanges = []
        h.dHistoryParams.stackPointer = -1
      })
      const before = await snapshot()
      await page.click('.el-dialog button[data-photo-history]')
      await pause(500)
      const after = await snapshot()
      assert.equal(after[0].global.width, width)
      assert.equal(after[0].global.height, height)
      const ratio = adaptive ? Math.min(width / 200, height / 300) : 1
      const offset = adaptive ? (width - 200 * ratio) / 2 : 0
      assert(Math.abs(after[0].layers[1].left - (30 * ratio + offset)) < 1e-8)
      assert.equal(after[0].layers[2].fontSize, 20 * ratio)
      assert.equal(after[0].layers[2].width, 180 * ratio)
      assert.equal(await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('historyStore').dHistoryStack.changes.length), 1, 'Exactly one resize history entry')
      await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control')
      await pause(300)
      assert.deepEqual(await snapshot(), before, 'One Ctrl+Z restores page and every layer')
      await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control')
      await pause(300)
      assert.deepEqual(await snapshot(), after, 'Redo restores the resized composition')
    }
    assert.deepEqual(errors, [])
    console.log('PASS: resize dialog, same/different ratios, opt-out, one-step Ctrl+Z and redo including page + group + locked child + text')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
