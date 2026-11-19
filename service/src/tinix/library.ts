/**
 * [TINIX] Thư viện thành phần (tab Chữ = mẫu type=1) và chất liệu (tab Chất liệu = bảng materials) cho editor:
 * xem thông tin, tạo mới, lưu đè, đổi tên / danh mục / loại, nhân bản, XÓA HẲN (theo yêu cầu người dùng: không gỡ mềm).
 *
 * Chất liệu được xác định theo (danh mục, url) thay vì vị trí trong danh sách: xóa một mục không làm lệch các mục sau.
 * Thiết kế đã dùng một mục không bị ảnh hưởng khi sửa/xóa mục đó (thành phần được chép vào thiết kế; tệp ảnh chất liệu được giữ).
 * Ảnh bìa thành phần chụp bằng dịch vụ chụp ảnh (cần chạy `npm run tinix:prod`): trả `coverOk` để giao diện báo khi thất bại.
 */
import express from 'express'
import axios from '../utils/http'
import { serviceLink, staticLink } from '../configs'
import { getDB } from '../db'

const router = express.Router()
const fail = (res: any, e: any, code = 400) => res.status(code).json({ message: (e as Error).message || String(e) })
const MATERIAL_TYPES = ['image', 'svg', 'mask', 'background']

// ───────────────────────── Thành phần (templates type = 1) ─────────────────────────

/** Chụp ảnh bìa thành phần; true nếu chụp và lưu được */
async function captureCover(id: number, w: number, h: number): Promise<boolean> {
  // kiểm thử chạy trên DB tạm: không được gọi dịch vụ chụp ảnh thật (id thuộc DB khác)
  if (process.env.TINIX_LIBRARY_NO_COVER === '1') return false
  try {
    const size = w > h ? 640 : 320
    await axios.get(`${serviceLink}/api/screenshots?tempid=${id}&tempType=1&width=${w}&height=${h}&type=cover&size=${size}&quality=75`, { responseType: 'arraybuffer' })
    // ?v= chống bộ nhớ đệm ảnh bìa cũ khi lưu đè
    getDB().prepare('UPDATE templates SET cover = ? WHERE id = ?').run(`${staticLink}${id}-screenshot.png?v=${Date.now()}`, id)
    return true
  } catch (e) {
    console.warn('[tinix:library] chụp ảnh bìa thất bại:', (e as Error).message)
    return false
  }
}

function compRow(id: number): any {
  return getDB().prepare('SELECT id, title, cover, width, height, cate, data FROM templates WHERE id = ? AND type = 1').get(id)
}

/** Kiểm tra dữ liệu thành phần: mảng lớp, có đúng một nhóm gốc ở cuối (cách tab Chữ chèn thành phần) */
function checkWidgets(widgets: any): string {
  if (!Array.isArray(widgets) || !widgets.length) throw new Error('Thiếu dữ liệu thành phần')
  if (widgets.length > 500) throw new Error('Thành phần quá nhiều lớp')
  const last = widgets[widgets.length - 1]
  if (!last || last.type !== 'w-group') throw new Error('Thành phần phải là một nhóm (nhóm đặt cuối danh sách lớp)')
  return JSON.stringify(widgets)
}

router.get('/api/tinix/library/comp/:id', (req: any, res: any) => {
  try {
    const r = compRow(Number(req.params.id))
    if (!r) return res.status(404).json({ message: 'Không tìm thấy thành phần' })
    res.json({ id: r.id, title: r.title, cover: r.cover, width: r.width, height: r.height, cate: r.cate })
  } catch (e) {
    fail(res, e, 500)
  }
})

/** Tạo mới (không có id) hoặc lưu đè (có id). Chỉ đổi các trường được gửi lên. */
router.post('/api/tinix/library/comp/save', async (req: any, res: any) => {
  try {
    const b = req.body || {}
    const id = Number(b.id) || 0
    const hasData = b.widgets !== undefined
    const data = hasData ? checkWidgets(b.widgets) : ''
    const w = Number(b.width)
    const h = Number(b.height)
    if (hasData && !(w > 0 && h > 0)) throw new Error('Kích thước thành phần không hợp lệ')
    const title = b.title === undefined ? undefined : String(b.title).trim().slice(0, 100)
    const cate = b.cate === undefined ? undefined : String(b.cate).trim().slice(0, 100)
    const db = getDB()
    let tid = id
    if (!id) {
      if (!hasData) throw new Error('Thiếu dữ liệu thành phần')
      tid = Number(db.prepare(`INSERT INTO templates (title, cover, width, height, state, type, cate, data) VALUES (?, '', ?, ?, 1, 1, ?, ?)`).run(title || 'Thành phần', w, h, cate || '', data).lastInsertRowid)
    } else {
      if (!compRow(id)) return res.status(404).json({ message: 'Không tìm thấy thành phần' })
      if (title !== undefined) db.prepare('UPDATE templates SET title = ? WHERE id = ? AND type = 1').run(title || 'Thành phần', id)
      if (cate !== undefined) db.prepare('UPDATE templates SET cate = ? WHERE id = ? AND type = 1').run(cate, id)
      if (hasData) db.prepare('UPDATE templates SET data = ?, width = ?, height = ? WHERE id = ? AND type = 1').run(data, w, h, id)
    }
    const coverOk = hasData ? await captureCover(tid, w, h) : true
    res.json({ id: tid, coverOk })
  } catch (e) {
    fail(res, e)
  }
})

router.post('/api/tinix/library/comp/duplicate', async (req: any, res: any) => {
  try {
    const r = compRow(Number(req.body?.id))
    if (!r) return res.status(404).json({ message: 'Không tìm thấy thành phần' })
    const tid = Number(getDB().prepare(`INSERT INTO templates (title, cover, width, height, state, type, cate, data) VALUES (?, '', ?, ?, 1, 1, ?, ?)`).run(`${r.title || 'Thành phần'} (bản sao)`.slice(0, 100), r.width, r.height, r.cate || '', r.data).lastInsertRowid)
    // ảnh bìa riêng: ảnh bìa đặt tên theo id, dùng chung tệp với bản gốc thì lưu đè bản gốc sẽ đổi cả ảnh bìa bản sao
    const coverOk = await captureCover(tid, Number(r.width), Number(r.height))
    res.json({ id: tid, coverOk })
  } catch (e) {
    fail(res, e)
  }
})

/** Xóa hẳn (theo yêu cầu người dùng). Tệp ảnh bìa để lại cho tác vụ dọn tệp mồ côi. */
router.post('/api/tinix/library/comp/delete', (req: any, res: any) => {
  try {
    const id = Number(req.body?.id)
    if (!(id > 0)) throw new Error('Tham số không hợp lệ')
    const n = getDB().prepare('DELETE FROM templates WHERE id = ? AND type = 1').run(id).changes
    if (!n) return res.status(404).json({ message: 'Không tìm thấy thành phần' })
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

// ───────────────────────── Chất liệu (bảng materials: mỗi danh mục một danh sách JSON) ─────────────────────────

function readList(cate: string): any[] | null {
  const row: any = getDB().prepare('SELECT list FROM materials WHERE cate = ?').get(cate)
  if (!row) return null
  try {
    const list = JSON.parse(row.list)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}
function writeList(cate: string, list: any[]) {
  getDB().prepare('UPDATE materials SET list = ? WHERE cate = ?').run(JSON.stringify(list), cate)
}
const sameUrl = (a: any, b: any) => String(a || '').trim() === String(b || '').trim()

function findAsset(cate: string, url: string): { list: any[]; index: number } {
  const list = readList(cate)
  if (!list) throw new Error('Không tìm thấy danh mục chất liệu')
  const index = list.findIndex((it) => it && sameUrl(it.url, url))
  if (index < 0) throw new Error('Không tìm thấy chất liệu (có thể đã bị sửa hoặc xóa ở nơi khác)')
  return { list, index }
}

function cleanAsset(a: any): any {
  const type = a.type === 'png' ? 'image' : String(a.type || 'image')
  if (!MATERIAL_TYPES.includes(type)) throw new Error('Loại chất liệu không hợp lệ')
  const url = String(a.url || '').trim()
  if (!url) throw new Error('Thiếu đường dẫn chất liệu')
  const out: any = { ...a, type, url, thumb: String(a.thumb || url), title: String(a.title || '').slice(0, 100) }
  if (type === 'mask') out.isContainer = true
  else delete out.isContainer
  if (type === 'svg' && !out.model) out.model = '{}'
  return out
}

router.post('/api/tinix/library/material/create', (req: any, res: any) => {
  try {
    const cate = String(req.body?.cate || '').trim()
    const list = readList(cate)
    if (!list) throw new Error('Không tìm thấy danh mục chất liệu')
    const asset = cleanAsset(req.body?.asset || {})
    if (list.some((it) => it && sameUrl(it.url, asset.url))) throw new Error('Chất liệu này đã có trong danh mục')
    list.push(asset)
    writeList(cate, list)
    res.json({ ok: true, asset })
  } catch (e) {
    fail(res, e)
  }
})

/** Sửa / lưu đè: patch {title, type, url, thumb, model}; toCate: chuyển sang danh mục khác */
router.post('/api/tinix/library/material/update', (req: any, res: any) => {
  try {
    const cate = String(req.body?.cate || '').trim()
    const toCate = String(req.body?.toCate || cate).trim()
    const patch = req.body?.patch || {}
    const { list, index } = findAsset(cate, String(req.body?.url || ''))
    const next = cleanAsset({ ...list[index], ...patch })
    const db = getDB()
    if (toCate === cate) {
      list[index] = next
      writeList(cate, list)
    } else {
      const target = readList(toCate)
      if (!target) throw new Error('Không tìm thấy danh mục đích')
      db.transaction(() => {
        list.splice(index, 1)
        target.push(next)
        writeList(cate, list)
        writeList(toCate, target)
      })()
    }
    res.json({ ok: true, asset: next, cate: toCate })
  } catch (e) {
    fail(res, e)
  }
})

/** Xóa hẳn khỏi thư viện. Tệp ảnh được giữ: thiết kế cũ có thể vẫn dùng. */
router.post('/api/tinix/library/material/delete', (req: any, res: any) => {
  try {
    const cate = String(req.body?.cate || '').trim()
    const { list, index } = findAsset(cate, String(req.body?.url || ''))
    list.splice(index, 1)
    writeList(cate, list)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

export default router
