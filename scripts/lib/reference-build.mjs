// [TINIX] Dựng bản nháp mẫu cắt dán từ ẢNH THAM CHIẾU + một file spec mô tả các thành phần (vị trí, góc xoay, chữ, font).
//
// Phân công: vị trí/kích thước/góc xoay từng khung do người (hoặc tác tử nhìn ảnh qua lưới `reference grid`) ghi vào spec — thử
// nghiệm cho thấy dò tự động mù không tách được các khung chồng lớp. Máy làm phần đo đếm: cắt ảnh trong khung đã duỗi thẳng, tách
// sticker (BiRefNet), dò trái tim nền, lấy màu giấy/nền/mực, và TỰ KHỚP CỠ CHỮ theo số đo mực chữ thật trong ảnh mẫu (không tràn dòng).
//
// Module thuần: mọi thứ phụ thuộc bên ngoài được truyền vào (`cutout`, `measure`, `fonts`) nên kiểm thử offline được.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const uid = () => crypto.randomUUID()
const MAX_LAYERS = 400
const num = (v) => typeof v === 'number' && Number.isFinite(v)
const pair = (v, label, positive = false) => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(num) || (positive && !v.every((n) => n > 0))) throw new Error(`${label} phải là [số, số]${positive ? ' dương' : ''}`)
  return v
}
const box4 = (v, label) => {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(num) || v[2] <= v[0] || v[3] <= v[1]) throw new Error(`${label} phải là [x0, y0, x1, y1] với x1 > x0, y1 > y0`)
  return v
}
const hex = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null)
const toHex = ([r, g, b]) => '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')

// ───────────────────────────── spec ─────────────────────────────────────────────────────────────────────────────────
export function validateSpec(spec) {
  const problems = []
  const need = (cond, msg) => { if (!cond) problems.push(msg) }
  need(spec && typeof spec === 'object' && !Array.isArray(spec), 'spec phải là một đối tượng JSON')
  if (problems.length) throw new Error(problems.join('; '))
  need(/^[a-z0-9][a-z0-9-]{0,60}$/.test(String(spec.name || '')), 'name là slug a-z, 0-9, gạch ngang (tối đa 61 ký tự); dùng làm tên thư mục tài nguyên')
  const canvasWidth = spec.canvas?.width === undefined ? 2400 : spec.canvas.width
  need(Number.isInteger(canvasWidth) && canvasWidth >= 600 && canvasWidth <= 6000, 'canvas.width là số nguyên 600–6000')
  need(Array.isArray(spec.elements) && spec.elements.length > 0 && spec.elements.length <= 80, 'elements là mảng 1–80 phần tử, theo thứ tự lớp từ dưới lên trên')
  const names = new Set()
  for (const [i, el] of (Array.isArray(spec.elements) ? spec.elements : []).entries()) {
    const at = `elements[${i}]${el && el.name ? ` "${el.name}"` : ''}`
    try {
      if (!el || typeof el !== 'object') throw new Error('phải là đối tượng')
      if (!el.name || typeof el.name !== 'string') throw new Error('thiếu name')
      if (names.has(el.name)) throw new Error('trùng name')
      names.add(el.name)
      if (el.type === 'frame') {
        pair(el.center, 'center'); pair(el.size, 'size', true)
        if (el.rotate !== undefined && !num(el.rotate)) throw new Error('rotate phải là số (độ, dương = thuận chiều kim đồng hồ)')
        if (!Array.isArray(el.photos) || !el.photos.length) throw new Error('frame cần photos: [{name, offset, size}]')
        for (const p of el.photos) { if (!p.name) throw new Error('mỗi photo cần name'); pair(p.offset || [0, 0], 'photo.offset'); pair(p.size, 'photo.size', true) }
      } else if (el.type === 'photo') {
        pair(el.center, 'center'); pair(el.size, 'size', true)
        if (el.rotate !== undefined && !num(el.rotate)) throw new Error('rotate phải là số')
        if (el.mask !== undefined && !['cloud', 'circle', 'ellipse', 'rounded'].includes(el.mask)) throw new Error('mask là cloud | circle | ellipse | rounded')
      } else if (el.type === 'label') {
        pair(el.center, 'center'); pair(el.size, 'size', true)
        if (el.rotate !== undefined && !num(el.rotate)) throw new Error('rotate phải là số')
        if (!['rect', 'ribbon', 'cutout'].includes(el.shape || 'rect')) throw new Error('shape là rect | ribbon | cutout')
        if (el.color !== undefined && el.color !== 'auto' && !hex(el.color)) throw new Error('color là "auto" hoặc #rrggbb')
        if (!el.text || typeof el.text !== 'string') throw new Error('label cần text')
        if (!el.font || typeof el.font !== 'string') throw new Error('label cần font (tên trong kho font, xem `fonts list`)')
        if (el.textInk !== undefined) box4(el.textInk, 'textInk')
        if (el.textColor !== undefined && el.textColor !== 'auto' && !hex(el.textColor)) throw new Error('textColor là "auto" hoặc #rrggbb')
        if (el.fontSize !== undefined && !(num(el.fontSize) && el.fontSize > 0)) throw new Error('fontSize là số dương (px canvas); bỏ trống để tự khớp')
      } else if (el.type === 'sticker') {
        box4(el.box, 'box')
        if (el.keep !== undefined && !['cutout', 'box'].includes(el.keep)) throw new Error('keep là cutout (tách nền, mặc định) | box (giữ nguyên vùng chữ nhật)')
        if (el.mask !== undefined && !['cloud', 'circle', 'ellipse', 'rounded'].includes(el.mask)) throw new Error('mask là cloud | circle | ellipse | rounded')
      } else throw new Error('type là frame | photo | label | sticker')
    } catch (e) { problems.push(`${at}: ${e.message}`) }
  }
  if (spec.background !== undefined) {
    const b = spec.background
    if (b.color !== undefined && b.color !== 'auto' && !hex(b.color)) problems.push('background.color là "auto" hoặc #rrggbb')
    if (b.hearts !== undefined && typeof b.hearts !== 'boolean') problems.push('background.hearts là true/false')
    if (b.pattern !== undefined && !['none', 'reference'].includes(b.pattern)) problems.push('background.pattern là none (mặc định) | reference (lấy hoa văn nền từ ảnh mẫu)')
  }
  if (problems.length) throw new Error('Spec không hợp lệ: ' + problems.join('; '))
  return spec
}

// ───────────────────────────── ảnh tham chiếu ───────────────────────────────────────────────────────────────────────
export async function loadReference(input) {
  const base = sharp(input, { limitInputPixels: 100000000 }).rotate().removeAlpha()
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true })
  const png = await base.clone().png().toBuffer()
  return { png, raw: data, width: info.width, height: info.height }
}
const grayAt = (raw, i) => (raw[i * 3] * 299 + raw[i * 3 + 1] * 587 + raw[i * 3 + 2] * 114) / 1000
const clampRect = (ref, [x0, y0, x1, y1]) => [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(ref.width, Math.ceil(x1)), Math.min(ref.height, Math.ceil(y1))]

/** Hộp bao (không xoay) của phần tử, theo toạ độ ảnh tham chiếu. */
export function elementRect(el) {
  if (el.type === 'sticker') return el.box
  const [cx, cy] = el.center, [w, h] = el.size, r = ((el.rotate || 0) * Math.PI) / 180
  const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)), bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))
  return [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2]
}

/** Ngưỡng Otsu trên mức xám. Khi nhiều ngưỡng cho phương sai giữa lớp ngang nhau (ví dụ ảnh chỉ có hai mức màu) lấy GIỮA khoảng đó. */
function otsu(hist, total) {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let wB = 0, sumB = 0, best = -1, first = 128, last = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2
    if (between > best * (1 + 1e-9)) { best = between; first = t; last = t } else if (Math.abs(between - best) <= best * 1e-9) last = t
  }
  return Math.floor((first + last) / 2)
}

/** Đo "mực" chữ trong một vùng của ảnh mẫu: khung bao (phân vị 1–99%) và màu mực đậm nhất. tone: 'dark' (chữ tối trên nền sáng) | 'light'. */
export function measureInk(ref, rect, tone = 'dark') {
  const [x0, y0, x1, y1] = clampRect(ref, rect)
  const hist = new Array(256).fill(0)
  let total = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Math.round(grayAt(ref.raw, y * ref.width + x))]++; total++ }
  if (total < 50) return null
  const thr = otsu(hist, total), xs = [], ys = [], px = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * ref.width + x, g = grayAt(ref.raw, i)
    if (tone === 'dark' ? g < thr : g > thr) { xs.push(x); ys.push(y); px.push([g, ref.raw[i * 3], ref.raw[i * 3 + 1], ref.raw[i * 3 + 2]]) }
  }
  if (xs.length < 30) return null
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  px.sort((a, b) => (tone === 'dark' ? a[0] - b[0] : b[0] - a[0]))
  const core = px.slice(0, Math.max(5, Math.floor(px.length / 3)))
  const mean = (k) => core.reduce((s, p) => s + p[k], 0) / core.length
  const l = q(xs, 0.01), r = q(xs, 0.99), t = q(ys, 0.01), b = q(ys, 0.99)
  return { x0: l, y0: t, x1: r, y1: b, width: r - l, height: b - t, color: toHex([mean(1), mean(2), mean(3)]), threshold: thr }
}

/** Màu giấy của khung: trung vị các điểm sáng, ít màu trong dải viền ngoài (2–7 px) của khung đã duỗi thẳng. */
export async function paperColorOf(ref, el) {
  const [cx, cy] = el.center, [w, h] = el.size
  const { data, info } = await (await uprightCrop(ref, cx, cy, w, h, el.rotate || 0, 1)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  // dải viền ngoài của khung: giấy trắng/nhạt → chỉ lấy điểm sáng, ít màu (loại bóng, nền); giấy màu hoặc kraft → lấy mọi điểm trong dải
  const bright = [[], [], []], all = [[], [], []]
  let n = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const edge = Math.min(x, y, info.width - 1 - x, info.height - 1 - y)
    if (edge < 2 || edge > 7) continue
    const i = (y * info.width + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2]
    n++; all[0].push(r); all[1].push(g); all[2].push(b)
    if ((r + g + b) / 3 > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 60) { bright[0].push(r); bright[1].push(g); bright[2].push(b) }
  }
  const c = bright[0].length >= 0.6 * n ? bright : all
  if (c[0].length < 20) return null
  return toHex(c.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] }))
}
function medianColor(ref, rect, accept = () => true) {
  const [x0, y0, x1, y1] = clampRect(ref, rect), c = [[], [], []]
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * ref.width + x, r = ref.raw[i * 3], g = ref.raw[i * 3 + 1], b = ref.raw[i * 3 + 2]
    if (accept(r, g, b)) { c[0].push(r); c[1].push(g); c[2].push(b) }
  }
  if (c[0].length < 10) return null
  return toHex(c.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] }))
}

/** Các trái tim trắng (hoặc họa tiết sáng nhỏ) trên nền tối: thành phần liên thông nhỏ, gần tròn, ngoài các vùng phần tử. */
export function detectHearts(ref, excludeRects, opts = {}) {
  const { width: W, height: H } = ref
  const gMin = opts.gray ?? 140, sMax = opts.sat ?? 0.38, aMin = opts.minArea ?? 14, aMax = opts.maxArea ?? 2200
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = ref.raw[i * 3], g = ref.raw[i * 3 + 1], b = ref.raw[i * 3 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (grayAt(ref.raw, i) > gMin && (mx === 0 ? 0 : (mx - mn) / mx) < sMax) mask[i] = 1
  }
  for (const rect of excludeRects) {
    const [x0, y0, x1, y1] = clampRect(ref, rect)
    for (let y = y0; y < y1; y++) mask.fill(0, y * W + x0, y * W + x1)
  }
  const seen = new Uint8Array(W * H), hearts = [], stack = []
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue
    let area = 0, minX = W, maxX = 0, minY = H, maxY = 0, sx = 0, sy = 0
    stack.length = 0; stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W
      area++; sx += x; sy += y
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || !mask[q]) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue
        seen[q] = 1; stack.push(q)
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1, fill = area / (w * h)
    if (area >= aMin && area <= aMax && w / h >= 0.4 && w / h <= 2.4 && fill > 0.22 && Math.max(w, h) >= 5 && Math.max(w, h) < 60) {
      hearts.push({ x: sx / area, y: sy / area, size: Math.max(w, h) })
    }
  }
  return hearts
}

// ───────────────────────────── hình học ─────────────────────────────────────────────────────────────────────────────
/** Cắt vùng w×h quanh (cx,cy) sau khi xoay ngược `rot` độ (CSS: dương = thuận chiều kim đồng hồ), rồi phóng theo `scale`. */
export async function uprightCrop(ref, cx, cy, w, h, rot, scale) {
  const half = Math.ceil(Math.hypot(w, h) / 2) + 4
  // sharp luôn chạy extract() TRƯỚC extend() bất kể thứ tự gọi, nên mỗi bước được cố định thành một bộ đệm riêng
  const extended = await sharp(ref.png).extend({ top: half, bottom: half, left: half, right: half, extendWith: 'copy' }).png().toBuffer()
  let square = await sharp(extended).extract({ left: Math.max(0, Math.round(cx)), top: Math.max(0, Math.round(cy)), width: 2 * half, height: 2 * half }).png().toBuffer()
  if (rot) square = await sharp(square).rotate(-rot, { background: '#000000' }).png().toBuffer()
  const meta = await sharp(square).metadata()
  const left = Math.max(0, Math.floor((meta.width - w) / 2)), top = Math.max(0, Math.floor((meta.height - h) / 2))
  return sharp(square).extract({ left, top, width: Math.min(Math.round(w), meta.width - left), height: Math.min(Math.round(h), meta.height - top) })
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), { fit: 'fill', kernel: 'lanczos3' })
}

/**
 * Vá lỗ "đẩy-kéo" (push-pull): rgb là RGB w×h, hole[i] = 1 nơi cần vá. Thu nhỏ có trọng số (chỉ điểm biết) lên các mức thô,
 * rồi kéo màu xuống lấp lỗ. Kết quả mịn (không tái tạo họa tiết trong lỗ) — đủ cho vùng bị phần tử khác che.
 */
export function inpaintPushPull(rgb, hole, w, h) {
  const levels = []
  let cw = w, ch = h
  let col = new Float32Array(w * h * 3), wt = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) if (!hole[i]) { wt[i] = 1; col[i * 3] = rgb[i * 3]; col[i * 3 + 1] = rgb[i * 3 + 1]; col[i * 3 + 2] = rgb[i * 3 + 2] }
  levels.push({ w: cw, h: ch, col, wt })
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, (cw + 1) >> 1), nh = Math.max(1, (ch + 1) >> 1)
    const nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh)
    const prev = levels[levels.length - 1]
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, j = (y >> 1) * nw + (x >> 1), q = prev.wt[i]
      if (!q) continue
      nwt[j] += q; nc[j * 3] += prev.col[i * 3] * q; nc[j * 3 + 1] += prev.col[i * 3 + 1] * q; nc[j * 3 + 2] += prev.col[i * 3 + 2] * q
    }
    for (let j = 0; j < nw * nh; j++) if (nwt[j] > 0) { nc[j * 3] /= nwt[j]; nc[j * 3 + 1] /= nwt[j]; nc[j * 3 + 2] /= nwt[j] }
    levels.push({ w: nw, h: nh, col: nc, wt: new Float32Array(nw * nh).map((_, j) => Math.min(1, nwt[j])) })
    cw = nw; ch = nh
  }
  // kéo: từ mức thô xuống mịn, nơi trọng số < 1 trộn với mức thô hơn
  for (let l = levels.length - 2; l >= 0; l--) {
    const f = levels[l], c = levels[l + 1]
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x, q = f.wt[i]
      if (q >= 1) continue
      // nội suy song tuyến từ mức thô (tránh khối vuông khi phóng to)
      const gx = Math.min(c.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), gy = Math.min(c.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
      const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(c.w - 1, x0 + 1), y1 = Math.min(c.h - 1, y0 + 1), tx = gx - x0, ty = gy - y0
      for (let k = 0; k < 3; k++) {
        const up = (c.col[(y0 * c.w + x0) * 3 + k] * (1 - tx) + c.col[(y0 * c.w + x1) * 3 + k] * tx) * (1 - ty) + (c.col[(y1 * c.w + x0) * 3 + k] * (1 - tx) + c.col[(y1 * c.w + x1) * 3 + k] * tx) * ty
        f.col[i * 3 + k] = f.col[i * 3 + k] * q + up * (1 - q)
      }
      f.wt[i] = 1
    }
  }
  const out = Buffer.alloc(w * h * 3), f0 = levels[0]
  for (let i = 0; i < w * h * 3; i++) out[i] = hole[(i / 3) | 0] ? Math.round(f0.col[i]) : rgb[i]
  return out
}

const heartPath = (cx, cy, s, ang) => {
  const pts = []
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * 2 * Math.PI, x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    const px = (x / 34) * s, py = (y / 34) * s, c = Math.cos(ang), sn = Math.sin(ang)
    pts.push(`${(cx + px * c - py * sn).toFixed(1)},${(cy + px * sn + py * c).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

const maskDataUri = (kind) => {
  const body = {
    cloud: Array.from({ length: 10 }, (_, i) => `<circle cx="${(400 + 250 * Math.cos((i * Math.PI) / 5)).toFixed(1)}" cy="${(400 + 250 * Math.sin((i * Math.PI) / 5)).toFixed(1)}" r="150" fill="white"/>`).join('') + '<circle cx="400" cy="400" r="300" fill="white"/>',
    circle: '<circle cx="400" cy="400" r="400" fill="white"/>',
    ellipse: '<ellipse cx="400" cy="400" rx="400" ry="320" fill="white"/>',
    rounded: '<rect width="800" height="800" rx="90" fill="white"/>',
  }[kind]
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">${body}</svg>`)
}

// ───────────────────────────── lớp mặc định (khớp widget thật của ứng dụng) ──────────────────────────────────────────
const record = (w, h) => ({ width: w, height: h, minWidth: 10, minHeight: 10, dir: 'all' })
export function imageLayer(o) {
  return {
    name: o.name, type: 'w-image', uuid: uid(), width: o.width, height: o.height, left: o.left, top: o.top, zoom: 1, transform: 'scale(1)', radius: 0, opacity: 1,
    parent: o.parent || '-1', imgUrl: o.url, mask: o.mask || '', isContainer: false, setting: [], rotate: 0, record: record(o.width, o.height), lock: !!o.lock, isNinePatch: false,
    flip: '', sliceData: { ratio: 0, left: 0 }, fit: o.fit || 'fill', slot: !!o.slot, printRole: o.printRole || 'raised', ...(o.printGroup ? { printGroup: o.printGroup } : {}),
    degree: 0, templateRole: o.role || 'fixed', cropX: 50, cropY: 50, effects: o.shadow ? { shadow: o.shadow } : {},
  }
}
export function groupLayer(o) {
  return {
    type: 'w-group', name: 'Cụm ' + o.name, uuid: uid(), left: o.left, top: o.top, width: o.width, height: o.height, parent: '-1', isContainer: true, opacity: 1,
    rotate: `${o.rotate}deg`, printGroup: uid(), printRole: 'raised', templateRole: 'fixed', record: { width: o.width, height: o.height, minWidth: 0, minHeight: 0, dir: 'none' },
  }
}
export function textLayer(o) {
  return {
    name: o.name, type: 'w-text', uuid: uid(), editable: false, left: o.left, top: o.top, transform: '', lineHeight: o.lineHeight, letterSpacing: o.letterSpacing || 0, fontSize: o.fontSize, zoom: 1,
    fontClass: o.fontClass, fontFamily: o.fontClass.value, fontWeight: 'normal', fontStyle: 'normal', writingMode: 'horizontal-tb', textDecoration: 'none', color: o.color,
    textAlign: 'center', text: o.text, opacity: 1, backgroundColor: '', parent: '-1', record: { width: 0, height: 0, minWidth: 0, minHeight: 0, dir: 'horizontal' },
    width: o.width, height: o.height, printRole: 'raised', templateRole: 'text',
  }
}

// ───────────────────────────── tự khớp chữ ──────────────────────────────────────────────────────────────────────────
/**
 * Tìm cỡ chữ (px canvas) để bề rộng mực của dòng rộng nhất bằng `targetInkWidth`, rồi tính khung chữ không tràn dòng và vị trí sao cho
 * tâm mực trùng (cx, cy). `measure` do bên gọi cung cấp (mặc định: Chromium, xem text-measure.mjs).
 */
export async function fitText(measure, req) {
  const { family, url, text, targetInkWidth, targetInkHeight, center, letterSpacing = 0, lineHeight: lhIn } = req
  const lines = text.split('\n').length
  let size = 100, m = await measure({ family, url, text, size, letterSpacing, lineHeight: 1.2 })
  if (!(m.inkWidth > 0)) throw new Error(`Không đo được chữ "${text.slice(0, 20)}" với font ${family}`)
  for (let i = 0; i < 2; i++) { size = Math.max(6, (size * targetInkWidth) / m.inkWidth); m = await measure({ family, url, text, size, letterSpacing, lineHeight: 1.2 }) }
  size = Math.max(6, Math.round(size))
  m = await measure({ family, url, text, size, letterSpacing, lineHeight: 1.2 })
  // nhiều dòng: chọn lineHeight để tổng chiều cao mực khớp mẫu
  let lineHeight = lhIn || 1.2
  if (!lhIn && lines > 1 && targetInkHeight) {
    const lineH = (targetInkHeight - m.ascent - m.descent) / (lines - 1)
    lineHeight = Math.min(2, Math.max(0.9, lineH / size))
  }
  const lineH = lineHeight * size
  const boxW = Math.ceil(Math.max(m.width, m.inkWidth) * 1.12) + 6, boxH = Math.ceil(lines * lineH + 6)
  // đường cơ sở dòng đầu trong hộp: nửa khoảng dãn dòng + ascent của font
  const baseline1 = (lineH - (m.fontAscent + m.fontDescent)) / 2 + m.fontAscent
  const inkTop = baseline1 - m.ascent, inkBottom = baseline1 + (lines - 1) * lineH + m.descent
  const inkCenterY = (inkTop + inkBottom) / 2
  return { fontSize: size, lineHeight: +lineHeight.toFixed(3), width: boxW, height: boxH, left: center[0] - boxW / 2, top: center[1] - inkCenterY, measured: { inkWidth: +m.inkWidth.toFixed(1), lines } }
}

// ───────────────────────────── dựng bản nháp ────────────────────────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {object} p.ref        kết quả loadReference
 * @param {object} p.spec       spec đã validateSpec
 * @param {string} p.assetsDir  thư mục ghi tài nguyên (service/static/collage/<name>)
 * @param {string} p.assetsUrl  tiền tố URL tương ứng (/static/collage/<name>)
 * @param {function} p.cutout   async (pngBuffer) => pngBuffer RGBA (tách nền; BiRefNet)
 * @param {function} p.measure  async ({family,url,text,size,letterSpacing,lineHeight}) => số đo chữ
 * @param {Array}    p.fonts    danh sách font của kho [{alias, ttf, woff, id}]
 * @param {string}   p.photos   'placeholder' (mặc định) | 'reference'
 */
export async function buildFromReference({ ref, spec, assetsDir, assetsUrl, cutout, measure, fonts = [], photos = 'placeholder' }) {
  validateSpec(spec)
  await mkdir(assetsDir, { recursive: true })
  const W = spec.canvas?.width || 2400, S = W / ref.width, H = Math.round(ref.height * S)
  const layers = [], report = { canvas: { width: W, height: H, scale: +S.toFixed(4) }, background: {}, elements: [], warnings: [] }
  const shadow = spec.defaults?.shadow ?? 8
  const url = (file) => `${assetsUrl}/${file}`
  const write = async (file, buf) => { await writeFile(path.join(assetsDir, file), buf); return url(file) }
  const px = (v) => Math.round(v * S)
  const geo = (cx, cy, w, h) => ({ left: px(cx - w / 2), top: px(cy - h / 2), width: px(w), height: px(h) })
  const rectOf = (el) => elementRect(el)

  // nền
  const bgSpec = spec.background || {}
  const exclude = spec.elements.map((el) => { const r = rectOf(el); return [r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 2] })
  const patterned = bgSpec.pattern === 'reference'
  const hearts = bgSpec.hearts === false || patterned ? [] : detectHearts(ref, exclude)
  let bgColor = bgSpec.color && bgSpec.color !== 'auto' ? bgSpec.color : null
  if (!bgColor) {
    const mask = new Uint8Array(ref.width * ref.height).fill(1)
    for (const [x0, y0, x1, y1] of exclude.map((r) => clampRect(ref, r))) for (let y = y0; y < y1; y++) mask.fill(0, y * ref.width + x0, y * ref.width + x1)
    const c = [[], [], []]
    for (let i = 0; i < ref.width * ref.height; i += 3) {
      if (!mask[i]) continue
      const g = grayAt(ref.raw, i)
      if (g < 110) { c[0].push(ref.raw[i * 3]); c[1].push(ref.raw[i * 3 + 1]); c[2].push(ref.raw[i * 3 + 2]) }
    }
    // nền sáng hoặc có hoa văn (giấy màu): ít điểm tối → lấy trung vị của mọi điểm ngoài các thành phần
    if (c[0].length * 3 < mask.reduce((n, v, i) => n + (i % 3 === 0 ? v : 0), 0)) for (let i = 0; i < ref.width * ref.height; i += 3) if (mask[i]) { c[0].push(ref.raw[i * 3]); c[1].push(ref.raw[i * 3 + 1]); c[2].push(ref.raw[i * 3 + 2]) }
    bgColor = c[0].length > 50 ? toHex(c.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] })) : '#222222'
  }
  let seedRand = 7
  const rnd = () => { seedRand = (seedRand * 16807) % 2147483647; return seedRand / 2147483647 }
  const heartSvg = hearts.map((h) => `<path d="${heartPath(h.x * S, h.y * S, h.size * S * 1.05, (rnd() - 0.5) * 0.7)}" fill="#eeeeee"/>`).join('')
  let bgUrl
  if (patterned) {
    // hoa văn nền lấy từ chính ảnh mẫu: xóa vùng các phần tử (nới 10 px) rồi vá lỗ bằng đẩy-kéo
    const hole = new Uint8Array(ref.width * ref.height)
    for (const [x0, y0, x1, y1] of exclude.map((r) => clampRect(ref, [r[0] - 8, r[1] - 8, r[2] + 8, r[3] + 8]))) for (let y = y0; y < y1; y++) hole.fill(1, y * ref.width + x0, y * ref.width + x1)
    const filled = inpaintPushPull(ref.raw, hole, ref.width, ref.height)
    bgUrl = await write('background.jpg', await sharp(filled, { raw: { width: ref.width, height: ref.height, channels: 3 } }).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).jpeg({ quality: 88 }).toBuffer())
  } else {
    const bgPng = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bgColor}"/>${heartSvg}</svg>`)).png().toBuffer()
    bgUrl = await write('background.png', bgPng)
  }
  layers.push(imageLayer({ name: 'Nền · cố định', url: bgUrl, left: 0, top: 0, width: W, height: H, printRole: 'base', lock: true }))
  report.background = { color: bgColor, hearts: hearts.length, ...(patterned ? { pattern: 'reference' } : {}) }

  // ảnh giữ chỗ trung tính (khi không dùng ảnh trong ảnh mẫu)
  let placeholderUrl = null
  const placeholder = async () => {
    if (placeholderUrl) return placeholderUrl
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600"><rect width="1600" height="1600" fill="#cfcbc2"/><circle cx="1150" cy="480" r="150" fill="#e6e2d9"/><path d="M0 1250L420 760 760 1120 1010 880 1600 1400V1600H0Z" fill="#b8b3a8"/></svg>'
    placeholderUrl = await write('photo-placeholder.jpg', await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer())
    return placeholderUrl
  }
  const photoUrl = async (file, cx, cy, w, h, rot) => {
    if (photos !== 'reference') return placeholder()
    return write(file, await (await uprightCrop(ref, cx, cy, w, h, rot, S)).jpeg({ quality: 93 }).toBuffer())
  }
  const paperPng = async (color) => write(`paper-${color.slice(1)}.png`, await sharp({ create: { width: 8, height: 8, channels: 4, background: color } }).png().toBuffer())
  const rotRel = (dx, dy, rot) => { const r = (rot * Math.PI) / 180; return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)] }

  let k = 0
  for (const el of spec.elements) {
    const info = { name: el.name, type: el.type }
    if (el.type === 'frame') {
      const rot = el.rotate || 0, [cx, cy] = el.center, [w, h] = el.size
      const g = groupLayer({ name: el.name, ...geo(cx, cy, w, h), rotate: rot })
      layers.push(g)
      let paper = el.paper && el.paper !== 'auto' ? el.paper : null
      if (!paper) paper = (await paperColorOf(ref, el)) || '#fffdf1'
      layers.push(imageLayer({ name: 'Giấy ' + el.name, url: await paperPng(paper), ...geo(cx, cy, w, h), parent: g.uuid, printGroup: g.printGroup, shadow }))
      for (const p of el.photos) {
        const [dx, dy] = p.offset || [0, 0], [rx, ry] = rotRel(dx, dy, rot), [pw, ph] = p.size
        layers.push(imageLayer({
          name: p.name, url: await photoUrl(`photo-${++k}.jpg`, cx + rx, cy + ry, pw, ph, rot), ...geo(cx + dx, cy + dy, pw, ph), parent: g.uuid, printGroup: g.printGroup,
          fit: 'cover', slot: true, role: 'photo', shadow,
        }))
      }
      info.paper = paper
    } else if (el.type === 'photo') {
      const rot = el.rotate || 0, [cx, cy] = el.center, [w, h] = el.size
      const wrap = rot ? groupLayer({ name: el.name, ...geo(cx, cy, w, h), rotate: rot }) : null
      if (wrap) layers.push(wrap)
      layers.push(imageLayer({
        name: el.name, url: await photoUrl(`photo-${++k}.jpg`, cx, cy, w, h, rot), ...geo(cx, cy, w, h), parent: wrap ? wrap.uuid : '-1', printGroup: wrap ? wrap.printGroup : undefined,
        fit: 'cover', slot: true, role: 'photo', mask: el.mask ? maskDataUri(el.mask) : '', shadow: el.mask ? 0 : shadow, // bóng đổ theo hình chữ nhật: không dùng khi có mặt nạ
      }))
    } else if (el.type === 'label') {
      const rot = el.rotate || 0, [cx, cy] = el.center, [w, h] = el.size, shape = el.shape || 'rect'
      const g = groupLayer({ name: el.name, ...geo(cx, cy, w, h), rotate: rot })
      layers.push(g)
      // màu giấy
      const inkRect = el.textInk || [cx - w * 0.46, cy - h * 0.42, cx + w * 0.46, cy + h * 0.42]
      const tone = el.inkTone || 'dark'
      let color = el.color && el.color !== 'auto' ? el.color : null
      const lightPx = (R, G, B) => (R + G + B) / 3 > 140
      if (!color) color = medianColor(ref, [cx - w / 2 + 4, cy - h / 2 + 4, cx + w / 2 - 4, cy + h / 2 - 4], tone === 'dark' ? lightPx : (R, G, B) => (R + G + B) / 3 < 120) || '#fffdf1'
      let shapeUrl
      if (shape === 'cutout') {
        const pad = el.pad ?? 8, [x0, y0, x1, y1] = clampRect(ref, [cx - w / 2 - pad, cy - h / 2 - pad, cx + w / 2 + pad, cy + h / 2 + pad])
        const crop = await sharp(ref.png).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize({ width: Math.min(1600, (x1 - x0) * 3) }).png().toBuffer()
        const cut = await sharp(await cutout(crop)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const { width: cw, height: ch } = cut.info, A = cut.data
        let bx0 = cw, bx1 = 0, by0 = ch, by1 = 0
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (A[(y * cw + x) * 4 + 3] > 20) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y) }
        if (bx1 <= bx0) throw new Error(`Tách nền nhãn "${el.name}" không ra vùng nào`)
        const rgb = Buffer.alloc(cw * ch * 4)
        const fill = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
        for (let i = 0; i < cw * ch; i++) { rgb[i * 4] = fill[0]; rgb[i * 4 + 1] = fill[1]; rgb[i * 4 + 2] = fill[2]; rgb[i * 4 + 3] = A[i * 4 + 3] }
        const scaleUp = (x1 - x0) / cw
        const png = await sharp(rgb, { raw: { width: cw, height: ch, channels: 4 } }).extract({ left: bx0, top: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 }).png().toBuffer()
        shapeUrl = await write(`label-${++k}.png`, png)
        const lcx = x0 + ((bx0 + bx1 + 1) / 2) * scaleUp, lcy = y0 + ((by0 + by1 + 1) / 2) * scaleUp
        layers.push(imageLayer({ name: 'Giấy ' + el.name, url: shapeUrl, ...geo(lcx, lcy, (bx1 - bx0 + 1) * scaleUp, (by1 - by0 + 1) * scaleUp), parent: g.uuid, printGroup: g.printGroup }))
      } else {
        const notch = shape === 'ribbon' ? el.notch ?? Math.round(h * 0.28) : 0, pw = px(w), ph = px(h), n = px(notch)
        const poly = notch ? `${0},${0} ${pw},${0} ${pw - n},${ph / 2} ${pw},${ph} ${0},${ph} ${n},${ph / 2}` : `0,0 ${pw},0 ${pw},${ph} 0,${ph}`
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><polygon points="${poly}" fill="${color}"/></svg>`
        shapeUrl = await write(`label-${++k}.png`, await sharp(Buffer.from(svg)).png().toBuffer())
        // bóng đổ theo hình chữ nhật của lớp: chỉ đúng với nhãn chữ nhật; ruy băng có đuôi én và nhãn cắt theo mặt nạ thì để lộ khối vuông
        layers.push(imageLayer({ name: 'Giấy ' + el.name, url: shapeUrl, ...geo(cx, cy, w, h), parent: g.uuid, printGroup: g.printGroup, shadow: shape === 'rect' ? shadow : 0 }))
      }
      // chữ: đo mực thật trong ảnh mẫu rồi tự khớp cỡ chữ
      const ink = measureInk(ref, inkRect, tone)
      const font = findFont(fonts, el.font)
      const family = font.alias, fontUrl = font.ttf || font.woff
      if (!fontUrl) throw new Error(`Font "${font.alias}" không có tệp ttf/woff để đo`)
      // bề rộng mực mục tiêu (px canvas): cỡ chữ do spec chỉ định → đo đúng cỡ đó; ngược lại lấy từ ảnh mẫu (hoặc 80% khung nếu không đo được)
      let targetInk
      if (el.fontSize) targetInk = (await measure({ family, url: fontUrl, text: el.text, size: el.fontSize, letterSpacing: el.letterSpacing || 0, lineHeight: 1.2 })).inkWidth
      else targetInk = (ink ? ink.width : w * 0.8) * S
      const inkCenter = ink ? [(ink.x0 + ink.x1) / 2, (ink.y0 + ink.y1) / 2] : [cx, cy]
      const [lx, ly] = rotRel(inkCenter[0] - cx, inkCenter[1] - cy, -rot) // về hệ chưa xoay của nhãn
      const center = [px(cx + lx), px(cy + ly)]
      const fit = await fitText(measure, {
        family, url: fontUrl, text: el.text, targetInkWidth: targetInk, targetInkHeight: ink ? ink.height * S : undefined,
        center, letterSpacing: el.letterSpacing || 0, lineHeight: el.lineHeight,
      })
      if (el.fontSize) fit.fontSize = el.fontSize
      const textColor = el.textColor && el.textColor !== 'auto' ? el.textColor : ink ? ink.color : '#2f2c28'
      const fc = { alias: font.alias, id: font.id, value: font.alias, url: fontUrl }
      const t = textLayer({ name: el.name, text: el.text, fontClass: fc, fontSize: fit.fontSize, lineHeight: fit.lineHeight, letterSpacing: el.letterSpacing || 0, color: textColor, left: Math.round(fit.left), top: Math.round(fit.top), width: fit.width, height: fit.height })
      t.parent = g.uuid; t.printGroup = g.printGroup
      layers.push(t)
      Object.assign(info, { color, textColor, fontSize: fit.fontSize, lineHeight: fit.lineHeight, inkMeasured: !!ink, font: font.alias })
      if (!el.lineHeight && el.text.includes(String.fromCharCode(10)) && fit.lineHeight > 1.5) report.warnings.push(`Khoảng cách dòng của "${el.name}" đo được ${fit.lineHeight} (quá thưa): textInk có thể bao cả viền giấy hoặc nền; thu hẹp textInk sát chữ hoặc đặt lineHeight`)
      if (!ink) report.warnings.push(`Không đo được mực chữ của "${el.name}" trong ảnh mẫu (chữ quá nhạt hoặc textInk sai); dùng ${Math.round(w * 0.8)} px theo khung`)
    } else if (el.type === 'sticker') {
      const [x0, y0, x1, y1] = clampRect(ref, el.box), up = Math.max(1, Math.min(4, 1600 / Math.max(x1 - x0, y1 - y0)))
      const crop = await sharp(ref.png).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize({ width: Math.round((x1 - x0) * up), kernel: 'cubic' }).png().toBuffer()
      if (el.keep === 'box') {
        // tách nền hay cắt hụt sticker mềm/nhiều lớp (chữ bút lông, số dán trên nền rối): giữ nguyên vùng chữ nhật, tùy chọn cắt theo mặt nạ
        layers.push(imageLayer({ name: el.name, url: await write(`sticker-${++k}.png`, crop), ...geo((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0), mask: el.mask ? maskDataUri(el.mask) : '' }))
        info.box = [x0, y0, x1, y1]
        report.elements.push(info)
        continue
      }
      const cut = await sharp(await cutout(crop)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const { width: cw, height: ch } = cut.info
      let bx0 = cw, bx1 = 0, by0 = ch, by1 = 0
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (cut.data[(y * cw + x) * 4 + 3] > 20) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y) }
      if (bx1 <= bx0) throw new Error(`Tách nền sticker "${el.name}" không ra vùng nào`)
      const trimmed = await sharp(cut.data, { raw: { width: cw, height: ch, channels: 4 } }).extract({ left: bx0, top: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 }).png().toBuffer()
      const sx = (x1 - x0) / cw, ccx = x0 + ((bx0 + bx1 + 1) / 2) * sx, ccy = y0 + ((by0 + by1 + 1) / 2) * sx
      layers.push(imageLayer({ name: el.name, url: await write(`sticker-${++k}.png`, trimmed), ...geo(ccx, ccy, (bx1 - bx0 + 1) * sx, (by1 - by0 + 1) * sx) }))
      info.box = [Math.round(ccx - ((bx1 - bx0 + 1) * sx) / 2), Math.round(ccy - ((by1 - by0 + 1) * sx) / 2), Math.round(ccx + ((bx1 - bx0 + 1) * sx) / 2), Math.round(ccy + ((by1 - by0 + 1) * sx) / 2)]
    }
    report.elements.push(info)
    if (layers.length > MAX_LAYERS) throw new Error('Quá nhiều lớp')
  }

  const global = {
    name: spec.title || spec.name, type: 'page', uuid: '-1', left: 0, top: 0, width: W, height: H, backgroundColor: bgColor, backgroundGradient: '', backgroundImage: '', backgroundTransform: {},
    opacity: 1, tag: 0, record: {}, dpi: spec.canvas?.dpi || 300, collage: { template: spec.name, version: 1, customer: 'Dựng từ ảnh tham chiếu', printWorkflow: 'separate-sheets' },
  }
  return { draft: { global, layers }, report }
}

const editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function findFont(fonts, name) {
  const key = String(name).trim().toLowerCase()
  const exact = fonts.find((f) => String(f.alias || '').toLowerCase() === key)
  if (exact) return exact
  const near = fonts.map((f) => [f.alias, String(f.alias || '').toLowerCase()]).filter(([, a]) => a.includes(key) || editDistance(a, key) <= 2).slice(0, 5).map(([alias]) => alias)
  throw new Error(`Không thấy font "${name}" trong kho${near.length ? '; gần giống: ' + near.join(', ') : ''}. Xem \`fonts list\`.`)
}

// ───────────────────────────── so sánh với ảnh mẫu ──────────────────────────────────────────────────────────────────
// [TINIX] The same inclusion mask is used for MAE, SSIM and the heatmap.
function ssimGray(a, b, W, H, rect, include) {
  const [x0, y0, x1, y1] = rect, C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, win = 8
  let sum = 0, n = 0
  for (let y = y0; y + win <= y1; y += 4) for (let x = x0; x + win <= x1; x += 4) {
    if (include) {
      let count = 0, sumA = 0, sumB = 0, squaresA = 0, squaresB = 0, products = 0
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
        const p = (y + j) * W + x + i
        if (!include(p)) continue
        const va = a[p], vb = b[p]
        count++; sumA += va; sumB += vb; squaresA += va * va; squaresB += vb * vb; products += va * vb
      }
      if (count < 16) continue
      const ma = sumA / count, mb = sumB / count
      const va = (squaresA - sumA * ma) / (count - 1), vb = (squaresB - sumB * mb) / (count - 1), cov = (products - sumA * mb) / (count - 1)
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      n++
      continue
    }
    let ma = 0, mb = 0
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const p = (y + j) * W + x + i; ma += a[p]; mb += b[p] }
    ma /= win * win; mb /= win * win
    let va = 0, vb = 0, cov = 0
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const p = (y + j) * W + x + i, da = a[p] - ma, db = b[p] - mb; va += da * da; vb += db * db; cov += da * db }
    va /= win * win - 1; vb /= win * win - 1; cov /= win * win - 1
    sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++
  }
  return n ? sum / n : NaN
}

/** MAE (0–255) và SSIM (1 = giống hệt) toàn trang và theo từng phần tử của spec. Ảnh render được co về cỡ ảnh mẫu. */
export async function compareToReference(ref, renderInput, spec, masks) {
  const r = await sharp(renderInput, { limitInputPixels: 100000000 }).removeAlpha().resize(ref.width, ref.height, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer()
  const W = ref.width, H = ref.height, ga = new Float32Array(W * H), gb = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) { ga[i] = grayAt(ref.raw, i); gb[i] = grayAt(r, i) }
  const stat = (rect, include) => {
    const [x0, y0, x1, y1] = rect; let s = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x
      if (include && !include(i)) continue
      const p = i * 3
      s += Math.abs(ref.raw[p] - r[p]) + Math.abs(ref.raw[p + 1] - r[p + 1]) + Math.abs(ref.raw[p + 2] - r[p + 2])
      n++
    }
    const ssim = n ? ssimGray(ga, gb, W, H, rect, include) : NaN
    return { mae: n ? +(s / (3 * n)).toFixed(1) : null, ssim: Number.isFinite(ssim) ? +ssim.toFixed(3) : null, ...(masks ? { pixels: n } : {}) }
  }
  const all = [0, 0, W, H]
  const include = masks && (i => !masks.excluded[i])
  const out = { overall: stat(all, include), elements: {} }
  for (const el of spec?.elements || []) out.elements[el.name] = stat(clampRect(ref, elementRect(el)), include)
  if (masks) {
    const bounds = masks.layers.map(() => [W, H, 0, 0])
    for (let i = 0; i < masks.owners.length; i++) {
      if (!masks.owners[i] || masks.excluded[i]) continue
      const box = bounds[masks.owners[i] - 1], x = i % W, y = Math.floor(i / W)
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y)
      box[2] = Math.max(box[2], x + 1); box[3] = Math.max(box[3], y + 1)
    }
    out.excluded = { placeholderPixels: W * H - out.overall.pixels, totalPixels: W * H }
    // [TINIX] Report the visible page backdrop separately from its individual overlays.
    out.background = stat(all, i => include(i) && !masks.owners[i])
    out.layers = masks.layers.map(({ placeholder, ...layer }, index) => {
      const box = bounds[index]
      const status = placeholder ? 'placeholder' : box[2] > box[0] ? 'scored' : 'no-visible-pixels'
      if (status !== 'scored') return { ...layer, status, pixels: 0, mae: null, ssim: null }
      const rect = clampRect(ref, [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4])
      return { ...layer, status, bounds: box, ...stat(rect, i => include(i) && masks.owners[i] === index + 1) }
    })
  }
  return { ...out, render: r }
}

/** Phủ lưới toạ độ lên ảnh để đọc vị trí (px của ảnh gốc). */
export async function drawGrid(ref, step = 100) {
  const { width: W, height: H } = ref
  let lines = ''
  for (let x = 0; x < W; x += step) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${x % (step * 5) === 0 ? '#ffe600' : '#00dd44'}" stroke-width="1"/><text x="${x + 3}" y="14" font-size="13" fill="#ffe600" font-family="sans-serif">${x}</text>`
  for (let y = 0; y < H; y += step) lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${y % (step * 5) === 0 ? '#ffe600' : '#00dd44'}" stroke-width="1"/><text x="3" y="${y - 3}" font-size="13" fill="#ffe600" font-family="sans-serif">${y}</text>`
  return sharp(ref.png).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines}</svg>`) }]).png().toBuffer()
}

/** Ảnh cạnh nhau: ảnh mẫu | bản render | bản đồ lệch (càng đỏ/sáng càng lệch nhiều). `render` là bộ đệm RGB cùng cỡ ảnh mẫu. */
export async function drawSideBySide(ref, render, excluded) {
  const { width: W, height: H } = ref
  const heat = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    if (excluded?.[i]) {
      heat[i * 3] = 104; heat[i * 3 + 1] = 116; heat[i * 3 + 2] = 126
      continue
    }
    const d = (Math.abs(ref.raw[i * 3] - render[i * 3]) + Math.abs(ref.raw[i * 3 + 1] - render[i * 3 + 1]) + Math.abs(ref.raw[i * 3 + 2] - render[i * 3 + 2])) / 3
    const v = Math.min(255, d * 3)
    heat[i * 3] = v; heat[i * 3 + 1] = v * 0.35; heat[i * 3 + 2] = 40
  }
  const sc = Math.min(1, 2400 / (W * 3)), w = Math.round(W * sc), h = Math.round(H * sc)
  const tile = (raw) => sharp(raw, { raw: { width: W, height: H, channels: 3 } }).resize(w, h).png().toBuffer()
  const tiles = await Promise.all([tile(ref.raw), tile(render), tile(heat)])
  return sharp({ create: { width: w * 3, height: h, channels: 3, background: '#000000' } })
    .composite(tiles.map((input, i) => ({ input, left: i * w, top: 0 }))).png().toBuffer()
}
