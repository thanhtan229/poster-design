import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import assert from 'node:assert/strict'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7018'
const fixture = process.env.TINIX_CUTOUT_FIXTURE
if (!fixture) throw new Error('Set TINIX_CUTOUT_FIXTURE to a successful cutout-cycle artifact directory')
const dir = path.resolve('.runtime', 'instantiate-check-' + Date.now())
await mkdir(dir, { recursive: true })
const report = { pass: false, artifacts: dir, cases: [] }, ids = []
function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => { try { code ? reject(new Error(err)) : resolve(JSON.parse(out)) } catch (e) { reject(e) } })
  })
}
try {
  const img = (uuid, extra) => ({ uuid, name: uuid, type: 'w-image', parent: '-1', left: 0, top: 0, width: 1200, height: 900, opacity: 1, zoom: 1, rotate: 0, radius: 0, transform: '', mask: '', flip: '', imgUrl: '', isNinePatch: false, setting: [], record: { width: 100, height: 100, minWidth: 10, minHeight: 10, dir: 'all' }, ...extra })
  const layout = { global: { name: 'Reusable collage', type: 'page', uuid: '-1', left: 0, top: 0, width: 1200, height: 900, dpi: 300, backgroundColor: '#132b45ff', backgroundImage: '', backgroundGradient: '', backgroundTransform: {}, opacity: 1, record: {} }, layers: [
    img('linked-background', { linkedPhotoId: 'photo', fit: 'cover', opacity: 0.18, printRole: 'base' }),
    img('photo', { left: 100, top: 240, width: 360, height: 450, fit: 'cover', slot: true, templateRole: 'photo', printRole: 'base', printGroup: 'photo-group' }),
    img('subject', { left: 620, top: 180, width: 430, height: 650, slot: true, templateRole: 'subject', templateAnchor: 'bottom', printRole: 'raised' }),
    { uuid: 'title', name: 'title', type: 'w-text', parent: '-1', left: 100, top: 70, width: 1000, height: 65, text: '', templateRole: 'text', fontClass: { id: 0, value: 'Arial', alias: 'Arial', url: '' }, fontFamily: 'Arial', fontSize: 40, lineHeight: 1.2, letterSpacing: 0, fontWeight: 'normal', fontStyle: 'normal', writingMode: 'horizontal-tb', textAlign: 'left', textDecoration: 'none', color: '#ffffffff', opacity: 1, zoom: 1, transform: '', record: { width: 1000, height: 65, minWidth: 0, minHeight: 0, dir: 'horizontal' }, printRole: 'base' }
  ] }
  const template = path.join(dir, 'template.json'), before = JSON.stringify(layout)
  await writeFile(template, before)
  const results = []
  for (const [name, dimensions, title, flip] of [['portrait', [360, 540], 'Kỷ niệm tuổi thơ', false], ['landscape', [640, 360], 'Một ngày nhiều niềm vui', true]]) {
    const photo = path.join(dir, name + '-photo.png'), source = path.join(dir, name + '-source.png'), cutout = path.join(dir, name + '-cutout.png')
    await sharp(path.join(fixture, 'source.png')).resize(...dimensions, { fit: 'cover' }).png().toFile(photo)
    const s = sharp(path.join(fixture, 'source.png')), c = sharp(path.join(fixture, 'edited.png'))
    if (flip) { s.flop(); c.flop() }
    await s.png().toFile(source); await c.png().toFile(cutout)
    const bindings = path.join(dir, name + '-bindings.json'), draft = path.join(dir, name + '.json')
    await writeFile(bindings, JSON.stringify({ customer: name, slots: { photo: { file: path.basename(photo) }, subject: { source: path.basename(source), cutout: path.basename(cutout), mm: 1.5 }, title: { text: title } } }))
    const instantiated = await run('templates', 'instantiate', '--input', template, '--bindings', bindings, '--output', draft)
    const result = JSON.parse(await readFile(draft, 'utf8')); results.push(result)
    const subject = result.layers.find(l => l.uuid === instantiated.idMap.subject), p = result.layers.find(l => l.uuid === instantiated.idMap.photo), linked = result.layers.find(l => l.uuid === instantiated.idMap['linked-background'])
    assert.equal(linked.linkedPhotoId, p.uuid); assert.equal(linked.imgUrl, p.imgUrl)
    assert(Math.abs(subject.top + subject.height - 830) < 0.00001)
    await run('drafts', 'render', '--input', draft, '--output', path.join(dir, name + '-preview.png'))
    const id = (await run('designs', 'create', '--input', draft, '--title', 'CLI temporary ' + name)).id; ids.push(id)
    const exported = await run('collage', 'export', '--id', String(id), '--directory', path.join(dir, name + '-export'))
    assert.equal(exported.files.length, 3)
    const manifest = JSON.parse(await readFile(path.join(dir, name + '-export', 'manifest.json'), 'utf8')), cuts = manifest.layouts.slice(1, -1).flatMap(p => p.layers)
    assert.equal(cuts.length, 1); assert.equal(cuts[0].uuid, subject.uuid); assert.equal(cuts[0].width, subject.width); assert.equal(cuts[0].height, subject.height)
    for (const file of exported.files) { const m = await sharp(file).metadata(); assert.equal(m.width, 1200); assert.equal(m.height, 900); assert.equal(m.density, 300) }
    report.cases.push({ name, draft, preview: path.join(dir, name + '-preview.png'), ...exported })
    if (name === 'landscape') {
      // The center-cropped wide fixture has lost the face: use the full source,
      // rather than pretend changing crop can recover discarded source pixels.
      const operations = path.join(dir, 'landscape-fix-ops.json'), fixed = path.join(dir, 'landscape-fixed.json')
      await writeFile(operations, JSON.stringify([{ action: 'update', id: instantiated.idMap.photo, changes: { imgUrl: 'data:image/png;base64,' + (await readFile(path.join(fixture, 'source.png'))).toString('base64'), fit: 'cover', cropX: 50, cropY: 0 } }]))
      await run('drafts', 'apply', '--input', draft, '--operations', operations, '--output', fixed)
      const fixedData = JSON.parse(await readFile(fixed, 'utf8')), fixedPhoto = fixedData.layers.find(l => l.uuid === p.uuid)
      assert.equal(fixedData.layers.find(l => l.uuid === linked.uuid).imgUrl, fixedPhoto.imgUrl)
      assert.equal((JSON.parse(await readFile(draft, 'utf8'))).layers.find(l => l.uuid === p.uuid).imgUrl, p.imgUrl)
      await run('drafts', 'render', '--input', fixed, '--output', path.join(dir, 'landscape-fixed-preview.png'))
      const fixedId = (await run('designs', 'create', '--input', fixed, '--title', 'CLI temporary landscape crop fix')).id; ids.push(fixedId)
      const fixedExport = await run('collage', 'export', '--id', String(fixedId), '--directory', path.join(dir, 'landscape-fixed-export'))
      assert.equal(fixedExport.files.length, 3)
      report.cropFix = { draft: fixed, preview: path.join(dir, 'landscape-fixed-preview.png'), ...fixedExport }
    }
  }
  assert.equal(await readFile(template, 'utf8'), before)
  assert(!results[0].layers.some(a => results[1].layers.some(b => a.uuid === b.uuid)))
  assert.notEqual(results[0].layers[1].imgUrl, results[1].layers[1].imgUrl)
  report.pass = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  for (const id of ids) try { const r = await fetch(base + '/design/poster/del', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); assert.equal((await r.json()).code, 200) } catch (e) { report.cleanupError = String(e); report.pass = false; process.exitCode = 1 }
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
}
