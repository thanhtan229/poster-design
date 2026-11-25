// [TINIX] A photo opening must be large, closed and unambiguous in the alpha channel.
import assert from 'node:assert/strict'
import { findTransparentOpening, validPieceOpening } from '../../src/utils/tinix/material-sheet'

const width = 112
const height = 120
const paper = (alphaAt: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    data[(y * width + x) * 4 + 3] = alphaAt(x, y)
  }
  return { width, height, data } as ImageData
}
const windowAt = (x: number, y: number) => x >= 14 && x < 98 && y >= 20 && y < 103
const tapeAt = (x: number, y: number) => x >= 36 && x < 65 && y < 32
const frame = paper((x, y) => windowAt(x, y) && !tapeAt(x, y) ? 8 : 253)
const outline = findTransparentOpening(frame)
assert(outline && validPieceOpening(outline))
assert(outline.some(p => Math.abs(p.y * height - 32) < 1), 'The contour must go around the tape')
assert.equal(findTransparentOpening(paper(() => 255)), undefined)
assert.equal(findTransparentOpening(paper((x, y) => windowAt(x, y) || x >= 30 && x <= 42 && y < 21 ? 0 : 255)), undefined)
assert.equal(findTransparentOpening(paper((x, y) => x > 22 && x < 89 && (y > 7 && y < 56 || y > 62 && y < 112) ? 0 : 255)), undefined)
assert.equal(findTransparentOpening(paper((x, y) => (x % 13) ** 2 + (y % 13) ** 2 < 20 ? 0 : 255)), undefined)
console.log('Material alpha openings verified')
