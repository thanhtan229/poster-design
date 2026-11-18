import { createRequire } from 'node:module'
import { validate } from './tinix-drafts.mjs'
const Database = createRequire(import.meta.url)('../service/node_modules/better-sqlite3')
function open(file, write = false) {
  const db = new Database(file, { timeout: 5000, readonly: !write, fileMustExist: !write })
  if (write) db.exec('CREATE TABLE IF NOT EXISTS revisions(version INTEGER PRIMARY KEY, created_at TEXT NOT NULL, note TEXT NOT NULL, restored_from INTEGER, data TEXT NOT NULL)')
  return db
}
function assertLayout(layout) {
  const issues = validate(layout)
  if (issues.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(issues))
}
export function historySave(file, layout, expected, note = '', restoredFrom = null) {
  assertLayout(layout)
  const db = open(file, true)
  try {
    return db.transaction(() => {
      const current = db.prepare('SELECT COALESCE(MAX(version),0) version FROM revisions').get().version
      if (current !== expected) throw new Error(`VERSION_CONFLICT: expected ${expected}, current ${current}`)
      const version = current + 1, createdAt = new Date().toISOString()
      db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(version, createdAt, note, restoredFrom, JSON.stringify(layout))
      return { version, createdAt, restoredFrom }
    }).immediate()
  } finally { db.close() }
}
export function historyList(file) {
  const db = open(file)
  try { return db.prepare('SELECT version,created_at AS createdAt,note,restored_from AS restoredFrom FROM revisions ORDER BY version').all() }
  finally { db.close() }
}
export function historyRead(file, version) {
  const db = open(file)
  try {
    const row = db.prepare('SELECT data FROM revisions WHERE version=?').get(version)
    if (!row) throw new Error('Revision not found')
    const layout = JSON.parse(row.data); assertLayout(layout); return layout
  } finally { db.close() }
}
