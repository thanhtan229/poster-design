import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url), sharp = require('../service/node_modules/sharp'), puppeteer = require('../service/node_modules/puppeteer')
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7018', editor = process.env.TINIX_EDITOR_URL || 'http://127.0.0.1:5188'
const dir = path.resolve('.runtime', 'cutout-cycle-' + Date.now())
await mkdir(dir, { recursive: true })
const report = { pass: false, artifacts: dir, steps: [] }; let designId
async function run(...args) {
  const started = Date.now()
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => { try { code ? reject(new Error(err)) : resolve(JSON.parse(out)) } catch (error) { reject(error) } })
  })
  report.steps.push({ command: args.slice(0, 2).join(' '), milliseconds: Date.now() - started }); return result
}
try {
  const source = path.join(dir, 'source.png'), cutout = path.join(dir, 'birefnet.png'), damaged = path.join(dir, 'damaged.png'), edited = path.join(dir, 'edited.png')
  await sharp(process.env.TINIX_TEST_PHOTO || 'service/static/photos/a0e4c310d56fc1fb5b472f1b3b12287a7a64ba32.jpg').rotate().resize({ width: 640, withoutEnlargement: true }).png().toFile(source)
  report.birefnet = await run('cutout', 'run', '--input', source, '--output', cutout)
  const rgba = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = rgba.info
  // Make a controlled defect inside a known opaque patch, then restore it through CLI.
  let patch
  for (let y = 10; y < height - 10 && !patch; y++) for (let x = 10; x < width - 10 && !patch; x++) {
    let solid = true
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) if (rgba.data[((y + dy) * width + x + dx) * 4 + 3] !== 255) solid = false
    if (solid) patch = { x, y, width: 5, height: 5 }
  }
  assert(patch, 'No opaque patch in actual BiRefNet result')
  const damageOps = path.join(dir, 'damage-ops.json'), repairOps = path.join(dir, 'repair-ops.json')
  await writeFile(damageOps, JSON.stringify([{ shape: 'rect', mode: 'erase', ...patch }]))
  await writeFile(repairOps, JSON.stringify([{ shape: 'rect', mode: 'restore', ...patch }]))
  await run('cutout', 'edit', '--source', source, '--input', cutout, '--operations', damageOps, '--output', damaged)
  await run('cutout', 'edit', '--source', source, '--input', damaged, '--operations', repairOps, '--output', edited)
  const repairedAlpha = await sharp(edited).extractChannel(3).raw().toBuffer(), originalAlpha = await sharp(cutout).extractChannel(3).raw().toBuffer()
  assert(repairedAlpha.equals(originalAlpha), 'Restored alpha must equal initial BiRefNet alpha')
  const draft = path.join(dir, 'template.json'), placedFile = path.join(dir, 'placed.json')
  await run('drafts', 'create', '--width', '1200', '--height', '900', '--output', draft)
  const layout = JSON.parse(await readFile(draft, 'utf8'))
  layout.global.backgroundColor = '#d8e4f0ff'
  layout.layers.push({ uuid: 'subject', name: 'Chủ thể cắt nổi', type: 'w-image', left: 350, top: 90, width: 500, height: 720, parent: '-1', templateRole: 'subject', templateAnchor: 'bottom', printRole: 'raised', slot: true, imgUrl: '', opacity: 1, zoom: 1, rotate: 0, radius: 0, transform: '', mask: '', flip: '', isNinePatch: false, setting: [], record: { width: 500, height: 720, minWidth: 10, minHeight: 10, dir: 'all' } })
  await writeFile(draft, JSON.stringify(layout))
  report.placement = await run('cutout', 'place', '--input', draft, '--id', 'subject', '--source', source, '--cutout', edited, '--mm', '1.5', '--output', placedFile)
  const placed = JSON.parse(await readFile(placedFile, 'utf8')), layer = placed.layers[0]
  const standaloneBorder = path.join(dir, 'standalone-border.png'), standaloneImage = path.join(dir, 'standalone-image.png')
  await run('cutout', 'border', '--input', edited, '--output', standaloneBorder, '--image-output', standaloneImage, '--mm', '1.5', '--dpi', '300', '--scale', String(report.placement.scale))
  assert((await readFile(standaloneBorder)).equals(Buffer.from(layer.cutoutBorderUrl.split(',')[1], 'base64')))
  assert((await readFile(standaloneImage)).equals(Buffer.from(layer.imgUrl.split(',')[1], 'base64')))
  assert(Math.abs(layer.top + layer.height - 810) < 0.00001)
  assert(Math.abs(layer.left + layer.width / 2 - 600) < 0.00001)
  await writeFile(path.join(dir, 'subject.png'), Buffer.from(layer.imgUrl.split(',')[1], 'base64'))
  await writeFile(path.join(dir, 'border.png'), Buffer.from(layer.cutoutBorderUrl.split(',')[1], 'base64'))
  // Load the editor's actual exported function and compare full PNG pixels/frame.
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage(); await page.goto(editor, { waitUntil: 'domcontentloaded' })
    const reference = await page.evaluate(async ({ url, data }) => {
      const { renderSubject } = await import(url + '/src/utils/tinix/cutout-edit.ts')
      const img = new Image(); img.src = data; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
      const result = renderSubject(canvas, 1.5, undefined, 300, { width: 500, height: 720 })
      return { image: result.image.toDataURL(), border: result.rim.toDataURL(), frame: result.frame, scale: result.scale }
    }, { url: editor, data: 'data:image/png;base64,' + (await readFile(edited)).toString('base64') })
    assert.deepEqual(reference.frame, layer.cutoutEdit.frame)
    assert.equal(reference.image, layer.imgUrl); assert.equal(reference.border, layer.cutoutBorderUrl)
    report.editorParity = 'exact PNG and geometry match'
  } finally { await browser.close() }
  await run('drafts', 'render', '--input', placedFile, '--output', path.join(dir, 'preview.png'))
  designId = (await run('designs', 'create', '--input', placedFile, '--title', 'CLI temporary cutout cycle')).id
  const exported = await run('collage', 'export', '--id', String(designId), '--directory', path.join(dir, 'export'))
  report.export = exported
  assert.equal(exported.files.length, 3)
  const manifest = JSON.parse(await readFile(path.join(dir, 'export', 'manifest.json'), 'utf8'))
  assert.equal(manifest.layouts[0].layers.length, 0)
  const cuts = manifest.layouts.slice(1, -1).flatMap(p => p.layers)
  assert.equal(cuts.length, 1); assert.equal(cuts[0].uuid, 'subject')
  assert.equal(cuts[0].width, layer.width); assert.equal(cuts[0].height, layer.height)
  // Production cut sheets intentionally omit decorative outlines; finished artwork retains them.
  assert.equal(cuts[0].cutoutBorderUrl, undefined)
  assert.equal(manifest.layouts.at(-1).layers.find(w => w.uuid === 'subject').cutoutBorderUrl, layer.cutoutBorderUrl)
  for (const file of exported.files) {
    const meta = await sharp(file).metadata(); assert.equal(meta.width, 1200); assert.equal(meta.height, 900); assert.equal(meta.density, 300)
  }
  const diff = await sharp(exported.files[2]).resize(120, 90).raw().toBuffer(), basePixels = await sharp(exported.files[0]).resize(120, 90).raw().toBuffer()
  assert(!diff.equals(basePixels), 'Finished image must differ from clean base')
  report.pass = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  if (designId) try {
    const res = await fetch(base + '/design/poster/del', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: designId }) }); assert.equal((await res.json()).code, 200)
  } catch (error) { report.cleanupError = String(error); report.pass = false; process.exitCode = 1 }
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
}
