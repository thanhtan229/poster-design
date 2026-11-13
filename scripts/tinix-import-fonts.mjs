// [TINIX] Tải font trong scripts/tinix-fonts.json về service/static/fonts/ và ghi vào bảng fonts.
// Chạy:  npm run tinix:fonts            (bỏ qua file đã tải)
//        npm run tinix:fonts -- --dry   (chỉ liệt kê, không tải, không ghi DB)
// An toàn khi chạy lại nhiều lần: font trùng `value` sẽ được cập nhật, không tạo bản sao.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = path.join(root, 'service')
const require = createRequire(path.join(serviceDir, 'package.json'))
const Database = require('better-sqlite3')

const dry = process.argv.includes('--dry')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'tinix-fonts.json'), 'utf8'))
const fontDir = path.join(serviceDir, 'static', 'fonts')
const licenseDir = path.join(fontDir, 'licenses')
const dbPath = path.join(serviceDir, 'data', 'poster.db')

/** "PlayfairDisplay[wght].ttf" -> "PlayfairDisplay-wght.ttf" (URL-friendly local name) */
const localName = (file) => file.replace(/\[([^\]]+)\]/, (_, axes) => '-' + axes.replace(/,/g, '-'))

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return buf.length
}

function ensureColumns(db) {
  // Same columns as service/src/tinix/db/migrate.ts, in case the service has not started since the migration was added.
  const cols = new Set(db.prepare('PRAGMA table_info(fonts)').all().map((c) => c.name))
  const want = {
    category: "TEXT NOT NULL DEFAULT ''",
    tags: "TEXT NOT NULL DEFAULT '[]'",
    supports_vietnamese: 'INTEGER NOT NULL DEFAULT 0',
    license: "TEXT NOT NULL DEFAULT ''",
  }
  for (const [name, ddl] of Object.entries(want)) if (!cols.has(name)) db.prepare(`ALTER TABLE fonts ADD COLUMN ${name} ${ddl}`).run()
}

async function main() {
  if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}. Hãy chạy "npm run tinix:dev" một lần để tạo database.`)
  if (!dry) fs.mkdirSync(licenseDir, { recursive: true })

  const db = dry ? null : new Database(dbPath)
  if (db) ensureColumns(db)
  const findByValue = db?.prepare('SELECT id FROM fonts WHERE value = ?')
  const insert = db?.prepare(`INSERT INTO fonts (alias, value, preview, woff, ttf, lang, font_family, size, woff_size, category, tags, supports_vietnamese, license)
    VALUES (@alias, @value, '', @url, @url, @lang, @family, @size, @size, @category, @tags, @vn, 'OFL')`)
  const update = db?.prepare(`UPDATE fonts SET alias=@alias, woff=@url, ttf=@url, lang=@lang, font_family=@family, size=@size, woff_size=@size,
    category=@category, tags=@tags, supports_vietnamese=@vn, license='OFL' WHERE id=@id`)

  let added = 0, updated = 0, fetched = 0, bytes = 0
  for (const f of catalog.fonts) {
    const name = localName(f.file)
    const dest = path.join(fontDir, name)
    // [TINIX] f.source: nhánh khác của google/fonts (vd apache/) khi font không thuộc ofl/
    const base = f.source || catalog.source
    const remote = base + f.dir + '/' + encodeURIComponent(f.file)
    if (dry) { console.log(`${f.category.padEnd(11)} ${f.family.padEnd(24)} ← ${remote}`); continue }

    let size
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      size = fs.statSync(dest).size
    } else {
      size = await download(remote, dest)
      fetched++; bytes += size
      process.stdout.write(`  tải ${f.family} (${Math.round(size / 1024)} KB)\n`)
    }
    const lic = path.join(licenseDir, `${f.dir}-OFL.txt`)
    if (!fs.existsSync(lic)) await download(base + f.dir + '/' + (f.source ? 'LICENSE.txt' : 'OFL.txt'), lic)

    const row = { alias: f.family, value: f.family, family: f.family, url: `/static/fonts/${name}`, size,
      category: f.category, tags: JSON.stringify(f.tags || []), vn: f.vietnamese === false ? 0 : 1, lang: f.lang === 'ko' ? 'ko' : 'en' }
    const existing = findByValue.get(f.family)
    if (existing) { update.run({ ...row, id: existing.id }); updated++ } else { insert.run(row); added++ }
  }
  db?.close()
  if (!dry) console.log(`\nXong: thêm ${added}, cập nhật ${updated}, tải mới ${fetched} file (${(bytes / 1048576).toFixed(1)} MB). Font nằm ở service/static/fonts/.
Tiếp theo: npm run tinix:font-previews (tạo ảnh xem trước cho font mới).`)
}

main().catch((e) => { console.error('[tinix:fonts] Lỗi:', e.message); process.exit(1) })
