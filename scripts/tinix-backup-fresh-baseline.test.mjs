// [TINIX] Fresh, disposable R1A baseline: backup + isolated restore, never production roots.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const Database = createRequire(import.meta.url)('../service/node_modules/better-sqlite3')
const backupScript = fileURLToPath(new URL('./tinix-backup.mjs', import.meta.url))
const unicodeHelper = fileURLToPath(new URL('./tinix-backup-unicode.py', import.meta.url))
const sha256 = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const put = (filename, bytes) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
}
const inventory = root => {
  const result = new Map()
  const scan = (folder, relative = '') => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = relative ? relative + '/' + item.name : item.name
      const absolute = path.join(folder, item.name)
      if (item.isDirectory()) scan(absolute, name)
      else {
        assert.equal(item.isFile(), true, 'only regular files allowed')
        result.set(name, sha256(absolute))
      }
    }
  }
  scan(root)
  return [...result].sort(([a], [b]) => a.localeCompare(b))
}

test('R1A new experimental baseline: DB, collage, approved prints, mirror and exact offline restore', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tinix-r1a-test-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  const dbPath = path.join(work, 'data', 'poster.db')
  const staticDir = path.join(work, 'static')
  const backupDir = path.join(work, 'backups')
  const mirrorDir = path.join(work, 'mirror')
  const collage = 'collage/synthetic/Khung-ảnh-01.png'
  const other = 'favorites/synthetic-star.png'
  const neededUpload = 'photos/synthetic-used.png'
  const unusedUpload = 'photos/synthetic-unused.png'
  const excludedFont = 'fonts/synthetic.woff2'
  const expectedStatic = new Map()
  for (const [name, bytes] of [
    [collage, Buffer.from('synthetic collage baseline')],
    [other, Buffer.from('synthetic favorite')],
    [neededUpload, Buffer.from('synthetic upload used')],
    [unusedUpload, Buffer.from('synthetic upload unused')],
    [excludedFont, Buffer.from('synthetic font excluded')],
  ]) {
    put(path.join(staticDir, name), bytes)
    if (name !== unusedUpload && name !== excludedFont) {
      expectedStatic.set(name, sha256(path.join(staticDir, name)))
    }
  }
  const printName = 'test-approved.jpg'
  put(path.join(work, 'data', 'approved-prints', printName), 'synthetic approved print')
  const printHash = sha256(path.join(work, 'data', 'approved-prints', printName))
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  try {
    db.exec('CREATE TABLE designs (data TEXT); CREATE TABLE user_images (id INTEGER PRIMARY KEY, url TEXT, web_url TEXT, thumb_url TEXT, source TEXT)')
    db.prepare('INSERT INTO designs (data) VALUES (?)').run(JSON.stringify({
      collage: '/static/' + collage,
      photo: '/static/' + neededUpload,
    }))
    db.prepare("INSERT INTO user_images (url, source) VALUES (?, 'upload')").run('/static/' + neededUpload)
    db.prepare("INSERT INTO user_images (url, source) VALUES (?, 'upload')").run('/static/' + unusedUpload)
  } finally { db.close() }

  const run = spawnSync(process.execPath, [backupScript, '--keep', '10', '--copy-to', mirrorDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TINIX_DB: dbPath,
      TINIX_STATIC_DIR: staticDir,
      TINIX_BACKUP_DIR: backupDir,
    },
    windowsHide: true,
  })
  assert.equal(run.status, 0, run.stderr || run.error?.message)
  const names = fs.readdirSync(backupDir)
  assert.equal(names.length, 1)
  const snapshot = path.join(backupDir, names[0])
  const mirror = path.join(mirrorDir, names[0])
  assert.deepEqual(inventory(snapshot), inventory(mirror), 'mirror must match byte for byte')
  assert.deepEqual(inventory(path.join(snapshot, 'approved-prints')), [[printName, printHash]])

  // [TINIX] Recover DB and prints into a separate offline root; do not just read the backup in place.
  const offlineRoot = path.join(work, 'offline-restore')
  fs.mkdirSync(offlineRoot)
  fs.copyFileSync(path.join(snapshot, 'poster.db'), path.join(offlineRoot, 'poster.db'))
  fs.cpSync(path.join(snapshot, 'approved-prints'), path.join(offlineRoot, 'approved-prints'), { recursive: true })
  assert.equal(sha256(path.join(offlineRoot, 'poster.db')), sha256(path.join(snapshot, 'poster.db')))
  assert.deepEqual(inventory(path.join(offlineRoot, 'approved-prints')), [[printName, printHash]])

  const restoredDb = new Database(path.join(offlineRoot, 'poster.db'), { readonly: true })
  try {
    assert.equal(restoredDb.pragma('integrity_check', { simple: true }), 'ok')
    assert.equal(restoredDb.prepare('SELECT count(*) AS n FROM designs').get().n, 1)
    assert.equal(restoredDb.prepare('SELECT count(*) AS n FROM user_images').get().n, 1)
    const data = JSON.parse(restoredDb.prepare('SELECT data FROM designs').get().data)
    for (const ref of [data.collage, data.photo]) {
      const rel = ref.startsWith('/static/') ? ref.slice('/static/'.length) : ref
      assert.equal(expectedStatic.has(rel), true, 'DB static reference included: ' + rel)
    }
  } finally { restoredDb.close() }

  const restored = path.join(offlineRoot, 'static')
  let extract
  if (process.platform === 'win32') {
    extract = spawnSync(process.env.TINIX_BACKUP_PYTHON || 'python', [
      '-B', unicodeHelper, 'restore', path.join(snapshot, 'static.tar.gz'), restored,
    ], { encoding: 'utf8', windowsHide: true })
  } else {
    fs.mkdirSync(restored)
    extract = spawnSync('tar', ['-xzf', path.join(snapshot, 'static.tar.gz'), '-C', restored],
      { encoding: 'utf8' })
  }
  assert.equal(extract.status, 0, extract.stderr || extract.error?.message)
  assert.deepEqual(inventory(restored),
    [...expectedStatic].sort(([a], [b]) => a.localeCompare(b)),
    'all included static relative paths and SHA-256 exactly match')
  assert.equal(fs.existsSync(path.join(restored, unusedUpload)), false)
  assert.equal(fs.existsSync(path.join(restored, excludedFont)), false)
  assert.equal(sha256(path.join(snapshot, 'approved-prints', printName)), printHash)
  assert.equal(sha256(path.join(mirror, 'approved-prints', printName)), printHash)
  // The older 19-Nov test archive is intentionally not loaded or required.
})
