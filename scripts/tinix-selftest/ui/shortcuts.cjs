module.exports = async function (context) {
  const { page, browser, pause, assert, state, command, openBlankLayerMenu } = context
  const selectedIds = () => page.evaluate(() => (testStore.dSelectWidgets.length ? testStore.dSelectWidgets : [testStore.dActiveElement])
    .filter(w => w && w.uuid !== '-1').map(w => w.uuid))
  const unfocus = () => page.evaluate(() => { document.activeElement?.blur?.(); window.getSelection()?.removeAllRanges() })
  async function selectAll(modifier = 'Control') {
    await page.keyboard.down(modifier); await page.keyboard.press('a'); await page.keyboard.up(modifier)
    await pause(150)
  }
  const escape = async () => { await page.keyboard.press('Escape'); await pause(150) }
  const blankMenu = openBlankLayerMenu
  await page.click('#style-panel .style-tab .tab:nth-child(2)')
  await unfocus()
  const before = (await state()).widgets
  await selectAll()
  assert.deepEqual(await selectedIds(), ['bg', 'a', 'b', 'c'], 'Ctrl+A selects all canvas roots')
  assert.equal(await page.$eval('[data-feedback-message]', el => el.textContent.trim()), 'Đã chọn 4 phần tử', 'Keyboard selection uses menu feedback')
  assert.equal(await page.evaluate(() => String(window.getSelection())), '', 'Ctrl+A does not select webpage text')
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, repeat: true, bubbles: true, cancelable: true })))
  assert(await page.$('[data-feedback-undo]'), 'Key repeat does not rerun the command or discard feedback')
  await page.click('[data-feedback-undo]')
  await pause(200)
  assert.deepEqual(await selectedIds(), [], 'Quick undo also restores keyboard selections')
  await unfocus()
  await selectAll()
  await escape()
  assert.deepEqual(await selectedIds(), [], 'Escape deselects all')
  assert.equal(await page.$eval('[data-feedback-message]', el => el.textContent.trim()), 'Đã bỏ chọn 4 phần tử')
  assert.deepEqual((await state()).widgets, before, 'Selection shortcuts do not alter layer data')
  await page.evaluate(() => {
    testReset(true)
    testStore.dWidgets.find(w => w.uuid === 'bg').hidden = true
    testStore.dWidgets.find(w => w.uuid === 'c').lock = true
  })
  await pause()
  await unfocus()
  await selectAll()
  assert.deepEqual(await selectedIds(), ['g1', 'g2'], 'Ctrl+A skips hidden/locked roots and treats groups as units')
  await blankMenu()
  await page.hover('[data-action="selection-menu"]')
  assert.equal(await page.$eval('[data-action="select-all"] [data-menu-shortcut]', el => el.textContent.trim()), 'Ctrl+A')
  assert.equal(await page.$eval('[data-action="deselect-all"] [data-menu-shortcut]', el => el.textContent.trim()), 'Esc')
  assert.equal(await page.$eval('[data-action="select-all"]', el => el.getAttribute('aria-keyshortcuts')), 'Control+A')
  assert.equal(await page.$eval('[data-action="deselect-all"]', el => el.getAttribute('aria-keyshortcuts')), 'Escape')
  assert(await page.$eval('[data-action="select-all"]', el => el.querySelector('[data-menu-label]').getBoundingClientRect().right < el.querySelector('kbd').getBoundingClientRect().left), 'Shortcut hints are right-aligned beside command names')
  await page.screenshot({ path: '.runtime/selection-shortcuts.png' })
  await escape()
  assert.deepEqual(await selectedIds(), [])
  assert.equal(await page.$eval('#menu-bg', el => getComputedStyle(el).display), 'none', 'Escape closes an open context menu too')
  await blankMenu()
  await selectAll()
  assert.equal(await page.$eval('#menu-bg', el => getComputedStyle(el).display), 'none', 'Ctrl+A closes the menu after selecting')
  assert.deepEqual(await selectedIds(), ['g1', 'g2'])
  await page.evaluate(() => {
    testReset()
    for (const w of testStore.dWidgets) w.lock = w.uuid !== 'a'
  })
  await unfocus()
  await selectAll()
  assert.deepEqual(await selectedIds(), ['a'], 'Ctrl+A uses single selection for one eligible element')
  assert(await page.$('.moveable-control-box .moveable-direction'), 'Single selection retains resize controls')
  // Native input/textarea selection and deletion must stay inside the input.
  for (const tag of ['input', 'textarea']) {
    await page.evaluate(tag => {
      const el = document.createElement(tag)
      el.id = 'shortcut-input'
      el.value = 'Native input selection'
      Object.assign(el.style, { position: 'fixed', left: '500px', top: '150px', zIndex: '200000' })
      document.body.append(el); el.focus()
    }, tag)
    await selectAll()
    assert.deepEqual(await page.$eval('#shortcut-input', el => [el.selectionStart, el.selectionEnd]), [0, 22], 'Ctrl+A keeps native text selection')
    await escape()
    assert.deepEqual(await selectedIds(), ['a'], 'Escape inside an input does not deselect the canvas')
    await page.keyboard.press('Backspace')
    assert.equal(await page.$eval('#shortcut-input', el => el.value), '')
    assert.equal((await state()).widgets.length, 4, 'Editing an input does not delete canvas elements')
    await page.$eval('#shortcut-input', el => el.remove())
  }
  await page.evaluate(() => {
    const el = document.createElement('div')
    el.id = 'shortcut-editor'; el.contentEditable = 'plaintext-only'
    el.innerHTML = '<span>Nested editable text</span>'
    Object.assign(el.style, { position: 'fixed', left: '500px', top: '150px', zIndex: '200000' })
    document.body.append(el); el.focus()
  })
  await selectAll()
  assert.equal(await page.evaluate(() => String(window.getSelection())), 'Nested editable text', 'Plaintext-only and nested editable content use native Ctrl+A')
  await escape()
  assert.deepEqual(await selectedIds(), ['a'])
  await page.$eval('#shortcut-editor', el => el.remove())
  await unfocus()
  await page.evaluate(() => { testStore.dWidgets.find(w => w.uuid === 'a').editable = true })
  await selectAll()
  assert.deepEqual(await selectedIds(), ['a'], 'An active canvas text-editing session is protected even if focus moves')
  await page.evaluate(() => { testStore.dWidgets.find(w => w.uuid === 'a').editable = false })
  // Real layer-name editing keeps Ctrl+A and lets Esc cancel renaming.
  await unfocus()
  await page.$eval('.widget-list li[data-uuid="a"]', el => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
  await page.waitForSelector('.widget-rename')
  await page.focus('.widget-rename')
  await selectAll()
  assert(await page.$eval('.widget-rename', el => el.selectionStart === 0 && el.selectionEnd === el.value.length))
  await escape()
  assert.equal(await page.$('.widget-rename'), null)
  assert.deepEqual(await selectedIds(), ['a'])
  await unfocus()
  // An actual app dialog handles Escape without changing the selection behind it.
  await page.click('.canvas-library-button')
  await page.waitForSelector('.el-dialog', { visible: true })
  await page.$eval('.el-dialog button', el => el.focus())
  await selectAll()
  assert.deepEqual(await selectedIds(), ['a'], 'Dialog focus prevents selecting the canvas behind it')
  await escape()
  assert.deepEqual(await selectedIds(), ['a'], 'Escape closes a dialog without deselecting behind it')
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('.el-dialog')).some(el => el.getClientRects().length))
  await unfocus()
  for (const event of [{ key: 'a', ctrlKey: true, isComposing: true }, { key: 'a', ctrlKey: true, shiftKey: true }, { key: 'a', ctrlKey: true, altKey: true }]) {
    const prevented = await page.evaluate(init => {
      const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
      document.body.dispatchEvent(e); return e.defaultPrevented
    }, event)
    assert.equal(prevented, false, 'IME/other modifier combinations are left alone')
    assert.deepEqual(await selectedIds(), ['a'])
  }
  await page.evaluate(() => { testStore.dWidgets.forEach(w => { w.lock = true }) })
  await escape()
  await selectAll()
  assert.deepEqual(await selectedIds(), [], 'Ctrl+A is safe with no eligible elements')
  await page.evaluate(() => { testStore.dWidgets = [] })
  await selectAll(); await escape()
  assert.deepEqual(await selectedIds(), [], 'Shortcuts are safe on an empty canvas')
  const fixtures = await page.evaluate(() => testFixture)
  const mac = await browser.newPage()
  await mac.setViewport({ width: 1440, height: 1000 })
  await mac.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
  await mac.goto((process.env.TINIX_APP_URL || 'http://127.0.0.1:7001') + '/home', { waitUntil: 'networkidle2', timeout: 60000 })
  await mac.waitForSelector('#page-design')
  await mac.evaluate(fixtures => {
    const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const w = p._s.get('widgetStore'), c = p._s.get('canvasStore')
    w.dWidgets = fixtures; w.dLayouts[c.dCurrentPage].layers = w.dWidgets; w.dSelectWidgets = []; w.dActiveElement = c.dPage
    window.macWidgets = w
  }, fixtures)
  await mac.keyboard.down('Meta'); await mac.keyboard.press('a'); await mac.keyboard.up('Meta')
  await pause(150)
  assert.deepEqual(await mac.evaluate(() => macWidgets.dSelectWidgets.map(w => w.uuid)), ['bg', 'a', 'b', 'c'], 'Cmd+A works on macOS')
  await mac.click('#style-panel .style-tab .tab:nth-child(2)')
  await mac.evaluate(() => {
    const el = document.querySelector('.layer-wrap')
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1300, clientY: 500 }))
  })
  await mac.waitForSelector('#menu-bg', { visible: true })
  assert.equal(await mac.$eval('[data-action="select-all"] kbd', el => el.textContent.trim()), '⌘+A', 'Mac menus show the matching modifier')
  assert.equal(await mac.$eval('[data-action="select-all"]', el => el.getAttribute('aria-keyshortcuts')), 'Meta+A')
  await mac.keyboard.press('Escape'); await pause(150)
  assert.deepEqual(await mac.evaluate(() => macWidgets.dSelectWidgets.map(w => w.uuid)), [])
  await mac.close()
}
