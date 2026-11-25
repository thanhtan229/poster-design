// [TINIX] Sample the actual rendered alpha of layers that can cover a photo.
import type { TdWidgetData } from '@/store/design/widget'
import { renderedLayerBounds, renderedLayerTransform, renderedPixels } from './cut-piece-review'
import { resolveLinkedImage } from './image-effects'

export type FaceOcclusion = {
  blocked: (x: number, y: number) => boolean
  layerAt: (x: number, y: number) => boolean
  paperOnly: (points: readonly { x: number; y: number }[], signal: AbortSignal) => Promise<boolean>
  pickLayer: (x: number, y: number, signal: AbortSignal) => Promise<string | undefined>
}

export async function faceCropOcclusion(
  page: { uuid: string; width: number; height: number },
  layers: TdWidgetData[],
  frame: TdWidgetData,
  signal: AbortSignal,
): Promise<FaceOcclusion> {
  return planFaceCropOcclusion(page, layers, frame).evaluate(signal)
}

// [TINIX] The plan fingerprints the same inputs that are rendered into the occlusion mask.
export function planFaceCropOcclusion(
  page: { uuid: string; width: number; height: number },
  layers: TdWidgetData[],
  frame: TdWidgetData,
  prepareOffThread = false,
): { signature: (serialize?: (value: unknown) => string) => string; evaluate: (signal: AbortSignal) => Promise<FaceOcclusion> } {
  const byId = new Map(layers.map(layer => [layer.uuid, layer]))
  const children = new Map<string, TdWidgetData[]>()
  for (const layer of layers) {
    if (layer.parent === undefined) continue
    const siblings = children.get(layer.parent) ?? []
    siblings.push(layer)
    children.set(layer.parent, siblings)
  }
  const frameBounds = renderedLayerBounds(layers, [frame])
  const left = Math.max(0, Math.floor(frameBounds.x))
  const top = Math.max(0, Math.floor(frameBounds.y))
  const width = Math.min(page.width, Math.ceil(frameBounds.right)) - left
  const height = Math.min(page.height, Math.ceil(frameBounds.bottom)) - top
  if (width <= 0 || height <= 0) {
    return {
      signature: () => 'outside',
      evaluate: async () => ({ blocked: () => true, layerAt: () => false, paperOnly: async () => false, pickLayer: async () => undefined }),
    }
  }
  if (width * height > 12_000_000 || Math.max(width, height) > 6000) throw new Error('Photo occlusion render limit')

  const selected = new Set<string>()
  const contributors: { layer: TdWidgetData; ancestors: string[]; bounds: ReturnType<typeof renderedLayerBounds>; bleed: number }[] = []
  let afterFrame = false
  function visit(parent: string, ancestors: string[] = []) {
    for (const layer of children.get(parent) ?? []) {
      if (layer.uuid === frame.uuid) {
        afterFrame = true
        continue
      }
      if (layer.hidden || layer.opacity === 0 || ancestors.includes(layer.uuid)) continue
      if (layer.isContainer) {
        visit(layer.uuid, [...ancestors, layer.uuid])
      } else if (afterFrame) {
        const bounds = renderedLayerBounds(layers, [layer])
        const bleed = 2 + 3 * Math.max(0, Number(layer.effects?.shadow) || 0, Number(layer.effects?.blur) || 0,
          Number(layer.effects?.border) || 0)
        if (bounds.right + bleed > left && bounds.x - bleed < left + width &&
            bounds.bottom + bleed > top && bounds.y - bleed < top + height) {
          selected.add(layer.uuid)
          ancestors.forEach(id => selected.add(id))
          contributors.push({ layer, ancestors, bounds, bleed })
        }
      }
    }
  }
  visit(page.uuid)
  if (!afterFrame) throw new Error('Photo not found in the page stack')

  const frameToPage = renderedLayerTransform(byId, frame)
  const framePrintGroup = (frame as TdWidgetData & { printGroup?: string }).printGroup
  // [TINIX] Material frames carry a same-size paper artwork sibling in their print group.
  const framePaper = new Set(contributors.filter(({ layer }) => {
    const paper = layer as TdWidgetData & { printGroup?: string; fit?: string; slot?: boolean }
    return framePrintGroup && paper.printGroup === framePrintGroup && paper.parent === frame.parent &&
      paper.type === 'w-image' && paper.fit === 'fill' && !paper.slot && paper.left === frame.left &&
      paper.top === frame.top && paper.width === frame.width && paper.height === frame.height
  }).map(({ layer }) => layer.uuid))
  // [TINIX] Store effective sources so a change in a linked photo invalidates the mask.
  const effectiveLayers = layers.filter(layer => selected.has(layer.uuid)).map(layer => {
    const source = resolveLinkedImage(layer, layers)
    return {
      ...layer,
      ...(source !== layer && { linkedPhotoId: undefined, imgUrl: source.imgUrl, origin: source.origin }),
    }
  })
  function render(ids: ReadonlySet<string>, area: { left: number; top: number; width: number; height: number }, abort: AbortSignal) {
    const copies = effectiveLayers.filter(layer => ids.has(layer.uuid))
      .map(layer => ({ ...layer, left: layer.left - area.left, top: layer.top - area.top }))
    return renderedPixels({
      global: { ...page, width: area.width, height: area.height, opacity: 1, referenceGuide: undefined },
      layers: copies,
    }, area.width, area.height, abort, true, prepareOffThread)
  }
  const signature = (serialize = JSON.stringify) => serialize([
    page, left, top, width, height, frame.width, frame.height, frameToPage.toFloat64Array(), [...framePaper],
    effectiveLayers.map(({ record: _record, ...layer }) => ({
      ...layer, transform: layer.transform?.trim() === 'scale(1)' ? '' : layer.transform?.trim(),
    })),
  ])
  async function evaluate(signal: AbortSignal): Promise<FaceOcclusion> {
    const pixels = selected.size ? await render(selected, { left, top, width, height },
      AbortSignal.any([signal, AbortSignal.timeout(45000)])) : undefined

    function alphaAt(x: number, y: number) {
      const col = Math.floor(frameToPage.a * x + frameToPage.c * y + frameToPage.e - left)
      const row = Math.floor(frameToPage.b * x + frameToPage.d * y + frameToPage.f - top)
      if (col < 0 || col >= width || row < 0 || row >= height) return -1
      return pixels?.[(row * width + col) * 4 + 3] ?? 0
    }
    // Keep a small gap around the face so a mask or sticker edge does not graze it.
    const margin = Math.max(2, Math.min(frame.width, frame.height) * 0.025)
    const covered = (x: number, y: number) => {
      const alpha = alphaAt(x, y)
      return alpha === -1 || alpha >= 128
    }
    // [TINIX] Keep a small number of auxiliary masks for this unchanged occlusion plan.
    const paperMasks = new Map<string, Uint8ClampedArray>()
    return {
      blocked: (x, y) => covered(x, y) || covered(x - margin, y) || covered(x + margin, y) ||
        covered(x, y - margin) || covered(x, y + margin),
      layerAt: (x, y) => alphaAt(x, y) >= 128,
      async paperOnly(points, paperSignal) {
        paperSignal.throwIfAborted()
        if (!points.length || !framePaper.size) return false
        const sample = points.map(point => frameToPage.transformPoint(point))
        const other = new Set<string>()
        for (const { layer, ancestors, bounds, bleed } of contributors) {
          if (framePaper.has(layer.uuid)) continue
          if (!sample.some(({ x, y }) => x >= bounds.x - bleed && x < bounds.right + bleed &&
              y >= bounds.y - bleed && y < bounds.bottom + bleed)) continue
          other.add(layer.uuid)
          ancestors.forEach(id => other.add(id))
        }
        if (!other.size) return true
        const key = JSON.stringify([...other].sort())
        let data = paperMasks.get(key)
        if (!data) {
          data = await render(other, { left, top, width, height },
            AbortSignal.any([paperSignal, AbortSignal.timeout(25000)]))
          paperSignal.throwIfAborted()
          const oldest = paperMasks.keys().next().value
          if (paperMasks.size >= 2 && oldest !== undefined) paperMasks.delete(oldest)
          paperMasks.set(key, data)
        }
        // A faint translucent label still counts as an independent overlay.
        return sample.every(({ x, y }) => data[((Math.floor(y) - top) * width + Math.floor(x) - left) * 4 + 3] < 16)
      },
      async pickLayer(x, y, pickSignal) {
        const point = frameToPage.transformPoint({ x, y })
        const abort = AbortSignal.any([pickSignal, AbortSignal.timeout(25000)])
        const radius = 16
        const size = radius * 2
        // [TINIX] Inspect top to bottom and sample actual alpha, not a transparent sticker's box.
        let fallback: { id: string; opacity: number } | undefined
        for (const { layer, ancestors, bounds, bleed } of [...contributors].reverse()) {
          if (point.x < bounds.x - bleed || point.x >= bounds.right + bleed ||
              point.y < bounds.y - bleed || point.y >= bounds.bottom + bleed) continue
          const data = await render(new Set([layer.uuid, ...ancestors]), {
            left: Math.floor(point.x) - radius, top: Math.floor(point.y) - radius, width: size, height: size,
          }, abort)
          const opacity = data[(radius * size + radius) * 4 + 3]
          if (opacity >= 128) return layer.uuid
          if (opacity && (!fallback || opacity > fallback.opacity)) fallback = { id: layer.uuid, opacity }
        }
        return fallback?.id
      },
    }
  }
  return { signature, evaluate }
}
