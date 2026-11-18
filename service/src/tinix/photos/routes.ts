/**
 * [TINIX] Ảnh người dùng tải lên (dải ảnh phía dưới editor). Mọi route cần đăng nhập.
 *
 *   POST /api/tinix/photos/upload          multipart: file, lastModified?, name?   → { duplicate, photo }
 *   GET  /api/tinix/photos                  → { list, favorites: [{hash,url,hq,cate}], total }
 *   POST /api/tinix/photos/import          { items: [{url,web_url,thumb_url,width,height,hash,size,taken_at,name}] } → { list, skipped }
 *   POST /api/tinix/photos/delete           { id, inUse?: [url] }
 *   POST /api/tinix/photos/clear-preview    { inUse?: [url] }   → { total, deletable, kept }
 *   POST /api/tinix/photos/clear            { inUse?: [url] }   → { removed, filesDeleted, kept }
 *   POST /api/tinix/photos/unused-preview   { inUse?: [url], olderThanDays? } → { total, count, kept, bytes }  (ảnh chưa thuộc thiết kế/mẫu nào)
 *   POST /api/tinix/photos/unused-clear     { inUse?: [url], olderThanDays? } → { removed, bytes, kept }
 *   POST /api/tinix/photos/favorite         { id, cate? | newName? } → { item, created, cate, catName }  (thêm vào nhóm trong tab Ảnh)
 *   POST /api/tinix/photos/unfavorite       { hash, inUse?: [url] }
 * `inUse`: các URL ảnh đang nằm trên canvas (kể cả thiết kế chưa lưu) — không bao giờ xóa tệp của chúng.
 */
import express from 'express'
import multiparty from 'multiparty'
import { send } from '../../utils/tools'
import { getRequestUser } from '../../utils/auth'
import { MAX_BYTES, addFavorite, backfillLegacy, clearAll, clearPreview, clearUnused, deletePhoto, importPhoto, ingestPhoto, libraryFavorites, listPhotos, removeFavorite, unusedPreview } from './core'

const router = express.Router()
const PREFIX = '/api/tinix/photos'

function requireLogin(req: any, res: any, next: () => void) {
  if (!getRequestUser(req)) return res.json({ code: 401, msg: 'Vui lòng đăng nhập' })
  next()
}
const uid = (req: any): number => (getRequestUser(req) as any).id
const urls = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).slice(0, 5000) : [])

const handle = (fn: (body: any, req: any) => Promise<any> | any) => async (req: any, res: any) => {
  try {
    send.success(res, await fn(req.body || {}, req))
  } catch (e) {
    const msg = (e && (e as any).message) || String(e)
    console.warn('[tinix:photos]', req.path, msg)
    send.error(res, msg)
  }
}

router.post(`${PREFIX}/upload`, requireLogin, (req: any, res: any) => {
  const form = new multiparty.Form({ maxFilesSize: MAX_BYTES + 1024 * 1024 })
  form.parse(req, async (err: any, fields: any, files: any) => {
    if (err) return send.error(res, /maxFilesSize/i.test(String(err.message)) ? `Ảnh lớn hơn ${Math.round(MAX_BYTES / 1048576)} MB` : 'Lỗi khi nhận tệp ảnh')
    const file = files && files.file ? files.file[0] : null
    if (!file || !file.path) return send.error(res, 'Thiếu tệp')
    try {
      const name = (fields && fields.name && fields.name[0]) || file.originalFilename || ''
      const lastModified = Number(fields && fields.lastModified && fields.lastModified[0]) || 0
      send.success(res, await ingestPhoto(file.path, String(name), lastModified, uid(req)))
    } catch (e) {
      const msg = (e && (e as any).message) || String(e)
      console.warn('[tinix:photos] upload', msg)
      send.error(res, msg)
    }
  })
})

router.get(`${PREFIX}`, requireLogin, handle(async (_b, req) => {
  await backfillLegacy(uid(req)) // ảnh tải lên từ trước: bổ sung hash/ảnh nhẹ/ảnh thu nhỏ (một lần)
  const list = listPhotos(uid(req))
  return { list, favorites: libraryFavorites(), total: list.length }
}))
// Mở tệp dự án: đăng ký lại ảnh vừa được ghi vào static/photos
router.post(`${PREFIX}/import`, requireLogin, handle(async (b, req) => {
  const items: any[] = Array.isArray(b.items) ? b.items.slice(0, 2000) : []
  const list = items.map((x) => importPhoto(x, uid(req))).filter((x) => !!x)
  return { list, skipped: items.length - list.length }
}))
router.post(`${PREFIX}/delete`, requireLogin, handle(async (b, req) => deletePhoto(Number(b.id), uid(req), urls(b.inUse))))
router.post(`${PREFIX}/clear-preview`, requireLogin, handle(async (b, req) => clearPreview(uid(req), urls(b.inUse))))
router.post(`${PREFIX}/clear`, requireLogin, handle(async (b, req) => clearAll(uid(req), urls(b.inUse))))
const days = (v: any): number => Math.max(0, Math.min(3650, Math.floor(Number(v) || 0)))
router.post(`${PREFIX}/unused-preview`, requireLogin, handle(async (b, req) => unusedPreview(uid(req), urls(b.inUse), days(b.olderThanDays))))
router.post(`${PREFIX}/unused-clear`, requireLogin, handle(async (b, req) => clearUnused(uid(req), urls(b.inUse), days(b.olderThanDays))))
router.post(`${PREFIX}/favorite`, requireLogin, handle(async (b, req) => {
  const r = addFavorite(Number(b.id), uid(req), { cate: b.cate ? String(b.cate) : '', newName: b.newName ? String(b.newName) : '' })
  if (!r) throw new Error('Không tìm thấy ảnh')
  return r
}))
router.post(`${PREFIX}/unfavorite`, requireLogin, handle(async (b) => removeFavorite(String(b.hash || ''), urls(b.inUse))))

export default router
