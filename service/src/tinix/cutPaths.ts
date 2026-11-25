/**
 * [TINIX] Đường cắt laser (SVG) từ tờ chi tiết cắt.
 *
 * Quy trình (module thuần, không phụ thuộc thư viện ngoài để kiểm thử offline):
 *   1. alphaFromRenders: tờ cắt được dựng hai lần (nền trắng, nền đen) → độ trong suốt từng điểm = 1 - (trắng - đen)/255.
 *   2. signedDistance: trường khoảng cách có dấu từ mặt nạ (alpha >= 128): dương bên trong mảnh, âm bên ngoài.
 *   3. traceLevel: marching squares tại mức = khoảng lùi (px) → đường viền subpixel, lùi vào trong đúng khoảng đó
 *      (đường cắt "giữa viền trắng": mức lùi khai báo theo từng lớp qua `cutInset`).
 *   4. simplifyClosed: Douglas–Peucker cho vòng kín; buildCutSvg: SVG đơn vị mm, tỉ lệ 1:1, hai lớp màu (cắt đỏ, căn xanh).
 * Đơn vị tọa độ khi xử lý: pixel của tờ cắt (cùng khổ thành phẩm); SVG xuất ra bằng mm theo DPI của thiết kế.
 */
export type Pt = [number, number]

/** alpha (0–255) từ hai ảnh RGB(A) dựng trên nền trắng và nền đen: alpha = 255 - trung bình(trắng - đen) trên 3 kênh màu. */
export function alphaFromRenders(white: Uint8Array, black: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) {
    const o = i * channels
    const d = (white[o] - black[o] + white[o + 1] - black[o + 1] + white[o + 2] - black[o + 2]) / 3
    out[i] = Math.max(0, Math.min(255, Math.round(255 - d)))
  }
  return out
}

const BIG = 1e12
/** Biến đổi khoảng cách Felzenszwalb 1D (bình phương). f: giá trị đầu vào, n: độ dài. */
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0
  v[0] = 0
  z[0] = -BIG
  z[1] = BIG
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = BIG
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/** Khoảng cách Euclid (px) từ mỗi điểm đến điểm "đích" gần nhất (target[i]=1). */
function distanceTo(target: Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(width, height)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  const grid = new Float64Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = target[i] ? 0 : BIG
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    edt1d(f, d, v, z, height)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x]
    edt1d(f, d, v, z, width)
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x]
  }
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(grid[i])
  return out
}

/** Trường khoảng cách có dấu (px) của mặt nạ: > 0 bên trong, < 0 bên ngoài; mép nằm ở mức 0 (giữa hai tâm điểm ảnh khác loại). */
export function signedDistance(mask: Uint8Array, width: number, height: number): Float32Array {
  let anyFg = false
  let anyBg = false
  for (let i = 0; i < mask.length && !(anyFg && anyBg); i++) {
    if (mask[i]) anyFg = true
    else anyBg = true
  }
  const out = new Float32Array(width * height)
  if (!anyFg) return out.fill(-1e6)
  if (!anyBg) return out.fill(1e6)
  const inverse = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) inverse[i] = mask[i] ? 0 : 1
  const din = distanceTo(inverse, width, height) // điểm trong mặt nạ: khoảng cách đến nền gần nhất
  const dout = distanceTo(mask, width, height) // điểm nền: khoảng cách đến mảnh gần nhất
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? din[i] - 0.5 : -(dout[i] - 0.5)
  return out
}

/** Làm mịn trường (Gauss tách hai chiều, bán kính ~3σ) để mép từ mặt nạ nhị phân không còn bậc thang. */
export function smoothField(field: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (!(sigma > 0)) return field
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r] }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  const tmp = new Float32Array(width * height), out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) a += k[i + r] * field[y * width + Math.max(0, Math.min(width - 1, x + i))]
      tmp[y * width + x] = a
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.max(0, Math.min(height - 1, y + i)) * width + x]
      out[y * width + x] = a
    }
  }
  return out
}

/** Marching squares: các vòng kín của đường mức `level` trên trường `field` (tâm điểm ảnh ở (x+0.5, y+0.5)). Vòng hở bị bỏ. */
export function traceLevel(field: Float32Array, width: number, height: number, level: number): Pt[][] {
  // mỗi giao điểm nằm trên một cạnh lưới: khóa số nguyên (loại, i, j)
  const key = (kind: number, i: number, j: number) => (j * width + i) * 2 + kind // kind 0: cạnh ngang (i,j)-(i+1,j), 1: cạnh dọc (i,j)-(i,j+1)
  const links = new Map<number, number[]>() // khóa → các khóa kề (tối đa 2)
  const add = (a: number, b: number) => {
    let la = links.get(a)
    if (!la) { la = []; links.set(a, la) }
    la.push(b)
    let lb = links.get(b)
    if (!lb) { lb = []; links.set(b, lb) }
    lb.push(a)
  }
  for (let j = 0; j < height - 1; j++) {
    for (let i = 0; i < width - 1; i++) {
      const a = field[j * width + i], b = field[j * width + i + 1], c = field[(j + 1) * width + i + 1], d = field[(j + 1) * width + i]
      const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0)
      if (idx === 0 || idx === 15) continue
      const T = key(0, i, j), B = key(0, i, j + 1), L = key(1, i, j), R = key(1, i + 1, j)
      switch (idx) {
        case 1: case 14: add(L, B); break
        case 2: case 13: add(B, R); break
        case 3: case 12: add(L, R); break
        case 4: case 11: add(T, R); break
        case 6: case 9: add(T, B); break
        case 7: case 8: add(T, L); break
        case 5: case 10: {
          const center = (a + b + c + d) / 4 >= level
          if ((idx === 5) === center) { add(T, L); add(B, R) } else { add(T, R); add(L, B) }
          break
        }
      }
    }
  }
  const pos = (k: number): Pt => {
    const kind = k & 1
    const cell = (k - kind) / 2
    const i = cell % width, j = (cell - i) / width
    if (kind === 0) {
      const v0 = field[j * width + i], v1 = field[j * width + i + 1]
      const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0)
      return [i + 0.5 + t, j + 0.5]
    }
    const v0 = field[j * width + i], v1 = field[(j + 1) * width + i]
    const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0)
    return [i + 0.5, j + 0.5 + t]
  }
  const loops: Pt[][] = []
  const seen = new Set<number>()
  links.forEach((_nb, start) => {
    if (seen.has(start)) return
    const chain: number[] = [start]
    seen.add(start)
    let prev = -1, cur = start, closed = false
    for (;;) {
      const nb = links.get(cur) || []
      let next = -1
      for (const n of nb) if (n !== prev && !seen.has(n)) { next = n; break }
      if (next < 0) {
        closed = nb.length === 2 && chain.length > 2 && nb.indexOf(start) >= 0
        break
      }
      chain.push(next)
      seen.add(next)
      prev = cur
      cur = next
    }
    if (closed) loops.push(chain.map(pos))
  })
  return loops
}

export function polygonArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i][0] * q[1] - q[0] * p[i][1]
  }
  return a / 2
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function rdp(points: Pt[], tol: number): Pt[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number]
    let worst = -1, wi = -1
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(points[i], points[s], points[e])
      if (d > worst) { worst = d; wi = i }
    }
    if (worst > tol && wi >= 0) { keep[wi] = 1; stack.push([s, wi], [wi, e]) }
  }
  return points.filter((_p, i) => keep[i])
}

/** Đơn giản hóa vòng kín: tách tại hai điểm xa nhau nhất rồi chạy Douglas–Peucker trên hai nửa. */
export function simplifyClosed(points: Pt[], tol: number): Pt[] {
  if (points.length < 8) return points
  let a = 0
  for (let i = 1; i < points.length; i++) if (points[i][0] + points[i][1] < points[a][0] + points[a][1]) a = i
  let b = a, far = -1
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[a][0], points[i][1] - points[a][1])
    if (d > far) { far = d; b = i }
  }
  const rot = points.slice(a).concat(points.slice(0, a))
  const bi = (b - a + points.length) % points.length
  const first = rdp(rot.slice(0, bi + 1), tol)
  const second = rdp(rot.slice(bi).concat([rot[0]]), tol)
  return first.slice(0, -1).concat(second.slice(0, -1))
}

export type CutPlacement = { x: number; y: number; width: number; height: number; cutInset?: number; cutOuterOnly?: boolean }
export type CutSvgOptions = {
  alpha: Uint8Array
  width: number
  height: number
  dpi: number
  placements: CutPlacement[]
  defaultInsetMm?: number // lùi mặc định (mm) cho mảnh không khai báo cutInset
  toleranceMm?: number // sai số đơn giản hóa đường (mm)
  minAreaMm2?: number // bỏ các vòng nhỏ hơn (nhiễu)
  smoothPx?: number // độ mịn của trường khoảng cách (σ, px); mặc định 1,2
  marks?: Array<{ x: number; y: number; dx: number; dy: number; arm: number }> // dấu căn, tọa độ px
  title?: string
}
export type CutResult = { svg: string; pieces: number; loops: number; perimeterMm: number }

// [TINIX] Fill enclosed voids in the cutting mask. Keep exterior gaps and separate pieces.
function fillCutHoles(mask: Uint8Array, width: number, height: number, placement: CutPlacement) {
  const left = Math.max(0, Math.floor(placement.x))
  const top = Math.max(0, Math.floor(placement.y))
  const w = Math.min(width, Math.ceil(placement.x + placement.width)) - left
  const h = Math.min(height, Math.ceil(placement.y + placement.height)) - top
  if (w < 3 || h < 3) return
  const seen = new Uint8Array(w * h)
  const queue = new Int32Array(seen.length)
  let tail = 0
  function visit(index: number) {
    if (seen[index]) return
    seen[index] = 1
    const x = index % w
    const y = Math.floor(index / w)
    if (!mask[(top + y) * width + left + x]) queue[tail++] = index
  }
  for (let x = 0; x < w; x++) {
    visit(x)
    visit((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    visit(y * w)
    visit(y * w + w - 1)
  }
  for (let head = 0; head < tail; head++) {
    const index = queue[head]
    const x = index % w
    if (x > 0) visit(index - 1)
    if (x + 1 < w) visit(index + 1)
    if (index >= w) visit(index - w)
    if (index + w < seen.length) visit(index + w)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!seen[y * w + x]) mask[(top + y) * width + left + x] = 1
    }
  }
}

/** Dựng SVG đường cắt: mm, tỉ lệ 1:1, lớp "Cat" (đỏ) cho đường cắt và "Can" (xanh) cho dấu căn. */
export function buildCutSvg(o: CutSvgOptions): CutResult {
  const { width, height, dpi } = o
  const mmPerPx = 25.4 / dpi
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = o.alpha[i] >= 128 ? 1 : 0
  for (const placement of o.placements) {
    if (placement.cutOuterOnly === true) fillCutHoles(mask, width, height, placement)
  }
  const field = smoothField(signedDistance(mask, width, height), width, height, o.smoothPx === undefined ? 1.2 : o.smoothPx)
  const defaultInset = (o.defaultInsetMm === undefined ? 0.3 : o.defaultInsetMm) / mmPerPx
  const tol = (o.toleranceMm === undefined ? 0.05 : o.toleranceMm) / mmPerPx
  const minArea = (o.minAreaMm2 === undefined ? 1.5 : o.minAreaMm2) / (mmPerPx * mmPerPx)
  // nhóm mảnh theo khoảng lùi để mỗi mức chỉ dò một lần
  const groups = new Map<number, CutPlacement[]>()
  for (const p of o.placements) {
    const inset = p.cutInset && p.cutInset > 0 ? p.cutInset : defaultInset
    const k = Math.round(inset * 100) / 100
    const g = groups.get(k)
    if (g) g.push(p)
    else groups.set(k, [p])
  }
  const kept: Pt[][] = []
  groups.forEach((ps, inset) => {
    const loops = traceLevel(field, width, height, inset)
    for (const loop of loops) {
      const area = Math.abs(polygonArea(loop))
      if (area < minArea) continue
      const [px, py] = loop[0]
      const owner = ps.some((p) => px >= p.x - 6 && px <= p.x + p.width + 6 && py >= p.y - 6 && py <= p.y + p.height + 6)
      if (owner) kept.push(simplifyClosed(loop, tol))
    }
  })
  kept.sort((a, b) => Math.abs(polygonArea(a)) - Math.abs(polygonArea(b))) // mảnh nhỏ trước
  const fmt = (n: number) => (Math.round(n * mmPerPx * 1000) / 1000).toString()
  let perimeter = 0
  const paths = kept.map((loop) => {
    for (let i = 0; i < loop.length; i++) {
      const q = loop[(i + 1) % loop.length]
      perimeter += Math.hypot(q[0] - loop[i][0], q[1] - loop[i][1]) * mmPerPx
    }
    return '<path d="M' + loop.map((p) => fmt(p[0]) + ' ' + fmt(p[1])).join(' L') + ' Z"/>'
  })
  const marks = (o.marks || []).map((m) => `<path d="M${fmt(m.x + m.dx * m.arm)} ${fmt(m.y)} L${fmt(m.x)} ${fmt(m.y)} L${fmt(m.x)} ${fmt(m.y + m.dy * m.arm)}"/>`)
  const wmm = Math.round(width * mmPerPx * 1000) / 1000, hmm = Math.round(height * mmPerPx * 1000) / 1000
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${wmm} ${hmm}">\n` +
    `<title>${(o.title || 'Đường cắt laser').replace(/[<&>]/g, ' ')}</title>\n` +
    `<desc>Đơn vị mm, tỉ lệ 1:1. Lớp Cat (đỏ): đường cắt. Lớp Can (xanh): dấu căn chữ L ở 3 góc (đỉnh chữ L là điểm căn); đặt Output tắt cho lớp này.</desc>\n` +
    `<g id="Cat" fill="none" stroke="#FF0000" stroke-width="0.1" stroke-linejoin="round">\n${paths.join('\n')}\n</g>\n` +
    `<g id="Can" fill="none" stroke="#0000FF" stroke-width="0.1">\n${marks.join('\n')}\n</g>\n</svg>\n`
  return { svg, pieces: kept.length, loops: kept.length, perimeterMm: Math.round(perimeter * 10) / 10 }
}
