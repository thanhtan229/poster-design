// [TINIX] Áp viền trắng hình dán lên một lớp ảnh: dựng PNG có viền, đổi ảnh + hộp lớp sao cho người đứng nguyên chỗ cũ,
// đặt cutInset/printInset để Cụm in và cắt nổi / đường cắt laser chạy đúng (xem collage-print.ts, cutPaths.ts).
// Ảnh gốc chưa viền được giữ trong image.stickerBorder.baseUrl nên đổi bề dày bao nhiêu lần cũng không mất chất lượng.
import api from '@/api'
import { buildStickerBorder } from './sticker-border'

export type StickerBorderMeta = {
  mm: number
  baseUrl: string // ảnh tách nền chưa viền
  natW: number // kích thước ảnh gốc (px ảnh)
  natH: number
  offX: number // góc trên trái ảnh có viền so với ảnh gốc (px ảnh)
  offY: number
  outW: number
  outH: number
}

type Box = { left: number; top: number; width: number; height: number; sx: number; sy: number }

const radians = (deg: any) => ((parseFloat(String(deg || 0)) || 0) * Math.PI) / 180
// CSS rotate(θ) với trục y hướng xuống: [cos -sin; sin cos]
const rotate = (dx: number, dy: number, a: number) => ({ x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) })

/** Hộp của ảnh GỐC (chưa viền) suy ra từ hộp hiện tại của lớp (đã có viền), tính cả khi người dùng đã kéo/đổi cỡ/xoay */
function sourceBox(image: any, sb: StickerBorderMeta): Box {
  const sx = image.width / sb.outW
  const sy = image.height / sb.outH
  const dx = (sb.offX + sb.outW / 2 - sb.natW / 2) * sx
  const dy = (sb.offY + sb.outH / 2 - sb.natH / 2) * sy
  const r = rotate(dx, dy, radians(image.rotate))
  const cx = image.left + image.width / 2 - r.x
  const cy = image.top + image.height / 2 - r.y
  const width = sb.natW * sx
  const height = sb.natH * sy
  return { left: cx - width / 2, top: cy - height / 2, width, height, sx, sy }
}

async function imageSize(url: string): Promise<{ w: number; h: number }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Không tải được ảnh')
  const bmp = await createImageBitmap(await res.blob())
  const size = { w: bmp.width, h: bmp.height }
  bmp.close()
  return size
}

/** mm = 0: bỏ viền, trả ảnh và hộp về như trước khi áp viền */
export async function applyStickerBorder(image: any, mm: number, dpi: number): Promise<void> {
  const sb: StickerBorderMeta | undefined = image.stickerBorder
  let baseUrl: string
  let natW: number
  let natH: number
  let box: Box
  if (sb) {
    baseUrl = sb.baseUrl
    natW = sb.natW
    natH = sb.natH
    box = sourceBox(image, sb)
  } else {
    if (!image.imgUrl) throw new Error('Lớp ảnh chưa có ảnh')
    if (image.fit === 'cover') throw new Error('Khung ảnh giữ kích thước (phủ kín) không dùng được viền hình dán. Hãy dùng một lớp ảnh thường.')
    baseUrl = image.imgUrl
    const size = await imageSize(baseUrl)
    natW = size.w
    natH = size.h
    box = { left: image.left, top: image.top, width: image.width, height: image.height, sx: image.width / size.w, sy: image.height / size.h }
  }

  if (!(mm > 0)) {
    if (!sb) return
    image.imgUrl = sb.baseUrl
    image.left = box.left
    image.top = box.top
    image.width = box.width
    image.height = box.height
    // gán undefined (không delete): lớp ảnh đang chọn là bản sao, khóa bị xóa không lan về kho dữ liệu; JSON bỏ khóa undefined khi lưu
    image.stickerBorder = undefined
    image.cutInset = undefined
    image.printInset = undefined
    return
  }

  const s = (box.sx + box.sy) / 2 // px trang trên mỗi px ảnh
  const borderPage = (mm * (dpi || 300)) / 25.4
  const res = await buildStickerBorder(baseUrl, borderPage / s)
  const uploaded: any = await api.material.upload({ file: new File([res.blob], 'sticker-border.png', { type: 'image/png' }) }, () => undefined)
  const url = uploaded?.url
  if (!url) throw new Error('Không lưu được ảnh có viền')

  // hộp mới: cùng tâm với hộp ảnh gốc cộng độ lệch của ảnh có viền, để người không xê dịch
  const dx = (res.offX + res.outW / 2 - natW / 2) * box.sx
  const dy = (res.offY + res.outH / 2 - natH / 2) * box.sy
  const r = rotate(dx, dy, radians(image.rotate))
  const width = res.outW * box.sx
  const height = res.outH * box.sy
  const cx = box.left + box.width / 2 + r.x
  const cy = box.top + box.height / 2 + r.y

  image.imgUrl = url
  image.left = cx - width / 2
  image.top = cy - height / 2
  image.width = width
  image.height = height
  // image.origin (nếu có) chỉ có tác dụng khi imgUrl === origin.proxy (photo-source.ts hasOriginal) nên không ảnh hưởng ảnh có viền
  image.stickerBorder = { mm, baseUrl, natW, natH, offX: res.offX, offY: res.offY, outW: res.outW, outH: res.outH } as StickerBorderMeta
  image.cutInset = borderPage / 2 // đường cắt laser nằm giữa viền trắng
  image.printInset = res.margin * s // đệm trong suốt ngoài viền không tính vào hộp cắt
}
