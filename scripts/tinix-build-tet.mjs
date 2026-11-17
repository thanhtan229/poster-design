// [TINIX] Mẫu scrapbook Tết "Cổng xuân" (30×20 cm): nền đỏ thẫm họa tiết ô vàng, hai khung vòm cổng ở giữa, khung vuông bo (squircle) và khung tem,
// ba ảnh tách nền cỡ lớn ở hai bên và dưới, chữ "Tết" die-cut cỡ lớn, nhãn ruy băng. Quy tắc: DESIGN-RULES.md; hàm: scripts/lib/collage-kit.mjs.
//   node scripts/tinix-build-tet.mjs --output FILE [--photos 1722,1723,1724,1725,1720,1721,1718] [--placeholders]
// Thứ tự --photos: vòm trái, vòm phải, hero mẹ-con (cao), hero bé-lân, hero bé-lân thứ hai, khung vuông bo, khung tem.
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
const ids = (arg('--photos') || '1722,1723,1724,1725,1720,1721,1718').split(',').map(Number)
if (ids.length !== 7 || ids.some((n) => !Number.isInteger(n))) throw new Error('--photos cần đúng 7 mã ảnh')
const placeholders = process.argv.includes('--placeholders')

const W = 2400, H = 1600, DPI = +(W / (30 / 2.54)).toFixed(1)
const C = { red: '#a31621', gold: '#f2c14e', cream: '#fbeed3', ink: '#4a0d12', coral: '#e0503a', pink: '#f4a7a0', white: '#fffdf8' }
let seed = 2026
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
  assetsDir: path.join(root, 'service', 'static', 'collage', 'tet-a'), assetsUrl: '/static/collage/tet-a',
  cutoutCacheDir: path.join(root, 'service', 'static', 'collage', 'moments-a'),
})
const { layers, dieText, slot, paperShape, hero, label, patternBackground, starSticker, heartSticker } = kit
const COLOR = {} // ảnh giữ màu gốc

// ── 1. NỀN đỏ thẫm họa tiết ô vàng mờ + vân giấy/hạt của app ──
const bg = await patternBackground('Nền đỏ ô vàng', 'check', W, H, { base: C.red, ink: C.gold, opacity: 0.5, size: 34 })
bg.effects = { paper: 35, grain: 12 }

// ── 2. GIẤY MÀU nền cho ảnh tách nền (hình tem tròn và vuông bo) ──
await paperShape('Giấy tem vàng', 'stamp', 1700, 560, 620, 620, C.gold)
await paperShape('Giấy vuông kem', 'squircle', 60, 740, 560, 740, C.cream)

// ── 3. HAI KHUNG VÒM CỔNG ở giữa (so le độ cao), ảnh người nhìn thẳng, đầu nằm trong khung ──
await slot('Ảnh vòm trái', photos[0], 720, 130, 500, 860, 20, [80, 60, -18], 'arch', COLOR, -2)
await slot('Ảnh vòm phải', photos[1], 1250, 230, 470, 700, 25, [380, 30, 20], 'arch', COLOR, 2)

// ── 4. ẢNH TÁCH NỀN CỠ LỚN (quy tắc 1.2): mẹ con bên phải, bé và lân bên trái, bé và lân thứ hai ở dưới ──
await hero('Hero mẹ con', photos[2], 1800, 130, 1250, 16, 2)
await hero('Hero bé và lân', photos[3], 110, 620, 860, 16, -3)
await hero('Hero bé và sư tử', photos[4], 660, 770, 740, 16, 2)

// ── 5. KHUNG VUÔNG BO + KHUNG TEM nhỏ ở dưới (hai dáng mới, khác mẫu trước) ──
await slot('Ảnh khung bo', photos[5], 1180, 1040, 560, 470, 40, [70, 20, -22], 'squircle', COLOR, -3)
await slot('Ảnh khung tem', photos[6], 1900, 1130, 380, 380, 40, null, 'stamp', COLOR, 4)

// ── 6. CHỮ LỚN: "Tết" die-cut vàng viền mực ở góc trên trái; câu chúc nhỏ dưới ──
dieText('Lettering Tết', 'Tết', 70, 60, 620, 330, 'Pacifico', C.gold, { align: 'center', lh: 1.0, h: 470, rot: -6, edge: C.ink })
dieText('Lettering đoàn viên', 'đoàn viên', 90, 440, 560, 110, 'Pacifico', C.ink, { align: 'center', lh: 1.0, h: 190, rot: -4, edge: C.gold })

// ── 7. NHÃN / RUY BĂNG đủ kiểu (quy tắc 4.9) ──
await label('Nhãn chúc mừng', 'CHÚC MỪNG NĂM MỚI', 720, 38, 520, 74, { kind: 'ribbon', fill: C.coral, ink: C.white, alias: 'Montserrat', size: 32, rot: 0 })
await label('Nhãn an khang', 'AN KHANG', 130, 1440, 330, 74, { kind: 'torn', fill: C.gold, ink: C.ink, alias: 'Montserrat', size: 32, rot: -3 })
await label('Nhãn phúc lộc', 'PHÚC LỘC', 1840, 70, 300, 70, { kind: 'tag', fill: C.cream, ink: C.ink, alias: 'Montserrat', size: 30, rot: 4 })
await label('Nhãn vạn sự', 'VẠN SỰ NHƯ Ý', 1980, 1090, 380, 70, { kind: 'stitch', fill: C.pink, ink: C.ink, alias: 'Montserrat', size: 28, rot: -4 })
await label('Nhãn sum vầy', 'SUM VẦY', 560, 1460, 290, 70, { kind: 'ribbon', fill: C.cream, ink: C.coral, alias: 'Montserrat', size: 30, rot: 3 })

// ── 8. STICKER nhỏ lấp chỗ trống ──
await heartSticker('Tim vàng', 1700, 960, 150, 120, C.gold)
await starSticker('Sao kem', 1240, 1000, 110, 44, 20, C.cream)
await starSticker('Sao vàng 2', 640, 140, 110, 44, 20, C.gold)
await heartSticker('Tim hồng', 2220, 840, 130, 105, C.pink)

const global = {
  name: 'Tết · scrapbook cổng xuân', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: C.red, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'tet-a', version: 2, customer: placeholders ? 'Mẫu' : 'Tết', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
