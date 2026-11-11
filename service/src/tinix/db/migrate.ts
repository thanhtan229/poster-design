/**
 * [TINIX] Schema additions for TinixPoster. Idempotent — safe to run on every start.
 * Called from db/index.ts initDB() after the original tables are created.
 *
 * - fonts: category, tags (JSON array), supports_vietnamese, license
 * - ai_jobs: history + cost log for every AI call (see MVP-SPEC.md §4.2)
 */

type Db = { prepare: (sql: string) => any; exec: (sql: string) => void }

// [column name, DDL] — plain tuples: the service compiles with TypeScript 3.9 (no labeled tuple elements)
const FONT_COLUMNS: Array<[string, string]> = [
  ['category', "TEXT NOT NULL DEFAULT ''"], // serif | sans | script | display | handwriting
  ['tags', "TEXT NOT NULL DEFAULT '[]'"], // JSON array, e.g. ["sang trọng","lãng mạn"]
  ['supports_vietnamese', 'INTEGER NOT NULL DEFAULT 0'],
  ['license', "TEXT NOT NULL DEFAULT ''"], // e.g. OFL
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
}
