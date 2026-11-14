/**
 * [TINIX] Xuất thiết kế hiện tại thành file PSD (mỗi lớp cấp cao nhất là một layer).
 *
 * - Nền trang: một layer "Background" (màu nền + ảnh nền nếu có).
 * - Mỗi widget cấp cao nhất (chữ, ảnh, svg, qrcode, nhóm) được chụp riêng bằng html2canvas thành một layer, đúng vị trí/kích thước,
 *   giữ độ mờ (opacity) và xoay (chụp ở góc 0 rồi xoay lại). Layer chữ có thêm dữ liệu text (nội dung, font, cỡ, màu) để Photoshop nhận ra là chữ.
 * - Lớp đang ẩn xuất thành layer ẩn (Photoshop hiện được), lớp đổi tên giữ tên.
 * - Trang rất lớn (> 60 triệu điểm ảnh) bỏ ảnh tổng hợp để không tràn bộ nhớ; các layer vẫn đủ.
 */
import { writePsd } from 'ag-psd'
import type { Psd, Layer } from 'ag-psd'
import html2canvas from 'html2canvas'
import { useOriginalImages } from './hq-images' // [TINIX]

type W = Record<string, any>

const MAX_COMPOSITE_PIXELS = 60_000_000

function parseColor(c: string): { r: number; g: number; b: number; a: number } {
  const s = String(c || '').trim()
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
  m = s.match(/^#([0-9a-f]{3})$/i)
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 }
  m = s.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/i)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
  return { r: 255, g: 255, b: 255, a: 0 }
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Layer nền: màu nền + ảnh nền (phủ kín trang, giữ tỉ lệ kiểu cover). */
async function backgroundLayer(page: W): Promise<Layer> {
  const c = newCanvas(page.width, page.height)
  const g = c.getContext('2d')!
  const col = parseColor(page.backgroundColor)
  g.fillStyle = col.a === 0 ? '#ffffff' : `rgba(${col.r},${col.g},${col.b},${col.a})`
  g.fillRect(0, 0, c.width, c.height)
  const img = await loadImage(page.backgroundImage)
  if (img) {
    const k = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight)
    const w = img.naturalWidth * k, h = img.naturalHeight * k
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h)
  }
  return { name: 'Background', left: 0, top: 0, canvas: c }
}

/**
 * Bản sao canvas trang đặt ngoài màn hình, không có transform zoom: html2canvas đo kích thước thật của từng widget
 * (canvas đang xem bị `transform: scale(zoom)` nên đo trực tiếp sẽ ra kích thước đã thu nhỏ).
 */
function makeOffscreenClone(page: W): { root: HTMLElement; dispose: () => void } {
  const live = document.getElementById('page-design-canvas') as HTMLElement | null
  if (!live) throw new Error('Không tìm thấy trang thiết kế')
  const wrap = document.createElement('div')
  wrap.style.cssText = `position:fixed;left:-200000px;top:0;width:${page.width}px;height:${page.height}px;overflow:visible;pointer-events:none;`
  const root = live.cloneNode(true) as HTMLElement
  root.removeAttribute('id')
  root.style.transform = 'none'
  root.style.transformOrigin = '0 0'
  root.style.position = 'relative'
  root.style.left = '0'
  root.style.top = '0'
  root.style.margin = '0'
  root.style.width = page.width + 'px'
  root.style.height = page.height + 'px'
  root.querySelectorAll('.moveable-control-box, .shelter, .shelter-bg, .line-guides').forEach((n) => n.parentNode && n.parentNode.removeChild(n))
  wrap.appendChild(root)
  document.body.appendChild(wrap)
  return { root, dispose: () => wrap.parentNode && wrap.parentNode.removeChild(wrap) }
}

/** Chụp riêng một widget (không xoay, không mờ) thành canvas đúng kích thước widget. */
async function rasterizeWidget(root: HTMLElement, w: W, fonts: Array<{ value: string; url: string }>): Promise<HTMLCanvasElement | null> {
  const el = root.querySelector(`[data-uuid="${w.uuid}"]`) as HTMLElement | null
  if (!el) return null
  el.style.transform = 'none'
  el.style.opacity = '1'
  el.style.display = '' // lớp ẩn vẫn phải chụp được
  el.style.visibility = 'visible'
  try {
    // chữ có thể tràn ra ngoài khung widget: lấy theo kích thước nội dung (scroll) để không bị cắt
    const width = Math.max(el.offsetWidth, el.scrollWidth)
    const height = Math.max(el.offsetHeight, el.scrollHeight)
    return await html2canvas(el, {
      backgroundColor: null,
      scale: 1,
      useCORS: true,
      logging: false,
      width,
      height,
      // html2canvas vẽ trong một iframe bản sao: font nạp bằng FontFace ở trang chính không có ở đó → chữ rơi về font khác, xuống dòng và bị cắt.
      // Chèn @font-face của các font đang dùng vào bản sao và chờ nạp xong trước khi vẽ.
      onclone: async (doc: Document) => {
        if (!fonts.length) return
        const st = doc.createElement('style')
        st.textContent = fonts.map((f) => `@font-face{font-family:"${f.value}";src:url(${JSON.stringify(f.url)});}`).join(' ')
        doc.head.appendChild(st)
        try {
          await Promise.all(fonts.map((f) => doc.fonts.load(`40px "${f.value}"`, 'Aa')))
          await doc.fonts.ready
        } catch (e) {
          // không nạp được: vẫn chụp với font dự phòng
        }
      },
    })
  } catch (e) {
    return null
  }
}

/** Xoay canvas quanh tâm; trả về canvas mới và độ lệch (dx, dy) của góc trên trái so với layer gốc. */
function rotateCanvas(src: HTMLCanvasElement, deg: number): { canvas: HTMLCanvasElement; dx: number; dy: number } {
  const rad = (deg * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad))
  const nw = Math.ceil(src.width * cos + src.height * sin)
  const nh = Math.ceil(src.width * sin + src.height * cos)
  const c = newCanvas(nw, nh)
  const g = c.getContext('2d')!
  g.translate(nw / 2, nh / 2)
  g.rotate(rad)
  g.drawImage(src, -src.width / 2, -src.height / 2)
  return { canvas: c, dx: (src.width - nw) / 2, dy: (src.height - nh) / 2 }
}

function layerName(w: W): string {
  const raw = String(w.layerName || w.text || w.name || w.type || 'Layer').replace(/\s+/g, ' ').trim()
  return raw.slice(0, 60) || 'Layer'
}

async function widgetLayer(root: HTMLElement, w: W, fonts: Array<{ value: string; url: string }>): Promise<Layer | null> {
  const raster = await rasterizeWidget(root, w, fonts)
  if (!raster) return null
  const rot = parseFloat(String(w.rotate || 0)) || 0
  let canvas = raster
  let left = Number(w.left) || 0
  let top = Number(w.top) || 0
  if (rot) {
    const r = rotateCanvas(raster, rot)
    canvas = r.canvas
    left += r.dx
    top += r.dy
  }
  const layer: Layer = {
    name: layerName(w),
    left: Math.round(left),
    top: Math.round(top),
    canvas,
    opacity: w.opacity === undefined || w.opacity === '' ? 1 : Math.max(0, Math.min(1, Number(w.opacity))),
    hidden: !!w.hidden,
  }
  if (w.type === 'w-text' && !rot && w.text) {
    const col = parseColor(w.color)
    const size = Number(w.fontSize) || 24
    layer.text = {
      text: String(w.text).replace(/\n/g, '\r'),
      transform: [1, 0, 0, 1, Math.round(left), Math.round(top + size)],
      antiAlias: 'smooth',
      style: {
        font: { name: String(w.fontClass?.value || w.fontFamily || 'Arial') },
        fontSize: size,
        fillColor: { r: col.r, g: col.g, b: col.b },
        tracking: Math.round(((Number(w.letterSpacing) || 0) / size) * 1000),
      },
      paragraphStyle: { justification: w.textAlign === 'center' ? 'center' : w.textAlign === 'right' ? 'right' : 'left' },
    }
  }
  return layer
}

export async function buildPsd(page: W, widgets: W[], onProgress?: (done: number, total: number) => void): Promise<Psd> {
  const top = widgets.filter((w) => String(w.parent) === '-1' || w.parent === undefined)
  const children: Layer[] = [await backgroundLayer(page)]
  // font đang dùng trong thiết kế (để chèn vào iframe của html2canvas)
  const fontMap = new Map<string, { value: string; url: string }>()
  for (const w of widgets) if (w.fontClass && w.fontClass.value && w.fontClass.url) fontMap.set(w.fontClass.value, { value: w.fontClass.value, url: w.fontClass.url })
  const fonts = Array.from(fontMap.values())
  const clone = makeOffscreenClone(page)
  try {
    await useOriginalImages(clone.root, widgets) // ảnh gốc cho thành phẩm
    for (let i = 0; i < top.length; i++) {
      const l = await widgetLayer(clone.root, top[i], fonts)
      if (l) children.push(l)
      onProgress && onProgress(i + 1, top.length)
    }
  } finally {
    clone.dispose()
  }
  const psd: Psd = { width: Math.round(page.width), height: Math.round(page.height), children }
  // DPI của thiết kế (mặc định 300) để Photoshop mở đúng khổ in
  const dpi = Math.min(1200, Math.max(36, Math.round(Number(page.dpi) || 300)))
  psd.imageResources = { resolutionInfo: { horizontalResolution: dpi, horizontalResolutionUnit: 'PPI', widthUnit: 'Centimeters', verticalResolution: dpi, verticalResolutionUnit: 'PPI', heightUnit: 'Centimeters' } }
  // ảnh tổng hợp (Photoshop dùng cho xem trước nhanh): ghép các layer hiện
  if (psd.width * psd.height <= MAX_COMPOSITE_PIXELS) {
    const c = newCanvas(psd.width, psd.height)
    const g = c.getContext('2d')!
    for (const l of children) {
      if (l.hidden || !l.canvas) continue
      g.globalAlpha = l.opacity === undefined ? 1 : l.opacity
      g.drawImage(l.canvas as HTMLCanvasElement, l.left || 0, l.top || 0)
    }
    g.globalAlpha = 1
    psd.canvas = c
  }
  return psd
}

/** Dựng PSD và trả về Blob (application/octet-stream). */
export async function exportPsdBlob(page: W, widgets: W[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const psd = await buildPsd(page, widgets, onProgress)
  const buffer = writePsd(psd, { generateThumbnail: true, trimImageData: false })
  return new Blob([buffer], { type: 'application/octet-stream' })
}
