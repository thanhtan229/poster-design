/**
 * [TINIX] Giới hạn xuất ảnh dùng chung cho service (download-single, timeout, canvasSizes).
 * Phải khớp MAX_SIDE_PX / MAX_PIXELS ở src/utils/tinix/units.ts (frontend) và scripts/tinix-cli.mjs, tinix-mcp.mjs.
 *
 * Đo thật bằng Chromium của Puppeteer (nội dung đơn giản): 8268×11220 (92,8 triệu điểm ảnh) chụp ~6,5 giây,
 * Chromium đỉnh ~2,3 GB RAM; 12000×12000 (144 triệu) ~10 giây, ~3,1 GB. Nội dung thật (nhiều ảnh, font, đổ bóng)
 * chậm hơn nên thời gian chờ bên dưới là mức trần thoải mái, không phải thời gian dự kiến.
 */
export const MAX_EXPORT_SIDE = 12000
export const MAX_EXPORT_PIXELS = 100000000

/** Thời gian tối đa (giây) cho một lần chụp trang w×h: tối thiểu 60 giây, thêm 1 giây cho mỗi triệu điểm ảnh. */
export function exportTimeoutSec(width: any, height: any): number {
  const px = Number(width) * Number(height)
  if (!isFinite(px) || px <= 0) return 60
  return Math.max(60, 30 + Math.ceil(px / 1000000))
}
