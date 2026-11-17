// [TINIX] Mẫu Tết dọc "Tết yêu thương" (20×26,7 cm), bố cục theo ảnh mẫu, VẼ HOÀN TOÀN BẰNG SVG (không copy pixel ảnh mẫu).
// Tọa độ đo trên ảnh mẫu 1086×1448, nhân S = 1600/1086 để ra trang. Chữ lớn dùng lớp chữ của app (font thật).
// Ảnh người là ảnh tải lên của người dùng. Quy tắc: DESIGN-RULES.md; hàm: scripts/lib/collage-kit.mjs.
//   node scripts/tinix-build-tet-svg.mjs --output FILE [--photos 1720,1721,1722,1723,1724] [--placeholders] [--reference-image FILE]
//   --reference-image: thêm ảnh mẫu mờ 30% (khóa) trên cùng để kéo thả tinh chỉnh trong app; XÓA lớp này trước khi lưu thành mẫu.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { writeFile, readFile } from 'node:fs/promises'
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
const fontRows = new Map(db.prepare("SELECT id, alias, ttf FROM fonts WHERE alias IN ('Playfair Display', 'Montserrat', 'Anton', 'Lobster')").all().map((r) => [r.alias, r]))
db.close()

const kit = await createCollageKit({
  root, rnd, fontRows, placeholders,
  assetsDir: path.join(root, 'service', 'static', 'collage', 'tet-svg-a'), assetsUrl: '/static/collage/tet-svg-a',
  cutoutCacheDir: path.join(root, 'service', 'static', 'collage', 'moments-a'),
})
const { layers, place, writeAsset, svgPng, slot, patternBackground, label, dieText, text } = kit

// Bộ lọc viền trắng + bóng cho trang trí dán (kiểu sticker như ảnh mẫu)
const STICK = `<filter id="st" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="8" result="d"/><feFlood flood-color="#fffaf0"/><feComposite in2="d" operator="in" result="w"/><feGaussianBlur in="d" stdDeviation="3" result="bl"/><feOffset in="bl" dx="0" dy="5" result="o"/><feFlood flood-color="#000" flood-opacity="0.28"/><feComposite in2="o" operator="in" result="sh"/><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.32  0 0 0 0 0.22  0 0 0 0.34 -0.1" result="g"/><feComposite in="g" in2="SourceAlpha" operator="in" result="grain"/><feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="inv" stdDeviation="3.2" result="ib"/><feComposite in="ib" in2="SourceAlpha" operator="in" result="ir"/><feColorMatrix in="ir" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0.32 0" result="rim"/><feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/><feMergeNode in="rim"/><feMergeNode in="grain"/></feMerge></filter>`

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
  // thân đèn: đỏ, bóng sáng bên trái, bóng tối bên phải, sườn cong
  let s = ''
  s += '<ellipse cx="' + cx + '" cy="' + (cy + ry * 0.12) + '" rx="' + (rx * 1.02) + '" ry="' + (ry * 1.02) + '" fill="#8e0d18" opacity="0.35"/>'
  s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + C.lanRed + '"/>'
  s += '<ellipse cx="' + (cx + rx * 0.28) + '" cy="' + cy + '" rx="' + (rx * 0.72) + '" ry="' + (ry * 0.98) + '" fill="#b5121b" opacity="0.35"/>'
  s += '<ellipse cx="' + (cx - rx * 0.36) + '" cy="' + (cy - ry * 0.22) + '" rx="' + (rx * 0.22) + '" ry="' + (ry * 0.42) + '" fill="#ff8a7a" opacity="0.55"/>'
  // sườn: các đường cong dọc theo thân
  for (let k = -3; k <= 3; k++) {
    const x = cx + k * rx * 0.24
    s += '<path d="M' + x.toFixed(1) + ' ' + (cy - ry * 0.9).toFixed(1) + ' Q' + (x + (k === 0 ? 0 : k * 2)).toFixed(1) + ' ' + cy + ' ' + x.toFixed(1) + ' ' + (cy + ry * 0.9).toFixed(1) + '" fill="none" stroke="#9e0f1d" stroke-width="' + (k === 0 ? 3 : 2.2) + '" opacity="0.6"/>'
  }
  // vành trên và dưới bằng vàng, có viền sẫm
  s += '<rect x="' + (cx - rx * 0.42) + '" y="' + (cy - ry - 18) + '" width="' + (rx * 0.84) + '" height="20" rx="6" fill="' + C.gold + '" stroke="' + C.goldDk + '" stroke-width="2"/>'
  s += '<rect x="' + (cx - rx * 0.3) + '" y="' + (cy - ry - 28) + '" width="' + (rx * 0.6) + '" height="12" rx="4" fill="' + C.goldDk + '"/>'
  s += '<rect x="' + (cx - rx * 0.42) + '" y="' + (cy + ry - 2) + '" width="' + (rx * 0.84) + '" height="20" rx="6" fill="' + C.gold + '" stroke="' + C.goldDk + '" stroke-width="2"/>'
  // tua dưới: dây vàng + chùm tua đỏ có sợi
  s += '<line x1="' + cx + '" y1="' + (cy + ry + 18) + '" x2="' + cx + '" y2="' + (tassel - 18) + '" stroke="' + C.gold + '" stroke-width="5"/>'
  s += '<ellipse cx="' + cx + '" cy="' + (tassel - 4) + '" rx="' + (rx * 0.26) + '" ry="' + (rx * 0.2) + '" fill="' + C.gold + '" stroke="' + C.goldDk + '" stroke-width="2"/>'
  for (let k = -3; k <= 3; k++) s += '<line x1="' + (cx + k * 4) + '" y1="' + (tassel + 2) + '" x2="' + (cx + k * 5) + '" y2="' + (tassel + 44) + '" stroke="#c4161c" stroke-width="5" stroke-linecap="round"/>'
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
  <ellipse cx="872" cy="1362" rx="120" ry="12" fill="#2a1410" opacity="0.18"/>
  <rect x="770" y="1262" width="200" height="140" rx="8" fill="${C.green}"/>
  <rect x="770" y="1262" width="200" height="30" rx="8" fill="#5a9468"/>
  <rect x="770" y="1262" width="200" height="140" rx="8" fill="none" stroke="#2c4f33" stroke-width="3"/>
  <g fill="#4f8a5a" opacity="0.55">${[0, 1, 2, 3, 4, 5].map((k) => '<rect x="' + (784 + k * 32) + '" y="1308" width="16" height="16" rx="3"/>').join('')}</g>
  <rect x="856" y="1262" width="14" height="140" fill="${C.gold}"/>
  <rect x="770" y="1312" width="200" height="12" fill="${C.gold}"/>
  <ellipse cx="846" cy="1246" rx="22" ry="14" fill="none" stroke="${C.gold}" stroke-width="7" transform="rotate(-28 846 1246)"/>
  <ellipse cx="892" cy="1246" rx="22" ry="14" fill="none" stroke="${C.gold}" stroke-width="7" transform="rotate(28 892 1246)"/>
  <circle cx="869" cy="1252" r="9" fill="${C.goldDk}"/>
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

// ═══════════ DỰNG THEO SPEC (scripts/specs/tet-yeu-thuong.json) ═══════════
// Mỗi mục spec → một lớp/nhóm mang `specId`; thứ tự xếp lớp = z của spec. Kiểm tra: reference check-layout.
import { readFileSync } from 'node:fs'
const spec = JSON.parse(readFileSync(path.join(root, 'scripts', 'specs', 'tet-yeu-thuong.json'), 'utf8'))
const items = spec.items.map((it, i) => ({ ...it, _i: i })).sort((a, b) => a.z - b.z || a._i - b._i)
const px = (n) => Math.round(n * S)
const tag = (layer, id, extra = {}) => { layer.specId = id; Object.assign(layer, extra); return layer }

// Đường viền giấy xé: các điểm dọc 4 cạnh lệch ngẫu nhiên (hạt giống cố định)
const tornPath = (x, y, w, h, jag = 5) => {
  const pts = [], step = 16, j = () => (rnd() - 0.5) * 2 * jag
  for (let t = 0; t < w; t += step) pts.push([x + t, y + j()])
  for (let t = 0; t < h; t += step) pts.push([x + w + j(), y + t])
  for (let t = w; t > 0; t -= step) pts.push([x + t, y + h + j()])
  for (let t = h; t > 0; t -= step) pts.push([x + j(), y + t])
  return 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + ' Z'
}
// Vân giấy: nhiễu mịn nhân lên màu + bóng mép mỏng
const PAPERFX = `<filter id="pp" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.24 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#3a1010" flood-opacity="0.3" in="SourceGraphic" result="sh"/><feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="11" result="n2"/><feColorMatrix in="n2" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0.5 -0.12" result="g2"/><feComposite in="g2" in2="SourceGraphic" operator="in" result="gi2"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/><feMergeNode in="gi2"/></feMerge></filter>`
// Hoa văn sóng vàng (seigaiha)
const waveSvg = (b, fill) => {
  const [x, y, w, h] = b, r = 34
  let s = `<clipPath id="wv${Math.round(x)}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#wv${Math.round(x)})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  for (let row = 0; row * r * 0.5 < h + r; row++) for (let col = -1; col * r * 2 < w + r * 2; col++) {
    const cx = x + col * r * 2 + (row % 2 ? r : 0), cy = y + row * r * 0.5 + r * 0.4
    for (let k = 3; k >= 1; k--) s += `<circle cx="${cx}" cy="${cy}" r="${(r * k) / 3}" fill="${k % 2 ? '#fbeccb' : fill}" stroke="#dcb978" stroke-width="2"/>`
  }
  return s + '</g>'
}

// ── NỀN: giấy kem + các mảng giấy xé (z < 5) vẽ vào một lớp nền in ──
const bg = await patternBackground('Nền giấy kem', 'dots', W, H, { base: C.cream, ink: '#e7cfa6', opacity: 0.25, size: 34 })
bg.effects = { paper: 70, grain: 22 }
let baseSvg = ''
for (const it of items.filter((i) => (i.type === 'paper' || i.type === 'wave') && i.z < 5)) {
  const [x, y, w, h] = it.box
  const shade = (hex, f) => '#' + [1, 3, 5].map((o) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(o, o + 2), 16) * f))).toString(16).padStart(2, '0')).join('')
  if (it.type === 'paper' && w * h > 60000) {
    baseSvg += `<path d="${tornPath(x, y, w, h, 5)}" fill="${it.fill}" filter="url(#pp)"/>`
    for (let q = 0; q < 7; q++) { const pw = w * (0.25 + rnd() * 0.3), ph = h * (0.14 + rnd() * 0.2), px0 = x + rnd() * (w - pw), py0 = y + rnd() * (h - ph); baseSvg += `<path d="${tornPath(px0, py0, pw, ph, 6)}" fill="${shade(it.fill, 0.86 + rnd() * 0.26)}" opacity="0.9" filter="url(#pp)"/>` }
    continue
  }
  baseSvg += it.type === 'wave' ? waveSvg(it.box, it.fill) : `<path d="${tornPath(x, y, w, h, 5)}" fill="${it.fill}" filter="url(#pp)"${it.rot ? ` transform="rotate(${it.rot} ${x + w / 2} ${y + h / 2})"` : ''}/>`
}
place('Nền giấy xé chồng lớp', await writeAsset('bands.png', await svgPng(W, H, `<g transform="scale(${S})">${baseSvg}<rect x="6" y="6" width="1074" height="1436" fill="none" stroke="#f8ead2" stroke-width="10" opacity="0.9"/></g>`, PAPERFX)), 0, 0, W, H, { printRole: 'base', lock: true })

// ── Vẽ một mảnh dán: art theo tọa độ ảnh mẫu (hộp tự nhiên nat), co đều vào hộp spec, xoay theo spec ──
// Bộ lọc STICK mở rộng tối đa ~24 đơn vị quanh nét vẽ (dilate 8 + nhòe 3σ ≈ 9 + lệch bóng 5): đệm PNG tính theo đó
const FILTER_REACH = 24
async function decoBox(it, name, art, nat, { sticker = true } = {}) {
  const [bx, by, bw, bh] = it.box
  const k = Math.min(bw / nat[2], bh / nat[3])
  const pad = sticker ? Math.ceil(S * k * FILTER_REACH) + 2 : 14
  const w = px(bw) + 2 * pad, h = px(bh) + 2 * pad
  const ncx = nat[0] + nat[2] / 2, ncy = nat[1] + nat[3] / 2
  const tr = `translate(${w / 2} ${h / 2}) scale(${S * k}) translate(${-ncx} ${-ncy})`
  let png = await svgPng(w, h, `<g transform="${tr}"${sticker ? ' filter="url(#st)"' : ''}>${art}</g>`, STICK)
  // Kiểm tra: viền ngoài cùng của PNG phải trong suốt, nếu không là hình bị cắt ngang mép (lỗi tim bị cụt mũi)
  const { data, info } = await kit.sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // cạnh nằm ngoài trang thì bị cắt theo mép trang (cố ý), bỏ qua cạnh đó
  const left = px(bx) - pad, top = px(by) - pad
  const skip = { t: top < 0, b: top + h > H, l: left < 0, r: left + w > W }
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + info.channels - 1]
  let hit = 0
  for (let x = 0; x < info.width; x++) { if (!skip.t && alphaAt(x, 0) > 8) hit++; if (!skip.b && alphaAt(x, info.height - 1) > 8) hit++ }
  for (let y = 0; y < info.height; y++) { if (!skip.l && alphaAt(0, y) > 8) hit++; if (!skip.r && alphaAt(info.width - 1, y) > 8) hit++ }
  if (hit > 0) console.error(`CẢNH BÁO: sticker "${it.id}" có ${hit} điểm ảnh không trong suốt ở mép PNG (hình có thể bị cắt ngang): tăng đệm hoặc thu nhỏ hình trong hộp`)
  // cắt theo mép trang: mảnh chạm mép (cành đào, mèo...) bị cắt đúng mép thành phẩm, không báo "vượt mép"
  const cl = Math.max(0, left), ct = Math.max(0, top), cr = Math.min(W, left + w), cb = Math.min(H, top + h)
  const clamped = cl !== left || ct !== top || cr !== left + w || cb !== top + h
  if (clamped) png = await kit.sharp(png).extract({ left: cl - left, top: ct - top, width: cr - cl, height: cb - ct }).png().toBuffer()
  const l = place(name, await writeAsset(`deco-${it.id}.png`, png), cl, ct, cr - cl, cb - ct, { printRole: 'raised' })
  l.rotate = `${it.rot || 0}deg`
  return tag(l, it.id, clamped ? { specCenterOnly: true } : { specInset: pad })
}
const heartPathD = (cx, cy, w, h) => {
  const raw = []
  for (let i = 0; i < 96; i++) { const t = (i / 96) * Math.PI * 2; raw.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]) }
  const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const pts = raw.map((q) => [cx + ((q[0] - (x0 + x1) / 2) / (x1 - x0)) * w, cy + ((q[1] - (y0 + y1) / 2) / (y1 - y0)) * h])
  return 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + ' Z'
}
const scallopRing = (cx, cy, R, n, bump) => {
  let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fbe3dd" stroke="#f3c2bd" stroke-width="3"/>`
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; s += `<circle cx="${(cx + Math.cos(a) * R).toFixed(1)}" cy="${(cy + Math.sin(a) * R).toFixed(1)}" r="${bump}" fill="#fbe3dd" stroke="#f3c2bd" stroke-width="2.5"/>` }
  return s + `<circle cx="${cx}" cy="${cy}" r="${R - 12}" fill="#fff6ec"/>`
}
// Đèn lồng sinh theo hộp: thân elip rộng (ry = 0,7 rx), nắp vàng, tua đỏ
const lanternIn = (b) => { const [x, y, w, h] = b, rx = w / 2 - 6, ry = rx * 0.7, cy = y + 28 + ry; return lantern(x + w / 2, cy, rx, ry, y + h - 44) }
const boxOf = (id) => items.find((i) => i.id === id).box

const PHOTO = { 'anh-lon-trai': [0, 50], 'anh-tron-tren': [1, 85], 'anh-phai-giua': [2, 40], 'anh-tem': [3, 40], 'anh-lon-duoi-phai': [4, 30] }
const STICKERS = {
  'den-long-trai': { art: () => lanternIn(boxOf('den-long-trai')) },
  'den-long-phai': { art: () => lanternIn(boxOf('den-long-phai')) },
  'bang-loc': { art: diamond, nat: [40, 525, 230, 240] },
  'lan': { art: lionHead, nat: [15, 760, 245, 300] },
  'meo': { art: catBody, nat: [15, 1055, 255, 290] },
  'hoa-dao-trai': { art: flowerL, nat: [240, 1205, 100, 85] },
  'nhanh-dao': { art: plum, nat: [760, 0, 326, 150] },
  'hoa-vang-tren': { art: () => petals5Yellow(385, 50, 40) + petals5Yellow(415, 78, 18), nat: [335, 5, 100, 95] },
  'hoa-vang-phai': { art: flowerR, nat: [925, 1165, 135, 135] },
  'hop-qua': { art: gift, nat: [750, 1215, 235, 195] },
  'no': { art: bow, nat: [420, 1175, 190, 85] },
}
for (const it of items) {
  const [bx, by, bw, bh] = it.box
  const cx = bx + bw / 2, cy = by + bh / 2
  if ((it.type === 'paper' || it.type === 'wave') && it.z < 5) continue
  if (it.type === 'scallop') { await decoBox(it, 'Viền sò hồng', scallopRing(cx, cy, bw / 2 - 20, 24, 20), [bx, by, bw, bh]); continue }
  if (it.type === 'paper') {
    const blob = `<ellipse cx="${bx + bw * 0.28}" cy="${by + bh * 0.62}" rx="${bw * 0.27}" ry="${bh * 0.4}" fill="${it.fill}"/><ellipse cx="${bx + bw * 0.55}" cy="${by + bh * 0.5}" rx="${bw * 0.36}" ry="${bh * 0.46}" fill="${it.fill}"/><ellipse cx="${bx + bw * 0.82}" cy="${by + bh * 0.6}" rx="${bw * 0.2}" ry="${bh * 0.38}" fill="${it.fill}"/>`
    await decoBox(it, 'Đám kem chữ', blob, [bx, by, bw, bh]); continue
  }
  if (it.type === 'photo') {
    const [pi, cropY] = PHOTO[it.id]
    tag(await slot(it.id, photos[pi], px(bx), px(by), px(bw), px(bh), cropY, null, it.shape || 'squircle', {}, it.rot || 0), it.id); continue
  }
  if (it.type === 'tape') {
    await kit.tapePiece('Băng dính ' + it.id, px(cx), px(cy), px(bw), px(bh) * 0.85, it.rot || 0)
    tag(layers[layers.length - 1], it.id, { specCenterOnly: true }); continue
  }
  if (it.type === 'sticker' && STICKERS[it.id]) {
    const d = STICKERS[it.id]
    await decoBox(it, it.id, d.art(), d.nat || [bx, by, bw, bh])
    if (it.id === 'bang-loc') tag(text('Chữ Lộc', 'Lộc', px(70), px(605), px(170), 80, 'Lobster', C.paper, { align: 'center', h: 120, lh: 1.0 }), 'chu-loc-bang', { specCenterOnly: true })
    continue
  }
  if (it.id === 'dong-tien-loc') { tag(text('Chữ Lộc trên đồng', 'Lộc', px(145), px(1262), px(100), 62, 'Lobster', C.red, { align: 'center', h: 90, lh: 1.0, rot: it.rot || 0 }), it.id, { specCenterOnly: true }); continue }
  if (it.type === 'heart') {
    const outline = it.id.startsWith('tim-chuc')
    await decoBox(it, it.id, `<path d="${heartPathD(cx, cy, bw * 0.88, bh * 0.84)}" fill="${outline ? 'none' : it.fill}" stroke="${outline ? it.fill : 'none'}" stroke-width="5" stroke-linejoin="round"/>`, [bx, by, bw, bh]); continue
  }
  if (it.type === 'spark') {
    const base = it.id === 'tia-vang-tet' ? 215 : 160, len = Math.max(bw, bh)
    const sk = [0, 1, 2].map((k) => { const a = ((base + k * 38) * Math.PI) / 180; return `<path d="M${(cx + Math.cos(a) * len * 0.14).toFixed(1)} ${(cy + Math.sin(a) * len * 0.14).toFixed(1)} L${(cx + Math.cos(a) * len * 0.38).toFixed(1)} ${(cy + Math.sin(a) * len * 0.38).toFixed(1)}" stroke="${it.fill}" stroke-width="9" stroke-linecap="round"/>` }).join('')
    await decoBox(it, it.id, sk, [bx, by, bw, bh], { sticker: it.fill !== '#ffffff' }); continue
  }
  if (it.type === 'text') {
    const big = it.id === 'chu-tet'
    tag(dieText(big ? 'Chữ Tết' : 'Chữ yêu thương', it.text, px(bx + (big ? 3 : -4)), px(by - (big ? 1 : 23)), px(bw + 120), big ? 285 : 136, 'Lobster', big ? C.red : C.deep, { align: 'left', lh: 1.0, h: big ? 420 : 190, rot: it.rot || 0, edge: C.paper }), it.id, { specSkip: true }); continue
  }
  if (it.type === 'label') {
    const chuc = it.id === 'nhan-chuc-be'
    const hh = chuc ? bh : bh * 0.78
    const g = await label(it.id, chuc ? '' : it.text, px(bx), px(cy - hh / 2), px(bw), px(hh), { kind: it.id === 'nhan-mung-xuan' ? 'ribbon' : 'cloud', fill: C.paper, ink: C.red, alias: 'Lobster', size: it.id === 'nhan-mung-xuan' ? 66 : 54, rot: it.rot || 0 })
    tag(g, it.id, { specCenterOnly: true })
    if (chuc) for (const [k, line, sz] of [[0, 'Chúc bé', 70], [1, 'hay ăn chóng lớn', 62]]) text('Chữ chúc bé ' + k, line, px(bx + 30), px(cy - 58 + k * 62), px(bw - 60), sz, 'Lobster', C.red, { align: 'center', h: Math.round(sz * 1.3), lh: 1.0 })
    continue
  }
}

const refImg = arg('--reference-image')
if (refImg) { const rl = place('ẢNH MẪU – xóa trước khi lưu', await writeAsset('reference.webp', await readFile(refImg)), 0, 0, W, H, { lock: true }); rl.opacity = 0.3 }

const global = {
  name: 'Tết yêu thương · vẽ SVG theo spec', type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: C.cream, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
  opacity: 1, tag: 0, record: {}, dpi: DPI, collage: { template: 'tet-svg-a', version: 1, customer: placeholders ? 'Mẫu' : 'Tết', printWorkflow: 'separate-sheets' },
}
await writeFile(out, JSON.stringify({ global, layers }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output: path.resolve(out), canvas: { W, H, dpi: DPI }, layers: layers.length, placeholders }))
