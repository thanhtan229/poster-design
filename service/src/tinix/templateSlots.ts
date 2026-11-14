// [TINIX] Khung ảnh của mẫu: lớp ảnh được đánh dấu `slot: true` trong chế độ sửa mẫu là chỗ đặt ảnh khi "Tự áp dụng mẫu".
// templates.photo_slots = số khung ảnh đã đánh dấu (0 = chưa đánh dấu → coi là mẫu 1 ảnh mặc định: ảnh phủ kín trang, nằm dưới lớp chữ).
import { getDB } from '../db/index'

/** Số khung ảnh trong dữ liệu mẫu ({page,widgets} hoặc [{global,layers}]; mẫu nhiều trang chỉ tính trang đầu) */
export function countPhotoSlots(data: string): number {
  let d: any
  try {
    d = JSON.parse(data)
  } catch (e) {
    return 0
  }
  // Bản ghi cũ có thể bọc dữ liệu thiết kế trong trường data, giống getDetail().
  if (d && typeof d.data === 'string') {
    try { d = JSON.parse(d.data) } catch (e) { return 0 }
  }
  const layers: any[] = Array.isArray(d) ? (d[0] && d[0].layers) || [] : Array.isArray(d && d.widgets) ? d.widgets : []
  let n = 0
  for (const w of layers) if (w && w.type === 'w-image' && w.slot === true && !w.hidden) n++
  return n
}

export function setPhotoSlots(id: number, data: string): number {
  const n = countPhotoSlots(data)
  getDB().prepare('UPDATE templates SET photo_slots = ? WHERE id = ?').run(n, id)
  return n
}

/** Tính lại cho mọi mẫu (khi vừa thêm cột) */
export function recountAllSlots(): number {
  const db = getDB()
  const rows: Array<{ id: number; data: string }> = db.prepare('SELECT id, data FROM templates').all()
  const set = db.prepare('UPDATE templates SET photo_slots = ? WHERE id = ?')
  let withSlots = 0
  db.transaction(() => {
    for (const r of rows) {
      const n = countPhotoSlots(r.data)
      if (n > 0) withSlots++
      set.run(n, r.id)
    }
  })()
  return withSlots
}

/**
 * Điều kiện SQL lọc theo số ảnh: '1' = mẫu 1 ảnh (kể cả chưa đánh dấu), '2'..'9' = đúng N khung, '5+' = từ 5 khung trở lên.
 * Trả về null nếu giá trị không hợp lệ.
 */
export function photosCondition(value: string): string | null {
  const v = String(value || '').trim()
  if (v === '5+') return 'photo_slots >= 5'
  if (!/^\d+$/.test(v)) return null
  const n = Number(v)
  if (n < 1 || n > 50) return null
  return n === 1 ? 'photo_slots <= 1' : `photo_slots = ${n}`
}

/** Số mẫu theo nhóm số ảnh (để hiện trên bộ lọc); where = điều kiện nhóm/tìm kiếm đã có, không gồm điều kiện số ảnh */
export function photoCountBuckets(where: string, params: Record<string, any>): Record<string, number> {
  const rows: Array<{ k: string; n: number }> = getDB()
    .prepare(`SELECT CASE WHEN photo_slots <= 1 THEN '1' WHEN photo_slots >= 5 THEN '5+' ELSE CAST(photo_slots AS TEXT) END AS k, COUNT(*) AS n FROM templates WHERE ${where} GROUP BY k`)
    .all(params)
  const out: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 }
  for (const r of rows) out[r.k] = Number(r.n)
  return out
}
