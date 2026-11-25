// [TINIX] Registration should recover an arch stretched vertically and reject a flat diagram.
import assert from 'node:assert/strict'
import { createOpeningFitter, isArchedOpening, isPolaroidOpening, openingFitKind, outerPaperContour } from '../../src/utils/tinix/material-opening-fit'

const outline = Array.from({ length: 21 }, (_, index) => {
  const angle = Math.PI * index / 20
  return { x: .5 - .38 * Math.cos(angle), y: .45 - .33 * Math.sin(angle) }
}).concat([{ x: .88, y: .92 }, { x: .12, y: .92 }])
const rectangle = [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }]
assert.equal(isArchedOpening(outline), true)
assert.equal(isArchedOpening(rectangle), false)

const width = 220
const height = 300
const originalWidth = 880
const size = { width: 332, height: 380 }
const center = { x: 106, y: 122 }
const sx = 1.10
const sy = 1.39
const points = outline.map(point => ({
  x: center.x + (point.x - .5) * size.width * sx / 4,
  y: center.y + (point.y - .5) * size.height * sy / 4,
}))
const data = new Uint8ClampedArray(width * height * 4)
for (let y = 0; y < height; y++) {
  const crossings = points.flatMap((a, index) => {
    const b = points[(index + 1) % points.length]
    return (a.y > y) !== (b.y > y) ? [a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)] : []
  })
  for (let x = 0; x < width; x++) {
    const tone = crossings.length && x >= Math.min(...crossings) && x <= Math.max(...crossings) ? 233 : 105
    data.set([tone, tone, tone, 255], (y * width + x) * 4)
  }
}
const sample = { width, height, data } as ImageData
const tag = { x: .50, y: .39 }
const fit = createOpeningFitter(sample, originalWidth)(outline, size, tag)
assert(fit)
assert(Math.hypot(fit.x * width - center.x, fit.y * height - center.y) < 3.5)
assert(Math.abs(fit.scale - sx) <= .095)
assert(Math.abs(fit.heightRatio * fit.scale - sy) <= .095)
assert(Math.abs(fit.angle) <= 4)
assert.equal(createOpeningFitter({ ...sample, data: new Uint8ClampedArray(data.length).fill(220) }, originalWidth)
  (outline, size, tag), undefined)

const outsideArch = outline.map(({ x, y }) => ({ x: .5 + (x - .5) * 1.12, y: .5 + (y - .5) * 1.12 }))
const outerBottom = Math.max(...outsideArch.map(point => point.y))
function fillsArch(shape: typeof outline, x: number, y: number) {
  return shape.reduce((inside, a, index) => {
    const b = shape[(index + 1) % shape.length]
    return (a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y) ? !inside : inside
  }, false)
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const px = .5 + 4 * (x - center.x) / (sx * size.width)
  const py = .5 + 4 * (y - center.y) / (sy * size.height)
  const tone = py > .63 ? 140 : fillsArch(outline, px, py) ? 67 : fillsArch(outsideArch, px, py) ? 246 : 110
  data.set([tone, tone, tone, 255], (y * width + x) * 4)
}
const bottom = { x: center.x / width, y: (center.y + (outerBottom - .5) * sy * size.height / 4) / height }
const pinned = createOpeningFitter(sample, originalWidth)(outline, size, tag, 'arch', true,
  { outer: outsideArch, diagramHeight: 1.05, diagramCenterY: .34, bottom })
assert(pinned)
assert(Math.abs(pinned.heightRatio * pinned.scale - sy) < .12)
const pinnedAngle = pinned.angle * Math.PI / 180
const pinnedOffset = (outerBottom - .5) * pinned.heightRatio * pinned.scale * size.height / 4
assert(Math.hypot(pinned.x * width - pinnedOffset * Math.sin(pinnedAngle) - bottom.x * width,
  pinned.y * height + pinnedOffset * Math.cos(pinnedAngle) - bottom.y * height) < .8)

const captionOpening = [{ x: .1, y: .13 }, { x: .9, y: .13 }, { x: .9, y: .80 }, { x: .1, y: .80 }]
assert.equal(isPolaroidOpening(captionOpening), true)
assert.equal(isPolaroidOpening(rectangle), false)
assert.equal(isPolaroidOpening(outline), false)
assert.equal(openingFitKind(rectangle), 'stamp')
const rounded = [{ x: .22, y: .10 }, { x: .78, y: .10 }, { x: .89, y: .19 }, { x: .92, y: .25 },
  { x: .92, y: .77 }, { x: .89, y: .84 }, { x: .78, y: .92 }, { x: .22, y: .92 },
  { x: .11, y: .84 }, { x: .08, y: .77 }, { x: .08, y: .25 }, { x: .11, y: .19 }]
assert.equal(openingFitKind(rounded), 'rounded')
const rotation = 7 * Math.PI / 180
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const dx = x - center.x
  const dy = y - center.y
  const localX = .5 + (dx * Math.cos(rotation) + dy * Math.sin(rotation)) / (size.width * 1.07 / 4)
  const localY = .5 + (-dx * Math.sin(rotation) + dy * Math.cos(rotation)) / (size.height * 1.13 / 4)
  const onPaper = localX >= 0 && localX <= 1 && localY >= 0 && localY <= 1
  const inPhoto = localX >= .1 && localX <= .9 && localY >= .13 && localY <= .8
  const tone = inPhoto ? (localY < .47 ? 55 : 149) : onPaper ? 244 : 114
  data.set([tone, tone, tone, 255], (y * width + x) * 4)
}
const polaroid = createOpeningFitter(sample, originalWidth)(captionOpening, size, tag, 'polaroid')
assert(polaroid)
assert(Math.hypot(polaroid.x * width - center.x, polaroid.y * height - center.y) < 3.5)
assert(Math.abs(polaroid.scale - 1.07) <= .09)
assert(Math.abs(polaroid.heightRatio * polaroid.scale - 1.13) <= .09)
assert(Math.abs(polaroid.angle - 7) <= 3)

// Simulate a foreground cutout crossing the right side of a small stamp frame.
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const localX = .5 + (x - center.x) / (size.width * .76 / 4)
  const localY = .5 + (y - center.y) / (size.height * .95 / 4)
  const onPaper = localX >= 0 && localX <= 1 && localY >= 0 && localY <= 1
  const inPhoto = localX >= .1 && localX <= .9 && localY >= .1 && localY <= .9
  const tone = localX > .82 ? 125 : inPhoto ? 62 : onPaper ? 244 : 114
  data.set([tone, tone, tone, 255], (y * width + x) * 4)
}
const stamp = createOpeningFitter(sample, originalWidth)(rectangle, size, { x: center.x / width, y: center.y / height }, 'stamp')
assert(stamp)
assert(Math.abs(stamp.x * width - center.x) <= 3.5)
assert(Math.abs(stamp.heightRatio * stamp.scale - .95) <= .09)

const ringPixels: number[] = []
const ring = new Uint8ClampedArray(30 * 30 * 4)
for (let y = 4; y < 26; y++) for (let x = 4; x < 26; x++) {
  if (x >= 8 && x < 22 && y >= 8 && y < 22) continue
  ringPixels.push(y * 30 + x)
  ring[(y * 30 + x) * 4 + 3] = 255
}
const outer = outerPaperContour({ pixels: ringPixels }, { width: 30, height: 30, data: ring } as ImageData,
  { left: 4, right: 26, top: 4, bottom: 26 }, { width: 28, height: 28 })
assert(outer)
assert(Math.min(...outer.map(p => p.x)) < .13)
assert(Math.max(...outer.map(p => p.x)) > .87)
console.log('Diagram opening fit verified')
