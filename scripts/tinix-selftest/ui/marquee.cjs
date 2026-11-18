module.exports = async function (context) {
  const { page, pause, assert } = context
  await page.evaluate(() => {
    testCanvas.dZoom = 100
    testStore.dWidgets = [
      testImage('test-bg', 0, { top: 0, width: 800, height: 600 }),
      testImage('test-a', 100), testImage('test-b', 240), testImage('test-c', 400),
      testImage('test-locked', 180, { width: 40, height: 40, lock: true }),
      testImage('test-hidden', 180, { top: 150, width: 40, height: 40, hidden: true }),
    ]
    testStore.dLayouts[testCanvas.dCurrentPage].layers = testStore.dWidgets
  })
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
}
