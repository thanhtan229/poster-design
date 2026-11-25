// [TINIX] Reuse production artifacts only when the packed layout and its assets match.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const MAX_BYTES = 96 * 1024 * 1024
const TTL_MS = 30 * 60 * 1000

export function createPrintArtifactCache(maxBytes = MAX_BYTES, ttlMs = TTL_MS, now = Date.now) {
  const entries = new Map<string, { bytes: Buffer; expires: number }>()
  let size = 0
  function drop(key: string) {
    const entry = entries.get(key)
    if (entry) size -= entry.bytes.length
    entries.delete(key)
  }
  return {
    get(key: string | undefined) {
      if (!key) return
      const entry = entries.get(key)
      if (!entry) return
      if (entry.expires <= now()) { drop(key); return }
      entries.delete(key)
      entries.set(key, entry)
      return entry.bytes
    },
    set(key: string | undefined, bytes: Buffer) {
      if (!key || !bytes.length || bytes.length > maxBytes) return
      drop(key)
      for (const [id, entry] of entries) if (entry.expires <= now()) drop(id)
      while (size + bytes.length > maxBytes) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        drop(oldest.value)
      }
      entries.set(key, { bytes, expires: now() + ttlMs })
      size += bytes.length
    },
  }
}

function collectAssets(value: unknown, urls: Set<string>) {
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && child.trim() && /^(?:imgUrl|mask|backgroundImage|cutoutBorderUrl|url)$/i.test(key) &&
          !/^\s*(?:data:|<svg\b)/i.test(child)) urls.add(child.trim())
      collectAssets(child, urls)
    }
    return
  }
  if (typeof value !== 'string') return
  const input = value.trim()
  if (/^(?:\/static(?:\/|$)|[a-z][\w+.-]*:\/\/|\/\/|blob:)/i.test(input)) urls.add(input)
  const encoded = input.match(/^data:image\/svg\+xml([^,]*),/i)
  const svg = !encoded ? input : /;base64/i.test(encoded[1])
    ? Buffer.from(input.slice(encoded[0].length), 'base64').toString('utf8') : decodeURIComponent(input.slice(encoded[0].length))
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg) && !/url\(\s*["']?|@import\s+["']/i.test(svg)) return
  for (const match of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)|url\(\s*["']?([^"'\s)]+)|@import\s+["']([^"']+)/gi)) {
    const url = match[1] || match[2] || match[3]
    if (url.startsWith('#')) continue
    // A nested SVG data URI can itself contain a linked asset.
    if (url.startsWith('data:')) collectAssets(url, urls)
    else urls.add(url)
  }
}

export function printArtifactKey(layout: any, options: unknown, staticRoot: string, origin: string, renderer: string) {
  try {
    const { referenceGuide, ...page } = layout.global // Editor-only data, never rendered.
    const input = { global: page, layers: layout.layers }
    const urls = new Set<string>()
    collectAssets(input, urls)
    const root = fs.realpathSync(staticRoot)
    const versions = [...urls].sort().map(value => {
      const url = new URL(value, origin)
      if (url.origin !== origin || !url.pathname.startsWith('/static/')) throw new Error('Untracked asset')
      const filename = fs.realpathSync(path.resolve(root, decodeURIComponent(url.pathname.slice(8))))
      const relative = path.relative(root, filename)
      if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Outside static root')
      const stat = fs.statSync(filename)
      if (!stat.isFile()) throw new Error('Missing asset')
      return [value, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]
    })
    return crypto.createHash('sha256').update(JSON.stringify([renderer, options, input, versions])).digest('hex')
  } catch (_) {
    return undefined // Render through the usual path if the inputs cannot be verified.
  }
}
