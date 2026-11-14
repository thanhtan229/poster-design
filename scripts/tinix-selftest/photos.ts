// [TINIX] Kiểm thử ảnh người dùng tải lên: tạo ảnh nhẹ/thu nhỏ, bỏ trùng, xoay EXIF, xóa an toàn (giữ tệp đang được thiết kế dùng), yêu thích.
// Chạy trên DB + thư mục static tạm (không đụng service/data). Dùng qua: npm run tinix:test
import fs from 'fs'
import path from 'path'
import { initDB, getDB } from '../../service/src/db'
import * as p from '../../service/src/tinix/photos/core'
import { filePath } from '../../service/src/configs'
const sharp = require('../../service/node_modules/sharp')

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else {
    failed++
    console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '')
  }
}
const exists = (u: string) => fs.existsSync(filePath + p.relStatic(u))
const sizeOf = async (u: string) => {
  const m = await sharp(filePath + p.relStatic(u)).metadata()
  return { w: m.width, h: m.height, format: m.format }
}

async function main() {
  initDB()
  const db = getDB()
  const tmp = path.join(process.cwd(), 'tmp-photos')
  fs.mkdirSync(tmp, { recursive: true })
  const noise = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } })
  const big = path.join(tmp, 'big.jpg')
  await sharp(noise(4000, 3000)).jpeg({ quality: 92 }).toFile(big)
  const portraitExif = path.join(tmp, 'exif.jpg') // 3000×2000 nhưng EXIF xoay 90° → hiển thị 2000×3000
  await sharp(noise(3000, 2000)).withMetadata({ orientation: 6 }).jpeg().toFile(portraitExif)
  const alpha = path.join(tmp, 'alpha.png')
  await sharp({ create: { width: 2400, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toFile(alpha)
  const small = path.join(tmp, 'small.jpg')
  await sharp(noise(500, 300)).jpeg().toFile(small)
  const text = path.join(tmp, 'x.txt')
  fs.writeFileSync(text, 'không phải ảnh')

  console.log('Tải lên + ảnh nhẹ/thu nhỏ')
  const r1 = await p.ingestPhoto(big, 'big.jpg', Date.UTC(2026, 5, 1), 1)
  const ph = r1.photo
  check('ghi DB: kích thước, tên, thời gian chụp, nguồn upload', !r1.duplicate && ph.width === 4000 && ph.height === 3000 && ph.name === 'big.jpg' && ph.taken_at.startsWith('2026-06-01') && ph.source === 'upload', ph)
  check('có đủ 3 tệp: gốc, nhẹ, thu nhỏ', exists(ph.url) && exists(ph.web_url) && exists(ph.thumb_url))
  const wm = await sizeOf(ph.web_url)
  check(`ảnh nhẹ: cạnh dài ≤ ${p.WEB_MAX}, giữ tỉ lệ 4:3`, Math.max(wm.w, wm.h) === p.WEB_MAX && Math.abs(wm.w / wm.h - 4 / 3) < 0.01, wm)
  const tm = await sizeOf(ph.thumb_url)
  check(`ảnh thu nhỏ: cạnh dài ≤ ${p.THUMB_MAX}`, Math.max(tm.w, tm.h) <= p.THUMB_MAX && tm.format === 'jpeg', tm)
  check('ảnh nhẹ nhỏ hơn ảnh gốc rõ rệt', fs.statSync(filePath + p.relStatic(ph.web_url)).size < fs.statSync(filePath + p.relStatic(ph.url)).size / 2)
  check('ảnh gốc giữ nguyên byte', fs.readFileSync(filePath + p.relStatic(ph.url)).equals(fs.readFileSync(big)))

  console.log('Trùng, EXIF, trong suốt, ảnh nhỏ, tệp không hợp lệ')
  const dup = await p.ingestPhoto(big, 'copy-of-big.jpg', 0, 1)
  check('tải lại cùng ảnh → trùng, không thêm dòng/tệp', dup.duplicate && dup.photo.id === ph.id && p.listPhotos(1).length === 1)
  const rx = (await p.ingestPhoto(portraitExif, 'exif.jpg', 0, 1)).photo
  check('EXIF xoay 90°: kích thước hiển thị đảo chiều (2000×3000)', rx.width === 2000 && rx.height === 3000, [rx.width, rx.height])
  const rxm = await sizeOf(rx.web_url)
  check('ảnh nhẹ đã xoay đúng chiều (dọc)', rxm.h > rxm.w, rxm)
  const ra = (await p.ingestPhoto(alpha, 'alpha.png', 0, 1)).photo
  const am = await sizeOf(ra.web_url)
  check('PNG trong suốt → ảnh nhẹ giữ độ trong suốt (WebP)', am.format === 'webp' && ra.web_url.endsWith('.webp'), am)
  const rs = (await p.ingestPhoto(small, 'small.jpg', 0, 1)).photo
  const sm = await sizeOf(rs.web_url)
  check('ảnh nhỏ không bị phóng to', sm.w === 500 && sm.h === 300, sm)
  let err = ''
  try { await p.ingestPhoto(text, 'x.txt', 0, 1) } catch (e) { err = String((e as Error).message) }
  check('tệp không phải ảnh bị từ chối kèm thông báo', /Không đọc được ảnh|chưa hỗ trợ/.test(err), err)
  check('chỉ liệt kê ảnh upload của đúng người dùng', p.listPhotos(1).length === 4 && p.listPhotos(2).length === 0)

  console.log('Phân loại nguồn (ảnh PSD/logo không vào danh sách)')
  db.prepare("INSERT INTO user_images (user_id, url, width, height, source) VALUES (1, '/static/template/a.png', 10, 10, 'psd')").run()
  check('ảnh nguồn psd không nằm trong danh sách ảnh album', p.listPhotos(1).length === 4)

  console.log('Yêu thích = sao chép vào bộ sưu tập')
  const fav = p.addFavorite(ph.id, 1)
  check('thêm yêu thích: tạo bản sao 3 tệp trong static/favorites', !!fav && fav.created && exists(fav.item.hq) && exists(fav.item.url) && exists(fav.item.thumb) && fav.item.hq.indexOf('/static/favorites/') === 0, fav && fav.item)
  check('mục bộ sưu tập: url=ảnh nhẹ, hq=ảnh gốc, có hash', !!fav && fav.item.url === fav.item.hq === false && fav.item.hash === ph.hash && fav.item.width === 4000)
  check('thêm lại không nhân đôi', !p.addFavorite(ph.id, 1)!.created && p.favoriteHashes().length === 1)
  check('nhóm "Yêu thích" có trong danh mục ảnh', !!db.prepare("SELECT id FROM asset_categories WHERE type = 'photos' AND cate = 'favorites'").get())
  check('hash yêu thích khớp để hiện sao đặc', p.favoriteHashes().join() === ph.hash)

  console.log('Xóa an toàn')
  const design = JSON.stringify({ page: {}, widgets: [{ type: 'w-image', imgUrl: 'http://127.0.0.1:7001' + rs.web_url, origin: { proxy: rs.web_url, original: rs.url } }] })
  db.prepare("INSERT INTO designs (user_id, template_id, title, data, cover, width, height) VALUES (1, 0, 't', ?, '', 100, 100)").run(design)
  const prev = p.clearPreview(1, [])
  check('xem trước: 4 ảnh, 1 được giữ tệp vì thiết kế đã lưu đang dùng', prev.total === 4 && prev.kept === 1 && prev.deletable === 3, prev)
  const prev2 = p.clearPreview(1, [rx.web_url])
  check('ảnh đang trên canvas (inUse) cũng được giữ tệp', prev2.kept === 2, prev2)
  const del = p.deletePhoto(ra.id, 1, [])
  check('xóa một ảnh không ai dùng: xóa dòng + 3 tệp', del.removed && del.filesDeleted && !exists(ra.url) && !exists(ra.web_url) && !exists(ra.thumb_url), { del, url: exists(ra.url), web: exists(ra.web_url), thumb: exists(ra.thumb_url), ra })
  const delUsed = p.deletePhoto(rs.id, 1, [])
  check('xóa ảnh đang được thiết kế dùng: bỏ khỏi danh sách nhưng GIỮ tệp gốc + nhẹ, xóa thu nhỏ', delUsed.removed && !delUsed.filesDeleted && exists(rs.url) && exists(rs.web_url) && !exists(rs.thumb_url))
  const cl = p.clearAll(1, [])
  check('xóa tất cả: danh sách trống, tệp không ai dùng bị xóa', cl.removed === 2 && cl.filesDeleted === 2 && p.listPhotos(1).length === 0 && !exists(ph.url) && !exists(rx.url), cl)
  check('bản sao yêu thích còn nguyên sau khi xóa tất cả', !!fav && exists(fav.item.hq) && exists(fav.item.url) && exists(fav.item.thumb) && p.favoriteHashes().length === 1)

  console.log('Gỡ yêu thích')
  const used = JSON.stringify({ widgets: [{ imgUrl: fav!.item.url, origin: { proxy: fav!.item.url, original: fav!.item.hq } }] })
  db.prepare("INSERT INTO designs (user_id, template_id, title, data, cover, width, height) VALUES (1, 0, 't2', ?, '', 100, 100)").run(used)
  const un = p.removeFavorite(ph.hash, [])
  check('gỡ yêu thích: bỏ khỏi bộ sưu tập, giữ tệp vì thiết kế còn dùng', un.removed && !un.filesDeleted && p.favoriteHashes().length === 0 && exists(fav!.item.hq))
  check('gỡ mục không có → removed=false', !p.removeFavorite('khong-co', []).removed)

  console.log('Ảnh tải lên từ trước (chưa có hash/ảnh nhẹ)')
  fs.mkdirSync(filePath + 'user', { recursive: true })
  fs.copyFileSync(big, filePath + 'user/legacy1.jpg')
  fs.copyFileSync(big, filePath + 'user/legacy2.jpg') // cùng nội dung → cùng hash, chia sẻ ảnh nhẹ
  const ins = db.prepare("INSERT INTO user_images (user_id, url, width, height, source) VALUES (2, ?, 4000, 3000, 'upload')")
  const l1 = Number(ins.run('/static/user/legacy1.jpg').lastInsertRowid)
  const l2 = Number(ins.run('/static/user/legacy2.jpg').lastInsertRowid)
  check('trước khi bổ sung: chưa có hash, yêu thích bị từ chối', p.getPhoto(l1, 2)!.hash === '' && (() => { try { p.addFavorite(l1, 2); return false } catch (e) { return true } })())
  const nb = await p.backfillLegacy(2)
  const g1 = p.getPhoto(l1, 2)!
  const g2 = p.getPhoto(l2, 2)!
  check('bổ sung 2 ảnh cũ: có hash, ảnh nhẹ, ảnh thu nhỏ, thời gian', nb === 2 && !!g1.hash && g1.hash === g2.hash && exists(g1.web_url) && exists(g1.thumb_url) && !!g1.taken_at, g1)
  check('tệp gốc cũ giữ nguyên vị trí', exists(g1.url) && exists(g2.url) && g1.url === '/static/user/legacy1.jpg')
  check('bổ sung lần hai không làm lại', (await p.backfillLegacy(2)) === 0)
  check('ảnh cũ sau bổ sung yêu thích được', !!p.addFavorite(l1, 2)!.created)
  const d1 = p.deletePhoto(l1, 2, [])
  check('xóa một trong hai ảnh trùng nội dung: giữ ảnh nhẹ/thu nhỏ dùng chung của ảnh còn lại', d1.removed && !exists(g1.url) && exists(g2.web_url) && exists(g2.thumb_url) && exists(g2.url))
  const d2 = p.deletePhoto(l2, 2, [])
  check('xóa ảnh còn lại: dọn sạch cả ảnh nhẹ/thu nhỏ', d2.removed && !exists(g2.web_url) && !exists(g2.thumb_url) && !exists(g2.url))

  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra ảnh tải lên đạt')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => {
  console.error('TEST FAILED', e)
  process.exit(1)
})
