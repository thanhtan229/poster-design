// [TINIX] Quản lý ảnh người dùng tải lên cho thiết kế album.
//
// Mỗi ảnh tải lên có 3 tệp:
//   - gốc      static/photos/<hash>.<ext>        (giữ nguyên chất lượng, chỉ dùng khi XUẤT thành phẩm)
//   - nhẹ      static/photos/web/<hash>.jpg|webp (cạnh dài ≤ WEB_MAX, dùng trên canvas để thiết kế không bị nặng/lag)
//   - thu nhỏ  static/photos/thumb/<hash>.jpg    (dải ảnh phía dưới editor)
// ★ = sao chép cả 3 tệp sang static/favorites/ và thêm vào một nhóm trong thư viện "Ảnh" của app (bảng photos) → còn nguyên khi xóa tất cả.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDB } from '../../db/index'
import { filePath } from '../../configs'
import { ensureAssetCategory, listAssetCategories } from '../../db/assetCategories'

const sharp = require('sharp')
sharp.cache(false) // không giữ tệp mở trong bộ nhớ đệm libvips: trên Windows tệp đang mở thì không xóa được (xóa ảnh vừa xem), và đỡ tốn RAM với ảnh lớn

export const WEB_MAX = Math.max(800, Number(process.env.TINIX_PHOTO_WEB_MAX) || 1600) // cạnh dài tối đa của ảnh nhẹ trên canvas
export const THUMB_MAX = 360
export const MAX_BYTES = 50 * 1024 * 1024 // tối đa mỗi ảnh
const EXT: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', tiff: 'tif', avif: 'avif' }

export type PhotoRow = {
  id: number
  user_id: number
  url: string
  web_url: string
  thumb_url: string
  width: number
  height: number
  hash: string
  size: number
  taken_at: string
  name: string
  source: string
  created_at: string
}

const COLS = 'id, user_id, url, web_url, thumb_url, width, height, hash, size, taken_at, name, source, created_at'

/** '/static/a/b.jpg' hoặc 'http://host/static/a/b.jpg?v=1' → 'a/b.jpg' (đường dẫn tương đối trong thư mục static) */
export function relStatic(u: string): string {
  return String(u || '').replace(/\?.*$/, '').replace(/^.*\/static\//, '')
}
const abs = (u: string) => filePath + relStatic(u)
/** Chuẩn hóa về dạng '/static/...' để so sánh */
export function staticPath(u: string): string {
  return '/static/' + relStatic(u)
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function sha1OfFile(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1')
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

// ───────────────────────── Truy vấn ─────────────────────────
export function listPhotos(userId: number): PhotoRow[] {
  return getDB().prepare(`SELECT ${COLS} FROM user_images WHERE user_id = ? AND source = 'upload' ORDER BY id DESC`).all(userId)
}
export function getPhoto(id: number, userId: number): PhotoRow | undefined {
  return getDB().prepare(`SELECT ${COLS} FROM user_images WHERE id = ? AND user_id = ? AND source = 'upload'`).get(id, userId)
}
function findByHash(userId: number, hash: string): PhotoRow | undefined {
  return getDB().prepare(`SELECT ${COLS} FROM user_images WHERE user_id = ? AND hash = ? AND source = 'upload'`).get(userId, hash)
}

// ───────────────────────── Ảnh nhẹ + thu nhỏ ─────────────────────────
/** Tạo ảnh nhẹ (cho canvas) và ảnh thu nhỏ (cho dải ảnh) từ tệp ảnh gốc. Trả về đường dẫn tương đối trong static. */
async function makeDerivatives(srcPath: string, hash: string, hasAlpha: boolean): Promise<{ webRel: string; thumbRel: string }> {
  ensureDir(filePath + 'photos/web')
  ensureDir(filePath + 'photos/thumb')
  const webRel = `photos/web/${hash}.${hasAlpha ? 'webp' : 'jpg'}`
  const thumbRel = `photos/thumb/${hash}.jpg`
  const base = () => sharp(srcPath, { failOnError: false, limitInputPixels: false }).rotate() // tự xoay đúng chiều theo EXIF
  const web = base().resize({ width: WEB_MAX, height: WEB_MAX, fit: 'inside', withoutEnlargement: true })
  await (hasAlpha ? web.webp({ quality: 80 }) : web.jpeg({ quality: 80, progressive: true })).toFile(filePath + webRel)
  await base()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 72 })
    .toFile(filePath + thumbRel)
  return { webRel, thumbRel }
}

/**
 * Ảnh tải lên từ trước khi có tính năng này (chưa có hash/ảnh nhẹ/ảnh thu nhỏ): bổ sung tại chỗ, giữ nguyên tệp gốc.
 * Gọi khi mở danh sách; ảnh hỏng/mất tệp thì bỏ qua.
 */
export async function backfillLegacy(userId: number): Promise<number> {
  const db = getDB()
  const rows: PhotoRow[] = db.prepare(`SELECT ${COLS} FROM user_images WHERE user_id = ? AND source = 'upload' AND hash = ''`).all(userId)
  let n = 0
  for (const r of rows) {
    try {
      const src = abs(r.url)
      if (!fs.existsSync(src)) continue
      const hash = await sha1OfFile(src)
      const meta = await sharp(src, { failOnError: false, limitInputPixels: false }).metadata()
      const d = await makeDerivatives(src, hash, !!meta.hasAlpha)
      const taken = r.taken_at || fs.statSync(src).mtime.toISOString()
      db.prepare('UPDATE user_images SET hash = ?, web_url = ?, thumb_url = ?, size = ?, taken_at = ? WHERE id = ?').run(hash, '/static/' + d.webRel, '/static/' + d.thumbRel, fs.statSync(src).size, taken, r.id)
      n++
    } catch (e) {
      console.warn('[tinix:photos] bổ sung ảnh cũ lỗi', r.id, (e as Error).message)
    }
  }
  return n
}

// ───────────────────────── Tải lên ─────────────────────────
export type UploadResult = { duplicate: boolean; photo: PhotoRow }

/** Xử lý một tệp ảnh đã nhận (đường dẫn tạm): tính hash, bỏ qua nếu trùng, lưu gốc, tạo ảnh nhẹ + thu nhỏ, ghi DB. */
export async function ingestPhoto(tmpPath: string, originalName: string, lastModified: number, userId: number): Promise<UploadResult> {
  const stat = fs.statSync(tmpPath)
  if (stat.size > MAX_BYTES) throw new Error(`Ảnh lớn hơn ${Math.round(MAX_BYTES / 1048576)} MB`)
  const hash = await sha1OfFile(tmpPath)
  const dup = findByHash(userId, hash)
  if (dup) return { duplicate: true, photo: dup }

  let meta: any
  try {
    meta = await sharp(tmpPath, { failOnError: false, limitInputPixels: false }).metadata()
  } catch (e) {
    throw new Error('Không đọc được ảnh (tệp hỏng hoặc không phải ảnh)')
  }
  const ext = EXT[meta.format]
  if (!ext) throw new Error('Định dạng ảnh chưa hỗ trợ: ' + (meta.format || 'không rõ') + ' (dùng JPG, PNG, WebP, GIF, TIFF hoặc AVIF)')
  const rotated = Number(meta.orientation) >= 5 // EXIF xoay 90°: kích thước hiển thị đảo chiều
  const width = rotated ? meta.height : meta.width
  const height = rotated ? meta.width : meta.height
  if (!(width > 0 && height > 0)) throw new Error('Không đọc được kích thước ảnh')

  ensureDir(filePath + 'photos')
  const origRel = `photos/${hash}.${ext}`
  fs.copyFileSync(tmpPath, filePath + origRel)
  let webRel = ''
  let thumbRel = ''
  try {
    const d = await makeDerivatives(tmpPath, hash, !!meta.hasAlpha)
    webRel = d.webRel
    thumbRel = d.thumbRel
  } catch (e) {
    // làm dở thì dọn, không để tệp mồ côi
    ;[origRel, webRel, thumbRel].filter(Boolean).forEach((r) => {
      try { fs.unlinkSync(filePath + r) } catch (err) { /* bỏ qua */ }
    })
    throw new Error('Không tạo được ảnh nhẹ: ' + ((e as Error).message || e))
  }

  const taken = lastModified > 0 ? new Date(lastModified).toISOString() : ''
  const info = getDB()
    .prepare(`INSERT INTO user_images (user_id, url, width, height, web_url, thumb_url, hash, size, taken_at, name, source)
      VALUES (@user_id, @url, @width, @height, @web, @thumb, @hash, @size, @taken, @name, 'upload')`)
    .run({ user_id: userId, url: '/static/' + origRel, width, height, web: '/static/' + webRel, thumb: '/static/' + thumbRel, hash, size: stat.size, taken, name: String(originalName || '').slice(0, 200) })
  return { duplicate: false, photo: getPhoto(Number(info.lastInsertRowid), userId) as PhotoRow }
}

// ───────────────────────── Tham chiếu (an toàn khi xóa) ─────────────────────────
/** Mọi đường dẫn /static/... đang được thiết kế đã lưu và mẫu dùng tới (tệp ảnh này KHÔNG được xóa) */
export function referencedPaths(extra: string[] = []): Set<string> {
  const db = getDB()
  const set = new Set<string>()
  const scan = (text: string) => {
    const m = String(text || '').match(/\/static\/[^"'\\\s)]+/g)
    if (m) for (const x of m) set.add(staticPath(x))
  }
  for (const r of db.prepare('SELECT data FROM designs').all()) scan(r.data)
  for (const r of db.prepare('SELECT data FROM templates').all()) scan(r.data)
  for (const u of extra) if (u) set.add(staticPath(u))
  return set
}

function unlinkQuiet(u: string) {
  if (!u) return
  try { fs.unlinkSync(abs(u)) } catch (e) { /* không có thì thôi */ }
}
/** Tệp còn được dòng ảnh khác dùng (ảnh cũ trùng nội dung chia sẻ cùng ảnh nhẹ/thu nhỏ)? */
function sharedByOtherRow(u: string, exceptId: number): boolean {
  if (!u) return false
  return !!getDB().prepare('SELECT 1 FROM user_images WHERE id != ? AND (url = ? OR web_url = ? OR thumb_url = ?) LIMIT 1').get(exceptId, u, u, u)
}
const unlinkIfFree = (u: string, exceptId: number) => !sharedByOtherRow(u, exceptId) && unlinkQuiet(u)

/** Xóa một ảnh khỏi danh sách; tệp gốc/nhẹ chỉ bị xóa khi không còn thiết kế/mẫu nào dùng. */
function removeRow(row: PhotoRow, refs: Set<string>): { filesDeleted: boolean } {
  getDB().prepare('DELETE FROM user_images WHERE id = ?').run(row.id)
  unlinkIfFree(row.thumb_url, row.id)
  const used = refs.has(staticPath(row.url)) || refs.has(staticPath(row.web_url))
  if (!used) {
    unlinkIfFree(row.url, row.id)
    if (row.web_url && row.web_url !== row.url) unlinkIfFree(row.web_url, row.id)
  }
  return { filesDeleted: !used }
}

export function deletePhoto(id: number, userId: number, inUse: string[]): { removed: boolean; filesDeleted: boolean } {
  const row = getPhoto(id, userId)
  if (!row) return { removed: false, filesDeleted: false }
  return { removed: true, ...removeRow(row, referencedPaths(inUse)) }
}

export type ClearPreview = { total: number; deletable: number; kept: number }
/** Số ảnh sẽ bị xóa khỏi danh sách / tệp thật sự bị xóa / tệp được giữ vì còn thiết kế dùng */
export function clearPreview(userId: number, inUse: string[]): ClearPreview {
  const rows = listPhotos(userId)
  const refs = referencedPaths(inUse)
  const kept = rows.filter((r) => refs.has(staticPath(r.url)) || refs.has(staticPath(r.web_url))).length
  return { total: rows.length, deletable: rows.length - kept, kept }
}

export function clearAll(userId: number, inUse: string[]): { removed: number; filesDeleted: number; kept: number } {
  const rows = listPhotos(userId)
  const refs = referencedPaths(inUse)
  let filesDeleted = 0
  let kept = 0
  for (const r of rows) {
    const res = removeRow(r, refs)
    res.filesDeleted ? filesDeleted++ : kept++
  }
  return { removed: rows.length, filesDeleted, kept }
}

// ───────────────────────── Yêu thích = thêm vào thư viện "Ảnh" của app ─────────────────────────
// ★ trên một ảnh tải lên → sao chép tệp sang static/favorites/ và thêm vào MỘT NHÓM CÓ SẴN trong tab "Ảnh" (bảng photos / asset_categories),
// hoặc nhóm mới do người dùng đặt tên. Mục thư viện: url = ảnh nhẹ, hq = ảnh gốc, hash để nhận ra ảnh đã ★. Còn nguyên khi xóa tất cả.
function readList(cate: string): any[] {
  const row = getDB().prepare('SELECT list FROM photos WHERE cate = ?').get(cate)
  if (!row) return []
  try {
    const v = JSON.parse(row.list)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}
function writeList(cate: string, list: any[]) {
  const json = JSON.stringify(list)
  const r = getDB().prepare('UPDATE photos SET list = ? WHERE cate = ?').run(json, cate)
  if (!r.changes) getDB().prepare('INSERT INTO photos (cate, list) VALUES (?, ?)').run(cate, json)
}

const nameKey = (n: string) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Nhóm ảnh trong tab "Ảnh" */
export function listLibraryCategories(): Array<{ cate: string; name: string }> {
  return listAssetCategories('photos').map((c: any) => ({ cate: String(c.cate), name: c.name }))
}

/** Tạo nhóm mới trong tab "Ảnh" (tên không trùng, không phân biệt hoa thường). Trả về mã nhóm. */
export function createLibraryCategory(name: string): string {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!clean) throw new Error('Tên nhóm không được để trống')
  const cats = listLibraryCategories()
  const same = cats.find((c) => nameKey(c.name) === nameKey(clean))
  if (same) return same.cate // đã có nhóm cùng tên → dùng lại
  const nums = cats.map((c) => Number(c.cate)).filter((n) => Number.isFinite(n))
  const cate = String((nums.length ? Math.max(...nums) : 0) + 1)
  ensureAssetCategory('photos', cate, clean)
  return cate
}

export type LibraryFavorite = { hash: string; url: string; hq: string; cate: string }
/** Các ảnh trong thư viện "Ảnh" xuất phát từ ảnh tải lên (có hash) — để hiện sao đặc và tính "đã dùng" */
export function libraryFavorites(): LibraryFavorite[] {
  const out: LibraryFavorite[] = []
  for (const c of listLibraryCategories()) {
    for (const x of readList(c.cate)) if (x && x.hash) out.push({ hash: x.hash, url: x.url, hq: x.hq || '', cate: c.cate })
  }
  return out
}

function copyKeep(srcUrl: string, destRel: string): string {
  const dest = filePath + destRel
  ensureDir(path.dirname(dest))
  if (!fs.existsSync(dest)) fs.copyFileSync(abs(srcUrl), dest)
  return '/static/' + destRel
}

/**
 * Thêm ảnh vào thư viện "Ảnh": `cate` = nhóm có sẵn, hoặc `newName` = tạo nhóm mới.
 * Ảnh đã nằm trong thư viện (cùng hash) thì không thêm lần hai.
 */
export function addFavorite(id: number, userId: number, target: { cate?: string; newName?: string }): { item: any; created: boolean; cate: string; catName: string } | null {
  const row = getPhoto(id, userId)
  if (!row) return null
  if (!row.hash) throw new Error('Ảnh cũ chưa được xử lý (thiếu hash), hãy tải lại danh sách ảnh')
  let cate = String(target.cate || '')
  if (!cate && target.newName) cate = createLibraryCategory(target.newName)
  const cats = listLibraryCategories()
  const cat = cats.find((c) => c.cate === cate)
  if (!cat) throw new Error('Hãy chọn nhóm ảnh trong tab Ảnh')
  const exist = libraryFavorites().find((f) => f.hash === row.hash)
  if (exist) {
    const item = readList(exist.cate).find((x) => x && x.hash === row.hash)
    const c0 = cats.find((c) => c.cate === exist.cate)
    return { item, created: false, cate: exist.cate, catName: c0 ? c0.name : '' }
  }
  const ext = path.extname(row.url).slice(1) || 'jpg'
  const webExt = path.extname(row.web_url || row.url).slice(1) || 'jpg'
  const hq = copyKeep(row.url, `favorites/${row.hash}.${ext}`)
  const web = row.web_url ? copyKeep(row.web_url, `favorites/web/${row.hash}.${webExt}`) : hq
  const thumb = row.thumb_url ? copyKeep(row.thumb_url, `favorites/thumb/${row.hash}.jpg`) : web
  const item = {
    id: Date.now(),
    url: web, // ảnh nhẹ: dùng trên canvas
    thumb,
    hq, // ảnh gốc: dùng khi xuất thành phẩm
    width: row.width,
    height: row.height,
    hash: row.hash,
    name: row.name,
    color: '#EFEFEF',
    created_time: new Date().toISOString(),
  }
  writeList(cate, [item].concat(readList(cate)))
  return { item, created: true, cate, catName: cat.name }
}

/** Gỡ khỏi thư viện "Ảnh" (mọi nhóm). Tệp chỉ bị xóa khi không còn thiết kế/mẫu nào dùng. */
export function removeFavorite(hash: string, inUse: string[]): { removed: boolean; filesDeleted: boolean } {
  if (!hash) return { removed: false, filesDeleted: false }
  let item: any = null
  for (const c of listLibraryCategories()) {
    const list = readList(c.cate)
    const hit = list.filter((x) => x && x.hash === hash)
    if (hit.length) {
      item = item || hit[0]
      writeList(c.cate, list.filter((x) => !(x && x.hash === hash)))
    }
  }
  if (!item) return { removed: false, filesDeleted: false }
  const refs = referencedPaths(inUse)
  const used = refs.has(staticPath(item.hq)) || refs.has(staticPath(item.url))
  if (item.thumb !== item.url && item.thumb !== item.hq) unlinkQuiet(item.thumb)
  if (!used) {
    unlinkQuiet(item.hq)
    if (item.url !== item.hq) unlinkQuiet(item.url)
  }
  return { removed: true, filesDeleted: !used }
}
