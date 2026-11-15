module.exports = async function (context) {
  const { page, pause, assert, selectRegion, state, openMenu, command } = context
  let result
  await page.evaluate(() => {
    testReset()
    document.querySelectorAll('.moveable-control-box').forEach(el => el.style.removeProperty('pointer-events'))
  })
  await pause()
  await selectRegion()
  await openMenu()
  await command('Đưa lên trên cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['bg', 'c', 'a', 'b'], 'Bring to front preserves selected order')
  await openMenu()
  await command('Đưa xuống dưới cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['a', 'b', 'bg', 'c'], 'Send to back preserves selected order')
  assert.deepEqual((await state()).selected, ['a', 'b'], 'Edge commands preserve multi-selection')
  await openMenu()
  await command('Đưa xuống dưới cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['a', 'b', 'bg', 'c'], 'Repeating at the edge is stable')
  await page.evaluate(() => testReset())
  await pause()
  await openMenu()
  await command('Đưa lên trên cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['bg', 'b', 'c', 'a'], 'Single-layer bring to front')
  await openMenu()
  await command('Đưa xuống dưới cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['a', 'bg', 'b', 'c'], 'Single-layer send to back')
  await page.evaluate(() => testReset(true))
  await pause()
  await selectRegion()
  await openMenu()
  await command('Đưa lên trên cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['bg', 'c', 'g1', 'child1', 'g2', 'child2'], 'Groups move with their children to the front')
  await openMenu()
  await command('Đưa xuống dưới cùng')
  result = await state()
  assert.deepEqual(result.widgets.map(w => w.uuid), ['g1', 'child1', 'g2', 'child2', 'bg', 'c'], 'Groups move with their children to the back')
  assert.deepEqual(result.widgets.filter(w => w.uuid.startsWith('child')).map(w => w.parent), ['g1', 'g2'])
  await page.evaluate(() => {
    testReset()
    testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'c'].includes(w.uuid))
    testForce.setUpdateSelect()
  })
  await pause(550)
  await openMenu()
  await command('Đưa xuống dưới cùng')
  assert.deepEqual((await state()).widgets.map(w => w.uuid), ['a', 'c', 'bg', 'b'], 'Nonadjacent selection preserves both selected and unselected order')
  const childOrder = await page.evaluate(() => {
    testReset(true)
    const child = { ...testStore.dWidgets.find(w => w.uuid === 'child1'), uuid: 'child1b' }
    testStore.dWidgets.splice(3, 0, child)
    testStore.moveLayersToEdge({ uuids: ['child1'], value: 1 })
    return testStore.dWidgets.map(w => [w.uuid, w.parent])
  })
  assert.deepEqual(childOrder, [['bg', '-1'], ['g1', '-1'], ['child1b', 'g1'], ['child1', 'g1'], ['g2', '-1'], ['child2', 'g2'], ['c', '-1']], 'A child layer reorders within its parent group')
  const alignCases = [
    ['left', [[100, 100], [100, 200]]],
    ['right', [[280, 100], [240, 200]]],
    ['top', [[100, 100], [240, 100]]],
    ['bottom', [[100, 220], [240, 200]]],
    ['ch', [[190, 100], [170, 200]]],
    ['cv', [[100, 160], [240, 150]]],
  ]
  async function alignCommand(align) {
    await page.hover('#menu-bg [data-action="align"]')
    await page.waitForSelector('[data-action="align"] > .submenu', { visible: true })
    assert.equal(await page.$$eval('[data-action="align"] > .submenu > li[data-action]', els => els.length), 6, 'Alignment submenu has six commands')
    await page.click(`.submenu [data-action="align-${align}"]`)
    await pause()
    assert.equal(await page.$eval('#menu-bg', el => getComputedStyle(el).display), 'none', 'Alignment closes the menu')
  }
  for (const [align, expected] of alignCases) {
    await page.evaluate(() => {
      testReset()
      Object.assign(testStore.dWidgets.find(w => w.uuid === 'b'), { top: 200, width: 100, height: 80 })
      testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'b'].includes(w.uuid))
      testForce.setUpdateSelect()
    })
    await pause(550)
    await openMenu()
    await alignCommand(align)
    result = await state()
    assert.deepEqual(result.widgets.filter(w => ['a', 'b'].includes(w.uuid)).map(w => [w.left, w.top]), expected, `Alignment ${align} uses the original selection bounds`)
    assert.deepEqual(result.selected, ['a', 'b'], 'Alignment preserves the selection')
    assert.deepEqual(result.widgets.filter(w => ['bg', 'c'].includes(w.uuid)).map(w => [w.left, w.top]), [[0, 0], [400, 100]], 'Alignment leaves unselected layers alone')
  }
  await page.evaluate(() => testReset(true))
  await pause()
  await selectRegion()
  await openMenu()
  await alignCommand('left')
  result = await state()
  assert.deepEqual(result.widgets.filter(w => ['g1', 'child1', 'g2', 'child2'].includes(w.uuid)).map(w => w.left), [100, 100, 100, 100], 'Aligning groups moves their children by the same amount')
  await page.evaluate(() => testReset())
  await pause()
  await openMenu()
  await alignCommand('ch')
  assert.equal((await state()).widgets.find(w => w.uuid === 'a').left, 370, 'A single element aligns to the page')
  const textAligned = await page.evaluate(() => {
    testReset()
    const a = testStore.dWidgets.find(w => w.uuid === 'a')
    a.width = undefined
    a.record.width = 75
    testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'b'].includes(w.uuid))
    testStore.alignSelection('right')
    return a.left
  })
  assert.equal(textAligned, 225, 'Alignment supports measured dimensions when width is not set')
  await page.evaluate(() => {
    testReset()
    document.getElementById('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: innerWidth - 2, clientY: innerHeight - 2 }))
  })
  await page.waitForSelector('#menu-bg', { visible: true })
  await page.hover('#menu-bg [data-action="align"]')
  await page.waitForSelector('[data-action="align"] > .submenu', { visible: true })
  await pause()
  const submenuBounds = await page.$eval('[data-action="align"] > .submenu', el => {
    const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }
  })
  assert(submenuBounds.left >= 0 && submenuBounds.right <= submenuBounds.width && submenuBounds.top >= 0 && submenuBounds.bottom <= submenuBounds.height, 'Alignment submenu stays inside the viewport')
  await page.mouse.click(10, 10)
  async function distributeCommand(axis) {
    await page.hover('#menu-bg [data-action="distribute"]')
    await page.waitForSelector('[data-action="distribute"] > .submenu', { visible: true })
    assert.equal(await page.$$eval('[data-action="distribute"] > .submenu > li[data-action]', els => els.length), 2)
    await page.click(`.submenu [data-action="distribute-${axis}"]`)
    await pause()
    assert.equal(await page.$eval('#menu-bg', el => getComputedStyle(el).display), 'none')
  }
  for (const [axis, expected] of [['horizontal', [280, 240]], ['vertical', [240, 290]]]) {
    await page.evaluate(() => {
      testReset()
      Object.assign(testStore.dWidgets.find(w => w.uuid === 'b'), { left: 240, top: 240, width: 100, height: 80 })
      Object.assign(testStore.dWidgets.find(w => w.uuid === 'c'), { left: 500, top: 500, width: 40, height: 40 })
      testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'b', 'c'].includes(w.uuid)).reverse()
      testForce.setUpdateSelect()
    })
    await pause(550)
    await openMenu()
    assert.equal(await page.$eval('[data-action="distribute"]', el => el.getAttribute('aria-disabled')), 'false')
    await distributeCommand(axis)
    result = await state()
    const middle = result.widgets.find(w => w.uuid === 'b')
    assert.deepEqual([middle.left, middle.top], expected, `${axis} divides edge-to-edge gaps for unequal dimensions`)
    assert.deepEqual(result.widgets.filter(w => ['a', 'c'].includes(w.uuid)).map(w => [w.left, w.top]), [[100, 100], [500, 500]], 'First and last elements stay anchored')
    assert.deepEqual(result.selected, ['c', 'b', 'a'], 'Distribution preserves selection independent of selection order')
    assert.deepEqual([result.widgets[0].left, result.widgets[0].top], [0, 0], 'Unselected background does not move')
  }
  await page.evaluate(() => {
    testReset(true)
    Object.assign(testStore.dWidgets.find(w => w.uuid === 'c'), { left: 500, width: 40 })
    testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['g1', 'g2', 'c'].includes(w.uuid))
    testForce.setUpdateSelect()
  })
  await pause(550)
  await openMenu()
  await distributeCommand('horizontal')
  result = await state()
  assert.deepEqual(result.widgets.filter(w => ['g1', 'child1', 'g2', 'child2', 'c'].includes(w.uuid)).map(w => w.left), [100, 100, 300, 300, 500], 'Groups and their children move together')
  const distributionChecks = await page.evaluate(() => {
    testReset()
    testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'b'].includes(w.uuid))
    const before = JSON.stringify(testStore.dWidgets)
    testStore.distributeSelection('horizontal')
    const tooFewUnchanged = before === JSON.stringify(testStore.dWidgets)
    Object.assign(testStore.dWidgets.find(w => w.uuid === 'a'), { width: undefined, record: { width: 60 } })
    Object.assign(testStore.dWidgets.find(w => w.uuid === 'b'), { left: 220, width: 70 })
    Object.assign(testStore.dWidgets.find(w => w.uuid === 'c'), { left: 420, width: 90 })
    testStore.dWidgets.push({ ...testStore.dWidgets.find(w => w.uuid === 'c'), uuid: 'd', left: 700, width: 50 })
    testStore.dSelectWidgets = testStore.dWidgets.filter(w => ['a', 'b', 'c', 'd'].includes(w.uuid))
    testStore.distributeSelection('horizontal')
    const distributed = testStore.dWidgets.filter(w => ['a', 'b', 'c', 'd'].includes(w.uuid))
    const gaps = distributed.slice(1).map((w, i) => w.left - distributed[i].left - (distributed[i].width || distributed[i].record.width))
    return { tooFewUnchanged, gaps }
  })
  assert(distributionChecks.tooFewUnchanged, 'The action also guards fewer than three elements')
  assert(distributionChecks.gaps.every(gap => Math.abs(gap - 380 / 3) < 1e-8), 'Fractional spacing and measured text sizes are handled without rounding drift')
}
