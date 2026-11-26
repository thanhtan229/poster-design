import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { archiveStatic, tarCandidates } from './tinix-backup-archive.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'tinix-backup-archive-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const staticDir = path.join(root, 'static'), dest = path.join(root, 'backup')
  for (const folder of [staticDir, dest, path.join(staticDir, 'fonts'),
    path.join(staticDir, 'font-previews'), path.join(staticDir, 'photos')]) {
    mkdirSync(folder, { recursive: true })
  }
  writeFileSync(path.join(staticDir, 'photos', 'needed.png'), 'needed synthetic')
  writeFileSync(path.join(staticDir, 'photos', 'unused.png'), 'unused synthetic')
  writeFileSync(path.join(staticDir, 'fonts', 'font.woff2'), 'font synthetic')
  writeFileSync(path.join(staticDir, 'font-previews', 'preview.png'), 'preview synthetic')
  return { staticDir, dest }
}

test('real tar produces a readable archive with expected files and exclusions', t => {
  const { staticDir, dest } = fixture(t)
  const result = archiveStatic({ staticDir, dest, skipped: ['photos/unused.png'] })
  assert.ok(result.bytes > 0)
  const listing = spawnSync(result.bin, ['-tzf', 'static.tar.gz'],
    { cwd: dest, encoding: 'utf8' })
  assert.equal(listing.status, 0, listing.stderr)
  assert.match(listing.stdout, /photos\/needed.png/)
  assert.doesNotMatch(listing.stdout, /photos\/unused.png|fonts\/font|font-previews\/preview/)
})

test('missing static root blocks the backup, never returns a false success', t => {
  const { dest } = fixture(t)
  assert.throws(() => archiveStatic({ staticDir: path.join(dest, 'not-found'), dest }),
    /STATIC_ROOT_MISSING/)
})

test('missing tar executable reports the missing command', t => {
  const { staticDir, dest } = fixture(t)
  const missing = () => ({ status: null, error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) })
  assert.throws(() => archiveStatic({ staticDir, dest, runner: missing,
    env: { TINIX_TAR_BIN: 'not-a-tar' }, platform: 'linux' }), /TAR_NOT_FOUND/)
})

test('nonzero compression exit is reported even if a previous archive exists', t => {
  const { staticDir, dest } = fixture(t)
  writeFileSync(path.join(dest, 'static.tar.gz'), 'old archive')
  const bad = () => ({ status: 2, stderr: 'synthetic tar failure' })
  assert.throws(() => archiveStatic({ staticDir, dest, runner: bad }), /TAR_CREATE_FAILED.*synthetic tar failure/)
})

test('archive verification rejects corrupted output with status zero from compressor', t => {
  const { staticDir, dest } = fixture(t)
  let called = 0
  const fake = () => {
    called++
    if (called === 1) {
      writeFileSync(path.join(dest, 'static.tar.gz'), 'not-gzip')
      return { status: 0, stdout: '', stderr: '' }
    }
    return { status: 2, stdout: '', stderr: 'bad gzip header' }
  }
  assert.throws(() => archiveStatic({ staticDir, dest, runner: fake }), /TAR_VERIFY_FAILED/)
})

test('Windows scheduled environment prefers System32 tar when present', () => {
  const bins = tarCandidates({ SystemRoot: 'C:\\Windows' }, 'win32', path => path.endsWith('tar.exe'))
  assert.equal(bins[0], 'C:\\Windows\\System32\\tar.exe')
  assert.equal(bins.at(-1), 'tar')
})
