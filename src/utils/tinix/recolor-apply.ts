// [TINIX] Áp "Đổi màu chính" lên một lớp ảnh. Luôn đổi từ ảnh GỐC (image.recolor.originalUrl) nên đổi bao nhiêu lần
// cũng không giảm chất lượng, và "Khôi phục màu gốc" trả đúng ảnh ban đầu.
// Ảnh có viền trắng hình dán (sticker-apply.ts): đổi màu ảnh nền chưa viền (stickerBorder.baseUrl) rồi dựng lại viền,
// để chỉnh bề dày viền về sau vẫn giữ màu mới.
import api from '@/api'
import { recolorImage } from './image-recolor'
import { applyStickerBorder } from './sticker-apply'

export type RecolorMeta = {
  originalUrl: string // ảnh trước khi đổi màu (ảnh chưa viền nếu có viền hình dán)
  from: string // màu nguồn (#rrggbb) đọc từ ảnh gốc
  to: string // màu đích
  tolerance: number // 0–100
}

/** Lớp ảnh dùng được "Đổi màu chính": ảnh trang trí có ảnh, không phải khung đặt ảnh người dùng hay nền liên kết */
export function canRecolor(image: any): boolean {
  return !!image && image.type === 'w-image' && !!image.imgUrl && !image.slot && !image.linkedPhotoId
}

/** Ảnh gốc để đọc bảng màu và để đổi màu */
export function recolorSource(image: any): string {
  return image?.recolor?.originalUrl || image?.stickerBorder?.baseUrl || image?.imgUrl || ''
}

async function setContent(image: any, url: string, dpi: number) {
  const sb = image.stickerBorder
  if (sb) {
    image.stickerBorder = { ...sb, baseUrl: url }
    await applyStickerBorder(image, sb.mm, dpi)
  } else image.imgUrl = url
}

/** to = null: khôi phục màu gốc */
export async function applyRecolor(image: any, opts: { from: string; to: string; tolerance: number } | null, dpi: number): Promise<{ changed: number }> {
  if (!canRecolor(image)) throw new Error('Lớp này không đổi màu được')
  const originalUrl = recolorSource(image)
  if (!opts) {
    if (!image.recolor) return { changed: 0 }
    await setContent(image, originalUrl, dpi)
    // gán undefined (không delete): lớp đang chọn là bản sao, khóa bị xóa không lan về kho dữ liệu
    image.recolor = undefined
    return { changed: 0 }
  }
  const { blob, changed } = await recolorImage(originalUrl, opts.from, opts.to, opts.tolerance)
  if (!changed) throw new Error('Không tìm thấy vùng màu đã chọn. Thử chọn màu khác hoặc nới độ rộng màu.')
  const uploaded: any = await api.material.upload({ file: new File([blob], 'recolor.png', { type: 'image/png' }) }, () => undefined)
  const url = uploaded?.url
  if (!url) throw new Error('Không lưu được ảnh đã đổi màu')
  await setContent(image, url, dpi)
  image.recolor = { originalUrl, from: opts.from, to: opts.to, tolerance: opts.tolerance } as RecolorMeta
  return { changed }
}
