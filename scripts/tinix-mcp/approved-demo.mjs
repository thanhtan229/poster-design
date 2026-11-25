// [TINIX] Compare the saved import render to a separately approved demo.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { compareToReference, drawSideBySide } from '../lib/reference-build.mjs'
import { renderLayerMasks } from '../lib/reference-layer-masks.mjs'
import { materialRenderService } from './draft-render.mjs'
import { readMaterialJob } from './subject-edit.mjs'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const maxPixels = 32000000
const maxSide = 1400

export async function compareApprovedDemo(root, jobId, file, signal) {
  const { layout, report, png, subject } = await readMaterialJob(root, jobId)
  const slots = report.photoSlots
  if (report.sourceJobId || !subject || !Array.isArray(slots) || slots.length !== 6) {
    throw new Error('Dùng mã bản nháp nhập ZIP có sáu khung và SUBJECT, trước khi gắn ảnh khách.')
  }
  const byId = new Map(layout.layers.map(layer => [layer.uuid, layer]))
  const frameParents = new Map(slots.map(slot => [byId.get(slot.id)?.parent, slot.code]))
  if (frameParents.size !== 6 || frameParents.has(undefined) ||
      slots.some(slot => !byId.get(slot.id)?.mask || byId.get(slot.id)?.templateRole !== 'photo')) {
    throw new Error('Không xác định được mặt nạ của sáu khung ảnh.')
  }

  const input = await readFile(file)
  const photo = sharp(input, { limitInputPixels: maxPixels })
  const metadata = await photo.metadata().catch(() => undefined)
  if (!metadata || !['png', 'jpeg', 'webp'].includes(metadata.format) ||
      metadata.width * metadata.height > maxPixels || (metadata.pages ?? 1) > 1) {
    throw new Error('Ảnh demo cần là PNG, JPEG hoặc WebP tĩnh, tối đa 32 triệu pixel.')
  }
  const { data: raw, info: { width, height } } = await photo.rotate().flatten({ background: '#ffffff' }).toColourspace('srgb')
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true })
  const ref = { raw, width, height }
  const { referenceGuide, ...global } = layout.global
  if (Math.abs((width / height) / (global.width / global.height) - 1) > 0.02) {
    throw new Error('Ảnh demo và bản nháp lệch tỷ lệ trang trên 2%. Hãy dùng ảnh demo toàn trang đã duyệt.')
  }
  signal.throwIfAborted()
  const masks = await renderLayerMasks(materialRenderService(), { ...layout, global }, ref, signal)
  const seen = new Set(masks.layers.filter(layer => layer.placeholder).map(layer => layer.id))
  if (!seen.has(subject.uuid) || slots.some(slot => !seen.has(slot.id))) {
    throw new Error('Trình render chưa đọc đủ mặt nạ của F01–F06 và SUBJECT.')
  }
  const comparison = await compareToReference(ref, png, undefined, masks)
  if (!comparison.overall.pixels) throw new Error('Không còn vùng nền hoặc trang trí để đối chiếu.')
  const layers = comparison.layers.filter(layer => layer.status === 'scored').map(layer => {
    const frame = frameParents.get(byId.get(layer.id)?.parent)
    return { ...layer, group: frame ? 'frameArtwork' : 'decorations', ...(frame && { frame }) }
  })
  const groups = [
    { group: 'background', ...comparison.background },
    ...['frameArtwork', 'decorations'].map(group => {
      const members = layers.filter(layer => layer.group === group)
      const pixels = members.reduce((sum, layer) => sum + layer.pixels, 0)
      const mae = pixels ? +(members.reduce((sum, layer) => sum + layer.mae * layer.pixels, 0) / pixels).toFixed(1) : null
      return { group, pixels, mae }
    }),
  ].map(group => ({ ...group, impact: +(group.pixels * (group.mae ?? 0) / comparison.overall.pixels).toFixed(2) }))
    .sort((a, b) => b.impact - a.impact)
  const summary = { jobId, renderKind: 'stored', approvedDemoSha256: createHash('sha256').update(input).digest('hex'),
    size: { width, height }, overall: comparison.overall,
    excluded: { photoAndSubjectPixels: comparison.excluded.placeholderPixels, totalPixels: comparison.excluded.totalPixels,
      basis: 'visible masks at imported-layout positions' },
    groups, layers: layers.sort((a, b) => b.mae - a.mae || b.pixels - a.pixels) }
  const sideBySide = await drawSideBySide(ref, comparison.render, masks.excluded)
  const preview = await sharp(sideBySide).resize({ width: 1440, withoutEnlargement: true }).png().toBuffer()
  signal.throwIfAborted()
  return { structuredContent: summary, content: [
    { type: 'text', text: JSON.stringify(summary) },
    { type: 'text', text: 'Từ trái sang phải: demo đã duyệt, ảnh render ZIP đã lưu, bản đồ sai khác. Xám là vùng lòng ảnh và SUBJECT đã loại khỏi phép đo.' },
    { type: 'image', mimeType: 'image/png', data: preview.toString('base64') },
  ] }
}
