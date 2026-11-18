// [TINIX] Viền trắng thật bám theo đường bao người (hình dán cắt nổi).
// Dựng điểm ảnh viền vào chính PNG vì tờ cắt và đường cắt laser chỉ đọc phần trong suốt của lớp ảnh
// (viền CSS / effects.border / cutoutBorderUrl bị bỏ khi dựng tờ cắt — xem collage-print.ts).
// Chạy trong trình duyệt bằng canvas: cắt theo khung người, nở đường bao theo hình tròn, làm mượt, lấp lỗ nhỏ.

export type StickerBorderResult = {
  blob: Blob
  natW: number // kích thước ảnh gốc (px ảnh)
  natH: number
  outW: number // kích thước ảnh có viền
  outH: number
  offX: number // góc trên trái của ảnh có viền so với góc trên trái ảnh gốc (px ảnh, có thể âm)
  offY: number
  margin: number // đệm trong suốt ở mỗi cạnh ngoài viền (px ảnh)
}

const MARGIN = 4 // px ảnh: chỗ cho khử răng cưa mép viền
const WORK_MAX = 1500 // cạnh lớn nhất của canvas dựng mặt nạ; ảnh lớn hơn thì dựng ở độ phân giải thấp rồi phóng lên
const MAX_RADIUS = 400

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Lấp các lỗ kín nhỏ trong mặt nạ (khe giữa tay và thân); alpha > 127 là có mặt nạ */
function fillSmallHoles(data: Uint8ClampedArray, w: number, h: number, maxArea: number) {
  const n = w * h
  const seen = new Uint8Array(n) // 1 = vùng nền đã duyệt
  const queue = new Int32Array(n)
  const solid = (i: number) => data[i * 4 + 3] > 127
  for (let start = 0; start < n; start++) {
    if (seen[start] || solid(start)) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    seen[start] = 1
    let touchesEdge = false
    while (head < tail) {
      const i = queue[head++]
      const x = i % w
      const y = (i - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      for (const j of nb) {
        if (j >= 0 && !seen[j] && !solid(j)) {
          seen[j] = 1
          queue[tail++] = j
        }
      }
    }
    if (!touchesEdge && tail <= maxArea) {
      for (let q = 0; q < tail; q++) {
        const j = queue[q] * 4
        data[j] = 255
        data[j + 1] = 255
        data[j + 2] = 255
        data[j + 3] = 255
      }
    }
  }
}

/**
 * Dựng ảnh có viền trắng.
 * @param imageUrl ảnh đã tách nền (PNG trong suốt), URL cùng nguồn với app
 * @param borderImgPx bề dày viền tính theo px của ẢNH (không phải px trang)
 */
export async function buildStickerBorder(imageUrl: string, borderImgPx: number): Promise<StickerBorderResult> {
  const r = Math.min(MAX_RADIUS, Math.max(0, borderImgPx))
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error('Không tải được ảnh để dựng viền')
  const bmp = await createImageBitmap(await res.blob())
  const natW = bmp.width
  const natH = bmp.height
  if (natW * natH > 40_000_000) throw new Error('Ảnh quá lớn để dựng viền')

  // 1. khung người: vùng có alpha
  const probe = makeCanvas(natW, natH)
  const pctx = probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  pctx.drawImage(bmp, 0, 0)
  const px = pctx.getImageData(0, 0, natW, natH).data
  let x0 = natW
  let y0 = natH
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < natH; y++) {
    for (let x = 0; x < natW; x++) {
      if (px[(y * natW + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error('Ảnh không có vùng nhìn thấy (đã trong suốt hết)')
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const pad = Math.ceil(r) + MARGIN
  const outW = bw + 2 * pad
  const outH = bh + 2 * pad
  const offX = x0 - pad
  const offY = y0 - pad

  // 2. mặt nạ ở độ phân giải làm việc
  const k = Math.min(1, WORK_MAX / Math.max(outW, outH))
  const ww = Math.max(1, Math.round(outW * k))
  const wh = Math.max(1, Math.round(outH * k))
  const rw = r * k
  const sil = makeCanvas(ww, wh)
  const sctx = sil.getContext('2d') as CanvasRenderingContext2D
  sctx.drawImage(bmp, -offX * k, -offY * k, natW * k, natH * k)
  sctx.globalCompositeOperation = 'source-in'
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, ww, wh)

  let mask = sil
  if (rw > 0.5) {
    const dil = makeCanvas(ww, wh)
    const dctx = dil.getContext('2d') as CanvasRenderingContext2D
    dctx.drawImage(sil, 0, 0)
    for (const f of [1, 0.55]) {
      const rad = rw * f
      const steps = Math.min(120, Math.max(16, Math.ceil((Math.PI * rad) / 1.2)))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        dctx.drawImage(sil, Math.cos(a) * rad, Math.sin(a) * rad)
      }
    }
    // 3. làm mượt: mờ rồi ngưỡng → bo góc, lấp khe hẹp
    const sm = makeCanvas(ww, wh)
    const mctx = sm.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    mctx.filter = `blur(${Math.max(1, rw * 0.3)}px)`
    mctx.drawImage(dil, 0, 0)
    mctx.filter = 'none'
    const img = mctx.getImageData(0, 0, ww, wh)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i + 3] - 96) / 64) * 255)) // 96..160 → 0..255: mép mềm nhẹ
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = v
    }
    // 4. lấp lỗ kín nhỏ (diện tích dưới ~(4 × bề dày viền)²)
    fillSmallHoles(d, ww, wh, Math.max(16, Math.round((4 * rw) ** 2)))
    mctx.putImageData(img, 0, 0)
    mask = sm
  }

  // 5. ghép: mặt nạ trắng (phóng lên khổ đầy đủ) + ảnh gốc ở trên
  const out = makeCanvas(outW, outH)
  const octx = out.getContext('2d') as CanvasRenderingContext2D
  octx.imageSmoothingQuality = 'high'
  if (rw > 0.5) octx.drawImage(mask, 0, 0, outW, outH)
  octx.drawImage(bmp, -offX, -offY)
  bmp.close()
  const blob: Blob | null = await new Promise((resolve) => {
    out.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('Không tạo được ảnh PNG có viền')
  return { blob, natW, natH, outW, outH, offX, offY, margin: MARGIN }
}
