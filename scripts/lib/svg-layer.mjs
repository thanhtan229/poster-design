// [TINIX] Lớp SVG đổi màu được cho trang cắt dán dựng bằng script (quy tắc 4.12 trong DESIGN-RULES.md).
// widget w-svg của app (src/components/modules/widgets/wSvg/wSvg.vue) đọc mã SVG trong `svgUrl`; thuộc tính nào có giá trị
// đúng bằng "{{colors[i]}}" sẽ lấy màu thứ i của `colors` → người dùng đổi màu từng phần ngay trong editor.
import crypto from 'node:crypto'

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i
const PAINT_ATTR = /\b(fill|stroke|stop-color)="([^"]+)"/g

/**
 * Thay các màu viết thẳng trong thuộc tính fill / stroke / stop-color bằng chỗ đặt màu {{colors[i]}}.
 * Không đụng tới màu trong <filter> (viền trắng, bóng của hiệu ứng) để hiệu ứng giữ nguyên khi đổi màu.
 * fixed: danh sách màu không cho đổi (ví dụ màu viền giấy trắng).
 */
export function tokenizeColors(body, fixed = []) {
  const palette = []
  const keep = new Set(fixed.map((c) => c.toLowerCase()))
  const out = body.replace(PAINT_ATTR, (all, attr, value) => {
    const v = value.trim()
    if (!COLOR.test(v) || keep.has(v.toLowerCase())) return all
    let i = palette.findIndex((c) => c.toLowerCase() === v.toLowerCase())
    if (i < 0) i = palette.push(v) - 1
    return `${attr}="{{colors[${i}]}}"`
  })
  return { body: out, colors: palette }
}

/**
 * Đổi tên id trong <defs> (bộ lọc, mẫu tô) thành id riêng theo nội dung: nhiều SVG nội tuyến trên cùng một trang
 * mà trùng id "sh" thì trình duyệt dùng chung bộ lọc đầu tiên (vùng bóng sai kích thước → bóng bị cắt).
 * Hai hình giống hệt nhau có cùng id cũng không sao vì định nghĩa giống nhau.
 */
export function uniqueIds(markup) {
  const hash = crypto.createHash('sha1').update(markup).digest('hex').slice(0, 8)
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  let out = markup
  for (const id of new Set(ids)) {
    const nid = `${id}-${hash}`
    out = out.split(`id="${id}"`).join(`id="${nid}"`).split(`url(#${id})`).join(`url(#${nid})`).split(`href="#${id}"`).join(`href="#${nid}"`)
  }
  return out
}

/** Mã SVG hoàn chỉnh (đã thay màu bằng chỗ đặt màu, id riêng) + bảng màu */
export function buildSvgMarkup(w, h, body, defs = '', fixed = ['#fffdf8', '#fffaf0', '#ffffff']) {
  const t = tokenizeColors(body, fixed)
  const markup = uniqueIds(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${t.body}</svg>`)
  return { markup, colors: t.colors }
}

/** Lớp w-svg khớp widget thật của app (wSvgSetting.ts) + các trường in/cắt của trang cắt dán */
export function svgLayer({ name, markup, colors, left, top, width, height, printRole = 'raised', extra = {} }) {
  return {
    name, type: 'w-svg', uuid: crypto.randomUUID(), width, height, left, top, colors, zoom: 1, transform: '', radius: 0, opacity: 1, parent: '-1',
    svgUrl: markup, setting: [], rotate: 0, lock: false, record: { width, height, minWidth: 10, minHeight: 10 },
    printRole, templateRole: 'fixed', ...extra,
  }
}
