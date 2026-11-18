// [TINIX] Phóng to / xoay ảnh bên trong khung ảnh (fit: 'cover').
// Mô hình: ảnh phủ kín khung (object-fit cover) rồi `scale(zoom)` quanh điểm căn (cropX%, cropY%) của khung — giữ nguyên như trước.
// Xoay (`imgRotate`, độ) là phép xoay thêm quanh TÂM khung, áp sau phép phóng; khi imgRotate = 0 hình ảnh y hệt cách cũ.
import { reactive } from 'vue'
import { useCanvasStore, useControlStore, useHistoryStore, useWidgetStore } from '@/store'

export const MAX_FRAME_ZOOM = 5
export const MIN_FRAME_ZOOM = 1

export function frameRotation(image: any): number {
  return image && image.fit === 'cover' ? Number(image.imgRotate) || 0 : 0
}

/** Kích thước gốc của ảnh đang hiển thị trong khung (lấy từ phần tử <img> trên canvas). */
export function naturalSizeOf(uuid: string): { width: number; height: number } | null {
  const root = document.getElementById(uuid)
  const img = root ? (root.querySelector('img.target') as HTMLImageElement | null) : null
  if (!img || !img.naturalWidth || !img.naturalHeight) return null
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/**
 * Mức phóng nhỏ nhất để ảnh (đã xoay `degrees` quanh tâm khung) còn phủ kín khung.
 * Trả về Infinity khi điểm căn nằm sát mép ảnh nên không mức phóng nào đủ (người dùng nên căn giữa lại).
 */
export function coverMinZoom(frame: { width: number; height: number; cropX?: number; cropY?: number }, natural: { width: number; height: number }, degrees: number): number {
  const w = Number(frame.width)
  const h = Number(frame.height)
  const cx = (frame.cropX ?? 50) / 100
  const cy = (frame.cropY ?? 50) / 100
  const factor = Math.max(w / natural.width, h / natural.height)
  const sw = natural.width * factor
  const sh = natural.height * factor
  const ox = (w - sw) * cx
  const oy = (h - sh) * cy
  const px = cx * w
  const py = cy * h
  const a = (-degrees * Math.PI) / 180 // xoay ngược các góc khung về hệ tọa độ ảnh
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  let need = MIN_FRAME_ZOOM
  const axis = (g: number, p: number, toLow: number, toHigh: number) => {
    if (g < p - 1e-9) need = toLow <= 1e-6 ? Infinity : Math.max(need, (p - g) / toLow)
    else if (g > p + 1e-9) need = toHigh <= 1e-6 ? Infinity : Math.max(need, (g - p) / toHigh)
  }
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
    const dx = x - w / 2
    const dy = y - h / 2
    const gx = w / 2 + dx * cos - dy * sin
    const gy = h / 2 + dx * sin + dy * cos
    axis(gx, px, px - ox, ox + sw - px)
    axis(gy, py, py - oy, oy + sh - py)
    if (need === Infinity) return Infinity
  }
  return need
}

/** Chuyển độ dịch trên màn hình (px) sang hệ tọa độ của ảnh chưa xoay, để kéo ảnh luôn đi theo con trỏ. */
export function unrotateDelta(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180
  return { x: Math.cos(a) * dx + Math.sin(a) * dy, y: -Math.sin(a) * dx + Math.cos(a) * dy }
}

export function clampZoom(value: number, minimum = MIN_FRAME_ZOOM) {
  return Math.max(Math.min(minimum, MAX_FRAME_ZOOM), Math.min(MAX_FRAME_ZOOM, value))
}

/** Đặt mức phóng (không cho nhỏ hơn mức đủ phủ khung khi đang xoay). */
export function setFrameZoom(image: any, value: number) {
  const zoom = clampZoom(value)
  image.zoom = zoom
  image.transform = `scale(${zoom})`
  const natural = frameRotation(image) ? naturalSizeOf(image.uuid) : null
  if (natural) liftToCover(image, natural)
}

/** Đặt góc xoay (độ, -180..180) và tự phóng thêm (quanh tâm khung) nếu cần để không lộ nền khung. */
export function setFrameRotation(image: any, degrees: number) {
  let value = ((((degrees + 180) % 360) + 360) % 360) - 180
  if (Math.abs(value) < 0.05) value = 0
  image.imgRotate = value
  if (!value) return
  const natural = naturalSizeOf(image.uuid)
  if (natural) liftToCover(image, natural)
}

/**
 * Ảnh đã xoay mà lộ nền: phóng thêm quanh TÂM khung (giữ phần ảnh đang ở giữa khung) tới mức nhỏ nhất đủ phủ.
 * Phóng quanh điểm căn sẽ không đủ khi điểm căn nằm sát mép ảnh (cropX/cropY = 0 hoặc 100).
 */
export function liftToCover(image: any, natural: { width: number; height: number }) {
  const z0 = Math.max(MIN_FRAME_ZOOM, Number(image.zoom) || 1)
  const crop0 = { cropX: image.cropX ?? 50, cropY: image.cropY ?? 50 }
  if (coversFrame(image, natural, crop0, z0)) return
  const r0 = imageRect(image, natural)
  const cx = Number(image.width) / 2
  const cy = Number(image.height) / 2
  const at = (zoom: number) => {
    const s = zoom / z0
    return cropForTopLeft(image, natural, zoom, cx - (cx - r0.x) * s, cy - (cy - r0.y) * s)
  }
  let lo = z0
  let hi = MAX_FRAME_ZOOM
  if (!coversFrame(image, natural, at(hi), hi)) {
    // Không đủ ngay cả ở mức tối đa: căn giữa ảnh rồi dùng mức phủ nhỏ nhất (tối đa MAX_FRAME_ZOOM).
    image.cropX = 50
    image.cropY = 50
    const need = coverMinZoom({ width: image.width, height: image.height, cropX: 50, cropY: 50 }, natural, frameRotation(image))
    const zoom = Math.min(MAX_FRAME_ZOOM, Math.max(z0, need))
    image.zoom = zoom
    image.transform = `scale(${zoom})`
    return
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (coversFrame(image, natural, at(mid), mid)) hi = mid
    else lo = mid
  }
  const crop = at(hi)
  image.cropX = crop.cropX
  image.cropY = crop.cropY
  image.zoom = hi
  image.transform = `scale(${hi})`
}

/** Một "giao dịch" lịch sử hoàn tác cho nhiều thay đổi nhỏ liên tiếp (kéo thanh trượt, lăn chuột). */
export function createFrameHistory() {
  let before = ''
  let page = -1
  return {
    begin() {
      if (before) return
      before = JSON.stringify(useWidgetStore().dWidgets)
      page = useCanvasStore().dCurrentPage
    },
    commit() {
      if (!before) return
      const old = before
      before = ''
      const widgets = useWidgetStore()
      if (page !== useCanvasStore().dCurrentPage) return
      widgets.updateDWidgets()
      const after = JSON.stringify(widgets.dWidgets)
      if (old !== after) {
        useHistoryStore().changeHistory({
          patches: [{ op: 'replace', path: [page, 'layers'], value: JSON.parse(after) }],
          inversePatches: [{ op: 'replace', path: [page, 'layers'], value: JSON.parse(old) }],
        })
      }
    },
  }
}

// ---- Chế độ "Chỉnh ảnh trong khung" (nhấp đúp vào khung) ----
// Khung đứng yên; toàn bộ ảnh hiện mờ kèm tay nắm riêng của ảnh (xem PhotoEditOverlay.vue).
export const photoEdit = reactive({ uuid: '' })

export function canEditPhoto(w: any): boolean {
  return !!w && w.type === 'w-image' && w.fit === 'cover' && !w.lock && !w.isNinePatch
}

export function enterPhotoEdit(uuid: string) {
  if (photoEdit.uuid === uuid) return
  photoEdit.uuid = uuid
  useControlStore().setShowMoveable(false)
}

export function exitPhotoEdit() {
  if (!photoEdit.uuid) return
  const widgets = useWidgetStore()
  const frame: any = widgets.dWidgets.find((w: any) => w.uuid === photoEdit.uuid)
  photoEdit.uuid = ''
  useControlStore().setShowMoveable(true)
  // Khung nằm trong cụm: chọn lại cả cụm như khi nhấp bình thường (kéo một khung con đang chọn làm cụm nhảy sai chỗ).
  if (frame && frame.parent && frame.parent !== '-1' && widgets.dActiveElement?.uuid === frame.uuid) widgets.selectWidget({ uuid: frame.parent })
}

/** Hình chữ nhật của ảnh (đã phóng, CHƯA xoay) trong hệ tọa độ khung: x = cx·(w − z·sw). */
export function imageRect(frame: any, natural: { width: number; height: number }) {
  const w = Number(frame.width)
  const h = Number(frame.height)
  const z = Math.max(MIN_FRAME_ZOOM, Number(frame.zoom) || 1)
  const factor = Math.max(w / natural.width, h / natural.height)
  const width = natural.width * factor * z
  const height = natural.height * factor * z
  const cx = (frame.cropX ?? 50) / 100
  const cy = (frame.cropY ?? 50) / 100
  return { x: cx * (w - width), y: cy * (h - height), width, height }
}

/** Điểm căn (cropX/cropY %) để ảnh cỡ `zoom` có góc trên-trái tại (x, y); giữ giá trị cũ ở chiều không dư. */
export function cropForTopLeft(frame: any, natural: { width: number; height: number }, zoom: number, x: number, y: number) {
  const w = Number(frame.width)
  const h = Number(frame.height)
  const factor = Math.max(w / natural.width, h / natural.height)
  const spareX = w - natural.width * factor * zoom
  const spareY = h - natural.height * factor * zoom
  const pick = (value: number, spare: number, old: number) => (spare < -1e-6 ? Math.max(0, Math.min(100, (value / spare) * 100)) : old)
  return { cropX: pick(x, spareX, frame.cropX ?? 50), cropY: pick(y, spareY, frame.cropY ?? 50) }
}

/** Ảnh (đã xoay) còn phủ kín khung không, với điểm căn và mức phóng cho trước. */
export function coversFrame(frame: any, natural: { width: number; height: number }, crop: { cropX: number; cropY: number }, zoom: number): boolean {
  const degrees = frameRotation(frame)
  if (!degrees) return true
  return coverMinZoom({ width: frame.width, height: frame.height, ...crop }, natural, degrees) <= zoom + 1e-6
}
