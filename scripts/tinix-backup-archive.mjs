// [TINIX] Cross-platform, fail-closed static archive for scheduled backups.
// Prefer Windows built-in tar.exe to avoid Task Scheduler PATH differences.
// Never treat a created file alone as proof that compression succeeded.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export function tarCandidates(env = process.env, platform = process.platform, exists = fs.existsSync) {
  const bins = []
  if (env.TINIX_TAR_BIN) bins.push(env.TINIX_TAR_BIN)
  if (platform === 'win32' && (env.SystemRoot || env.WINDIR)) {
    const systemTar = path.win32.join(env.SystemRoot || env.WINDIR, 'System32', 'tar.exe')
    if (exists(systemTar)) bins.push(systemTar)
  }
  bins.push('tar')
  return [...new Set(bins)]
}

const tail = value => String(value || '').trim().slice(-2400)
function reason(stage, bin, result) {
  const details = [result?.error?.message, tail(result?.stderr), tail(result?.stdout)].filter(Boolean).join(' | ')
  return stage + ': ' + bin + ' (exit ' + String(result?.status ?? 'unknown') + ')' +
    (details ? ': ' + details : '')
}

function fingerprint(file) {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(256 * 1024)
  const fd = fs.openSync(file, 'r')
  try {
    for (let bytes; (bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, bytes))
    return hash.digest('hex')
  } finally { fs.closeSync(fd) }
}

function inventory(root, excluded = () => false) {
  const files = new Map()
  const directories = new Set()
  function visit(dir, prefix) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + item.name
      if (excluded(name)) continue
      if (/[\\\r\n]/.test(name)) throw Error('STATIC_PATH_UNSUPPORTED: ' + name)
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        directories.add(name)
        visit(full, name + '/')
      } else if (item.isFile()) files.set(name, fingerprint(full))
      else throw Error('STATIC_ENTRY_NOT_REGULAR: ' + name)
    }
  }
  if (!fs.lstatSync(root).isDirectory()) throw Error('STATIC_ROOT_NOT_DIRECTORY: ' + root)
  visit(root, '')
  return { files, directories }
}

function verifyMembers(list, types, expected) {
  if (list.length !== types.length) throw Error('TAR_LIST_TYPE_COUNT_MISMATCH')
  const found = new Set()
  const directories = new Set()
  for (const [index, raw] of list.entries()) {
    const kind = types[index][0]
    const name = raw.replace(/^\.\//, '').replace(/\/$/, '')
    if (kind === 'd' && (raw === '.' || raw === './')) continue
    if (kind === 'd' && expected.directories.has(name) && !directories.has(name)) directories.add(name)
    else if (kind === '-' && expected.files.has(name) && !found.has(name)) found.add(name)
    else throw Error('TAR_UNEXPECTED_OR_DUPLICATE_MEMBER: ' + raw)
  }
  const missing = [...expected.files.keys()].find(name => !found.has(name))
  if (missing) throw Error('TAR_REQUIRED_MEMBER_MISSING: ' + missing)
}

function verifyContents(actual, expected, reason) {
  if (actual.size !== expected.size) throw Error(reason + ': file count differs')
  for (const [name, hash] of expected) {
    if (actual.get(name) !== hash) throw Error(reason + ': ' + name)
  }
}

export function archiveStatic({ staticDir, dest, skipped = [], runner = spawnSync,
  env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (!staticDir || !dest || !exists(staticDir)) throw new Error('STATIC_ROOT_MISSING: ' + String(staticDir))
  const archive = path.join(dest, 'static.tar.gz')
  const exclusionFile = path.join(dest, 'loai-tru.txt')
  if (skipped.some(name => typeof name !== 'string' || name.startsWith('/') ||
    name.startsWith('\\') || name.split('/').some(part => !part || part === '..' || part === '.') || /[\\\r\n]/.test(name))) {
    throw new Error('STATIC_EXCLUSION_PATH_INVALID')
  }
  const skip = new Set(skipped)
  const excluded = name => /^(fonts|font-previews)(\/|$)/.test(name) || skip.has(name)
  const expected = inventory(staticDir, excluded)
  const options = { cwd: dest, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, env }
  // [TINIX] System32 tar can pollute names when restoring UTF-8 or even crash while packing.
  // ASCII keeps the original native tar path, including its failure diagnostics.
  const unicodeWindows = platform === 'win32' &&
    [...expected.files.keys(), ...expected.directories].some(name => /[^\x00-\x7f]/.test(name))
  if (unicodeWindows) {
    const bin = env.TINIX_BACKUP_PYTHON || 'python'
    const script = fileURLToPath(new URL('./tinix-backup-unicode.py', import.meta.url))
    const input = JSON.stringify({ files: Object.fromEntries(expected.files), directories: [...expected.directories] })
    const result = runner(bin, ['-B', script, 'create', path.resolve(staticDir), path.resolve(archive)], { ...options, input })
    if (result?.error || result?.status !== 0) {
      const stage = result?.error?.code === 'ENOENT' ? 'TAR_UTF8_PYTHON_NOT_FOUND' : 'TAR_UTF8_CREATE_VERIFY_FAILED'
      throw Error(reason(stage, bin, result))
    }
    const { members } = JSON.parse(result.stdout)
    if (members !== 1 + expected.files.size + expected.directories.size || !fs.statSync(archive).size) {
      throw Error('TAR_UTF8_VERIFIED_MEMBER_COUNT_MISMATCH')
    }
    verifyContents(inventory(staticDir, excluded).files, expected.files, 'STATIC_SOURCE_CHANGED')
    return { bin, bytes: fs.statSync(archive).size, members, files: expected.files.size }
  }
  const args = ['-czf', 'static.tar.gz', '--exclude=./fonts', '--exclude=./font-previews']
  if (skipped.length) {
    fs.writeFileSync(exclusionFile, skipped.map(x => './' + x).join('\n') + '\n')
    args.push('-X', 'loai-tru.txt')
  }
  args.push('-C', staticDir, '.')
  try {
    let lastNotFound = ''
    for (const bin of tarCandidates(env, platform, exists)) {
      const created = runner(bin, args, options)
      if (created?.error?.code === 'ENOENT') {
        lastNotFound = reason('TAR_NOT_FOUND', bin, created)
        continue
      }
      if (created?.error || created?.status !== 0) {
        throw new Error(reason('TAR_CREATE_FAILED', bin, created))
      }
      if (!exists(archive) || fs.statSync(archive).size === 0) {
        throw new Error('TAR_ARCHIVE_MISSING_OR_EMPTY: ' + archive)
      }
      // Testing archive decompression catches truncated output and Task Scheduler false positives.
      const inspected = runner(bin, ['-tzf', 'static.tar.gz'], options)
      if (inspected?.error || inspected?.status !== 0) {
        throw new Error(reason('TAR_VERIFY_FAILED', bin, inspected))
      }
      const lines = result => String(result.stdout || '').split(/\r?\n/).filter(Boolean)
      const members = lines(inspected)
      if (!members.length) throw new Error('TAR_ARCHIVE_NO_MEMBERS: ' + archive)
      const verbose = runner(bin, ['-tvzf', 'static.tar.gz'], options)
      if (verbose?.error || verbose?.status !== 0) throw Error(reason('TAR_TYPE_VERIFY_FAILED', bin, verbose))
      verifyMembers(members, lines(verbose), expected)
      const restored = fs.mkdtempSync(path.join(dest, '.verify-static-'))
      try {
        const unpacked = runner(bin, ['-xzf', 'static.tar.gz', '-C', restored], options)
        if (unpacked?.error || unpacked?.status !== 0) throw Error(reason('TAR_RESTORE_FAILED', bin, unpacked))
        verifyContents(inventory(restored).files, expected.files, 'TAR_CONTENT_MISMATCH')
        verifyContents(inventory(staticDir, excluded).files, expected.files, 'STATIC_SOURCE_CHANGED')
      } finally { fs.rmSync(restored, { recursive: true, force: true }) }
      return { bin, bytes: fs.statSync(archive).size, members: members.length, files: expected.files.size }
    }
    throw new Error(lastNotFound || 'TAR_NOT_FOUND: No tar candidate available')
  } finally {
    fs.rmSync(exclusionFile, { force: true })
  }
}
