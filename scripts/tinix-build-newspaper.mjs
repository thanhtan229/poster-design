// [TINIX] Dựng trang "báo chí cắt dán" (30×20 cm): nền giấy báo, ảnh đen trắng có viền đen, tiêu đề ghép từ chữ cắt rời.
// Đồ họa vẽ bằng SVG; chữ dùng font thật (Playfair Display, Montserrat). Không dùng pixel nào của ảnh mẫu.
//   node scripts/tinix-build-newspaper.mjs --output FILE [--photos 1713,1714,1715,1716,1717] [--placeholders]
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
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

const W = 2400, H = 1600, DPI = +(W / (30 / 2.54)).toFixed(1)
const INK = '#141414', PAPER = '#ecE6d8', RED = '#c8382b', GREY = '#8a8478'
let seed = 1931
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

const assetsDir = path.join(root, 'service', 'static', 'collage', 'newspaper-a')
const assetsUrl = '/static/collage/newspaper-a'
await mkdir(assetsDir, { recursive: true })
const writeAsset = async (name, buf) => { await writeFile(path.join(assetsDir, name), buf); return `${assetsUrl}/${name}` }
const svgPng = (w, h, body, defs = '') => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`)).png().toBuffer()
const dropFilter = (id, w, h) => `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dy="6" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

const db = new Database(path.join(root, 'service', 'data', 'poster.db'), { readonly: true })
const photos = ids.map((id) => {
  const r = db.prepare("SELECT id, url, web_url FROM user_images WHERE id = ? AND source = 'upload'").get(id)
  if (!r) throw new Error(`Không thấy ảnh ${id} trong thư viện`)
  return r
})
const fontRows = new Map(db.prepare("SELECT id, alias, ttf FROM fonts WHERE alias IN ('Playfair Display', 'Montserrat', 'Pacifico', 'Anton', 'Lobster')").all().map((f) => [f.alias, f]))
db.close()
const fontClass = (alias) => { const f = fontRows.get(alias); if (!f) throw new Error(`Thiếu font ${alias}`); return { alias: f.alias, id: f.id, value: f.alias, url: f.ttf } }

const step = async (buf, w, h, fn) => { const { data, info } = await fn(sharp(buf, { raw: { width: w, height: h, channels: 1 } })).extractChannel(0).raw().toBuffer({ resolveWithObject: true }); if (info.channels !== 1) throw new Error('kênh alpha'); return data }
const HERO = { x: 1250, y: 880, h: 620, border: 16 }
const readFile = (await import('node:fs/promises')).readFile
const layers = []
const place = (name, url, x, y, w, h, extra = {}) => { const l = imageLayer({ name, url, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), ...extra }); layers.push(l); return l }
const text = (name, value, x, y, w, size, alias, color, extra = {}) => {
  const t = textLayer({ name, text: value, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(extra.h || size * 1.6), fontSize: size, lineHeight: extra.lh || 1.1, letterSpacing: extra.ls || 0, fontClass: fontClass(alias), color })
  t.textAlign = extra.align || 'left'; t.fontWeight = extra.weight || 'normal'; t.fontStyle = extra.italic ? 'italic' : 'normal'
  if (extra.bg) t.backgroundColor = extra.bg
  layers.push(t); return t
}

// Chữ có viền cắt trắng ôm theo nét chữ (hiệu ứng chữ của app: nét viền dày + bóng), như chữ dán die-cut
const dieText = (name, value, x, y, w, size, alias, color, extra = {}) => {
  const t = text(name, value, x, y, w, size, alias, color, extra)
  const o = extra.outline || 14
  t.textEffects = [{ filling: { enable: false, type: 0, color: '#ffffff' }, stroke: { enable: true, width: o * 2, color: '#fffdf8' }, shadow: { enable: true, offsetX: 0, offsetY: 6, blur: 8, color: 'rgba(0,0,0,0.4)' }, offset: { enable: false, x: 0, y: 0 } },
  // lớp tô màu chữ nằm trên lớp viền (các lớp hiệu ứng vẽ đè lên chữ gốc)
  { filling: { enable: true, type: 0, color }, stroke: { enable: false, width: 0, color: '#000' }, shadow: { enable: false, offsetX: 0, offsetY: 0, blur: 0, color: '#000' }, offset: { enable: false, x: 0, y: 0 } }]
  if (extra.rot) t.rotate = `${extra.rot}deg`
  return t
}
// ── 1. NỀN GIẤY BÁO: màu ngà, hạt, và các dòng chữ báo mờ (vạch xám ngắn) ──
{
  let rows = ''
  for (let y = 300; y < H - 60; y += 22) {
    let x = 90
    while (x < W - 90) {
      const len = 40 + rnd() * 120
      if (rnd() < 0.85) rows += `<rect x="${f(x)}" y="${y}" width="${f(len)}" height="5" fill="#b8b09f" fill-opacity="${f(0.35 + rnd() * 0.25)}"/>`
      x += len + 14
    }
  }
  const body = `<rect width="${W}" height="${H}" fill="${PAPER}"/>${rows}<rect width="${W}" height="${H}" filter="url(#n)" opacity="0.2"/>`
  const defs = `<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.10 0"/></filter>`
  const bgLayer = place('Nền giấy báo · cố định', await writeAsset('paper.png', await svgPng(W, H, body, defs)), 0, 0, W, H, { printRole: 'base', lock: true })
  bgLayer.effects = { paper: 55, grain: 18 } // vân giấy + hạt: hiệu ứng có sẵn của app (effects.paper / effects.grain); imageLayer() bỏ qua effects truyền vào nên gán trực tiếp
}
function f(n) { return +n.toFixed(1) }

// ── 2. MASTHEAD: tên báo, hai vạch kẻ đen, dòng số báo ──
text('Tên báo', 'THE DAILY FAMILY', 60, 40, 2280, 170, 'Playfair Display', INK, { align: 'center', weight: '700', ls: 4 })
place('Vạch đen dày', await writeAsset('rule-thick.png', await svgPng(2280, 14, `<rect width="2280" height="14" fill="${INK}"/>`)), 60, 232, 2280, 14, { printRole: 'base' })
place('Vạch đen mảnh', await writeAsset('rule-thin.png', await svgPng(2280, 4, `<rect width="2280" height="4" fill="${INK}"/>`)), 60, 254, 2280, 4, { printRole: 'base' })
text('Dòng số báo', 'SỐ 1 · ẤN BẢN GIA ĐÌNH · GIÁ: MỘT NỤ CƯỜI', 60, 272, 2280, 30, 'Montserrat', INK, { align: 'center', ls: 6, weight: '400' })

// ── 3. TIÊU ĐỀ GHÉP TỪ CHỮ CẮT RỜI: mỗi chữ một ô giấy màu, lệch nhẹ ──
const word = 'FAMILY'
const cols = [INK, RED, PAPER, INK, RED, '#f3d36b']
const inks = [PAPER, PAPER, INK, PAPER, PAPER, INK]
for (let i = 0; i < word.length; i++) {
  text('Chữ cắt ' + word[i], word[i], 70 + i * 178, 330 + (i % 2 ? 14 : 0), 172, 190, 'Playfair Display', inks[i], { align: 'center', weight: '700', bg: cols[i], ls: 0, h: 230 })
}
text('Tiêu đề phụ', 'Một ngày, và cả đời', 70, 572, 1040, 52, 'Playfair Display', INK, { italic: true, weight: '400' })

// ── 4. ẢNH ĐEN TRẮNG (hiệu ứng của app, bấm "gốc" là về màu) TRONG KHUNG GIẤY TRẮNG CẮT TAY ──
// Mép khung như cắt kéo: bốn góc lệch, mỗi cạnh có hai điểm gãy nhẹ; toàn đường thẳng nên dễ cắt tay. Viền trắng dày + bóng nướng sẵn.
const bwEffect = () => ({ grayscale: true, contrast: 118 }) // chọn "gốc" trong app sẽ đặt lại hiệu ứng
// Khung đa dạng (máy cắt nên không cần đường thẳng): elip, đám mây, bông hoa, trái tim. Trả về path SVG kín trong hộp w×h.
const SHAPES = ['ellipse', 'cloud', 'flower', 'heart']
const shapePath = (kind, w, h) => {
  const m = 4, cx = w / 2, cy = h / 2, rx = cx - m, ry = cy - m, N = 360
  let pts = []
  if (kind === 'heart') {
    const raw = Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] })
    const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    pts = raw.map((q) => [m + ((q[0] - x0) / (x1 - x0)) * (w - 2 * m), m + ((q[1] - y0) / (y1 - y0)) * (h - 2 * m)])
  } else {
    const ph = rnd() * 6
    const radius = { ellipse: () => 1, cloud: (t) => 0.9 + 0.1 * Math.abs(Math.sin(5.5 * t + ph)), flower: (t) => 0.7 + 0.3 * Math.abs(Math.cos(3.5 * t + ph)) }[kind]
    const rs = Array.from({ length: N }, (_, i) => radius((i / N) * Math.PI * 2)), rmax = Math.max(...rs)
    pts = rs.map((r, i) => { const t = (i / N) * Math.PI * 2; return [cx + (rx * r * Math.cos(t)) / rmax, cy + (ry * r * Math.sin(t)) / rmax] })
  }
  return 'M' + pts.map((q) => `${f(q[0])} ${f(q[1])}`).join(' L') + ' Z'
}
const tapePiece = async (name, cx, cy, tw, th, deg) => {
  const pad = Math.ceil(Math.hypot(tw, th) / 2 + 10), S = pad * 2
  const zig = (x0, dir) => Array.from({ length: 5 }, (_, k) => `${f(x0 + (k % 2 ? dir * 7 : 0))},${f((th / 4) * k)}`).join(' ')
  const poly = `${zig(0, 1)} ${zig(tw, -1).split(' ').reverse().join(' ')}`
  const defs = `<pattern id="t" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="22" height="22" fill="#efe4c4"/><rect width="11" height="22" fill="#fff" fill-opacity="0.55"/></pattern><filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="3" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
  const url = await writeAsset(name + '.png', await svgPng(S, S, `<g transform="translate(${pad} ${pad}) rotate(${deg}) translate(${-tw / 2} ${-th / 2})"><g filter="url(#sh)"><polygon points="${poly}" fill="url(#t)" fill-opacity="0.9" stroke="#d6c79b" stroke-opacity="0.6"/></g></g>`, defs))
  place(name, url, cx - S / 2, cy - S / 2, S, S, { printRole: 'raised' })
}
const slot = async (name, photo, x, y, w, h, cropY, tape = null, kind = 'ellipse') => {
  const b = 16, pad = 36, shape = shapePath(kind, w, h)
  const W2 = w + 2 * b + 2 * pad, H2 = h + 2 * b + 2 * pad
  const frame = await svgPng(W2, H2, `<g filter="url(#sh)"><path transform="translate(${pad + b} ${pad + b})" d="${shape}" fill="#fffdf8" stroke="#fffdf8" stroke-width="${2 * b}" stroke-linejoin="round"/></g>`,
    `<filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${W2}" height="${H2}"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="8" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)
  place(name + ' · khung giấy trắng cắt tay', await writeAsset(`cut-${name.replace(/\s+/g, '-')}.png`, frame), x - b - pad, y - b - pad, W2, H2, { printRole: 'raised' })
  const p = place(name, placeholders ? '/static/collage/smile-darling-ref/photo-placeholder.jpg' : photo.web_url, x, y, w, h, { fit: 'cover', slot: true, role: 'photo', mask: maskUri(w, h, `<path d="${shape}" fill="#fff"/>`) })
  p.cropY = cropY
  p.effects = bwEffect()
  if (!placeholders) p.origin = { proxy: photo.web_url, original: photo.url }
  if (tape) await tapePiece(name + ' · băng dính', x + tape[0], y + tape[1], 190, 50, tape[2])
  return p
}
const maskUri = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)
// Bố cục chồng lấn: lớp dưới → trên theo thứ tự dòng. Ảnh tách nền (hero) cỡ lớn đè lên khung và giấy nền hình.
const paperShape = async (name, kind, x, y, w, h, fill) => {
  const b = 14, pad = 36, d = shapePath(kind, w, h), W2 = w + 2 * b + 2 * pad, H2 = h + 2 * b + 2 * pad
  const png = await svgPng(W2, H2, `<g filter="url(#sh)"><path transform="translate(${pad + b} ${pad + b})" d="${d}" fill="${fill}" stroke="#fffdf8" stroke-width="${2 * b}" stroke-linejoin="round" paint-order="stroke"/></g>`,
    `<filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${W2}" height="${H2}"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="8" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)
  place(name, await writeAsset(`paper-${name.replace(/\s+/g, '-')}.png`, png), x - b - pad, y - b - pad, W2, H2, { printRole: 'raised' })
}
await slot('Ảnh cả nhà', photos[4], 1040, 300, 1300, 620, 50, [1120, 520, -22], 'cloud')
await paperShape('Giấy tim đỏ', 'heart', 1500, 700, 840, 780, RED)
await paperShape('Giấy hoa vàng', 'flower', 420, 700, 700, 760, '#f3d36b')
await slot('Ảnh Pure Joy', photos[1], 40, 650, 600, 620, 0, [500, 560, 28], 'ellipse')

// ── 5. CỘT BÀI: trích dẫn lớn + đoạn văn giả (vạch xám) + một khung chữ cắt đỏ ──
dieText('Trích dẫn', '"Gia đình là nơi mọi khoảnh khắc bắt đầu."', 70, 1330, 330, 34, 'Playfair Display', INK, { italic: true, weight: '700', lh: 1.15, h: 150 })
text('Tác giả', '— Mục Gia đình', 70, 1480, 330, 26, 'Montserrat', RED, { ls: 3, weight: '700' })
{
  let rows = ''
  for (let y = 0; y < 3; y++) for (let x = 0; x < 1; x++) rows += ''
  const lines = []
  for (let k = 0; k < 6; k++) lines.push(`<rect x="0" y="${k * 22}" width="${k === 5 ? 260 : 500}" height="6" fill="${INK}" fill-opacity="0.55"/>`)
  
}
// khung chữ cắt đỏ (ô trích nổi)
{
  const body = `<rect x="6" y="6" width="300" height="110" fill="${RED}"/><rect x="0" y="0" width="300" height="110" fill="${INK}"/>`
  place('Ô đỏ', await writeAsset('box-red.png', await svgPng(306, 116, `<g transform="rotate(-2 153 58)">${body}</g>`)), 1470, 1390, 306, 116, { printRole: 'raised' })
}
text('Chữ ô đỏ', 'NGÀY MỚI', 1474, 1414, 296, 40, 'Playfair Display', PAPER, { align: 'center', weight: '700', lh: 1.0 })

// ── 5b. ẢNH CHỦ ĐẠO TÁCH NỀN (GIỮ MÀU): kết quả tách nền BiRefNet lưu cache theo mã ảnh, viền trắng ôm dáng người + bóng ──
const BASE = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const cutoutOf = async (photo) => {
  const cached = path.join(assetsDir, '..', 'moments-a', `cutout-${photo.id}.png`)
  try { return await readFile(cached) } catch { /* chưa tách nền */ }
  const body = new FormData()
  body.append('file', new Blob([await readFile(path.join(root, 'service', photo.url.replace(/^\//, '')))]), 'subject.jpg')
  const res = await fetch(BASE + '/api/tinix/cutout/birefnet', { method: 'POST', body })
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/png')) throw new Error('BiRefNet không trả về PNG (service 7001 đang chạy chưa?)')
  const png = Buffer.from(await res.arrayBuffer()); await writeFile(cached, png); return png
}
const hero = async (name, photo, x, y, targetH, border = 16) => {
  const cut = await cutoutOf(photo)
  const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0
  for (let yy = 0; yy < info.height; yy++) for (let xx = 0; xx < info.width; xx++) if (data[(yy * info.width + xx) * 4 + 3] > 128) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = targetH / bh, cw = Math.round(bw * sc), ch = targetH, pad = 40
  const subject = await sharp(cut).extract({ left: x0, top: y0, width: bw, height: bh }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer()
  const W2 = cw + 2 * pad, H2 = ch + 2 * pad
  const canvas = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: subject, left: pad, top: pad }]).png().toBuffer()
  const alpha = await sharp(canvas).extractChannel(3).raw().toBuffer()
  const grow = async (r) => { let b = await step(alpha, W2, H2, (q) => q.blur(Math.max(0.5, r / 1.47))); b = await step(b, W2, H2, (q) => q.threshold(18)); b = await step(b, W2, H2, (q) => q.blur(3)); return step(b, W2, H2, (q) => q.threshold(128)) }
  const white = await grow(border), ink = await grow(border + 3)
  const solid = (rgb, a) => sharp(Buffer.alloc(W2 * H2 * 3).map((_, i) => rgb[i % 3]), { raw: { width: W2, height: H2, channels: 3 } }).joinChannel(a, { raw: { width: W2, height: H2, channels: 1 } }).png().toBuffer()
  const shadow = await step(await step(white, W2, H2, (q) => q.blur(12)), W2, H2, (q) => q.linear(0.45, 0))
  const png = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: await solid([30, 25, 20], shadow), left: 0, top: 14 },
    { input: await solid([20, 20, 20], ink), left: 0, top: 0 },
    { input: await solid([255, 255, 255], white), left: 0, top: 0 },
    { input: canvas, left: 0, top: 0 },
  ]).png().toBuffer()
  place(name, await writeAsset(`hero-${photo.id}.png`, png), x - pad, y - pad, W2, H2, { printRole: 'raised' }).cutInset = border / 2
  return { w: cw, h: ch }
}
await hero('Ảnh chủ đạo · bé gái', photos[0], 1000, 500, 1000)
await hero('Ảnh chủ đạo · bé ngồi', photos[2], 420, 735, 760)
await hero('Ảnh chủ đạo · chị em', photos[3], 1800, 680, 820)
// chữ dán (die-cut) lấp khoảng trống, viền trắng ôm theo nét chữ
dieText('Chữ Sum vầy', 'Sum\nvầy', 1390, 930, 420, 130, 'Pacifico', RED, { align: 'center', lh: 1.0, h: 360, rot: -9 })
dieText('Chữ Yêu thương', 'Yêu thương', 600, 520, 520, 90, 'Pacifico', INK, { align: 'center', rot: -4, h: 180 })
function f2(n) { return n }
// ── 5c. STICKER LẤP CHỖ TRỐNG, chồng lên mép ảnh như trang scrapbook ──
{
  const star = (R, r, n = 5) => Array.from({ length: n * 2 }, (_, i) => { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, d = i % 2 ? r : R; return `${f(R + d * Math.cos(a))},${f(R + d * Math.sin(a))}` }).join(' ')
  const sticker = async (name, x, y, size, body) => place(name, await writeAsset(name.replace(/\s+/g, '-') + '.png', await svgPng(size, size, `<g filter="url(#sh)">${body}</g>`, `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.35"/></filter>`)), x, y, size, size, { printRole: 'raised' })
  const heart = (S, fill) => { const pts = Array.from({ length: 120 }, (_, i) => { const t = (i / 120) * Math.PI * 2; return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] }); return `<polygon transform="translate(${S / 2} ${S / 2}) scale(${S / 40})" points="${pts.map((q) => q.map(f).join(',')).join(' ')}" fill="${fill}" stroke="#fffdf8" stroke-width="2.2" stroke-linejoin="round"/>` }
  await sticker('Sao vàng', 1450, 800, 150, `<polygon points="${star(66, 30)}" transform="translate(9 9)" fill="#f3c93b" stroke="#fffdf8" stroke-width="5" stroke-linejoin="round"/>`)
  await sticker('Tim đỏ nhỏ', 2200, 1340, 170, heart(150, RED).replace('<polygon', '<polygon transform-origin="0 0"'))
  await sticker('Tim hồng nhỏ', 1180, 1180, 130, heart(110, '#f08aa0'))
  await sticker('Sao đỏ', 540, 560, 120, `<polygon points="${star(48, 22)}" transform="translate(12 12)" fill="${RED}" stroke="#fffdf8" stroke-width="4" stroke-linejoin="round"/>`)
  const ribbon = text('Nhãn HAPPINESS', 'HAPPINESS', 600, 1345, 380, 44, 'Montserrat', INK, { align: 'center', weight: '700', ls: 8, bg: '#f3d36b', h: 70 }); ribbon.rotate = '-4deg'
  const smile = text('Nhãn SMILE', 'SMILE', 2020, 1440, 260, 40, 'Montserrat', PAPER, { align: 'center', weight: '700', ls: 8, bg: INK, h: 66 }); smile.rotate = '3deg'
}
// ── 6. CHÂN TRANG ──
place('Vạch chân trang', await writeAsset('rule-foot.png', await svgPng(2280, 4, `<rect width="2280" height="4" fill="${INK}"/>`)), 60, 1530, 2280, 4, { printRole: 'base' })
text('Chân trang', 'TRANG 1 · 30 × 20 CM · DÁN TAY, IN TỜ TỔNG HỢP', 60, 1548, 2280, 24, 'Montserrat', GREY, { align: 'center', ls: 4 })

const global = {
  name: 'The Daily Family · báo chí cắt dán', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: PAPER, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'newspaper-a', version: 1, customer: placeholders ? 'Mẫu' : 'The Daily Family', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
