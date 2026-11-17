// [TINIX] Mẫu Tết dọc "Tết yêu thương" (20×26,7 cm), bố cục theo ảnh mẫu, VẼ HOÀN TOÀN BẰNG SVG (không copy pixel ảnh mẫu).
// Tọa độ đo trên ảnh mẫu 1086×1448, nhân S = 1600/1086 để ra trang. Chữ lớn dùng lớp chữ của app (font thật).
// Ảnh người là ảnh tải lên của người dùng. Quy tắc: DESIGN-RULES.md; hàm: scripts/lib/collage-kit.mjs.
//   node scripts/tinix-build-tet-svg.mjs --output FILE [--photos 1720,1721,1722,1723,1724] [--placeholders]
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
const ids = (arg('--photos') || '1720,1721,1722,1723,1724').split(',').map(Number)
if (ids.length !== 5 || ids.some((n) => !Number.isInteger(n))) throw new Error('--photos cần đúng 5 mã ảnh')
const placeholders = process.argv.includes('--placeholders')

const RW = 1086, RH = 1448
const W = 1600, S = W / RW, H = Math.round(RH * S), DPI = +(W / (20 / 2.54)).toFixed(1)
const C = { red: '#c8102e', deep: '#8a0f1f', cream: '#f8ead2', paper: '#fffaf0', pink: '#f0a9a8', gold: '#e9b44c', goldDk: '#b8862b', lanRed: '#d8242b', green: '#3f6b45', ink: '#4a0d12', leaf: '#7fa36a', brown: '#8a4b2a', yellow: '#f6d24a', bloom: '#f6c1c4' }
let seed = 2029
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
  assetsDir: path.join(root, 'service', 'static', 'collage', 'tet-svg-a'), assetsUrl: '/static/collage/tet-svg-a',
  cutoutCacheDir: path.join(root, 'service', 'static', 'collage', 'moments-a'),
})
const { layers, place, writeAsset, svgPng, slot, patternBackground, heartSticker, label, dieText, text } = kit

// Bộ lọc viền trắng + bóng cho trang trí dán (kiểu sticker như ảnh mẫu)
const STICK = `<filter id="st" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/><feFlood flood-color="#fffaf0"/><feComposite in2="d" operator="in" result="w"/><feGaussianBlur in="d" stdDeviation="3" result="bl"/><feOffset in="bl" dx="0" dy="5" result="o"/><feFlood flood-color="#000" flood-opacity="0.28"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

// Vẽ một mảnh trang trí: body viết bằng tọa độ ảnh mẫu, PNG có kích thước của hộp (bx,by,bw,bh) × S
async function deco(name, bx, by, bw, bh, body, sticker = true) {
  const w = Math.round(bw * S), h = Math.round(bh * S)
  const svgBody = `<g transform="scale(${S}) translate(${-bx} ${-by})"${sticker ? ' filter="url(#st)"' : ''}>${body}</g>`
  const png = await svgPng(w, h, svgBody, sticker ? STICK : '')
  place(name, await writeAsset(`deco-${name.replace(/\s+/g, '-')}.png`, png), Math.round(bx * S), Math.round(by * S), w, h, { printRole: 'raised' })
}

// Hoa đào 5 cánh + nhụy vàng
const blossom = (cx, cy, r, col = C.bloom) => {
  let s = ''
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; s += `<circle cx="${(cx + Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.55).toFixed(1)}" r="${(r * 0.52).toFixed(1)}" fill="${col}" stroke="#e8858f" stroke-width="1.5"/>` }
  return s + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.26).toFixed(1)}" fill="${C.gold}"/>`
}
const petals5Yellow = (cx, cy, r) => blossom(cx, cy, r, C.yellow)

// Đèn lồng: thân elip có sườn, nắp vàng, tua đỏ
const lantern = (cx, cy, rx, ry, tassel) => {
  let s = `<rect x="${cx - rx * 0.32}" y="${cy - ry - 16}" width="${rx * 0.64}" height="14" rx="4" fill="${C.gold}"/>`
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.lanRed}"/>`
  for (let k = -2; k <= 2; k++) s += `<ellipse cx="${cx + k * rx * 0.28}" cy="${cy}" rx="${rx * 0.12}" ry="${ry * 0.96}" fill="#b5121b" opacity="0.55"/>`
  s += `<ellipse cx="${cx - rx * 0.35}" cy="${cy - ry * 0.35}" rx="${rx * 0.18}" ry="${ry * 0.2}" fill="#ffb3a8" opacity="0.5"/>`
  s += `<rect x="${cx - rx * 0.3}" y="${cy + ry - 2}" width="${rx * 0.6}" height="12" rx="3" fill="${C.gold}"/>`
  s += `<line x1="${cx}" y1="${cy + ry + 12}" x2="${cx}" y2="${tassel}" stroke="${C.gold}" stroke-width="5"/>`
  s += `<ellipse cx="${cx}" cy="${tassel + 14}" rx="${rx * 0.22}" ry="${rx * 0.36}" fill="${C.deep}"/>`
  return s
}

// Lân múa (vẽ lại gần ảnh mẫu): mũ đỏ, bờm đỏ viền lông kem, mắt to tròng cam, miệng há hồng có răng, thân xếp lớp đỏ viền kem
const lionHead = () => {
  const fur = (cx, cy, r) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fbf1d6"/>'
  let s = '<g transform="translate(15 760)">'
  // thân: các lớp váy đỏ viền kem
  s += '<ellipse cx="100" cy="232" rx="96" ry="44" fill="#d62b2b"/>'
  for (let k = 0; k < 7; k++) s += fur(18 + k * 27, 262, 17)
  s += '<ellipse cx="100" cy="208" rx="86" ry="34" fill="#e03a30"/>'
  for (let k = 0; k < 6; k++) s += fur(22 + k * 30, 232, 15)
  s += '<path d="M24 196 Q100 160 180 196" fill="none" stroke="#f0b23a" stroke-width="7" stroke-linecap="round"/>'
  s += '<ellipse cx="100" cy="176" rx="76" ry="26" fill="#d62b2b"/>'
  for (let k = 0; k < 5; k++) s += fur(30 + k * 34, 192, 13)
  // bờm trái (đỏ có lớp lông kem) và bờm phải
  s += '<ellipse cx="52" cy="92" rx="44" ry="70" fill="#d62b2b"/><ellipse cx="40" cy="78" rx="26" ry="52" fill="#fbf1d6" opacity="0.9"/><ellipse cx="46" cy="86" rx="20" ry="44" fill="#e8433a"/>'
  s += '<ellipse cx="188" cy="44" rx="42" ry="36" fill="#d62b2b"/><ellipse cx="190" cy="34" rx="30" ry="22" fill="#fbf1d6"/><ellipse cx="190" cy="40" rx="22" ry="16" fill="#e8433a"/>'
  // đầu
  s += '<ellipse cx="118" cy="98" rx="80" ry="72" fill="#d62b2b"/>'
  // mũ đỏ nhọn + vòng kem
  s += '<path d="M92 34 Q96 -4 120 6 Q140 14 138 34 Z" fill="#c8102e"/><ellipse cx="115" cy="34" rx="30" ry="9" fill="#fbf1d6"/><path d="M100 14 Q112 6 126 12" fill="none" stroke="#f0b23a" stroke-width="4"/>'
  // gương tròn trên trán
  s += '<circle cx="146" cy="52" r="22" fill="#fbf1d6"/><circle cx="146" cy="52" r="16" fill="#3a8f8a"/><circle cx="146" cy="52" r="10" fill="#f0b23a"/><circle cx="146" cy="52" r="4" fill="#c8102e"/>'
  // lông mày kem + mắt trái
  s += '<path d="M58 70 Q96 40 150 72" fill="none" stroke="#fbf1d6" stroke-width="22" stroke-linecap="round"/>'
  s += '<ellipse cx="106" cy="96" rx="30" ry="25" fill="#c8102e"/><ellipse cx="106" cy="96" rx="25" ry="21" fill="#fff"/><circle cx="108" cy="98" r="15" fill="#d98a2a"/><circle cx="108" cy="98" r="9" fill="#2a1410"/><circle cx="104" cy="93" r="3.5" fill="#fff"/>'
  // mắt phải (bị cắt bởi mép hộp)
  s += '<ellipse cx="196" cy="84" rx="22" ry="20" fill="#fff"/><circle cx="198" cy="86" r="12" fill="#d98a2a"/><circle cx="198" cy="86" r="7" fill="#2a1410"/>'
  // mũi: ba hạt cườm đỏ
  s += '<circle cx="146" cy="98" r="8" fill="#e8433a"/><circle cx="162" cy="88" r="8" fill="#e8433a"/><circle cx="180" cy="80" r="8" fill="#e8433a"/>'
  // hàm trên lông kem, miệng há hồng, răng
  s += '<path d="M40 150 Q110 160 220 96" fill="none" stroke="#fbf1d6" stroke-width="30" stroke-linecap="round"/>'
  s += '<path d="M112 138 Q150 122 218 120 L218 178 Q160 190 112 160 Z" fill="#f08a86" stroke="#b5121b" stroke-width="5" stroke-linejoin="round"/>'
  s += '<ellipse cx="170" cy="150" rx="26" ry="12" fill="#f7b4ae"/>'
  for (let k = 0; k < 5; k++) s += '<rect x="' + (126 + k * 18) + '" y="' + (164 - k * 5) + '" width="13" height="14" rx="2" fill="#fff" stroke="#e8d6b8" stroke-width="1.5"/>'
  s += '<path d="M112 160 Q160 192 220 176" fill="none" stroke="#b5121b" stroke-width="6" stroke-linecap="round"/>'
  return s + '</g>'
}

// Mèo may mắn (vẽ lại gần ảnh mẫu): tai viền cam/hồng, mắt cười, má hồng, vòng cổ đỏ có chuông, ôm đồng vàng
const catBody = () => {
  let s = '<g transform="translate(15 1055)">'
  // lá xanh bên trái
  s += '<ellipse cx="42" cy="170" rx="22" ry="9" fill="#9ab06a" transform="rotate(-62 42 170)"/><ellipse cx="34" cy="206" rx="30" ry="10" fill="#7fa36a" transform="rotate(14 34 206)"/>'
  // thân + đốm cam
  s += '<ellipse cx="125" cy="205" rx="82" ry="72" fill="#fbf4e2" stroke="#e7d4a8" stroke-width="2.5"/><circle cx="62" cy="242" r="16" fill="#e8943a"/><ellipse cx="82" cy="178" rx="18" ry="22" fill="#f4e2bd"/>'
  // tay giơ lên
  s += '<ellipse cx="220" cy="82" rx="20" ry="24" fill="#fbf4e2" stroke="#e7d4a8" stroke-width="2.5"/><path d="M212 74 q4 -4 8 0 M222 78 q4 -4 8 0" fill="none" stroke="#e7a8a0" stroke-width="2.5" stroke-linecap="round"/>'
  // đầu
  s += '<ellipse cx="118" cy="104" rx="80" ry="68" fill="#fbf4e2" stroke="#e7d4a8" stroke-width="2.5"/>'
  // tai: viền cam, trong hồng
  s += '<path d="M60 70 Q62 28 84 32 Q104 40 108 56 Z" fill="#fbf4e2" stroke="#e8943a" stroke-width="5" stroke-linejoin="round"/><path d="M72 62 Q74 42 86 44 Q96 48 98 58 Z" fill="#f4a7a0"/>'
  s += '<path d="M126 52 Q142 18 168 14 Q184 20 180 54 Z" fill="#fbf4e2" stroke="#e8943a" stroke-width="5" stroke-linejoin="round"/><path d="M142 48 Q152 28 166 28 Q172 40 170 50 Z" fill="#f4a7a0"/>'
  s += '<path d="M130 40 Q150 30 172 40 Q176 28 168 20 Q148 16 130 40 Z" fill="#e8943a"/>'
  // mặt: mắt cười, mũi, miệng, má hồng, râu
  s += '<path d="M82 104 q14 -16 30 0" fill="none" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round"/><path d="M150 92 q14 -16 30 0" fill="none" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round"/>'
  s += '<path d="M128 108 l8 0 l-4 6 Z" fill="#e8433a"/><path d="M116 120 q10 12 20 0 q10 12 20 -2" fill="none" stroke="#c8102e" stroke-width="3.5" stroke-linecap="round"/>'
  s += '<circle cx="82" cy="126" r="15" fill="#f4b6ae" opacity="0.85"/><circle cx="168" cy="116" r="13" fill="#f4b6ae" opacity="0.85"/>'
  s += '<path d="M56 112 l24 4 M56 124 l24 -2 M184 96 l22 -4 M184 106 l22 4" stroke="#3a2a1a" stroke-width="2.5" stroke-linecap="round"/>'
  // vòng cổ đỏ + chuông
  s += '<path d="M74 164 Q130 176 196 138" fill="none" stroke="#c8102e" stroke-width="12" stroke-linecap="round"/><circle cx="150" cy="168" r="13" fill="#f0b23a" stroke="#b8862b" stroke-width="2"/><rect x="146" y="166" width="8" height="3" fill="#7a5a1a"/>'
  // chân ôm đồng + đồng vàng
  s += '<ellipse cx="176" cy="228" rx="56" ry="64" fill="#f0b23a" stroke="#b8862b" stroke-width="4"/><ellipse cx="176" cy="228" rx="48" ry="56" fill="none" stroke="#e08a2a" stroke-width="2"/>'
  s += '<ellipse cx="96" cy="200" rx="18" ry="13" fill="#fbf4e2" stroke="#e7d4a8" stroke-width="2.5"/><path d="M90 196 q4 -4 8 0" fill="none" stroke="#e7a8a0" stroke-width="2"/>'
  return s + '</g>'
}

const gift = () => `
  <rect x="770" y="1262" width="200" height="140" rx="8" fill="${C.green}"/>
  <rect x="856" y="1262" width="14" height="140" fill="${C.gold}"/>
  <rect x="770" y="1312" width="200" height="12" fill="${C.gold}"/>
  <polygon points="870,1268 904,1296 870,1322 836,1296" fill="${C.red}" stroke="${C.gold}" stroke-width="3"/>
  ${blossom(870, 1296, 14, C.bloom)}`

const bow = () => `
  <path d="M515 1214 L430 1186 L432 1246 Z" fill="#e8707a"/><path d="M515 1214 L600 1186 L598 1246 Z" fill="#e8707a"/>
  <circle cx="515" cy="1214" r="16" fill="#d05a64"/>
  <path d="M506 1228 L494 1256 L506 1250 L512 1262 L520 1230 Z" fill="#e8707a"/>`

const plum = () => `
  <path d="M1100 -20 Q960 40 900 60 Q840 90 790 150" fill="none" stroke="${C.brown}" stroke-width="9" stroke-linecap="round"/>
  <path d="M960 40 Q1000 80 1040 110" fill="none" stroke="${C.brown}" stroke-width="6" stroke-linecap="round"/>
  ${blossom(1060, 22, 34)}${blossom(1000, 70, 30)}${blossom(930, 60, 28)}${blossom(1048, 110, 26)}${blossom(860, 108, 26)}${petals5Yellow(1010, 138, 14)}`

const flowerL = () => blossom(290, 1247, 42) + `<ellipse cx="262" cy="1278" rx="14" ry="7" fill="${C.leaf}"/>`
const flowerR = () => petals5Yellow(991, 1214, 46) + `<ellipse cx="1032" cy="1246" rx="22" ry="11" fill="${C.leaf}" transform="rotate(-25 1032 1246)"/>`

const diamond = () => `
  <polygon points="155,528 268,645 155,762 42,645" fill="${C.red}" stroke="${C.gold}" stroke-width="8" stroke-linejoin="round"/>
  <polygon points="155,556 240,645 155,734 70,645" fill="none" stroke="${C.gold}" stroke-width="3"/>
  ${blossom(155, 702, 22, C.bloom)}`

const cloudPath = (x, y, w, h) => {
  const n = 9; let d = ''
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; const px = x + w / 2 + Math.cos(t) * (w / 2 - 6), py = y + h / 2 + Math.sin(t) * (h / 2 - 6); d += (i ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) }
  return d + ' Z'
}

// ── 1. NỀN: giấy kem + băng giấy đỏ xé (SVG, lớp nền in) ──
const bandsSvg = `
  <path d="M0 0 L1086 0 L1086 226 L620 224 L560 240 L420 216 L300 250 L170 230 L0 268 Z" fill="${C.red}"/>
  <path d="M0 1262 L1086 1244 L1086 1448 L0 1448 Z" fill="${C.deep}"/>`
const bandsPng = await svgPng(W, H, `<g transform="scale(${S})">${bandsSvg}</g>`)
const bg = await patternBackground('Nền giấy kem', 'dots', W, H, { base: C.cream, ink: '#e7cfa6', opacity: 0.35, size: 34 })
bg.effects = { paper: 45, grain: 14 }
place('Băng đỏ xé nền', await writeAsset('bands.png', bandsPng), 0, 0, W, H, { printRole: 'base', lock: true })

// ── 2. KHUNG ẢNH (ảnh của người dùng), đúng vị trí ảnh mẫu ──
const F = (x, y, w, h) => [Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S)]
let [x, y, w, h] = F(215, 290, 400, 555)
await slot('Ảnh lớn trái', photos[0], x, y, w, h, 50, [w - 80, -14, -4], 'squircle', {}, 1)
;[x, y, w, h] = F(620, 160, 340, 340)
await slot('Ảnh tròn trên', photos[1], x, y, w, h, 85, [200, -12, 14], 'ellipse', {}, 2)
;[x, y, w, h] = F(635, 565, 415, 315)
await slot('Ảnh bo phải giữa', photos[2], x, y, w, h, 40, [w - 90, -14, 22], 'squircle', {}, -2)
;[x, y, w, h] = F(225, 845, 330, 335)
await slot('Ảnh tem dưới', photos[3], x, y, w, h, 40, null, 'stamp', {}, 0)
;[x, y, w, h] = F(555, 855, 475, 360)
await slot('Ảnh bo lớn dưới', photos[4], x, y, w, h, 30, [w - 100, -14, -3], 'squircle', {}, -2)

// ── 3. TRANG TRÍ VẼ SVG (mỗi cụm là một mảnh cắt) ──
await deco('Đèn lồng trái', 30, 345, 170, 245, lantern(115, 440, 58, 62, 585))
await deco('Đèn lồng phải', 935, 250, 145, 220, lantern(1010, 335, 50, 56, 455))
await deco('Nhành đào', 760, 0, 326, 150, plum(), true)
await deco('Hoa trái', 240, 1205, 100, 85, flowerL())
await deco('Lộc (bảng vuông)', 40, 525, 230, 240, diamond())
await text('Chữ Lộc', 'Lộc', Math.round(70 * S), Math.round(600 * S), Math.round(170 * S), 80, 'Pacifico', C.paper, { align: 'center', h: 120, lh: 1.0 })
await deco('Đầu lân', 15, 760, 245, 300, lionHead())
await deco('Mèo may mắn', 15, 1055, 255, 290, catBody())
await text('Chữ Lộc trên đồng', 'Lộc', Math.round(145 * S), Math.round(1262 * S), Math.round(100 * S), 62, 'Pacifico', C.red, { align: 'center', h: 90, lh: 1.0 })
await deco('Nơ hồng', 420, 1175, 190, 85, bow())
await deco('Hộp quà', 750, 1215, 235, 195, gift())
await deco('Hoa vàng phải', 925, 1165, 135, 135, flowerR())

// ── 4. CHỮ + NHÃN (lớp chữ của app; nhãn là một nhóm nền + chữ) ──
dieText('Chữ Tết', 'Tết', 40, 40, 560, 300, 'Pacifico', C.red, { align: 'left', lh: 1.0, h: 420, rot: -6, edge: C.paper })
dieText('Chữ yêu thương', 'yêu thương', 40, 320, 600, 96, 'Pacifico', C.deep, { align: 'left', lh: 1.0, h: 160, rot: -4, edge: C.paper })
await label('Nhãn Mừng Xuân', 'Mừng Xuân', Math.round(395 * S), Math.round(50 * S), Math.round(415 * S), Math.round(120 * S), { kind: 'ribbon', fill: C.paper, ink: C.red, alias: 'Pacifico', size: 64, rot: -3 })
await label('Nhãn Bé ngoan', 'Bé ngoan', Math.round(730 * S), Math.round(470 * S), Math.round(300 * S), Math.round(92 * S), { kind: 'stitch', fill: C.paper, ink: C.red, alias: 'Pacifico', size: 50, rot: -2 })
await label('Nhãn chúc bé', 'Chúc bé hay ăn chóng lớn', Math.round(290 * S), Math.round(1240 * S), Math.round(460 * S), Math.round(170 * S), { kind: 'torn', fill: C.paper, ink: C.red, alias: 'Pacifico', size: 52, rot: 0 })

// ── 5. TIM DÁN như ảnh mẫu ──
await heartSticker('Tim đỏ trái', Math.round(640 * S), Math.round(490 * S), 110, 92, '#e8505b')
await heartSticker('Tim đỏ phải', Math.round(975 * S), Math.round(515 * S), 110, 92, '#e8505b')
await heartSticker('Tim hồng phải', Math.round(975 * S), Math.round(780 * S), 90, 76, '#f08aa0')

const global = {
  name: 'Tết yêu thương · vẽ SVG theo ảnh mẫu', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: C.cream, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'tet-svg-a', version: 1, customer: placeholders ? 'Mẫu' : 'Tết', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
