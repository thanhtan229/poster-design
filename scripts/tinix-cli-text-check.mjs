import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const dir = path.resolve('.runtime', 'cli-text-check-' + Date.now())
await mkdir(dir, { recursive: true })
const report = { pass: false, artifacts: dir }, ids = []
function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''
    child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => resolve({ code, data: JSON.parse(code ? err : out) }))
  })
}
try {
  const layout = { global: { name: 'Text check', uuid: '-1', type: 'page', left: 0, top: 0, width: 600, height: 400, dpi: 300, backgroundColor: '#ffffffff', backgroundImage: '', backgroundGradient: '', backgroundTransform: {}, opacity: 1, record: {} }, layers: [{ uuid: 'title', name: 'Title', type: 'w-text', parent: '-1', editable: false, left: 50, top: 50, width: 250, height: 40, text: 'Dòng thứ nhất<br>Dòng thứ hai<br>Dòng thứ ba', fontFamily: 'Arial', fontClass: { id: 0, value: 'Arial', alias: 'Arial', url: '' }, fontSize: 32, lineHeight: 1.2, letterSpacing: 0, fontWeight: 'normal', fontStyle: 'normal', writingMode: 'horizontal-tb', textDecoration: 'none', textAlign: 'left', color: '#000000ff', opacity: 1, zoom: 1, rotate: 0, transform: '', backgroundColor: '', record: { width: 250, height: 40, minWidth: 0, minHeight: 0, dir: 'horizontal' } }] }
  const input = path.join(dir, 'before.json'), fixed = path.join(dir, 'after.json'), ops = path.join(dir, 'ops.json')
  await writeFile(input, JSON.stringify(layout))
  async function create(file) {
    const result = await run('designs', 'create', '--input', file, '--title', 'CLI temporary text check')
    assert.equal(result.code, 0, JSON.stringify(result.data)); ids.push(result.data.id); return result.data.id
  }
  const before = await create(input)
  const previewFailed = await run('drafts', 'render', '--input', input, '--output', path.join(dir, 'before-preview.png'))
  report.previewBefore = previewFailed
  assert.notEqual(previewFailed.code, 0)
  assert(previewFailed.data.issues?.some(issue => issue.code === 'TEXT_OVERFLOW' && issue.layerId === 'title'))
  const failed = await run('collage', 'export', '--id', String(before), '--directory', path.join(dir, 'before-export'))
  report.before = failed
  assert.notEqual(failed.code, 0)
  const issue = failed.data.issues?.find(issue => issue.code === 'TEXT_OVERFLOW' && issue.layerId === 'title')
  assert(issue, 'Expected structured TEXT_OVERFLOW for title')
  assert(issue.overflowY > 3)
  await writeFile(ops, JSON.stringify([{ action: 'update', id: 'title', changes: { height: 160 } }]))
  assert.equal((await run('drafts', 'apply', '--input', input, '--operations', ops, '--output', fixed)).code, 0)
  const after = await create(fixed)
  const previewFixed = await run('drafts', 'render', '--input', fixed, '--output', path.join(dir, 'after-preview.png'))
  report.previewAfter = previewFixed; assert.equal(previewFixed.code, 0, JSON.stringify(previewFixed.data))
  const exported = await run('collage', 'export', '--id', String(after), '--directory', path.join(dir, 'after-export'))
  report.after = exported
  assert.equal(exported.code, 0, JSON.stringify(exported.data))
  report.pass = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  for (const id of ids) {
    try { const response = await fetch(base + '/design/poster/del', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); assert.equal((await response.json()).code, 200) }
    catch (error) { report.cleanupError = String(error); report.pass = false; process.exitCode = 1 }
  }
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
}
