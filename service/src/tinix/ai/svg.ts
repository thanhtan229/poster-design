/**
 * [TINIX] Làm sạch SVG do AI viết (biểu tượng, nét trang trí đơn giản) trước khi đưa vào editor.
 *
 * Chỉ giữ một danh sách thẻ + thuộc tính an toàn để vẽ hình; bỏ mọi thứ khác (script, style, href, on*, text,
 * foreignObject, image…). Kết quả luôn là một `<svg>` do chính server dựng lại từ viewBox + phần thân đã lọc.
 * Không dùng cú pháp TS mới: service biên dịch bằng TypeScript 3.9.
 */

const TAGS: { [k: string]: boolean } = { g: true, path: true, line: true, polyline: true, polygon: true, circle: true, ellipse: true, rect: true }
const DRAWABLE: { [k: string]: boolean } = { path: true, line: true, polyline: true, polygon: true, circle: true, ellipse: true, rect: true }
const ATTRS: { [k: string]: boolean } = {
  d: true, x: true, y: true, x1: true, y1: true, x2: true, y2: true, cx: true, cy: true, r: true, rx: true, ry: true,
  width: true, height: true, points: true, fill: true, stroke: true, 'stroke-width': true, 'stroke-linecap': true,
  'stroke-linejoin': true, 'fill-opacity': true, 'stroke-opacity': true, opacity: true, 'fill-rule': true, transform: true,
}
const VALUE_OK = /^[#A-Za-z0-9 .,\-+%()]*$/
const MAX_INNER = 8000
const MAX_ELEMENTS = 80

export type CleanSvg = { svg: string; viewW: number; viewH: number }

/** Trả về svg đã lọc, hoặc null nếu không còn gì để vẽ. */
export function cleanSvg(raw: any): CleanSvg | null {
  if (typeof raw !== 'string') return null
  const src = raw.trim().slice(0, 20000)
  const root = /<svg\b([^>]*)>/i.exec(src)
  if (!root) return null
  const vb = /viewBox\s*=\s*"([^"]*)"/i.exec(root[1])
  let viewW = 100
  let viewH = 100
  if (vb) {
    const n = vb[1].trim().split(/[\s,]+/).map(Number)
    if (n.length === 4 && n[2] > 0 && n[3] > 0 && isFinite(n[2]) && isFinite(n[3])) {
      viewW = Math.min(2000, n[2])
      viewH = Math.min(2000, n[3])
    }
  }

  let inner = ''
  let count = 0
  let drawable = 0
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    if (name === 'svg' || !TAGS[name]) continue
    if (closing) {
      if (name === 'g') inner += '</g>'
      continue
    }
    if (++count > MAX_ELEMENTS) break
    let attrs = ''
    const attrRe = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*"([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(m[3]))) {
      const key = a[1].toLowerCase()
      if (!ATTRS[key] || !VALUE_OK.test(a[2])) continue
      attrs += ' ' + key + '="' + a[2] + '"'
    }
    if (DRAWABLE[name]) drawable++
    inner += '<' + name + attrs + (m[4] === '/' || name !== 'g' ? '/>' : '>')
  }
  // cân bằng thẻ <g>
  const opens = (inner.match(/<g\b[^/]*?>/g) || []).length
  const closes = (inner.match(/<\/g>/g) || []).length
  if (opens > closes) inner += new Array(opens - closes + 1).join('</g>')
  else if (closes > opens) return null
  if (!drawable || inner.length > MAX_INNER) return null

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + viewW + ' ' + viewH + '" preserveAspectRatio="none">' + inner + '</svg>'
  return { svg, viewW, viewH }
}
