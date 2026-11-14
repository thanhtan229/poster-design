/**
 * [TINIX] Đổi đơn vị kích thước canvas: px là đơn vị gốc, cm chỉ là lớp nhập/hiển thị quy đổi theo DPI.
 *   px = cm × DPI ÷ 2,54      cm = px × 2,54 ÷ DPI
 */
export const CM_PER_INCH = 2.54
export const DEFAULT_DPI = 300
export const MIN_DPI = 36
export const MAX_DPI = 1200
/** Giới hạn mỗi cạnh canvas (khớp maxValue của ô nhập) */
export const MAX_SIDE_PX = 10000
/** Trên ngưỡng này việc xuất ảnh dễ quá thời gian chờ của server (30 giây) */
export const WARN_PIXELS = 60_000_000

export function clampDpi(v: any): number {
  const n = Math.round(Number(v))
  if (!isFinite(n) || n <= 0) return DEFAULT_DPI
  return Math.min(MAX_DPI, Math.max(MIN_DPI, n))
}

export function cmToPx(cm: number, dpi: number): number {
  return Math.round((Number(cm) * clampDpi(dpi)) / CM_PER_INCH)
}

/** cm với 1 chữ số thập phân (đủ cho in ấn; px vẫn là nguồn sự thật) */
export function pxToCm(px: number, dpi: number): number {
  return Math.round(((Number(px) * CM_PER_INCH) / clampDpi(dpi)) * 10) / 10
}

/** Kích thước vượt giới hạn cạnh / dễ quá tải khi xuất */
export function sizeWarning(wPx: number, hPx: number): 'side' | 'pixels' | '' {
  if (wPx > MAX_SIDE_PX || hPx > MAX_SIDE_PX) return 'side'
  if (wPx * hPx > WARN_PIXELS) return 'pixels'
  return ''
}

/** Các khổ in thông dụng (cm, cạnh dài × cạnh ngắn theo hướng đứng) cho album / poster / ảnh cưới */
export const PRINT_SIZES: Array<{ key: string; w: number; h: number }> = [
  { key: 'A5', w: 14.8, h: 21 },
  { key: 'A4', w: 21, h: 29.7 },
  { key: 'A3', w: 29.7, h: 42 },
  { key: '10x15', w: 10, h: 15 },
  { key: '13x18', w: 13, h: 18 },
  { key: '20x30', w: 20, h: 30 },
  { key: '30x30', w: 30, h: 30 },
  { key: '30x40', w: 30, h: 40 },
  { key: '40x60', w: 40, h: 60 },
]

// ── Lựa chọn đơn vị đang dùng (nhớ giữa các lần mở) ──
import { ref } from 'vue'
const UNIT_KEY = 'tinix.sizeUnit'
export type SizeUnit = 'px' | 'cm'
const unitRef = ref<SizeUnit>((typeof localStorage !== 'undefined' && localStorage.getItem(UNIT_KEY) === 'cm') ? 'cm' : 'px')
export function useSizeUnit() {
  const set = (u: SizeUnit) => {
    unitRef.value = u
    try { localStorage.setItem(UNIT_KEY, u) } catch (e) { /* bỏ qua */ }
  }
  return { unit: unitRef, setUnit: set }
}
