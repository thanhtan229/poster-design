/**
 * [TINIX] Schema additions for TinixPoster. Idempotent — safe to run on every start.
 * Called from db/index.ts initDB() after the original tables are created.
 *
 * - fonts: category, tags (JSON array), supports_vietnamese, license, tag_source
 * - ai_jobs: history + cost log for every AI call (see MVP-SPEC.md §4.2)
 */

import { recountAllSlots } from '../templateSlots'

type Db = { prepare: (sql: string) => any; exec: (sql: string) => void }

// [column name, DDL] — plain tuples: the service compiles with TypeScript 3.9 (no labeled tuple elements)
const FONT_COLUMNS: Array<[string, string]> = [
  ['category', "TEXT NOT NULL DEFAULT ''"], // serif | sans | script | display | handwriting
  ['tags', "TEXT NOT NULL DEFAULT '[]'"], // JSON array, e.g. ["sang trọng","lãng mạn"]
  ['supports_vietnamese', 'INTEGER NOT NULL DEFAULT 0'],
  ['license', "TEXT NOT NULL DEFAULT ''"], // e.g. OFL
  ['tag_source', "TEXT NOT NULL DEFAULT ''"], // '' | 'name' (AI gắn theo tên) | 'vision' (AI nhìn ảnh xem trước) | 'manual' (sửa tay: AI không ghi đè)
]

function addMissingColumns(db: Db, table: string, columns: Array<[string, string]>): string[] {
  const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
  const added: string[] = []
  for (const [name, ddl] of columns) {
    if (existing.has(name)) continue
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`).run()
    added.push(name)
  }
  return added
}

export function migrateTinix(db: Db): void {
  const added = addMissingColumns(db, 'fonts', FONT_COLUMNS)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                 -- suggest_text | rewrite_text | find_font | tag_fonts | rebuild
      input_summary TEXT NOT NULL DEFAULT '{}',
      output TEXT NOT NULL DEFAULT '{}',
      model TEXT NOT NULL DEFAULT '',
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_vnd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',  -- ok | error
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_jobs(created_at);
  `)

  if (added.length) console.log(`[tinix:migrate] fonts + ${added.join(', ')}`)

  // Ảnh người dùng tải lên (dải ảnh dưới editor): ảnh nhẹ cho canvas, ảnh thu nhỏ, hash chống trùng, thời gian chụp, nguồn
  const addedImg = addMissingColumns(db, 'user_images', [
    ['web_url', "TEXT NOT NULL DEFAULT ''"],
    ['thumb_url', "TEXT NOT NULL DEFAULT ''"],
    ['hash', "TEXT NOT NULL DEFAULT ''"],
    ['size', 'INTEGER NOT NULL DEFAULT 0'],
    ['taken_at', "TEXT NOT NULL DEFAULT ''"],
    ['name', "TEXT NOT NULL DEFAULT ''"],
    ['source', "TEXT NOT NULL DEFAULT 'upload'"], // upload (ảnh người dùng) | psd (ảnh lớp khi nhập PSD) | other (logo, bìa…)
  ])
  // ảnh không nằm trong thư mục tải lên của người dùng không thuộc danh sách ảnh album (idempotent)
  const cls = db.prepare(`UPDATE user_images SET source = CASE WHEN url LIKE '/static/template/%' THEN 'psd' ELSE 'other' END
    WHERE source = 'upload' AND url NOT LIKE '/static/user/%' AND url NOT LIKE '/static/photos/%'`).run()
  if (addedImg.length || cls.changes) console.log(`[tinix:migrate] user_images + ${addedImg.join(', ')}; phân loại lại ${cls.changes} ảnh (psd/other)`)

  // Khung ảnh của mẫu: số lớp ảnh đánh dấu `slot` (0 = chưa đánh dấu → mẫu 1 ảnh mặc định). Tính lại cho mọi mẫu khi vừa thêm cột.
  const addedSlots = addMissingColumns(db, 'templates', [['photo_slots', 'INTEGER NOT NULL DEFAULT 0']])
  if (addedSlots.length) {
    const n = recountAllSlots()
    console.log(`[tinix:migrate] templates + photo_slots (${n} mẫu có khung ảnh đã đánh dấu)`)
  }

  // Nhóm mẫu thiết kế: một mẫu thuộc NHIỀU nhóm (liên kết theo id). templates.cate vẫn giữ tên nhóm chính (đầu tiên) để code cũ chạy được.
  const hadLinks = !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'template_group_links'").get()
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_group_links (
      template_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (template_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tgl_category ON template_group_links(category_id);
  `)
  if (!hadLinks) {
    // chuyển dữ liệu cũ (một nhóm theo tên trong templates.cate) sang bảng liên kết, chỉ làm một lần
    const r = db.prepare(`INSERT OR IGNORE INTO template_group_links (template_id, category_id)
      SELECT t.id, c.id FROM templates t JOIN template_categories c ON c.name = t.cate AND c.type = t.type WHERE t.cate != ''`).run()
    if (r.changes) console.log(`[tinix:migrate] template_group_links: chuyển ${r.changes} mẫu từ nhóm cũ`)
  }
}
