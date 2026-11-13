// [TINIX] Kiểm thử offline cho phần font: kho font (lọc/tìm/lưu nhóm+tag), làm sạch dữ liệu form, manifest, tạo ảnh xem trước.
// Chạy trên DB tạm (không đụng service/data). Dùng qua: npm run tinix:test
import fs from 'fs'
import path from 'path'
import { initDB, getDB } from '../../service/src/db'
import * as fontsRepo from '../../service/src/db/fonts'
import { cleanCategory, cleanTags } from '../../service/src/tinix/fontMeta'
import { startPreviews, getPreviewStatus } from '../../service/src/tinix/fontPreviews'

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else {
    failed++
    console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '')
  }
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const root = path.resolve(__dirname, '../..')

async function main() {
  initDB()
  getDB().prepare('DELETE FROM fonts').run()

  console.log('Làm sạch dữ liệu form')
  check('nhóm hợp lệ giữ nguyên', cleanCategory('script') === 'script' && cleanCategory('  serif ') === 'serif')
  check('nhóm lạ/rỗng → rỗng', cleanCategory('abc') === '' && cleanCategory(undefined) === '' && cleanCategory(5) === '')
  check('tag từ mảng: cắt khoảng trắng, bỏ trùng, bỏ rỗng', cleanTags([' a ', 'a', '', 'b']) === '["a","b"]', cleanTags([' a ', 'a', '', 'b']))
  check('tag từ chuỗi phân tách dấu phẩy', cleanTags('x, y ,x') === '["x","y"]')
  check('tối đa 10 tag', JSON.parse(cleanTags(Array.from({ length: 15 }, (_, i) => 't' + i))).length === 10)
  check('mỗi tag tối đa 30 ký tự', JSON.parse(cleanTags(['x'.repeat(50)]))[0].length === 30)
  check('đầu vào sai kiểu → []', cleanTags(null) === '[]' && cleanTags(42) === '[]')

  console.log('Kho font: thêm, lọc, tìm, sửa')
  const mk = (alias: string, lang: string, vn: number, category: string, tags: string[]) =>
    fontsRepo.addFont({ alias, value: alias, preview: '', woff: `/static/fonts/${alias}.ttf`, ttf: '', lang, font_family: alias, size: 1, woff_size: 1, supports_vietnamese: vn, category, tags: JSON.stringify(tags) })
  const a = mk('Alpha', 'en', 1, 'serif', ['sang trọng', 'cưới'])
  mk('Beta', 'en', 0, 'script', ['thiệp cưới'])
  mk('Gamma', 'ko', 0, 'handwriting', ['mềm mại'])
  mk('Delta', 'zh', 0, '', [])
  const all = fontsRepo.listFonts(1, 50, '')
  check('tổng 4 font', all.total === 4 && all.list.length === 4, all.total)
  check('lọc lang=ko', fontsRepo.listFonts(1, 50, '', { lang: 'ko' }).list.map((f) => f.alias).join() === 'Gamma')
  check('lọc vn=1', fontsRepo.listFonts(1, 50, '', { vn: '1' }).list.map((f) => f.alias).join() === 'Alpha')
  check('lọc vn=0', fontsRepo.listFonts(1, 50, '', { vn: '0' }).total === 3)
  check('lọc category=script', fontsRepo.listFonts(1, 50, '', { category: 'script' }).list.map((f) => f.alias).join() === 'Beta')
  check('lọc category=none (chưa phân nhóm)', fontsRepo.listFonts(1, 50, '', { category: 'none' }).list.map((f) => f.alias).join() === 'Delta')
  check('tìm theo tag "cưới" ra 2 font', fontsRepo.listFonts(1, 50, 'cưới').total === 2)
  check('kết hợp tìm + lọc (AND)', fontsRepo.listFonts(1, 50, 'cưới', { vn: '1' }).list.map((f) => f.alias).join() === 'Alpha')
  check('phân trang: tổng vẫn đúng, danh sách theo pageSize', (() => { const p = fontsRepo.listFonts(1, 3, ''); return p.total === 4 && p.list.length === 3 })())
  const ok = fontsRepo.updateFont(a, { alias: 'Alpha', value: 'Alpha', preview: '', woff: '/static/fonts/Alpha.ttf', ttf: '', lang: 'en', font_family: 'Alpha', supports_vietnamese: 1, category: 'display', tags: JSON.stringify(['mới']) })
  const row = fontsRepo.listFonts(1, 50, 'Alpha').list[0]
  check('sửa font lưu nhóm + tag', ok && row.category === 'display' && row.tags === '["mới"]', row)

  console.log('Manifest/danh mục font')
  const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
  const unique = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length
  const google = readJson('scripts/tinix-fonts.json').fonts
  check('tinix-fonts.json: family duy nhất', unique(google.map((f: any) => f.family)))
  check('tinix-fonts.json: nhóm hợp lệ, có dir/file', google.every((f: any) => fontsRepo.CATEGORIES.indexOf(f.category) >= 0 && f.dir && f.file), google.filter((f: any) => fontsRepo.CATEGORIES.indexOf(f.category) < 0 || !f.dir || !f.file).map((f: any) => f.family))
  const win = readJson('scripts/tinix-winfonts.json').fonts
  check('tinix-winfonts.json: family duy nhất', unique(win.map((f: any) => f.family)))
  check('tinix-winfonts.json: có file, nhóm hợp lệ hoặc rỗng, tag là mảng', win.every((f: any) => f.file && (f.category === '' || fontsRepo.CATEGORIES.indexOf(f.category) >= 0) && Array.isArray(f.tags)))
  check('không trùng family giữa hai manifest', (() => { const g = new Set(google.map((f: any) => f.family.toLowerCase())); return win.every((f: any) => !g.has(f.family.toLowerCase())) })())

  console.log('Tạo ảnh xem trước (script giả)')
  const fake = path.join(process.cwd(), 'fake-previews.js')
  fs.writeFileSync(fake, "setTimeout(() => { console.log('xong 0 ảnh'); process.exit(0) }, 400)")
  process.env.TINIX_PREVIEW_SCRIPT = fake
  check('bắt đầu được', startPreviews() === true)
  check('đang chạy thì từ chối lần hai', startPreviews() === false && getPreviewStatus().running === true)
  await sleep(1500)
  const st = getPreviewStatus()
  check('kết thúc: exitCode 0, có log', st.running === false && st.exitCode === 0 && st.log.indexOf('xong') >= 0, st)
  fs.writeFileSync(fake, 'process.exit(3)')
  startPreviews()
  await sleep(1200)
  check('script lỗi → exitCode khác 0', getPreviewStatus().running === false && getPreviewStatus().exitCode === 3, getPreviewStatus())

  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra font đạt')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('TEST FAILED', e); process.exit(1) })
