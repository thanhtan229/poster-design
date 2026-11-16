const assert = require('node:assert/strict')
require('../../service/node_modules/ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', esModuleInterop: true } })
const { resizeLayoutToFit } = require('../../src/utils/tinix/resize-layout.ts')
const { historyPatches } = require('../../src/utils/widgets/diffLayouts.ts')
const { applyPatches } = require('immer')
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const fixture = () => [
  { uuid: 'group', type: 'w-group', left: 20, top: 30, width: 100, height: 150, record: { width: 100, height: 150 } },
  { uuid: 'text', parent: 'group', type: 'w-text', left: 30, top: 45, width: 80, height: 40, fontSize: 20, lineHeight: 1.5, letterSpacing: 10,
    textEffects: [{ stroke: { width: 2 }, shadow: { offsetX: 2, offsetY: 4, blur: 6 }, offset: { x: 2, y: 3 } }] },
  { uuid: 'image', type: 'w-image', left: 0, top: 0, width: 200, height: 300, lock: true, hidden: true, radius: 10, cropX: 25, cropY: 75, zoom: 2, rotate: '20deg',
    transform: 'translate(10px, -20px) scale(2) rotate(20deg)', effects: { border: 2, blur: 4, shadow: 6, brightness: 110 } },
]
for (const next of [{ width: 300, height: 450 }, { width: 250, height: 350 }, { width: 150, height: 300 }, { width: 100, height: 100 }, { width: 200, height: 300 }]) {
  const previous = { width: 200, height: 300, dpi: 300 }
  const layers = fixture()
  const before = [{ global: structuredClone(previous), layers: structuredClone(layers) }, { global: previous, layers: [] }]
  resizeLayoutToFit(layers, previous, next)
  const ratio = Math.min(next.width / 200, next.height / 300)
  const ox = (next.width - 200 * ratio) / 2, oy = (next.height - 300 * ratio) / 2
  layers.forEach((layer, index) => {
    const original = before[0].layers[index]
    near(layer.width / layer.height, original.width / original.height)
    near(layer.left, original.left * ratio + ox)
    near(layer.top, original.top * ratio + oy)
  })
  near(layers[1].left - layers[0].left, 10 * ratio)
  near(layers[1].fontSize, 20 * ratio)
  near(layers[1].textEffects[0].shadow.blur, 6 * ratio)
  assert.equal(layers[1].lineHeight, 1.5)
  assert.equal(layers[1].letterSpacing, 10)
  assert.equal(layers[2].cropX, 25)
  assert.equal(layers[2].zoom, 2)
  assert.equal(layers[2].rotate, '20deg')
  assert.equal(layers[2].lock, true)
  assert.equal(layers[2].hidden, true)
  assert.equal(layers[2].effects.brightness, 110)
  near(layers[2].effects.border, 2 * ratio)
  assert.equal(layers[2].transform, `translate(${10 * ratio}px, ${-20 * ratio}px) scale(2) rotate(20deg)`)
  const after = [{ global: { ...previous, ...next }, layers }, before[1]]
  const entry = historyPatches(before, after)
  assert.deepEqual(applyPatches(after, entry.inversePatches), before)
  assert.deepEqual(applyPatches(before, entry.patches), after)
}
const invalid = fixture(), original = structuredClone(invalid)
resizeLayoutToFit(invalid, { width: 0, height: 300 }, { width: 250, height: 350 })
assert.deepEqual(invalid, original)
console.log('PASS: uniform scaling, fit + centering in both directions, groups, text, crops, effects, hidden/locked layers, undo/redo, invalid input')
