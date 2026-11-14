// [TINIX] Nhóm mẫu thiết kế: một mẫu thuộc nhiều nhóm (bảng template_group_links, khóa theo id).
// templates.cate luôn được đồng bộ = tên nhóm đầu tiên (theo sort, id) hoặc '' để trang quản trị/nhập PSD cũ còn chạy.
import { getDB } from '../db/index'
import { GROUP_RULES, groupKey, suggestGroupsForTitle } from './groupSuggest'

type TemplateType = 0 | 1
export type GroupRow = { id: number; name: string; type: number; sort: number; created_at: string; count: number }

const placeholders = (n: number) => new Array(n).fill('?').join(',')
const uniqInts = (xs: any): number[] => {
  const out: number[] = []
  if (!Array.isArray(xs)) return out
  for (const x of xs) {
    const n = Math.floor(Number(x))
    if (n > 0 && out.indexOf(n) < 0) out.push(n)
  }
  return out
}

/** Đồng bộ templates.cate = tên nhóm chính của các mẫu */
export function syncPrimary(templateIds: number[]): void {
  const db = getDB()
  const ids = uniqInts(templateIds)
  if (!ids.length) return
  const pick = db.prepare(`SELECT c.name AS name FROM template_group_links l JOIN template_categories c ON c.id = l.category_id
    WHERE l.template_id = ? ORDER BY c.sort ASC, c.id ASC LIMIT 1`)
  const set = db.prepare('UPDATE templates SET cate = ? WHERE id = ?')
  for (const id of ids) {
    const row = pick.get(id)
    set.run(row ? row.name : '', id)
  }
}

/** Nhóm của từng mẫu: { [templateId]: [categoryId,...] } */
export function getGroupsByTemplates(templateIds: number[]): Record<number, number[]> {
  const ids = uniqInts(templateIds)
  const out: Record<number, number[]> = {}
  if (!ids.length) return out
  const rows = getDB().prepare(`SELECT template_id, category_id FROM template_group_links WHERE template_id IN (${placeholders(ids.length)}) ORDER BY category_id`).all(...ids)
  for (const r of rows) (out[r.template_id] = out[r.template_id] || []).push(r.category_id)
  return out
}

/** Danh sách nhóm + số mẫu đang hiển thị (state = 1) của từng nhóm; kèm số mẫu chưa phân nhóm */
export function listGroupsWithCount(type: TemplateType): { list: GroupRow[]; uncategorized: number; total: number } {
  const db = getDB()
  const list: GroupRow[] = db.prepare(`SELECT c.id, c.name, c.type, c.sort, c.created_at,
      (SELECT COUNT(*) FROM template_group_links l JOIN templates t ON t.id = l.template_id WHERE l.category_id = c.id AND t.state = 1 AND t.type = c.type) AS count
    FROM template_categories c WHERE c.type = ? ORDER BY c.sort ASC, c.id ASC`).all(type)
  const uncategorized = Number(db.prepare(`SELECT COUNT(*) AS n FROM templates t WHERE t.type = ? AND t.state = 1
    AND NOT EXISTS (SELECT 1 FROM template_group_links l WHERE l.template_id = t.id)`).get(type).n)
  const total = Number(db.prepare('SELECT COUNT(*) AS n FROM templates WHERE type = ? AND state = 1').get(type).n)
  return { list, uncategorized, total }
}

function existingCategoryIds(type: number, ids: number[]): number[] {
  if (!ids.length) return []
  const rows = getDB().prepare(`SELECT id FROM template_categories WHERE type = ? AND id IN (${placeholders(ids.length)})`).all(type, ...ids)
  return rows.map((r: any) => r.id)
}

/** Đặt lại toàn bộ nhóm của một mẫu. Trả về null nếu mẫu không tồn tại. */
export function setTemplateGroups(templateId: number, categoryIds: number[]): number[] | null {
  const db = getDB()
  const t = db.prepare('SELECT id, type FROM templates WHERE id = ?').get(templateId)
  if (!t) return null
  const ids = existingCategoryIds(t.type, uniqInts(categoryIds))
  db.transaction(() => {
    db.prepare('DELETE FROM template_group_links WHERE template_id = ?').run(templateId)
    const ins = db.prepare('INSERT OR IGNORE INTO template_group_links (template_id, category_id) VALUES (?, ?)')
    for (const c of ids) ins.run(templateId, c)
    syncPrimary([templateId])
  })()
  return ids
}

/** Thêm/gỡ nhóm cho nhiều mẫu cùng lúc (không đụng các nhóm khác của mẫu). Trả về số mẫu bị thay đổi. */
export function bulkAssign(templateIds: number[], addIds: number[], removeIds: number[]): number {
  const db = getDB()
  const tids = uniqInts(templateIds)
  if (!tids.length) return 0
  const rows: Array<{ id: number; type: number }> = db.prepare(`SELECT id, type FROM templates WHERE id IN (${placeholders(tids.length)})`).all(...tids)
  const add = uniqInts(addIds)
  const remove = uniqInts(removeIds)
  let changed = 0
  db.transaction(() => {
    const ins = db.prepare('INSERT OR IGNORE INTO template_group_links (template_id, category_id) VALUES (?, ?)')
    const del = db.prepare('DELETE FROM template_group_links WHERE template_id = ? AND category_id = ?')
    for (const t of rows) {
      const valid = existingCategoryIds(t.type, add)
      let touched = false
      for (const c of valid) if (ins.run(t.id, c).changes) touched = true
      for (const c of remove) if (del.run(t.id, c).changes) touched = true
      if (touched) changed++
    }
    syncPrimary(rows.map((r) => r.id))
  })()
  return changed
}

/** Gắn mẫu mới vào nhóm theo TÊN (luồng cũ: lưu mẫu kèm cate). Nhóm không tồn tại thì bỏ qua. */
export function attachByName(templateId: number, type: TemplateType, name: string): void {
  const key = groupKey(name)
  if (!key) return
  const cats: Array<{ id: number; name: string }> = getDB().prepare('SELECT id, name FROM template_categories WHERE type = ?').all(type)
  const cat = cats.find((c) => groupKey(c.name) === key)
  if (cat) bulkAssign([templateId], [cat.id], [])
}

/** Tên đã có (không phân biệt hoa thường/dấu) trong cùng loại? excludeId: bỏ qua chính nhóm đang đổi tên */
export function nameTaken(type: TemplateType, name: string, excludeId = 0): boolean {
  const key = groupKey(name)
  const cats: Array<{ id: number; name: string }> = getDB().prepare('SELECT id, name FROM template_categories WHERE type = ?').all(type)
  return cats.some((c) => c.id !== excludeId && groupKey(c.name) === key)
}

/** Sắp xếp lại: ids theo thứ tự mới (các nhóm không có trong ids xếp sau cùng, giữ thứ tự cũ) */
export function reorderGroups(type: TemplateType, ids: number[]): void {
  const db = getDB()
  const order = uniqInts(ids)
  db.transaction(() => {
    const set = db.prepare('UPDATE template_categories SET sort = ? WHERE id = ? AND type = ?')
    order.forEach((id, i) => set.run(i + 1, id, type))
    const all: number[] = db.prepare('SELECT id FROM template_categories WHERE type = ? ORDER BY sort, id').all(type).map((r: any) => r.id)
    const rest = all.filter((id) => order.indexOf(id) < 0)
    rest.forEach((id, i) => set.run(order.length + i + 1, id, type))
    // tên nhóm chính phụ thuộc thứ tự → đồng bộ lại cho mọi mẫu có nhóm
    syncPrimary(db.prepare('SELECT DISTINCT template_id AS id FROM template_group_links').all().map((r: any) => r.id))
  })()
}

export function groupUsage(id: number): number {
  return Number(getDB().prepare('SELECT COUNT(*) AS n FROM template_group_links WHERE category_id = ?').get(id).n)
}

/** Xóa nhóm: gỡ khỏi mọi mẫu rồi xóa (mẫu KHÔNG bị xóa). Trả về số mẫu bị gỡ, hoặc -1 nếu nhóm không tồn tại. */
export function deleteGroupDetach(id: number): number {
  const db = getDB()
  if (!db.prepare('SELECT id FROM template_categories WHERE id = ?').get(id)) return -1
  let affected = 0
  db.transaction(() => {
    const tids: number[] = db.prepare('SELECT template_id AS id FROM template_group_links WHERE category_id = ?').all(id).map((r: any) => r.id)
    affected = tids.length
    db.prepare('DELETE FROM template_group_links WHERE category_id = ?').run(id)
    db.prepare('DELETE FROM template_categories WHERE id = ?').run(id)
    syncPrimary(tids)
  })()
  return affected
}

// ── Gợi ý theo tên ──
export type Suggestion = { id: number; title: string; cover: string; groups: string[] }

/** Mẫu chưa có nhóm nào + nhóm gợi ý theo tên (chỉ mẫu có gợi ý). Không bao giờ đụng mẫu đã có nhóm. */
export function suggestForUngrouped(): { items: Suggestion[]; unmatched: number; toCreate: string[] } {
  const db = getDB()
  const rows: Array<{ id: number; title: string; cover: string }> = db.prepare(`SELECT t.id, t.title, t.cover FROM templates t
    WHERE t.type = 0 AND t.state = 1 AND NOT EXISTS (SELECT 1 FROM template_group_links l WHERE l.template_id = t.id) ORDER BY t.id DESC`).all()
  const items: Suggestion[] = []
  let unmatched = 0
  for (const r of rows) {
    const groups = suggestGroupsForTitle(r.title)
    if (groups.length) items.push({ id: r.id, title: r.title, cover: r.cover, groups })
    else unmatched++
  }
  const have: string[] = db.prepare('SELECT name FROM template_categories WHERE type = 0').all().map((c: any) => groupKey(c.name))
  const need: string[] = []
  for (const it of items) for (const g of it.groups) if (have.indexOf(groupKey(g)) < 0 && need.indexOf(g) < 0) need.push(g)
  const toCreate = GROUP_RULES.map((r) => r.group).filter((g) => need.indexOf(g) >= 0)
  return { items, unmatched, toCreate }
}

/** Áp dụng gợi ý cho các mẫu đã duyệt: tạo nhóm còn thiếu rồi thêm liên kết (chỉ THÊM, tính lại theo tên mẫu ở server, mẫu đã có nhóm bị bỏ qua) */
export function applySuggestions(templateIds: number[]): { assigned: number; created: string[] } {
  const db = getDB()
  const wanted = uniqInts(templateIds)
  const sug = suggestForUngrouped().items.filter((i) => wanted.indexOf(i.id) >= 0)
  const created: string[] = []
  let assigned = 0
  db.transaction(() => {
    const cats: Array<{ id: number; name: string }> = db.prepare('SELECT id, name FROM template_categories WHERE type = 0').all()
    let maxSort = Number(db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM template_categories WHERE type = 0').get().m)
    const idFor = (name: string): number => {
      const found = cats.find((c) => groupKey(c.name) === groupKey(name))
      if (found) return found.id
      maxSort += 1
      const id = Number(db.prepare('INSERT INTO template_categories (name, type, sort) VALUES (?, 0, ?)').run(name, maxSort).lastInsertRowid)
      cats.push({ id, name })
      created.push(name)
      return id
    }
    for (const it of sug) {
      const ids = it.groups.map(idFor)
      assigned += bulkAssign([it.id], ids, []) ? 1 : 0
    }
  })()
  return { assigned, created }
}
