// [TINIX] Find compact frame tags with a large, centered three-character heading.
import { pieceBounds, sheetPieces, type PieceOpening } from './material-sheet'
import { polygonArea } from '../../../service/src/tinix/cutPaths'
import { cutoutCanvas } from './cutout-workspace'
import type { MaterialDiagramArea } from './material-placement'

export const diagramFrameCodes = Array.from({ length: 9 }, (_, index) => 'F0' + (index + 1))

type Bounds = ReturnType<typeof pieceBounds>
type ReadCode = (tile: ImageData, letters: Bounds[]) => string | undefined
const glyphWidth = 16
const glyphHeight = 24

function glyphPattern(image: ImageData, box: Bounds) {
  const result = new Uint8Array(glyphWidth * glyphHeight)
  for (let y = 0; y < glyphHeight; y++) for (let x = 0; x < glyphWidth; x++) {
    const col = box.left + Math.floor((x + .5) * (box.right - box.left) / glyphWidth)
    const row = box.top + Math.floor((y + .5) * (box.bottom - box.top) / glyphHeight)
    result[y * glyphWidth + x] = Number(image.data[(row * image.width + col) * 4 + 3] >= 128)
  }
  return result
}

function compareGlyphs(a: Uint8Array, b: Uint8Array) {
  let overlap = 0
  let total = 0
  for (let i = 0; i < a.length; i++) {
    overlap += a[i] & b[i]
    total += a[i] + b[i]
  }
  return total ? 2 * overlap / total : 0
}

// [TINIX] Read the short standardized F0n heading locally; ambiguous glyphs stay unlabeled.
export function createDiagramCodeReader(): ReadCode {
  const { context } = cutoutCanvas(64, 64)
  const glyphs = new Map<string, Uint8Array[]>()
  for (const ch of 'F0123456789') {
    const variants: Uint8Array[] = []
    for (const family of ['Arial', 'Segoe UI', 'Tahoma']) {
      context.clearRect(0, 0, 64, 64)
      context.font = `bold 46px "${family}"`
      context.fillText(ch, 8, 49)
      const image = context.getImageData(0, 0, 64, 64)
      const [piece] = sheetPieces(image, 128)
      if (piece) variants.push(glyphPattern(image, pieceBounds(piece, 64)))
    }
    glyphs.set(ch, variants)
  }
  const similarity = (pattern: Uint8Array, char: string) =>
    Math.max(0, ...glyphs.get(char)!.map(variant => compareGlyphs(pattern, variant)))
  return (tile, letters) => {
    const [first, second, third] = letters.map(letter => glyphPattern(tile, letter))
    if (similarity(first, 'F') < .72 || similarity(second, '0') < .72) return
    const digits = diagramFrameCodes.map(code => ({ code, score: similarity(third, code[2]) })).sort((a, b) => b.score - a.score)
    if (digits[0].score >= .70 && digits[0].score - digits[1].score >= .035) return digits[0].code
  }
}

export function hasRoundDiagramOpening(points?: PieceOpening) {
  if (!points?.length) return false
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const boxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  return boxArea > 0 && Math.abs(polygonArea(points.map(({ x, y }) => [x, y]))) / boxArea < .84
}

function tagArea({ left, top, right, bottom }: Bounds, width: number, height: number, frameCode?: string) {
  return { x: Math.max(0, (left + right) / (2 * width) - .06),
    y: Math.max(0, (top + bottom) / (2 * height) - .056), width: .12, height: .112,
    ...(frameCode ? { frameCode } : {}) }
}

// [TINIX] A short tag can share its dark outline with nearby artwork. Read its light interior instead.
function shortTagAreas(paper: ImageData, dark: Uint8ClampedArray, readCode: ReadCode) {
  const { width, height } = paper
  return sheetPieces(paper, 128).flatMap(piece => {
    const box = pieceBounds(piece, width)
    const { left, top, right, bottom } = box
    const w = right - left
    const h = bottom - top
    if (w < width * .045 || w > width * .13 || h < height * .014 || h > height * .037 ||
        w / h < 1.8 || w / h > 3.1 || piece.pixels.length < w * h * .63) return []
    const tile = new ImageData(w, h)
    for (let row = 0; row < h; row++) {
      const offset = ((top + row) * width + left) * 4
      tile.data.set(dark.subarray(offset, offset + w * 4), row * w * 4)
    }
    const letters = sheetPieces(tile, 128).map(glyph => pieceBounds(glyph, w))
      .filter(({ left, top, right, bottom }) => left > 0 && top > 0 && right < w && bottom < h &&
        bottom - top >= h * .43 && bottom - top <= h * .78 && right - left >= w * .09)
      .sort((a, b) => a.left - b.left)
    if (letters.length !== 3 ||
        Math.max(...letters.map(letter => letter.top)) - Math.min(...letters.map(letter => letter.top)) > h * .10 ||
        letters[0].left < w * .08 || letters[2].right > w * .92 ||
        letters[2].right - letters[0].left < w * .52) return []
    const code = readCode(tile, letters)
    return code ? [tagArea(box, width, height, code)] : []
  })
}

export function diagramSearchAreas(image: ImageData, readCode?: ReadCode): MaterialDiagramArea[] {
  const { width, height, data } = image
  const binary = new Uint8ClampedArray(data.length)
  const paper = readCode ? new ImageData(width, height) : undefined
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (g < 102 && r < 175 && r > g && b < 90) binary[i + 3] = 255
    if (paper && data[i + 3] === 255 && r >= 220 && g >= 196 && b >= 165 && r - g < 48 && g - b < 48)
      paper.data[i + 3] = 255
  }
  const outlineAreas = sheetPieces(new ImageData(binary, width, height), 128).flatMap(piece => {
    const { left, top, right, bottom } = pieceBounds(piece, width)
    const w = right - left
    const h = bottom - top
    if (w < width * .075 || w > width * .21 || h < height * .024 || h > height * .084 ||
        piece.pixels.length / (w * h) > .19) return []
    const tileWidth = Math.round(w * .74)
    const compact = h < height * .038
    if (compact && !readCode) return []
    const tileHeight = Math.round(h * (compact ? .80 : .39))
    const x0 = left + Math.round(w * .13)
    const y0 = top + Math.round(h * .055)
    const tile = new ImageData(tileWidth, tileHeight)
    for (let row = 0; row < tileHeight; row++) {
      const offset = ((y0 + row) * width + x0) * 4
      tile.data.set(binary.subarray(offset, offset + tileWidth * 4), row * tileWidth * 4)
    }
    const letters = sheetPieces(tile, 128).map(glyph => pieceBounds(glyph, tileWidth))
      .filter(glyph => glyph.bottom - glyph.top > h * .19 && glyph.right - glyph.left > w * .05)
    if (letters.length !== 3 || Math.max(...letters.map(letter => letter.top)) -
      Math.min(...letters.map(letter => letter.top)) > h * .10) return []
    letters.sort((a, b) => a.left - b.left)
    const frameCode = readCode?.(tile, letters)
    if (compact && !frameCode) return []
    return [tagArea({ left, top, right, bottom }, width, height, frameCode)]
  })
  if (!paper || !readCode) return outlineAreas
  const compactAreas = shortTagAreas(paper, binary, readCode)
  const sameTag = (a: MaterialDiagramArea, b: MaterialDiagramArea) =>
    Math.abs(a.x - b.x) < .015 && Math.abs(a.y - b.y) < .015
  return [...outlineAreas.filter(area => !compactAreas.some(tag => sameTag(area, tag) &&
    (!area.frameCode || area.frameCode === tag.frameCode))), ...compactAreas]
}
