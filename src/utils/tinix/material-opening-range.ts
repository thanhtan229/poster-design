// [TINIX] Work on a closed contour in normalized material coordinates.
import type { PieceOpening } from './material-sheet'

export type OpeningPoint = PieceOpening[number]
export type OpeningLock = { left: number; top: number; right: number; bottom: number }

// [TINIX] Use tangents in native pixels so rectangular images do not skew the normals.
export function openingNormal(points: PieceOpening, index: number, width: number, height: number): OpeningPoint {
  const span = Math.min(2, Math.floor((points.length - 1) / 2))
  const before = points[(index - span + points.length) % points.length]
  const after = points[(index + span) % points.length]
  const dx = (after.x - before.x) * width
  const dy = (after.y - before.y) * height
  const length = Math.hypot(dx, dy)
  return length ? { x: -dy / length, y: dx / length } : { x: 0, y: 0 }
}

export function openingRangeTaper(points: PieceOpening, range: number[], width: number, height: number) {
  let length = 0
  const distances = range.map((index, order) => {
    if (order) {
      const previous = points[range[order - 1]]
      const point = points[index]
      length += Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height)
    }
    return length
  })
  const blend = Math.min(8, length / 3)
  return distances.map(distance => {
    const t = blend ? Math.min(1, distance / blend, (length - distance) / blend) : 0
    return t * t * (3 - 2 * t)
  })
}

export function openingRange(points: PieceOpening, first: number, last: number, width: number, height: number, otherSide: boolean) {
  const walk = (step: number) => {
    const indices = [first]
    let length = 0
    for (let index = first; index !== last;) {
      const next = (index + step + points.length) % points.length
      length += Math.hypot((points[next].x - points[index].x) * width, (points[next].y - points[index].y) * height)
      indices.push(next)
      index = next
    }
    return { indices, length }
  }
  const forward = walk(1)
  const reverse = walk(-1)
  return (forward.length <= reverse.length) !== otherSide ? forward.indices : reverse.indices
}

function touches(lock: OpeningLock, a: OpeningPoint, b: OpeningPoint, c = a, d = b) {
  return Math.min(a.x, b.x, c.x, d.x) <= lock.right && Math.max(a.x, b.x, c.x, d.x) >= lock.left &&
    Math.min(a.y, b.y, c.y, d.y) <= lock.bottom && Math.max(a.y, b.y, c.y, d.y) >= lock.top
}

export function openingLockedPoints(points: PieceOpening, locks: OpeningLock[]) {
  const fixed = new Set<number>()
  points.forEach((point, index) => {
    const next = (index + 1) % points.length
    if (locks.some(lock => touches(lock, point, points[next]))) {
      fixed.add(index)
      fixed.add(next)
    }
  })
  return fixed
}

export function openingCrossesLock(before: PieceOpening, after: PieceOpening, locks: OpeningLock[]) {
  return before.some((point, index) => {
    const next = (index + 1) % before.length
    if (point === after[index] && before[next] === after[next]) return false
    return locks.some(lock => touches(lock, point, before[next], after[index], after[next]))
  })
}

// [TINIX] Relax a selected contour locally. Limit drift so smoothing cannot flatten a whole arc.
export function smoothOpeningRange(points: PieceOpening, range: number[], width: number, height: number, locks: OpeningLock[]) {
  if (range.length < 3) return points
  const fixed = openingLockedPoints(points, locks)
  const taper = openingRangeTaper(points, range, width, height)
  let current = points
  for (let pass = 0; pass < 3; pass++) {
    const next = [...current]
    for (let order = 1; order < range.length - 1; order++) {
      const index = range[order]
      if (fixed.has(index)) continue
      const left = current[range[order - 1]]
      const right = current[range[order + 1]]
      const point = current[index]
      const a = Math.hypot((point.x - left.x) * width, (point.y - left.y) * height)
      const b = Math.hypot((right.x - point.x) * width, (right.y - point.y) * height)
      if (!(a + b)) continue
      const ratio = a / (a + b)
      const weight = taper[order] * .65
      const original = points[index]
      const x = point.x + (left.x + (right.x - left.x) * ratio - point.x) * weight - original.x
      const y = point.y + (left.y + (right.y - left.y) * ratio - point.y) * weight - original.y
      const distance = Math.hypot(x * width, y * height)
      if (distance < .000001) continue
      const limit = Math.min(1, 2 / distance)
      next[index] = { x: original.x + x * limit, y: original.y + y * limit }
    }
    if (locks.length && openingCrossesLock(points, next, locks)) break
    current = next
  }
  return current
}
