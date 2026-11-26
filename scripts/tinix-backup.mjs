// [TINIX] Sao lưu dữ liệu: database (bản sao nhất quán bằng SQLite backup API) + file tĩnh người dùng (ảnh bìa, ảnh tải lên...).
// Không sao lưu service/static/fonts và font-previews (dựng lại được bằng tinix:fonts / tinix:winfonts / tinix:font-previews).
// Ảnh tải lên (static/photos/, static/user/) chỉ sao lưu những tệp mà thiết kế đã lưu, mẫu hoặc phiên bản mẫu cắt dán còn tham chiếu tới
// (cùng cách quét `referencedPaths` của service/src/tinix/photos/core.ts). Ảnh tải lên không ai dùng thì không nằm trong bản sao: cả tệp lẫn dòng
// user_images trong BẢN SAO DB (khôi phục không có dòng ảnh trỏ vào tệp đã mất). Ảnh đã ★ vào thư viện "Ảnh" (static/favorites/) luôn được sao lưu.
//
//   npm run tinix:backup            → tạo backups/<ngày-giờ>/poster.db và static.tar.gz, giữ 10 bản mới nhất
//   npm run tinix:backup -- --keep 5
//   npm run tinix:backup -- --copy-to E:/SaoLuu/TinixPoster   → thêm một bản sao sang nơi khác (ổ khác/thư mục đồng bộ đám mây); cũng giữ --keep bản
//   Đặt lịch chạy hằng ngày: npm run tinix:backup-schedule
// Sau mỗi lần sao lưu: kiểm tra toàn vẹn bản sao DB (PRAGMA integrity_check) và việc nén static. Nếu có lỗi → thoát mã 1 và KHÔNG xóa
// các bản cũ (để một lần sao lưu hỏng không làm mất bản tốt). Biến môi trường (dùng cho kiểm thử): TINIX_DB, TINIX_BACKUP_DIR, TINIX_STATIC_DIR.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { archiveStatic } from './tinix-backup-archive.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = path.join(root, 'service')
const require = createRequire(path.join(serviceDir, 'package.json'))
const Database = require('better-sqlite3')

const keepIdx = process.argv.indexOf('--keep')
const keep = keepIdx >= 0 ? Math.max(1, Number(process.argv[keepIdx + 1]) || 10) : 10
const copyIdx = process.argv.indexOf('--copy-to')
const copyTo = copyIdx >= 0 ? path.resolve(process.argv[copyIdx + 1] || '') : ''
if (copyIdx >= 0 && !process.argv[copyIdx + 1]) throw new Error('--copy-to cần một đường dẫn thư mục')
const dbPath = process.env.TINIX_DB || path.join(serviceDir, 'data', 'poster.db')
const staticDir = process.env.TINIX_STATIC_DIR || path.join(serviceDir, 'static')
const backupRoot = process.env.TINIX_BACKUP_DIR || path.join(root, 'backups')
let ok = true

if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}`)

const pad = (n) => String(n).padStart(2, '0')
const d = new Date()
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const dest = path.join(backupRoot, stamp)
// [TINIX] Claim the timestamp atomically. A collision must never arm cleanup.
function claimSnapshot(dir) {
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  try { fs.mkdirSync(dir) }
  catch (error) {
    if (error.code === 'EEXIST') throw Error('BACKUP_DESTINATION_EXISTS: ' + dir)
    throw error
  }
}
claimSnapshot(dest)
// Bản sao không hợp lệ (DB hỏng, nén lỗi, hoặc script bị ngắt giữa chừng) không được để lại thư mục dở dang: nó sẽ được tính vào
// "giữ N bản" ở lần sau và đẩy bản tốt cũ ra khỏi danh sách. Chỉ giữ lại khi đã kiểm tra xong DB + static.
let snapshotValid = false
process.on('exit', () => {
  if (!snapshotValid) {
    fs.rmSync(dest, { recursive: true, force: true })
    console.error(`✗ Đã dọn bản sao dở dang ${stamp}`)
  }
})
const pending = '.backup-in-progress'
fs.writeFileSync(path.join(dest, pending), '', { flag: 'wx' })
// Approved print JPGs are permanent production records outside disposable static assets.
const approvedDir = path.join(path.dirname(dbPath), 'approved-prints')

const db = new Database(dbPath, { readonly: true })
try {
  await db.backup(path.join(dest, 'poster.db'))
} finally {
  db.close()
}
if (fs.existsSync(approvedDir)) fs.cpSync(approvedDir, path.join(dest, 'approved-prints'), { recursive: true })
// Ảnh tải lên: bản sao chỉ giữ những ảnh còn được thiết kế/mẫu tham chiếu (không đụng DB đang chạy)
const relStatic = (u) => { const t = String(u || '').replace(/\?.*$/, '').replace(/^.*\/static\//, ''); try { return decodeURIComponent(t) } catch { return t } }
let keepFiles = null // tập đường dẫn tương đối trong static của ảnh tải lên được giữ; null = không có bảng user_images
const copy = new Database(path.join(dest, 'poster.db'))
try {
  const hasTable = (n) => !!copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n)
  const refs = new Set()
  for (const t of ['designs', 'templates', 'collage_template_versions']) {
    if (!hasTable(t) || !copy.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'data')) continue
    for (const r of copy.prepare(`SELECT data FROM ${t}`).all()) for (const m of String(r.data || '').match(/\/static\/[^"'\\\s)]+/g) || []) refs.add(relStatic(m))
  }
  const cols = hasTable('user_images') ? copy.prepare('PRAGMA table_info(user_images)').all().map((c) => c.name) : []
  keepFiles = new Set(refs)
  if (cols.includes('source')) {
    const uploads = copy.prepare("SELECT id, url, web_url, thumb_url FROM user_images WHERE source = 'upload'").all()
    const drop = []
    for (const r of uploads) {
      if (refs.has(relStatic(r.url)) || refs.has(relStatic(r.web_url))) for (const u of [r.url, r.web_url, r.thumb_url]) { if (u) keepFiles.add(relStatic(u)) }
      else drop.push(r.id)
    }
    const del = copy.prepare('DELETE FROM user_images WHERE id = ?')
    copy.transaction(() => { for (const id of drop) del.run(id) })()
    copy.exec('VACUUM')
    copy.pragma('journal_mode = DELETE') // bản sao gọn một tệp, không để lại poster.db-wal/-shm
    if (uploads.length) console.log(`- bản sao DB giữ ${uploads.length - drop.length} ảnh tải lên đang được thiết kế/mẫu dùng, bỏ ${drop.length} ảnh không dùng`)
  }
} finally {
  copy.close()
}
// kiểm tra toàn vẹn bản sao DB (đọc lại từ đĩa, không dùng kết nối vừa ghi)
{
  const check = new Database(path.join(dest, 'poster.db'), { readonly: true })
  try {
    const res = check.pragma('integrity_check').map((r) => r.integrity_check)
    if (res.length === 1 && res[0] === 'ok') console.log(`✓ poster.db → ${path.relative(root, path.join(dest, 'poster.db'))} (toàn vẹn: ok)`)
    else { ok = false; console.error(`✗ Bản sao poster.db KHÔNG toàn vẹn: ${res.slice(0, 3).join('; ')}`) }
  } finally {
    check.close()
  }
}

if (fs.existsSync(staticDir)) {
  // ảnh tải lên (photos/, user/) không được thiết kế/mẫu nào dùng → loại khỏi bản nén; tệp còn được dùng thì giữ
  const walk = (dir, rel, out) => {
    if (!fs.existsSync(dir)) return out
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isDirectory()) walk(path.join(dir, e.name), r, out)
      else out.push(r)
    }
    return out
  }
  const skipped = []
  let skippedBytes = 0, keptCount = 0
  if (keepFiles) {
    for (const top of ['photos', 'user']) {
      for (const rel of walk(path.join(staticDir, top), top, [])) {
        if (keepFiles.has(rel)) { keptCount++; continue }
        skipped.push(rel)
        try { skippedBytes += fs.statSync(path.join(staticDir, rel)).size } catch { /* tệp biến mất giữa chừng */ }
      }
    }
  }
  try {
    const archived = archiveStatic({ staticDir, dest, skipped })
    console.log('✓ static.tar.gz verified (' + archived.members + ' members, ' +
      archived.bytes + ' bytes; command=' + archived.bin + '; used uploaded images=' +
      keptCount + '; unused=' + skipped.length + ')')
  } catch (error) {
    ok = false
    console.error('✗ STATIC_ARCHIVE_FAILED: ' + String(error?.message || error))
    console.error('✗ Không xóa bản sao tốt trước đó; xem tar stderr ở trên.')
  }
}

else {
  ok = false
  console.error('✗ STATIC_ROOT_MISSING: ' + staticDir + '; backup không hoàn chỉnh.')
}

// giữ `keep` bản mới nhất trong `dir`
function prune(dir, label) {
  const all = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{8}-\d{6}$/.test(entry.name))
    .map(entry => entry.name).filter(name => {
      const folder = path.join(dir, name)
      return !fs.existsSync(path.join(folder, pending)) &&
        fs.existsSync(path.join(folder, 'poster.db')) && fs.existsSync(path.join(folder, 'static.tar.gz'))
    }).sort()
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    fs.rmSync(path.join(dir, old), { recursive: true, force: true })
    console.log(`- xóa bản cũ ${old} (${label})`)
  }
  return Math.min(all.length, keep)
}

if (ok) fs.unlinkSync(path.join(dest, pending))
snapshotValid = ok // bản sao tại chỗ đã đầy đủ và toàn vẹn (nếu chép sang nơi khác lỗi thì bản này vẫn dùng được)

// bản sao thứ hai sang nơi khác (chống hỏng ổ đĩa) — chỉ khi bản mới tốt
if (ok && copyTo) {
  const target = path.join(copyTo, stamp)
  let claimed = false
  try {
    claimSnapshot(target)
    claimed = true
    fs.writeFileSync(path.join(target, pending), '', { flag: 'wx' })
    fs.cpSync(dest, target, { recursive: true, force: false, errorOnExist: true })
    fs.unlinkSync(path.join(target, pending))
    console.log(`✓ đã chép sang ${target}`)
  } catch (e) {
    if (claimed) fs.rmSync(target, { recursive: true, force: true })
    ok = false
    console.error(`✗ Không chép được sang ${copyTo}: ${e.message}`)
  }
}

if (!ok) {
  console.error(`✗ Sao lưu CHƯA hoàn chỉnh: giữ nguyên mọi bản cũ, không xóa gì. Xem lỗi ở trên và chạy lại.`)
  process.exitCode = 1
} else {
  const kept = prune(backupRoot, 'backups')
  if (copyTo) prune(copyTo, 'nơi chép thêm')
  console.log(`Xong. Đang giữ ${kept} bản trong ${path.relative(root, backupRoot) || backupRoot}`)
}
