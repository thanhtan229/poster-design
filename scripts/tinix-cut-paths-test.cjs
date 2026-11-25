// [TINIX] Kiểm thử offline đường cắt laser (service/src/tinix/cutPaths.ts) và dấu căn của bộ xếp (collage-print.ts) bằng hình có đáp án biết trước.
const assert = require('node:assert/strict')
const { alphaFromRenders, signedDistance, traceLevel, buildCutSvg, simplifyClosed, polygonArea } = require('../service/src/tinix/cutPaths.ts')
const { planCollagePrint, markCorners, MARK } = require('../src/utils/tinix/collage-print.ts')

const W = 260, H = 160, DPI = 254 // 1 px = 0.1 mm
const blank = () => new Uint8Array(W * H)
const rect = (a, x0, y0, x1, y1, v = 255) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * W + x] = v }
const disc = (a, cx, cy, r, v = 255) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) a[y * W + x] = v }
const place = (x, y, w, h, cutInset) => ({ x, y, width: w, height: h, cutInset })
const paths = (svg, group) => {
  const g = new RegExp(`<g id="${group}"[^>]*>([\\s\\S]*?)</g>`).exec(svg)[1]
  return [...g.matchAll(/<path d="([^"]+)"/g)].map((m) => [...m[1].matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((n) => [Number(n[1]), Number(n[2])]))
}
const bbox = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) })
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} khác ${b} quá ${tol}`)
const perimeter = (pts) => pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0)

// 1) alpha từ hai lần dựng: trong suốt hoàn toàn, đục hoàn toàn, nửa trong suốt màu xám 100
{
  const white = Uint8Array.from([255, 255, 255, 255, 40, 80, 120, 255, 178, 178, 178, 255]) // RGBA
  const black = Uint8Array.from([0, 0, 0, 255, 40, 80, 120, 255, 50, 50, 50, 255])
  const a = alphaFromRenders(white, black, 3, 1, 4)
  assert.equal(a[0], 0, 'trong suốt'); assert.equal(a[1], 255, 'đục'); near(a[2], 128, 2, 'nửa trong suốt')
}
// 2) hình chữ nhật 100×60 px (10×6 mm): bao ngoài đúng, và lùi 1 mm vào mỗi cạnh
{
  const a = blank(); rect(a, 40, 30, 140, 90)
  const flat = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(30, 20, 120, 80)], defaultInsetMm: 0 })
  assert.match(flat.svg, /width="26mm" height="16mm" viewBox="0 0 26 16"/); assert.equal(flat.pieces, 1)
  const [r] = paths(flat.svg, 'Cat'); const b = bbox(r)
  near(b.x0, 4, 0.12, 'x0'); near(b.y0, 3, 0.12, 'y0'); near(b.x1, 14, 0.12, 'x1'); near(b.y1, 9, 0.12, 'y1')
  const inset = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(30, 20, 120, 80, 10)] })
  const bi = bbox(paths(inset.svg, 'Cat')[0])
  near(bi.x0, 5, 0.12, 'x0 lùi'); near(bi.y0, 4, 0.12, 'y0 lùi'); near(bi.x1, 13, 0.12, 'x1 lùi'); near(bi.y1, 8, 0.12, 'y1 lùi')
  assert.ok(r.length <= 12, `hình chữ nhật chỉ cần vài đỉnh (đo được ${r.length})`)
}
// 3) hình tròn bán kính 40 px (4 mm): chu vi đúng; lùi 1 mm → bán kính 3 mm
{
  const a = blank(); disc(a, 90, 80, 40)
  const c0 = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(40, 30, 100, 100)], defaultInsetMm: 0 })
  near(perimeter(paths(c0.svg, 'Cat')[0]), 2 * Math.PI * 4, 0.4, 'chu vi hình tròn')
  const c1 = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(40, 30, 100, 100, 10)] })
  near(perimeter(paths(c1.svg, 'Cat')[0]), 2 * Math.PI * 3, 0.4, 'chu vi sau khi lùi 1 mm')
  const b = bbox(paths(c1.svg, 'Cat')[0]); near(b.x1 - b.x0, 6, 0.15, 'đường kính sau khi lùi')
}
// 4) mỗi mảnh lùi theo khai báo riêng của nó
{
  const a = blank(); rect(a, 20, 20, 100, 80); rect(a, 150, 20, 230, 80)
  const r = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(10, 10, 100, 80, 20), place(140, 10, 100, 80, 0)], defaultInsetMm: 0.3 })
  const boxes = paths(r.svg, 'Cat').map(bbox).sort((p, q) => p.x0 - q.x0)
  near(boxes[0].x1 - boxes[0].x0, 8 - 4, 0.15, 'mảnh trái lùi 2 mm mỗi cạnh')
  near(boxes[1].x1 - boxes[1].x0, 8 - 0.6, 0.15, 'mảnh phải lùi mặc định 0,3 mm mỗi cạnh')
}
// 5) vòng có lỗ cho ra hai đường; đốm nhiễu nhỏ bị bỏ
{
  const a = blank(); disc(a, 90, 80, 40); disc(a, 90, 80, 15, 0); rect(a, 200, 100, 202, 102) // đốm 0,2×0,2 mm
  const r = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(40, 30, 100, 100), place(190, 90, 30, 30)], defaultInsetMm: 0 })
  assert.equal(r.loops, 2, `vòng ngoài + lỗ, bỏ đốm nhiễu (đo được ${r.loops})`)
}
// 6) dấu căn trong SVG và hình học dấu căn của bộ xếp
// [TINIX] The selected unit drops interior holes, while another unit keeps its normal contours.
{
  const alpha = blank()
  disc(alpha, 55, 50, 30); disc(alpha, 55, 50, 12, 0)
  disc(alpha, 175, 50, 30); disc(alpha, 175, 50, 12, 0)
  rect(alpha, 31, 100, 68, 135); rect(alpha, 85, 100, 112, 135)
  const placement = place(10, 10, 110, 135)
  const options = { alpha, width: W, height: H, dpi: DPI, defaultInsetMm: 0 }
  const normal = buildCutSvg({ ...options, placements: [placement, place(130, 10, 100, 80)] })
  const exterior = buildCutSvg({ ...options, placements: [{ ...placement, cutOuterOnly: true }, place(130, 10, 100, 80)] })
  assert.equal(normal.loops, 6)
  assert.equal(exterior.loops, 5)
  assert.equal(alpha[50 * W + 55], 0)
}
{
  const m = markCorners(W, H, DPI)
  assert.equal(m.length, 3); near(m[0].x, MARK.offsetMm * 10, 0.01, 'TL x'); near(m[1].x, W - MARK.offsetMm * 10, 0.01, 'TR x'); near(m[2].y, H - MARK.offsetMm * 10, 0.01, 'BL y')
  const a = blank(); rect(a, 60, 40, 120, 100)
  const r = buildCutSvg({ alpha: a, width: W, height: H, dpi: DPI, placements: [place(50, 30, 80, 80)], marks: m })
  const marks = paths(r.svg, 'Can'); assert.equal(marks.length, 3)
  near(marks[0][1][0], 3, 0.01, 'đỉnh dấu TL x'); near(marks[0][1][1], 3, 0.01, 'đỉnh dấu TL y'); near(marks[0][0][0], 8, 0.01, 'cánh dấu TL dài 5 mm')
  near(marks[1][1][0], 23, 0.01, 'đỉnh dấu TR x'); near(marks[2][1][1], 13, 0.01, 'đỉnh dấu BL y')
}
// 7) bộ xếp: dấu căn chỉ thêm khi bật và lề đủ; không vào placements; mang cutInset của mảnh
{
  const image = (uuid, w, h, extra = {}) => ({ uuid, type: 'w-image', parent: '-1', left: 0, top: 0, width: w, height: h, printRole: 'raised', ...extra })
  const lay = { global: { width: 1000, height: 800, dpi: 254, backgroundColor: '#eee' }, layers: [image('bg', 1000, 800, { printRole: 'base' }), image('a', 300, 200, { cutInset: 12, cutOuterOnly: true }), image('b', 200, 200)] }
  const base = { marginMm: 10, gapMm: 3 }
  const off = planCollagePrint(lay, base), on = planCollagePrint(lay, { ...base, marks: true }), narrow = planCollagePrint(lay, { marginMm: 2, gapMm: 3, marks: true })
  const cut = (p) => p.layouts.slice(1, -1)
  assert.ok(cut(off).every((s) => s.layers.every((l) => !l.printMark)), 'mặc định không có dấu căn')
  assert.ok(cut(on).every((s) => s.layers.filter((l) => l.printMark).length === 3), 'bật dấu căn: 3 dấu mỗi tờ cắt')
  assert.ok(cut(narrow).every((s) => s.layers.every((l) => !l.printMark)), 'lề hẹp: không thêm dấu')
  assert.equal(on.placements.length, 2, 'dấu căn không phải mảnh'); assert.equal(on.layouts[0].layers.filter((l) => l.printMark).length, 0, 'tờ nền và thành phẩm không có dấu')
  assert.equal(on.layouts.at(-1).layers.filter((l) => l.printMark).length, 0)
  assert.equal(on.placements.find((p) => p.width === 300).cutInset, 12); assert.equal(on.placements.find((p) => p.width === 200).cutInset, 0)
  assert.equal(on.placements.find((p) => p.width === 300).cutOuterOnly, true)
  assert.equal(on.placements.find((p) => p.width === 200).cutOuterOnly, undefined)
  // dấu căn nằm trong vùng lề, không đè lên mảnh nào
  const mk = cut(on)[0].layers.filter((l) => l.printMark), margin = Math.ceil((10 * 254) / 25.4)
  for (const l of mk) assert.ok(l.left < margin || l.top < margin || l.left + l.width > 1000 - margin || l.top + l.height > 800 - margin, 'dấu căn nằm ở vùng lề')
}
// 8) đơn giản hóa vòng kín giữ diện tích và bỏ bớt đỉnh
{
  const sq = []; for (let i = 0; i <= 100; i++) sq.push([i, 0]); for (let i = 1; i <= 100; i++) sq.push([100, i]); for (let i = 99; i >= 0; i--) sq.push([i, 100]); for (let i = 99; i >= 1; i--) sq.push([0, i])
  const s = simplifyClosed(sq, 0.5); assert.ok(s.length <= 6, `vuông còn ${s.length} đỉnh`); near(Math.abs(polygonArea(s)), 10000, 50, 'diện tích')
}
console.log('PASS cut-paths: alpha từ hai lần dựng, đường viền đúng mm, lùi theo từng mảnh, lỗ và nhiễu, dấu căn, bộ xếp (bật/tắt, lề, không vào placements)')
