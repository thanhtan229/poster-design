// [TINIX] Mẫu cắt dán dùng chung bộ nhóm chủ đề với mẫu thường (template_categories, type = 0).
// Liên kết: collage_template_group_links(template_id, category_id). Nhóm có cờ hidden: mẫu chỉ thuộc nhóm ẩn
// không hiện ở "Tất cả" (vẫn xem được khi chọn đúng nhóm đó).
import { getDB } from '../db/index'
import { groupKey } from './templateGroups'

type Db = any
export type TemplateKind = 'all' | 'collage' | 'normal'

export function parseKind(v: any): TemplateKind {
  return v === 'collage' || v === 'normal' ? v : 'all'
}

function hasColumn(db: Db, table: string, col: string): boolean {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c: any) => c.name === col)
}

/** Số khung ảnh của mẫu cắt dán: lớp ảnh có slot (giống mẫu thường) */
export function collageSlots(layout: any): number {
  const layers: any[] = (layout && Array.isArray(layout.layers) && layout.layers) || []
  let n = 0
  for (const w of layers) if (w && w.type === 'w-image' && w.slot === true && !w.linkedPhotoId && !w.hidden) n++
  return n
}

/** Tạo bảng/cột cho mẫu cắt dán (idempotent). Gọi lúc khởi động (migrate) và trước mỗi truy vấn. */
export function ensureCollageSchema(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS collage_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS collage_template_versions(template_id INTEGER NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(template_id,version))`)
  if (!hasColumn(db, 'collage_templates', 'photo_slots')) {
    db.exec('ALTER TABLE collage_templates ADD COLUMN photo_slots INTEGER NOT NULL DEFAULT 0')
    const set = db.prepare('UPDATE collage_templates SET photo_slots = ? WHERE id = ?')
    for (const r of db.prepare('SELECT id, data FROM collage_templates').all()) {
      let layout: any = null
      try { layout = JSON.parse(r.data) } catch (e) { layout = null }
      set.run(collageSlots(layout), r.id)
    }
  }
  if (!hasColumn(db, 'collage_templates', 'used_at')) db.exec("ALTER TABLE collage_templates ADD COLUMN used_at TEXT NOT NULL DEFAULT ''")
  if (!hasColumn(db, 'templates', 'used_at')) db.exec("ALTER TABLE templates ADD COLUMN used_at TEXT NOT NULL DEFAULT ''")
  if (!hasColumn(db, 'template_categories', 'hidden')) db.exec('ALTER TABLE template_categories ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0')
  const hadLinks = !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collage_template_group_links'").get()
  if (hadLinks) return
  db.exec(`CREATE TABLE IF NOT EXISTS collage_template_group_links (template_id INTEGER NOT NULL, category_id INTEGER NOT NULL, PRIMARY KEY (template_id, category_id));
    CREATE INDEX IF NOT EXISTS idx_ctgl_category ON collage_template_group_links(category_id);`)
  // Chuyển danh mục cũ (collage_templates.category) thành nhóm chủ đề cùng tên — chỉ làm một lần
  let moved = 0
  db.transaction(() => {
    for (const r of db.prepare("SELECT id, category FROM collage_templates WHERE category != ''").all()) {
      const cid = findOrCreateGroup(db, r.category)
      if (cid && db.prepare('INSERT OR IGNORE INTO collage_template_group_links (template_id, category_id) VALUES (?, ?)').run(r.id, cid).changes) moved++
    }
  })()
  if (moved) console.log(`[tinix:migrate] collage_template_group_links: chuyển ${moved} mẫu cắt dán từ danh mục sang nhóm`)
}

function findOrCreateGroup(db: Db, name: string): number {
  const key = groupKey(name)
  if (!key) return 0
  const cats: Array<{ id: number; name: string }> = db.prepare('SELECT id, name FROM template_categories WHERE type = 0').all()
  const hit = cats.find((c) => groupKey(c.name) === key)
  if (hit) return hit.id
  const sort = Number(db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM template_categories WHERE type = 0').get().m) + 1
  const cols = db.prepare('PRAGMA table_info(template_categories)').all().map((c: any) => c.name)
  if (cols.indexOf('created_at') >= 0) return Number(db.prepare('INSERT INTO template_categories (name, type, sort, created_at) VALUES (?, 0, ?, ?)').run(String(name).trim(), sort, new Date().toISOString().replace('T', ' ').slice(0, 19)).lastInsertRowid)
  return Number(db.prepare('INSERT INTO template_categories (name, type, sort) VALUES (?, 0, ?)').run(String(name).trim(), sort).lastInsertRowid)
}

function db(): Db {
  const d = getDB()
  ensureCollageSchema(d)
  return d
}

/** Gắn mẫu cắt dán mới vào nhóm theo tên danh mục (script/CLI cũ còn gửi category). Nhóm chưa có thì tạo. */
export function attachCollageByName(templateId: number, name: string): void {
  const d = db()
  const cid = findOrCreateGroup(d, name)
  if (cid) d.prepare('INSERT OR IGNORE INTO collage_template_group_links (template_id, category_id) VALUES (?, ?)').run(templateId, cid)
}

export function collageGroupsByTemplate(): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const r of db().prepare('SELECT template_id, category_id FROM collage_template_group_links ORDER BY category_id').all()) (out[r.template_id] = out[r.template_id] || []).push(r.category_id)
  return out
}

export function setCollageGroups(templateId: number, categoryIds: any): number[] | null {
  const d = db()
  if (!d.prepare('SELECT id FROM collage_templates WHERE id = ?').get(templateId)) return null
  const wanted: number[] = []
  if (Array.isArray(categoryIds)) for (const x of categoryIds) { const n = Math.floor(Number(x)); if (n > 0 && wanted.indexOf(n) < 0) wanted.push(n) }
  const valid = wanted.filter((id) => !!d.prepare('SELECT id FROM template_categories WHERE id = ? AND type = 0').get(id))
  d.transaction(() => {
    d.prepare('DELETE FROM collage_template_group_links WHERE template_id = ?').run(templateId)
    const ins = d.prepare('INSERT OR IGNORE INTO collage_template_group_links (template_id, category_id) VALUES (?, ?)')
    for (const c of valid) ins.run(templateId, c)
  })()
  return valid
}

/** Điều kiện SQL "mẫu hiện ở Tất cả": chưa có nhóm hoặc có ít nhất một nhóm không ẩn. alias = bảng mẫu, links = bảng liên kết */
export function visibleCondition(alias: string, links: string): string {
  return `(NOT EXISTS (SELECT 1 FROM ${links} vl WHERE vl.template_id = ${alias}.id) OR EXISTS (SELECT 1 FROM ${links} vl JOIN template_categories vc ON vc.id = vl.category_id WHERE vl.template_id = ${alias}.id AND vc.hidden = 0))`
}

/** Phạm vi lọc nhóm cho mẫu cắt dán: cate = id nhóm | 'none' | '' (tất cả, bỏ mẫu chỉ thuộc nhóm ẩn) */
function collageScope(cate: string): { where: string; params: any[] } {
  if (cate === 'none') return { where: 'NOT EXISTS (SELECT 1 FROM collage_template_group_links l WHERE l.template_id = t.id)', params: [] }
  if (/^\d+$/.test(cate) && Number(cate) > 0) return { where: 'EXISTS (SELECT 1 FROM collage_template_group_links l WHERE l.template_id = t.id AND l.category_id = ?)', params: [Number(cate)] }
  return { where: visibleCondition('t', 'collage_template_group_links'), params: [] }
}

export function collageCounts(): { perGroup: Record<number, number>; uncategorized: number; total: number } {
  const d = db()
  const perGroup: Record<number, number> = {}
  for (const r of d.prepare('SELECT category_id AS id, COUNT(*) AS n FROM collage_template_group_links l JOIN collage_templates t ON t.id = l.template_id GROUP BY category_id').all()) perGroup[r.id] = Number(r.n)
  const uncategorized = Number(d.prepare(`SELECT COUNT(*) AS n FROM collage_templates t WHERE ${collageScope('none').where}`).get().n)
  const total = Number(d.prepare(`SELECT COUNT(*) AS n FROM collage_templates t WHERE ${collageScope('').where}`).get().n)
  return { perGroup, uncategorized, total }
}

export function collagePhotoBuckets(cate: string): Record<string, number> {
  const s = collageScope(cate)
  const rows = db().prepare(`SELECT CASE WHEN photo_slots <= 1 THEN '1' WHEN photo_slots >= 5 THEN '5+' ELSE CAST(photo_slots AS TEXT) END AS k, COUNT(*) AS n FROM collage_templates t WHERE ${s.where} GROUP BY k`).all(...s.params)
  const out: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 }
  for (const r of rows) out[r.k] = Number(r.n)
  return out
}

export function markUsed(kind: string, id: number): boolean {
  const table = kind === 'collage' ? 'collage_templates' : 'templates'
  return db().prepare(`UPDATE ${table} SET used_at = ? WHERE id = ?`).run(new Date().toISOString(), id).changes > 0
}

export function setGroupHidden(id: number, hidden: boolean): boolean {
  return db().prepare('UPDATE template_categories SET hidden = ? WHERE id = ? AND type = 0').run(hidden ? 1 : 0, id).changes > 0
}

export function collageGroupUsage(id: number): number {
  return Number(db().prepare('SELECT COUNT(*) AS n FROM collage_template_group_links WHERE category_id = ?').get(id).n)
}

export function detachCollageGroup(id: number): void {
  db().prepare('DELETE FROM collage_template_group_links WHERE category_id = ?').run(id)
}

export function removeCollageLinks(templateId: number): void {
  db().prepare('DELETE FROM collage_template_group_links WHERE template_id = ?').run(templateId)
}
