import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { archiveStatic, tarCandidates } from './tinix-backup-archive.mjs'


const helper = fileURLToPath(new URL('./tinix-backup-unicode.py', import.meta.url))
const python = process.env.TINIX_BACKUP_PYTHON || 'python'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function runPython(args, input) {
  return spawnSync(python, args, { encoding: 'utf8', input, windowsHide: true })
}
function fileInventory(root, exclusions = []) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const full = path.join(entry.parentPath, entry.name)
      return [path.relative(root, full).split(path.sep).join('/'), hash(readFileSync(full))]
    })
    .filter(([name]) => !exclusions.some(excluded => name === excluded || name.startsWith(excluded + '/')))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
}
function restoreUnicodeArchive(archive, destination) {
  const result = runPython(['-B', helper, 'restore', archive, destination])
  assert.equal(result.status, 0, result.stderr || result.error?.message)
}
function syntheticArchive(archive, members, format = 'pax') {
  const script = [
    'import io, json, sys, tarfile',
    'rows = json.loads(sys.stdin.buffer.read())',
    'options = {"gnu": tarfile.GNU_FORMAT, "pax": tarfile.PAX_FORMAT}',
    'with tarfile.open(sys.argv[1], "w:gz", format=options[sys.argv[2]], encoding="utf-8") as dst:',
    ' for row in rows:',
    '  item = tarfile.TarInfo(row["name"])',
    '  if "link" in row or "hardlink" in row:',
    '   item.type = tarfile.SYMTYPE if "link" in row else tarfile.LNKTYPE',
    '   item.linkname = row.get("link", row.get("hardlink"))',
    '   dst.addfile(item)',
    '  else:',
    '   data = row["content"].encode("utf-8")',
    '   item.size = len(data)',
    '   dst.addfile(item, io.BytesIO(data))',
    'print(json.dumps([row["name"].encode("utf-8").decode("cp437") for row in rows]))',
  ].join('\n')
  const result = runPython(['-B', '-c', script, archive, format], JSON.stringify(members))
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return JSON.parse(result.stdout)
}

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
  if (process.platform === 'win32') assert.equal(result.bin.toLowerCase(),
    path.join(process.env.SystemRoot, 'System32', 'tar.exe').toLowerCase())
  const extracted = path.join(dest, 'extracted')
  mkdirSync(extracted)
  const restore = spawnSync(result.bin, ['-xzf', 'static.tar.gz', '-C', extracted], { cwd: dest, encoding: 'utf8' })
  assert.equal(restore.status, 0, restore.stderr)
  assert.deepEqual(readFileSync(path.join(extracted, 'photos', 'needed.png')),
    readFileSync(path.join(staticDir, 'photos', 'needed.png')))
  assert.equal(result.files, 1)
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

for (const [label, members, kinds] of [
  ['root-only', './\n', 'd ./\n'],
  ['partial', './\n./photos/\n./photos/needed.png\n', 'd ./\nd photos\n- needed\n'],
  ['duplicate', './photos/needed.png\n./photos/needed.png\n', '- needed\n- needed\n'],
]) test('rejects ' + label + ' archive inventory', t => {
  const {staticDir,dest}=fixture(t)
  const runner = (_, args) => {
    if (args[0] === '-czf') writeFileSync(path.join(dest,'static.tar.gz'),'synthetic')
    return {status:0,stdout:args[0] === '-tzf' ? members : args[0] === '-tvzf' ? kinds : ''}
  }
  assert.throws(() => archiveStatic({staticDir,dest,runner}), /TAR_REQUIRED_MEMBER_MISSING|TAR_UNEXPECTED_OR_DUPLICATE_MEMBER/)
})

test('source changes during compression are rejected', t => {
  const {staticDir,dest}=fixture(t)
  const runner = (bin,args,opts) => {
    const result=spawnSync(bin,args,opts)
    if (args[0] === '-czf') writeFileSync(path.join(staticDir,'photos','needed.png'),'changed')
    return result
  }
  assert.throws(() => archiveStatic({staticDir,dest,runner}), /STATIC_SOURCE_CHANGED/)
})

test('Windows Unicode backup preserves NFC, NFD, multibyte paths and bytes', { skip: process.platform !== 'win32' }, t => {
  const { staticDir, dest } = fixture(t)
  const names = [
    'collage/Tiếng Việt/NFC-Café.png',
    'collage/Tiếng Việt/NFD-Cafe\u0301.png',
    'collage/日本/ảnh-🚀.png',
  ]
  for (const [index, name] of names.entries()) {
    const file = path.join(staticDir, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from('synthetic Unicode file ' + index))
  }
  const result = archiveStatic({ staticDir, dest, skipped: ['photos/unused.png'] })
  assert.equal(result.files, 4)
  const restored = path.join(dest, 'verified')
  restoreUnicodeArchive(path.join(dest, 'static.tar.gz'), restored)
  assert.deepEqual(fileInventory(restored), fileInventory(staticDir, ['fonts', 'font-previews', 'photos/unused.png']))
})


test('Windows System32 tar legacy UTF-8 archive round trips through portable restore', { skip: process.platform !== 'win32' }, t => {
  const { dest } = fixture(t)
  const name = 'collage/Tiếng Việt/NFD-A\u0301/日本-🚀.txt'
  const content = 'synthetic legacy bytes'
  const archive = path.join(dest, 'legacy.tar.gz')
  const wrong = syntheticArchive(archive, [{ name, content }], 'gnu')[0]
  assert.notEqual(wrong, name)
  const nativeDir = path.join(dest, 'native')
  mkdirSync(nativeDir)
  const result = spawnSync(tarCandidates()[0], ['-xzf', archive, '-C', nativeDir], { encoding: 'utf8' })
  const exact = path.join(nativeDir, name)
  if (result.status === 0) {
    if (existsSync(exact)) assert.equal(readFileSync(exact, 'utf8'), content)
    else assert.equal(readFileSync(path.join(nativeDir, wrong), 'utf8'), content)
  } else {
    assert.ok(result.status !== null, result.error?.message)
  }
  const restored = path.join(dest, 'utf8')
  restoreUnicodeArchive(archive, restored)
  assert.deepEqual(fileInventory(restored), [[name, hash(Buffer.from(content))]])
  t.diagnostic('System32 tar legacy result: ' + (result.status !== 0 ? 'failure ' + result.status : existsSync(exact) ? 'exact UTF-8' : 'exit 0; CP437 filename'))
})

for (const [label, rows, message] of [
  ['PAX traversal', [{ name: '../' + 'unicode-é/'.repeat(12) + 'file.png', content: 'x' }], /TAR_UNSAFE_WINDOWS_PATH/],
  ['absolute path', [{ name: '/bad', content: 'x' }], /TAR_UNSAFE_WINDOWS_PATH/],
  ['reserved name', [{ name: 'folder/COM1.txt', content: 'x' }], /TAR_UNSAFE_WINDOWS_PATH/],
  ['trailing dot', [{ name: 'folder/unsafe.', content: 'x' }], /TAR_UNSAFE_WINDOWS_PATH/],
  ['NTFS case collision', [{ name: 'Case/É.txt', content: 'x' }, { name: 'case/é.txt', content: 'y' }], /TAR_WINDOWS_PATH_COLLISION/],
  ['Unicode equivalence collision', [{ name: 'NFC/Café.txt', content: 'x' }, { name: 'NFC/Cafe\u0301.txt', content: 'y' }], /TAR_WINDOWS_PATH_COLLISION/],
  ['symlink', [{ name: 'safe/link', link: '../escape' }], /TAR_NON_REGULAR_MEMBER/],
  ['hardlink', [{ name: 'safe/link', hardlink: '../escape' }], /TAR_NON_REGULAR_MEMBER/],
]) test('UTF-8 restore preflights and rejects ' + label, { skip: process.platform !== 'win32' }, t => {
  const { dest } = fixture(t)
  const archive = path.join(dest, 'negative.tar.gz')
  syntheticArchive(archive, [{ name: 'first-safe.txt', content: 'safe' }, ...rows])
  const target = path.join(dest, 'never-created')
  const result = runPython(['-B', helper, 'restore', archive, target])
  assert.equal(result.status, 1)
  assert.match(result.stderr, message)
  assert.equal(existsSync(target), false)
  assert.equal(existsSync(path.join(dest, 'escape')), false)
})

test('Windows Unicode needs a real Python verifier and fails closed without it', t => {
  const { staticDir, dest } = fixture(t)
  const name = 'files-đ.png'
  writeFileSync(path.join(staticDir, name), 'synthetic')
  const runner = () => ({ status: null, error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) })
  assert.throws(() => archiveStatic({ staticDir, dest, runner, platform: 'win32', env: {} }), /TAR_UTF8_PYTHON_NOT_FOUND/)
  assert.equal(existsSync(path.join(dest, 'static.tar.gz')), false)
})

test('UTF-8 restore refuses a Windows junction in the output path', { skip: process.platform !== 'win32' }, t => {
  const { dest } = fixture(t)
  const archive = path.join(dest, 'safe.tar.gz')
  syntheticArchive(archive, [{ name: 'safe.txt', content: 'synthetic' }])
  const untouched = path.join(dest, 'untouched')
  mkdirSync(untouched)
  const junction = path.join(dest, 'junction')
  symlinkSync(untouched, junction, 'junction')
  const result = runPython(['-B', helper, 'restore', archive, path.join(junction, 'restore')])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /TAR_NON_REGULAR_ENTRY/)
  assert.deepEqual(readdirSync(untouched), [])
})
