// [TINIX] Dựng trang scrapbook "Little One" (30×20 cm) theo phong cách ảnh mẫu bé 1 tuổi: nền pastel họa tiết, ảnh nghiêng nhẹ,
// ba ảnh tách nền cỡ lớn, chữ lớn die-cut, nhiều nhãn/ruy băng kiểu khác nhau, sticker chủ đề. Quy tắc: DESIGN-RULES.md; hàm: scripts/lib/collage-kit.mjs.
//   node scripts/tinix-build-little-one.mjs --output FILE [--photos 1713,1714,1715,1716,1717] [--placeholders]
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
const C = { mint: '#cfe8dd', ink: '#2b2b2e', coral: '#ee7b86', pink: '#f7b9c5', yellow: '#f6d56a', teal: '#79c4b2', lilac: '#c9b9ec', white: '#fffdf8' }
let seed = 2024
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
  assetsDir: path.join(root, 'service', 'static', 'collage', 'little-one-a'), assetsUrl: '/static/collage/little-one-a',
  cutoutCacheDir: path.join(root, 'service', 'static', 'collage', 'moments-a'),
})
const { layers, text, dieText, slot, paperShape, hero, label, themeSticker, patternBackground, starSticker, heartSticker, tapePiece } = kit
const COLOR = {} // ảnh giữ màu gốc (không hiệu ứng đen trắng); chọn "Gốc" trong app vẫn đúng

// ── 1. NỀN pastel họa tiết chấm trắng + vân giấy/hạt của app (quy tắc 3.3, 3.6) ──
const bg = await patternBackground('Nền pastel chấm', 'dots', W, H, { base: C.mint, ink: '#ffffff', opacity: 0.7, size: 26 })
bg.effects = { paper: 40, grain: 14 }

// ── 2. ẢNH PHỤ trong khung nghiêng + giấy màu hình hoa/tim dưới ảnh tách nền ──
await slot('Ảnh cả nhà', photos[4], 1040, 100, 1220, 560, 50, [1080, 470, -24], 'cloud', COLOR, -2)
await paperShape('Giấy tim hồng', 'heart', 1560, 600, 760, 780, C.pink)
await paperShape('Giấy hoa vàng', 'flower', 130, 640, 720, 780, C.yellow)
await slot('Ảnh Pure Joy', photos[1], 110, 100, 540, 700, 0, [440, 610, 30], 'ellipse', COLOR, 2)

// ── 3. ẢNH TÁCH NỀN CỠ LỚN, nghiêng nhẹ, đè lên khung và giấy màu (quy tắc 1.2, 2.8) ──
await hero('Ảnh chủ đạo · bé ngồi', photos[2], 250, 690, 800, 16, -3)
await hero('Ảnh chủ đạo · bé gái', photos[0], 840, 470, 1080, 16, 2)
await hero('Ảnh chủ đạo · chị em', photos[3], 1760, 640, 840, 16, 2)

// ── 4. CHỮ LỚN: ONE bằng chữ giấy màu + lettering die-cut ──
const word = 'ONE', fills = [C.coral, C.teal, C.yellow], inks = ['#fffdf8', '#fffdf8', C.ink]
for (let i = 0; i < word.length; i++) text('Chữ giấy ' + word[i], word[i], 680 + i * 150, 70 + (i % 2 ? 26 : 0), 140, 170, 'Playfair Display', inks[i], { align: 'center', weight: '700', bg: fills[i], h: 240, rot: i % 2 ? 4 : -4 })
dieText('Lettering Happy Days', 'Happy\nDays', 570, 290, 470, 120, 'Pacifico', C.coral, { align: 'center', lh: 1.0, h: 330, rot: -6, edge: C.ink })

// ── 5. NHÃN / RUY BĂNG đủ kiểu (quy tắc 4.9) ──
await label('Nhãn 1 tuổi', 'MỘT TUỔI', 70, 1430, 400, 90, { kind: 'ribbon', fill: C.coral, ink: '#fffdf8', alias: 'Montserrat', size: 40, rot: -3 })
await label('Nhãn Just Smile', 'JUST SMILE', 1230, 1380, 330, 78, { kind: 'tag', fill: C.white, ink: C.ink, alias: 'Montserrat', size: 32, rot: 3 })
await label('Nhãn Best Day', 'BEST DAY EVER', 700, 1470, 430, 76, { kind: 'torn', fill: C.yellow, ink: C.ink, alias: 'Montserrat', size: 32, rot: -2 })
await label('Nhãn Joy', 'FULL OF JOY', 1010, 640, 360, 74, { kind: 'stitch', fill: C.lilac, ink: C.ink, alias: 'Montserrat', size: 30, rot: 4 })
await label('Nhãn Love', 'LOVE', 2030, 1450, 230, 66, { kind: 'ribbon', fill: C.teal, ink: '#fffdf8', alias: 'Montserrat', size: 32, rot: -4 })

// ── 6. STICKER CHỦ ĐỀ + sao tim nhỏ ──
await themeSticker('Bánh sinh nhật', 'cake', 1330, 1130, 250, { a: C.coral, b: C.pink, c: C.teal, d: C.yellow })
await themeSticker('Máy ảnh', 'camera', 2100, 1200, 230, { a: C.pink, b: C.white, d: C.yellow })
await heartSticker('Tim coral', 1210, 560, 140, 110, C.coral)
await heartSticker('Tim lilac', 1170, 770, 230, 190, C.lilac)
await starSticker('Sao vàng', 2230, 560, 120, 48, 22, C.yellow)
await starSticker('Sao lilac', 600, 1360, 120, 46, 21, C.lilac)

const global = {
  name: 'Little One · scrapbook 1 tuổi', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: C.mint, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'little-one-a', version: 1, customer: placeholders ? 'Mẫu' : 'Little One', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
