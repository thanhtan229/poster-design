// [TINIX] Kiểm thử nhóm mẫu thiết kế (nhiều nhóm / mẫu): liên kết, đếm, lọc, sắp xếp, xóa, gợi ý theo tên, chuyển dữ liệu cũ.
// Chạy trên DB tạm (không đụng service/data). Dùng qua: npm run tinix:test
import { initDB, getDB } from '../../service/src/db'
import * as templatesRepo from '../../service/src/db/templates'
import * as g from '../../service/src/tinix/templateGroups'
import { suggestGroupsForTitle, normalizeText } from '../../service/src/tinix/groupSuggest'
import { migrateTinix } from '../../service/src/tinix/db/migrate'

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else {
    failed++
    console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '')
  }
}

const mkTpl = (title: string, cate = '') => templatesRepo.createTemplate({ title, data: '{}', width: 100, height: 100, type: 0, cate })
const catId = (name: string, type = 0) => Number(getDB().prepare('INSERT INTO template_categories (name, type, sort) VALUES (?, ?, 0)').run(name, type).lastInsertRowid)
const cateOf = (id: number) => getDB().prepare('SELECT cate FROM templates WHERE id = ?').get(id).cate
const names = (xs: any[]) => xs.map((x) => x.name).join('|')

function main() {
  initDB()
  const db = getDB()

  console.log('Chuyển dữ liệu nhóm cũ (cate theo tên) sang bảng liên kết')
  const legacyCat = catId('Cũ')
  const legacyTpl = mkTpl('mẫu cũ', 'Cũ')
  const noGroup = mkTpl('mẫu chưa nhóm')
  db.exec('DROP TABLE template_group_links') // giả lập DB trước khi có tính năng
  migrateTinix(db)
  check('mẫu có cate khớp tên nhóm được liên kết', g.getGroupsByTemplates([legacyTpl])[legacyTpl]?.join() === String(legacyCat))
  check('mẫu cate rỗng không có liên kết', !g.getGroupsByTemplates([noGroup])[noGroup])
  migrateTinix(db)
  check('chạy lại migration không nhân đôi', db.prepare('SELECT COUNT(*) n FROM template_group_links').get().n === 1)

  console.log('Gán nhiều nhóm cho một mẫu')
  const baby = catId('Em bé'), wedding = catId('Wedding'), portrait = catId('Chân dung')
  const t1 = mkTpl('A'), t2 = mkTpl('B'), t3 = mkTpl('C')
  check('setTemplateGroups lưu nhiều nhóm', g.setTemplateGroups(t1, [baby, wedding])?.length === 2)
  check('nhóm chính (cate) = nhóm đầu theo sort,id', cateOf(t1) === 'Em bé', cateOf(t1))
  check('id nhóm không tồn tại / lặp bị bỏ', g.setTemplateGroups(t1, [baby, baby, 99999])?.join() === String(baby))
  check('mẫu không tồn tại → null', g.setTemplateGroups(424242, [baby]) === null)
  const t4 = templatesRepo.createTemplate({ title: 'comp', data: '[]', width: 1, height: 1, type: 1, cate: '' })
  check('nhóm khác loại (mẫu vs component) bị bỏ', g.setTemplateGroups(t4, [baby])?.length === 0)

  console.log('Gán/gỡ hàng loạt')
  check('bulkAssign thêm 2 nhóm cho 3 mẫu', g.bulkAssign([t1, t2, t3], [wedding, portrait], []) === 3)
  check('không xóa nhóm khác của mẫu', (g.getGroupsByTemplates([t1])[t1] || []).length === 3, g.getGroupsByTemplates([t1]))
  check('bulkAssign lặp lại không đổi gì (0 mẫu thay đổi)', g.bulkAssign([t1, t2, t3], [wedding, portrait], []) === 0)
  check('gỡ một nhóm khỏi 2 mẫu', g.bulkAssign([t2, t3], [], [portrait]) === 2 && !(g.getGroupsByTemplates([t2])[t2] || []).includes(portrait))

  console.log('Đếm và lọc')
  const r = g.listGroupsWithCount(0)
  const cnt = (n: string) => r.list.find((x) => x.name === n)?.count
  check('đếm số mẫu mỗi nhóm', cnt('Wedding') === 3 && cnt('Chân dung') === 1 && cnt('Em bé') === 1, r.list.map((x) => x.name + ':' + x.count))
  check('đếm mẫu chưa phân nhóm', r.uncategorized === 1 /* noGroup */, r.uncategorized)
  check('lọc theo nhóm (liên kết)', templatesRepo.listPage(0, { page: 1, pageSize: 50, categoryId: wedding }).total === 3)
  check('lọc chưa phân nhóm', templatesRepo.listPage(0, { page: 1, pageSize: 50, uncategorized: true }).list.map((x: any) => x.id).join() === String(noGroup))
  check('tìm theo tên + lọc nhóm', templatesRepo.listPage(0, { page: 1, pageSize: 50, categoryId: wedding, search: 'B' }).total === 1)
  db.prepare('UPDATE templates SET state = 0 WHERE id = ?').run(t3)
  check('mẫu bị ẩn (state 0) không tính vào số đếm', g.listGroupsWithCount(0).list.find((x) => x.name === 'Wedding')?.count === 2)

  console.log('Sắp xếp và nhóm chính')
  g.reorderGroups(0, [wedding, baby])
  const order = g.listGroupsWithCount(0).list.map((x) => x.name).slice(0, 2).join('|')
  check('reorder đặt đúng thứ tự', order === 'Wedding|Em bé', order)
  check('nhóm chính đổi theo thứ tự mới', cateOf(t1) === 'Wedding', cateOf(t1))
  check('nhóm không nêu trong ids xếp sau, giữ nguyên', g.listGroupsWithCount(0).list.map((x) => x.name).slice(2).includes('Chân dung'))

  console.log('Tên nhóm')
  check('trùng tên không phân biệt hoa thường/dấu', g.nameTaken(0, 'WEDDING') && g.nameTaken(0, 'em be') && !g.nameTaken(0, 'Thiên nhiên'))
  check('đổi tên chính nó không bị coi là trùng', !g.nameTaken(0, 'Wedding', wedding))
  g.attachByName(noGroup, 0, 'chan dung')
  check('attachByName gắn theo tên (bỏ dấu, hoa thường)', (g.getGroupsByTemplates([noGroup])[noGroup] || []).join() === String(portrait))

  console.log('Xóa nhóm')
  check('groupUsage đếm số mẫu', g.groupUsage(portrait) === 2, g.groupUsage(portrait))
  check('xóa nhóm gỡ khỏi mẫu, trả số mẫu bị gỡ', g.deleteGroupDetach(portrait) === 2)
  check('mẫu vẫn còn sau khi xóa nhóm', !!db.prepare('SELECT id FROM templates WHERE id = ?').get(noGroup))
  check('liên kết và nhóm đã bị xóa', g.groupUsage(portrait) === 0 && !db.prepare('SELECT id FROM template_categories WHERE id = ?').get(portrait))
  check('nhóm chính của mẫu chỉ còn nhóm cũ không bị ảnh hưởng', cateOf(noGroup) === '', cateOf(noGroup))
  check('xóa nhóm không tồn tại → -1', g.deleteGroupDetach(portrait) === -1)

  console.log('Gợi ý nhóm theo tên')
  check('bỏ dấu tiếng Việt', normalizeText('TẠP CHÍ — Đẹp') === 'tap chi dep')
  check('BACKGROUND BABY → Nền + Em bé', suggestGroupsForTitle('BACKGROUND BABY SHOPDESIGNVN (30)').join() === 'Em bé & trẻ em,Nền')
  check('TYPO BÌA TẠP CHÍ BABY → Em bé + Tạp chí', suggestGroupsForTitle('TYPO BÌA TẠP CHÍ BABY 2022 (7)').join() === 'Em bé & trẻ em,Tạp chí')
  check('TẠP CHÍ THỜI TRANG TRẺ EM → Em bé & trẻ em + Tạp chí', suggestGroupsForTitle('41 TẠP CHÍ THỜI TRANG TRẺ EM 2022 (1)').join() === 'Em bé & trẻ em,Tạp chí')
  check('TRUYỀN THÔNG → Truyền thông', suggestGroupsForTitle('TYPO TRUYỀN THÔNG 2022 SHOPDESIGNVN.COM (8)').join() === 'Truyền thông')
  check('tên chỉ là số → không gợi ý', suggestGroupsForTitle('13').length === 0)
  check('không khớp nhầm giữa từ ("nenh" không phải "nen")', suggestGroupsForTitle('Danh mục nenh').length === 0)

  const s1 = mkTpl('BACKGROUND BABY (1)'), s2 = mkTpl('TYPO TRUYỀN THÔNG (2)'), s3 = mkTpl('13'), s4 = mkTpl('Tạp chí wedding đẹp')
  const grouped = mkTpl('TẠP CHÍ đã có nhóm')
  g.setTemplateGroups(grouped, [baby])
  const sug = g.suggestForUngrouped()
  check('gợi ý chỉ cho mẫu chưa có nhóm', !sug.items.some((i) => i.id === grouped) && sug.items.some((i) => i.id === s1))
  check('mẫu không khớp được đếm là unmatched', sug.unmatched >= 1)
  check('liệt kê nhóm sẽ tạo (chưa có)', sug.toCreate.includes('Nền') && sug.toCreate.includes('Truyền thông') && sug.toCreate.includes('Tạp chí') && !sug.toCreate.includes('Wedding'), sug.toCreate)
  const before = db.prepare('SELECT COUNT(*) n FROM template_categories').get().n
  g.suggestForUngrouped()
  check('xem gợi ý không ghi gì vào DB', db.prepare('SELECT COUNT(*) n FROM template_categories').get().n === before)
  const ap = g.applySuggestions([s1, s2, s4, grouped, s3])
  check('áp dụng: tạo nhóm thiếu, gán cho mẫu đã duyệt', ap.created.includes('Nền') && ap.assigned === 3, ap)
  check('mẫu đã có nhóm không bị đụng (vẫn chỉ nhóm cũ)', g.getGroupsByTemplates([grouped])[grouped]?.join() === String(baby))
  check('mẫu không khớp (tên "13") vẫn chưa phân nhóm', !g.getGroupsByTemplates([s3])[s3])
  check('mẫu "Tạp chí wedding" thuộc 2 nhóm', (g.getGroupsByTemplates([s4])[s4] || []).length === 2)
  const again = g.applySuggestions([s1, s2, s4])
  check('áp dụng lần hai không tạo thêm gì', again.created.length === 0 && again.assigned === 0, again)

  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra nhóm mẫu đạt')
  process.exit(failed ? 1 : 0)
}
try {
  main()
} catch (e) {
  console.error('TEST FAILED', e)
  process.exit(1)
}
