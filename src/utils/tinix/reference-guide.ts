// [TINIX] Reference art and normalized regions are stored on the draft page.
import { cutoutCanvas, readCutoutFile, readCutoutImage } from './cutout-workspace'

export type ReferenceRegion = { id: string; x: number; y: number; width: number; height: number; layerId?: string }
export type CanvasReferenceGuide = { name: string; image: string; width: number; height: number; regions: ReferenceRegion[] }

type ReferenceLayer = {
  type: string; parent?: string; templateRole?: string; printGroup?: string; slot?: boolean
}

export function isReferenceText(layer: ReferenceLayer) {
  return layer.type === 'w-text' || layer.templateRole === 'text'
}

export function isReferenceLabelBacking(layer: ReferenceLayer, text: ReferenceLayer) {
  return !isReferenceText(layer) && !layer.slot && layer.templateRole !== 'photo' && Boolean(
    (layer.parent && layer.parent !== '-1' && layer.parent === text.parent) ||
    (layer.printGroup && layer.printGroup === text.printGroup))
}

// [TINIX] Penalize a backing sheet only when the region substantially covers
// lettering in that same label. Keep full-sheet matches and unrelated layers geometric.
export function rankReferenceLayers<T extends ReferenceLayer>(
  candidates: { layer: T; coverage: number; layerCoverage: number; score: number }[],
) {
  const textMatches = candidates.flatMap(({ layer, coverage, layerCoverage }, index) =>
    isReferenceText(layer) && coverage >= .6 && layerCoverage >= .4 ? [{ layer, index }] : [])
  return candidates.map((candidate, index) => {
    const { layer, layerCoverage, score } = candidate
    const isBacking = layerCoverage < .97 &&
      textMatches.some(({ layer: text, index: textIndex }) => textIndex > index && isReferenceLabelBacking(layer, text))
    return { layer, score: score - (isBacking ? .3 : 0) }
  }).sort((a, b) => b.score - a.score).map(({ layer }) => layer)
}

// Same centered, aspect-preserving placement as the SVG overlay's xMidYMid meet.
export function referencePageBox(guide: CanvasReferenceGuide, region: ReferenceRegion, page: { width: number; height: number }) {
  const scale = Math.min(page.width / guide.width, page.height / guide.height)
  const x = Math.round((page.width - guide.width * scale) / 2 + region.x * guide.width * scale)
  const y = Math.round((page.height - guide.height * scale) / 2 + region.y * guide.height * scale)
  return { x, y, width: Math.max(1, Math.round((page.width - guide.width * scale) / 2 + (region.x + region.width) * guide.width * scale) - x),
    height: Math.max(1, Math.round((page.height - guide.height * scale) / 2 + (region.y + region.height) * guide.height * scale) - y) }
}

export async function cropReferenceGuide(guide: CanvasReferenceGuide, region: ReferenceRegion) {
  const image = await readCutoutImage(guide.image)
  const left = Math.round(region.x * guide.width)
  const top = Math.round(region.y * guide.height)
  const width = Math.max(1, Math.round((region.x + region.width) * guide.width) - left)
  const height = Math.max(1, Math.round((region.y + region.height) * guide.height) - top)
  const { canvas, context } = cutoutCanvas(width, height)
  context.drawImage(image, left, top, width, height, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Invalid crop')), 'image/png')
  })
  return new File([blob], 'reference-region.png', { type: 'image/png' })
}

export async function loadReferenceGuide(file: File): Promise<CanvasReferenceGuide> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 24 * 1024 ** 2) throw new Error('Invalid reference image')
  const source = await readCutoutImage(await readCutoutFile(file))
  const scale = Math.min(1, 2200 / Math.max(source.naturalWidth, source.naturalHeight))
  const width = Math.max(1, Math.round(source.naturalWidth * scale))
  const height = Math.max(1, Math.round(source.naturalHeight * scale))
  const { canvas, context } = cutoutCanvas(width, height)
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, 0, 0, width, height)
  return { name: file.name, image: canvas.toDataURL('image/jpeg', 0.92), width, height, regions: [] }
}
