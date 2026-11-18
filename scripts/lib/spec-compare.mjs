// So sánh bản dựng với ảnh mẫu: ảnh chồng/khác biệt và kiểm tra bố cục theo spec (quy trình "dựng theo ảnh mẫu bằng spec").
// Spec: { ref:{width,height}, items:[{id, type, box:[x,y,w,h], rot, z}] } (đơn vị = điểm ảnh ảnh mẫu).
// Bản nháp: mỗi lớp thuộc một mục spec mang trường `specId`; thứ tự mảng layers = thứ tự chồng lớp.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(path.join(root, 'service', 'package.json'))('sharp')

export function validateLayoutSpec(spec) {
  if (!spec || !spec.ref || !Array.isArray(spec.items)) throw new Error('Spec cần { ref:{width,height}, items:[...] }')
  const ids = new Set()
  for (const it of spec.items) {
    if (!it.id || ids.has(it.id)) throw new Error(`Mã mục spec trùng hoặc thiếu: ${it.id}`)
    ids.add(it.id)
    if (!Array.isArray(it.box) || it.box.length !== 4 || it.box.some((n) => !Number.isFinite(n))) throw new Error(`Mục ${it.id}: box phải là [x,y,w,h]`)
    if (!Number.isFinite(it.z)) throw new Error(`Mục ${it.id}: thiếu z`)
  }
  return spec
}

// mode: 'blend' (chồng mờ) | 'diff' (khác biệt màu, tăng sáng ×3)
export async function overlayImages(referenceFile, renderFile, mode = 'blend', opacity = 0.5) {
  const meta = await sharp(referenceFile).metadata()
  const w = meta.width, h = meta.height
  const ref = await sharp(referenceFile).removeAlpha().png().toBuffer()
  const render = await sharp(renderFile).resize(w, h, { fit: 'fill' }).removeAlpha().png().toBuffer()
  if (mode === 'diff') {
    const diff = await sharp(ref).composite([{ input: render, blend: 'difference' }]).png().toBuffer()
    const stats = await sharp(diff).stats()
    const meanDiff = stats.channels.reduce((a, c) => a + c.mean, 0) / stats.channels.length / 255
    return { buffer: await sharp(diff).linear(3, 0).png().toBuffer(), meanDiff: Number(meanDiff.toFixed(4)) }
  }
  const top = await sharp(render).ensureAlpha(opacity).png().toBuffer()
  return { buffer: await sharp(ref).composite([{ input: top }]).png().toBuffer() }
}

// Kiểm tra từng thành phần: tâm, cỡ, góc xoay và thứ tự lớp
export function checkLayout(draft, spec, { posTol = 0.02, sizeTol = 0.05, rotTol = 2 } = {}) {
  validateLayoutSpec(spec)
  const pageW = Number(draft.global && draft.global.width), pageH = Number(draft.global && draft.global.height)
  if (!pageW || !pageH) throw new Error('Bản nháp thiếu global.width/height')
  const k = pageW / spec.ref.width
  const layers = draft.layers || []
  const byUuid = new Map(layers.map((l) => [l.uuid, l]))
  const rotOf = (l) => {
    let r = 0, cur = l, guard = 0
    while (cur && guard++ < 10) { r += parseFloat(cur.rotate) || 0; cur = cur.parent ? byUuid.get(cur.parent) : null }
    return r
  }
  const found = new Map()
  layers.forEach((l, i) => { if (l.specId) { if (!found.has(l.specId)) found.set(l.specId, []); found.get(l.specId).push({ l, i }) } })
  const items = [], problems = []
  for (const it of spec.items) {
    const hit = found.get(it.id)
    if (!hit) { if (it.type !== 'paper' && it.type !== 'wave') problems.push({ id: it.id, issue: 'không có lớp mang specId này' }); continue }
    const l = hit[hit.length - 1].l
    const [x, y, w, h] = it.box.map((n) => n * k)
    const ins = Number(l.specInset) || 0, co = !!l.specCenterOnly
    if (l.specSkip) continue
    const dcx = (Number(l.left) + Number(l.width) / 2 - (x + w / 2)) / pageW
    const dcy = (Number(l.top) + Number(l.height) / 2 - (y + h / 2)) / pageH
    const dw = co ? 0 : (Number(l.width) - 2 * ins) / w - 1, dh = co ? 0 : (Number(l.height) - 2 * ins) / h - 1
    const drot = co ? 0 : rotOf(l) - (it.rot || 0)
    const row = { id: it.id, dPos: Number(Math.hypot(dcx, dcy).toFixed(4)), dW: Number(dw.toFixed(3)), dH: Number(dh.toFixed(3)), dRot: Number(drot.toFixed(1)) }
    if (row.dPos > posTol) row.warn = 'vị trí lệch'
    if (Math.abs(dw) > sizeTol || Math.abs(dh) > sizeTol) row.warn = (row.warn ? row.warn + ', ' : '') + 'cỡ lệch'
    if (Math.abs(drot) > rotTol) row.warn = (row.warn ? row.warn + ', ' : '') + 'góc lệch'
    items.push(row)
  }
  // thứ tự lớp: với mọi cặp, z spec nhỏ hơn thì chỉ số mảng phải nhỏ hơn
  const order = []
  const tagged = spec.items.filter((it) => found.has(it.id))
  for (let a = 0; a < tagged.length; a++) for (let b = 0; b < tagged.length; b++) {
    const A = tagged[a], B = tagged[b]
    if (A.z < B.z && Math.max(...found.get(A.id).map((e) => e.i)) > Math.min(...found.get(B.id).map((e) => e.i))) order.push(`${A.id} phải nằm dưới ${B.id}`)
  }
  const bad = items.filter((r) => r.warn)
  return { checked: items.length, missing: problems, outOfTolerance: bad.length, worst: items.slice().sort((p, q) => q.dPos - p.dPos).slice(0, 5), items, orderViolations: order, ok: bad.length === 0 && order.length === 0 && problems.length === 0 }
}
