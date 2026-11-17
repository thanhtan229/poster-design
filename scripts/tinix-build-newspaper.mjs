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
const fontRows = new Map(db.prepare("SELECT id, alias, ttf FROM fonts WHERE alias IN ('Playfair Display', 'Montserrat')").all().map((f) => [f.alias, f]))
db.close()
const fontClass = (alias) => { const f = fontRows.get(alias); if (!f) throw new Error(`Thiếu font ${alias}`); return { alias: f.alias, id: f.id, value: f.alias, url: f.ttf } }

const step = async (buf, w, h, fn) => { const { data, info } = await fn(sharp(buf, { raw: { width: w, height: h, channels: 1 } })).extractChannel(0).raw().toBuffer({ resolveWithObject: true }); if (info.channels !== 1) throw new Error('kênh alpha'); return data }
const HERO = { x: 1250, y: 862, h: 630, border: 16 }
const readFile = (await import('node:fs/promises')).readFile
const layers = []
const place = (name, url, x, y, w, h, extra = {}) => { const l = imageLayer({ name, url, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), ...extra }); layers.push(l); return l }
const text = (name, value, x, y, w, size, alias, color, extra = {}) => {
  const t = textLayer({ name, text: value, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(extra.h || size * 1.6), fontSize: size, lineHeight: extra.lh || 1.1, letterSpacing: extra.ls || 0, fontClass: fontClass(alias), color })
  t.textAlign = extra.align || 'left'; t.fontWeight = extra.weight || 'normal'; t.fontStyle = extra.italic ? 'italic' : 'normal'
  if (extra.bg) t.backgroundColor = extra.bg
  layers.push(t); return t
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

// ── 4. ẢNH ĐEN TRẮNG VIỀN ĐEN (dùng hiệu ứng của app: grayscale, contrast, border) ──
const bw = { grayscale: true, contrast: 118, border: 10, borderColor: INK, shadow: 0 }
const bwUrl = async (photo) => {
  // ảnh đen trắng, tương phản mạnh, tạo sẵn từ ảnh trong thư viện (để mọi trình xem đều hiển thị đúng)
  if (placeholders) return '/static/collage/smile-darling-ref/photo-placeholder.jpg'
  const file = path.join(root, 'service', photo.web_url.replace(/^\//, ''))
  const buf = await sharp(file).greyscale().normalise().linear(1.12, -12).jpeg({ quality: 90 }).toBuffer()
  return writeAsset(`bw-${photo.id}.jpg`, buf)
}
const slot = async (name, photo, x, y, w, h, cropY, rot = 0) => {
  // khung đen mỏng phía sau ảnh (viền báo chí), vẽ sát ngoài ảnh 10 px
  const frameUrl = await writeAsset('frame-ink.png', await svgPng(4, 4, `<rect width="4" height="4" fill="${INK}"/>`))
  place(name + ' · viền', frameUrl, x - 10, y - 10, w + 20, h + 20, { printRole: 'raised' })
  const p = place(name, await bwUrl(photo), x, y, w, h, { fit: 'cover', slot: true, role: 'photo' })
  p.cropY = cropY; p.rotate = rot
  return p
}
await slot('Ảnh Pure Joy', photos[1], 80, 650, 500, 560, 0, -1.2)
await slot('Ảnh sinh nhật', photos[2], 640, 650, 500, 560, 40, 1)
await slot('Ảnh The Beginning', photos[3], 1720, 830, 600, 440, 28, -0.8)
await slot('Ảnh cả nhà', photos[4], 1180, 330, 1140, 460, 50, 0)

// chú thích báo dưới ảnh
text('Chú thích 1', 'Hình 1. Cả nhà, một khung hình.', 1180, 800, 1140, 28, 'Montserrat', GREY, { italic: false, ls: 1 })
text('Chú thích 2', 'Hình 2. Bé và chiếc ghế gỗ.', 80, 1222, 500, 26, 'Montserrat', GREY)
text('Chú thích 3', 'Hình 3. Sinh nhật số một.', 640, 1222, 500, 26, 'Montserrat', GREY)
text('Chú thích 4', 'Hình 4. Chị em, và một chiếc váy.', 1720, 1278, 600, 26, 'Montserrat', GREY)

// ── 5. CỘT BÀI: trích dẫn lớn + đoạn văn giả (vạch xám) + một khung chữ cắt đỏ ──
text('Trích dẫn', '"Gia đình là nơi mọi khoảnh khắc bắt đầu."', 80, 1280, 1080, 46, 'Playfair Display', INK, { italic: true, weight: '700', lh: 1.15 })
text('Tác giả', '— Mục Gia đình', 80, 1400, 1000, 30, 'Montserrat', RED, { ls: 3, weight: '700' })
{
  let rows = ''
  for (let y = 0; y < 3; y++) for (let x = 0; x < 1; x++) rows += ''
  const lines = []
  for (let k = 0; k < 6; k++) lines.push(`<rect x="0" y="${k * 22}" width="${k === 5 ? 260 : 500}" height="6" fill="${INK}" fill-opacity="0.55"/>`)
  
}
// khung chữ cắt đỏ (ô trích nổi)
{
  const body = `<rect x="6" y="6" width="420" height="150" fill="${RED}"/><rect x="0" y="0" width="420" height="150" fill="${INK}"/>`
  place('Ô đỏ', await writeAsset('box-red.png', await svgPng(426, 156, `<g transform="rotate(-2 213 78)">${body}</g>`)), 1700, 1336, 426, 156, { printRole: 'raised' })
}
text('Chữ ô đỏ', 'NGÀY MỚI', 1712, 1376, 404, 48, 'Playfair Display', PAPER, { align: 'center', weight: '700', lh: 1.0 })

// ── 5b. ẢNH CHỦ ĐẠO TÁCH NỀN (GIỮ MÀU): bé gái (ảnh Bloom), dùng kết quả tách nền đã lưu ──
{
  const cutFile = path.join(assetsDir, '..', 'moments-a', 'cutout-1713.png')
  const cut = await readFile(cutFile)
  const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const targetH = HERO.h, sc = targetH / bh, cw = Math.round(bw * sc), ch = targetH
  const pad = 40
  const subject = await sharp(cut).extract({ left: x0, top: y0, width: bw, height: bh }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer()
  const W2 = cw + 2 * pad, H2 = ch + 2 * pad
  const canvas = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: subject, left: pad, top: pad }]).png().toBuffer()
  const alpha = await sharp(canvas).extractChannel(3).raw().toBuffer()
  const grow = async (r) => { let b = await step(alpha, W2, H2, (q) => q.blur(Math.max(0.5, r / 1.47))); b = await step(b, W2, H2, (q) => q.threshold(18)); b = await step(b, W2, H2, (q) => q.blur(3)); return step(b, W2, H2, (q) => q.threshold(128)) }
  const white = await grow(HERO.border), ink = await grow(HERO.border + 3)
  const solid = (rgb, a) => sharp(Buffer.alloc(W2 * H2 * 3).map((_, i) => rgb[i % 3]), { raw: { width: W2, height: H2, channels: 3 } }).joinChannel(a, { raw: { width: W2, height: H2, channels: 1 } }).png().toBuffer()
  const shadow = await step(await step(white, W2, H2, (q) => q.blur(12)), W2, H2, (q) => q.linear(0.45, 0))
  const png = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: await solid([30, 25, 20], shadow), left: 0, top: 14 },
    { input: await solid([20, 20, 20], ink), left: 0, top: 0 },
    { input: await solid([255, 255, 255], white), left: 0, top: 0 },
    { input: canvas, left: 0, top: 0 },
  ]).png().toBuffer()
  const url = await writeAsset('hero-color.png', png)
  const gx = HERO.x - pad, gy = HERO.y - pad
  place('Ảnh chủ đạo (tách nền, giữ màu)', url, gx, gy, W2, H2, { printRole: 'raised' }).cutInset = HERO.border / 2
}
function f2(n) { return n }
// ── 6. CHÂN TRANG ──
place('Vạch chân trang', await writeAsset('rule-foot.png', await svgPng(2280, 4, `<rect width="2280" height="4" fill="${INK}"/>`)), 60, 1530, 2280, 4, { printRole: 'base' })
text('Chân trang', 'TRANG 1 · 30 × 20 CM · DÁN TAY, IN TỜ TỔNG HỢP', 60, 1548, 2280, 24, 'Montserrat', GREY, { align: 'center', ls: 4 })

const global = {
  name: 'The Daily Family · báo chí cắt dán', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: PAPER, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'newspaper-a', version: 1, customer: placeholders ? 'Mẫu' : 'The Daily Family', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
