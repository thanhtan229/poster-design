// [TINIX] Dựng trang "báo chí cắt dán" (30×20 cm): nền giấy báo, ảnh đen trắng trong khung giấy trắng hình tự do,
// ba ảnh tách nền cỡ lớn chồng lên khung, chữ dán die-cut. Quy tắc thiết kế: DESIGN-RULES.md; hàm dùng chung: scripts/lib/collage-kit.mjs.
// Đồ họa vẽ bằng SVG; chữ dùng font thật. Không dùng pixel nào của ảnh mẫu.
//   node scripts/tinix-build-newspaper.mjs --output FILE [--photos 1713,1714,1715,1716,1717] [--placeholders]
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createCollageKit } from './lib/collage-kit.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const Database = createRequire(path.join(root, 'service', 'package.json'))('better-sqlite3')

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const out = arg('--output')
if (!out) throw new Error('--output FILE là bắt buộc')
const ids = (arg('--photos') || '1713,1714,1715,1716,1717').split(',').map(Number)
if (ids.length !== 5 || ids.some((n) => !Number.isInteger(n))) throw new Error('--photos cần đúng 5 mã ảnh')
const placeholders = process.argv.includes('--placeholders')

const W = 2400, H = 1600, DPI = +(W / (30 / 2.54)).toFixed(1)
const INK = '#141414', PAPER = '#ecE6d8', RED = '#c8382b', GREY = '#8a8478', YELLOW = '#f3d36b'
let seed = 1931
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

const db = new Database(path.join(root, 'service', 'data', 'poster.db'), { readonly: true })
const photos = ids.map((id) => {
  const r = db.prepare("SELECT id, url, web_url FROM user_images WHERE id = ? AND source = 'upload'").get(id)
  if (!r) throw new Error(`Không thấy ảnh ${id} trong thư viện`)
  return r
})
const fontRows = new Map(db.prepare("SELECT id, alias, ttf FROM fonts WHERE alias IN ('Playfair Display', 'Montserrat', 'Pacifico', 'Anton', 'Lobster')").all().map((r) => [r.alias, r]))
db.close()

const kit = await createCollageKit({
  root, rnd, fontRows, placeholders,
  assetsDir: path.join(root, 'service', 'static', 'collage', 'newspaper-a'), assetsUrl: '/static/collage/newspaper-a',
  cutoutCacheDir: path.join(root, 'service', 'static', 'collage', 'moments-a'), // dùng chung cache tách nền với trang scrapbook
})
const { layers, f, place, text, dieText, slot, paperShape, hero, starSticker, heartSticker, svgPng, writeAsset } = kit

// ── 1. NỀN GIẤY BÁO: màu ngà + các dòng chữ báo mờ; vân giấy/hạt dùng hiệu ứng có sẵn của app ──
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
  bgLayer.effects = { paper: 55, grain: 18 } // imageLayer() bỏ qua effects truyền vào nên gán trực tiếp
}

// ── 2. MASTHEAD: tên báo, hai vạch kẻ đen, dòng số báo (in thẳng lên nền: base) ──
text('Tên báo', 'THE DAILY FAMILY', 60, 40, 2280, 170, 'Playfair Display', INK, { align: 'center', weight: '700', ls: 4, base: true })
place('Vạch đen dày', await writeAsset('rule-thick.png', await svgPng(2280, 14, `<rect width="2280" height="14" fill="${INK}"/>`)), 60, 232, 2280, 14, { printRole: 'base' })
place('Vạch đen mảnh', await writeAsset('rule-thin.png', await svgPng(2280, 4, `<rect width="2280" height="4" fill="${INK}"/>`)), 60, 254, 2280, 4, { printRole: 'base' })
text('Dòng số báo', 'SỐ 1 · ẤN BẢN GIA ĐÌNH · GIÁ: MỘT NỤ CƯỜI', 60, 272, 2280, 30, 'Montserrat', INK, { align: 'center', ls: 6, weight: '400', base: true })

// ── 3. TIÊU ĐỀ GHÉP TỪ CHỮ CẮT RỜI: mỗi chữ một ô giấy màu (chữ có nền riêng = một mảnh), lệch nhẹ ──
const word = 'FAMILY'
const cols = [INK, RED, PAPER, INK, RED, YELLOW]
const inks = [PAPER, PAPER, INK, PAPER, PAPER, INK]
for (let i = 0; i < word.length; i++) {
  text('Chữ cắt ' + word[i], word[i], 70 + i * 178, 330 + (i % 2 ? 14 : 0), 172, 190, 'Playfair Display', inks[i], { align: 'center', weight: '700', bg: cols[i], h: 230 })
}
text('Tiêu đề phụ', 'Một ngày, và cả đời', 70, 572, 1040, 52, 'Playfair Display', INK, { italic: true, weight: '400', base: true })

// ── 4. ẢNH PHỤ ĐEN TRẮNG TRONG KHUNG GIẤY TRẮNG HÌNH TỰ DO + GIẤY MÀU HÌNH HOA/TIM ──
// Thứ tự lớp: dưới → trên theo thứ tự dòng. Ảnh tách nền (mục 5) cỡ lớn đè lên khung và giấy màu.
await slot('Ảnh cả nhà', photos[4], 1040, 300, 1300, 620, 50, [1120, 520, -22], 'cloud')
await paperShape('Giấy tim đỏ', 'heart', 1500, 700, 840, 780, RED)
await paperShape('Giấy hoa vàng', 'flower', 420, 700, 700, 760, YELLOW)
await slot('Ảnh Pure Joy', photos[1], 60, 640, 620, 700, 0, [500, 610, 28], 'ellipse')

// ── 5. CHỮ + ẢNH CHỦ ĐẠO TÁCH NỀN (giữ màu, cao 760–1000 px) ──
dieText('Trích dẫn', '"Gia đình là nơi mọi khoảnh khắc bắt đầu."', 60, 1390, 360, 30, 'Playfair Display', INK, { italic: true, weight: '700', lh: 1.15, h: 110 })
text('Tác giả', '— Mục Gia đình', 70, 1492, 330, 24, 'Montserrat', RED, { ls: 3, weight: '700', base: true })
text('Ô NGÀY MỚI', 'NGÀY MỚI', 1470, 1410, 306, 44, 'Playfair Display', PAPER, { align: 'center', weight: '700', lh: 1.0, bg: INK, h: 70, rot: -2 }) // chữ có nền riêng: một mảnh duy nhất

await hero('Ảnh chủ đạo · bé gái', photos[0], 1000, 500, 1000)
await hero('Ảnh chủ đạo · bé ngồi', photos[2], 420, 735, 760)
await hero('Ảnh chủ đạo · chị em', photos[3], 1800, 680, 820)
dieText('Chữ Sum vầy', 'Sum\nvầy', 1390, 930, 420, 130, 'Pacifico', RED, { align: 'center', lh: 1.0, h: 360, rot: -9 })
dieText('Chữ Yêu thương', 'Yêu thương', 620, 545, 500, 84, 'Pacifico', INK, { align: 'center', rot: -4, h: 180 })

// ── 6. STICKER + NHÃN LẤP CHỖ TRỐNG, chồng lên mép ảnh ──
await starSticker('Sao vàng', 1450, 800, 150, 66, 30, '#f3c93b')
await heartSticker('Tim đỏ nhỏ', 2200, 1340, 170, 150, RED)
await heartSticker('Tim hồng nhỏ', 1290, 1290, 130, 110, '#f08aa0')
await starSticker('Sao đỏ', 540, 560, 120, 48, 22, RED)
text('Nhãn HAPPINESS', 'HAPPINESS', 720, 1440, 330, 36, 'Montserrat', INK, { align: 'center', weight: '700', ls: 8, bg: YELLOW, h: 70, rot: -4 })
await starSticker('Sao vàng nhỏ', 1180, 1400, 110, 45, 21, '#f3c93b')
text('Nhãn SMILE', 'SMILE', 2020, 1440, 260, 40, 'Montserrat', PAPER, { align: 'center', weight: '700', ls: 8, bg: INK, h: 66, rot: 3 })

// ── 7. CHÂN TRANG ──
place('Vạch chân trang', await writeAsset('rule-foot.png', await svgPng(2280, 4, `<rect width="2280" height="4" fill="${INK}"/>`)), 60, 1530, 2280, 4, { printRole: 'base' })
text('Chân trang', 'TRANG 1 · 30 × 20 CM · DÁN TAY, IN TỜ TỔNG HỢP', 60, 1548, 2280, 24, 'Montserrat', GREY, { align: 'center', ls: 4, base: true })

const global = {
  name: 'The Daily Family · báo chí cắt dán', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: PAPER, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'newspaper-a', version: 1, customer: placeholders ? 'Mẫu' : 'The Daily Family', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
