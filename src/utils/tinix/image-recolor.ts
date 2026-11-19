// [TINIX] Đổi màu chính của ảnh PNG phẳng (sticker, nhãn, hình giấy): thay đúng nhóm màu đã chọn bằng màu mới.
// Giữ sáng tối của từng điểm ảnh (không bị bệt), không đụng tới viền trắng, bóng xám/đen và vùng trong suốt.
// Phần xử lý điểm ảnh là hàm thuần (kiểm thử offline: scripts/tinix-recolor-test.cjs); phần đọc/ghi ảnh dùng canvas của trình duyệt.

export type Rgb = [number, number, number]
export type PaletteColor = { hex: string; share: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex || '').trim())
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** HSL: h 0–360, s và l 0–1 */
export function rgbToHsl(r255: number, g255: number, b255: number): [number, number, number] {
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s <= 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = (((h % 360) + 360) % 360) / 360
  const ch = (t0: number) => {
    const t = t0 < 0 ? t0 + 1 : t0 > 1 ? t0 - 1 : t0
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [ch(hk + 1 / 3) * 255, ch(hk) * 255, ch(hk - 1 / 3) * 255]
}

/** Độ đậm màu (chroma) 0–1. Khác độ bão hòa HSL: điểm trắng ngả vàng có bão hòa HSL rất cao nhưng chroma gần 0 */
export function chroma(r: number, g: number, b: number): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

/** Điểm ảnh trung tính (viền giấy trắng/kem nhạt, bóng xám/đen): không tính vào bảng màu */
function isNeutralEdge(r: number, g: number, b: number): boolean {
  return chroma(r, g, b) < 0.08
}

/**
 * Bảng màu chủ đạo: các nhóm màu chiếm nhiều điểm ảnh nhất (bỏ trong suốt, viền trắng, bóng).
 * data: RGBA. Trả về tối đa `max` màu, share = tỉ lệ trên tổng điểm ảnh có màu.
 */
export function paletteFromPixels(data: ArrayLike<number>, max = 5): PaletteColor[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (isNeutralEdge(r, g, b)) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    bin.n++
    bin.r += r
    bin.g += g
    bin.b += b
    bins.set(key, bin)
    total++
  }
  if (!total) return []
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n)
  const merged: { n: number; rgb: Rgb }[] = []
  for (const bin of sorted) {
    const rgb: Rgb = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n]
    const near = merged.find((m) => Math.hypot(m.rgb[0] - rgb[0], m.rgb[1] - rgb[1], m.rgb[2] - rgb[2]) < 40)
    if (near) {
      // gộp vào nhóm lớn hơn, giữ màu đại diện của nhóm lớn
      near.n += bin.n
    } else merged.push({ n: bin.n, rgb })
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .filter((m) => m.n / total >= 0.01)
    .slice(0, max)
    .map((m) => ({ hex: rgbToHex(m.rgb), share: m.n / total }))
}

/**
 * Đổi màu tại chỗ trên mảng RGBA.
 * tolerance 0–100: độ rộng nhóm màu được đổi (mặc định 40). Màu nguồn có sắc (bão hòa) thì so theo sắc độ (hue),
 * màu nguồn trung tính (kem, xám) thì so theo khoảng cách RGB.
 * Trả về số điểm ảnh đã đổi (trọng số > 0).
 */
export function recolorPixels(data: Uint8ClampedArray | Uint8Array, from: Rgb, to: Rgb, tolerance = 40): number {
  const [hs, , ls] = rgbToHsl(from[0], from[1], from[2])
  const [ht, st, lt] = rgbToHsl(to[0], to[1], to[2])
  const cs = chroma(from[0], from[1], from[2])
  const chromatic = cs >= 0.15
  const t = Math.max(0, Math.min(100, tolerance))
  const hueTol = 10 + t * 0.5 // độ
  const rgbTol = 30 + t * 1.5
  let changed = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, , l] = rgbToHsl(r, g, b)
    const c = chroma(r, g, b)
    let w: number
    if (chromatic) {
      if (c < 0.06) continue // trắng, kem rất nhạt, xám, đen: viền giấy và bóng giữ nguyên
      const dh = Math.min(Math.abs(h - hs), 360 - Math.abs(h - hs))
      w = (1 - smoothstep(hueTol * 0.6, hueTol, dh)) * smoothstep(0.06, 0.16, c)
    } else {
      const d = Math.hypot(r - from[0], g - from[1], b - from[2])
      w = 1 - smoothstep(rgbTol * 0.6, rgbTol, d)
    }
    if (w <= 0) continue
    // giữ sáng tối tương đối so với màu nguồn → vùng đậm/nhạt, khử răng cưa mép vẫn tự nhiên
    const nl = clamp01(lt + (l - ls))
    // mép pha trắng (chroma thấp hơn màu nguồn) → màu đích nhạt tương ứng
    const ns = clamp01(chromatic ? st * Math.min(1.2, c / cs) : st)
    const [nr, ng, nb] = hslToRgb(ht, ns, nl)
    data[i] = Math.round(r + (nr - r) * w)
    data[i + 1] = Math.round(g + (ng - g) * w)
    data[i + 2] = Math.round(b + (nb - b) * w)
    changed++
  }
  return changed
}

// ───────────── trình duyệt: đọc ảnh vào canvas, xuất PNG ─────────────

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Không tải được ảnh')
  return createImageBitmap(await res.blob())
}

function drawToCanvas(bmp: ImageBitmap, maxSide = 0): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(bmp.width, bmp.height)) : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

/** Bảng màu của ảnh (đọc ở độ phân giải thấp cho nhanh) */
export async function extractPalette(url: string, max = 5): Promise<PaletteColor[]> {
  const bmp = await loadBitmap(url)
  try {
    const { canvas, ctx } = drawToCanvas(bmp, 160)
    return paletteFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, max)
  } finally {
    bmp.close()
  }
}

/** Đổi màu toàn ảnh ở độ phân giải gốc, trả về PNG */
export async function recolorImage(url: string, from: string, to: string, tolerance: number): Promise<{ blob: Blob; changed: number }> {
  const bmp = await loadBitmap(url)
  try {
    const { canvas, ctx } = drawToCanvas(bmp)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const changed = recolorPixels(img.data, hexToRgb(from), hexToRgb(to), tolerance)
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('Không dựng được ảnh PNG')
    return { blob, changed }
  } finally {
    bmp.close()
  }
}

// ───────────── xem trước tức thì (khi đang kéo trong bảng màu) ─────────────

/** Ảnh đã thu nhỏ, đọc sẵn điểm ảnh một lần để mỗi lần đổi màu xem trước chỉ còn bước tính màu */
export type RecolorPreviewSource = { width: number; height: number; data: Uint8ClampedArray }

export async function loadPreviewSource(url: string, maxSide = 400): Promise<RecolorPreviewSource> {
  const bmp = await loadBitmap(url)
  try {
    const { canvas, ctx } = drawToCanvas(bmp, maxSide)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { width: canvas.width, height: canvas.height, data: img.data }
  } finally {
    bmp.close()
  }
}

/**
 * Dựng bản xem trước đã đổi màu, trả về data URL PNG.
 * Dùng toDataURL (đồng bộ) thay cho toBlob: toBlob bị trình duyệt xếp lịch chạy nền, đo được ~1 giây mỗi lần
 * trong khi tính màu chỉ ~2 ms; ảnh xem trước nhỏ (≤ 400 px) nên mã hóa đồng bộ chỉ vài ms.
 */
export function renderPreview(src: RecolorPreviewSource, from: string, to: string, tolerance: number): string {
  const data = new Uint8ClampedArray(src.data)
  recolorPixels(data, hexToRgb(from), hexToRgb(to), tolerance)
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.putImageData(new ImageData(data, src.width, src.height), 0, 0)
  return canvas.toDataURL('image/png')
}
