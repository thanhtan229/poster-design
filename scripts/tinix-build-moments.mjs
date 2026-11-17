// [TINIX] Dựng trang scrapbook "Little Moments" (30×20 cm, xem trên màn hình) từ ảnh thật trong thư viện.
// Toàn bộ đồ họa vẽ bằng SVG/thuật toán (nền họa tiết, giấy xé, khung có hình, băng dính, sticker, cờ phướn, nhãn), chữ dùng font thật.
// Không dùng pixel nào của ảnh mẫu.
//   node scripts/tinix-build-moments.mjs --output FILE [--photos 1713,1714,1715,1716,1717] [--placeholders]
//   --placeholders: dùng ảnh giữ chỗ thay vì ảnh thật (để lưu thành mẫu dùng lại).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { imageLayer, textLayer, groupLayer } from './lib/reference-build.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'service', 'package.json'))
const Database = require('better-sqlite3')
const sharp = require('sharp')

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const out = arg('--output')
if (!out) throw new Error('--output FILE là bắt buộc')
const ids = (arg('--photos') || '1713,1714,1715,1716,1717').split(',').map(Number)
if (ids.length !== 5 || ids.some((n) => !Number.isInteger(n))) throw new Error('--photos cần đúng 5 mã ảnh')
const placeholders = process.argv.includes('--placeholders')

// ── hình học: 2400×1600 px = 30×20 cm → 203,2 DPI ──
const W = 2400, H = 1600, DPI = +(W / (30 / 2.54)).toFixed(1)
const C = {
  paper: '#fffdf8', cream: '#f8f0df', blue: '#cfe1ec', blueD: '#6f9bb8', blueM: '#a9c9dd', blush: '#f1c4bc', coral: '#e2806f', butter: '#f6e7b4',
  yellow: '#f4cf63', sage: '#b7cdb2', sageD: '#8fae8b', kraft: '#dfc49b', text: '#5a4636', soft: '#8a7863',
}
const f1 = (n) => +n.toFixed(1)
let seed = 20261117
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const assetsDir = path.join(root, 'service', 'static', 'collage', 'moments-a')
const assetsUrl = '/static/collage/moments-a'
await mkdir(assetsDir, { recursive: true })
const writeAsset = async (name, buf) => { await writeFile(path.join(assetsDir, name), buf); return `${assetsUrl}/${name}` }
const svgPng = (w, h, body) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)).png().toBuffer()
const maskUri = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)

// bóng đổ nướng sẵn vào ảnh PNG (khung chữ nhật của lớp không vẽ được bóng cho hình bất kỳ)
const dropFilter = (id, W2, H2, dy = 7, blur = 9, op = 0.3) => `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W2}" height="${H2}"><feGaussianBlur in="SourceAlpha" stdDeviation="${blur / 2}"/><feOffset dx="0" dy="${dy}" result="o"/><feComponentTransfer><feFuncA type="linear" slope="${op}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

// ── ảnh thật trong thư viện (chỉ đọc DB) ──
const db = new Database(path.join(root, 'service', 'data', 'poster.db'), { readonly: true })
const photos = ids.map((id) => {
  const r = db.prepare("SELECT id, url, web_url, width, height FROM user_images WHERE id = ? AND source = 'upload'").get(id)
  if (!r) throw new Error(`Không thấy ảnh ${id} trong thư viện`)
  return r
})
const fontRows = new Map(db.prepare("SELECT id, alias, ttf FROM fonts WHERE alias IN ('Pacifico', 'Patrick Hand', 'Montserrat')").all().map((f) => [f.alias, f]))
db.close()
const fontClass = (alias) => { const f = fontRows.get(alias); if (!f) throw new Error(`Thiếu font ${alias}`); return { alias: f.alias, id: f.id, value: f.alias, url: f.ttf } }

const layers = []
const place = (name, url, x, y, w, h, extra = {}) => { const l = imageLayer({ name, url, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), ...extra }); layers.push(l); return l }
const makeAsset = async (name, w, h, body, defs = '') => writeAsset(name, await svgPng(w, h, `<defs>${defs}</defs>${body}`))

// ───────────────────────── hình học dùng chung ─────────────────────────
const star = (cx, cy, R, r = R * 0.5, n = 5, rot = -90) => Array.from({ length: n * 2 }, (_, i) => { const a = ((rot + (i * 180) / n) * Math.PI) / 180, rr = i % 2 ? r : R; return `${f1(cx + rr * Math.cos(a))},${f1(cy + rr * Math.sin(a))}` }).join(' ')
const heartPath = (cx, cy, s) => `M${cx} ${cy + 0.42 * s} C${cx - 1.05 * s} ${cy - 0.2 * s} ${cx - 0.45 * s} ${cy - 0.85 * s} ${cx} ${cy - 0.32 * s} C${cx + 0.45 * s} ${cy - 0.85 * s} ${cx + 1.05 * s} ${cy - 0.2 * s} ${cx} ${cy + 0.42 * s}Z`
const archPath = (x, y, w, h) => { const r = w / 2; return `M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z` }
const roundPath = (x, y, w, h, r) => `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
// giấy xé: viền gồ ghề, có sợi giấy trắng ở mép
const tornPoints = (w, h, amp, step) => {
  const pts = []
  for (let x = 0; x <= w; x += step) pts.push([x, (rnd() - 0.5) * amp * 2])
  for (let y = 0; y <= h; y += step) pts.push([w + (rnd() - 0.5) * amp * 2, y])
  for (let x = w; x >= 0; x -= step) pts.push([x, h + (rnd() - 0.5) * amp * 2])
  for (let y = h; y >= 0; y -= step) pts.push([(rnd() - 0.5) * amp * 2, y])
  return pts
}
const polyPath = (pts, dx = 0, dy = 0) => 'M' + pts.map((p) => `${f1(p[0] + dx)} ${f1(p[1] + dy)}`).join(' L') + ' Z'

// ───────────────────────── 1. NỀN: giấy xanh chấm bi + sao nhỏ ─────────────────────────
{
  let dots = ''
  for (let r = 0, y = 26; y < H; r++, y += 62) for (let x = r % 2 ? 26 : 57; x < W; x += 62) dots += `<circle cx="${x}" cy="${y}" r="6.5" fill="#fff" fill-opacity="0.72"/>`
  let sparks = ''
  for (let i = 0; i < 46; i++) sparks += `<polygon points="${star(rnd() * W, rnd() * H, 9 + rnd() * 9, 3.2, 4, -90)}" fill="${i % 3 ? '#fff' : C.yellow}" fill-opacity="${i % 3 ? 0.9 : 0.8}"/>`
  var bgUrl = await makeAsset('background.png', W, H, `<rect width="${W}" height="${H}" fill="url(#g)"/>${dots}${sparks}`, `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6e6ef"/><stop offset="1" stop-color="#c5dbe8"/></linearGradient>`)
  place('Nền chấm bi xanh · cố định', bgUrl, 0, 0, W, H, { printRole: 'base', lock: true })
}

// ───────────────────────── 2. GIẤY XÉ XẾP LỚP (có đường khâu và hoa văn nhỏ) ─────────────────────────
const tornPaper = async (name, x, y, w, h, { fill, edge = '#fffdf8', amp = 7, stitch = C.blueD, tiny = '', rot = 0, shadowDy = 8 }) => {
  const pad = 46, W2 = Math.round(w + 2 * pad), H2 = Math.round(h + 2 * pad)
  const pts = tornPoints(w, h, amp, 34), pts2 = pts.map((p) => [p[0] * 0.992 + w * 0.004, p[1] * 0.992 + h * 0.004])
  const inset = 22
  let fiber = ''
  for (let i = 0; i < 70; i++) { const px = rnd() * w, py = rnd() * h; fiber += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(1 + rnd() * 1.6)}" fill="#c9b79a" fill-opacity="0.10"/>` }
  const body = `<g filter="url(#sh)" transform="translate(${pad} ${pad})"><path d="${polyPath(pts)}" fill="${edge}"/><path d="${polyPath(pts2, 0, 0)}" fill="${fill}" transform="translate(${f1(w * 0.0015)} ${f1(h * 0.0015)}) scale(0.998)"/></g>
    <g transform="translate(${pad} ${pad})">${fiber}${tiny}<rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" rx="14" fill="none" stroke="${stitch}" stroke-width="3" stroke-dasharray="15 11" stroke-linecap="round" stroke-opacity="0.8"/></g>`
  const url = await makeAsset(name + '.png', W2, H2, body, dropFilter('sh', W2, H2, shadowDy, 10, 0.26))
  return rot ? { url, x: x - pad, y: y - pad, w: W2, h: H2, rot, cx: x + w / 2, cy: y + h / 2 } : { url, x: x - pad, y: y - pad, w: W2, h: H2 }
}
const rotated = (name, asset, rot) => {
  // bọc ảnh trong nhóm xoay quanh tâm của nó
  const g = groupLayer({ name, left: asset.x, top: asset.y, width: asset.w, height: asset.h, rotate: rot })
  layers.push(g)
  const l = imageLayer({ name, url: asset.url, left: asset.x, top: asset.y, width: asset.w, height: asset.h, parent: g.uuid, printGroup: g.printGroup })
  layers.push(l)
}
{
  // dải giấy kem phía sau bốn ảnh dọc, có hoa văn trái tim/chấm nhỏ
  let tiny = ''
  for (let i = 0; i < 90; i++) tiny += `<path d="${heartPath(0, 0, 7)}" transform="translate(${f1(rnd() * 2200 + 20)} ${f1(rnd() * 700 + 20)}) rotate(${f1((rnd() - 0.5) * 50)})" fill="${C.blush}" fill-opacity="0.55"/>`
  const band = await tornPaper('paper-band', 40, 64, 2320, 740, { fill: C.cream, amp: 8, stitch: C.coral, tiny, shadowDy: 9 })
  rotated('Giấy kem phía sau ảnh', band, -0.6)
  // mảnh giấy vàng bơ phía sau tiêu đề
  let dots = ''
  for (let y = 38, r = 0; y < 700; y += 46, r++) for (let x = r % 2 ? 22 : 45; x < 1190; x += 46) dots += `<circle cx="${x}" cy="${y}" r="4" fill="#fff" fill-opacity="0.65"/>`
  const patch = await tornPaper('paper-patch', 1150, 845, 1190, 690, { fill: C.butter, amp: 7, stitch: '#c79a3b', tiny: dots, shadowDy: 8 })
  rotated('Giấy vàng bơ phía sau tiêu đề', patch, 0.9)
}

// ───────────────────────── 3. CỜ PHƯỚN treo trên đỉnh trang ─────────────────────────
{
  const bh = 210, flagCols = [C.blueM, '#fffaf0', C.blush, C.butter, C.sage]
  const segs = [[-30, 800], [800, 1600], [1600, 2430]]
  let flags = '', stringD = ''
  segs.forEach(([x0, x1], si) => {
    const y0 = 18, sag = 64, cx = (x0 + x1) / 2, cy = y0 + sag * 2
    stringD += `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y0} `
    const n = Math.round((x1 - x0) / 82)
    for (let i = 1; i < n; i++) {
      const t = i / n, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0
      const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y0 - cy), ang = (Math.atan2(dy, dx) * 180) / Math.PI
      const col = flagCols[(i + si) % flagCols.length]
      flags += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})"><path d="M-36 0 H36 L0 96 Z" fill="${col}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M-27 6 H27 L0 78 Z" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2.2" stroke-dasharray="7 6"/></g>`
    }
  })
  var buntingUrl = await makeAsset('bunting.png', W, bh, `<g filter="url(#sh)"><path d="${stringD}" fill="none" stroke="#9c7f5c" stroke-width="4.5"/>${flags}</g>`, dropFilter('sh', W, bh, 6, 7, 0.28))
  place('Cờ phướn', buntingUrl, 0, 0, W, bh)
}

// ───────────────────────── 4. ẢNH: khung giấy trắng theo hình dạng + mask + băng dính ─────────────────────────
// băng dính họa tiết, răng cưa hai đầu
const tapeKinds = {
  stripe: { pat: `<pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#b9d6e8"/><rect width="11" height="22" fill="#fff" fill-opacity="0.7"/></pattern>`, edge: '#8fb4cc' },
  dots: { pat: `<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#f6dc8a"/><circle cx="8" cy="8" r="4.2" fill="#fff"/><circle cx="21" cy="21" r="4.2" fill="#fff"/></pattern>`, edge: '#d5b04f' },
  gingham: { pat: `<pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#fbe3df"/><rect width="14" height="28" fill="#f1b7b0" fill-opacity="0.75"/><rect width="28" height="14" fill="#f1b7b0" fill-opacity="0.75"/></pattern>`, edge: '#d9918a' },
  kraft: { pat: `<pattern id="p" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#e3cba5"/><path d="M0 8 H30 M0 22 H30" stroke="#c9ad82" stroke-width="2" stroke-opacity="0.6"/></pattern>`, edge: '#bf9f70' },
}
const tape = async (name, kind, tw, th, deg) => {
  const k = tapeKinds[kind], pad = Math.ceil(Math.hypot(tw, th) * 0.5 + 12), S = pad * 2
  const z = (n) => `${f1(tw)},0 ${f1(tw - 9)},${f1(th * 0.17)} ${f1(tw)},${f1(th * 0.33)} ${f1(tw - 9)},${f1(th * 0.5)} ${f1(tw)},${f1(th * 0.67)} ${f1(tw - 9)},${f1(th * 0.83)} ${f1(tw)},${f1(th)}`
  const poly = `0,0 ${z()} 0,${f1(th)} 9,${f1(th * 0.83)} 0,${f1(th * 0.67)} 9,${f1(th * 0.5)} 0,${f1(th * 0.33)} 9,${f1(th * 0.17)}`
  const url = await makeAsset(name + '.png', S, S, `<g transform="translate(${pad} ${pad}) rotate(${deg}) translate(${-tw / 2} ${-th / 2})"><g filter="url(#sh)"><polygon points="${poly}" fill="url(#p)" fill-opacity="0.9" stroke="${k.edge}" stroke-opacity="0.5" stroke-width="1.5"/></g></g>`, k.pat + dropFilter('sh', S, S, 3, 4, 0.25))
  return { url, S }
}
const putTape = async (name, kind, cx, cy, tw, th, deg, parent) => {
  const t = await tape(name, kind, tw, th, deg)
  const l = place(name, t.url, cx - t.S / 2, cy - t.S / 2, t.S, t.S, parent ? { parent: parent.uuid, printGroup: parent.printGroup } : {})
  return l
}

// khung giấy cho ảnh có hình dạng (vòm / bo tròn / cạnh thẳng góc bo) → PNG: giấy trắng + bóng
const shapedFrame = async (name, shapeFn, pw, ph, b) => {
  const pad = 40, W2 = pw + 2 * b + 2 * pad, H2 = ph + 2 * b + 2 * pad
  const d = shapeFn(pad + b, pad + b, pw, ph)
  const url = await makeAsset(name + '.png', W2, H2, `<g filter="url(#sh)"><path d="${d}" fill="${C.paper}" stroke="${C.paper}" stroke-width="${2 * b}" stroke-linejoin="round"/></g><path d="${d}" fill="none" stroke="#e9dfcb" stroke-width="2.2" transform="translate(0 0)" stroke-dasharray="9 7"/>`, dropFilter('sh', W2, H2, 9, 10, 0.3))
  return { url, pad, W2, H2 }
}
// khung polaroid
const polaroidFrame = async (name, ow, oh) => {
  const pad = 40, W2 = ow + 2 * pad, H2 = oh + 2 * pad
  const url = await makeAsset(name + '.png', W2, H2, `<g filter="url(#sh)"><rect x="${pad}" y="${pad}" width="${ow}" height="${oh}" rx="5" fill="${C.paper}"/></g>`, dropFilter('sh', W2, H2, 9, 10, 0.3))
  return { url, pad, W2, H2 }
}

const slotPhoto = (name, photo, x, y, w, h, cropY, parent, mask) => {
  const p = place(name, placeholders ? '/static/collage/smile-darling-ref/photo-placeholder.jpg' : photo.web_url, x, y, w, h, { fit: 'cover', slot: true, role: 'photo', mask: mask || '', parent: parent.uuid, printGroup: parent.printGroup })
  p.cropY = cropY
  if (!placeholders) p.origin = { proxy: photo.web_url, original: photo.url }
  return p
}
const cluster = (name, x, y, w, h, rot) => { const g = groupLayer({ name, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), rotate: rot }); layers.push(g); return g }
const placeIn = (g, name, asset, x, y) => place(name, asset.url, x, y, asset.W2, asset.H2, { parent: g.uuid, printGroup: g.printGroup })

const PW = 440, PH = 620, B = 20 // ảnh dọc: vùng ảnh và độ dày viền giấy
const colX = [105, 685, 1265, 1845], rowY = 100
const caption = (g, text, cx, cy, size, rot = 0) => { const t = textLayer({ name: 'Chữ ' + text, text, left: cx - 200, top: cy - size * 0.7, width: 400, height: size * 1.5, fontSize: size, lineHeight: 1.2, fontClass: fontClass('Patrick Hand'), color: C.text }); t.parent = g.uuid; t.printGroup = g.printGroup; layers.push(t); return t }

// P1 — Bloom: mask hình vòm (arch) + băng dính sọc xanh (chỉ khi dựng mẫu ảnh giữ chỗ; bản ảnh thật dùng ảnh chính tách nền ở dưới)
if (placeholders) {
  const fr = await shapedFrame('frame-arch', archPath, PW, PH, B)
  const x = colX[0], y = rowY, g = cluster('Khung Bloom', x, y, PW + 2 * B, PH + 2 * B, -3)
  placeIn(g, 'Khung giấy vòm', fr, x - fr.pad, y - fr.pad)
  slotPhoto('Ảnh Bloom', photos[0], x + B, y + B, PW, PH, 35, g, maskUri(PW, PH, `<path d="${archPath(0, 0, PW, PH)}" fill="#fff"/>`))
  await putTape('Băng dính sọc', 'stripe', x + 70, y + 40, 190, 54, -38, g)
}
// P2 — Pure Joy: mask bo tròn lớn (gối) + băng dính chấm vàng
{
  const R = 120
  const fr = await shapedFrame('frame-round', (a, b2, w, h) => roundPath(a, b2, w, h, R), PW, PH, B)
  const x = colX[1], y = rowY + 22, g = cluster('Khung Pure Joy', x, y, PW + 2 * B, PH + 2 * B, 2.5)
  placeIn(g, 'Khung giấy bo tròn', fr, x - fr.pad, y - fr.pad)
  slotPhoto('Ảnh Pure Joy', photos[1], x + B, y + B, PW, PH, 30, g, maskUri(PW, PH, `<path d="${roundPath(0, 0, PW, PH, R)}" fill="#fff"/>`))
  await putTape('Băng dính chấm', 'dots', x + PW - 40, y + 30, 190, 54, 36, g)
}
// P3 — My birthday: khung giấy cạnh thẳng, góc bo vừa phải (dễ cắt tay), đường khâu nét đứt
{
  const R = 26, B3 = 28
  const fr = await shapedFrame('frame-card', (a, b2, w, h) => roundPath(a, b2, w, h, R), PW, PH, B3)
  const x = colX[2] - 8, y = rowY - 8, g = cluster('Khung My birthday', x, y, PW + 2 * B3, PH + 2 * B3, -2)
  placeIn(g, 'Khung giấy cạnh thẳng', fr, x - fr.pad, y - fr.pad)
  slotPhoto('Ảnh sinh nhật', photos[2], x + B3, y + B3, PW, PH, 40, g, maskUri(PW, PH, `<path d="${roundPath(0, 0, PW, PH, R)}" fill="#fff"/>`))
  await putTape('Băng dính caro', 'gingham', x + PW + 2 * B3 - 60, y + PH + 2 * B3 - 24, 190, 54, -33, g)
}
// P4 — The Beginning: polaroid có chú thích viết tay
{
  const oh = PH + 2 * B + 88
  const fr = await polaroidFrame('frame-polaroid', PW + 2 * B, oh)
  const x = colX[3], y = rowY + 25, g = cluster('Khung The Beginning', x, y, PW + 2 * B, oh, 3)
  placeIn(g, 'Khung polaroid', fr, x - fr.pad, y - fr.pad)
  slotPhoto('Ảnh ba chị em', photos[3], x + B, y + B, PW, PH, 28, g)
  caption(g, 'together', x + (PW + 2 * B) / 2, y + B + PH + 54, 50)
  await putTape('Băng dính kraft', 'kraft', x + (PW + 2 * B) / 2, y + 4, 170, 46, -3, g) // đặt ở mép trên, không che chữ THE BEGINNING trong ảnh
}
// P5 — Cả nhà: khung giấy cạnh thẳng, góc bo (dễ cắt tay) + hai băng dính
{
  const pw = 900, ph = 600, b = 22, R = 30
  const fr = await shapedFrame('frame-family', (a, b2, w, h) => roundPath(a, b2, w, h, R), pw, ph, b)
  const x = 100, y = 850, g = cluster('Khung cả nhà', x, y, pw + 2 * b, ph + 2 * b, -1.5)
  placeIn(g, 'Khung giấy cạnh thẳng', fr, x - fr.pad, y - fr.pad)
  slotPhoto('Ảnh cả nhà', photos[4], x + b, y + b, pw, ph, 50, g, maskUri(pw, ph, `<path d="${roundPath(0, 0, pw, ph, R)}" fill="#fff"/>`))
  await putTape('Băng dính sọc trái', 'stripe', x + 28, y + 34, 210, 56, -35, g)
  await putTape('Băng dính chấm phải', 'dots', x + pw + 2 * b - 40, y + 26, 210, 56, 33, g)
}

// ───────────────────────── 4b. ẢNH CHÍNH: tách nền (BiRefNet) + viền trắng ôm theo dáng người + bóng ─────────────────────────
// Viền được làm mịn và lấp các khe hẹp (giữa tay và thân...) để đường cắt tay gọn, không có chi tiết nhỏ.
const BASE = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const cutoutSubject = async (file, cacheName) => {
  // đã tách nền một lần thì lưu PNG vào thư mục tài nguyên, lần dựng sau không cần gọi lại BiRefNet
  const cached = path.join(assetsDir, cacheName)
  try { return await readFile(cached) } catch { /* chưa có: tách nền lần đầu */ }
  const body = new FormData()
  body.append('file', new Blob([await readFile(file)]), 'subject.jpg')
  const res = await fetch(BASE + '/api/tinix/cutout/birefnet', { method: 'POST', body })
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/png')) throw new Error('BiRefNet không trả về PNG (service 7001 đang chạy chưa?)')
  const png = Buffer.from(await res.arrayBuffer())
  await writeFile(cached, png)
  return png
}
// luôn ép về 1 kênh: sau blur/threshold sharp có thể trả 3 kênh, đọc nhầm sẽ làm lệch dữ liệu (vệt sọc, hộp mờ quanh chủ thể)
const oneChannel = async (pipeline, w, h) => { const { data, info } = await pipeline.extractChannel(0).raw().toBuffer({ resolveWithObject: true }); if (info.channels !== 1 || data.length !== w * h) throw new Error(`Kênh alpha sai: ${info.channels} kênh, ${data.length} byte (cần ${w * h})`); return data }
// sharp chạy blur/threshold theo thứ tự CỐ ĐỊNH nội bộ (gọi lặp trong một chuỗi sẽ ghi đè nhau) → tách từng bước riêng
const alphaStep = (buf, w, h, fn) => oneChannel(fn(sharp(buf, { raw: { width: w, height: h, channels: 1 } })), w, h)
const dilateAlpha = async (alpha, w, h, r) => {
  let b = await alphaStep(alpha, w, h, (p) => p.blur(Math.max(0.5, r / 1.47)))
  b = await alphaStep(b, w, h, (p) => p.threshold(18))
  b = await alphaStep(b, w, h, (p) => p.blur(3))
  return alphaStep(b, w, h, (p) => p.threshold(128))
}
const solidAlpha = (rgb, alpha, w, h) => sharp(Buffer.alloc(w * h * 3, 0).map((_, i) => rgb[i % 3]), { raw: { width: w, height: h, channels: 3 } }).joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer()
const buildHero = async (photo, targetH, border) => {
  const file = path.join(root, 'service', photo.url.replace(/^\//, ''))
  const cut = await cutoutSubject(file, `cutout-${photo.id}.png`)
  const meta = await sharp(cut).metadata()
  const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = targetH / bh
  const cw = Math.round(bw * sc), ch = Math.round(bh * sc), pad = border + 70
  const W2 = cw + 2 * pad, H2 = ch + 2 * pad
  const subject = await sharp(cut).extract({ left: x0, top: y0, width: bw, height: bh }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer()
  const canvas = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: subject, left: pad, top: pad }]).png().toBuffer()
  const alpha = await sharp(canvas).extractChannel(3).raw().toBuffer()
  const wide = await dilateAlpha(alpha, W2, H2, border + 5), white = await dilateAlpha(alpha, W2, H2, border)
  const shadowA = await alphaStep(await alphaStep(white, W2, H2, (p) => p.blur(13)), W2, H2, (p) => p.linear(0.5, 0))
  const png = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await solidAlpha([40, 30, 20], shadowA, W2, H2), left: 0, top: 15 },
      { input: await solidAlpha([104, 150, 181], wide, W2, H2), left: 0, top: 0 }, // viền ngoài xanh khói: tách viền trắng khỏi nền kem
      { input: await solidAlpha([255, 255, 255], white, W2, H2), left: 0, top: 0 },
      { input: canvas, left: 0, top: 0 },
    ]).png().toBuffer()
  return { url: await writeAsset('hero-bloom.png', png), W2, H2, pad, cw, ch, src: { bw, bh, scale: +sc.toFixed(3) } }
}
let heroInfo = null
if (!placeholders) {
  heroInfo = await buildHero(photos[0], 880, 20) // viền trắng ~2,5 mm khi in 30×20 cm
  // nền tròn pastel phía sau ảnh chính (giấy hồng, vòng khâu nét đứt) để tách ảnh khỏi nền kem
  const R = 250, S = R * 2 + 90 // nền tròn
  const disc = await makeAsset('hero-disc.png', S, S, `<g filter="url(#sh)"><circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="url(#d)"/></g><circle cx="${S / 2}" cy="${S / 2}" r="${R - 22}" fill="none" stroke="#fff" stroke-width="3.4" stroke-dasharray="15 11" stroke-linecap="round" stroke-opacity="0.9"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${f1(S / 2 + (R - 60) * Math.cos((i * Math.PI) / 8))}" cy="${f1(S / 2 + (R - 60) * Math.sin((i * Math.PI) / 8))}" r="4.5" fill="#fff" fill-opacity="0.7"/>`).join('')}`,
    `<radialGradient id="d" cx="50%" cy="42%" r="65%"><stop offset="0" stop-color="#fde6df"/><stop offset="1" stop-color="#f4c3ba"/></radialGradient>` + dropFilter('sh', S, S, 9, 10, 0.26))
  place('Nền tròn sau ảnh chính', disc, 285 - S / 2, 490 - S / 2, S, S)
  const gh = groupLayer({ name: 'Ảnh chính Bloom', left: 120, top: 70, width: heroInfo.cw, height: heroInfo.ch, rotate: -3 })
  layers.push(gh)
  const ph = place('Ảnh chính Bloom (tách nền, viền trắng)', heroInfo.url, 120 - heroInfo.pad, 70 - heroInfo.pad, heroInfo.W2, heroInfo.H2, { parent: gh.uuid, printGroup: gh.printGroup })
  ph.origin = { proxy: photos[0].web_url, original: photos[0].url }
}

// ───────────────────────── 5. STICKER (viền trắng cắt rời + bóng) ─────────────────────────
const sticker = async (name, w, h, art, sil, { rot = 0, ow = 11 } = {}) => {
  const pad = Math.ceil(Math.max(w, h) * 0.22 + 26), S1 = w + 2 * pad, S2 = h + 2 * pad
  const url = await makeAsset(name + '.png', S1, S2, `<g filter="url(#sh)" transform="translate(${pad} ${pad}) rotate(${rot} ${w / 2} ${h / 2})"><g fill="#fff" stroke="#fff" stroke-width="${ow * 2}" stroke-linejoin="round" stroke-linecap="round">${sil}</g>${art}</g>`, dropFilter('sh', S1, S2, 6, 7, 0.3))
  return { url, S1, S2, pad }
}
const putSticker = (name, st, x, y) => place(name, st.url, x - st.pad, y - st.pad, st.S1, st.S2)

const cloudSil = `<circle cx="62" cy="96" r="42"/><circle cx="118" cy="64" r="56"/><circle cx="190" cy="82" r="46"/><circle cx="238" cy="104" r="36"/><rect x="40" y="96" width="230" height="46" rx="23"/>`
const cloudArt = `<g fill="#fff"><circle cx="62" cy="96" r="42"/><circle cx="118" cy="64" r="56"/><circle cx="190" cy="82" r="46"/><circle cx="238" cy="104" r="36"/><rect x="40" y="96" width="230" height="46" rx="23"/></g><path d="M52 132 Q150 152 262 132" fill="none" stroke="#c4dbea" stroke-width="7" stroke-linecap="round"/><path d="M96 48 Q112 36 132 42" fill="none" stroke="#dbe9f3" stroke-width="6" stroke-linecap="round"/>`
const cloudA = await sticker('cloud-a', 290, 150, cloudArt, cloudSil, { rot: -6, ow: 8 })
const cloudB = await sticker('cloud-b', 290, 150, cloudArt, cloudSil, { rot: 8, ow: 8 })
const starSt = async (nm, col, R, rot) => sticker(nm, R * 2, R * 2, `<polygon points="${star(R, R, R * 0.95, R * 0.46)}" fill="${col}" stroke="#fff" stroke-opacity="0.0"/><polygon points="${star(R * 0.9, R * 0.86, R * 0.28, R * 0.12)}" fill="#fff" fill-opacity="0.65"/>`, `<polygon points="${star(R, R, R * 0.95, R * 0.46)}"/>`, { rot, ow: 8 })
const starY = await starSt('star-y', C.yellow, 52, 12), starB = await starSt('star-b', C.blueM, 40, -14), starP = await starSt('star-p', C.blush, 34, 9)
const heartSt = async (nm, col, s, rot) => sticker(nm, s * 2.2, s * 2, `<path d="${heartPath(s * 1.1, s, s * 0.98)}" fill="${col}"/><path d="${heartPath(s * 1.1, s, s * 0.78)}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2.6" stroke-dasharray="7 6"/>`, `<path d="${heartPath(s * 1.1, s, s * 0.98)}"/>`, { rot, ow: 8 })
const heartA = await heartSt('heart-a', '#f0a39a', 62, -10), heartB = await heartSt('heart-b', C.blueM, 44, 14)
const daisy = async (nm, R, rot) => {
  const cx = R * 1.0, petals = Array.from({ length: 9 }, (_, i) => `<ellipse cx="${cx}" cy="${cx - R * 0.55}" rx="${R * 0.26}" ry="${R * 0.52}" transform="rotate(${i * 40} ${cx} ${cx})" fill="#fff" stroke="#e3ebf0" stroke-width="2"/>`).join('')
  return sticker(nm, R * 2, R * 2, `${petals}<circle cx="${cx}" cy="${cx}" r="${R * 0.3}" fill="${C.yellow}"/><circle cx="${cx - 7}" cy="${cx - 6}" r="${R * 0.09}" fill="#fff" fill-opacity="0.7"/>`, `<circle cx="${cx}" cy="${cx}" r="${R * 0.98}"/>`, { rot, ow: 7 })
}
const daisyA = await daisy('daisy-a', 62, 10), daisyB = await daisy('daisy-b', 44, -20)
const sprig = await sticker('sprig', 210, 120, `<path d="M8 100 Q80 90 200 22" fill="none" stroke="${C.sageD}" stroke-width="6" stroke-linecap="round"/>${[[40, 90, -50], [78, 76, 38], [100, 66, -48], [134, 50, 34], [152, 40, -46], [180, 28, 30]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="11" transform="rotate(${a} ${x} ${y})" fill="${C.sage}" stroke="${C.sageD}" stroke-width="2"/>`).join('')}`, `<path d="M8 100 Q80 90 200 22" fill="none" stroke="#fff" stroke-width="12"/>${[[40, 90, -50], [78, 76, 38], [100, 66, -48], [134, 50, 34], [152, 40, -46], [180, 28, 30]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="27" ry="12" transform="rotate(${a} ${x} ${y})"/>`).join('')}`, { rot: 0, ow: 6 })
const planeArt = `<polygon points="150,8 10,52 66,70" fill="#fff"/><polygon points="150,8 66,70 52,98" fill="#d4e5f1"/><polyline points="150,8 66,70" fill="none" stroke="#a9c3d6" stroke-width="3"/><polyline points="66,70 52,98 78,82" fill="none" stroke="#a9c3d6" stroke-width="3" stroke-linejoin="round"/>`
const plane = await sticker('plane', 160, 104, planeArt, `<polygon points="150,8 10,52 66,70 52,98"/>`, { rot: -8, ow: 9 })
const bowArt = `<path d="M70 50 C20 6 -4 70 40 88 C58 82 66 64 70 50Z" fill="#f0a39a"/><path d="M70 50 C120 6 144 70 100 88 C82 82 74 64 70 50Z" fill="#f0a39a"/><path d="M30 60 q16 6 30 -4 M110 60 q-16 6 -30 -4" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="3"/><rect x="56" y="40" width="30" height="34" rx="12" fill="#e5877c"/><path d="M60 74 L38 118 L58 108 L68 122Z" fill="#e5877c"/><path d="M80 74 L102 118 L82 108 L72 122Z" fill="#e5877c"/>`
const bow = await sticker('bow', 140, 124, bowArt, `<path d="M70 50 C20 6 -4 70 40 88 L58 108 L38 118 L68 122 L72 122 L102 118 L82 108 L100 88 C144 70 120 6 70 50Z"/>`, { rot: -12, ow: 8 })
// nhãn ruy băng (đầu nhọn) và thẻ giấy kraft có dây
const ribbon = async (nm, w, h, col, edge) => {
  const n = 34, pts = `${n},0 ${w - n},0 ${w},${h / 2} ${w - n},${h} ${n},${h} 0,${h / 2}`
  return sticker(nm, w, h, `<polygon points="${pts}" fill="${col}"/><polygon points="${n + 10},9 ${w - n - 10},9 ${w - 14},${h / 2} ${w - n - 10},${h - 9} ${n + 10},${h - 9} 14,${h / 2}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2.6" stroke-dasharray="9 7"/>`, `<polygon points="${pts}"/>`, { rot: 0, ow: 8 })
}
const ribbonSt = await ribbon('ribbon', 800, 120, C.blush)
const tag = await sticker('tag', 230, 150, `<path d="M20 6 H190 Q214 6 214 30 V120 Q214 144 190 144 H20 L2 75Z" fill="${C.kraft}"/><circle cx="26" cy="75" r="10" fill="#c9ad82" stroke="#fff" stroke-width="3"/><path d="M26 75 C-10 20 40 -30 90 -22" fill="none" stroke="#9c7f5c" stroke-width="4"/><path d="M20 6 H190 Q214 6 214 30 V120 Q214 144 190 144 H20 L2 75Z" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="2.5" stroke-dasharray="9 7" transform="translate(0 0) scale(0.95) translate(5 4)"/>`, `<path d="M20 6 H190 Q214 6 214 30 V120 Q214 144 190 144 H20 L2 75Z"/>`, { rot: 9, ow: 8 })

// bố trí sticker: chỉ ở mép/khoảng trống, không đè lên mặt người
putSticker('Mây bông A', cloudA, 580, 640)
putSticker('Mây bông B', cloudB, 1980, 905)
putSticker('Sao vàng', starY, 1660, 668)
putSticker('Sao xanh', starB, 1235, 690)
putSticker('Sao hồng', starP, 2290, 72)
putSticker('Tim hồng', heartA, 1735, 720)
putSticker('Tim xanh', heartB, 560, 800)
putSticker('Hoa cúc A', daisyA, 38, 1418)
putSticker('Hoa cúc B', daisyB, 132, 1470)
putSticker('Cành lá', sprig, 14, 1330)
putSticker('Nơ', bow, 1090, 1015)
putSticker('Sao vàng nhỏ', starY, 2215, 905)

// ───────────────────────── 6. CHỮ: tiêu đề viết tay có bóng lệch, nhãn ruy băng, thẻ kraft ─────────────────────────
const mkText = (name, text, x, y, w, size, alias, color, extra = {}) => { const t = textLayer({ name, text, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(size * 1.5), fontSize: size, lineHeight: 1.15, letterSpacing: extra.ls || 0, fontClass: fontClass(alias), color }); t.textAlign = extra.align || 'left'; return t }
const titleBlock = (name, text, x, y, w, size, alias, color, shade, rot) => {
  const g = groupLayer({ name, left: x, top: y, width: w, height: Math.round(size * 1.5), rotate: rot }); layers.push(g)
  for (const [dx, dy, col, nm] of [[7, 7, shade, 'bóng'], [0, 0, color, 'chữ']]) { const t = mkText(`${name} · ${nm}`, text, x + dx, y + dy, w, size, alias, col); t.parent = g.uuid; t.printGroup = g.printGroup; layers.push(t) }
}
titleBlock('Tiêu đề Little', 'Little', 1230, 860, 700, 230, 'Pacifico', '#5b88a6', '#ffffff', -4)
titleBlock('Tiêu đề Moments', 'Moments', 1340, 1040, 980, 212, 'Pacifico', '#e07a69', '#ffffff', -4)
{
  place('Nhãn ruy băng', ribbonSt.url, 1260 - ribbonSt.pad, 1285 - ribbonSt.pad, ribbonSt.S1, ribbonSt.S2)
  const t = mkText('Dòng phụ', 'Những khoảnh khắc nhỏ bé, trọn vẹn yêu thương', 1260 + 30, 1285 + 38, 740, 34, 'Patrick Hand', C.text, { align: 'center' })
  layers.push(t)
  putSticker('Thẻ kraft', tag, 2058, 1352)
  putSticker('Máy bay giấy', plane, 1265, 1432) // vẽ SAU nhãn ruy băng để nằm đè lên góc nhãn
  const w = mkText('Chữ thẻ', 'with love', 2082, 1392, 170, 40, 'Patrick Hand', C.text, { align: 'center' })
  layers.push(w)
}

const global = {
  name: 'Little Moments · scrapbook cắt dán', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: '#cfe1ec', backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'moments-a', version: 2, customer: placeholders ? 'Mẫu' : 'Little Moments', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
