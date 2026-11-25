// [TINIX] Kiểm thử offline công cụ dựng mẫu từ ảnh tham chiếu (scripts/lib/reference-build.mjs) trên ảnh TỔNG HỢP có đáp án biết trước.
// Không cần app, Chromium hay GPU: bộ tách nền và bộ đo chữ được thay bằng bản giả xác định.
// Chạy: node scripts/tinix-reference-build-test.mjs (hoặc npm run tinix:test)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { validate } from './tinix-drafts.mjs'
import { validateSpec, loadReference, buildFromReference, fitText, compareToReference, drawGrid, drawSideBySide, elementRect, detectHearts, uprightCrop, inpaintPushPull, paperColorOf } from './lib/reference-build.mjs'

const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const tmp = await mkdtemp(path.join(os.tmpdir(), 'tinix-refbuild-'))
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} khác ${b} quá ${tol}`)

// ── ảnh tham chiếu tổng hợp 600×600 ──────────────────────────────────────────────────────────────────────────────────
const heartAt = (cx, cy, s) => {
  const pts = []
  for (let i = 0; i < 40; i++) { const t = (i / 40) * 2 * Math.PI, x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); pts.push(`${(cx + (x / 34) * s).toFixed(1)},${(cy + (y / 34) * s).toFixed(1)}`) }
  return `<polygon points="${pts.join(' ')}" fill="#f4f4f4"/>`
}
const HEARTS = [[40, 40], [300, 30], [560, 60], [40, 330], [330, 330], [570, 560]]
let stripes = ''
for (let k = 0; k < 18; k++) stripes += `<rect x="${110 + k * 10}" y="135" width="10" height="130" fill="${k % 2 ? '#101010' : '#f0f0f0'}"/>`
const refSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#1e1d1b"/>
${HEARTS.map(([x, y]) => heartAt(x, y, 22)).join('')}
<g transform="rotate(10 200 200)"><rect x="100" y="125" width="200" height="150" fill="#fffdf1"/>${stripes}</g>
<rect x="350" y="95" width="160" height="50" fill="#f1d98a"/><rect x="380" y="113" width="100" height="14" fill="#000000"/>
<circle cx="440" cy="430" r="25" fill="#d02020"/>
<rect x="90" y="400" width="120" height="100" fill="#4a8f6a"/></svg>`
const refFile = path.join(tmp, 'ref.png')
await sharp(Buffer.from(refSvg)).png().toFile(refFile)
const ref = await loadReference(refFile)
assert.equal(ref.width, 600); assert.equal(ref.height, 600)

// ── bản giả của bộ tách nền và bộ đo chữ ─────────────────────────────────────────────────────────────────────────────────
const fakeCutout = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < info.width * info.height; i++) { const r = data[i * 4], g = data[i * 4 + 1]; data[i * 4 + 3] = r > 150 && g < 90 ? 255 : 0 }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}
const fakeMeasure = async ({ size, text }) => {
  const lines = text.split('\n'), w = Math.max(...lines.map((l) => 0.6 * size * l.length))
  return { width: w, inkWidth: w, ascent: 0.7 * size, descent: 0.2 * size, fontAscent: 0.9 * size, fontDescent: 0.25 * size }
}
const fonts = [{ alias: 'Fake', id: 1, ttf: '/static/fonts/fake.ttf' }]

const spec = {
  name: 'synthetic', canvas: { width: 1200 },
  elements: [
    { type: 'frame', name: 'Khung', center: [200, 200], size: [200, 150], rotate: 10, photos: [{ name: 'Ảnh', offset: [0, 0], size: [180, 130] }] },
    { type: 'label', name: 'Nhãn', center: [430, 120], size: [160, 50], shape: 'rect', text: 'ABC', font: 'Fake', textInk: [370, 100, 490, 140] },
    { type: 'sticker', name: 'Tròn', box: [400, 390, 480, 470] },
    { type: 'photo', name: 'Mây', center: [150, 450], size: [120, 100], mask: 'cloud' },
  ],
}

try {
  // 1) dựng ở chế độ ảnh trong ảnh mẫu
  const dir = path.join(tmp, 'assets')
  const { draft, report } = await buildFromReference({ ref, spec, assetsDir: dir, assetsUrl: '/static/collage/synthetic', cutout: fakeCutout, measure: fakeMeasure, fonts, photos: 'reference' })
  const issues = validate(draft)
  assert.deepEqual(issues, [], 'bản nháp hợp lệ (cấu trúc, id duy nhất, cha tồn tại)')
  const by = (name) => draft.layers.find((l) => l.name === name)
  assert.equal(new Set(draft.layers.map((l) => l.uuid)).size, draft.layers.length, 'uuid duy nhất')
  assert.deepEqual([draft.global.width, draft.global.height], [1200, 1200], 'khổ = canvas.width và giữ tỉ lệ ảnh mẫu')
  assert.equal(draft.layers[0].printRole, 'base'); assert.equal(draft.layers[0].lock, true)

  // 2) khung: nhóm xoay, giấy + ảnh là con của nhóm, hình học đúng tỉ lệ ×2
  const g = by('Cụm Khung')
  assert.equal(g.type, 'w-group'); assert.equal(g.rotate, '10deg'); assert.equal(g.isContainer, true)
  assert.deepEqual([g.left, g.top, g.width, g.height], [200, 250, 400, 300], 'nhóm theo toạ độ canvas')
  const paper = by('Giấy Khung'), photo = by('Ảnh')
  assert.ok(paper.parent === g.uuid && photo.parent === g.uuid && paper.printGroup === g.printGroup, 'giấy và ảnh thuộc nhóm')
  assert.equal(photo.slot, true); assert.equal(photo.templateRole, 'photo'); assert.equal(photo.fit, 'cover')
  near(parseInt(report.elements[0].paper.slice(1, 3), 16), 255, 6, 'màu giấy lấy từ viền khung')

  // 3) duỗi thẳng: hướng gradient chủ đạo (ten-xơ cấu trúc) của các sọc dọc phải ~0° sau khi cắt; sọc nghiêng 10° cho ~10°
  const orientation = async (input) => {
    const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true })
    let sxx = 0, syy = 0, sxy = 0
    for (let y = 5; y < info.height - 5; y++) for (let x = 5; x < info.width - 5; x++) {
      const gx = data[y * info.width + x + 1] - data[y * info.width + x - 1], gy = data[(y + 1) * info.width + x] - data[(y - 1) * info.width + x]
      sxx += gx * gx; syy += gy * gy; sxy += gx * gy
    }
    return { degrees: (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI, width: info.width, height: info.height }
  }
  const straight = await orientation(path.join(dir, 'photo-1.jpg'))
  assert.ok(Math.abs(straight.degrees) < 1.5, `sọc phải thẳng đứng sau khi duỗi thẳng (lệch ${straight.degrees.toFixed(2)}°, ngưỡng 1.5°)`)
  // đối chứng: cùng vùng nhưng KHÔNG duỗi thẳng phải nghiêng ~10° — để chắc phép đo phân biệt được
  const tilted = await orientation(await (await uprightCrop(ref, 200, 200, 180, 130, 0, 2)).png().toBuffer())
  assert.ok(Math.abs(Math.abs(tilted.degrees) - 10) < 2.5, `đối chứng không duỗi thẳng phải nghiêng ~10° (đo được ${tilted.degrees.toFixed(2)}°)`)
  near(straight.width, 360, 2, 'bề rộng ảnh cắt = 180 × 2'); near(straight.height, 260, 2, 'bề cao ảnh cắt = 130 × 2')

  // 4) trái tim nền: đúng 6 cái (đã loại vùng phần tử)
  assert.equal(report.background.hearts, 6, 'số trái tim nền')
  assert.equal(report.background.color, '#1e1d1b', 'màu nền lấy từ ảnh mẫu')

  // 5) nhãn: màu giấy, cỡ chữ tự khớp, khung chữ không tràn dòng, màu mực
  const label = report.elements.find((e) => e.name === 'Nhãn'), text = by('Nhãn')
  near(parseInt(label.color.slice(1, 3), 16), 0xf1, 6, 'màu nhãn (R)'); near(parseInt(label.color.slice(3, 5), 16), 0xd9, 6, 'màu nhãn (G)')
  near(label.fontSize, Math.round((100 * 2) / 1.8), 3, 'cỡ chữ khớp bề rộng mực 100 px ảnh mẫu')
  assert.ok(text.width >= 1.8 * text.fontSize, 'khung chữ rộng hơn dòng (không xuống dòng)')
  assert.equal(label.inkMeasured, true); assert.deepEqual(report.warnings, [], 'không có cảnh báo')
  assert.match(label.textColor, /^#[0-2][0-9a-f][0-2][0-9a-f][0-2][0-9a-f]$/i, 'màu mực đen')
  assert.equal(text.fontClass.alias, 'Fake'); assert.equal(text.fontClass.url, '/static/fonts/fake.ttf'); assert.equal(text.textAlign, 'center')
  // tâm mực trùng tâm mực mẫu (430,120)*2 = (860,240): tâm khung chữ cộng độ lệch baseline
  near(text.left + text.width / 2, 860, 3, 'tâm ngang của chữ')

  // 6) sticker tách bằng bộ giả: vị trí/kích thước đúng
  const sticker = by('Tròn')
  near(sticker.left + sticker.width / 2, 880, 4, 'tâm sticker X'); near(sticker.top + sticker.height / 2, 860, 4, 'tâm sticker Y'); near(sticker.width, 100, 6, 'rộng sticker')
  assert.equal(sticker.type, 'w-image')

  // 7) ảnh có mặt nạ hình
  assert.match(by('Mây').mask, /^data:image\/svg\+xml,/); assert.equal(by('Mây').slot, true)

  // 8) chế độ ảnh giữ chỗ (mặc định): không đưa ảnh của ảnh mẫu vào mẫu
  const dir2 = path.join(tmp, 'assets2')
  const built2 = await buildFromReference({ ref, spec, assetsDir: dir2, assetsUrl: '/static/collage/synthetic', cutout: fakeCutout, measure: fakeMeasure, fonts })
  const slots = built2.draft.layers.filter((l) => l.slot)
  assert.ok(slots.length === 2 && slots.every((l) => l.imgUrl.endsWith('/photo-placeholder.jpg')), 'ảnh giữ chỗ')
  await access(path.join(dir2, 'photo-placeholder.jpg'))
  await assert.rejects(access(path.join(dir2, 'photo-1.jpg')), 'không ghi ảnh cắt từ ảnh mẫu khi dùng ảnh giữ chỗ')

  // 8b) nền có hoa văn/giấy màu: viền tối nhỏ không được thành màu nền; sticker keep:'box' giữ nguyên vùng chữ nhật, không gọi bộ tách nền
  const tealSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#7fb5a0"/><rect x="0" y="0" width="600" height="60" fill="#3a2a20"/><rect x="200" y="200" width="100" height="100" fill="#cc4488"/></svg>'
  const tealRef = await sharp(Buffer.from(tealSvg)).png().toBuffer()
  let cutCalls = 0
  const built3 = await buildFromReference({ ref: await loadReference(tealRef), spec: { name: 'teal', elements: [{ type: 'sticker', name: 'Hộp', box: [200, 200, 300, 300], keep: 'box', mask: 'ellipse' }] }, assetsDir: path.join(tmp, 'assets3'), assetsUrl: '/x', cutout: async (d) => { cutCalls++; return fakeCutout(d) }, measure: fakeMeasure, fonts })
  assert.equal(built3.report.background.color, '#7fb5a0', 'nền lấy trung vị khi điểm tối chỉ là viền')
  assert.equal(cutCalls, 0, 'keep:box không gọi tách nền')
  const boxed = built3.draft.layers.find((l) => l.name === 'Hộp')
  near(boxed.width, 400, 4, 'rộng sticker keep:box (×4)'); assert.ok(boxed.mask, 'mặt nạ của sticker keep:box')
  await assert.rejects(buildFromReference({ ref: await loadReference(tealRef), spec: { name: 'teal', elements: [{ type: 'sticker', name: 'X', box: [0, 0, 50, 50], keep: 'khac' }] }, assetsDir: path.join(tmp, 'assets4'), assetsUrl: '/x', cutout: fakeCutout, measure: fakeMeasure, fonts }), /keep là cutout/)

  // 8c) hoa văn nền lấy từ ảnh mẫu: ngoài phần tử giữ đúng hoa văn, trong vùng phần tử được vá bằng màu nền xung quanh (không còn màu phần tử)
  let sx = ''
  for (let k = -20; k < 40; k++) sx += `<polygon points="${k * 40},0 ${k * 40 + 20},0 ${k * 40 + 620},600 ${k * 40 + 600},600" fill="#2a8a7a"/>`
  const patSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#8fd0c0"/>${sx}<rect x="200" y="200" width="100" height="100" fill="#cc2244"/></svg>`
  const patFile = path.join(tmp, 'pat.png'); await sharp(Buffer.from(patSvg)).png().toFile(patFile)
  const patRef = await loadReference(patFile)
  const patDir = path.join(tmp, 'assets-pat')
  const built4 = await buildFromReference({ ref: patRef, spec: { name: 'pat', background: { color: 'auto', pattern: 'reference' }, elements: [{ type: 'sticker', name: 'Hộp', box: [200, 200, 300, 300], keep: 'box' }] }, assetsDir: patDir, assetsUrl: '/x', cutout: fakeCutout, measure: fakeMeasure, fonts })
  assert.equal(built4.report.background.pattern, 'reference'); assert.equal(built4.report.background.hearts, 0)
  assert.ok(built4.draft.layers[0].imgUrl.endsWith('/background.jpg'), 'lớp nền dùng ảnh hoa văn')
  const bgRaw = await sharp(path.join(patDir, 'background.jpg')).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => { const i = (Math.round(y) * bgRaw.info.width + Math.round(x)) * bgRaw.info.channels; return [bgRaw.data[i], bgRaw.data[i + 1], bgRaw.data[i + 2]] }
  const refPx = (x, y) => { const i = (y * patRef.width + x) * 3; return [patRef.raw[i], patRef.raw[i + 1], patRef.raw[i + 2]] }
  let worst = 0
  for (const [rx, ry] of [[60, 80], [450, 120], [100, 500], [520, 520], [320, 40]]) { const a = px(rx * 4 + 2, ry * 4 + 2), b = refPx(rx, ry); worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i]))) }
  assert.ok(worst < 40, `hoa văn nền ngoài phần tử phải giống ảnh mẫu (lệch tối đa ${worst})`)
  const hole = px(1000, 1000)
  assert.ok(hole[1] > hole[0] && hole[1] > 100, `vùng phần tử phải được vá bằng màu nền, không còn đỏ (đo được ${hole})`)
  assert.ok(Math.abs(inpaintPushPull(Buffer.alloc(8 * 8 * 3, 100), Uint8Array.from({ length: 64 }, (_, i) => (i % 8 > 2 && i % 8 < 6 && i > 20 && i < 44 ? 1 : 0)), 8, 8)[27 * 3] - 100) <= 1, 'vá lỗ nền đồng màu')
  assert.throws(() => validateSpec({ name: 'x', background: { pattern: 'khac' }, elements: [{ type: 'sticker', name: 'a', box: [0, 0, 5, 5] }] }), /pattern/)

  // 8d) màu giấy khung: viền kraft (nâu, sẫm) phải ra màu kraft, không phải màu sáng của ảnh bên trong; viền trắng vẫn ra trắng
  const kraftSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#333333"/><rect x="40" y="40" width="220" height="220" fill="#a8794d"/><rect x="58" y="58" width="184" height="184" fill="#e8dede"/></svg>'
  const kraftFile = path.join(tmp, 'kraft.png'); await sharp(Buffer.from(kraftSvg)).png().toFile(kraftFile)
  const kraft = await paperColorOf(await loadReference(kraftFile), { center: [150, 150], size: [220, 220], rotate: 0 })
  assert.ok(kraft && Math.abs(parseInt(kraft.slice(1, 3), 16) - 0xa8) < 12 && Math.abs(parseInt(kraft.slice(3, 5), 16) - 0x79) < 12, `giấy kraft phải ra màu nâu (đo được ${kraft})`)

  // 9) tự khớp chữ nhiều dòng: lineHeight lấy từ chiều cao mực mẫu
  const fit = await fitText(fakeMeasure, { family: 'Fake', url: '/x', text: 'AB\nCDEFG', targetInkWidth: 300, targetInkHeight: 200, center: [500, 500] })
  near(fit.fontSize, 100, 1, 'cỡ chữ nhiều dòng'); near(fit.lineHeight, 1.1, 0.02, 'lineHeight từ chiều cao mực'); assert.ok(fit.width >= 300 * 1.1)
  near(fit.left + fit.width / 2, 500, 0.5, 'tâm ngang'); assert.ok(fit.top < 500 && fit.top + fit.height > 500, 'khung chữ bao quanh tâm')

  // 10) so sánh: giống hệt → MAE 0, SSIM 1; khác nhiều → SSIM thấp
  const same = await compareToReference(ref, await readFile(refFile), spec)
  assert.equal(same.overall.mae, 0); near(same.overall.ssim, 1, 0.001, 'SSIM ảnh giống hệt')
  const gray = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#808080' } }).png().toBuffer()
  const diff = await compareToReference(ref, gray, spec)
  assert.ok(diff.overall.ssim < 0.5 && diff.overall.mae > 20, 'ảnh khác nhiều bị phạt'); assert.ok(diff.elements['Khung'] && diff.elements['Tròn'], 'số đo theo từng phần tử')
  const side = await sharp(await drawSideBySide(ref, diff.render)).metadata(); assert.equal(side.height, 600); assert.equal(side.width, 1800)

  // [TINIX] Placeholder changes must affect neither metric, even in SSIM windows that cross their edge.
  const size = 32, area = size * size
  const flat = Buffer.alloc(area * 3, 80), altered = Buffer.from(flat)
  const owners = new Uint16Array(area), excluded = new Uint8Array(area)
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) {
    const i = y * size + x
    if (x >= 12 && x < 20 && y >= 12 && y < 20) {
      owners[i] = 1
    } else {
      excluded[i] = 1
      altered.fill(245, i * 3, i * 3 + 3)
    }
  }
  const image = { width: size, height: size, channels: 3 }
  const flatRef = { ...image, raw: flat }
  const masks = { owners, excluded, layers: [{ id: 'sticker', name: 'Sticker' }, { id: 'photo', placeholder: true }] }
  const compareMasked = async raw => compareToReference(flatRef, await sharp(raw, { raw: image }).png().toBuffer(), null, masks)
  const masked = await compareMasked(altered)
  assert.deepEqual(masked.overall, { mae: 0, ssim: 1, pixels: area - 192 })
  assert.deepEqual(masked.excluded, { placeholderPixels: 192, totalPixels: area })
  assert.deepEqual(masked.layers[0], { id: 'sticker', name: 'Sticker', status: 'scored', bounds: [12, 12, 20, 20], mae: 0, ssim: 1, pixels: 64 })
  assert.equal(masked.layers[1].status, 'placeholder')
  for (let y = 12; y < 20; y++) for (let x = 12; x < 20; x++) altered.fill(200, (y * size + x) * 3, (y * size + x + 1) * 3)
  const stickerChanged = await compareMasked(altered)
  assert.equal(stickerChanged.layers[0].mae, 120)
  assert.ok(stickerChanged.overall.ssim < 1)

  // 11) lưới toạ độ giữ nguyên kích thước ảnh
  const grid = await sharp(await drawGrid(ref, 100)).metadata(); assert.deepEqual([grid.width, grid.height], [600, 600])

  // 12) hình học phần tử
  const r = elementRect(spec.elements[0]); near(r[2] - r[0], 200 * Math.cos(Math.PI / 18) + 150 * Math.sin(Math.PI / 18), 0.01, 'hộp bao của khung xoay')
  assert.deepEqual(elementRect(spec.elements[2]), [400, 390, 480, 470])
  assert.equal(detectHearts(ref, [[0, 0, 600, 600]]).length, 0, 'loại trừ toàn bộ → không còn tim')

  // 13) spec không hợp lệ bị từ chối rõ ràng
  const bad = (mutate, re) => assert.throws(() => { const copy = structuredClone(spec); mutate(copy); validateSpec(copy) }, re)
  bad((s) => { delete s.name }, /name/); bad((s) => { s.name = 'Có Dấu' }, /slug/); bad((s) => { s.elements[0].rotate = 'a' }, /rotate/)
  bad((s) => { s.elements[0].type = 'wat' }, /type là frame/); bad((s) => { s.elements[1].font = '' }, /font/); bad((s) => { s.elements[2].box = [5, 5, 1, 1] }, /x1 > x0/)
  bad((s) => { s.elements[3].name = 'Khung' }, /trùng name/); bad((s) => { s.elements = [] }, /elements/); bad((s) => { s.canvas.width = 100 }, /canvas\.width/)
  bad((s) => { s.elements[1].color = 'red' }, /color/); bad((s) => { s.elements[3].mask = 'star' }, /mask/)
  await assert.rejects(buildFromReference({ ref, spec: { ...spec, elements: [{ ...spec.elements[1], font: 'Khong co' }] }, assetsDir: path.join(tmp, 'a3'), assetsUrl: '/x', cutout: fakeCutout, measure: fakeMeasure, fonts }), /Không thấy font "Khong co"/)
  console.log('PASS reference-build: duỗi thẳng khung xoay, giấy/màu/mực lấy từ ảnh mẫu, tim nền, sticker, tự khớp chữ không tràn dòng, ảnh giữ chỗ, so sánh, kiểm tra spec')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
