// [TINIX] Find a local paper-to-photo transition using a sampled rim color.
import type { PieceOpening } from './material-sheet'
import { openingCrossesLock, openingLockedPoints, openingNormal, openingRangeTaper, type OpeningLock } from './material-opening-range'

export type PaperColor = readonly [number, number, number]

export function paperPixel(image: ImageData, x: number, y: number): PaperColor | undefined {
  const col = Math.floor(x)
  const row = Math.floor(y)
  if (col < 0 || row < 0 || col >= image.width || row >= image.height) return
  const i = (row * image.width + col) * 4
  if (image.data[i + 3] < 224) return
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
}

export function suggestOpeningPaperEdge(
  image: ImageData, points: PieceOpening, range: number[], locks: OpeningLock[], color: PaperColor,
) {
  const { width, height } = image
  const fixed = openingLockedPoints(points, locks)
  const taper = openingRangeTaper(points, range, width, height)
  const winding = points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]
    return sum + point.x * next.y - point.y * next.x
  }, 0) < 0 ? -1 : 1
  const candidates = range.map((index, order) => {
    if (fixed.has(index) || !taper[order]) return undefined
    const point = points[index]
    const normal = openingNormal(points, index, width, height)
    const u = normal.x * winding
    const v = normal.y * winding
    if (!u && !v) return undefined
    const compare = (d: number) => {
      const pixel = paperPixel(image, point.x * width + d * u, point.y * height + d * v)
      return pixel ? Math.hypot(pixel[0] - color[0], pixel[1] - color[1], pixel[2] - color[2]) : undefined
    }
    let best: { d: number; score: number } | undefined
    for (let d = -9; d <= 9; d++) {
      const outside = [compare(d - 1), compare(d - 2)]
      const inside = [compare(d + 1), compare(d + 2)]
      if (outside.some(n => n === undefined || n > 53) || inside.some(n => n === undefined || n < 60)) continue
      const contrast = Math.min(...inside as number[]) - Math.max(...outside as number[])
      if (contrast < 20) continue
      const score = Math.min(contrast, 95) - Math.abs(d) * 3
      if (!best || score > best.score) best = { d, score }
    }
    return best ? { offset: best.d, u, v } : undefined
  })
  const result = [...points]
  for (let order = 1; order < range.length - 1; order++) {
    const match = candidates[order]
    if (!match) continue
    const neighbors = [candidates[order - 1], candidates[order + 1]]
      .filter(neighbor => neighbor && Math.abs(neighbor.offset - match.offset) <= 4)
    if (!neighbors.length) continue
    const displacement = (match.offset * 2 + neighbors.reduce((sum, n) => sum + n!.offset, 0)) / (2 + neighbors.length) * taper[order]
    if (Math.abs(displacement) < .2) continue
    const index = range[order]
    result[index] = {
      x: points[index].x + displacement * match.u / width,
      y: points[index].y + displacement * match.v / height,
    }
  }
  return locks.length && openingCrossesLock(points, result, locks) ? points : result
}
