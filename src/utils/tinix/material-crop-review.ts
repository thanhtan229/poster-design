// [TINIX] Use the canvas photo checks from the local MCP browser worker.
import type { TdLayout } from '@/store/design/widget'
import { checkFrameFaces } from './face-crop'
import { canEditPhoto } from './photo-frame'
import { resolveLinkedImage } from './image-effects'

type Slot = { code: string; id: string }
export async function inspectMaterialCrops(layout: TdLayout, slots: Slot[], verifyOnly: boolean, previewCodes: string[]) {
  const rank = new Map<string, number>()
  function visit(parent: string) {
    for (const layer of layout.layers) {
      if (layer.parent !== parent || layer.hidden || layer.opacity === 0 || rank.has(layer.uuid)) continue
      rank.set(layer.uuid, rank.size)
      if (layer.isContainer) visit(layer.uuid)
    }
  }
  visit(layout.global.uuid)
  const rows = []
  const safeAreas = []
  for (const slot of [...slots].sort((a, b) => (rank.get(b.id) ?? -1) - (rank.get(a.id) ?? -1))) {
    const frame = layout.layers.find(layer => layer.uuid === slot.id)
    try {
      if (!frame || !rank.has(slot.id) || !canEditPhoto(frame)) throw new Error('Unavailable frame')
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = resolveLinkedImage(frame, layout.layers).imgUrl
      const signal = AbortSignal.timeout(65000)
      const withPreview = previewCodes.includes(slot.code)
      const check = await checkFrameFaces(layout.global, layout.layers, frame, image, signal, undefined, withPreview)
      if (!check?.count) {
        rows.push({ code: slot.code, status: 'none' })
      } else if (check.isClear(frame)) {
        rows.push({ code: slot.code, status: 'clear', faces: check.count })
      } else {
        const crop = verifyOnly ? undefined : await check.suggest(signal)
        if (crop && check.isClear({ ...frame, ...crop })) {
          const { fit, cropX, cropY, zoom } = crop
          Object.assign(frame, { fit, cropX, cropY, zoom, transform: `scale(${zoom})` })
          rows.push({ code: slot.code, status: 'safe', faces: check.count,
            crop: { fit, cropX, cropY, zoom }, exposedPercent: check.exposedPercent(frame) })
        } else rows.push({ code: slot.code, status: 'manual', faces: check.count })
      }
      if (withPreview && check) {
        try { safeAreas.push({ code: slot.code, image: check.safeAreaPreview(frame, image) }) }
        catch { /* A preview failure should not discard the crop result. */ }
      }
    } catch {
      rows.push({ code: slot.code, status: 'unavailable' })
    }
  }
  return { rows: rows.sort((a, b) => a.code.localeCompare(b.code)), safeAreas }
}
