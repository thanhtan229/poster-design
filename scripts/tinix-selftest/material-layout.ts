// [TINIX] Coordinate imports must never guess which PNG a layout describes or overwrite a manual fit.
import assert from 'node:assert/strict'
import { matchMaterialLayout, parseMaterialLayout } from '../../src/utils/tinix/material-layout'

const sheet = { file: 'pieces.png', width: 600, height: 800 }
const reference = { file: 'reference.png', width: 1200, height: 1600 }
const frame = { code: 'F02', source: { x: 50, y: 40, width: 200, height: 300 },
  target: { x: 640, y: 510, width: 400, height: 550, angle: -7 } }
const layout = { version: 1, sheet, reference, frames: [frame] }
const parse = (value: unknown) => parseMaterialLayout(JSON.stringify(value), sheet, reference)
const { placements: frames } = parse(layout)
const piece = { bounds: { left: 50, top: 40, right: 250, bottom: 340 }, frame: true, edited: false }
const [match] = matchMaterialLayout(frames, [piece], reference)
assert.equal(match.code, 'F02')
assert.equal(match.pose.scale, 2)
assert.equal(match.pose.heightRatio * 300 * match.pose.scale, 550)
assert.equal(match.pose.x * reference.width, 640)
assert(Math.abs(match.pose.y * reference.height - 510) < 1e-8)
assert.equal(match.pose.angle, -7)
assert.equal(match.pose.reliable, false)
for (const rejected of [[piece, piece], [{ ...piece, edited: true }], [{ ...piece, code: 'F05' }],
  [{ ...piece, frame: false }], [{ ...piece, bounds: { ...piece.bounds, right: 150 } }]])
  assert.equal(matchMaterialLayout(frames, rejected, reference).length, 0)
assert.equal(matchMaterialLayout([...frames, { ...frames[0], code: 'F03' }], [piece], reference).length, 0)
assert.throws(() => parse({ ...layout, sheet: { ...sheet, width: 601 } }))
assert.throws(() => parse({ ...layout, reference: { ...reference, file: 'other.png' } }))
assert.throws(() => parse({ ...layout, frames: [frame, frame] }))
assert.throws(() => parse({ ...layout, frames: [{ ...frame, source: { ...frame.source, x: 500 } }] }))
assert.throws(() => parse({ ...layout, frames: [{ ...frame, target: { ...frame.target, angle: 181 } }] }))
const decoration = { ...frame, code: 'D01', z: 3, source: { ...frame.source, x: 300 }, cutOuterOnly: true }
const extended = parse({ ...layout, subjectZ: 2, frames: [{ ...frame, z: 1 }], decorations: [decoration] })
const sticker = { ...piece, frame: false, bounds: { ...piece.bounds, left: 300, right: 500 } }
const ordered = matchMaterialLayout(extended.placements, [sticker, piece], reference)
assert.deepEqual(ordered.map(m => [m.index, m.pose.layoutOrder]), [[1, 1], [0, 3]])
assert.equal(ordered[1].pose.decorationCode, 'D01')
assert.equal(ordered[1].pose.cutOuterOnly, true)
assert.equal(ordered[0].pose.cutOuterOnly, undefined)
assert.equal(parse({ ...layout, frames: [{ ...frame, cutOuterOnly: false }] }).placements[0].cutOuterOnly, false)
assert.throws(() => parse({ ...layout, decorations: [{ ...decoration, cutOuterOnly: 'true' }] }))
assert.equal(extended.subjectZ, 2)
assert.equal(matchMaterialLayout(extended.placements, [{ ...sticker, hero: true }, piece], reference).length, 1)
assert.throws(() => parse({ ...layout, subjectZ: 3, decorations: [decoration] }))
const subject = { target: frame.target, borderMm: 0.9 }
assert.deepEqual(parse({ ...layout, subjectZ: 2, subject }).subject, {
  x: 640 / 1200, y: 510 / 1600, width: 400 / 1200, height: 550 / 1600, angle: -7, borderMm: 0.9,
})
assert.throws(() => parse({ ...layout, subject }))
assert.throws(() => parse({ ...layout, subjectZ: 2, subject: { ...subject, borderMm: -1 } }))
const print = { widthMm: 150, heightMm: 200, dpi: 300 }
assert.deepEqual(parse({ ...layout, print }).printSize, { width: 1772, height: 2362, dpi: 300 })
assert.equal(parse(layout).printSize, undefined)
assert.throws(() => parse({ ...layout, print: { ...print, dpi: 300.5 } }))
assert.throws(() => parse({ ...layout, print: { ...print, widthMm: 200 } }))
assert.throws(() => parse({ ...layout, print: { ...print, widthMm: 3000, heightMm: 4000 } }))
console.log('Material layout parsing and matching verified')
