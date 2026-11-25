// [TINIX] Cùng định dạng M/L/Z theo mm như buildCutSvg, kể cả dấu căn.
import assert from 'assert'
import { inspectCutSheet } from '../../src/utils/tinix/cut-readiness'
import { createTrimCache, measureTrimAlpha } from '../../src/utils/tinix/trim-edge-scan' // [TINIX]

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y} L${x+w} ${y} L${x+w} ${y+h} L${x} ${y+h} Z`
const path = (d: string) => `<path d="${d}"/>`
const svg = (paths: string[]) => `<svg width="100mm" height="100mm">
  <g id="Cat">${paths.map(path).join('')}</g>
  <g id="Can">${path('M3 8 L3 3 L8 3')}</g></svg>`
const pieces = [
  { unitId: 'group', sheet: 0, x: 0, y: 0, width: 30, height: 30 },
  { unitId: 'bridge', sheet: 0, x: 31, y: 0, width: 30, height: 30 },
  { unitId: 'missing', sheet: 0, x: 65, y: 0, width: 10, height: 10 },
  { unitId: 'next-sheet', sheet: 1, x: 65, y: 0, width: 10, height: 10 },
]
const narrow = 'M32 2 L38 2 L38 4.5 L42 4.5 L42 2 L48 2 L48 8 L42 8 L42 5.5 L38 5.5 L38 8 L32 8 Z'
const tip = 'M32 12 L38 12 L45 15 L38 18 L32 18 Z'
const paths = [rect(3, 3, 20, 20), rect(5, 5, 8, 8), rect(6, 6, 3, 3), rect(15, 5, 5, 1), narrow, tip, rect(83, 3, 3, 3)]
const [group, bridge, missing, unknown] = inspectCutSheet(svg(paths), pieces, [{id:'group',name:'Cụm giấy'}], 1, 25.4)
assert.strictEqual(group.name, 'Cụm giấy')
assert.strictEqual(group.parts.length, 2, 'Vùng giấy trong lỗ vẫn là mảnh rời')
assert.strictEqual(group.box?.width, 20)
assert.strictEqual(group.holes, 2)
assert.strictEqual(group.smallHoles.length, 1)
assert(Math.abs(group.smallHoles[0].openingMm - 1) <= .125)
assert.strictEqual(group.smallHoles[0].points.length, 4)
assert.strictEqual(bridge.narrowJoins.length, 1, 'Chỉ đánh dấu chỗ nối giữa hai vùng, bỏ qua đầu nhọn')
assert(bridge.narrowJoins[0].x > 38 && bridge.narrowJoins[0].x < 42,
  'Điểm cảnh báo nằm trên chỗ nối, không nằm ở góc hộp mảnh')
assert.strictEqual(missing.box, null)
assert.strictEqual(unknown.id, '')
assert.strictEqual(unknown.parts.length, 1)
assert.strictEqual(inspectCutSheet(svg(paths), pieces, [], 1, 25.4, 1)[1].narrowJoins.length, 0)
assert.throws(() => inspectCutSheet(svg(paths), pieces, [], 1, 25.4, Number.NaN))
const trim = (x: number, y: number, coverage = 255) => measureTrimAlpha(Uint8Array.of(coverage),1,1,x,y,100,150)
assert.equal(trim(2, 2).status,'inside')
assert.deepStrictEqual(trim(0,149).edges,['left','bottom'])
assert.equal(trim(1,100).status,'touching')
assert.deepStrictEqual(trim(-2,150).extent,{ left:2, top:0, right:0, bottom:1 })
assert.equal(trim(-2,150).status,'overflow')
assert.equal(trim(-4,150,127).status,'unknown')
assert.equal(trim(-4,150,128).status,'overflow')
const cache = createTrimCache<ReturnType<typeof trim>>(2)
cache.set('sticker','position-A',trim(2,2))
cache.set('frame','parent-A',trim(0,1))
assert.equal(cache.get('sticker','position-A')?.status,'inside')
assert.equal(cache.get('sticker','position-B'),undefined)
cache.set('frame','parent-B',trim(2,2,0))
assert.equal(cache.get('frame','parent-B'),undefined)
cache.set('text','font-A',trim(0,1))
assert.equal(cache.get('frame','parent-A'),undefined)
assert.equal(cache.get('sticker','position-A')?.status,'inside')
console.log('Kiểm đường cắt: mm, dấu căn, mảnh rời, lỗ, chỗ nối và ngưỡng kiểm đạt')
