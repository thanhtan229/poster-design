// [TINIX] Kiểm thử API thư viện (service/src/tinix/library.ts) trên DB tạm: thành phần tạo / lưu đè / nhân bản / xóa hẳn,
// chất liệu tạo / sửa / chuyển danh mục / xóa theo (danh mục, url). Dịch vụ chụp ảnh không chạy → coverOk = false (không lỗi).
import { initDB, getDB } from '../../service/src/db'
import router from '../../service/src/tinix/library'
const express = require('../../service/node_modules/express')
const assert = require('assert')

process.env.TINIX_LIBRARY_NO_COVER = '1' // không gọi dịch vụ chụp ảnh thật (cổng 7001) với id của DB tạm

async function main() {
  initDB()
  const db = getDB()
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use(router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/tinix/library`
  const req = async (path: string, body?: any) => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, json: (await r.json()) as any }
  }
  const comp = (text: string) => [
    { type: 'w-text', uuid: 't', parent: 'g', text, left: 10, top: 10, width: 200, height: 50, fontSize: 30 },
    { type: 'w-group', uuid: 'g', parent: '-1', left: 0, top: 0, width: 220, height: 70, isContainer: true },
  ]
  try {
    // ── thành phần ──
    let r = await req('/comp/save', { title: 'ADVENTURE', cate: 'Nhãn', widgets: comp('ADVENTURE'), width: 220, height: 70 })
    assert.equal(r.status, 200)
    const id = r.json.id
    assert.equal(r.json.coverOk, false, 'không có dịch vụ chụp ảnh → báo coverOk=false, không lỗi')
    r = await req(`/comp/${id}`)
    assert.equal(r.json.title, 'ADVENTURE')
    assert.equal(r.json.cate, 'Nhãn')
    // lưu đè: đổi font chữ → dữ liệu mới, tên/danh mục giữ nguyên
    const edited = comp('ADVENTURE')
    ;(edited[0] as any).fontFamily = 'Lobster'
    r = await req('/comp/save', { id, widgets: edited, width: 240, height: 80 })
    assert.equal(r.status, 200)
    const row = db.prepare('SELECT title, cate, width, data FROM templates WHERE id = ?').get(id)
    assert.equal(row.title, 'ADVENTURE')
    assert.equal(row.cate, 'Nhãn')
    assert.equal(row.width, 240)
    assert.equal(JSON.parse(row.data)[0].fontFamily, 'Lobster')
    // chỉ đổi tên / danh mục
    r = await req('/comp/save', { id, title: 'Adventure vàng', cate: 'Khác' })
    assert.equal(db.prepare('SELECT title, cate FROM templates WHERE id = ?').get(id).title, 'Adventure vàng')
    // dữ liệu sai: không có nhóm ở cuối
    r = await req('/comp/save', { title: 'x', widgets: [{ type: 'w-text' }], width: 10, height: 10 })
    assert.equal(r.status, 400)
    // nhân bản
    r = await req('/comp/duplicate', { id })
    const dup = r.json.id
    assert.notEqual(dup, id)
    assert.match(db.prepare('SELECT title FROM templates WHERE id = ?').get(dup).title, /bản sao/)
    // xóa hẳn: dòng biến mất; xóa lần nữa → 404; không đụng mẫu thường (type=0)
    db.prepare(`INSERT INTO templates (id, title, cover, width, height, state, type, cate, data) VALUES (9001, 'Mẫu thường', '', 10, 10, 1, 0, '', '[]')`).run()
    assert.equal((await req('/comp/delete', { id: dup })).status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM templates WHERE id = ?').get(dup).n, 0)
    assert.equal((await req('/comp/delete', { id: dup })).status, 404)
    assert.equal((await req('/comp/delete', { id: 9001 })).status, 404, 'không xóa mẫu thường qua API thành phần')

    // ── chất liệu ──
    const list = (cate: string) => JSON.parse(db.prepare('SELECT list FROM materials WHERE cate = ?').get(cate).list)
    assert.ok(db.prepare("SELECT 1 FROM materials WHERE cate = 'background'").get(), 'danh mục Ảnh nền có sẵn')
    for (const c of ['png', 'mask']) db.prepare("INSERT OR IGNORE INTO materials (cate, list) VALUES (?, '[]')").run(c)
    r = await req('/material/create', { cate: 'png', asset: { type: 'image', url: '/static/a.png', title: 'Tim đỏ' } })
    assert.equal(r.status, 200)
    await req('/material/create', { cate: 'png', asset: { type: 'image', url: '/static/b.png', title: 'Sao' } })
    assert.equal((await req('/material/create', { cate: 'png', asset: { type: 'image', url: '/static/a.png' } })).status, 400, 'trùng url trong danh mục')
    // sửa theo url (không theo vị trí): xóa mục đầu rồi sửa mục sau vẫn đúng mục
    assert.equal((await req('/material/delete', { cate: 'png', url: '/static/a.png' })).status, 200)
    r = await req('/material/update', { cate: 'png', url: '/static/b.png', patch: { title: 'Sao vàng', url: '/static/b2.png' } })
    assert.equal(r.status, 200)
    assert.deepEqual(list('png').map((x: any) => [x.title, x.url]), [['Sao vàng', '/static/b2.png']])
    // đổi loại + chuyển danh mục
    r = await req('/material/update', { cate: 'png', url: '/static/b2.png', patch: { type: 'mask' }, toCate: 'mask' })
    assert.equal(r.json.cate, 'mask')
    assert.equal(list('png').length, 0)
    const moved = list('mask').find((x: any) => x.url === '/static/b2.png')
    assert.equal(moved.type, 'mask')
    assert.equal(moved.isContainer, true)
    assert.equal((await req('/material/update', { cate: 'png', url: '/static/khong-co.png', patch: {} })).status, 400)
    assert.equal((await req('/material/create', { cate: 'png', asset: { type: 'video', url: '/x' } })).status, 400, 'loại không hợp lệ')
    console.log('PASS: thư viện — thành phần tạo/lưu đè/đổi tên/nhân bản/xóa hẳn; chất liệu tạo/sửa/chuyển danh mục/xóa theo url')
  } finally {
    server.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
