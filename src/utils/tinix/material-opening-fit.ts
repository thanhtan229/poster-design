// [TINIX] Fit a photo opening to the inner rim near its diagram tag.
import { polygonArea, simplifyClosed, smoothField, traceLevel } from '../../../service/src/tinix/cutPaths'
import type { PieceOpening, SheetPiece } from './material-sheet'

type Size = { width: number; height: number }
type Point = { x: number; y: number }
type Candidate = Point & { scale: number; height: number; angle: number; score: number; coverage: number }
type EdgeSample = { nx: number; ny: number; pixels: Point[]; paper?: Point; side: number; outer: boolean }
type OpeningKind = 'arch' | 'polaroid' | 'stamp' | 'rounded' | 'oval'

const archWidths = [.80, .90, 1, 1.10, 1.20]
const archHeights = [1.03, 1.15, 1.27, 1.39, 1.51, 1.63]
const polaroidWidths = [.80, .89, .98, 1.07, 1.16, 1.25]
const polaroidHeights = [.86, .95, 1.04, 1.13, 1.22]
const shallowWidths = [.58, .67, .76, .85, .94, 1.03, 1.12]
const shallowHeights = [.73, .84, .95, 1.06, 1.17, 1.28]

function profileWidth(points: PieceOpening, y: number) {
  const hits: number[] = []
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]
    if ((a.y > y) !== (b.y > y)) hits.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y))
  })
  return hits.length ? Math.max(...hits) - Math.min(...hits) : 0
}

export function isArchedOpening(points: PieceOpening) {
  if (points.length < 5) return false
  const ys = points.map(point => point.y)
  const top = Math.min(...ys)
  const height = Math.max(...ys) - top
  const middle = profileWidth(points, top + height * .5)
  return middle > .2 && profileWidth(points, top + height * .10) < middle * .79 &&
    profileWidth(points, top + height * .88) > middle * .88
}

// A Polaroid has straight sides and enough paper below the photo for a caption.
export function isPolaroidOpening(points: PieceOpening) {
  if (points.length < 4) return false
  const ys = points.map(point => point.y)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const height = bottom - top
  const middle = profileWidth(points, top + height * .5)
  return 1 - bottom >= .16 && middle > .55 &&
    profileWidth(points, top + height * .10) > middle * .90 &&
    profileWidth(points, top + height * .90) > middle * .90
}

export function openingFitKind(points: PieceOpening): OpeningKind | undefined {
  if (isArchedOpening(points)) return 'arch'
  if (isPolaroidOpening(points)) return 'polaroid'
  if (points.length < 4) return
  const ys = points.map(point => point.y)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const height = bottom - top
  const widthAt = (row: number) => profileWidth(points, top + height * row)
  const middle = widthAt(.5)
  if (1 - bottom > .15 || middle < .55 || widthAt(.10) < middle * .79 || widthAt(.90) < middle * .86) return
  return widthAt(.06) >= middle * .91 && widthAt(.95) >= middle * .91 ? 'stamp' : 'rounded'
}

function openingSamples(points: PieceOpening, size: Size) {
  const pixels = points.map(({ x, y }) => ({ x: (x - .5) * size.width, y: (y - .5) * size.height }))
  const samples: Array<Point & { dx: number; dy: number }> = []
  pixels.forEach((a, index) => {
    const b = pixels[(index + 1) % pixels.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length < 2) return
    const count = Math.max(1, Math.round(length / 11))
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count
      samples.push({ x: a.x + t * dx, y: a.y + t * dy, dx: dx / length, dy: dy / length })
    }
  })
  return samples
}

// [TINIX] Extract the outside of the PNG from its own alpha, keeping the same padding as pieceImage.
export function outerPaperContour(piece: SheetPiece, source: ImageData, bounds: { left: number; top: number; right: number; bottom: number }, size: Size) {
  const { width, height } = size
  const field = new Float32Array(width * height)
  const padLeft = (width - bounds.right + bounds.left) / 2
  const padTop = (height - bounds.bottom + bounds.top) / 2
  if (!Number.isInteger(padLeft) || !Number.isInteger(padTop) || padLeft < 1 || padTop < 1) return
  for (const index of piece.pixels) {
    const x = index % source.width - bounds.left + padLeft
    const y = Math.floor(index / source.width) - bounds.top + padTop
    field[y * width + x] = source.data[index * 4 + 3] / 255
  }
  const [outline] = traceLevel(smoothField(field, width, height, .55), width, height, .5)
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))
  return outline && simplifyClosed(outline, .85).map(([x, y]) => ({ x: x / width, y: y / height }))
}

export function createOpeningFitter(image: ImageData, originalWidth: number) {
  const { width, height, data } = image
  const ratio = width / originalWidth
  // On cream paper the cool channel separates the edge of the shadow from the paper.
  const channel = smoothField(Float32Array.from({ length: width * height }, (_, i) => data[i * 4 + 2]), width, height, .65)
  const gx = new Float32Array(channel.length)
  const gy = new Float32Array(channel.length)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    gx[i] = (channel[i - width + 1] + 2 * channel[i + 1] + channel[i + width + 1]
      - channel[i - width - 1] - 2 * channel[i - 1] - channel[i + width - 1]) / 8
    gy[i] = (channel[i + width - 1] + 2 * channel[i + width] + channel[i + width + 1]
      - channel[i - width - 1] - 2 * channel[i - width] - channel[i - width + 1]) / 8
  }
  function edgeAt({ nx, ny, pixels, paper }: EdgeSample, x: number, y: number) {
    let best = 0
    for (let band = 0; band < pixels.length; band++) {
      const col = pixels[band].x + x
      const row = pixels[band].y + y
      if (col < 1 || col >= width - 1 || row < 1 || row >= height - 1) continue
      const index = row * width + col
      const value = Math.min(45, Math.abs(gx[index] * nx + gy[index] * ny))
      best = Math.max(best, band === 1 ? value : value * .94)
    }
    if (!paper) return best
    const paperCol = paper.x + x
    const paperRow = paper.y + y
    if (paperCol < 0 || paperCol >= width || paperRow < 0 || paperRow >= height) return 0
    // Prefer the border between the photo and light paper over a strong line in the photo itself.
    const light = Math.max(0, Math.min(1, (channel[paperRow * width + paperCol] - 165) / 63))
    return best * (.33 + .67 * light)
  }
  function measure(offsets: EdgeSample[], x: number, y: number, kind: OpeningKind) {
    let sum = 0
    let support = 0
    const bySide = [0, 0, 0, 0]
    const totals = [0, 0, 0, 0]
    const sums = [0, 0, 0, 0]
    for (const offset of offsets) {
      const edge = edgeAt(offset, x, y)
      sum += edge
      totals[offset.side]++
      sums[offset.side] += edge
      if (edge >= 14) {
        support++
        bySide[offset.side]++
      }
    }
    const coverage = support / offsets.length
    if (kind === 'arch') return { score: sum / offsets.length, coverage }
    const sides = totals.map((total, side) => bySide[side] / Math.max(1, total)).sort((a, b) => a - b)
    if (kind === 'stamp') {
      // One side can disappear under a foreground cutout. Keep the other three and use the diagram tag to constrain drift.
      const means = totals.map((total, side) => sums[side] / Math.max(1, total)).sort((a, b) => b - a)
      const score = (.30 * (means[0] + means[1] + means[2]) + .10 * sum / offsets.length) * Math.min(1, sides[1] / .28)
      return { score, coverage: (sides[1] + sides[2] + sides[3]) / 3 }
    }
    return { score: sum / offsets.length * Math.min(1, sides[0] / .28), coverage }
  }
  return (opening: PieceOpening, size: Size, tag: Point, kind: OpeningKind = 'arch', verifyPhoto = false,
    paired?: { outer: PieceOpening; diagramHeight: number; diagramCenterY: number; bottom?: Point }) => {
    const outer = paired?.outer
    const visible = (p: Point) => p.y < size.height * .22 ||
      Math.abs(p.x) > size.width * .30 && p.y < size.height * .41
    const points = openingSamples(opening, size).filter(p => !outer || visible(p)).map(p => ({ ...p, outer: false }))
    const paper = outer ? openingSamples(outer, size).filter(visible).map(p => ({ ...p, outer: true })) : []
    if (points.length < 30) return
    const outward = -Math.sign(polygonArea(opening.map(({ x, y }) => [x, y])))
    const paperOutward = outer ? -Math.sign(polygonArea(outer.map(({ x, y }) => [x, y]))) : 0
    const center = { x: Math.round(tag.x * width), y: Math.round(tag.y * height) }
    const bottom = paired?.bottom
    const outerBottom = outer ? Math.max(...outer.map(point => point.y)) : 1
    const minimumY = paired && !bottom ? Math.round(paired.diagramCenterY * height) : 0
    function search(anchor: Point, dx: number, dy: number, step: number, widths: number[], heights: number[], angles: number[]) {
      let best: Candidate | undefined
      for (const scale of widths) for (const heightScale of heights) for (const angle of angles) {
        // The photo only shows the top of this arch. Keep the height indicated by the visible diagram rim.
        if (paired && !bottom && (heightScale < paired.diagramHeight - .001 || heightScale > paired.diagramHeight * 1.075)) continue
        const stretch = heightScale / scale
        // [TINIX] A local line or a neighboring frame should not squeeze a closed rounded opening.
        if (verifyPhoto && kind === 'rounded' && (stretch < .82 || stretch > 1.16)) continue
        if (verifyPhoto && kind === 'oval' && (stretch < .80 || stretch > 1.25)) continue
        const rad = angle * Math.PI / 180
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        const sx = scale * ratio
        const sy = heightScale * ratio
        const offsets = [...points, ...paper].map(point => {
          const x = point.x * sx * c - point.y * sy * s
          const y = point.x * sx * s + point.y * sy * c
          const tx = point.dx * sx * c - point.dy * sy * s
          const ty = point.dx * sx * s + point.dy * sy * c
          const length = Math.hypot(tx, ty)
          const nx = -ty / length
          const ny = tx / length
          const pixels = [-1, 0, 1].map(band => ({ x: Math.round(x + nx * band), y: Math.round(y + ny * band) }))
          const paperOffset = point.outer ? -paperOutward * 1.35 : (kind !== 'arch' || verifyPhoto) ? outward * 2.6 : 0
          const paper = paperOffset ? { x: Math.round(x + nx * paperOffset), y: Math.round(y + ny * paperOffset) } : undefined
          const side = Math.abs(point.dx) > Math.abs(point.dy) ? Number(point.dx > 0) : 2 + Number(point.dy > 0)
          return { nx, ny, pixels, paper, side, outer: point.outer }
        })
        const inside = offsets.filter(p => !p.outer)
        const outside = offsets.filter(p => p.outer)
        // [TINIX] The clicked point identifies the middle of the outside bottom edge.
        const bottomOffset = (outerBottom - .5) * size.height * sy
        const fixed = bottom && { x: Math.round(bottom.x * width + bottomOffset * s), y: Math.round(bottom.y * height - bottomOffset * c) }
        const firstX = fixed?.x ?? anchor.x - dx
        const lastX = fixed?.x ?? anchor.x + dx
        const firstY = fixed?.y ?? Math.max(minimumY, anchor.y - dy)
        const lastY = fixed?.y ?? anchor.y + dy
        for (let y = firstY; y <= lastY; y += step) for (let x = firstX; x <= lastX; x += step) {
          const fit = measure(inside, x, y, kind)
          const edge = outside.length ? measure(outside, x, y, 'arch') : fit
          const drift = kind === 'stamp' ? Math.abs(x - center.x) * .64 + Math.abs(y - center.y) * .09
            : verifyPhoto ? Math.hypot(x - center.x, y - center.y) * .11 : 0
          const score = (fit.score * .5 + edge.score * .5) - drift
          best = !best || score > best.score ? { x, y, scale, height: heightScale, angle, coverage: Math.min(fit.coverage, edge.coverage), score } : best
        }
      }
      return best
    }
    const wider = verifyPhoto && (kind === 'arch' || kind === 'rounded' || kind === 'oval')
    const coarse = search(center, Math.ceil(width * (wider ? .105 : .04)), Math.ceil(height * (wider ? .09 : .05)), 3,
      kind === 'arch' ? archWidths : kind === 'polaroid' ? polaroidWidths : shallowWidths,
      paired && !bottom ? [1, 1.045, 1.075].map(factor => paired.diagramHeight * factor)
        : kind === 'arch' ? archHeights : kind === 'polaroid' ? polaroidHeights : shallowHeights,
      kind === 'oval' ? [0] : kind === 'arch' ? [-7, 0, 7] : [-14, -7, 0, 7, 14])
    if (!coarse) return
    const fine = search(coarse, 3, 3, 1, [-.09, -.06, -.03, 0, .03, .06, .09].map(v => coarse.scale + v),
      [-.105, -.07, -.035, 0, .035, .07, .105].map(v => coarse.height + v),
      (kind === 'oval' ? [0] : [-4, -2, 0, 2, 4]).map(v => coarse.angle + v))
    // The explicit anchor supplies position evidence even when some paper samples are occluded.
    if (!fine || fine.score < 15 || fine.coverage < (bottom ? .38 : .5)) return
    return { x: fine.x / width, y: fine.y / height, scale: fine.scale,
      heightRatio: fine.height / fine.scale, angle: fine.angle, score: 45 - fine.score }
  }
}
