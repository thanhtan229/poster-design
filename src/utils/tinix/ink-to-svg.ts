// [TINIX] Estimate fractional ink coverage and trace its subpixel boundary.
export type InkTraceOptions = {
  ink: string
  paper: string
  threshold: number
  minArea: number
  guard?: Uint8ClampedArray
}
type Point = { x: number; y: number }
type Segment = [number, number]
const MAX_PIXELS = 1_500_000
export const INK_TRACE_LIMIT = MAX_PIXELS

function rgb(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('Invalid color')
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
}

function coverage(data: Uint8ClampedArray, width: number, height: number, options: InkTraceOptions) {
  const { guard } = options
  const paper = rgb(options.paper)
  const delta = rgb(options.ink).map((channel, i) => channel - paper[i])
  const contrast = delta.reduce((sum, channel) => sum + channel * channel, 0)
  if (contrast < 35 ** 2) throw new Error('Insufficient contrast')
  const stride = width + 2
  const values = new Float32Array(stride * (height + 2))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (guard && !nearInk(guard, x, y, width, height)) continue
    const i = (y * width + x) * 4
    const dr = data[i] - paper[0]; const dg = data[i + 1] - paper[1]; const db = data[i + 2] - paper[2]
    const along = (dr * delta[0] + dg * delta[1] + db * delta[2]) / contrast
    const alpha = Math.max(0, Math.min(1, along))
    const offAxis = Math.hypot(dr - along * delta[0], dg - along * delta[1], db - along * delta[2])
    const hueWeight = Math.max(0, Math.min(1, (95 - offAxis) / 38))
    values[(y + 1) * stride + x + 1] = alpha * hueWeight * (data[i + 3] / 255)
  }
  return values
}

function nearInk(guard: Uint8ClampedArray, x: number, y: number, width: number, height: number) {
  for (let row = Math.max(0, y - 2); row <= Math.min(height - 1, y + 2); row++) {
    for (let col = Math.max(0, x - 2); col <= Math.min(width - 1, x + 2); col++) {
      if (guard[(row * width + col) * 4 + 3] > 80) return true
    }
  }
  return false
}

/** Marching squares. Interpolate the crossing along each edge and resolve saddle cells with the center value. */
function contours(values: Float32Array, stride: number, threshold: number): Point[][] {
  const points = new Map<number, Point>()
  const neighbors = new Map<number, number[]>()
  function point(edge: number, x: number, y: number) {
    const vertical = edge === 1 || edge === 3
    const ax = x + Number(edge === 1); const ay = y + Number(edge === 2)
    const i = ay * stride + ax
    const id = i * 2 + Number(vertical)
    if (!points.has(id)) {
      const v = values[i]; const next = values[i + (vertical ? stride : 1)]
      const t = (threshold - v) / (next - v)
      points.set(id, { x: ax - 0.5 + (vertical ? 0 : t), y: ay - 0.5 + (vertical ? t : 0) })
    }
    return id
  }
  function connect(edges: Segment, x: number, y: number) {
    const a = point(edges[0], x, y); const b = point(edges[1], x, y)
    for (const [from, to] of [[a, b], [b, a]]) {
      const linked = neighbors.get(from)
      if (linked) linked.push(to)
      else neighbors.set(from, [to])
    }
  }
  for (let y = 0; y < values.length / stride - 1; y++) for (let x = 0; x < stride - 1; x++) {
    const i = y * stride + x
    const corners = [values[i], values[i + 1], values[i + stride + 1], values[i + stride]]
    const edges = [0, 1, 2, 3].filter(e => (corners[e] >= threshold) !== (corners[(e + 1) % 4] >= threshold))
    if (edges.length === 2) connect([edges[0], edges[1]], x, y)
    if (edges.length === 4) {
      const solid = corners.reduce((sum, v) => sum + v, 0) >= threshold * 4
      const alternate = solid === (corners[0] >= threshold)
      connect(alternate ? [0, 1] : [0, 3], x, y)
      connect(alternate ? [2, 3] : [1, 2], x, y)
    }
  }
  const closed: Point[][] = []
  for (const start of neighbors.keys()) {
    const ring: Point[] = []
    let current = start; let prior = -1
    do {
      const linked = neighbors.get(current)
      if (!linked) break
      ring.push(points.get(current)!)
      neighbors.delete(current)
      const next = linked[0] === prior ? linked[1] : linked[0]
      prior = current
      current = next
    } while (current !== start)
    if (current === start && ring.length >= 3) closed.push(ring)
  }
  return closed
}

function area(ring: Point[]) {
  return Math.abs(ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]
    return sum + p.x * q.y - p.y * q.x
  }, 0)) / 2
}

function simplifyRing(points: Point[], tolerance: number) {
  const closed = [...points, points[0]]
  const keep = new Uint8Array(closed.length)
  keep[0] = keep[closed.length - 1] = 1
  const pending: Segment[] = [[0, closed.length - 1]]
  while (pending.length) {
    const [start, end] = pending.pop()!
    const { x, y } = closed[start]
    const dx = closed[end].x - x; const dy = closed[end].y - y
    const lengthSquared = dx * dx + dy * dy
    let best = tolerance * tolerance; let split = start
    for (let i = start + 1; i < end; i++) {
      const rx = closed[i].x - x; const ry = closed[i].y - y
      const projected = lengthSquared ? Math.max(0, Math.min(1, (rx * dx + ry * dy) / lengthSquared)) : 0
      const distance = (rx - projected * dx) ** 2 + (ry - projected * dy) ** 2
      if (distance > best) {
        best = distance
        split = i
      }
    }
    if (split === start) continue
    keep[split] = 1
    pending.push([start, split], [split, end])
  }
  const reduced = points.filter((_, i) => keep[i])
  return reduced.length >= 4 ? reduced : points
}

function curvedRing(ring: Point[]) {
  // Suppress pixel-scale wiggles with a symmetric filter and keep a point about every pixel of arc.
  const smooth = ring.map((p, i) => {
    const before = ring[(i + ring.length - 1) % ring.length]; const after = ring[(i + 1) % ring.length]
    return { x: (before.x + 4 * p.x + after.x) / 6, y: (before.y + 4 * p.y + after.y) / 6 }
  })
  const points = simplifyRing(smooth, 0.18)
  const xy = (x: number, y: number) => `${Number(x.toFixed(3))} ${Number(y.toFixed(3))}`
  const curves = points.map((p, i) => {
    const prev = points[(i + points.length - 1) % points.length]
    const next = points[(i + 1) % points.length]; const following = points[(i + 2) % points.length]
    const length = Math.hypot(next.x - p.x, next.y - p.y)
    const a = length / (3 * (length + Math.hypot(p.x - prev.x, p.y - prev.y) || 1))
    const b = length / (3 * (length + Math.hypot(following.x - next.x, following.y - next.y) || 1))
    return `C${xy(p.x + (next.x - prev.x) * a, p.y + (next.y - prev.y) * a)} ${xy(next.x - (following.x - p.x) * b, next.y - (following.y - p.y) * b)} ${xy(next.x, next.y)}`
  })
  return `M${xy(points[0].x, points[0].y)}${curves.join('')}Z`
}

export function traceInk({ data, width, height }: ImageData, options: InkTraceOptions) {
  if (width * height > MAX_PIXELS || options.guard && options.guard.length !== data.length) throw new Error('Invalid image dimensions')
  rgb(options.ink)
  if (!(options.threshold > 0 && options.threshold < 1) || !(options.minArea >= 0)) throw new Error('Invalid trace settings')
  const values = coverage(data, width, height, options)
  const paths = contours(values, width + 2, options.threshold).filter(ring => area(ring) >= options.minArea)
  if (paths.length === 0) return undefined
  const path = paths.map(curvedRing).join('')
  return {
    path, contours: paths.length,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="${options.ink}" fill-rule="evenodd" d="${path}"/></svg>`,
  }
}
