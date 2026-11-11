/**
 * [TINIX] "Dựng theo mẫu": turn the AI layout of a reference design into editable widgets on the current page.
 * Regions are 0..1 ratios of the reference; they are mapped onto the current page size.
 */
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { wSvgSetting } from '@/components/modules/widgets/wSvg/wSvgSetting'
import { ensureFont, measureLines } from './psd-fit'

export type TRebuildRegion = Record<string, any> & { type: 'text' | 'photo' | 'shape'; bbox: { x: number; y: number; w: number; h: number } }

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))

/** Grey dashed frame with a hint — the user swaps it with "Thay ảnh". */
export function photoPlaceholder(w: number, h: number): string {
  const fs = Math.max(14, Math.round(Math.min(w, h) / 14))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}"><rect width="100%" height="100%" fill="#e9e9ee"/><rect x="${fs / 2}" y="${fs / 2}" width="${Math.max(1, w - fs)}" height="${Math.max(1, h - fs)}" fill="none" stroke="#b4b4c2" stroke-width="${Math.max(2, fs / 6)}" stroke-dasharray="${fs} ${fs / 1.5}"/><text x="50%" y="50%" font-family="sans-serif" font-size="${fs}" fill="#8a8a99" text-anchor="middle" dominant-baseline="middle">${esc('Ảnh của bạn')}</text></svg>`
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

export async function buildRebuildWidgets(regions: TRebuildRegion[], page: { width: number; height: number }) {
  const W = page.width, H = page.height
  const out: any[] = []
  for (const r of regions) {
    const left = Math.round(r.bbox.x * W), top = Math.round(r.bbox.y * H)
    const width = Math.max(10, Math.round(r.bbox.w * W)), height = Math.max(4, Math.round(r.bbox.h * H))

    if (r.type === 'photo') {
      const w = JSON.parse(JSON.stringify(wImageSetting))
      Object.assign(w, { name: 'AI · Khung ảnh', imgUrl: photoPlaceholder(width, height), left, top, width, height })
      out.push(w)
    } else if (r.type === 'shape') {
      const thin = r.shape === 'line'
      const h2 = thin ? Math.max(2, Math.min(height, Math.round(H * 0.004))) : height
      const w = JSON.parse(JSON.stringify(wSvgSetting))
      Object.assign(w, { name: 'AI · Hình khối', svgUrl: shapeSvg(thin ? 'rect' : r.shape, r.color || '#dddddd', width, h2), colors: [r.color || '#dddddd'], left, top, width, height: h2, opacity: r.opacity ?? 1 })
      w.record = { ...(w.record || {}), width, height: h2 }
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
        left,
        top,
        width,
        height: Math.max(height, Math.ceil(size * (r.lineHeight || 1.2) * lines)),
      })
      if (fc) w.fontClass = fc
      w.record = { ...(w.record || {}), width, height: w.height, minWidth: size, minHeight: size }
      out.push(w)
    }
  }
  return out
}
