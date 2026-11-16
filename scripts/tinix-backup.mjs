// [TINIX] Sao lưu dữ liệu: database (bản sao nhất quán bằng SQLite backup API) + file tĩnh người dùng (ảnh bìa, ảnh tải lên...).
// Không sao lưu service/static/fonts và font-previews (dựng lại được bằng tinix:fonts / tinix:winfonts / tinix:font-previews).
// Ảnh người dùng tải lên chỉ là ĐẦU VÀO để thiết kế: không sao lưu service/static/photos/ và bản sao DB không chứa danh sách ảnh tải lên
// (user_images.source = 'upload') nên khôi phục không bị dòng ảnh trỏ vào tệp đã mất. Ảnh đã ★ vào thư viện "Ảnh" (static/favorites/) vẫn được sao lưu.
//
//   npm run tinix:backup            → tạo backups/<ngày-giờ>/poster.db và static.tar.gz, giữ 10 bản mới nhất
//   npm run tinix:backup -- --keep 5
//   npm run tinix:backup -- --copy-to E:/SaoLuu/TinixPoster   → thêm một bản sao sang nơi khác (ổ khác/thư mục đồng bộ đám mây); cũng giữ --keep bản
//   Đặt lịch chạy hằng ngày: npm run tinix:backup-schedule
// Sau mỗi lần sao lưu: kiểm tra toàn vẹn bản sao DB (PRAGMA integrity_check) và việc nén static. Nếu có lỗi → thoát mã 1 và KHÔNG xóa
// các bản cũ (để một lần sao lưu hỏng không làm mất bản tốt). Biến môi trường (dùng cho kiểm thử): TINIX_DB, TINIX_BACKUP_DIR, TINIX_STATIC_DIR.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
fs.mkdirSync(dest, { recursive: true })
// Bản sao không hợp lệ (DB hỏng, nén lỗi, hoặc script bị ngắt giữa chừng) không được để lại thư mục dở dang: nó sẽ được tính vào
// "giữ N bản" ở lần sau và đẩy bản tốt cũ ra khỏi danh sách. Chỉ giữ lại khi đã kiểm tra xong DB + static.
let snapshotValid = false
process.on('exit', () => {
  if (!snapshotValid) {
    fs.rmSync(dest, { recursive: true, force: true })
    console.error(`✗ Đã dọn bản sao dở dang ${stamp}`)
  }
})
// Approved print JPGs are permanent production records outside disposable static assets.
const approvedDir = path.join(path.dirname(dbPath), 'approved-prints')

const db = new Database(dbPath, { readonly: true })
try {
  await db.backup(path.join(dest, 'poster.db'))
} finally {
  db.close()
}
if (fs.existsSync(approvedDir)) fs.cpSync(approvedDir, path.join(dest, 'approved-prints'), { recursive: true })
// bỏ danh sách ảnh tải lên khỏi BẢN SAO (không đụng DB đang chạy)
const copy = new Database(path.join(dest, 'poster.db'))
try {
  const cols = copy.prepare('PRAGMA table_info(user_images)').all().map((c) => c.name)
  if (cols.includes('source')) {
    const n = copy.prepare("DELETE FROM user_images WHERE source = 'upload'").run().changes
    copy.exec('VACUUM')
    copy.pragma('journal_mode = DELETE') // bản sao gọn một tệp, không để lại poster.db-wal/-shm
    if (n) console.log(`- bản sao DB không gồm ${n} dòng ảnh tải lên (đầu vào thiết kế)`)
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
  // chạy trong thư mục đích + đường dẫn tương đối: GNU tar coi 'D:\...' là tên máy từ xa
  const r = spawnSync('tar', ['-czf', 'static.tar.gz', '--exclude=./fonts', '--exclude=./font-previews', '--exclude=./photos', '-C', staticDir, '.'], { stdio: 'inherit', cwd: dest })
  if (r.status === 0 && fs.existsSync(path.join(dest, 'static.tar.gz'))) console.log(`✓ static.tar.gz (không gồm fonts/, font-previews/, photos/)`)
  else { ok = false; console.error('✗ Không nén được thư mục static (cần lệnh tar). Đã có bản sao DB.') }
}

// giữ `keep` bản mới nhất trong `dir`
function prune(dir, label) {
  const all = fs.readdirSync(dir).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort()
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    fs.rmSync(path.join(dir, old), { recursive: true, force: true })
    console.log(`- xóa bản cũ ${old} (${label})`)
  }
  return Math.min(all.length, keep)
}

snapshotValid = ok // bản sao tại chỗ đã đầy đủ và toàn vẹn (nếu chép sang nơi khác lỗi thì bản này vẫn dùng được)

// bản sao thứ hai sang nơi khác (chống hỏng ổ đĩa) — chỉ khi bản mới tốt
if (ok && copyTo) {
  try {
    fs.mkdirSync(copyTo, { recursive: true })
    fs.cpSync(dest, path.join(copyTo, stamp), { recursive: true })
    console.log(`✓ đã chép sang ${path.join(copyTo, stamp)}`)
  } catch (e) {
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
