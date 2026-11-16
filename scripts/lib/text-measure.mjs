// [TINIX] Đo chữ bằng Chromium của Puppeteer (có sẵn trong service): cùng engine với bộ render nên khớp kerning, font biến thiên, woff2...
// Font nạp từ chính máy chủ Tinix (`base` + url trong kho font). Trả về hàm `measure(request)`; gọi `close()` khi xong.
import { createRequire } from 'node:module'

const puppeteer = () => createRequire(import.meta.url)('../../service/node_modules/puppeteer')

/**
 * @param {string} base URL máy chủ Tinix, ví dụ http://127.0.0.1:7001 (để tải font)
 * @returns {{measure: function, close: function}}
 */
export function createChromiumMeasurer(base) {
  let browser = null, page = null
  const loaded = new Set()
  const ensure = async () => {
    if (page) return page
    // như service ở chế độ development: dùng Chromium đi kèm Puppeteer
    browser = await puppeteer().launch({ headless: true, args: ['--no-first-run', '--no-sandbox'] })
    page = await browser.newPage()
    // Điều hướng tới chính máy chủ Tinix (đường dẫn nào cũng được, kể cả 404): trang about:blank có nguồn gốc khác nên Chromium chặn tải font
    // từ máy chủ ('NetworkError'); trang cùng nguồn gốc thì tải được như trong ứng dụng thật.
    await page.goto(new URL('/__tinix-measure__', base).href, { waitUntil: 'domcontentloaded' })
    return page
  }
  async function measure({ family, url, text, size, letterSpacing = 0, lineHeight = 1.2 }) {
    const p = await ensure()
    const key = family + '|' + url
    const fontUrl = new URL(url, base).href
    const result = await p.evaluate(async (family, fontUrl, preload, text, size, letterSpacing) => {
      if (!preload) {
        const face = new FontFace(family, `url(${JSON.stringify(fontUrl)})`)
        await face.load()
        document.fonts.add(face)
      }
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = `${size}px "${family}"`
      ctx.letterSpacing = `${letterSpacing}px`
      const lines = text.split('\n').map((line) => ctx.measureText(line))
      const first = lines[0], last = lines[lines.length - 1]
      return {
        width: Math.max(...lines.map((m) => m.width)),
        inkWidth: Math.max(...lines.map((m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight)),
        ascent: first.actualBoundingBoxAscent,
        descent: last.actualBoundingBoxDescent,
        fontAscent: first.fontBoundingBoxAscent,
        fontDescent: first.fontBoundingBoxDescent,
      }
    }, family, fontUrl, loaded.has(key), text, size, letterSpacing)
    loaded.add(key)
    return result
  }
  return { measure, close: async () => { if (browser) await browser.close(); browser = null; page = null } }
}
