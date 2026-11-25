// [TINIX] Inspect only layers whose bounds could meet or cross a finished-page edge.
import type { TdWidgetData } from '@/store/design/widget'
import config from '@/config'
import { renderedLayerBounds, renderedPixels } from './cut-piece-review'
import { measureTrimAlpha, createTrimCache } from './trim-edge-scan'
import { resolveLinkedImage } from './image-effects'

type Page = { width: number; height: number; dpi?: number }
export type TrimRow = ReturnType<typeof measureTrimAlpha> & {
  id: string
  name: string
  boxWarning: boolean
}
const nearEdge = 2
type Candidate = { layer: TdWidgetData; family: TdWidgetData[]; boxWarning: boolean; bounds?: ReturnType<typeof renderedLayerBounds> }
type TrimMeasurement = ReturnType<typeof measureTrimAlpha>
export const createPrintTrimCache = () => createTrimCache<TrimMeasurement>()
// [TINIX] Canvas and bundle check the same render key, including asset revisions.
export const printTrimCache = createPrintTrimCache()

function referencedAssets(value: unknown, urls = new Set<string>()) {
  if (!value) return urls
  if (typeof value === 'object') {
    for (const child of Object.values(value)) referencedAssets(child, urls)
  } else if (typeof value === 'string') {
    const input = value.trim()
    if (/^(?:\/static\/|https?:\/\/|\/\/|blob:|file:)/i.test(input)) urls.add(input)
    const encodedSvg = input.match(/^data:image\/svg\+xml([^,]*),/i)
    const svg = !encodedSvg ? input : encodedSvg[1].includes(';base64')
      ? atob(input.slice(encodedSvg[0].length)) : decodeURIComponent(input.slice(encodedSvg[0].length))
    if (/^\s*<svg\b/i.test(svg)) {
      for (const match of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)|url\(\s*["']?([^"'\s)]+)/gi)) {
        const url = match[1] || match[2]
        if (!url.startsWith('#') && !url.startsWith('data:')) urls.add(url)
      }
    }
  }
  return urls
}

function assetVersions(signal: AbortSignal) {
  const base = new URL(config.SCREEN_URL || location.origin, location.href)
  const checks = new Map<string, Promise<string | undefined>>()
  return function version(asset: string) {
    if (!checks.has(asset)) {
      checks.set(asset, (async () => {
        try {
          const url = new URL(asset,base)
          if (url.origin !== base.origin || !url.pathname.startsWith('/static/')) return
          const response = await fetch(url,{method:'HEAD',cache:'no-store',redirect:'error',
            signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])})
          const etag = response.headers.get('etag')
          if (response.ok && etag) return etag
        } catch {
          signal.throwIfAborted()
        }
      })())
    }
    return checks.get(asset)!
  }
}

async function renderKey(page: Page, family: TdWidgetData[], source: TdWidgetData,
  version: ReturnType<typeof assetVersions>) {
  if (!crypto.subtle) return
  try {
    const inputs = [page,family,source === family.at(-1) ? null : source]
    const assets = [...referencedAssets(inputs)].sort()
    const versions = await Promise.all(assets.map(version))
    if (versions.some(value=>!value)) return
    const bytes = new TextEncoder().encode(JSON.stringify([inputs,assets,versions]))
    const digest = await crypto.subtle.digest('SHA-256',bytes)
    return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
  } catch {
    // Rendering still works when the file identity cannot be validated.
    return
  }
}

function candidateLayers(page: Page, layers: TdWidgetData[], targets?: ReadonlySet<string>) {
  const all = new Map(layers.map(layer => [layer.uuid, layer]))
  return layers.flatMap<Candidate>(layer => {
    const family = [layer]
    const seen = new Set([layer.uuid])
    for (let parent = all.get(layer.parent || ''); parent && !seen.has(parent.uuid); parent = all.get(parent.parent || '')) {
      seen.add(parent.uuid)
      family.unshift(parent)
    }
    if (targets && !family.some(w => targets.has(w.uuid))) return []
    if (family.some(w => w.hidden)) return []
    const boxWarning = layer.left < -.5 || layer.top < -.5 ||
      layer.left + layer.width > page.width + .5 || layer.top + layer.height > page.height + .5
    if (layer.isContainer) {
      // Containers have no print pixels of their own. Children are evaluated individually.
      return boxWarning ? [{ layer, family, boxWarning, bounds: undefined }] : []
    }
    const bounds = renderedLayerBounds(family, [layer])
    const shadow = Math.max(0, Number(layer.effects?.shadow) || 0) * 3
    const clearance = nearEdge + shadow
    if (!boxWarning && bounds.x > clearance && bounds.y > clearance &&
      bounds.right < page.width-clearance && bounds.bottom < page.height-clearance) return []
    return [{ layer, family, boxWarning, bounds }]
  })
}

export function hasTrimCandidates(page: Page, layers: TdWidgetData[], targets: ReadonlySet<string>) {
  return candidateLayers(page, layers, targets).some(candidate => !!candidate.bounds)
}

export async function inspectPrintTrim(page: Page, layers: TdWidgetData[], signal: AbortSignal,
  progress: (index: number, total: number) => void, cache: ReturnType<typeof createPrintTrimCache>, targets?: ReadonlySet<string>) {
  const start = performance.now()
  const rows: TrimRow[] = []
  const counts = { reused:0, rendered:0, renders:0 }
  const pageInputs = { ...page, backgroundColor:undefined, backgroundImage:undefined, backgroundGradient:undefined,
    opacity:1, referenceGuide:undefined }
  const version = assetVersions(signal)
  const candidates = candidateLayers(page, layers, targets)
  for (const [index, candidate] of candidates.entries()) {
    signal.throwIfAborted()
    const { layer, family, boxWarning, bounds } = candidate
    const base = { id: layer.uuid, name: layer.name || 'Thành phần', boxWarning }
    const empty = measureTrimAlpha(new Uint8Array(), 0, 0, 0, 0, page.width, page.height)
    if (!bounds) {
      rows.push({ ...base, ...empty, status: 'inside' })
      continue
    }
    progress(index+1,candidates.length)
    const key = await renderKey(pageInputs,family,resolveLinkedImage(layer,layers),version)
    signal.throwIfAborted()
    const cached = key && cache.get(layer.uuid,key)
    if (cached) {
      counts.reused++
      if (cached.status !== 'inside' || boxWarning) rows.push({ ...base, ...cached })
      continue
    }
    counts.rendered++
    try {
      const shadow = Math.max(0, Number(layer.effects?.shadow) || 0)
      const pad = Math.ceil(5 + 3 * shadow)
      const left = Math.floor(bounds.x) - pad
      const top = Math.floor(bounds.y) - pad
      const width = Math.ceil(bounds.right) + pad - left
      const height = Math.ceil(bounds.bottom) + pad - top
      if (!(width > 0 && height > 0 && width * height <= 12_000_000 && Math.max(width,height) <= 6000)) throw new Error('Trim render limit')
      const copies = family.map(w => ({ ...w, left: w.left-left, top: w.top-top }))
      const renderSignal = AbortSignal.any([signal,AbortSignal.timeout(45000)])
      // [TINIX] Measure the PNG's native alpha at production resolution.
      counts.renders++
      const pixels = await renderedPixels({
        global: { ...pageInputs, width, height, backgroundColor: 'transparent' },
        layers: copies,
      }, width, height, renderSignal, true)
      const alpha = new Uint8Array(width * height)
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
      if (alpha.every(value => value === 255)) throw new Error('Expected transparent padding')
      const result = measureTrimAlpha(alpha,width,height,left,top,page.width,page.height)
      signal.throwIfAborted()
      if (key) cache.set(layer.uuid,key,result)
      if (result.status !== 'inside' || boxWarning) rows.push({ ...base, ...result })
    } catch {
      signal.throwIfAborted()
      rows.push({ ...base, ...empty })
    }
  }
  return { rows, stats:{ ...counts, milliseconds:Math.round(performance.now()-start) } }
}
