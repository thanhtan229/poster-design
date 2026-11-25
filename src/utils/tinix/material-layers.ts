// [TINIX] Shared layer construction for the canvas and CLI material ZIP import.
import i18n from '@/languages'
import { wGroupSetting } from '@/components/modules/widgets/wGroup/groupSetting'
import { photoFrameLayer } from './cut-piece-review'
import { photoPlaceholder, subjectPlaceholder } from './template-sanitize'
import { referencePageBox, type CanvasReferenceGuide } from './reference-guide'
import type { MaterialPrintSize, MaterialSubject } from './material-layout'
import type { PieceRole, pieceImage } from './material-sheet'
import type { MaterialPose } from './material-placement'

export type MaterialImport = {
  guide: CanvasReferenceGuide; background: string; width: number; height: number
  pieces: Array<ReturnType<typeof pieceImage> & { role: PieceRole; pose?: MaterialPose; cutOuterOnly?: boolean; index: number }>
  subjectZ?: number; subject?: MaterialSubject; printSize?: MaterialPrintSize; archive?: boolean
}

type PageSize = { width: number; height: number }
const t = i18n.global.t

export function buildMaterialLayers(payload: MaterialImport, size: PageSize, pageId: string) {
  const scale = Math.min(size.width / (payload.width + 8), size.height / (payload.height + 8))
  const offsetX = (size.width - payload.width * scale) / 2
  const offsetY = (size.height - payload.height * scale) / 2
  // [TINIX] Map suggestions to the same aspect-preserving area as the reference overlay.
  const referenceArea = referencePageBox(payload.guide, { id: '', x: 0, y: 0, width: 1, height: 1 }, size)
  const referenceScale = referenceArea.width / payload.guide.width
  const pending: { id: string; name: string }[] = []
  const photoSlots: { code: string; id: string }[] = [] // [TINIX] Keep the manifest code tied to the generated slot.
  const layers = payload.pieces.flatMap<{ uuid: string }>(piece => {
    const { index } = piece
    const { pose } = piece
    const factor = pose ? referenceScale * pose.scale : scale
    const width = Math.max(1, Math.round(piece.width * factor))
    const height = Math.max(1, Math.round(piece.height * factor * (pose?.heightRatio ?? 1))) // [TINIX] Rim fits use independent axes.
    const angle = pose?.angle ?? 0
    const radians = angle * Math.PI / 180
    const cornerX = piece.role === 'sticker' ? width / 2 : (width * Math.cos(radians) - height * Math.sin(radians)) / 2
    const cornerY = piece.role === 'sticker' ? height / 2 : (width * Math.sin(radians) + height * Math.cos(radians)) / 2
    const area = {
      x: Math.round(pose ? referenceArea.x + pose.x * referenceArea.width - cornerX : offsetX + piece.left * scale),
      y: Math.round(pose ? referenceArea.y + pose.y * referenceArea.height - cornerY : offsetY + piece.top * scale),
      width, height,
    }
    const name = t('tinix.ui.materialSheet.layerName', { role: t('tinix.ui.materialSheet.' + piece.role), n: index + 1 })
    const backing = { ...photoFrameLayer(area, name, piece.url, pageId), uuid: crypto.randomUUID(),
      fit: 'fill', printRole: 'raised' }
    // [TINIX] The print planner reads the setting from the standalone layer or the frame group.
    const cutMode = piece.cutOuterOnly === true ? { cutOuterOnly: true } : {}
    if (piece.role === 'sticker') {
      if (!pose) pending.push({ id: backing.uuid, name })
      return [{ ...backing, ...cutMode, rotate: angle ? angle + 'deg' : 0 }]
    }
    const id = crypto.randomUUID()
    if (!pose) pending.push({ id, name })
    const group = { ...wGroupSetting, ...cutMode, uuid: id, name, parent: pageId, left: area.x, top: area.y,
      width: area.width, height: area.height, record: { ...wGroupSetting.record, width: area.width, height: area.height },
      printRole: 'raised', printGroup: id, rotate: angle ? angle + 'deg' : 0 }
    const photo = { ...photoFrameLayer(area, name, photoPlaceholder(area), id), uuid: crypto.randomUUID(),
      mask: piece.mask, slot: true, templateRole: 'photo', printRole: 'raised', printGroup: id }
    if (pose?.frameCode) photoSlots.push({ code: pose.frameCode, id: photo.uuid })
    const artwork = { ...backing, parent: id, printGroup: id }
    // [TINIX] Keep the original artwork above the replaceable photo when the opening was traced.
    return piece.overlay ? [group, photo, artwork] : [group, artwork, photo]
  })
  return { layers, pending, photoSlots }
}

export function materialSubjectPosition(pieces: MaterialImport['pieces'], z: number) {
  const firstAbove = pieces.findIndex(piece => (piece.pose?.layoutOrder ?? -1) > z)
  const beforeSubject = firstAbove < 0 ? pieces : pieces.slice(0, firstAbove)
  return beforeSubject.reduce((count, piece) => count + (piece.role === 'sticker' ? 1 : 3), 0)
}

export function buildMaterialSubject(subject: MaterialSubject, guide: CanvasReferenceGuide, size: PageSize, pageId: string) {
  const referenceArea = referencePageBox(guide, { id: '', x: 0, y: 0, width: 1, height: 1 }, size)
  const { x, y, width, height, angle, borderMm } = subject
  const w = Math.max(1, Math.round(width * referenceArea.width))
  const h = Math.max(1, Math.round(height * referenceArea.height))
  const area = { x: Math.round(referenceArea.x + x * referenceArea.width - w / 2),
    y: Math.round(referenceArea.y + y * referenceArea.height - h / 2), width: w, height: h }
  const name = t('tinix.ui.materialSheet.archiveSubject')
  const layer = photoFrameLayer(area, name, subjectPlaceholder(area, borderMm), pageId)
  return { ...layer, uuid: crypto.randomUUID(), rotate: angle ? angle + 'deg' : 0,
    slot: true, templateRole: 'subject', templateBorderMm: borderMm, printRole: 'raised' }
}
