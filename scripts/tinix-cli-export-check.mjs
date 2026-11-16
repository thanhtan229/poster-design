import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const dir = path.resolve('.runtime', 'cli-export-check-' + Date.now())
await mkdir(dir, { recursive: true })
const report = { pass: false, steps: [], artifacts: dir }
let id
async function run(...args) {
  const start = Date.now()
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''
    child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => code ? reject(new Error(err)) : resolve(JSON.parse(out)))
  })
  report.steps.push({ command: args.slice(0, 2).join(' '), milliseconds: Date.now() - start })
  return result
}
async function image(uuid, color, left, top, printRole) {
  const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: color } }).png().toBuffer()
  return { uuid, name: uuid, type: 'w-image', imgUrl: 'data:image/png;base64,' + bytes.toString('base64'), left, top, width: 100, height: 100, parent: '-1', printRole, opacity: 1, zoom: 1, rotate: 0, radius: 0, transform: '', mask: '', isNinePatch: false, flip: '', setting: [], record: { width: 100, height: 100, minWidth: 10, minHeight: 10, dir: 'all' } }
}
async function checkPixel(file, x, y, expected) {
  const actual = [...await sharp(file).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer()]
  assert(actual.every((v, i) => Math.abs(v - expected[i]) < 8), `${actual} != ${expected}`)
}
try {
  const layout = { global: { name: 'CLI fixture', uuid: '-1', type: 'page', left: 0, top: 0, width: 600, height: 400, dpi: 300, backgroundColor: '#ffffffff', backgroundImage: '', backgroundGradient: '', backgroundTransform: {}, opacity: 1, record: {} }, layers: [await image('base-red', '#dc1414', 50, 50, 'base'), await image('raised-blue', '#1414dc', 300, 100, 'raised')] }
  const input = path.join(dir, 'draft.json'), preview = path.join(dir, 'preview.png')
  await writeFile(input, JSON.stringify(layout, null, 2))
  id = (await run('designs', 'create', '--input', input, '--title', 'CLI temporary export check')).id
  assert(id)
  await run('designs', 'render', '--id', String(id), '--width', '600', '--height', '400', '--output', preview)
  await checkPixel(preview, 75, 75, [220, 20, 20]); await checkPixel(preview, 325, 125, [20, 20, 220])
  const bundle = await run('collage', 'export', '--id', String(id), '--directory', path.join(dir, 'export'))
  assert.equal(bundle.files.length, 3)
  const manifest = JSON.parse(await readFile(path.join(dir, 'export', 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.layouts[0].layers.map(l => l.uuid), ['base-red'])
  const cut = manifest.layouts.slice(1, -1).flatMap(p => p.layers)
  assert.equal(cut.length, 1); assert.equal(cut[0].uuid, 'raised-blue'); assert.equal(cut[0].width, 100); assert.equal(cut[0].height, 100)
  assert.equal(manifest.layouts.at(-1).layers.length, 2)
  const margin = 5 * 300 / 25.4
  assert(cut[0].left >= margin && cut[0].top >= margin && cut[0].left + 100 <= 600 - margin && cut[0].top + 100 <= 400 - margin)
  for (const file of bundle.files) {
    const meta = await sharp(file).metadata()
    assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 600); assert.equal(meta.height, 400); assert.equal(meta.density, 300)
  }
  await checkPixel(bundle.files[0], 75, 75, [220, 20, 20]); await checkPixel(bundle.files[0], 325, 125, [255, 255, 255])
  await checkPixel(bundle.files[1], Math.round(cut[0].left + 25), Math.round(cut[0].top + 25), [20, 20, 220])
  await checkPixel(bundle.files[2], 75, 75, [220, 20, 20]); await checkPixel(bundle.files[2], 325, 125, [20, 20, 220])
  report.pass = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  if (id) {
    try {
      const r = await fetch(base + '/design/poster/del', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      assert.equal((await r.json()).code, 200)
    } catch (error) { report.cleanupError = String(error); process.exitCode = 1; report.pass = false }
  }
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
