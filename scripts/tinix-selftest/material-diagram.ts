// [TINIX] An annotated frame tag bounds a search; a blank note does not.
import assert from 'node:assert/strict'
import { diagramSearchAreas } from '../../src/utils/tinix/material-diagram'
import { fitMaterialEdge, matchMaterialPoses, type MatchRequest } from '../../src/utils/tinix/material-placement'

class Raster {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
  constructor(dataOrWidth: number | Uint8ClampedArray, widthOrHeight: number, height?: number) {
    this.width = typeof dataOrWidth === 'number' ? dataOrWidth : widthOrHeight
    this.height = height ?? widthOrHeight
    this.data = typeof dataOrWidth === 'number' ? new Uint8ClampedArray(this.width * this.height * 4) : dataOrWidth
  }
}
Object.assign(globalThis, { ImageData: Raster })
const image = new Raster(800, 1000)
image.data.fill(255)
const ink = (x: number, y: number, w: number, h: number) => {
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
    image.data.set([112, 59, 35, 255], (row * image.width + col) * 4)
  }
}
const tag = (x: number, y: number) => {
  ink(x, y, 104, 2)
  ink(x, y + 58, 104, 2)
  ink(x, y, 2, 60)
  ink(x + 102, y, 2, 60)
}
tag(130, 200)
tag(430, 400)
for (const x of [160, 173, 186]) ink(x, 207, 8, 15)
const areas = diagramSearchAreas(image as ImageData)
assert.equal(areas.length, 1)
assert(Math.abs(areas[0].x + areas[0].width / 2 - 182 / 800) < .002)
assert(Math.abs(areas[0].y + areas[0].height / 2 - .23) < .002)
assert.equal(diagramSearchAreas(image as ImageData, () => 'F02')[0].frameCode, 'F02')
ink(130, 570, 74, 1)
ink(130, 596, 74, 1)
ink(130, 570, 1, 27)
ink(203, 570, 1, 27)
for (const x of [151, 163, 175]) ink(x, 575, 7, 14)
assert.equal(diagramSearchAreas(image as ImageData).length, 1)
assert.equal(diagramSearchAreas(image as ImageData, () => 'F02').length, 2)

// [TINIX] A narrow tag still reads when another dark element intersects its border.
ink(470, 690, 54, 22)
for (let row = 692; row < 710; row++) for (let col = 472; col < 522; col++) {
  image.data.set([255, 242, 221, 255], (row * image.width + col) * 4)
}
ink(508, 665, 30, 27)
for (const x of [480, 493, 506]) ink(x, 695, 8, 12)
const compactAreas = diagramSearchAreas(image as ImageData, (tile, letters) =>
  tile.width === 50 && letters.every(letter => letter.bottom - letter.top === 12) ? 'F03' : 'F02')
const compactTag = compactAreas.find(area => area.frameCode === 'F03')!
assert(compactTag)
assert(Math.abs(compactTag.x + compactTag.width / 2 - 497 / 800) < .002)
assert(Math.abs(compactTag.y + compactTag.height / 2 - .701) < .002)
assert(!diagramSearchAreas(image as ImageData, () => undefined).some(area => area.frameCode === 'F03'))

const tagF01 = { ...areas[0], frameCode: 'F01' }
const tagF02 = { ...areas[0], x: .7, frameCode: 'F02' }
const piece = { pixels: [], bounds: { left: 0, top: 0, right: 10, bottom: 10 } }
const request: MatchRequest = {
  diagram: true, diagramAreas: [tagF02, tagF01], reference: image as ImageData, originalWidth: image.width,
  source: image as ImageData, pieces: [{ ...piece, frameCode: 'F01' }, { ...piece, frameCode: 'F02' }, { ...piece, frameCode: 'F09' }],
}
const poses = matchMaterialPoses(request)
assert.equal(poses[0]?.x, tagF01.x + tagF01.width / 2)
assert.equal(poses[1]?.x, tagF02.x + tagF02.width / 2)
assert.equal(poses[2], undefined)
assert.equal(matchMaterialPoses({ ...request, diagramAreas: [tagF01, tagF01] })[0], undefined)
assert.equal(matchMaterialPoses({ ...request, pieces: [request.pieces[0], request.pieces[0]] })[0], undefined)
const edgePage = { width: 1000, height: 1000 }
const opening = [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .8 }, { x: .1, y: .8 }]
const guess = { x: .48, y: .48, scale: 1.21, heightRatio: 1, angle: 0, score: 1, reliable: false }
const bottomEdge = { start: { x: .42, y: .56 }, end: { x: .58, y: .56 } }
const checked = fitMaterialEdge(guess, opening, { width: 200, height: 200 }, edgePage, bottomEdge)
assert(checked)
assert(Math.abs(checked.scale - 1) < .001)
assert(Math.abs(checked.heightRatio - 1.1) < .001)
assert(Math.abs(checked.y - .494) < .001)
assert.deepEqual(fitMaterialEdge(guess, opening, { width: 200, height: 200 }, edgePage,
  { start: bottomEdge.end, end: bottomEdge.start })?.measuredEdge,
  { start: bottomEdge.end, end: bottomEdge.start })
assert.equal(fitMaterialEdge(guess, opening, { width: 200, height: 200 }, edgePage,
  { start: bottomEdge.start, end: bottomEdge.start }), undefined)
console.log('Material diagram tags verified')
