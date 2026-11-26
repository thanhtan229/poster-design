// [TINIX] Cross-platform, fail-closed static archive for scheduled backups.
// Prefer Windows built-in tar.exe to avoid Task Scheduler PATH differences.
// Never treat a created file alone as proof that compression succeeded.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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

export function archiveStatic({ staticDir, dest, skipped = [], runner = spawnSync,
  env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (!staticDir || !dest || !exists(staticDir)) throw new Error('STATIC_ROOT_MISSING: ' + String(staticDir))
  const archive = path.join(dest, 'static.tar.gz')
  const exclusionFile = path.join(dest, 'loai-tru.txt')
  if (skipped.some(name => typeof name !== 'string' || name.startsWith('/') ||
    name.startsWith('\\') || name.includes('..') || name.includes('\n') || name.includes('\r'))) {
    throw new Error('STATIC_EXCLUSION_PATH_INVALID')
  }
  const options = { cwd: dest, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
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
      const members = String(inspected.stdout || '').split(/\r?\n/).filter(Boolean)
      if (!members.length) throw new Error('TAR_ARCHIVE_NO_MEMBERS: ' + archive)
      if (members.some(x => /^\.\/(fonts|font-previews)(\/|$)/.test(x) ||
        skipped.includes(x.replace(/^\.\//, '')))) {
        throw new Error('TAR_EXCLUDED_MEMBER_PRESENT: ' + archive)
      }
      return { bin, bytes: fs.statSync(archive).size, members: members.length }
    }
    throw new Error(lastNotFound || 'TAR_NOT_FOUND: No tar candidate available')
  } finally {
    fs.rmSync(exclusionFile, { force: true })
  }
}
