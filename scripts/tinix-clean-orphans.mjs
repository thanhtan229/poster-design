// [TINIX] Dọn tệp ảnh MỒ CÔI trong service/static/photos và service/static/user: tệp không còn được dòng nào trong DB trỏ tới
// (không nằm trong bất kỳ cột chữ của bất kỳ bảng nào: user_images, designs, templates, mẫu cắt dán, thư viện Ảnh, ...).
//
//   node scripts/tinix-clean-orphans.mjs                      → CHỈ LIỆT KÊ (mặc định, không xóa gì)
//   node scripts/tinix-clean-orphans.mjs --older-than-days 7  → chỉ tính tệp sửa đổi lần cuối cách đây ít nhất 7 ngày
//   node scripts/tinix-clean-orphans.mjs --delete             → xóa thật các tệp mồ côi (nên sao lưu trước: npm run tinix:backup)
// Tệp mồ côi thường do ảnh tải lên dở dang hoặc dòng ảnh đã bị xóa tay. Biến môi trường (dùng cho kiểm thử): TINIX_DB, TINIX_STATIC_DIR.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = path.join(root, 'service')
const require = createRequire(path.join(serviceDir, 'package.json'))
const Database = require('better-sqlite3')

const args = process.argv.slice(2)
const doDelete = args.includes('--delete')
const daysIdx = args.indexOf('--older-than-days')
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 0
if (daysIdx >= 0 && !(Number.isFinite(days) && days >= 0)) throw new Error('--older-than-days cần một số >= 0')
for (const a of args) if (!['--delete', '--older-than-days'].includes(a) && !(daysIdx >= 0 && a === args[daysIdx + 1])) throw new Error(`Tham số lạ: ${a}`)
const dbPath = process.env.TINIX_DB || path.join(serviceDir, 'data', 'poster.db')
const staticDir = process.env.TINIX_STATIC_DIR || path.join(serviceDir, 'static')
if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}`)

const relStatic = (u) => { const t = String(u || '').replace(/\?.*$/, '').replace(/^.*\/static\//, ''); try { return decodeURIComponent(t) } catch { return t } }

// mọi đường dẫn /static/photos/... và /static/user/... xuất hiện ở bất kỳ cột chữ nào của bất kỳ bảng nào
const referenced = new Set()
const db = new Database(dbPath, { readonly: true })
try {
  const re = /\/static\/(?:photos|user)\/[^"'\s)\\]+/g
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all().filter((c) => /CHAR|TEXT|CLOB|^$/i.test(c.type || '')).map((c) => `"${c.name}"`)
    if (!cols.length) continue
    for (const row of db.prepare(`SELECT ${cols.join(', ')} FROM "${name}"`).iterate()) {
      for (const v of Object.values(row)) if (typeof v === 'string' && v.includes('/static/')) for (const m of v.match(re) || []) referenced.add(relStatic(m))
    }
  }
} finally {
  db.close()
}

const walk = (dir, rel, out) => {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel + '/' + e.name
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out)
    else out.push(r)
  }
  return out
}
const cutoff = days > 0 ? Date.now() - days * 86400000 : Infinity
const orphans = []
let bytes = 0, total = 0
for (const top of ['photos', 'user']) {
  for (const rel of walk(path.join(staticDir, top), top, [])) {
    total++
    if (referenced.has(rel)) continue
    const st = fs.statSync(path.join(staticDir, rel))
    if (days > 0 && st.mtimeMs > cutoff) continue
    orphans.push(rel)
    bytes += st.size
  }
}
const mb = (bytes / 1048576).toFixed(1)
for (const o of orphans.slice(0, 20)) console.log('  ' + o)
if (orphans.length > 20) console.log(`  … và ${orphans.length - 20} tệp nữa`)
console.log(`${orphans.length}/${total} tệp trong photos/ + user/ không còn được DB tham chiếu (${mb} MB)`)
if (!orphans.length) process.exit(0)
if (!doDelete) {
  console.log('Chưa xóa gì (chế độ liệt kê). Chạy lại kèm --delete để xóa thật.')
} else {
  let n = 0
  for (const o of orphans) { try { fs.unlinkSync(path.join(staticDir, o)); n++ } catch (e) { console.error(`✗ không xóa được ${o}: ${e.message}`) } }
  console.log(`✓ đã xóa ${n} tệp mồ côi (${mb} MB)`)
}
