/**
 * [TINIX] Ảnh nhẹ trên canvas, ảnh gốc khi xuất thành phẩm.
 *
 * Ảnh người dùng tải lên có bản nhẹ (cạnh dài ≤ 1600px) dùng làm `imgUrl` của lớp ảnh để canvas không nặng/lag khi ghép nhiều ảnh.
 * Lớp ảnh nhớ bản gốc trong `origin = { proxy, original }`; khi xuất (PNG client/server, PSD) mới đổi sang `original`.
 * Chỉ đổi khi `imgUrl` vẫn đúng là `origin.proxy` — nếu ảnh đã bị thay bằng ảnh khác (Thay ảnh, cắt, tách nền…) thì `origin` cũ bị bỏ qua.
 */

export type ImageSourceItem = {
  url: string
  /** URL ảnh gốc (chất lượng đầy đủ) khi `url` là bản nhẹ */
  hq?: string
}

/** Gán nguồn ảnh cho lớp ảnh: `url` hiển thị, `hq` (nếu có) là bản gốc dùng khi xuất */
export function applyImageSource(target: any, item: ImageSourceItem): void {
  target.imgUrl = item.url
  if (item.hq && item.hq !== item.url) target.origin = { proxy: item.url, original: item.hq }
  else if (target.origin) delete target.origin
}

/** Có bản gốc dùng được khi xuất không (origin còn khớp với imgUrl hiện tại) */
export function hasOriginal(w: any): boolean {
  return !!(w && w.origin && w.origin.original && w.origin.proxy && w.imgUrl === w.origin.proxy)
}

/** URL dùng khi xuất cho một lớp ảnh: bản gốc nếu có, không thì imgUrl */
export function exportUrlOf(w: any): string {
  return hasOriginal(w) ? w.origin.original : w.imgUrl
}

/** Thay `imgUrl` bằng ảnh gốc trong dữ liệu dùng để xuất (trang vẽ của Puppeteer). Trả về số lớp đã đổi. */
export function swapToOriginalInData(widgets: any[]): number {
  let n = 0
  for (const w of widgets || []) {
    if (w && w.type === 'w-image' && hasOriginal(w)) {
      w.imgUrl = w.origin.original
      n++
    }
  }
  return n
}

/** Chuẩn hóa URL về dạng '/static/...' để so sánh (bỏ origin máy chủ và query) */
export function staticPathOf(u: string): string {
  const s = String(u || '').replace(/\?.*$/, '')
  const i = s.indexOf('/static/')
  return i >= 0 ? s.slice(i) : s
}

/** Mọi URL ảnh đang dùng trong các trang (artboard) của thiết kế: imgUrl + bản gốc + ảnh nền trang */
export function collectUsedUrls(layouts: Array<{ global?: any; layers?: any[] }>): string[] {
  const out: string[] = []
  for (const l of layouts || []) {
    if (l.global && l.global.backgroundImage) out.push(l.global.backgroundImage)
    for (const w of l.layers || []) {
      if (!w) continue
      if (w.imgUrl) out.push(w.imgUrl)
      if (w.origin && w.origin.original) out.push(w.origin.original)
    }
  }
  return out
}
