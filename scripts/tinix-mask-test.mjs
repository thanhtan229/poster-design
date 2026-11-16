import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { editMask, borderMask, renderCutout, placeCutout } from './tinix-mask.mjs'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const dir = await mkdtemp(path.join(os.tmpdir(), 'tinix-mask-'))
try {
  const source = path.join(dir, 'source.png'), cutout = path.join(dir, 'cutout.png'), output = path.join(dir, 'edited.png')
  const raw = Buffer.alloc(20 * 20 * 4)
  for (let i = 0; i < raw.length; i += 4) { raw[i] = 121; raw[i + 1] = 45; raw[i + 2] = 77; raw[i + 3] = 255 }
  await sharp(raw, { raw: { width: 20, height: 20, channels: 4 } }).png().toFile(source)
  const alpha = Buffer.from(raw)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 20; x++) alpha[(y * 20 + x) * 4 + 3] = 0
  await sharp(alpha, { raw: { width: 20, height: 20, channels: 4 } }).png().toFile(cutout)
  const original = await readFile(source), initial = await readFile(cutout)
  await editMask(source, cutout, [{ shape: 'rect', mode: 'restore', x: 2, y: 2, width: 3, height: 3 }, { shape: 'brush', mode: 'erase', radius: 1, points: [[2, 15], [15, 15]] }], output)
  const pixels = await sharp(output).ensureAlpha().raw().toBuffer()
  const a = (x, y) => pixels[(y * 20 + x) * 4 + 3]
  assert.equal(a(3, 3), 255); assert.equal(a(0, 0), 0); assert.equal(a(10, 15), 0); assert.equal(a(10, 19), 255)
  for (let i = 0; i < pixels.length; i += 4) assert.deepEqual([...pixels.subarray(i, i + 3)], [121, 45, 77])
  assert((await readFile(source)).equals(original)); assert((await readFile(cutout)).equals(initial))
  const border = path.join(dir, 'border.png')
  const geometry = await borderMask(output, border, { mm: 1, dpi: 254, scale: 5 })
  assert.equal(geometry.frame.left, -10); assert.equal(geometry.width, 40); assert.equal(geometry.documentWidth, 200)
  assert.equal(geometry.geometry, 'editor-concentric-stamps-v1')
  const borderPixels = await sharp(border).ensureAlpha().raw().toBuffer()
  assert(borderPixels.some((value, index) => index % 4 === 3 && value > 0))
  const zero = await renderCutout(output, { mm: 0, dpi: 254, scale: 5 })
  assert.deepEqual(zero.frame, geometry.frame)
  const zeroAlpha = await sharp(Buffer.from(zero.border.split(',')[1], 'base64')).extractChannel(3).stats()
  assert.equal(zeroAlpha.channels[0].max, 0)
  const draft = { global: { dpi: 254 }, layers: [{ uuid: 's', type: 'w-image', left: 10, top: 20, width: 200, height: 200 }, { uuid: 'linked', linkedPhotoId: 's' }] }
  const placed = await placeCutout(draft, 's', source, output, 1)
  assert(Math.abs(placed.geometry.top + placed.geometry.height - 220) < 0.0001)
  assert.equal(placed.layout.layers[1].imgUrl, placed.layout.layers[0].imgUrl)
  assert.equal(draft.layers[0].width, 200)
  assert((await readFile(output)).length > 0)
  await assert.rejects(borderMask(output, path.join(dir, 'bad-border.png'), { mm: 6, dpi: 300, scale: 1 }), /Viền/)
  await assert.rejects(editMask(source, cutout, [{ shape: 'rect', mode: 'erase', x: 0, y: 0, width: 20, height: 20 }], path.join(dir, 'empty.png')), /empty/)
  await assert.rejects(access(path.join(dir, 'empty.png')))
  await assert.rejects(editMask(source, cutout, [{ shape: 'rect', mode: 'restore', x: 0, y: 0, width: 1, height: 1 }], output), /EEXIST/)
  console.log('PASS mask: restore, continuous brush, unchanged RGB/source, empty mask and overwrite rejection')
} finally { await rm(dir, { recursive: true, force: true }) }
