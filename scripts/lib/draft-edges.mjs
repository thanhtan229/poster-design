// [TINIX] Batch edge inspection for design rule 5.6. This checks each asset in isolation.
import { createRequire } from 'node:module'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const edgePixels = 2
const alphaThreshold = 8
const maxPixels = 25_000_000

function parseDataImage(url) {
  const match = /^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i.exec(url)
  if (!match) throw new Error('Invalid image data URL')
  return match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
}

async function assetFor(layer, readAsset) {
  if (layer.type === 'w-svg' && /^\s*<svg\b/i.test(layer.svgUrl || '')) {
    return Buffer.from(layer.svgUrl.replace(/\{\{colors\[(\d+)\]\}\}/g, (token, index) => {
      // Only substitute CSS colors, never markup into an SVG attribute.
      const color = layer.colors?.[index]
      if (typeof color !== 'string' || !/^(?:#[a-f\d]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i.test(color)) {
        throw new Error(`Invalid SVG color at index ${index}`)
      }
      return color
    }))
  }
  const src = layer.type === 'w-svg' ? layer.svgUrl : layer.imgUrl
  if (typeof src !== 'string' || !src) throw new Error('Missing image source')
  return src.startsWith('data:') ? parseDataImage(src) : readAsset(src)
}

async function scan(layer, readAsset) {
  const width = Math.max(1, Math.round(layer.width))
  const height = Math.max(1, Math.round(layer.height))
  if (!Number.isFinite(width * height) || width * height > maxPixels) throw new Error('Layer exceeds the edge check pixel limit')
  const input = sharp(await assetFor(layer, readAsset), { limitInputPixels: maxPixels })
  const { format, hasAlpha } = await input.metadata()
  if (!hasAlpha && format !== 'svg') return { result: 'opaque', format }
  // Render to the layer's design size before counting pixels so 2 px means 2 design pixels.
  // Check source alpha; CSS masks, rotation, and page overlap belong in the final page review.
  const { data, info } = await input.resize(width, height, { fit: 'fill' }).ensureAlpha()
    .toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  const sides = { top: 0, right: 0, bottom: 0, left: 0 }
  let visible = 0, transparent = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * info.channels + info.channels - 1]
      if (alpha < 255) transparent++
      if (alpha <= alphaThreshold) continue
      visible++
      if (y < edgePixels) sides.top++
      if (x >= width - edgePixels) sides.right++
      if (y >= height - edgePixels) sides.bottom++
      if (x < edgePixels) sides.left++
    }
  }
  if (!transparent && format !== 'svg') return { result: 'opaque', format }
  const reasons = []
  if (!visible) reasons.push('EMPTY_ASSET')
  if (Object.values(sides).some(Boolean)) reasons.push('ALPHA_NEAR_EDGE')
  // The draft does not reliably distinguish extracted PNGs from generated PNGs.
  if (format === 'png' && visible) reasons.push('PNG_PROVENANCE_REVIEW')
  return { result: reasons.length ? 'review' : 'clear', format, sides, reasons }
}

export async function checkDraftEdges(layout, readAsset) {
  const layers = []
  for (const layer of layout.layers) {
    if (!['w-svg', 'w-image'].includes(layer.type) || layer.hidden || layer.opacity === 0 || layer.slot ||
        layer.templateRole === 'photo' || layer.printRole === 'base') continue
    const info = { id: layer.uuid, name: layer.name || layer.uuid, type: layer.type }
    try {
      layers.push({ ...info, ...await scan(layer, readAsset) })
    } catch (error) {
      layers.push({ ...info, result: 'review', reasons: ['ASSET_UNCHECKED'], error: error.message })
    }
  }
  const review = layers.filter(layer => layer.result === 'review')
  return { edgePixels, alphaThreshold, checked: layers.length, skipped: layout.layers.length - layers.length, reviewCount: review.length, review, layers }
}
