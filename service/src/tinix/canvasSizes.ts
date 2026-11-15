import express from 'express'
import { getDB } from '../db'
import { getRequestUser } from '../utils/auth'
import { findUserById } from '../db/users'
import { send } from '../utils/tools'

const presets: Array<[string, string, number, number, string]> = [
  ['Facebook bài vuông','Facebook',1080,1080,'px'], ['Facebook bài dọc','Facebook',1080,1350,'px'], ['Facebook chia sẻ liên kết','Facebook',1200,630,'px'],
  ['Facebook Ads Feed vuông','Facebook Ads',1440,1440,'px'], ['Facebook Ads Feed dọc','Facebook Ads',1440,1800,'px'], ['Facebook Ads Carousel','Facebook Ads',1080,1080,'px'], ['Facebook Story / Reel','Facebook',1080,1920,'px'], ['Facebook Ads Story','Facebook Ads',1440,2560,'px'], ['Facebook Cover trang','Facebook',851,315,'px'], ['Facebook Cover nhóm','Facebook',1640,856,'px'], ['Facebook Cover sự kiện','Facebook',1920,1005,'px'],
  ['Instagram vuông','Instagram',1080,1080,'px'], ['Instagram dọc','Instagram',1080,1350,'px'], ['Instagram Story / Reel','Instagram',1080,1920,'px'], ['YouTube Thumbnail 4K','YouTube',3840,2160,'px'], ['YouTube Thumbnail HD','YouTube',1280,720,'px'], ['YouTube Cover kênh','YouTube',2560,1440,'px'], ['TikTok dọc 9:16','TikTok',1080,1920,'px'], ['TikTok Photo vuông','TikTok',1080,1080,'px'], ['TikTok Photo dọc','TikTok',1080,1350,'px'], ['TikTok Avatar','TikTok',1080,1080,'px'], ['Vuông 900','Khác',900,900,'px'],
  ...([[6,9],[10,15],[13,18],[20,30],[30,45],[40,60],[50,75],[60,90],[20,40],[30,40],[35,50],[30,60],[30,30]] as number[][]).map(([w,h]) => [`${w} × ${h} cm`, 'In ảnh', w,h,'cm'] as [string,string,number,number,string]),
  ['A5','Khổ giấy',14.8,21,'cm'], ['A4','Khổ giấy',21,29.7,'cm'], ['A3','Khổ giấy',29.7,42,'cm'], ['Polaroid cổ điển','Polaroid',8.8,10.7,'cm'], ['Polaroid mini','Polaroid',6,9,'cm'], ['Photobooth dải 5 × 15','Photobooth',5,15,'cm'], ['Photobooth 2 × 6 inch','Photobooth',5.08,15.24,'cm'], ['Photobooth tấm','Photobooth',10,15,'cm'],
]
export function migrateCanvasSizes(db: any) {
  db.exec(`CREATE TABLE IF NOT EXISTS canvas_sizes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, width REAL NOT NULL, height REAL NOT NULL, unit TEXT NOT NULL, dpi INTEGER NOT NULL DEFAULT 300, hidden INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS canvas_size_favorites (user_id INTEGER NOT NULL, size_id INTEGER NOT NULL, PRIMARY KEY(user_id,size_id)); CREATE TABLE IF NOT EXISTS canvas_size_meta (key TEXT PRIMARY KEY);`)
  db.transaction(() => { if (db.prepare("SELECT key FROM canvas_size_meta WHERE key='seed-v1'").get()) return
    const add = db.prepare('INSERT INTO canvas_sizes (name,category,width,height,unit) VALUES (?,?,?,?,?)')
    presets.forEach(p => add.run(...p)); db.prepare("INSERT INTO canvas_size_meta VALUES ('seed-v1')").run()
  })()
}
const router = express.Router()
router.use('/api/tinix/canvas-sizes', (req: any,res: any,next: any) => { const u = getRequestUser(req); if (!u || !findUserById(u.id)) return res.json({code:401,msg:'Vui lòng đăng nhập'}); req.canvasUser = u; next() })
router.get('/api/tinix/canvas-sizes', (req: any,res: any) => { const db = getDB(); send.success(res, { list: db.prepare('SELECT s.*, EXISTS(SELECT 1 FROM canvas_size_favorites f WHERE f.size_id=s.id) AS favorite FROM canvas_sizes s ORDER BY s.id').all() }) })
router.post('/api/tinix/canvas-sizes/save', (req: any,res: any) => {
  try { const b = req.body || {}, db = getDB(), name = String(b.name || '').trim(), category = String(b.category || '').trim(), width = Number(b.width), height = Number(b.height), dpi = Number(b.dpi), unit = b.unit
    if (!name || name.length > 100 || !category || category.length > 60 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !['cm','px'].includes(unit) || !Number.isInteger(dpi) || dpi < 36 || dpi > 1200 || (unit === 'px' && (!Number.isInteger(width) || !Number.isInteger(height))) || width > 12000 || height > 12000) throw new Error('Thông số kích thước không hợp lệ')
    const wpx = unit === 'cm' ? Math.round(width * dpi / 2.54) : width, hpx = unit === 'cm' ? Math.round(height * dpi / 2.54) : height
    if (wpx < 1 || hpx < 1 || wpx > 12000 || hpx > 12000 || wpx*hpx > 80000000) throw new Error('Vượt giới hạn 12000 px mỗi cạnh hoặc 80 triệu pixel. Hãy giảm DPI hoặc kích thước.')
    if (b.id) { const result = db.prepare('UPDATE canvas_sizes SET name=?,category=?,width=?,height=?,unit=?,dpi=?,updated_by=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND version=? AND deleted=0').run(name,category,width,height,unit,dpi,req.canvasUser.account,b.id,b.version); if (!result.changes) throw new Error('Kích thước đã thay đổi hoặc bị xóa. Vui lòng tải lại.') }
    else db.prepare('INSERT INTO canvas_sizes (name,category,width,height,unit,dpi,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)').run(name,category,width,height,unit,dpi,req.canvasUser.account,req.canvasUser.account)
    send.success(res,{ok:true})
  } catch(e) { send.error(res,(e as Error).message) }
})
router.post('/api/tinix/canvas-sizes/state', (req: any,res: any) => { const b=req.body||{}, db=getDB(); if (!Number.isInteger(b.id) || !db.prepare('SELECT id FROM canvas_sizes WHERE id=?').get(b.id)) return send.error(res,'Không tìm thấy kích thước'); if (!['hide','show','delete','restore','favorite','unfavorite'].includes(b.action)) return send.error(res,'Thao tác không hợp lệ'); if (b.action === 'favorite') db.prepare('INSERT OR IGNORE INTO canvas_size_favorites VALUES (?,?)').run(req.canvasUser.id,b.id); else if (b.action === 'unfavorite') db.prepare('DELETE FROM canvas_size_favorites WHERE size_id=?').run(b.id); else { const field = b.action === 'hide' || b.action === 'show' ? 'hidden' : 'deleted', value = b.action === 'hide' || b.action === 'delete' ? 1 : 0; const r=db.prepare(`UPDATE canvas_sizes SET ${field}=?, version=version+1, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`).run(value,req.canvasUser.account,b.id,b.version); if (!r.changes) return send.error(res,'Kích thước đã thay đổi. Vui lòng tải lại.') } send.success(res,{ok:true}) })
export default router
