import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const dir = path.resolve('.runtime', 'cli-resource-check-' + Date.now())
await mkdir(dir, { recursive: true })
const report = { pass: false, artifacts: dir, cases: [] }
function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''
    child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => { try { resolve({ code, data: JSON.parse(code ? err : out) }) } catch { reject(new Error(err || out)) } })
  })
}
const page = { name: 'Resource check', uuid: '-1', type: 'page', left: 0, top: 0, width: 600, height: 400, dpi: 300, backgroundColor: '#ffffffff', backgroundImage: '', backgroundGradient: '', backgroundTransform: {}, opacity: 1, record: {} }
const image = { uuid: 'photo', name: 'Photo', type: 'w-image', parent: '-1', left: 30, top: 30, width: 100, height: 100, imgUrl: 'data:image/png;base64,aW52YWxpZA==', zoom: 1, opacity: 1, rotate: 0, radius: 0, transform: '', mask: '', flip: '', isNinePatch: false, setting: [], record: { width: 100, height: 100, minWidth: 10, minHeight: 10, dir: 'all' } }
const text = { uuid: 'title', name: 'Title', type: 'w-text', parent: '-1', left: 30, top: 30, width: 300, height: 100, text: 'Tiếng Việt', fontClass: { id: 0, value: 'missing-fixture-font', alias: 'Missing', url: '/static/cli-fixture-missing.woff2' }, fontFamily: 'missing-fixture-font', fontSize: 24, lineHeight: 1.2, letterSpacing: 0, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', writingMode: 'horizontal-tb', textDecoration: 'none', color: '#000000ff', opacity: 1, zoom: 1, record: { width: 300, height: 100, minWidth: 0, minHeight: 0, dir: 'horizontal' } }
try {
  for (const [name, layout, code, layerId] of [
    ['image', { global: page, layers: [image] }, 'IMAGE_LOAD_FAILED', 'photo'],
    ['background', { global: { ...page, backgroundImage: '/static/cli-fixture-missing.png' }, layers: [] }, 'BACKGROUND_LOAD_FAILED', '-1'],
    ['font', { global: page, layers: [text] }, 'FONT_LOAD_FAILED', 'title']
  ]) {
    const input = path.join(dir, name + '.json')
    await writeFile(input, JSON.stringify(layout))
    const started = Date.now()
    const result = await run('drafts', 'render', '--input', input, '--output', path.join(dir, name + '.png'))
    report.cases.push({ name, milliseconds: Date.now() - started, ...result })
    assert.notEqual(result.code, 0, name + ' must fail')
    assert(result.data.issues?.some(issue => issue.code === code && issue.layerId === layerId), JSON.stringify(result))
  }
  const fixed = path.join(dir, 'fixed.json')
  await writeFile(fixed, JSON.stringify({ global: page, layers: [] }))
  const result = await run('drafts', 'render', '--input', fixed, '--output', path.join(dir, 'fixed.png'))
  report.fixed = result; assert.equal(result.code, 0, JSON.stringify(result)); report.pass = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally { await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)) }
