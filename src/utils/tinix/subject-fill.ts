// [TINIX] Khung tách nền (templateRole 'subject'): đưa ảnh vào khung → tự tách nền (model đang chọn, BiRefNet lỗi thì U²-Net),
// cắt sát người, đặt vừa khung (chân chạm đáy khung, giữa theo chiều ngang, tính cả góc xoay) rồi thêm viền trắng
// đúng templateBorderMm (sticker-apply.ts). Hộp khung gốc nhớ ở `subjectFrame` để lần thay ảnh sau vẫn đặt đúng chỗ.
// Gọi từ: thả ảnh lên khung (designBoard), "Thay ảnh" (wImageStyle), Tự áp dụng mẫu (photo-place).
import { ElMessage } from 'element-plus'
import i18n from '@/languages'
import api from '@/api'
import { useCanvasStore, useWidgetStore } from '@/store'
import { birefnetCutout, getCutoutEngine } from './cutout-engine'
import { cutoutImage } from '@/components/business/image-cutout/ImageCutout/helper/useCutout'
import { applyStickerBorder } from './sticker-apply'

export type FrameBox = { left: number; top: number; width: number; height: number }

const t = (k: string, p?: any): string => i18n.global.t(k, p) as string

export function isSubjectFrame(w: any): boolean {
  return !!w && w.type === 'w-image' && w.templateRole === 'subject' && !w.linkedPhotoId
}

/** Hộp khung tách nền: hộp lúc còn là ảnh giữ chỗ, nhớ lại sau lần đổ ảnh đầu tiên. */
export function subjectFrameOf(w: any): FrameBox {
  const f = w.subjectFrame
  if (f && f.width > 0 && f.height > 0) return { left: f.left, top: f.top, width: f.width, height: f.height }
  return { left: Number(w.left) || 0, top: Number(w.top) || 0, width: Number(w.width) || 1, height: Number(w.height) || 1 }
}

const busy = new Set<string>()

async function cutout(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(t('tinix.ui.subjectFill.load_failed'))
  const file = new File([await res.blob()], 'subject.jpg', { type: 'image/jpeg' })
  if (getCutoutEngine() === 'birefnet') {
    try {
      return await birefnetCutout(file)
    } catch (e: any) {
      ElMessage.warning(t('tinix.ui.cutoutEngine.birefnet_loi_dung_u2net', { msg: e?.message || '' }))
    }
  }
  const blob = await cutoutImage(file, () => undefined)
  if (!blob) throw new Error(t('tinix.ui.subjectFill.cut_failed'))
  return blob
}

/** Cắt sát vùng có người (alpha > 8). */
async function trimAlpha(blob: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(blob)
  const W = bmp.width
  const H = bmp.height
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const data = ctx.getImageData(0, 0, W, H).data
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error(t('tinix.ui.subjectFill.empty'))
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) throw new Error('canvas')
  octx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h)
  const png = await new Promise<Blob | null>((resolve) => {
    out.toBlob(resolve, 'image/png')
  })
  if (!png) throw new Error(t('tinix.ui.subjectFill.cut_failed'))
  return { blob: png, w, h }
}

const radians = (deg: any) => ((parseFloat(String(deg || 0)) || 0) * Math.PI) / 180

/** Hộp người trong khung: vừa khung trừ viền, chân chạm đáy khung, giữa ngang; xoay theo góc của lớp. */
function placeInFrame(frame: FrameBox, natW: number, natH: number, pad: number, rotate: any) {
  const availW = Math.max(10, frame.width - pad * 2)
  const availH = Math.max(10, frame.height - pad * 2)
  const k = Math.min(availW / natW, availH / natH)
  const width = natW * k
  const height = natH * k
  // độ lệch tâm (trong hệ toạ độ của khung) rồi xoay theo góc lớp quanh tâm khung
  const dx = 0
  const dy = frame.height / 2 - pad - height / 2
  const a = radians(rotate)
  const cx = frame.left + frame.width / 2 + (dx * Math.cos(a) - dy * Math.sin(a))
  const cy = frame.top + frame.height / 2 + (dx * Math.sin(a) + dy * Math.cos(a))
  return { left: cx - width / 2, top: cy - height / 2, width, height }
}

/**
 * Đổ ảnh `photo` vào khung tách nền `uuid`. Trả về false nếu lớp không phải khung tách nền / đang xử lý / lỗi.
 * Trong lúc chờ, lớp vẫn hiện ảnh vừa thả (nếu nơi gọi đã gán); lỗi thì giữ nguyên ảnh đó và báo.
 */
export async function fillSubjectFrame(uuid: string, photo: { url: string; hq?: string }): Promise<boolean> {
  const store = useWidgetStore()
  const find = () => (store.dWidgets as any[]).find((w) => w.uuid === uuid)
  const first = find()
  if (!isSubjectFrame(first) || busy.has(uuid) || !photo || !photo.url) return false
  busy.add(uuid)
  const frame = subjectFrameOf(first)
  const note = ElMessage({ type: 'info', message: t('tinix.ui.subjectFill.working'), duration: 0 })
  try {
    const trimmed = await trimAlpha(await cutout(photo.hq || photo.url))
    const uploaded: any = await api.material.upload({ file: new File([trimmed.blob], 'subject.png', { type: 'image/png' }) }, () => undefined)
    const url = uploaded && uploaded.url
    if (!url) throw new Error(t('tinix.ui.subjectFill.upload_failed'))
    const w = find()
    if (!w) return false // lớp bị xóa trong lúc chờ
    const mm = Number(w.templateBorderMm) > 0 ? Number(w.templateBorderMm) : 0
    const dpi = Number(useCanvasStore().dPage.dpi) || 300
    const pad = mm > 0 ? (mm * dpi) / 25.4 + 4 : 0 // viền + đệm trong suốt của ảnh có viền
    Object.assign(w, placeInFrame(frame, trimmed.w, trimmed.h, pad, w.rotate), { imgUrl: url, fit: 'fill', cropX: 50, cropY: 50, zoom: 1, subjectFrame: frame })
    // gán undefined (không delete): lớp đang chọn có thể là bản sao, khóa bị xóa không lan về kho dữ liệu
    w.origin = undefined
    w.stickerBorder = undefined
    w.cutInset = undefined
    w.printInset = undefined
    w.cutoutEdit = undefined
    w.cutoutBorderUrl = undefined
    if (mm > 0) await applyStickerBorder(w, mm, dpi)
    const active: any = store.dActiveElement
    if (active && active.uuid === uuid && active !== w) Object.assign(active, w)
    store.updateDWidgets()
    note.close()
    ElMessage.success(mm > 0 ? t('tinix.ui.subjectFill.done_mm', { mm }) : t('tinix.ui.subjectFill.done'))
    return true
  } catch (e: any) {
    note.close()
    ElMessage.error(t('tinix.ui.subjectFill.failed', { msg: e?.message || String(e) }))
    return false
  } finally {
    busy.delete(uuid)
  }
}

/** Đổ ảnh vào mọi khung tách nền trong danh sách uuid (dùng sau khi áp dụng mẫu với nhiều ảnh), lần lượt từng khung. */
export async function fillSubjectFrames(items: Array<{ uuid: string; photo: { url: string; hq?: string } }>): Promise<void> {
  for (const it of items) await fillSubjectFrame(it.uuid, it.photo)
}
