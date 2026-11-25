// [TINIX] Split transparent material sheets without baking a hard threshold into their edges.
import { cutoutCanvas, readCutoutFile, readCutoutImage } from './cutout-workspace'
import { polygonArea, simplifyClosed, smoothField, traceLevel } from '../../../service/src/tinix/cutPaths'

export type SheetPiece = { pixels: number[] }
export type PieceRole = 'sticker' | 'frame' | 'hero'
export type PieceOpening = Array<{ x: number; y: number }> // [TINIX] Coordinates relative to the extracted piece.

export function validPieceOpening(points: PieceOpening) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 1024 || points.some(point => !point ||
    !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return false
  const twiceArea = points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0)
  return Math.abs(twiceArea) >= .001
}

export function pieceOpeningPath(points: PieceOpening, width: number, height: number) {
  return points.length ? 'M' + points.map(point => `${point.x * width} ${point.y * height}`).join('L') + 'Z' : ''
}

// [TINIX] Only suggest a frame for one large, compact window enclosed by the extracted paper.
export function findTransparentOpening({ width, height, data }: ImageData): PieceOpening | undefined {
  if (width < 28 || height < 28) return
  const seen = new Uint8Array(width * height)
  const queue = new Uint32Array(seen.length)
  const open = (index: number) => !seen[index] && data[index * 4 + 3] <= 64
  function flood(start: number) {
    let size = 0
    let left = width; let right = 0; let top = height; let bottom = 0
    const add = (index: number) => {
      if (open(index)) {
        queue[size++] = index
        seen[index] = 1
      }
    }
    add(start)
    for (let i = 0; i < size; i++) {
      const p = queue[i]
      const x = p % width; const y = Math.floor(p / width)
      left = Math.min(left, x); right = Math.max(right, x + 1)
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1)
      if (x > 0) add(p - 1)
      if (x + 1 < width) add(p + 1)
      if (y > 0) add(p - width)
      if (y + 1 < height) add(p + width)
    }
    return { size, left, right, top, bottom }
  }
  // The extract has a transparent pad, so a single flood removes all exterior space.
  flood(0)
  let opening: PieceOpening | undefined
  let qualifyingArea = 0
  let otherArea = 0
  for (let index = 0; index < seen.length; index++) {
    if (!open(index)) continue
    const { size, left, right, top, bottom } = flood(index)
    const w = right - left; const h = bottom - top
    if (size < seen.length * .24 || w < width * .45 || h < height * .45 || size < w * h * .62) {
      otherArea = Math.max(otherArea, size)
      continue
    }
    if (qualifyingArea) return
    qualifyingArea = size
    const stride = w + 4; const rows = h + 4
    const field = new Float32Array(stride * rows)
    for (let i = 0; i < size; i++) {
      const p = queue[i]
      field[(Math.floor(p / width) - top + 2) * stride + p % width - left + 2] = 1
    }
    const [rim] = traceLevel(smoothField(field, stride, rows, .55), stride, rows, .5)
      .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))
    if (!rim) return
    opening = simplifyClosed(rim, .75).map(([x, y]) => ({ x: (x + left - 2) / width, y: (y + top - 2) / height }))
  }
  if (opening && otherArea < qualifyingArea * .25 && validPieceOpening(opening)) return opening
}

export async function materialPixels(file: File) {
  const image = await readCutoutImage(await readCutoutFile(file))
  const { naturalWidth: width, naturalHeight: height } = image
  if (width * height > 16_000_000) throw new Error('Material sheet is too large')
  const { context } = cutoutCanvas(width, height)
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, width, height)
}

function* alphaComponents(image: ImageData, threshold: number): Generator<SheetPiece> {
  const { width, height, data } = image
  const visited = new Uint8Array(width * height)
  for (let i = 0; i < visited.length; i++) {
    if (visited[i] || data[i * 4 + 3] < threshold) continue
    const pixels = [i]
    visited[i] = 1
    for (let head = 0; head < pixels.length; head++) {
      const p = pixels[head]
      const x = p % width; const y = Math.floor(p / width)
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const next = ny * width + nx
          if (visited[next] || data[next * 4 + 3] < threshold) continue
          visited[next] = 1
          pixels.push(next)
        }
      }
    }
    yield { pixels }
  }
}

export function sheetPieces(image: ImageData, threshold: number): SheetPiece[] {
  const pieces: SheetPiece[] = []
  for (const piece of alphaComponents(image, threshold)) {
    if (piece.pixels.length >= 16) pieces.push(piece)
  }
  return pieces
}

// [TINIX] Remove detached wisps only. Keep every pixel of connected material.
export function filterDetachedAlpha(image: ImageData) {
  const { width, height, data } = image
  const filtered = new Uint8ClampedArray(data)
  let removed = 0
  for (const piece of alphaComponents(image, 4)) {
    if (piece.pixels.some(pixel => data[pixel * 4 + 3] >= 16)) continue
    const { left, top, right, bottom } = pieceBounds(piece, width)
    if (Math.min(right - left, bottom - top) > 2) continue
    for (const pixel of piece.pixels) filtered.fill(0, pixel * 4, pixel * 4 + 4)
    removed++
  }
  return { image: new ImageData(filtered, width, height), removed }
}

export function suggestSheetThreshold(image: ImageData) {
  const thresholds = [4, 8, 16, 24, 40, 64]
  const counts: number[] = []
  for (const value of thresholds) {
    const count = sheetPieces(image, value).length
    const i = counts.length
    if (count > 1 && count === counts[i - 1] && count === counts[i - 2]) return thresholds[i - 2]
    counts.push(count)
  }
  return thresholds[2]
}

export function pieceBounds(piece: SheetPiece, width: number) {
  let left = Infinity; let top = Infinity; let right = 0; let bottom = 0
  for (const p of piece.pixels) {
    const x = p % width; const y = Math.floor(p / width)
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
  }
  return { left, top, right, bottom }
}

// [TINIX] The first scan uses the same transparent opening in the editor and CLI.
export function previewMaterialPiece(image: ImageData, piece: SheetPiece, threshold: number, detectOpening: boolean) {
  return pieceImage(image, piece, threshold, 'sticker', undefined, detectOpening ? 'detect' : undefined)
}

// [TINIX] Preserve only unambiguous one-to-one matches with a small edge change.
// Any shared pixels with a second component veto the match after a split or merge.
export function matchRescannedPieces(previous: SheetPiece[], next: SheetPiece[], width: number, height: number) {
  const matches = new Map<number, { previousIndex: number; exact: boolean }>()
  if (!previous.length || !next.length) return matches

  const owners = new Uint32Array(width * height)
  previous.forEach((piece, index) => {
    for (const pixel of piece.pixels) owners[pixel] = index + 1
  })
  const links = new Uint32Array(previous.length + 1)
  const overlaps = next.map(piece => {
    const counts = new Map<number, number>()
    for (const pixel of piece.pixels) {
      const owner = owners[pixel]
      if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1)
    }
    for (const owner of counts.keys()) links[owner]++
    return counts
  })

  overlaps.forEach((counts, index) => {
    if (counts.size !== 1) return
    const [[owner, shared]] = counts
    if (links[owner] !== 1) return
    const before = previous[owner - 1]
    const after = next[index]
    const union = before.pixels.length + after.pixels.length - shared
    if (shared / union < .97) return
    const exact = shared === union
    if (!exact) {
      const a = pieceBounds(before, width)
      const b = pieceBounds(after, width)
      if (Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top),
        Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom)) > 3) return
      const afterPixels = new Set(after.pixels)
      // The difference must be near the edge of the combined silhouette.
      // A small hole cut into the middle is a material change too.
      const nearEdge = (pixel: number) => {
        const x = pixel % width
        const y = Math.floor(pixel / width)
        return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => {
          for (let step = 1; step <= 3; step++) {
            const col = x + dx * step
            const row = y + dy * step
            if (col < 0 || col >= width || row < 0 || row >= height) return true
            const neighbor = row * width + col
            if (owners[neighbor] !== owner && !afterPixels.has(neighbor)) return true
          }
          return false
        })
      }
      if (before.pixels.some(pixel => !afterPixels.has(pixel) && !nearEdge(pixel)) ||
          after.pixels.some(pixel => owners[pixel] !== owner && !nearEdge(pixel))) return
    }
    matches.set(index, { previousIndex: owner - 1, exact })
  })
  return matches
}

export function pieceImage(image: ImageData, piece: SheetPiece, threshold: number, role: PieceRole = 'sticker', opening?: PieceOpening,
  alphaOpening?: 'detect' | 'preserve') {
  const bounds = pieceBounds(piece, image.width)
  const left = bounds.left - 3; const top = bounds.top - 3
  const width = bounds.right - left + 3; const height = bounds.bottom - top + 3
  const { canvas, context } = cutoutCanvas(width, height)
  const rgba = context.createImageData(width, height)
  const customOpening = role === 'frame' && opening && validPieceOpening(opening) ? opening : undefined
  const distance = new Float32Array(width * height)
  const owned = new Set(piece.pixels)
  function copy(x: number, y: number, source: number, core: boolean) {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) return
    const offset = (y - top) * width + x - left
    const alpha = image.data[source * 4 + 3]
    const retained = core ? alpha : Math.min(alpha, Math.max(0, (alpha - 3) * 2))
    if (retained <= rgba.data[offset * 4 + 3]) return
    const channels = role === 'sticker' || customOpening ? image.data.subarray(source * 4, source * 4 + 3) : [254, 246, 226]
    rgba.data.set(channels, offset * 4)
    rgba.data[offset * 4 + 3] = retained
    distance[offset] = retained >= 96 ? Infinity : 0
  }
  for (const p of piece.pixels) {
    const x = p % image.width; const y = Math.floor(p / image.width)
    copy(x, y, p, true)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx; const ny = y + dy
        if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue
        const q = ny * image.width + nx
        const alpha = image.data[q * 4 + 3]
        if (!owned.has(q) && alpha > 3 && alpha < threshold) copy(nx, ny, q, false)
      }
    }
  }
  context.putImageData(rgba, 0, 0)
  const detectedOpening = alphaOpening === 'detect' ? findTransparentOpening(rgba) : undefined
  if (customOpening) {
    // [TINIX] An already hollow frame keeps its paper pixels. A hand-traced opening can erase an old photograph.
    const path = new Path2D(pieceOpeningPath(customOpening, width, height))
    const mask = cutoutCanvas(width, height)
    mask.context.fillStyle = '#fff'
    mask.context.strokeStyle = '#fff'
    mask.context.lineJoin = 'round'
    mask.context.fill(path, 'evenodd')
    mask.context.lineWidth = alphaOpening === 'preserve' ? 5 : 3
    mask.context.stroke(path)
    if (alphaOpening !== 'preserve') {
      context.globalCompositeOperation = 'destination-out'
      context.lineJoin = 'round'
      context.fill(path, 'evenodd')
      context.lineWidth = 1.5
      context.stroke(path)
    }
    return { left, top, width, height, url: canvas.toDataURL(), mask: mask.canvas.toDataURL(), overlay: true }
  }
  const url = canvas.toDataURL()
  if (role === 'sticker') return { left, top, width, height, url, mask: '', detectedOpening }

  // Inset the inner photo opening while the paper keeps the exterior cut shape.
  for (let i = width + 1; i < distance.length - width - 1; i++) {
    distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - width] + 1,
      distance[i - width - 1] + Math.SQRT2, distance[i - width + 1] + Math.SQRT2)
  }
  for (let i = distance.length - width - 2; i > width; i--) {
    distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + width] + 1,
      distance[i + width + 1] + Math.SQRT2, distance[i + width - 1] + Math.SQRT2)
  }
  const maxInset = distance.reduce((maximum, value) => Math.max(maximum, value), 0)
  if (maxInset < 2) throw new Error('Piece has no usable photo area')
  const inset = Math.min(Math.max(3, Math.min(width, height) * 0.035), maxInset * 0.45)
  for (let i = 0; i < distance.length; i++) {
    rgba.data.fill(255, i * 4, i * 4 + 3)
    rgba.data[i * 4 + 3] = Math.min(255, Math.max(0, (distance[i] - inset + 0.5) * 255))
  }
  context.putImageData(rgba, 0, 0)
  return { left, top, width, height, url, mask: canvas.toDataURL() }
}
