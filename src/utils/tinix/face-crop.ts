// [TINIX] Suggest a crop that keeps the detected face group inside the frame mask.
import config from '@/config'
import { shallowRef } from 'vue'
import type { TdWidgetData } from '@/store/design/widget'
import { coverMinZoom, coversFrame, cropForTopLeft, frameRotation, imageRect, MAX_FRAME_ZOOM, minFrameZoom } from './photo-frame'
import { faceCropOcclusion, type FaceOcclusion, type planFaceCropOcclusion } from './face-crop-occlusion'
import { readCropMask } from './cut-piece-review' // [TINIX]
import { readCutoutFile } from './cutout-workspace' // [TINIX]

type FaceBox = [number, number, number, number]
type Size = { width: number; height: number }
type Point = { x: number; y: number }
// [TINIX] Rectangle in normalized coordinates of the original photo.
export type CropDetailRegion = { left: number; top: number; right: number; bottom: number }
type Suggestion = { fit: 'cover' | 'contain'; cropX: number; cropY: number; zoom: number; total: number; visible: number; avoidedPaper?: boolean }
type CropGuide = { highlight: string; anchor: Point; delta?: Point; pickPoint?: Point; targetCrop?: { cropX: number; cropY: number } }
export const faceGuideResolution = 128
export type FaceCropCheck = Awaited<ReturnType<typeof prepareFaceCrop>>
// [TINIX] One-shot handoff from batch review to the active photo editor.
export const faceCropHandoff = shallowRef<{ id: string; check: FaceCropCheck }>()

// [TINIX] Share detection, mask and layer checks between single-frame and batch review.
export async function checkFrameFaces(
  page: Parameters<typeof faceCropOcclusion>[0],
  layers: TdWidgetData[],
  frame: TdWidgetData,
  image: HTMLImageElement,
  signal: AbortSignal,
  onLayers?: () => void,
  previewWithoutFaces = false,
  cached?: { faces?: FaceBox[]; plan: ReturnType<typeof planFaceCropOcclusion>; mask?: FaceOcclusion },
) {
  await image.decode()
  signal.throwIfAborted()
  const faces = cached?.faces ?? await detectPhotoFaces(image, signal)
  signal.throwIfAborted()
  if (!faces.length && !previewWithoutFaces) return
  onLayers?.()
  const natural = { width: image.naturalWidth, height: image.naturalHeight }
  async function build(currentPage: typeof page, currentLayers: TdWidgetData[], currentFrame: TdWidgetData, abort: AbortSignal,
    plan?: ReturnType<typeof planFaceCropOcclusion>) {
    const mask = await (plan ? plan.evaluate(abort) : faceCropOcclusion(currentPage, currentLayers, currentFrame, abort))
    return { ...await prepareFaceCrop(currentFrame, natural, faces, mask, plan ? abort : undefined), mask }
  }
  const mask = cached?.mask ?? await (cached
    ? cached.plan.evaluate(signal)
    : faceCropOcclusion(page, layers, frame, signal))
  const check = await prepareFaceCrop(frame, natural, faces, mask, cached ? signal : undefined)
  return { ...check, faces, mask, rebuild: build }
}

export async function detectPhotoFaces(image: HTMLImageElement, signal: AbortSignal): Promise<FaceBox[]> {
  const factor = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  const width = Math.max(1, Math.round(image.naturalWidth * factor))
  canvas.width = width
  canvas.height = Math.max(1, Math.round(image.naturalHeight * factor))
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  let encoded: string
  try {
    encoded = canvas.toDataURL('image/jpeg', 0.88)
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error
    const original = await fetch(image.currentSrc || image.src, { signal })
    if (!original.ok) throw error
    const bitmap = await createImageBitmap(await original.blob())
    try {
      canvas.width = width // Reset the origin-clean flag before drawing the CORS response.
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      encoded = canvas.toDataURL('image/jpeg', 0.88)
    } finally {
      bitmap.close()
    }
  }
  const response = await fetch(`${config.SCREEN_URL}/api/tinix/photo-faces`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: encoded }), signal,
  })
  if (!response.ok) throw new Error('Face detection unavailable')
  return (await response.json()).faces
}

// [TINIX] Frame alpha is independent of the crop and can be kept for immutable sources.
const frameMaskPixels = new Map<string, Uint8ClampedArray>()
async function frameVisibility(frame: Size & { mask?: string }, signal?: AbortSignal) {
  const { width, height, mask } = frame
  let alpha: Uint8ClampedArray | undefined
  const resolution = 192
  if (mask) {
    const immutable = mask.startsWith('data:') || mask.startsWith('blob:')
    if (immutable) alpha = frameMaskPixels.get(mask)
    if (!alpha && signal) {
      alpha = await readCropMask(mask, resolution, signal).catch(() => undefined)
      signal.throwIfAborted()
    }
    if (!alpha) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = mask
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = resolution
      canvas.height = resolution
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0, resolution, resolution)
      alpha = ctx.getImageData(0, 0, resolution, resolution).data
    }
    if (immutable && !frameMaskPixels.has(mask)) {
      const oldest = frameMaskPixels.keys().next().value
      if (oldest !== undefined && frameMaskPixels.size >= 32) frameMaskPixels.delete(oldest)
      frameMaskPixels.set(mask, alpha)
    }
  }
  return (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height &&
    (!alpha || alpha[(Math.floor(y / height * resolution) * resolution + Math.floor(x / width * resolution)) * 4 + 3] >= 224)
}

export async function prepareFaceCrop(frame: any, natural: Size, faces: FaceBox[], occlusion: FaceOcclusion, signal?: AbortSignal) {
  const inside = await frameVisibility(frame, signal)
  const midX = frame.width / 2
  const midY = frame.height / 2
  const outline = faces.map(([left, top, right, bottom]): Point[] => {
    // Protect the facial oval. Hair and the empty corners of a detection box can touch the mask.
    const center = { x: (left + right) / 2, y: (top + bottom) / 2 }
    return [center, ...[0.22, 0.5].flatMap(radius => Array.from({ length: 16 }, (_, index) => {
      const direction = index * Math.PI / 8
      return {
        x: center.x + (right - left) * radius * Math.cos(direction),
        y: center.y + (bottom - top) * radius * Math.sin(direction),
      }
    }))]
  })
  function geometry(crop: any) {
    const rect = imageRect(crop, natural)
    const angle = frameRotation(crop) * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const flipX = crop.flip === 'Y' ? -1 : 1
    const flipY = crop.flip === 'X' ? -1 : 1
    return {
      rect,
      move: (x: number, y: number) => ({ x: (x * cos - y * sin) * flipX, y: (x * sin + y * cos) * flipY }),
      project(point: Point) {
        const shift = this.move(rect.x + point.x * rect.width - midX, rect.y + point.y * rect.height - midY)
        return { x: midX + shift.x, y: midY + shift.y }
      },
      unproject(x: number, y: number) {
        const dx = (x - midX) * flipX
        const dy = (y - midY) * flipY
        return {
          x: (midX + dx * cos + dy * sin - rect.x) / rect.width,
          y: (midY - dx * sin + dy * cos - rect.y) / rect.height,
        }
      },
    }
  }
  function score(crop: any) {
    const mapping = geometry(crop)
    let retained = 0
    let visibleSamples = 0
    for (const points of outline) {
      const count = points.filter(point => {
        const { x, y } = mapping.project(point)
        return inside(x, y) && !occlusion.blocked(x, y)
      }).length
      if (count === points.length) retained++
      visibleSamples += count
    }
    return { retained, rank: retained * 100 + 10 * visibleSamples / (outline.length * outline[0].length) }
  }
  function baseSuggestion(): Suggestion | undefined {
    let best: Suggestion | undefined
    let bestRank = -Infinity
    const angle = frameRotation({ ...frame, fit: 'cover' })
    const fitZooms = [1]
    const existingZoom = Number(frame.zoom)
    if (frame.fit === 'contain' && existingZoom >= minFrameZoom(frame) && existingZoom < 1) fitZooms.push(existingZoom)
    const attempts = [{ fit: 'cover' as const, baseZoom: 1 }, ...fitZooms.map(baseZoom => ({ fit: 'contain' as const, baseZoom }))]
    for (const { fit, baseZoom } of attempts) {
      if (fit === 'contain' && baseZoom === 1) bestRank = -Infinity
      for (let cropY = 0; cropY <= 100; cropY += 2) {
        for (let cropX = 0; cropX <= 100; cropX += 2) {
          const zoom = fit === 'cover' && angle ? coverMinZoom({ ...frame, cropX, cropY }, natural, angle) : baseZoom
          if (zoom > MAX_FRAME_ZOOM) continue
          const { retained, rank } = score({ ...frame, fit, cropX, cropY, zoom })
          const bias = Math.hypot(cropX - 50, cropY - 50) / 100 + Math.abs(zoom - 1)
          if (rank - bias > bestRank) {
            best = { fit, cropX, cropY, zoom, total: faces.length, visible: retained }
            bestRank = rank - bias
          }
        }
      }
      if (best?.visible === faces.length) return best
    }
    return best
  }
  // [TINIX] Recompute after each pan/scale using the same rendered layer alpha.
  const resolution = faceGuideResolution
  let occludedPixels: (Point & { col: number; row: number })[] | undefined
  function faceOcclusionSamples() {
    if (!occludedPixels) {
      occludedPixels = []
      for (let row = 0; row < resolution; row++) {
        for (let col = 0; col < resolution; col++) {
          const x = (col + 0.5) / resolution * frame.width
          const y = (row + 0.5) / resolution * frame.height
          if (inside(x, y) && occlusion.layerAt(x, y)) occludedPixels.push({ x, y, col, row })
        }
      }
    }
    return occludedPixels
  }
  function overlapsFace(crop: ReturnType<typeof geometry>, { x, y }: Point) {
    const point = crop.unproject(x, y)
    return faces.some(([left, top, right, bottom]) =>
      ((2 * point.x - left - right) / (right - left)) ** 2 +
      ((2 * point.y - top - bottom) / (bottom - top)) ** 2 <= 1)
  }
  function overlap(crop: ReturnType<typeof geometry>) {
    return faceOcclusionSamples().filter(point => overlapsFace(crop, point))
  }
  function isClear(crop: any) {
    if (!faces.length) return true
    if (score(crop).retained !== faces.length) return false
    const mapping = geometry(crop)
    return !faceOcclusionSamples().some(point => overlapsFace(mapping, point))
  }
  // [TINIX] Polish only a paper-edge conflict, preserving clean crops and independent decorations.
  async function suggest(signal: AbortSignal): Promise<Suggestion | undefined> {
    const best = baseSuggestion()
    if (!best) return
    const remaining = overlap(geometry({ ...frame, ...best }))
    const conflict = remaining.length ? remaining : overlap(geometry(frame))
    if (!conflict.length) return best
    const paperOnly = await occlusion.paperOnly(conflict, signal).catch(() => false)
    signal.throwIfAborted()
    if (!paperOnly) return best
    // [TINIX] Fit changes the available travel on both axes. Search the whole
    // anchor range again at each scale, including positions at the frame edge.
    const anchors = Array.from({ length: 51 }, (_, index) => index * 2)
    const positions = anchors.flatMap(cropX => anchors.map(cropY => ({ cropX, cropY })))
      .sort((a, b) => Math.hypot(a.cropX - best.cropX, a.cropY - best.cropY) - Math.hypot(b.cropX - best.cropX, b.cropY - best.cropY))
    const start = Math.min(98, Math.floor((Number(frame.zoom) || 1) * 100 + 1e-6))
    for (let percent = start; percent >= 85; percent--) {
      signal.throwIfAborted()
      const zoom = percent / 100
      for (const { cropX, cropY } of positions) {
        const suggestion = { ...best, fit: 'contain' as const, cropX, cropY, zoom }
        const candidate = { ...frame, ...suggestion }
        if (score(candidate).retained !== faces.length || overlap(geometry(candidate)).length) continue
        return { ...suggestion, visible: faces.length, avoidedPaper: true }
      }
    }
    return best
  }
  function guide(crop: any): CropGuide | undefined {
    const baseline = score(crop)
    const mapping = geometry(crop)
    const pixels = overlap(mapping)
    if (baseline.retained === faces.length && !pixels.length) return
    let anchor = { x: midX, y: midY }
    let highlight = ''
    let pickPoint: Point | undefined
    if (pixels.length) {
      let sumX = 0
      let sumY = 0
      // [TINIX] A clickable SVG path follows the red pixels, including gaps in the sticker.
      let run = 0
      for (let index = 0; index < pixels.length; index++) {
        const pixel = pixels[index]
        const next = pixels[index + 1]
        sumX += pixel.x
        sumY += pixel.y
        if (next?.row === pixel.row && next.col === pixel.col + 1) continue
        const length = index - run + 1
        highlight += `M${pixels[run].col},${pixel.row}h${length}v1h-${length}z`
        run = index + 1
      }
      anchor = { x: sumX / pixels.length, y: sumY / pixels.length }
      pickPoint = pixels.reduce((nearest, point) => Math.hypot(point.x - anchor.x, point.y - anchor.y) <
        Math.hypot(nearest.x - anchor.x, nearest.y - anchor.y) ? point : nearest, pixels[0])
    }
    const rect = mapping.rect
    const zoom = Math.max(minFrameZoom(crop), Number(crop.zoom) || 1)
    let rank = baseline.rank
    let delta: Point | undefined
    let targetCrop: CropGuide['targetCrop']
    for (const fraction of [0.04, 0.10, 0.20, 0.40]) {
      const step = Math.min(frame.width, frame.height) * fraction
      for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4
        const next = cropForTopLeft(crop, natural, zoom, rect.x + step * Math.cos(angle), rect.y + step * Math.sin(angle))
        if (!coversFrame(crop, natural, next, zoom)) continue
        const candidate = { ...crop, ...next }
        const target = imageRect(candidate, natural)
        const move = mapping.move(target.x - rect.x, target.y - rect.y)
        if (Math.hypot(move.x, move.y) < 2) continue
        const nextRank = score(candidate).rank
        if (nextRank <= rank) continue
        const remaining = overlap(geometry(candidate)).length
        if (pixels.length ? remaining >= pixels.length : remaining > 0) continue
        rank = nextRank
        delta = move
        targetCrop = next
      }
    }
    return { highlight, anchor, delta, pickPoint, targetCrop }
  }
  // [TINIX] Classify each source point once so previews and detail reports agree.
  function sourceVisibility(crop: any) {
    const mapping = geometry(crop)
    return (x: number, y: number) => {
      const point = mapping.project({ x, y })
      if (!inside(point.x, point.y)) return 'clipped'
      return occlusion.layerAt(point.x, point.y) ? 'covered' : 'visible'
    }
  }
  function detailVisibility(crop: any, region: CropDetailRegion, limit = 160) {
    const width = region.right - region.left
    const height = region.bottom - region.top
    const columns = Math.max(1, Math.min(limit, Math.ceil(width * natural.width)))
    const rows = Math.max(1, Math.min(limit, Math.ceil(height * natural.height)))
    const classify = sourceVisibility(crop)
    const samples = { clipped: 0, covered: 0, visible: 0 }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        samples[classify(region.left + (col + 0.5) * width / columns,
          region.top + (row + 0.5) * height / rows)]++
      }
    }
    const total = rows * columns
    return { clipped: samples.clipped / total, covered: samples.covered / total }
  }
  // [TINIX] Optimize the marked detail only among crops that keep every face clear.
  function suggestForDetail(baseline: any, region: CropDetailRegion) {
    const initial = detailVisibility(baseline, region)
    const originalLoss = initial.clipped + initial.covered
    if (!originalLoss || !isClear(baseline)) return
    const origin = geometry(baseline).rect
    const anchors = Array.from({ length: 26 }, (_, index) => index * 4)
    const horizontal = new Set([...anchors, baseline.cropX ?? 50])
    const vertical = new Set([...anchors, baseline.cropY ?? 50])
    const baselineZoom = Number(baseline.zoom) || 1
    const attempts = [
      { fit: 'cover' as const, zoom: 1 },
      ...Array.from({ length: 9 }, (_, index) => ({ fit: 'contain' as const, zoom: (100 - index * 2) / 100 })),
    ]
    if (!attempts.some(({ fit, zoom }) => fit === baseline.fit && zoom === baselineZoom)) {
      attempts.push({ fit: baseline.fit, zoom: baselineZoom })
    }
    const candidates = []
    for (const { fit, zoom } of attempts) {
      if (zoom < minFrameZoom({ ...baseline, fit })) continue
      for (const cropX of horizontal) {
        for (const cropY of vertical) {
          const crop = { ...baseline, fit, cropX, cropY, zoom }
          const mapping = geometry(crop)
          if (fit === 'cover' && !coversFrame(crop, natural, crop, zoom)) continue
          const { clipped, covered } = detailVisibility(crop, region, 10)
          const change = Math.abs(mapping.rect.width - origin.width) + Math.hypot(mapping.rect.x - origin.x, mapping.rect.y - origin.y)
          candidates.push({ fit, cropX, cropY, zoom, lost: clipped + covered, change })
        }
      }
    }
    candidates.sort((a, b) => a.lost - b.lost || a.change - b.change)
    let best: Pick<Suggestion, 'fit' | 'cropX' | 'cropY' | 'zoom'> | undefined
    let loss = originalLoss
    let inspected = 0
    for (const { fit, cropX, cropY, zoom } of candidates) {
      const crop = { ...baseline, fit, cropX, cropY, zoom }
      if (!isClear(crop)) continue
      const { clipped, covered } = detailVisibility(crop, region)
      if (clipped + covered < loss) {
        best = { fit, cropX, cropY, zoom }
        loss = clipped + covered
      }
      if (++inspected === 64 || loss === 0) break
    }
    return best
  }
  // [TINIX] Project original-image pixels into the actual opening and its overlying artwork.
  function safeAreaCanvas(crop: any, image: HTMLImageElement, maxEdge: number, readBack = false) {
    const ratio = Math.min(1, maxEdge / Math.max(natural.width, natural.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(natural.width * ratio))
    canvas.height = Math.max(1, Math.round(natural.height * ratio))
    const ctx = canvas.getContext('2d', { willReadFrequently: readBack })!
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const classify = sourceVisibility(crop)
    const tint = ctx.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const visible = classify((x + 0.5) / canvas.width, (y + 0.5) / canvas.height)
        if (visible === 'visible') continue
        const clipped = visible === 'clipped'
        const index = (y * canvas.width + x) * 4
        tint.data[index] = clipped ? 20 : 245
        tint.data[index + 1] = clipped ? 28 : 84
        tint.data[index + 2] = clipped ? 42 : 39
        tint.data[index + 3] = clipped ? 160 : 142
      }
    }
    const overlay = document.createElement('canvas')
    overlay.width = canvas.width
    overlay.height = canvas.height
    overlay.getContext('2d')!.putImageData(tint, 0, 0)
    ctx.drawImage(overlay, 0, 0)
    return canvas
  }
  return {
    suggest, suggestForDetail, guide, count: faces.length, pickLayer: occlusion.pickLayer,
    isClear, detailVisibility,
    safeAreaPreview(crop: any, image: HTMLImageElement, maxEdge = 960) {
      return safeAreaCanvas(crop, image, maxEdge).toDataURL('image/png')
    },
    // [TINIX] PNG encoding of the review overlay can finish asynchronously.
    encodeSafeArea(crop: any, image: HTMLImageElement, maxEdge: number) {
      const canvas = safeAreaCanvas(crop, image, maxEdge, true)
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Cannot encode crop overlay')), 'image/png')
      }).then(readCutoutFile)
    },
    // [TINIX] Measure only the visible opening, excluding paper and decorations above it.
    exposedPercent(crop: any) {
      const mapping = geometry(crop)
      let visible = 0
      let exposed = 0
      for (let row = 0; row < resolution; row++) {
        for (let col = 0; col < resolution; col++) {
          const x = (col + 0.5) / resolution * frame.width
          const y = (row + 0.5) / resolution * frame.height
          if (!inside(x, y) || occlusion.layerAt(x, y)) continue
          visible++
          const p = mapping.unproject(x, y)
          if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) exposed++
        }
      }
      return visible ? Math.round(exposed / visible * 100) : undefined
    },
  }
}
