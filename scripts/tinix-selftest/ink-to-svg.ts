// [TINIX] Check subpixel expansion, closed counters and exclusion around an ink guard.
import assert from 'node:assert/strict'
import { traceInk } from '../../src/utils/tinix/ink-to-svg'
const sharp = require('../../service/node_modules/sharp')

const width = 56
const height = 40
function fixture(paper: number, ink: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ring = Math.abs(Math.hypot(x + 0.5 - 17, y + 0.5 - 21) - 9)
    const dot = Math.hypot(x + 0.5 - 33, y + 0.5 - 6)
    const noise = Math.hypot(x + 0.5 - 48, y + 0.5 - 22)
    const coverage = Math.min(1, Math.max(0, 1.75 - Math.min(ring, dot, noise)))
    const value = Math.round(paper + (ink - paper) * coverage)
    data.set([value, value, value, 255], (y * width + x) * 4)
  }
  return { data, width, height } as ImageData
}

async function main() {
  const source = fixture(255, 0)
  const guard = new Uint8ClampedArray(source.data.length)
  for (let y = 0; y < height; y++) for (let x = 0; x <= 35; x++) guard[(y * width + x) * 4 + 3] = 255
  const settings = { ink: '#000000', paper: '#ffffff', minArea: 1, threshold: 0.47, guard }
  const traced = traceInk(source, settings)
  assert.ok(traced)
  assert.equal(traced.contours, 3)
  assert.match(traced.path, /C/)
  const raster = async (svg: string) => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()
  const at = (alpha: Buffer, x: number, y: number) => alpha[(y * width + x) * 4 + 3]
  const alpha: Buffer = await raster(traced.svg)
  assert.equal(at(alpha, 17, 21), 0, 'the counter in the ring stays transparent')
  assert.ok(at(alpha, 25, 21) > 175, 'the ring contains ink')
  assert.ok(at(alpha, 32, 5) > 175, 'the detached dot survives')
  assert.equal(at(alpha, 47, 21), 0, 'ink outside the guard is excluded')
  assert.equal(traceInk(source, { ...settings, guard: undefined })?.contours, 4, 'cropped images can be traced without a guard')
  const dark = traceInk(fixture(0, 255), { ...settings, paper: '#000000', ink: '#ffffff' })
  assert.equal(dark?.contours, 3, 'light lettering on dark paper')
  const thinner = traceInk(source, { ...settings, threshold: 0.7 })
  assert.ok(thinner)
  const thinnerAlpha: Buffer = await raster(thinner.svg)
  const total = (bytes: Buffer) => bytes.reduce((sum, value, i) => i % 4 === 3 ? sum + value : sum, 0)
  assert.ok(total(alpha) > total(thinnerAlpha), 'lower coverage threshold restores more of the edge')
  assert.throws(() => traceInk(source, { ...settings, paper: settings.ink }), /contrast/)
  assert.equal(traceInk(source, { ...settings, guard: new Uint8ClampedArray(guard.length) }), undefined)
  console.log('PASS ink coverage, smooth SVG, counters, detached accents, guard and reverse contrast')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
