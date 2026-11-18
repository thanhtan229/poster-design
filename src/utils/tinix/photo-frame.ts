// [TINIX] Phóng to / xoay ảnh bên trong khung ảnh (fit: 'cover').
// Mô hình: ảnh phủ kín khung (object-fit cover) rồi `scale(zoom)` quanh điểm căn (cropX%, cropY%) của khung — giữ nguyên như trước.
// Xoay (`imgRotate`, độ) là phép xoay thêm quanh TÂM khung, áp sau phép phóng; khi imgRotate = 0 hình ảnh y hệt cách cũ.
import { useCanvasStore, useHistoryStore, useWidgetStore } from '@/store'

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

function minimumFor(image: any, degrees: number): number {
  const natural = naturalSizeOf(image.uuid)
  if (!natural) return MIN_FRAME_ZOOM
  const need = coverMinZoom(image, natural, degrees)
  return Number.isFinite(need) ? Math.max(MIN_FRAME_ZOOM, need) : MAX_FRAME_ZOOM
}

/** Đặt mức phóng (không cho nhỏ hơn mức đủ phủ khung khi đang xoay). */
export function setFrameZoom(image: any, value: number) {
  const zoom = clampZoom(value, minimumFor(image, frameRotation(image)))
  image.zoom = zoom
  image.transform = `scale(${zoom})`
}

/** Đặt góc xoay (độ, -180..180) và tự phóng thêm nếu cần để không lộ nền khung. */
export function setFrameRotation(image: any, degrees: number) {
  let value = ((((degrees + 180) % 360) + 360) % 360) - 180
  if (Math.abs(value) < 0.05) value = 0
  image.imgRotate = value
  const need = value ? minimumFor(image, value) : MIN_FRAME_ZOOM
  if ((Number(image.zoom) || 1) < need) {
    image.zoom = need
    image.transform = `scale(${need})`
  }
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
