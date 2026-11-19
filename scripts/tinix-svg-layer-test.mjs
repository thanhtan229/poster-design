// [TINIX] Kiểm thử offline lớp SVG đổi màu của bộ dựng cắt dán (scripts/lib/svg-layer.mjs, quy tắc 4.12).
import assert from 'node:assert/strict'
import { tokenizeColors, uniqueIds, buildSvgMarkup, svgLayer } from './lib/svg-layer.mjs'

// 1) màu tô thành chỗ đặt màu theo thứ tự xuất hiện; màu trùng dùng chung một chỗ; giấy trắng và 'none'/url() giữ nguyên
{
  const { body, colors } = tokenizeColors('<path fill="#E0B050" stroke="#fffdf8"/><circle fill="#3060d0"/><rect fill="#e0b050" stroke="none"/><path fill="url(#g)"/>', ['#fffdf8'])
  assert.deepEqual(colors, ['#E0B050', '#3060d0'])
  assert.equal(body, '<path fill="{{colors[0]}}" stroke="#fffdf8"/><circle fill="{{colors[1]}}"/><rect fill="{{colors[0]}}" stroke="none"/><path fill="url(#g)"/>')
}
// 2) màu trong bộ lọc (flood-color) không bị đổi → viền trắng, bóng giữ nguyên khi người dùng đổi màu
{
  const { body } = tokenizeColors('<feFlood flood-color="#fffaf0"/><path fill="#c0392b"/>')
  assert.match(body, /flood-color="#fffaf0"/)
  assert.match(body, /fill="\{\{colors\[0\]\}\}"/)
}
// 3) id riêng theo nội dung: hai bộ lọc khác nhau không trùng id; cùng nội dung thì cùng id; mọi url(#id) được đổi theo
{
  const a = uniqueIds('<svg><defs><filter id="sh" width="100"/></defs><g filter="url(#sh)"/></svg>')
  const b = uniqueIds('<svg><defs><filter id="sh" width="200"/></defs><g filter="url(#sh)"/></svg>')
  const idA = /id="([^"]+)"/.exec(a)[1]
  assert.notEqual(idA, 'sh')
  assert.notEqual(idA, /id="([^"]+)"/.exec(b)[1], 'hai bộ lọc khác nhau phải khác id')
  assert.ok(a.includes(`url(#${idA})`), 'tham chiếu đổi theo id mới')
  assert.equal(a, uniqueIds('<svg><defs><filter id="sh" width="100"/></defs><g filter="url(#sh)"/></svg>'), 'cùng nội dung → cùng kết quả')
}
// 4) lớp w-svg khớp widget của app: svgUrl là mã SVG có viewBox, colors khớp số chỗ đặt màu
{
  const { markup, colors } = buildSvgMarkup(120, 80, '<g filter="url(#sh)"><path d="M0 0 L10 10 Z" fill="#e8607a" stroke="#fffdf8"/></g>', '<filter id="sh"><feDropShadow dx="0" dy="4"/></filter>')
  const l = svgLayer({ name: 'Tim', markup, colors, left: 10, top: 20, width: 120, height: 80 })
  assert.equal(l.type, 'w-svg')
  assert.match(l.svgUrl, /^<svg [^>]*viewBox="0 0 120 80"/)
  assert.deepEqual(l.colors, ['#e8607a'])
  assert.equal((l.svgUrl.match(/\{\{colors\[0\]\}\}/g) || []).length, 1)
  assert.ok(!/id="sh"/.test(l.svgUrl), 'id bộ lọc đã được đổi thành id riêng')
  assert.equal(l.printRole, 'raised')
  assert.deepEqual([l.left, l.top, l.width, l.height], [10, 20, 120, 80])
}
console.log('Lớp SVG đổi màu: OK')
