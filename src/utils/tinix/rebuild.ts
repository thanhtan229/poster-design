/**
 * [TINIX] "Dựng theo mẫu": turn the AI layout of a reference design into editable widgets on the current page.
 * Regions are 0..1 ratios of the reference; they are mapped onto the current page size.
 */
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { wSvgSetting } from '@/components/modules/widgets/wSvg/wSvgSetting'
import { ensureFont, measureLines } from './psd-fit'

export type TRebuildRegion = Record<string, any> & { type: 'text' | 'photo' | 'shape' | 'svg'; bbox: { x: number; y: number; w: number; h: number } }

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))

/** Grey dashed frame with a hint — the user swaps it with "Thay ảnh". */
export function photoPlaceholder(w: number, h: number, dark = false): string {
  const bg = dark ? '#7f8490' : '#e9e9ee', line = dark ? '#b9bcc7' : '#b4b4c2', label = dark ? '#e4e5ea' : '#8a8a99'
  const fs = Math.max(14, Math.round(Math.min(w, h) / 14))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}"><rect width="100%" height="100%" fill="${bg}"/><rect x="${fs / 2}" y="${fs / 2}" width="${Math.max(1, w - fs)}" height="${Math.max(1, h - fs)}" fill="none" stroke="${line}" stroke-width="${Math.max(2, fs / 6)}" stroke-dasharray="${fs} ${fs / 1.5}"/><text x="50%" y="50%" font-family="sans-serif" font-size="${fs}" fill="${label}" text-anchor="middle" dominant-baseline="middle">${esc('Ảnh của bạn')}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

function shapeSvg(shape: string, color: string, w: number, h: number): string {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h))
  const body =
    shape === 'ellipse'
      ? `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2}" ry="${H / 2}" fill="${color}"/>`
      : shape === 'rounded'
        ? `<rect width="${W}" height="${H}" rx="${Math.min(W, H) * 0.12}" fill="${color}"/>`
        : `<rect width="${W}" height="${H}" fill="${color}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`
}

export async function buildRebuildWidgets(regions: TRebuildRegion[], page: { width: number; height: number }, opts: { photoUrl?: string } = {}) {
  const W = page.width, H = page.height
  const out: any[] = []
  // [TINIX] mẫu có chữ sáng nằm đè ảnh: dùng khung ảnh tối hơn để chữ trắng vẫn nhìn thấy khi chưa thay ảnh
  const lum = (hex: string) => {
    const h6 = String(hex || '#222222').replace('#', '')
    const full = h6.length === 3 ? h6.split('').map((c) => c + c).join('') : h6.slice(0, 6)
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }
  // [TINIX] ảnh nền AI tạo (tương tự mẫu, không chữ) thay khung giữ chỗ của vùng photo lớn nhất
  const photos = regions.filter((r) => r.type === 'photo')
  const bigPhoto = photos.sort((a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h)[0]
  const texts = regions.filter((r) => r.type === 'text')
  const lightText = texts.length > 0 && texts.filter((r) => lum(r.color) > 0.75).length / texts.length >= 0.5
  for (const r of regions) {
    const left = Math.round(r.bbox.x * W), top = Math.round(r.bbox.y * H)
    const width = Math.max(10, Math.round(r.bbox.w * W)), height = Math.max(4, Math.round(r.bbox.h * H))

    if (r.type === 'photo') {
      const w = JSON.parse(JSON.stringify(wImageSetting))
      const generated = !!opts.photoUrl && r === bigPhoto
      Object.assign(w, { name: generated ? 'AI · Ảnh nền (tương tự)' : 'AI · Khung ảnh', imgUrl: generated ? opts.photoUrl : photoPlaceholder(width, height, lightText), left, top, width, height })
      out.push(w)
    } else if (r.type === 'shape') {
      const thin = r.shape === 'line'
      const h2 = thin ? Math.max(2, Math.min(height, Math.round(H * 0.004))) : height
      const w = JSON.parse(JSON.stringify(wSvgSetting))
      Object.assign(w, { name: 'AI · Hình khối', svgUrl: shapeSvg(thin ? 'rect' : r.shape, r.color || '#dddddd', width, h2), colors: [r.color || '#dddddd'], left, top, width, height: h2, opacity: r.opacity ?? 1 })
      w.record = { ...(w.record || {}), width, height: h2 }
      out.push(w)
    } else if (r.type === 'svg') {
      // [TINIX] biểu tượng / nét trang trí do AI vẽ (server đã lọc SVG an toàn)
      const w = JSON.parse(JSON.stringify(wSvgSetting))
      const svg = String(r.svg).replace('<svg ', `<svg width="${width}" height="${height}" `)
      Object.assign(w, { name: 'AI · Nét trang trí', svgUrl: svg /* wSvg parses this string as SVG markup (Snap.parse), not as a URL */, colors: [], left, top, width, height })
      w.record = { ...(w.record || {}), width, height }
      out.push(w)
    } else {
      const fc = r.fontClass
      if (fc) await ensureFont(fc.value, fc.url)
      const text = r.uppercase ? String(r.text).toUpperCase() : String(r.text)
      const family = fc?.value || r.fontFamily
      // AI gives the cap height as a ratio of the image height; CSS font-size ≈ cap height / 0.7
      let size = Math.max(10, (Number(r.fontSize) || 0.03) * H / 0.7)
      const font = (s: number) => ({ family, size: s, weight: String(r.weight || 400), style: r.italic ? 'italic' : 'normal', letterSpacing: r.letterSpacing || 0 })
      for (let i = 0; i < 30 && measureLines(text, font(size)) > width * 1.02 && size > 10; i++) size *= 0.93
      size = Math.round(size * 10) / 10
      const lines = text.split(/\r\n|\r|\n/).length
      // [TINIX] the box is approximate: widen it a little so a line that fits on the reference never wraps here
      const need = Math.ceil(measureLines(text, font(size)) * 1.1)
      let boxLeft = left, boxWidth = width
      if (need > boxWidth) {
        boxWidth = need
        const diff = need - width
        boxLeft = Math.max(0, Math.round(r.align === 'right' ? left - diff : r.align === 'left' ? left : left - diff / 2))
      }
      const w = JSON.parse(JSON.stringify(wTextSetting))
      Object.assign(w, {
        name: `AI · ${r.role || 'chữ'}`,
        text,
        fontFamily: family,
        fontSize: size,
        lineHeight: r.lineHeight || 1.2,
        letterSpacing: r.letterSpacing || 0,
        fontWeight: String(r.weight || 400),
        fontStyle: r.italic ? 'italic' : '',
        textAlign: r.align || 'center',
        color: r.color || '#222222',
        left: boxLeft,
        top,
        width: boxWidth,
        height: Math.max(height, Math.ceil(size * (r.lineHeight || 1.2) * lines)),
      })
      if (fc) w.fontClass = fc
      w.record = { ...(w.record || {}), width: boxWidth, height: w.height, minWidth: size, minHeight: size }
      out.push(w)
    }
  }
  separateTexts(out, H)
  return out
}

/**
 * [TINIX] The AI boxes are approximate: a multi-line or larger-than-expected text grows past its box and lands on the
 * text below. Push such widgets down (top-down order) so no two text boxes that share horizontal space overlap.
 */
function separateTexts(widgets: any[], pageHeight: number) {
  const texts = widgets.filter((w) => w.type === 'w-text').sort((a, b) => a.top - b.top)
  const gap = Math.max(4, Math.round(pageHeight * 0.004))
  for (let i = 1; i < texts.length; i++) {
    const cur = texts[i]
    for (let j = 0; j < i; j++) {
      const prev = texts[j]
      const shareX = cur.left < prev.left + prev.width && prev.left < cur.left + cur.width
      if (shareX && cur.top < prev.top + prev.height + gap && cur.top + cur.height > prev.top) cur.top = Math.round(prev.top + prev.height + gap)
    }
  }
  // keep the pushed texts inside the page
  for (const w of texts) if (w.top + w.height > pageHeight) w.top = Math.max(0, Math.round(pageHeight - w.height))
}
