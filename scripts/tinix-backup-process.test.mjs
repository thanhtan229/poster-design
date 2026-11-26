// [TINIX] Exercise the complete backup command against a synthetic SQLite database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { tarCandidates } from './tinix-backup-archive.mjs'

const Database = createRequire(import.meta.url)('../service/node_modules/better-sqlite3')
const script = fileURLToPath(new URL('./tinix-backup.mjs', import.meta.url))

test('backup command preserves prior data through failures, timestamp collisions and retention', t => {
  const work = fs.mkdtempSync(path.join(tmpdir(), 'tinix-backup-process-'))
  t.after(() => fs.rmSync(work, {recursive:true,force:true}))
  const staticDir = path.join(work,'static')
  const backup = path.join(work,'backup')
  const mirror = path.join(work,'mirror')
  const dbPath = path.join(work,'poster.db')
  for (const folder of ['photos','fonts','favorites']) fs.mkdirSync(path.join(staticDir,folder),{recursive:true})
  const files = {'photos/keep.png':'referenced', 'photos/drop.png':'unused', 'fonts/f.woff2':'font', 'favorites/star.png':'favorite'}
  for (const [name,value] of Object.entries(files)) fs.writeFileSync(path.join(staticDir,name),value)
  const db = new Database(dbPath)
  db.exec('CREATE TABLE designs (data TEXT); CREATE TABLE user_images (id INTEGER PRIMARY KEY, url TEXT, web_url TEXT, thumb_url TEXT, source TEXT)')
  db.prepare('INSERT INTO designs VALUES (?)').run('{"imgUrl":"/static/photos/keep.png"}')
  for (const name of ['keep','drop']) db.prepare("INSERT INTO user_images (url,source) VALUES (?, 'upload')").run('/static/photos/'+name+'.png')
  db.close()
  const originalDb = fs.readFileSync(dbPath)
  const clock = path.join(work,'clock.cjs')
  fs.writeFileSync(clock, 'const Clock = Date; global.Date = class extends Clock { constructor(...args) { super(...(args.length ? args : [process.env.QA_CLOCK])) } };')
  function run(second,extra={}) {
    return spawnSync(process.execPath,['--require',clock,script,'--keep','2','--copy-to',mirror],{
      encoding:'utf8', env:{...process.env,TINIX_TAR_BIN:'',QA_CLOCK:'2026-01-02T01:02:0'+second,
        TINIX_DB:dbPath,TINIX_STATIC_DIR:staticDir,TINIX_BACKUP_DIR:backup,...extra},
    })
  }
  const first = run(1)
  assert.equal(first.status,0,first.stderr)
  const archive = path.join(backup,'20260102-010201','static.tar.gz')
  const originalArchive = fs.readFileSync(archive)
  const collision = run(1)
  assert.equal(collision.status,1)
  assert.match(collision.stderr,/BACKUP_DESTINATION_EXISTS/)
  const otherBackup = path.join(work,'other-backup')
  const mirrorDb = path.join(mirror,'20260102-010201','poster.db')
  const originalMirrorDb = fs.readFileSync(mirrorDb)
  const mirrorCollision = run(1,{TINIX_BACKUP_DIR:otherBackup})
  assert.equal(mirrorCollision.status,1)
  assert.match(mirrorCollision.stderr,/BACKUP_DESTINATION_EXISTS/)
  assert.deepEqual(fs.readFileSync(mirrorDb),originalMirrorDb)
  assert.ok(fs.existsSync(path.join(otherBackup,'20260102-010201','static.tar.gz')))
  const bad = run(2,{TINIX_TAR_BIN:process.execPath})
  assert.equal(bad.status,1)
  assert.match(bad.stderr,/TAR_CREATE_FAILED/)
  assert.deepEqual(fs.readFileSync(archive),originalArchive)
  assert.deepEqual(fs.readFileSync(path.join(mirror,'20260102-010201','static.tar.gz')),originalArchive)
  assert.deepEqual(fs.readdirSync(backup),['20260102-010201'])
  const tar = spawnSync(tarCandidates()[0],['-tzf',archive],{encoding:'utf8'})
  assert.equal(tar.status,0,tar.stderr)
  assert.match(tar.stdout,/photos\/keep\.png/)
  assert.match(tar.stdout,/favorites\/star\.png/)
  assert.doesNotMatch(tar.stdout,/drop\.png|f\.woff2/)
  const copiedDb=new Database(path.join(backup,'20260102-010201','poster.db'),{readonly:true})
  assert.equal(copiedDb.pragma('integrity_check',{simple:true}),'ok')
  assert.equal(copiedDb.prepare('SELECT count(*) AS n FROM user_images').get().n,1)
  copiedDb.close()
  for(const n of [3,4]) {
    const result=run(n)
    assert.equal(result.status,0,result.stderr)
  }
  for(const dir of [backup,mirror]) assert.deepEqual(fs.readdirSync(dir).sort(),['20260102-010203','20260102-010204'])
  assert.deepEqual(fs.readFileSync(dbPath),originalDb)
  for(const [name,value] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(staticDir,name),'utf8'),value)
})
