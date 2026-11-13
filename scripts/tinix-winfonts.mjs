// [TINIX] Quản lý font lấy từ C:\Windows\Fonts bằng một manifest (scripts/tinix-winfonts.json) để dựng lại được trên máy khác / sau khi mất DB.
// File font KHÔNG nằm trong repo: manifest chỉ ghi tên file + thông tin (nhóm, tag, giấy phép); file được chép từ thư mục Fonts của Windows.
//
//   npm run tinix:winfonts                   → đọc manifest, chép file vào service/static/fonts, thêm/cập nhật bảng fonts
//   npm run tinix:winfonts -- --dry          → chỉ liệt kê, không chép, không ghi DB
//   npm run tinix:winfonts -- --export       → ghi lại manifest từ DB hiện tại (font có file trong thư mục Windows Fonts,
//                                              không thuộc scripts/tinix-fonts.json)
// Chạy lại an toàn: font trùng `value` được cập nhật, không tạo bản sao.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = path.join(root, 'service')
const require = createRequire(path.join(serviceDir, 'package.json'))
const Database = require('better-sqlite3')

const dry = process.argv.includes('--dry')
const doExport = process.argv.includes('--export')
const winDir = process.env.TINIX_WINFONTS_DIR || path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts')
const manifestPath = path.join(root, 'scripts', 'tinix-winfonts.json')
const fontDir = process.env.TINIX_FONT_DIR || path.join(serviceDir, 'static', 'fonts') // TINIX_FONT_DIR / TINIX_DB: dùng khi kiểm thử
const dbPath = process.env.TINIX_DB || path.join(serviceDir, 'data', 'poster.db')

if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}. Hãy chạy "npm run tinix:dev" một lần để tạo database.`)

function exportManifest(db) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'tinix-fonts.json'), 'utf8'))
  const googleFamilies = new Set(catalog.fonts.map((f) => f.family))
  const rows = db.prepare('SELECT alias, value, woff, category, tags, license, supports_vietnamese, lang FROM fonts ORDER BY id').all()
  const fonts = []
  for (const r of rows) {
    if (googleFamilies.has(r.value) || googleFamilies.has(r.alias)) continue
    const base = path.basename(r.woff || '')
    const file = base.replace(/^win-/, '')
    if (!file || !fs.existsSync(path.join(winDir, file))) continue
    let tags = []
    try { tags = JSON.parse(r.tags || '[]') } catch (e) { tags = [] }
    fonts.push({ file, family: r.alias, category: r.category || '', tags, license: r.license || '', vietnamese: Number(r.supports_vietnamese) === 1, lang: r.lang || 'en' })
  }
  const out = { _comment: '[TINIX] Font từ C:\\Windows\\Fonts (không gồm font Microsoft). Tạo bằng: npm run tinix:winfonts -- --export. Nhập bằng: npm run tinix:winfonts.', fonts }
  fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2) + '\n')
  console.log(`Đã ghi ${fonts.length} font vào ${path.relative(root, manifestPath)}`)
}

function importManifest(db) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!dry) fs.mkdirSync(fontDir, { recursive: true })
  const findByValue = db.prepare('SELECT id FROM fonts WHERE value = ?')
  const insert = db.prepare(`INSERT INTO fonts (alias, value, preview, woff, ttf, lang, font_family, size, woff_size, category, tags, supports_vietnamese, license)
    VALUES (@alias, @alias, '', @url, @url, @lang, @alias, @size, @size, @category, @tags, @vn, @license)`)
  const update = db.prepare(`UPDATE fonts SET woff=@url, ttf=@url, lang=@lang, size=@size, woff_size=@size,
    category=@category, tags=@tags, supports_vietnamese=@vn, license=@license WHERE id=@id`)
  let added = 0, updated = 0, missing = []
  for (const f of manifest.fonts) {
    const src = path.join(winDir, f.file)
    if (!fs.existsSync(src)) { missing.push(f.file); continue }
    const size = fs.statSync(src).size
    let name = f.file
    if (fs.existsSync(path.join(fontDir, name)) && fs.statSync(path.join(fontDir, name)).size !== size) name = 'win-' + f.file
    if (dry) { console.log(`${(f.category || '-').padEnd(11)} ${f.family.padEnd(28)} ← ${f.file}`); continue }
    if (!fs.existsSync(path.join(fontDir, name))) fs.copyFileSync(src, path.join(fontDir, name))
    const row = { alias: f.family, url: `/static/fonts/${name}`, lang: f.lang || 'en', size, category: f.category || '', tags: JSON.stringify(f.tags || []), vn: f.vietnamese === false ? 0 : 1, license: f.license || '' }
    const existing = findByValue.get(f.family)
    if (existing) { update.run({ ...row, id: existing.id }); updated++ } else { insert.run(row); added++ }
  }
  if (missing.length) console.log(`Bỏ qua ${missing.length} font không còn trong ${winDir}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`)
  if (!dry) console.log(`Xong: thêm ${added}, cập nhật ${updated}. Tiếp theo: npm run tinix:font-previews (ảnh xem trước cho font mới).`)
}

const db = new Database(dbPath)
try {
  if (doExport) exportManifest(db)
  else importManifest(db)
} finally {
  db.close()
}
