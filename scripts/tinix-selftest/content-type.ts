// [TINIX] Kiểm thử Content-Type của /static: hàm getContentType + máy chủ Express dựng đúng thứ tự middleware của service/src/main.ts.
// Chạy: node scripts/tinix-selftest/run-ts.cjs content-type.ts   (hoặc npm run tinix:test)
import { getContentType, setUploadContentType } from '../../service/src/utils/content-type'
import fs from 'fs'
import path from 'path'
const express = require('../../service/node_modules/express')

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else { failed++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

async function main() {
  console.log('getContentType')
  const expected: { [file: string]: string } = {
    '/static/a.jpg': 'image/jpeg', '/static/a.JPEG': 'image/jpeg', '/static/a.png': 'image/png', '/static/a.gif': 'image/gif',
    '/static/a.svg': 'image/svg+xml', '/static/a.webp': 'image/webp',
    '/static/fonts/AmaticSC-Regular.ttf': 'font/ttf', '/static/fonts/LNTH-Marker-Felt.TTF': 'font/ttf',
    '/static/fonts/SVN-Lumios-Marker.otf': 'font/otf', '/static/fonts/x.woff': 'font/woff', '/static/fonts/be-vietnam-pro-400.woff2': 'font/woff2',
  }
  for (const f of Object.keys(expected)) check(`${f} → ${expected[f]}`, getContentType(f) === expected[f], getContentType(f))
  check('đuôi lạ (.json, .txt) không ghi đè → null', getContentType('/static/a.json') === null && getContentType('/static/a.txt') === null)
  check('không có đuôi → null', getContentType('/static/README') === null && getContentType('') === null && getContentType(undefined) === null)
  check('khóa kế thừa (.constructor, .toString) không lọt vào → null', getContentType('/static/a.constructor') === null && getContentType('/static/a.toString') === null && getContentType('/static/a.__proto__') === null)
  check('chỉ xét đuôi cuối (a.ttf.json → null, a.json.ttf → font/ttf)', getContentType('/static/a.ttf.json') === null && getContentType('/static/a.json.ttf') === 'font/ttf')

  console.log('Máy chủ thật (đúng thứ tự middleware của main.ts)')
  const dir = path.resolve(process.cwd(), 'static-fixture')
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true })
  const files: { [rel: string]: string } = { 'fonts/a.ttf': 'ttf', 'fonts/b.woff2': 'woff2', 'img.webp': 'webp', 'img.png': 'png', 'data.json': '{"a":1}', 'notes.txt': 'hello' }
  for (const rel of Object.keys(files)) fs.writeFileSync(path.join(dir, rel), files[rel])
  const app = express()
  // sao chép app.all('*') của main.ts: gắn application/json cho MỌI phản hồi
  app.all('*', (_req: any, res: any, next: any) => { res.header('Content-Type', 'application/json;charset=utf-8'); next() })
  app.use('/static', setUploadContentType, express.static(dir))
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const base = 'http://127.0.0.1:' + server.address().port
  try {
    const type = async (rel: string) => { const r = await fetch(base + '/static/' + rel); return { status: r.status, type: String(r.headers.get('content-type') || '') } }
    const font = await type('fonts/a.ttf'); check('.ttf → font/ttf (không còn application/json)', font.status === 200 && font.type.startsWith('font/ttf'), font)
    const woff2 = await type('fonts/b.woff2'); check('.woff2 → font/woff2', woff2.status === 200 && woff2.type.startsWith('font/woff2'), woff2)
    const webp = await type('img.webp'); check('.webp → image/webp', webp.status === 200 && webp.type.startsWith('image/webp'), webp)
    const png = await type('img.png'); check('.png vẫn image/png', png.status === 200 && png.type.startsWith('image/png'), png)
    const json = await type('data.json'); check('.json vẫn application/json (không bị ghi đè)', json.status === 200 && json.type.startsWith('application/json'), json)
    const txt = await type('notes.txt'); check('đuôi lạ (.txt) giữ hành vi cũ application/json', txt.status === 200 && txt.type.startsWith('application/json'), txt)
    const missing = await type('fonts/none.ttf'); check('tệp không tồn tại → 404', missing.status === 404, missing)
  } finally {
    // đóng hết kết nối keep-alive của fetch rồi mới đóng máy chủ, và chờ đóng xong
    await new Promise<void>((resolve) => { server.close(() => resolve()); if (typeof server.closeAllConnections === 'function') server.closeAllConnections() })
  }
  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra Content-Type đạt')
  // KHÔNG gọi process.exit(): trên Windows nó có thể sập libuv ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", mã 3221226505)
  // khi còn handle đang đóng; đặt exitCode để tiến trình tự thoát khi mọi handle đã đóng.
  process.exitCode = failed ? 1 : 0
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
