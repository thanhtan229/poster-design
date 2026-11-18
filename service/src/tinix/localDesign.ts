// [TINIX] Hỗ trợ lưu/mở thiết kế dạng tệp trên máy: kiểm tra ảnh còn thiếu và ghi lại ảnh khi mở tệp từ máy khác.
// Ảnh được ghi đúng đường dẫn cũ (/static/photos/..., /static/collage/...) nên thiết kế mở lại không cần sửa URL.
// Service biên dịch bằng TypeScript 3.9: giữ cú pháp đơn giản.
import express from 'express'
import fs from 'fs'
import path from 'path'
import { filePath } from '../configs'

const router = express.Router()
const ALLOWED = /^\/static\/(photos|collage|user|favorites)\/.+\.(png|jpe?g|webp|gif)$/i

function resolveAsset(value: any): string {
  const text = String(value || '')
  if (!ALLOWED.test(text) || text.indexOf('..') >= 0 || text.indexOf('\\') >= 0 || text.indexOf('\0') >= 0) throw new Error('Đường dẫn ảnh không hợp lệ')
  const root = path.resolve(filePath)
  const absolute = path.resolve(root, text.slice('/static/'.length))
  if (absolute.indexOf(root + path.sep) !== 0) throw new Error('Đường dẫn ảnh nằm ngoài thư mục tĩnh')
  return absolute
}

function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true // PNG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true // JPEG
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true
  return buffer.toString('ascii', 0, 4) === 'GIF8'
}

// Trả về các đường dẫn chưa có trên máy này (đường dẫn không hợp lệ cũng tính là thiếu để client bỏ qua).
router.post('/api/tinix/local-assets/missing', (req: any, res: any) => {
  try {
    const paths = req.body && req.body.paths
    if (!Array.isArray(paths) || paths.length > 5000) throw new Error('Danh sách ảnh không hợp lệ')
    const missing: string[] = []
    const invalid: string[] = []
    for (const value of paths) {
      try {
        if (!fs.existsSync(resolveAsset(value))) missing.push(String(value))
      } catch (_) {
        invalid.push(String(value))
      }
    }
    res.json({ missing, invalid })
  } catch (e) {
    res.status(400).json({ message: (e as Error).message })
  }
})

// Ghi một ảnh vào đúng đường dẫn; không ghi đè ảnh đã có.
router.put('/api/tinix/local-asset', express.raw({ type: () => true, limit: '300mb' }), (req: any, res: any) => {
  try {
    const target = resolveAsset(req.query.path)
    const body = req.body
    if (!Buffer.isBuffer(body) || !looksLikeImage(body)) throw new Error('Tệp không phải ảnh hợp lệ')
    if (fs.existsSync(target)) return res.json({ skipped: true })
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body, { flag: 'wx' })
    res.json({ written: true })
  } catch (e) {
    res.status(400).json({ message: (e as Error).message })
  }
})

export default router
