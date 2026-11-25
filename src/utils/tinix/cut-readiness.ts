// [TINIX] Kiểm hình học trên chính lớp Cat của SVG xuất ở tỉ lệ 1:1.
import { signedDistance, type Pt } from '../../../service/src/tinix/cutPaths'

type Box = { x: number; y: number; width: number; height: number }
type Placement = Box & { unitId: string; sheet: number }
type Contour = { points: Pt[]; box: Box; area: number; parent?: Contour; depth: number }
export const DEFAULT_CUT_LIMIT_MM = 2

function bounds(points: Pt[]): Box {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y] of points) {
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function contains(box: Box, inner: Box, pad = 0) {
  return inner.x >= box.x - pad && inner.y >= box.y - pad &&
    inner.x + inner.width <= box.x + box.width + pad &&
    inner.y + inner.height <= box.y + box.height + pad
}

function overlap(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

function crossings(points: Pt[], y: number, xs: number[]) {
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x0, y0] = points[j]
    const [x1, y1] = points[i]
    if ((y0 > y) !== (y1 > y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
  }
}

function parseContours(svg: string): Contour[] {
  // Chỉ đọc định dạng M/L/Z do buildCutSvg tạo. Lớp Can chứa dấu căn.
  const cut = svg.match(/<g\s+id="Cat"[^>]*>([\s\S]*?)<\/g>/)?.[1]
  if (!cut || !/<svg\s[^>]*\bwidth="[\d.]+mm"[^>]*\bheight="[\d.]+mm"/.test(svg)) throw new Error('Invalid cut SVG')
  const contours: Contour[] = []
  for (const path of cut.matchAll(/<path\s+d="([^"]+)"/g)) {
    const segments = path[1].slice(1, -2).split(' L')
    const points = segments.map(segment => segment.split(' ').map(Number) as Pt)
    if (!path[1].startsWith('M') || !path[1].endsWith(' Z') || points.length < 3 ||
        points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) throw new Error('Invalid cut path')
    const area = Math.abs(points.reduce((sum, [x, y], i) => {
      const [u, v] = points[(i + 1) % points.length]
      return sum + x * v - y * u
    }, 0) / 2)
    if (area > 0) contours.push({ points, box: bounds(points), area, depth: 0 })
  }
  contours.sort((a, b) => b.area - a.area)
  contours.forEach((contour, i) => {
    const [x, y] = contour.points[0]
    for (let j = i - 1; j >= 0; j--) {
      const parent = contours[j]
      if (!contains(parent.box, contour.box)) continue
      const xs: number[] = []
      crossings(parent.points, y, xs)
      if (xs.filter(px => px > x).length % 2 === 0) continue
      contour.parent = parent
      contour.depth = parent.depth + 1
      break
    }
  })
  return contours
}

function raster(contour: Contour, children: Contour[]) {
  const { x, y, width, height } = contour.box
  // 0,125 mm/ô ở kích thước thông thường. Giới hạn bộ nhớ cho khổ lớn.
  const scale = Math.min(8, Math.sqrt(1_000_000 / Math.max(1, width * height)), 4096 / Math.max(width, height))
  const w = Math.ceil(width * scale) + 4
  const h = Math.ceil(height * scale) + 4
  const mask = new Uint8Array(w * h)
  const shapes = [contour, ...children]
  for (let row = 1; row < h - 1; row++) {
    const xs: number[] = []
    for (const shape of shapes) crossings(shape.points, y + (row - 1.5) / scale, xs)
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const left = Math.ceil((xs[i] - x) * scale + 1.5)
      const right = Math.ceil((xs[i + 1] - x) * scale + 1.5)
      mask.fill(1, row * w + left, row * w + right)
    }
  }
  return { field: signedDistance(mask, w, h), w, scale }
}

function narrowJoin(contour: Contour, holes: Contour[], limit: number) {
  const { field, w, scale } = raster(contour, holes)
  // Nếu co đều mỗi mép nửa ngưỡng làm tách hai vùng giấy đáng kể,
  // phần nối giữa chúng hẹp hơn ngưỡng. Bỏ qua đầu nhọn biến mất khi co.
  const cutoff = Math.max(.5, limit * scale / 2 - .5)
  const minArea = Math.ceil(scale * scale)
  const seen = new Uint8Array(field.length)
  const queue = new Int32Array(field.length)
  const offsets = [-1, 1, -w, w]
  const lobes: Int32Array[] = []
  for (let i = 0; i < field.length; i++) {
    if (seen[i] || field[i] < cutoff) continue
    let head = 0
    let tail = 1
    queue[0] = i
    seen[i] = 1
    while (head < tail) {
      const cell = queue[head++]
      // Hai ô nền đệm bao quanh ảnh, nên các ô đạt ngưỡng luôn ở bên trong.
      for (const offset of offsets) {
        const neighbor = cell + offset
        if (seen[neighbor] || field[neighbor] < cutoff) continue
        seen[neighbor] = 1
        queue[tail++] = neighbor
      }
    }
    if (tail >= minArea) lobes.push(queue.slice(0, tail))
  }
  if (lobes.length < 2) return null
  // Grow the surviving lobes together inside the paper until two meet at a neck.
  const owners = new Int32Array(field.length)
  let head = 0
  let tail = 0
  lobes.forEach((lobe, index) => {
    for (const cell of lobe) {
      owners[cell] = index + 1
      queue[tail++] = cell
    }
  })
  while (head < tail) {
    const cell = queue[head++]
    for (const offset of offsets) {
      const neighbor = cell + offset
      if (field[neighbor] <= 0) continue
      if (owners[neighbor] && owners[neighbor] !== owners[cell]) {
        return { x: contour.box.x + ((cell % w + neighbor % w) / 2 - 1.5) / scale,
          y: contour.box.y + ((Math.floor(cell / w) + Math.floor(neighbor / w)) / 2 - 1.5) / scale,
          resolutionMm: 1 / scale }
      }
      if (!owners[neighbor]) {
        owners[neighbor] = owners[cell]
        queue[tail++] = neighbor
      }
    }
  }
  return null
}

export function inspectCutSheet(svg: string, placements: Placement[], units: { id: string; name: string }[],
  sheet: number, dpi: number, limitMm = DEFAULT_CUT_LIMIT_MM) {
  if (!Number.isFinite(limitMm) || limitMm < 1 || limitMm > 10) throw new Error('Invalid cut limit')
  const mmPerPx = 25.4 / dpi
  const contours = parseContours(svg)
  const assigned = new Map<Contour, Placement>()
  const sheetPlacements = placements.filter(p => p.sheet === sheet - 1)
  const printBoxes = sheetPlacements.map(p => ({
    box: { x: p.x * mmPerPx, y: p.y * mmPerPx, width: p.width * mmPerPx, height: p.height * mmPerPx },
    placement: p,
  }))
  for (const contour of contours) {
    // Một số cụm có lớp con nhô ra ngoài hộp xếp. Chỉ ghép theo giao
    // khi một cụm chiếm hơn nửa hộp contour, để giữ cảnh báo khi chưa rõ.
    const owner = contour.parent ? assigned.get(contour.parent) :
      (printBoxes.find(p => contains(p.box, contour.box, mmPerPx)) ||
       printBoxes.find(p => overlap(p.box, contour.box) > contour.box.width * contour.box.height / 2))?.placement
    if (owner) assigned.set(contour, owner)
  }
  function inspectPiece(pieceContours: Contour[]) {
    const parts = pieceContours.filter(c => c.depth % 2 === 0)
    const holes = pieceContours.filter(c => c.depth % 2 === 1)
    const smallHoles = holes.flatMap(hole => {
      const { field, scale } = raster(hole, parts.filter(c => c.parent === hole))
      let radius = 0
      for (const value of field) radius = Math.max(radius, value)
      const openingMm = radius * 2 / scale
      return openingMm < limitMm ? [{ ...hole.box, openingMm, points: hole.points }] : []
    })
    const narrowJoins = parts.flatMap(part => {
      const result = narrowJoin(part, holes.filter(h => h.parent === part), limitMm)
      return result ? [result] : []
    })
    return {
      sheet, box: parts.length ? bounds(parts.flatMap(p => p.points)) : null,
      parts: parts.map(p => p.box), holes: holes.length, smallHoles, narrowJoins,
      paths: pieceContours.map(c => c.points),
    }
  }
  const rows = sheetPlacements.map(p => ({
    ...inspectPiece(contours.filter(c => assigned.get(c) === p)),
    id: p.unitId, name: units.find(u => u.id === p.unitId)?.name || p.unitId,
  }))
  const unassigned = contours.filter(c => !assigned.has(c))
  if (unassigned.length) rows.push({ ...inspectPiece(unassigned), id: '', name: '' })
  return rows
}

export type CutReadinessRow = ReturnType<typeof inspectCutSheet>[number]
