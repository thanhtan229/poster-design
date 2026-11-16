/**
 * [TINIX] Đổi đơn vị kích thước canvas: px là đơn vị gốc, cm chỉ là lớp nhập/hiển thị quy đổi theo DPI.
 *   px = cm × DPI ÷ 2,54      cm = px × 2,54 ÷ DPI
 */
export const CM_PER_INCH = 2.54
export const DEFAULT_DPI = 300
export const MIN_DPI = 36
export const MAX_DPI = 1200
/** Giới hạn mỗi cạnh canvas (khớp maxValue của ô nhập) */
export const MAX_SIDE_PX = 12000
/**
 * Giới hạn tổng điểm ảnh khi tạo canvas / xuất ảnh. Phải khớp `maxPXs` ở service/src/utils/download-single.ts
 * (và scripts/tinix-cli.mjs, tinix-mcp.mjs). Đo thật: trang 8268×11220 (92,8 triệu) chụp ~6,5 giây,
 * Chromium đỉnh ~2,3 GB RAM; 12000×12000 (144 triệu) ~10 giây, ~3,1 GB.
 */
export const MAX_PIXELS = 100_000_000
/** Thời gian chờ tối đa (ms) phía giao diện cho một lần xuất trang w×h: trần của service (exportTimeoutSec) + 30 giây dự phòng */
export function exportTimeoutMs(wPx: number, hPx: number): number {
  const px = Number(wPx) * Number(hPx)
  const sec = isFinite(px) && px > 0 ? Math.max(60, 30 + Math.ceil(px / 1e6)) : 60
  return (sec + 30) * 1000
}
/** Trên ngưỡng này xuất ảnh chậm hơn và tốn RAM (vài GB); chỉ cảnh báo, không chặn */
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
  return Math.round(((Number(px) * CM_PER_INCH) / clampDpi(dpi)) * 100) / 100
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
    try { localStorage.setItem(UNIT_KEY, u) } catch { /* bỏ qua */ }
  }
  return { unit: unitRef, setUnit: set }
}
