// [TINIX] Sao lưu dữ liệu: database (bản sao nhất quán bằng SQLite backup API) + file tĩnh người dùng (ảnh bìa, ảnh tải lên...).
// Không sao lưu service/static/fonts và font-previews (dựng lại được bằng tinix:fonts / tinix:winfonts / tinix:font-previews).
//
//   npm run tinix:backup            → tạo backups/<ngày-giờ>/poster.db và static.tar.gz, giữ 10 bản mới nhất
//   npm run tinix:backup -- --keep 5
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
const dbPath = process.env.TINIX_DB || path.join(serviceDir, 'data', 'poster.db')
const staticDir = path.join(serviceDir, 'static')
const backupRoot = path.join(root, 'backups')

if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}`)

const pad = (n) => String(n).padStart(2, '0')
const d = new Date()
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const dest = path.join(backupRoot, stamp)
fs.mkdirSync(dest, { recursive: true })

const db = new Database(dbPath, { readonly: true })
try {
  await db.backup(path.join(dest, 'poster.db'))
} finally {
  db.close()
}
console.log(`✓ poster.db → ${path.relative(root, path.join(dest, 'poster.db'))}`)

if (fs.existsSync(staticDir)) {
  // chạy trong thư mục đích + đường dẫn tương đối: GNU tar coi 'D:\...' là tên máy từ xa
  const r = spawnSync('tar', ['-czf', 'static.tar.gz', '--exclude=./fonts', '--exclude=./font-previews', '-C', staticDir, '.'], { stdio: 'inherit', cwd: dest })
  if (r.status === 0) console.log(`✓ static.tar.gz (không gồm fonts/, font-previews/)`)
  else console.warn('! Không nén được thư mục static (cần lệnh tar). Đã có bản sao DB.')
}

// giữ `keep` bản mới nhất
const all = fs.readdirSync(backupRoot).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort()
for (const old of all.slice(0, Math.max(0, all.length - keep))) {
  fs.rmSync(path.join(backupRoot, old), { recursive: true, force: true })
  console.log(`- xóa bản cũ ${old}`)
}
console.log(`Xong. Đang giữ ${Math.min(all.length, keep)} bản trong backups/`)
