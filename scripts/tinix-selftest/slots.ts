// [TINIX] Kiểm thử khung ảnh của mẫu: đếm khung, lọc theo số ảnh (1 = gồm mẫu chưa đánh dấu), bộ đếm, tính lại khi thêm cột.
// Chạy trên DB tạm. Dùng qua: npm run tinix:test
import { initDB, getDB } from '../../service/src/db'
import * as templatesRepo from '../../service/src/db/templates'
import { countPhotoSlots, setPhotoSlots, photosCondition, recountAllSlots } from '../../service/src/tinix/templateSlots'

let failed = 0
function check(name: string, ok: boolean, detail?: any) {
  if (ok) console.log('  ✓', name)
  else {
    failed++
    console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '')
  }
}

const img = (slot?: boolean, extra: any = {}) => ({ type: 'w-image', uuid: String(Math.random()), width: 100, height: 100, slot, ...extra })
const tpl = (widgets: any[]) => JSON.stringify({ page: { width: 1000, height: 1000 }, widgets })
const mk = (title: string, data: string) => {
  const id = templatesRepo.createTemplate({ title, data, width: 1000, height: 1000, type: 0, cate: '' })
  setPhotoSlots(id, data)
  return id
}

function main() {
  initDB()
  const db = getDB()

  console.log('Đếm khung ảnh')
  check('mẫu chưa đánh dấu → 0', countPhotoSlots(tpl([img(), img()])) === 0)
  check('đếm lớp ảnh có slot=true', countPhotoSlots(tpl([img(true), img(true), img(), { type: 'w-text', slot: true }])) === 2)
  check('bỏ qua lớp ẩn', countPhotoSlots(tpl([img(true, { hidden: true }), img(true)])) === 1)
  check('định dạng layouts [{global,layers}] (trang đầu)', countPhotoSlots(JSON.stringify([{ global: {}, layers: [img(true), img(true), img(true)] }, { global: {}, layers: [img(true)] }])) === 3)
  check('dữ liệu mẫu cũ bọc trong data', countPhotoSlots(JSON.stringify({ data: tpl([img(true), img(true)]) })) === 2)
  check('dữ liệu hỏng/không phải JSON → 0', countPhotoSlots('không phải json') === 0 && countPhotoSlots('{}') === 0 && countPhotoSlots('null') === 0)

  console.log('Lọc theo số ảnh')
  const a = mk('không đánh dấu', tpl([img()]))
  const one = mk('một khung', tpl([img(true)]))
  const two = mk('hai khung', tpl([img(true), img(true)]))
  const three = mk('ba khung', tpl([img(true), img(true), img(true)]))
  const six = mk('sáu khung', tpl([1, 2, 3, 4, 5, 6].map(() => img(true))))
  const ids = (photos: string) => templatesRepo.listPage(0, { page: 1, pageSize: 50, photos }).list.map((x: any) => x.id).sort((x: number, y: number) => x - y).join()
  check('photos=1: mẫu chưa đánh dấu + mẫu 1 khung', ids('1') === [a, one].sort((x, y) => x - y).join(), ids('1'))
  check('photos=2 / 3: đúng số khung', ids('2') === String(two) && ids('3') === String(three))
  check('photos=5+: từ 5 khung trở lên', ids('5+') === String(six))
  check('photos=6 (đúng N lớn hơn 4): đúng 6 khung', ids('6') === String(six))
  check('giá trị lạ bị bỏ qua (không lọc)', ids('abc').split(',').length === 5 && ids('0').split(',').length === 5)
  check('danh sách trả photo_slots', templatesRepo.listPage(0, { page: 1, pageSize: 50 }).list.find((x: any) => x.id === three)!.photo_slots === 3)
  check('photosCondition từ chối giá trị ngoài phạm vi', photosCondition('99') === null && photosCondition('-1') === null && photosCondition('1; DROP TABLE templates') === null)

  console.log('Bộ đếm theo số ảnh')
  const c = templatesRepo.photoCounts(0, { page: 1, pageSize: 1 })
  check('đếm theo nhóm 1/2/3/4/5+', c['1'] === 2 && c['2'] === 1 && c['3'] === 1 && c['4'] === 0 && c['5+'] === 1, c)
  db.prepare('UPDATE templates SET state = 0 WHERE id = ?').run(two)
  check('mẫu bị ẩn không tính', templatesRepo.photoCounts(0, { page: 1, pageSize: 1 })['2'] === 0)
  check('đếm kết hợp nhóm: nhóm chưa phân', templatesRepo.photoCounts(0, { page: 1, pageSize: 1, uncategorized: true })['1'] === 2)
  check('đếm kết hợp tìm kiếm tên', templatesRepo.photoCounts(0, { page: 1, pageSize: 1, search: 'ba khung' })['3'] === 1)

  console.log('Tính lại khi thêm cột / sửa mẫu')
  db.prepare("UPDATE templates SET photo_slots = 0").run()
  const withSlots = recountAllSlots()
  check('recountAllSlots khôi phục số khung (mẫu 1/2/3/6 khung = 4 mẫu)', withSlots === 4 && ids('3') === String(three), withSlots)
  setPhotoSlots(three, tpl([img(true)]))
  check('sửa mẫu bỏ bớt khung → cập nhật số khung', db.prepare('SELECT photo_slots n FROM templates WHERE id = ?').get(three).n === 1)

  console.log(failed ? `\n✗ ${failed} kiểm tra lỗi` : '\n✓ tất cả kiểm tra khung ảnh đạt')
  process.exit(failed ? 1 : 0)
}
try {
  main()
} catch (e) {
  console.error('TEST FAILED', e)
  process.exit(1)
}
