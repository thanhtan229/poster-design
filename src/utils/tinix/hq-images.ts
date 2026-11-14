/**
 * [TINIX] Khi XUẤT thành phẩm: đổi các lớp ảnh trong bản sao DOM của trang sang ảnh gốc (chất lượng đầy đủ) rồi chờ giải mã xong.
 * Canvas khi thiết kế chỉ dùng ảnh nhẹ (xem photo-source.ts). Bản sao này chỉ tồn tại trong lúc xuất, nên không làm canvas nặng.
 * Giải mã lần lượt từng ảnh (không đồng thời) để không ngốn RAM với ảnh lớn.
 */
import { exportUrlOf, hasOriginal } from './photo-source'

/**
 * @param root  bản sao DOM của trang (chứa các phần tử có data-uuid của lớp)
 * @param widgets các lớp của trang (gồm cả lớp trong nhóm)
 * @returns số ảnh đã đổi sang bản gốc
 */
export async function useOriginalImages(root: HTMLElement, widgets: any[]): Promise<number> {
  let n = 0
  for (const w of widgets || []) {
    if (!w || w.type !== 'w-image' || !hasOriginal(w)) continue
    const el = root.querySelector(`[data-uuid="${w.uuid}"]`)
    const img = el && (el.querySelector('.img__box img') as HTMLImageElement | null)
    if (!img) continue
    const url = exportUrlOf(w)
    if (img.getAttribute('src') === url) continue
    img.src = url
    try {
      await img.decode()
    } catch (e) {
      // không giải mã được bản gốc: giữ nguyên ảnh nhẹ đã có để vẫn xuất được
      img.src = w.imgUrl
      continue
    }
    n++
  }
  return n
}
