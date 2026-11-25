// [TINIX] Inspect one production piece using the same renderer and cut geometry as sheet export.
import config from '@/config'
import type { TdLayout, TdWidgetData } from '@/store/design/widget'
import { alphaFromRenders, buildCutSvg, type Pt } from '../../../service/src/tinix/cutPaths'
import { cutoutCanvas, readCutoutFile, readCutoutImage } from './cutout-workspace'
import { inspectCutSheet } from './cut-readiness'
import type { CropRenderJob } from './crop-render-body.worker' // [TINIX]
import { printUnits } from './collage-print'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { wSvgSetting } from '@/components/modules/widgets/wSvg/wSvgSetting'

export const CUT_REVIEW_EVENT = 'tinix:review-cut-piece'
type PrintLayer = TdWidgetData & { printRole?: string; printGroup?: string; degree?: number; cutInset?: number; cutoutBorderUrl?: string }
type Page = { width: number; height: number; dpi?: number }
type Edges = { x: number; y: number; right: number; bottom: number }

export function reviewPieceLayers(layers: TdWidgetData[], id: string) {
  const unit = printUnits(layers).find(u => u.id === id && u.raised)
  const ids = new Set(unit?.ids)
  return { unit, layers: layers.filter(w => ids.has(w.uuid)) as PrintLayer[] }
}

export function pieceSignature(page: Page, layers: TdWidgetData[], id: string) {
  const piece = reviewPieceLayers(layers, id)
  return JSON.stringify([page.width, page.height, page.dpi, piece.layers])
}

// [TINIX] Share the production layer transform with the crop visibility check.
export function renderedLayerTransform(byId: ReadonlyMap<string, PrintLayer>, w: PrintLayer) {
    const x = Number(w.left)
    const y = Number(w.top)
    const ownAngle = parseFloat(String(w.rotate || w.degree || 0))
    const matrix = new DOMMatrix()
    const parents: PrintLayer[] = []
    const seen = new Set([w.uuid])
    let parent = byId.get(w.parent || '')
    while (parent && !seen.has(parent.uuid)) {
      parents.unshift(parent)
      seen.add(parent.uuid)
      parent = byId.get(parent.parent || '')
    }
    for (const group of parents) {
      const angle = parseFloat(String(group.rotate || 0))
      if (angle) matrix.translateSelf(group.left, group.top).rotateSelf(angle).translateSelf(-group.left, -group.top)
    }
    if (ownAngle) matrix.translateSelf(x + w.width / 2, y + w.height / 2).rotateSelf(ownAngle).translateSelf(-x - w.width / 2, -y - w.height / 2)
    return matrix.translateSelf(x, y)
}

// [TINIX] Shared by the isolated cut review and the full-bundle trim check.
const emptyBounds = (): Edges => ({ x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity })

function expandLayerBounds(box: Edges, byId: ReadonlyMap<string, PrintLayer>, layer: PrintLayer) {
  const matrix = renderedLayerTransform(byId, layer)
  for (const [x, y] of [[0, 0], [layer.width, 0], [layer.width, layer.height], [0, layer.height]]) {
    const point = matrix.transformPoint({ x, y })
    box.x = Math.min(box.x, point.x)
    box.y = Math.min(box.y, point.y)
    box.right = Math.max(box.right, point.x)
    box.bottom = Math.max(box.bottom, point.y)
  }
  return box
}

export function renderedLayerBounds(layers: PrintLayer[], targets = layers) {
  const byId = new Map(layers.map(w => [w.uuid, w]))
  return targets.filter(w => !w.isContainer).reduce((box, layer) => expandLayerBounds(box, byId, layer), emptyBounds())
}

export type RenderRegion = { x: number; y: number; width: number; height: number }

// [TINIX] A Blob is passed to fetch without converting the entire JSON string on the UI thread.
let renderBodyWorker: Worker | undefined
let nextRenderBody = 0
function runCropRenderWorker<T>(job: CropRenderJob, signal: AbortSignal): Promise<T | undefined> {
  signal.throwIfAborted()
  try {
    renderBodyWorker ??= new Worker(new URL('./crop-render-body.worker.ts', import.meta.url), { type: 'module' })
    const worker = renderBodyWorker
    const id = ++nextRenderBody
    return new Promise((resolve, reject) => {
      const clean = () => {
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', workerFailed)
        signal.removeEventListener('abort', cancel)
      }
      const unavailable = () => {
        clean()
        resolve(undefined)
      }
      const workerFailed = () => {
        if (renderBodyWorker === worker) renderBodyWorker = undefined
        unavailable()
      }
      const receive = ({ data }: MessageEvent<{ id: number; value?: T }>) => {
        if (data.id !== id) return
        clean()
        resolve(data.value)
      }
      const cancel = () => { clean(); reject(signal.reason) }
      worker.addEventListener('message', receive)
      worker.addEventListener('error', workerFailed)
      signal.addEventListener('abort', cancel, { once: true })
      try { worker.postMessage({ id, job }) }
      catch { unavailable() }
    })
  } catch {
    return Promise.resolve(undefined)
  }
}

// [TINIX] Omit only clipped image widgets whose painted bounds can be determined.
export function regionPreviewLayout(layout: TdLayout, region: RenderRegion): TdLayout {
  const byId = new Map(layout.layers.map(layer => [layer.uuid, layer]))
  const knownRotation = (layer: PrintLayer) => !layer.rotate || layer.rotate === '0' ||
    /^-?(?:\d+\.?\d*|\.\d+)deg$/.test(String(layer.rotate))
  const supported = new Map<string, boolean>()
  function supportedGroup(id?: string, seen = new Set<string>()): boolean {
    if (id === layout.global.uuid || (!id && !layout.global.uuid)) return true
    if (!id || seen.has(id)) return false
    const saved = supported.get(id)
    if (saved !== undefined) return saved
    const group = byId.get(id)
    seen.add(id)
    const safe = !!group?.isContainer && group.type === 'w-group' && !group.transform && knownRotation(group) &&
      supportedGroup(group.parent, seen)
    supported.set(id, safe)
    return safe
  }
  const keep = new Set(layout.layers.filter((layer: PrintLayer) => {
    if (layer.type !== 'w-image' || layer.isContainer || layer.cropEdit || layer.degree ||
      !knownRotation(layer) || !supportedGroup(layer.parent) || layer.effects?.shadow) return true
    const box = expandLayerBounds(emptyBounds(), byId, layer)
    if (!Object.values(box).every(Number.isFinite)) return true
    const padding = 3
    return box.x - padding < region.x + region.width && box.right + padding > region.x &&
      box.y - padding < region.y + region.height && box.bottom + padding > region.y
  }).map(layer => layer.uuid))
  // Keep linked sources in the same order so HQ source substitution stays unchanged.
  for (const id of keep) {
    const source = byId.get(id)?.linkedPhotoId
    if (source && byId.has(source)) keep.add(source)
  }
  return { ...layout, layers: layout.layers.filter(layer => keep.has(layer.uuid)) }
}

async function renderedImageBlob(layout: object, signal: AbortSignal, trimAlpha: boolean, region: RenderRegion | undefined,
  cropPreview: boolean, prepareOffThread: boolean) {
  const payload = { layout, ...(trimAlpha && { trimAlpha }), ...(region && { region }), ...(cropPreview && { cropPreview }) }
  const prepared = cropPreview || prepareOffThread ? await runCropRenderWorker<Blob>({ payload }, signal) : undefined
  signal.throwIfAborted()
  const response = await fetch(config.SCREEN_URL + '/api/tinix/export-render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: prepared ?? JSON.stringify(payload), signal, // [TINIX] Cancellable crop previews.
  })
  if (!response.ok) throw new Error('Piece render failed')
  return response.blob()
}

// [TINIX] Decode preview PNGs directly so the canvas can sample only the thumbnail pixels.
export async function renderedPreviewBitmap(layout: object, signal: AbortSignal, region?: RenderRegion) {
  const blob = await renderedImageBlob(layout, signal, false, region, true, true)
  signal.throwIfAborted()
  return createImageBitmap(blob)
}

// [TINIX] Resize the frame opening before reading its alpha, without a synchronous canvas readback.
export async function readCropMask(url: string, resolution: number, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) return
  return runCropRenderWorker<Uint8ClampedArray>({
    image: await response.blob(), width: resolution, height: resolution, resize: true,
  }, signal)
}

export async function renderedPixels(layout: object, width: number, height: number, signal: AbortSignal, trimAlpha = false, prepareOffThread = false) {
  const blob = await renderedImageBlob(layout, signal, trimAlpha, undefined, false, prepareOffThread)
  if (prepareOffThread) {
    const pixels = await runCropRenderWorker<Uint8ClampedArray>({ image: blob, width, height }, signal)
    if (pixels) return pixels
  }
  const decoded = await readCutoutImage(await readCutoutFile(blob))
  const { canvas, context } = cutoutCanvas(width, height)
  context.drawImage(decoded, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  canvas.width = 0
  return pixels
}

export async function checkCutPiece(page: Page, layers: TdWidgetData[], id: string, limit: number, signal: AbortSignal) {
  const piece = reviewPieceLayers(layers, id)
  if (!piece.unit) throw new Error('Missing print piece')
  const { unit } = piece
  const dpi = Number(page.dpi) || 300
  const scale = 25.4 / dpi
  const area = renderedLayerBounds(piece.layers)
  const pad = Math.ceil(3 / scale)
  const left = Math.floor(area.x) - pad
  const top = Math.floor(area.y) - pad
  const width = Math.ceil(area.right) + pad - left
  const height = Math.ceil(area.bottom) + pad - top
  if (!(width > 0 && height > 0 && width * height <= 12_000_000 && Math.max(width,height) <= 6000)) throw new Error('Invalid piece dimensions')
  const copies = piece.layers.map(w => ({
    ...w, left: w.left - left, top: w.top - top, cutoutBorderUrl: undefined,
    effects: w.effects ? { ...w.effects, shadow: 0, border: 0 } : undefined,
  }))
  const variant = (backgroundColor: string) => ({
    global: { ...page, width, height, backgroundColor, backgroundGradient: '', backgroundImage: '', opacity: 1, referenceGuide: undefined },
    layers: copies,
  })
  const white = await renderedPixels(variant('#fff'), width, height, signal)
  const black = await renderedPixels(variant('#000'), width, height, signal)
  const alpha = alphaFromRenders(new Uint8Array(white.buffer), new Uint8Array(black.buffer), width, height, 4)
  const { canvas, context } = cutoutCanvas(width, height)
  const image = context.createImageData(width,height)
  const visible = { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity }
  const outside = new Set<'left'|'right'|'top'|'bottom'>()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x
    const a = alpha[index]
    const pixel = index * 4
    if (!a) continue
    for (let channel = 0; channel < 3; channel++) image.data[pixel + channel] = black[pixel + channel] * 255 / a
    image.data[pixel + 3] = a
    if (a < 128) continue
    const pageX = x + left
    const pageY = y + top
    visible.x = Math.min(visible.x, pageX); visible.y = Math.min(visible.y, pageY)
    visible.right = Math.max(visible.right, pageX + 1); visible.bottom = Math.max(visible.bottom, pageY + 1)
    if (pageX < 0) outside.add('left')
    if (pageY < 0) outside.add('top')
    if (pageX >= page.width) outside.add('right')
    if (pageY >= page.height) outside.add('bottom')
  }
  const inset = Math.max(0, ...copies.map(w => Number(w.cutInset) || 0))
  // The isolated view retains paths even when the current packing box misses them.
  const placement = { unitId: id, sheet: 0, x: 0, y: 0, width, height, cutInset: inset, cutOuterOnly: unit.cutOuterOnly } // [TINIX]
  const { svg } = buildCutSvg({ alpha, width, height, dpi, placements: [placement] })
  const [row] = inspectCutSheet(svg, [placement], [unit], 1, dpi, limit)
  context.putImageData(image,0,0)
  const preview = canvas.toDataURL()
  canvas.width = 0
  const boxOutside = piece.layers.some(w => w.left < -.5 || w.top < -.5 || w.left + w.width > page.width + .5 || w.top + w.height > page.height + .5)
  const boxMiss = [unit.bounds.x - visible.x, unit.bounds.y - visible.y,
    visible.right - unit.bounds.x - unit.bounds.width, visible.bottom - unit.bounds.y - unit.bounds.height].some(v => v > 6)
  return { row, visible, outside: [...outside], boxOutside, boxMiss, preview, left, top, width, height, scale,
    insetMm: inset ? inset * scale : .3 }
}

export type PieceReview = Awaited<ReturnType<typeof checkCutPiece>>

export function paperPatch(review: PieceReview, group: string, parent: string, name: string,
  shape: { type: 'hole'; points: Pt[] } | { type: 'bridge'; points: [Pt, Pt] }, color: string, limit: number): PrintLayer {
  const widthMm = shape.type === 'hole' ? 2 * review.insetMm + .8 : limit + 2 * review.insetMm + .5
  const expansion = widthMm / 2 + .15
  const { scale } = review
  const x = Math.floor((Math.min(...shape.points.map(p => p[0])) - expansion) / scale)
  const y = Math.floor((Math.min(...shape.points.map(p => p[1])) - expansion) / scale)
  const width = Math.ceil((Math.max(...shape.points.map(p => p[0])) + expansion) / scale) - x
  const height = Math.ceil((Math.max(...shape.points.map(p => p[1])) + expansion) / scale) - y
  const d = 'M' + shape.points.map(([u,v]) => [u / scale - x, v / scale - y].join(' ')).join('L') + (shape.type === 'hole' ? 'Z' : '')
  const svgUrl = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="${shape.type === 'hole' ? color : 'none'}" stroke="${color}" stroke-width="${widthMm / scale}" stroke-linejoin="round" stroke-linecap="round"/></svg>`
  return { ...wSvgSetting, uuid: crypto.randomUUID(), name, left: x + review.left, top: y + review.top, width, height,
    record: { ...wSvgSetting.record, width, height }, svgUrl, colors: [], parent, printGroup: group, printRole: 'raised' } as unknown as PrintLayer
}

export function photoFrameLayer(box: { x: number; y: number; width: number; height: number }, name: string, source: string, parent: string) {
  return { ...wImageSetting, name, left: box.x, top: box.y, width: box.width, height: box.height, parent,
    record: { ...wImageSetting.record, width: box.width, height: box.height }, imgUrl: source, fit: 'cover' }
}
