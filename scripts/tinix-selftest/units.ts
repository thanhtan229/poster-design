// [TINIX] Kiểm thử đơn vị cm ↔ px + DPI và việc ghi DPI vào PNG (client + server cho kết quả giống nhau, sharp đọc lại đúng).
import { cmToPx, pxToCm, clampDpi, sizeWarning, PRINT_SIZES, DEFAULT_DPI } from '../../src/utils/tinix/units'
import { setPngDpi } from '../../src/utils/tinix/png-dpi'
import { pngWithDpi } from '../../service/src/tinix/pngDpi'
const sharp = require('../../service/node_modules/sharp')

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else { failed++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

async function main() {
  console.log('Quy đổi cm ↔ px')
  check('30 cm @300 = 3543 px', cmToPx(30, 300) === 3543, cmToPx(30, 300))
  check('A4 21 × 29.7 cm @300 = 2480 × 3508 px', cmToPx(21, 300) === 2480 && cmToPx(29.7, 300) === 3508, [cmToPx(21, 300), cmToPx(29.7, 300)])
  check('3543 px @300 = 30.0 cm', pxToCm(3543, 300) === 30, pxToCm(3543, 300))
  check('vòng cm → px → cm ổn định với mọi khổ in', PRINT_SIZES.every((s) => pxToCm(cmToPx(s.w, 300), 300) === s.w && pxToCm(cmToPx(s.h, 150), 150) === s.h), PRINT_SIZES.filter((s) => pxToCm(cmToPx(s.w, 300), 300) !== s.w).map((s) => s.key))
  check('DPI sai/rỗng → mặc định, bị kẹp 36..1200', clampDpi(0) === DEFAULT_DPI && clampDpi('x') === DEFAULT_DPI && clampDpi(5) === 36 && clampDpi(99999) === 1200 && clampDpi('150') === 150)
  check('cảnh báo cạnh > 10000 và > 60 triệu điểm ảnh', sizeWarning(10001, 100) === 'side' && sizeWarning(8268, 11220) === 'side' && sizeWarning(7000, 9000) === 'pixels' && sizeWarning(3543, 4724) === '')

  console.log('Ghi DPI vào PNG (pHYs)')
  const base: Buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff0000' } }).png().toBuffer()
  check('PNG gốc chưa có DPI 300', (await sharp(base).metadata()).density !== 300)
  const server = pngWithDpi(base, 300)
  const m = await sharp(server).metadata()
  check('server: sharp đọc lại density = 300, kích thước giữ nguyên', m.density === 300 && m.width === 64 && m.height === 48, m)
  const client = Buffer.from(setPngDpi(new Uint8Array(base), 300))
  check('client và server cho cùng một kết quả', Buffer.compare(client, server) === 0)
  const again = pngWithDpi(server, 150)
  const m2 = await sharp(again).metadata()
  check('ghi lần hai thay pHYs cũ (không nhân đôi chunk), density = 150', m2.density === 150 && again.length === server.length, [m2.density, again.length, server.length])
  const px = await sharp(server).raw().toBuffer()
  const px0 = await sharp(base).raw().toBuffer()
  check('điểm ảnh không đổi', Buffer.compare(px, px0) === 0)
  const notPng = Buffer.from('not a png at all, just some bytes of text here....')
  check('dữ liệu không phải PNG được giữ nguyên', pngWithDpi(notPng, 300) === notPng)

  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra đơn vị/DPI đạt')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('TEST FAILED', e); process.exit(1) })
