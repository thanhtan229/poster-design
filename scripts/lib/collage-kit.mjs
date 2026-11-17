// [TINIX] Bộ dựng dùng chung cho các trang cắt dán viết bằng script (báo chí, scrapbook...).
// Mỗi hàm thể hiện một quy tắc trong DESIGN-RULES.md; dùng hàm thay vì tự viết lại để quy tắc luôn được áp dụng.
//   const kit = await createCollageKit({ root, assetsDir, assetsUrl, rnd, fontRows, placeholders })
//   kit.slot(...) / kit.hero(...) / kit.dieText(...) ...  → các lớp được đẩy vào kit.layers theo thứ tự (dòng sau nằm trên)
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { imageLayer, textLayer, groupLayer } from './reference-build.mjs'

export const SHAPES = ['ellipse', 'cloud', 'flower', 'heart'] // quy tắc 2.1: luôn đa dạng dáng khung giữa các ảnh trong một trang
const f = (n) => +n.toFixed(1)
const DROP = (w, h, std, dy, slope) => `<filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur in="SourceAlpha" stdDeviation="${std}"/><feOffset dy="${dy}" result="o"/><feComponentTransfer><feFuncA type="linear" slope="${slope}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
const heartPoints = (n) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] })

export async function createCollageKit({ root, assetsDir, assetsUrl, rnd, fontRows, placeholders = false, cutoutCacheDir, appUrl = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001' }) {
  const sharp = createRequire(path.join(root, 'service', 'package.json'))('sharp')
  await mkdir(assetsDir, { recursive: true })
  const layers = []
  const writeAsset = async (name, buf) => { await writeFile(path.join(assetsDir, name), buf); return `${assetsUrl}/${name}` }
  const svgPng = (w, h, body, defs = '') => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`)).png().toBuffer()
  const maskUri = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)
  // sharp chạy blur/threshold theo thứ tự cố định → mỗi thao tác một bước; ép về 1 kênh
  const step = async (buf, w, h, fn) => { const { data, info } = await fn(sharp(buf, { raw: { width: w, height: h, channels: 1 } })).extractChannel(0).raw().toBuffer({ resolveWithObject: true }); if (info.channels !== 1) throw new Error('kênh alpha'); return data }
  const fontClass = (alias) => { const r = fontRows.get(alias); if (!r) throw new Error(`Thiếu font ${alias}`); return { alias: r.alias, id: r.id, value: r.alias, url: r.ttf } }

  const place = (name, url, x, y, w, h, extra = {}) => { const l = imageLayer({ name, url, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), ...extra }); layers.push(l); return l }

  // Chữ thường. extra: align, weight, italic, ls, lh, h (cao khung), bg (nền riêng = một mảnh cắt), base (in thẳng lên tờ nền), rot
  const text = (name, value, x, y, w, size, alias, color, extra = {}) => {
    const t = textLayer({ name, text: value, left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(extra.h || size * 1.6), fontSize: size, lineHeight: extra.lh || 1.1, letterSpacing: extra.ls || 0, fontClass: fontClass(alias), color })
    t.textAlign = extra.align || 'left'; t.fontWeight = extra.weight || 'normal'; t.fontStyle = extra.italic ? 'italic' : 'normal'
    if (extra.bg) t.backgroundColor = extra.bg
    if (extra.base) t.printRole = 'base' // quy tắc 4.1: chữ lớn in thẳng lên nền không phải mảnh cắt rời
    if (extra.rot) t.rotate = `${extra.rot}deg`
    layers.push(t); return t
  }
  // Chữ dán die-cut: viền trắng ôm nét chữ (hiệu ứng chữ của app). Lớp viền vẽ đè chữ gốc nên phải có lớp tô màu trên cùng.
  const dieText = (name, value, x, y, w, size, alias, color, extra = {}) => {
    const t = text(name, value, x, y, w, size, alias, color, extra)
    const o = extra.outline || 14
    t.textEffects = [
      { filling: { enable: false, type: 0, color: '#ffffff' }, stroke: { enable: true, width: o * 2, color: '#fffdf8' }, shadow: { enable: true, offsetX: 0, offsetY: 6, blur: 8, color: 'rgba(0,0,0,0.4)' }, offset: { enable: false, x: 0, y: 0 } },
      { filling: { enable: true, type: 0, color }, stroke: { enable: false, width: 0, color: '#000' }, shadow: { enable: false, offsetX: 0, offsetY: 0, blur: 0, color: '#000' }, offset: { enable: false, x: 0, y: 0 } },
    ]
    return t
  }

  // Path SVG kín trong hộp w×h. Máy cắt nên không cần đường thẳng (quy tắc 2.2).
  const shapePath = (kind, w, h) => {
    const m = 4, cx = w / 2, cy = h / 2, rx = cx - m, ry = cy - m, N = 360
    let pts = []
    if (kind === 'heart') {
      const raw = heartPoints(N)
      const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      pts = raw.map((q) => [m + ((q[0] - x0) / (x1 - x0)) * (w - 2 * m), m + ((q[1] - y0) / (y1 - y0)) * (h - 2 * m)])
    } else {
      const ph = rnd() * 6
      const radius = { ellipse: () => 1, cloud: (t) => 0.9 + 0.1 * Math.abs(Math.sin(5.5 * t + ph)), flower: (t) => 0.7 + 0.3 * Math.abs(Math.cos(3.5 * t + ph)) }[kind]
      if (!radius) throw new Error(`Dáng khung "${kind}" chưa có (có: ${SHAPES.join(', ')})`)
      const rs = Array.from({ length: N }, (_, i) => radius((i / N) * Math.PI * 2)), rmax = Math.max(...rs)
      pts = rs.map((r, i) => { const t = (i / N) * Math.PI * 2; return [cx + (rx * r * Math.cos(t)) / rmax, cy + (ry * r * Math.sin(t)) / rmax] })
    }
    return 'M' + pts.map((q) => `${f(q[0])} ${f(q[1])}`).join(' L') + ' Z'
  }

  const tapePiece = async (name, cx, cy, tw, th, deg) => {
    const pad = Math.ceil(Math.hypot(tw, th) / 2 + 10), S = pad * 2
    const zig = (x0, dir) => Array.from({ length: 5 }, (_, k) => `${f(x0 + (k % 2 ? dir * 7 : 0))},${f((th / 4) * k)}`).join(' ')
    const poly = `${zig(0, 1)} ${zig(tw, -1).split(' ').reverse().join(' ')}`
    const defs = `<pattern id="t" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="22" height="22" fill="#efe4c4"/><rect width="11" height="22" fill="#fff" fill-opacity="0.55"/></pattern><filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="3" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    const url = await writeAsset(name + '.png', await svgPng(S, S, `<g transform="translate(${pad} ${pad}) rotate(${deg}) translate(${-tw / 2} ${-th / 2})"><g filter="url(#sh)"><polygon points="${poly}" fill="url(#t)" fill-opacity="0.9" stroke="#d6c79b" stroke-opacity="0.6"/></g></g>`, defs))
    place(name, url, cx - S / 2, cy - S / 2, S, S, { printRole: 'raised' })
  }

  // Ảnh trong khung giấy trắng hình tự do. Khung + ảnh gộp MỘT nhóm → khi cắt là một mảnh duy nhất (quy tắc 4.2).
  // effects: hiệu ứng của app (mặc định đen trắng; chọn "Gốc" trong app sẽ về màu). tape = [dx, dy, độ]
  const slot = async (name, photo, x, y, w, h, cropY, tape = null, kind = 'ellipse', effects = { grayscale: true, contrast: 118 }) => {
    const b = 16, pad = 36, shape = shapePath(kind, w, h), W2 = w + 2 * b + 2 * pad, H2 = h + 2 * b + 2 * pad
    const frame = await svgPng(W2, H2, `<g filter="url(#sh)"><path transform="translate(${pad + b} ${pad + b})" d="${shape}" fill="#fffdf8" stroke="#fffdf8" stroke-width="${2 * b}" stroke-linejoin="round"/></g>`, DROP(W2, H2, 5, 8, 0.4))
    const g = groupLayer({ name: 'Cụm ' + name, left: x - b - pad, top: y - b - pad, width: W2, height: H2, rotate: 0 }); layers.push(g)
    const fr = place(name + ' · khung giấy trắng cắt tay', await writeAsset(`cut-${name.replace(/\s+/g, '-')}.png`, frame), x - b - pad, y - b - pad, W2, H2, { printRole: 'raised' })
    fr.parent = g.uuid; fr.printGroup = g.printGroup
    const p = place(name, placeholders ? '/static/collage/smile-darling-ref/photo-placeholder.jpg' : photo.web_url, x, y, w, h, { fit: 'cover', slot: true, role: 'photo', mask: maskUri(w, h, `<path d="${shape}" fill="#fff"/>`) })
    p.parent = g.uuid; p.printGroup = g.printGroup
    p.cropY = cropY
    p.effects = { ...effects }
    if (!placeholders) p.origin = { proxy: photo.web_url, original: photo.url }
    if (tape) await tapePiece(name + ' · băng dính', x + tape[0], y + tape[1], 190, 50, tape[2])
    return p
  }

  // Giấy màu hình tự do nằm dưới ảnh tách nền (mảnh giấy riêng)
  const paperShape = async (name, kind, x, y, w, h, fill) => {
    const b = 14, pad = 36, d = shapePath(kind, w, h), W2 = w + 2 * b + 2 * pad, H2 = h + 2 * b + 2 * pad
    const png = await svgPng(W2, H2, `<g filter="url(#sh)"><path transform="translate(${pad + b} ${pad + b})" d="${d}" fill="${fill}" stroke="#fffdf8" stroke-width="${2 * b}" stroke-linejoin="round" paint-order="stroke"/></g>`, DROP(W2, H2, 5, 8, 0.4))
    place(name, await writeAsset(`paper-${name.replace(/\s+/g, '-')}.png`, png), x - b - pad, y - b - pad, W2, H2, { printRole: 'raised' })
  }

  // Ảnh chủ đạo tách nền (BiRefNet qua service, cache theo mã ảnh) + viền trắng ôm dáng + bóng (quy tắc 1.2: cỡ lớn, nổi bật)
  const cutoutOf = async (photo) => {
    const cached = path.join(cutoutCacheDir || assetsDir, `cutout-${photo.id}.png`)
    try { return await readFile(cached) } catch { /* chưa tách nền */ }
    const body = new FormData()
    body.append('file', new Blob([await readFile(path.join(root, 'service', photo.url.replace(/^\//, '')))]), 'subject.jpg')
    const res = await fetch(appUrl + '/api/tinix/cutout/birefnet', { method: 'POST', body })
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/png')) throw new Error('BiRefNet không trả về PNG (service 7001 đang chạy chưa?)')
    const png = Buffer.from(await res.arrayBuffer()); await mkdir(path.dirname(cached), { recursive: true }); await writeFile(cached, png); return png
  }
  const hero = async (name, photo, x, y, targetH, border = 16) => {
    const cut = await cutoutOf(photo)
    const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0
    for (let yy = 0; yy < info.height; yy++) for (let xx = 0; xx < info.width; xx++) if (data[(yy * info.width + xx) * 4 + 3] > 128) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = targetH / bh, cw = Math.round(bw * sc), ch = targetH, pad = 40
    const subject = await sharp(cut).extract({ left: x0, top: y0, width: bw, height: bh }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer()
    const W2 = cw + 2 * pad, H2 = ch + 2 * pad
    const canvas = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: subject, left: pad, top: pad }]).png().toBuffer()
    const alpha = await sharp(canvas).extractChannel(3).raw().toBuffer()
    const grow = async (r) => { let b = await step(alpha, W2, H2, (q) => q.blur(Math.max(0.5, r / 1.47))); b = await step(b, W2, H2, (q) => q.threshold(18)); b = await step(b, W2, H2, (q) => q.blur(3)); return step(b, W2, H2, (q) => q.threshold(128)) }
    const white = await grow(border), ink = await grow(border + 3)
    const solid = (rgb, a) => sharp(Buffer.alloc(W2 * H2 * 3).map((_, i) => rgb[i % 3]), { raw: { width: W2, height: H2, channels: 3 } }).joinChannel(a, { raw: { width: W2, height: H2, channels: 1 } }).png().toBuffer()
    const shadow = await step(await step(white, W2, H2, (q) => q.blur(12)), W2, H2, (q) => q.linear(0.45, 0))
    const png = await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
      { input: await solid([30, 25, 20], shadow), left: 0, top: 14 },
      { input: await solid([20, 20, 20], ink), left: 0, top: 0 },
      { input: await solid([255, 255, 255], white), left: 0, top: 0 },
      { input: canvas, left: 0, top: 0 },
    ]).png().toBuffer()
    place(name, await writeAsset(`hero-${photo.id}.png`, png), x - pad, y - pad, W2, H2, { printRole: 'raised' }).cutInset = border / 2
    return { w: cw, h: ch }
  }

  // Sticker nhỏ lấp chỗ trống (quy tắc 1.3): sao / tim, viền trắng + bóng
  const star = (R, r, n = 5) => Array.from({ length: n * 2 }, (_, i) => { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, d = i % 2 ? r : R; return `${f(R + d * Math.cos(a))},${f(R + d * Math.sin(a))}` }).join(' ')
  const sticker = async (name, x, y, size, body) => place(name, await writeAsset(name.replace(/\s+/g, '-') + '.png', await svgPng(size, size, `<g filter="url(#sh)">${body}</g>`, `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.35"/></filter>`)), x, y, size, size, { printRole: 'raised' })
  const starSticker = (name, x, y, size, R, r, fill) => sticker(name, x, y, size, `<polygon points="${star(R, r)}" transform="translate(${(size - 2 * R) / 2} ${(size - 2 * R) / 2})" fill="${fill}" stroke="#fffdf8" stroke-width="${R > 55 ? 5 : 4}" stroke-linejoin="round"/>`)
  const heartSticker = (name, x, y, size, S, fill) => sticker(name, x, y, size, `<polygon transform="translate(${size / 2} ${size / 2}) scale(${S / 40})" points="${heartPoints(120).map((q) => q.map(f).join(',')).join(' ')}" fill="${fill}" stroke="#fffdf8" stroke-width="2.2" stroke-linejoin="round"/>`)

  return { layers, sharp, f, place, text, dieText, shapePath, tapePiece, slot, paperShape, hero, sticker, starSticker, heartSticker, svgPng, writeAsset, maskUri, step, fontClass }
}
