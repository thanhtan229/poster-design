// [TINIX] Kiểm thử offline scripts/tinix-clean-orphans.mjs trên DB/thư mục TẠM.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const Database = createRequire(path.join(root, 'service', 'package.json'))('better-sqlite3')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tinix-orphans-'))
const dbPath = path.join(tmp, 'poster.db'), staticDir = path.join(tmp, 'static')
try {
  const db = new Database(dbPath)
  db.exec('CREATE TABLE user_images(id INTEGER PRIMARY KEY, url TEXT, web_url TEXT, thumb_url TEXT); CREATE TABLE designs(id INTEGER PRIMARY KEY, data TEXT); CREATE TABLE collage_template_versions(id INTEGER PRIMARY KEY, data TEXT, n INTEGER)')
  db.prepare('INSERT INTO user_images(url, web_url, thumb_url) VALUES (?, ?, ?)').run('/static/photos/a.jpg', '/static/photos/web/a.jpg', '/static/photos/thumb/a.jpg')
  db.prepare('INSERT INTO designs(data) VALUES (?)').run(JSON.stringify({ imgUrl: 'http://127.0.0.1:7001/static/user/in-design.png?v=2' }))
  db.prepare('INSERT INTO collage_template_versions(data, n) VALUES (?, 1)').run(JSON.stringify({ layers: [{ imgUrl: '/static/photos/web/in-template.jpg' }] }))
  db.close()
  const files = ['photos/a.jpg', 'photos/web/a.jpg', 'photos/thumb/a.jpg', 'user/in-design.png', 'photos/web/in-template.jpg', 'photos/orphan1.jpg', 'user/orphan2.png', 'photos/web/orphan3.jpg']
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(staticDir, f)), { recursive: true }); fs.writeFileSync(path.join(staticDir, f), f) }
  fs.mkdirSync(path.join(staticDir, 'cover'), { recursive: true }); fs.writeFileSync(path.join(staticDir, 'cover', 'x.jpg'), 'x') // ngoài photos/ và user/: không đụng
  const old = new Date(Date.now() - 30 * 86400000)
  fs.utimesSync(path.join(staticDir, 'user/orphan2.png'), old, old)
  const run = (...a) => spawnSync(process.execPath, [path.join(root, 'scripts', 'tinix-clean-orphans.mjs'), ...a], { env: { ...process.env, TINIX_DB: dbPath, TINIX_STATIC_DIR: staticDir }, encoding: 'utf8' })
  const has = (f) => fs.existsSync(path.join(staticDir, f))

  let r = run()
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /3\/8 tệp/, 'phải thấy 3 tệp mồ côi trên 8')
  assert.match(r.stdout, /Chưa xóa gì/)
  assert.ok(files.every(has), 'chế độ liệt kê không xóa tệp nào')

  r = run('--older-than-days', '7', '--delete')
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!has('user/orphan2.png') && has('photos/orphan1.jpg') && has('photos/web/orphan3.jpg'), 'chỉ xóa tệp mồ côi cũ hơn 7 ngày')

  r = run('--delete')
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!has('photos/orphan1.jpg') && !has('photos/web/orphan3.jpg'), 'xóa nốt tệp mồ côi')
  for (const f of ['photos/a.jpg', 'photos/web/a.jpg', 'photos/thumb/a.jpg', 'user/in-design.png', 'photos/web/in-template.jpg', 'cover/x.jpg']) assert.ok(has(f), `phải giữ ${f}`)

  assert.notEqual(run('--xoa-het').status, 0, 'tham số lạ phải bị từ chối')
  assert.notEqual(run('--older-than-days', 'abc').status, 0, 'số ngày sai phải bị từ chối')
  console.log('PASS clean-orphans: mặc định chỉ liệt kê, --delete xóa đúng tệp mồ côi, giữ tệp được dòng ảnh/thiết kế/mẫu tham chiếu (kể cả URL có ?v=), lọc theo ngày, từ chối tham số lạ')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
