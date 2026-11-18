// [TINIX] Kiểm thử offline script sao lưu (scripts/tinix-backup.mjs) trên DB/thư mục TẠM — không đụng dữ liệu thật hay backups/ thật.
// Chạy: node scripts/tinix-backup-test.mjs (hoặc npm run tinix:test)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const Database = createRequire(path.join(root, 'service', 'package.json'))('better-sqlite3')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tinix-backup-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dataDir = path.join(tmp, 'data')
const staticDir = path.join(tmp, 'static')
const backups = path.join(tmp, 'backups')
const extra = path.join(tmp, 'ocung-khac', 'sao-luu')
fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, 'poster.db')

// DB giả: thiết kế dùng một ảnh tải lên; ảnh tải lên không ai dùng phải bị loại khỏi BẢN SAO (cả dòng lẫn tệp), DB gốc còn nguyên
const db = new Database(dbPath)
db.exec("CREATE TABLE designs(id INTEGER PRIMARY KEY, title TEXT, data TEXT); CREATE TABLE user_images(id INTEGER PRIMARY KEY, url TEXT, web_url TEXT, thumb_url TEXT, source TEXT)")
db.prepare('INSERT INTO designs(title, data) VALUES (?, ?)').run('Thiết kế thử', JSON.stringify({ layers: [{ imgUrl: '/static/photos/web/used.jpg?v=2' }, { imgUrl: '/static/user/kept.png' }] }))
const addImg = db.prepare('INSERT INTO user_images(url, web_url, thumb_url, source) VALUES (?, ?, ?, ?)')
addImg.run('/static/photos/used.jpg', '/static/photos/web/used.jpg', '/static/photos/thumb/used.jpg', 'upload') // được thiết kế dùng (qua ảnh nhẹ)
addImg.run('/static/photos/unused.jpg', '/static/photos/web/unused.jpg', '/static/photos/thumb/unused.jpg', 'upload') // không ai dùng
addImg.run('/static/user/kept.png', '', '', 'upload') // được thiết kế dùng (qua tệp gốc)
addImg.run('/static/user/test.png', '', '', 'upload') // không ai dùng
addImg.run('/static/favorites/b.jpg', '', '', 'favorite')
db.close()

// static giả: cover/ và ảnh được dùng được sao lưu; fonts/ và ảnh tải lên không ai dùng bị loại
for (const [dir, file] of [['cover', 'c.jpg'], ['fonts', 'f.ttf'], ['photos', 'used.jpg'], ['photos/web', 'used.jpg'], ['photos/thumb', 'used.jpg'], ['photos', 'unused.jpg'], ['photos/web', 'unused.jpg'], ['photos/thumb', 'unused.jpg'], ['user', 'kept.png'], ['user', 'test.png']]) {
  fs.mkdirSync(path.join(staticDir, dir), { recursive: true })
  fs.writeFileSync(path.join(staticDir, dir, file), dir + '/' + file + '-noi-dung')
}
fs.mkdirSync(path.join(dataDir, 'approved-prints', '7'), { recursive: true })
fs.writeFileSync(path.join(dataDir, 'approved-prints', '7', 'snapshot.json'), '{"ok":true}')

const env = { ...process.env, TINIX_DB: dbPath, TINIX_STATIC_DIR: staticDir, TINIX_BACKUP_DIR: backups }
const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'tinix-backup.mjs'), ...args], { env, encoding: 'utf8' })
const snaps = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort() : [])
const rows = (file, sql) => { const d = new Database(file, { readonly: true }); try { return d.prepare(sql).all() } finally { d.close() } }

try {
  // 1) Lần đầu: tạo bản sao đủ thứ, kèm chép sang nơi khác
  let r = run('--keep', '2', '--copy-to', extra)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  let [first] = snaps(backups)
  assert.ok(first, 'có thư mục bản sao')
  const snap = path.join(backups, first)
  assert.ok(fs.statSync(path.join(snap, 'poster.db')).size > 0, 'poster.db không rỗng')
  assert.ok(fs.statSync(path.join(snap, 'static.tar.gz')).size > 0, 'static.tar.gz không rỗng')
  assert.ok(fs.existsSync(path.join(snap, 'approved-prints', '7', 'snapshot.json')), 'có approved-prints')
  assert.match(r.stdout, /toàn vẹn: ok/)
  assert.deepEqual(snaps(extra), [first], 'bản chép sang nơi khác cùng tên')
  assert.ok(fs.existsSync(path.join(extra, first, 'poster.db')) && fs.existsSync(path.join(extra, first, 'static.tar.gz')), 'bản chép đủ tệp')

  // 2) Bản sao DB không chứa ảnh tải lên, nhưng DB gốc còn nguyên
  assert.deepEqual(rows(path.join(snap, 'poster.db'), "SELECT url FROM user_images ORDER BY id").map((x) => x.url), ['/static/photos/used.jpg', '/static/user/kept.png', '/static/favorites/b.jpg'], 'bản sao DB giữ ảnh tải lên đang được dùng, bỏ ảnh không dùng')
  assert.equal(rows(path.join(snap, 'poster.db'), 'SELECT title FROM designs')[0].title, 'Thiết kế thử')
  assert.equal(rows(dbPath, 'SELECT COUNT(*) n FROM user_images')[0].n, 5, 'DB gốc không bị sửa')
  assert.equal(fs.existsSync(path.join(snap, 'poster.db-wal')), false, 'bản sao gọn một tệp')

  // 3) static.tar.gz: có cover/, KHÔNG có fonts/ và photos/
  // chạy trong thư mục chứa tệp + tên tương đối: GNU tar coi 'C:\...' là tên máy từ xa (giống cách tinix-backup.mjs gọi tar)
  const tarList = spawnSync('tar', ['-tzf', 'static.tar.gz'], { cwd: snap, encoding: 'utf8' })
  assert.equal(tarList.status, 0, tarList.stderr)
  const list = tarList.stdout.split(String.fromCharCode(92)).join('/')
  assert.match(list, /cover\/c\.jpg/)
  assert.doesNotMatch(list, /fonts\/f\.ttf/)
  // ảnh tải lên: chỉ tệp đang được dùng (kể cả ảnh nhẹ/thu nhỏ của nó; tham chiếu có ?v=) nằm trong bản nén
  for (const f of ['photos/used.jpg', 'photos/web/used.jpg', 'photos/thumb/used.jpg', 'user/kept.png']) assert.ok(list.includes('/' + f), `phải có ${f}`)
  for (const f of ['photos/unused.jpg', 'photos/web/unused.jpg', 'photos/thumb/unused.jpg', 'user/test.png']) assert.ok(!list.includes('/' + f), `không được có ${f}`)
  assert.match(r.stdout, /giữ 2 ảnh tải lên đang được thiết kế\/mẫu dùng, bỏ 2 ảnh không dùng/)
  assert.equal(fs.existsSync(path.join(snap, 'loai-tru.txt')), false, 'không để lại tệp loại trừ tạm')

  // 4) Giữ đúng --keep ở CẢ hai nơi (mốc thời gian theo giây nên chờ >1s giữa các lần)
  await sleep(1100); assert.equal(run('--keep', '2', '--copy-to', extra).status, 0)
  await sleep(1100); assert.equal(run('--keep', '2', '--copy-to', extra).status, 0)
  assert.equal(snaps(backups).length, 2, 'backups giữ 2 bản')
  assert.equal(snaps(extra).length, 2, 'nơi chép thêm giữ 2 bản')
  assert.ok(!snaps(backups).includes(first), 'bản cũ nhất đã bị xóa')
  assert.deepEqual(snaps(backups), snaps(extra), 'hai nơi giữ cùng các bản')

  // 5) DB hỏng → sao lưu thất bại (mã khác 0) và KHÔNG xóa bản cũ nào
  const before = snaps(backups)
  const good = fs.readFileSync(dbPath)
  fs.writeFileSync(dbPath, 'đây không phải một cơ sở dữ liệu SQLite '.repeat(50))
  await sleep(1100)
  r = run('--keep', '1')
  assert.notEqual(r.status, 0, 'DB hỏng phải làm sao lưu thất bại')
  assert.deepEqual(snaps(backups), before, 'sao lưu lỗi không để lại thư mục dở dang và không xóa bản cũ')
  fs.writeFileSync(dbPath, good)

  // 5b) Lỗi XẢY RA SAU KHI bản mới đã tạo (chép sang nơi không hợp lệ: thư mục cha là một TỆP) → mã khác 0 và KHÔNG xóa bản cũ dù --keep 1
  const blocker = path.join(tmp, 'la-mot-tep')
  fs.writeFileSync(blocker, 'x')
  await sleep(1100)
  r = run('--keep', '1', '--copy-to', path.join(blocker, 'con'))
  assert.notEqual(r.status, 0, 'chép sang nơi không hợp lệ phải báo lỗi')
  assert.match(r.stderr, /CHƯA hoàn chỉnh/)
  assert.equal(snaps(backups).length, before.length + 1, 'sao lưu lỗi giữ nguyên mọi bản cũ (không xóa theo --keep 1)')

  // 6) Thiếu giá trị --copy-to → lỗi rõ ràng
  r = run('--copy-to')
  assert.notEqual(r.status, 0)
  console.log('PASS backup: bản sao đủ DB/static/approved-prints, kiểm tra toàn vẹn, loại ảnh tải lên, giữ N bản ở hai nơi, lỗi không xóa bản cũ')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
