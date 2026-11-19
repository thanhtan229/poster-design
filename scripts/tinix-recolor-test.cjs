// [TINIX] Kiểm thử offline "Đổi màu chính" (src/utils/tinix/image-recolor.ts) bằng ảnh tổng hợp có đáp án biết trước.
const assert = require('node:assert/strict')
const { recolorPixels, paletteFromPixels, hexToRgb, rgbToHsl } = require('../src/utils/tinix/image-recolor.ts')

const px = (...colors) => Uint8ClampedArray.from(colors.flatMap((c) => (c.length === 4 ? c : [...c, 255])))
const at = (d, i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]]
const hue = (c) => rgbToHsl(c[0], c[1], c[2])[0]
const YELLOW = [224, 176, 80] // sao vàng
const BLUE = [48, 96, 208]

// 1) đổi vàng → xanh: điểm vàng thành xanh; viền trắng, bóng xám, điểm trong suốt giữ nguyên; điểm đỏ khác sắc giữ nguyên
{
  const d = px(YELLOW, [255, 253, 248], [60, 55, 50, 120], [0, 0, 0, 0], [208, 64, 64])
  const changed = recolorPixels(d, YELLOW, BLUE, 40)
  assert.equal(changed, 1, 'chỉ đổi đúng 1 điểm vàng')
  assert.deepEqual(at(d, 0).slice(0, 3), BLUE, 'vàng → đúng màu xanh đích')
  assert.deepEqual(at(d, 1), [255, 253, 248, 255], 'viền trắng giữ nguyên')
  assert.deepEqual(at(d, 2), [60, 55, 50, 120], 'bóng giữ nguyên')
  assert.deepEqual(at(d, 3), [0, 0, 0, 0], 'trong suốt giữ nguyên')
  assert.deepEqual(at(d, 4), [208, 64, 64, 255], 'màu đỏ (khác nhóm) giữ nguyên')
}
// 2) giữ sáng tối: vàng đậm hơn → xanh đậm hơn xanh đích, vẫn cùng sắc xanh
{
  const dark = [168, 124, 40]
  const d = px(dark)
  recolorPixels(d, YELLOW, BLUE, 40)
  const out = at(d, 0)
  assert.ok(Math.abs(hue(out) - hue(BLUE)) < 3, `sắc độ phải là xanh (đo ${hue(out).toFixed(1)})`)
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
  assert.ok(lum(out) < lum(BLUE), 'vùng đậm vẫn đậm hơn màu đích')
}
// 3) mép khử răng cưa (vàng pha trắng): đổi sang xanh nhạt, không bị bỏ sót hay thành vệt vàng
{
  const edge = [240, 216, 168]
  const d = px(edge)
  recolorPixels(d, YELLOW, BLUE, 40)
  const out = at(d, 0)
  assert.ok(Math.abs(hue(out) - hue(BLUE)) < 6, `mép phải ngả xanh (đo ${hue(out).toFixed(1)})`)
}
// 4) tolerance: sắc cam gần vàng chỉ đổi khi nới rộng
{
  const orange = [224, 128, 48]
  const narrow = px(orange); recolorPixels(narrow, YELLOW, BLUE, 0)
  assert.deepEqual(at(narrow, 0).slice(0, 3), orange, 'tolerance 0: cam giữ nguyên')
  const wide = px(orange); recolorPixels(wide, YELLOW, BLUE, 100)
  assert.notDeepEqual(at(wide, 0).slice(0, 3), orange, 'tolerance 100: cam cũng đổi')
}
// 5) màu nguồn trung tính (kem): so theo khoảng cách RGB, viền trắng tinh vẫn giữ
{
  const cream = [250, 243, 224]
  const d = px(cream, [120, 120, 200])
  recolorPixels(d, cream, hexToRgb('#e8607a'), 30)
  assert.notDeepEqual(at(d, 0).slice(0, 3), cream, 'kem đổi màu')
  assert.deepEqual(at(d, 1).slice(0, 3), [120, 120, 200], 'màu khác giữ nguyên')
}
// 6) bảng màu: bỏ viền trắng/bóng, xếp theo diện tích
{
  const d = px(...Array(60).fill(YELLOW), ...Array(30).fill(BLUE), ...Array(80).fill([255, 254, 250]), ...Array(20).fill([40, 40, 40, 140]))
  const pal = paletteFromPixels(d)
  assert.equal(pal.length, 2, 'chỉ 2 màu có sắc')
  assert.deepEqual(hexToRgb(pal[0].hex), YELLOW, 'màu chiếm nhiều nhất đứng đầu')
  assert.ok(Math.abs(pal[0].share - 60 / 90) < 0.01, 'tỉ lệ tính trên điểm có màu')
}
console.log('Đổi màu chính: OK')
