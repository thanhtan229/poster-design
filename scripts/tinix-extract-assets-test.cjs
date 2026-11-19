// [TINIX] Kiểm thử offline bộ tách phần tử (src/common/methods/extractAssets.ts): chữ kèm khung đi cùng nhau thành một mục Chữ.
const assert = require('node:assert/strict')
const { extractAssets } = require('../src/common/methods/extractAssets.ts')

const img = (uuid, url, box, extra = {}) => ({ type: 'w-image', uuid, name: uuid, imgUrl: url, mask: '', parent: '-1', ...box, ...extra })
const txt = (uuid, text, box, extra = {}) => ({ type: 'w-text', uuid, name: uuid, text, fontSize: 30, color: '#222', parent: '-1', ...box, ...extra })
const grp = (uuid, box) => ({ type: 'w-group', uuid, name: uuid, parent: '-1', isContainer: true, ...box })
const run = (layers) => extractAssets(JSON.stringify([{ global: { width: 2000, height: 1500 }, layers }]))
const kinds = (t) => t.widgets.map((w) => w.type)

// 1) Nhãn là một nhóm (khung + chữ): một mục Chữ chứa cả khung; khung KHÔNG bị tách riêng sang chất liệu
{
  const r = run([
    grp('g1', { left: 900, top: 980, width: 340, height: 70 }),
    img('khung', '/static/label-adventure.png', { left: 900, top: 980, width: 340, height: 70 }, { parent: 'g1' }),
    txt('chu', 'ADVENTURE', { left: 930, top: 990, width: 280, height: 50 }, { parent: 'g1' }),
  ])
  assert.equal(r.texts.length, 1, 'một mục Chữ')
  assert.equal(r.texts[0].source, 'group')
  assert.deepEqual(kinds(r.texts[0]), ['w-image', 'w-text', 'w-group'], 'khung + chữ, nhóm ở cuối')
  assert.equal(r.materials.length, 0, 'khung không bị liệt kê riêng')
  const k = r.texts[0].widgets[0]
  assert.deepEqual([k.left, k.top], [0, 0], 'tọa độ tính từ góc nhóm')
}
// 2) Cụm ảnh người + chú thích: không thành mục Chữ (có ảnh người dùng); khung vẫn là chất liệu, ảnh người bị bỏ
{
  const r = run([
    grp('g2', { left: 100, top: 100, width: 500, height: 600 }),
    img('khung-giay', '/static/frame.png', { left: 100, top: 100, width: 500, height: 600 }, { parent: 'g2' }),
    img('anh-nguoi', '/static/photo.jpg', { left: 130, top: 130, width: 440, height: 440 }, { parent: 'g2', slot: true }),
    txt('chu-thich', 'Bé Na', { left: 150, top: 600, width: 300, height: 50 }, { parent: 'g2' }),
  ])
  assert.equal(r.texts.length, 0, 'cụm ảnh người không thành mục Chữ')
  assert.deepEqual(r.materials.map((m) => m.url), ['/static/frame.png'], 'khung giấy vẫn là chất liệu, ảnh người bị bỏ')
}
// 3) Chữ rời nằm trên một hình rời ngay bên dưới → tự gộp (gợi ý); hình không còn ở chất liệu
{
  const r = run([
    img('the-vang', '/static/tag-yellow.png', { left: 900, top: 980, width: 360, height: 80 }),
    txt('go-slow', 'GO SLOW', { left: 940, top: 995, width: 280, height: 50 }),
  ])
  assert.equal(r.texts.length, 1)
  assert.equal(r.texts[0].source, 'onShape')
  assert.deepEqual(kinds(r.texts[0]), ['w-image', 'w-text', 'w-group'])
  assert.equal(r.texts[0].width, 360); assert.equal(r.texts[0].height, 80)
  assert.deepEqual([r.texts[0].widgets[1].left, r.texts[0].widgets[1].top], [40, 15], 'chữ giữ đúng vị trí trên khung')
  assert.equal(r.materials.length, 0)
}
// 4) Hình quá lớn so với chữ (ảnh lớn có chữ nhỏ đè lên) → không gộp
{
  const r = run([
    img('sticker-lon', '/static/big.png', { left: 0, top: 0, width: 1200, height: 900 }),
    txt('chu-nho', 'hi', { left: 100, top: 100, width: 100, height: 40 }),
  ])
  assert.equal(r.texts[0].source, 'single')
  assert.equal(r.materials.length, 1, 'ảnh lớn vẫn là chất liệu riêng')
}
// 5) Hình nằm TRÊN chữ (thứ tự lớp) → không phải khung của chữ
{
  const r = run([
    txt('chu', 'TOP', { left: 940, top: 995, width: 280, height: 50 }),
    img('de-len', '/static/over.png', { left: 900, top: 980, width: 360, height: 80 }),
  ])
  assert.equal(r.texts[0].source, 'single')
  assert.equal(r.materials.length, 1)
}
// 6) Nhóm chữ lồng nhau → chỉ một mục (nhóm ngoài cùng), không lặp
{
  const r = run([
    grp('ngoai', { left: 0, top: 0, width: 600, height: 300 }),
    img('nen-ngoai', '/static/outer.png', { left: 0, top: 0, width: 600, height: 300 }, { parent: 'ngoai' }),
    grp('trong', { left: 50, top: 50, width: 300, height: 80 }),
    txt('chu-trong', 'INNER', { left: 60, top: 60, width: 200, height: 50 }, { parent: 'trong' }),
  ].map((w) => (w.uuid === 'trong' ? { ...w, parent: 'ngoai' } : w)))
  assert.equal(r.texts.length, 1, 'không lặp mục cho nhóm con')
  assert.equal(r.texts[0].source, 'group')
  assert.equal(r.materials.length, 0)
}
// 7) Hai dòng chữ cùng nằm trên một khung → một mục chứa khung + cả hai dòng
{
  const r = run([
    img('nhan', '/static/ribbon.png', { left: 100, top: 100, width: 400, height: 140 }),
    txt('dong1', 'Chúc bé', { left: 130, top: 110, width: 340, height: 50 }),
    txt('dong2', 'hay ăn chóng lớn', { left: 130, top: 170, width: 340, height: 50 }),
  ])
  assert.equal(r.texts.length, 1)
  assert.deepEqual(kinds(r.texts[0]), ['w-image', 'w-text', 'w-text', 'w-group'])
}
console.log('Tách phần tử (chữ kèm khung): OK')
