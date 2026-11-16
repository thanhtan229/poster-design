import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const calls = []
const server = createServer(async (req, res) => {
  calls.push(req.url)
  if (req.url === '/design/temp?type=0&id=4') { res.statusCode = 500; return res.end(JSON.stringify({ message: 'overflow', issues: [{ code: 'TEXT_OVERFLOW', layerId: 'title', overflowY: 12 }] })) }
  if (req.url === '/api/tinix/collage-templates') return res.end(JSON.stringify({ list: [{ id: 7, name: 'Mẫu thử' }] }))
  if (req.url.startsWith('/design/list?')) return res.end(JSON.stringify({ code: 200, result: { list: [{ id: 3 }] } }))
  if (req.url === '/design/temp?type=0&id=3') return res.end(JSON.stringify({ code: 200, result: { data: JSON.stringify([{ global: { width: 100, height: 100 }, layers: [{ uuid: 'a', left: 0, top: 0, width: 20, height: 20 }] }]) } }))
  if (req.url === '/design/fonts') return res.end(JSON.stringify({ code: 500, msg: 'font error' }))
  if (req.url === '/api/tinix/cutout/birefnet') {
    let body = ''
    for await (const chunk of req) body += chunk.toString()
    assert.match(body, /name="file"/)
    res.setHeader('content-type', 'image/png'); res.setHeader('x-cutout-cache', 'hit'); return res.end('png fixture')
  }
  res.writeHead(404).end('not found')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const dir = await mkdtemp(path.join(os.tmpdir(), 'tinix cli '))
function run(...args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let stdout = '', stderr = ''
    p.stdout.on('data', x => stdout += x); p.stderr.on('data', x => stderr += x)
    p.on('error', reject); p.on('close', code => resolve({ code, stdout, stderr }))
  })
}
try {
  let r = await run('status'); assert.equal(r.code, 0); assert.equal(JSON.parse(r.stdout).birefnet, 'not tested')
  r = await run('templates', 'get', '--kind', 'collage', '--id', '7'); assert.equal(JSON.parse(r.stdout).name, 'Mẫu thử')
  r = await run('templates', 'list', '--page', '2'); assert.equal(JSON.parse(r.stdout).list[0].id, 3)
  r = await run('fonts', 'list'); assert.notEqual(r.code, 0); assert.match(JSON.parse(r.stderr).error, /font error/)
  r = await run('templates', 'get', '--id', 'bad'); assert.notEqual(r.code, 0)
  r = await run('templates', 'get', '--id', '4'); assert.notEqual(r.code, 0)
  assert.deepEqual(JSON.parse(r.stderr).issues, [{ code: 'TEXT_OVERFLOW', layerId: 'title', overflowY: 12 }])
  const draft = path.join(dir, 'draft.json'), operations = path.join(dir, 'ops.json'), changed = path.join(dir, 'changed.json')
  const blank = path.join(dir, 'blank.json')
  r = await run('drafts', 'create', '--width', '600', '--height', '400', '--output', blank); assert.equal(r.code, 0, r.stderr)
  assert.equal(JSON.parse(await readFile(blank, 'utf8')).global.dpi, 300)
  const clone = path.join(dir, 'clone.json')
  r = await run('drafts', 'from-template', '--id', '3', '--output', clone); assert.equal(r.code, 0, r.stderr)
  assert.equal(JSON.parse(await readFile(clone, 'utf8')).layers[0].uuid, 'a')
  r = await run('drafts', 'from-template', '--id', '3', '--output', clone); assert.notEqual(r.code, 0)
  await writeFile(draft, JSON.stringify({ global: { width: 100, height: 100 }, layers: [{ uuid: 'a', left: 0, top: 0, width: 20, height: 20, text: 'old' }] }))
  await writeFile(operations, JSON.stringify([{ action: 'update', id: 'a', changes: { text: 'mới' } }]))
  r = await run('drafts', 'apply', '--input', draft, '--operations', operations, '--output', changed); assert.equal(r.code, 0, r.stderr)
  assert.equal(JSON.parse(await readFile(changed, 'utf8')).layers[0].text, 'mới')
  assert.equal(JSON.parse(await readFile(draft, 'utf8')).layers[0].text, 'old')
  const reordered = path.join(dir, 'reordered.json')
  await writeFile(operations, JSON.stringify([{ action: 'page', changes: { width: 200 } }, { action: 'add', layer: { uuid: 'b', left: 0, top: 0, width: 20, height: 20 } }, { action: 'reorder', ids: ['b', 'a'] }]))
  r = await run('drafts', 'apply', '--input', draft, '--operations', operations, '--output', reordered); assert.equal(r.code, 0, r.stderr)
  const reorderedData = JSON.parse(await readFile(reordered, 'utf8'))
  assert.equal(reorderedData.global.width, 200); assert.deepEqual(reorderedData.layers.map(l => l.uuid), ['b', 'a'])
  r = await run('drafts', 'diff', '--input', draft, '--other', reordered); assert.equal(r.code, 0, r.stderr)
  const diff = JSON.parse(r.stdout); assert(diff.pageChanged); assert(diff.orderChanged); assert.deepEqual(diff.added, ['b']); assert.deepEqual(diff.removed, [])
  const store = path.join(dir, 'history.sqlite'), checkedOut = path.join(dir, 'checked-out.json')
  r = await run('drafts', 'save', '--input', draft, '--store', store, '--expected-version', '0'); assert.equal(r.code, 0, r.stderr); assert.equal(JSON.parse(r.stdout).version, 1)
  r = await run('drafts', 'save', '--input', changed, '--store', store, '--expected-version', '1'); assert.equal(JSON.parse(r.stdout).version, 2)
  r = await run('drafts', 'save', '--input', draft, '--store', store, '--expected-version', '1'); assert.notEqual(r.code, 0); assert.match(r.stderr, /VERSION_CONFLICT/)
  r = await run('drafts', 'restore', '--store', store, '--version', '1', '--expected-version', '2'); assert.equal(r.code, 0, r.stderr); assert.equal(JSON.parse(r.stdout).version, 3)
  r = await run('drafts', 'checkout', '--store', store, '--version', '3', '--output', checkedOut); assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(JSON.parse(await readFile(checkedOut, 'utf8')), JSON.parse(await readFile(draft, 'utf8')))
  r = await run('drafts', 'history', '--store', store); assert.equal(JSON.parse(r.stdout).revisions.length, 3)
  const concurrent = await Promise.all([run('drafts', 'save', '--input', draft, '--store', store, '--expected-version', '3'), run('drafts', 'save', '--input', changed, '--store', store, '--expected-version', '3')])
  assert.equal(concurrent.filter(result => result.code === 0).length, 1)
  assert.equal(concurrent.filter(result => result.code !== 0 && result.stderr.includes('VERSION_CONFLICT')).length, 1)
  r = await run('drafts', 'validate', '--input', changed); assert.equal(JSON.parse(r.stdout).valid, true)
  const invalid = path.join(dir, 'invalid.json')
  await writeFile(invalid, JSON.stringify({ global: { width: 100, height: 100 }, layers: [{ uuid: 'a', type: 'w-image', parent: 'b', linkedPhotoId: 'b', left: 0, top: 0, width: 10, height: 10 }, { uuid: 'b', type: 'w-image', parent: 'a', left: 0, top: 0, width: 10, height: 10 }] }))
  r = await run('drafts', 'validate', '--input', invalid); assert.notEqual(r.code, 0)
  const codes = JSON.parse(r.stdout).issues.map(issue => issue.code)
  assert(codes.includes('PARENT_CYCLE')); assert(codes.includes('INVALID_LINK'))
  const missingAssets = path.join(dir, 'missing-assets.json')
  await writeFile(missingAssets, JSON.stringify({ global: { width: 100, height: 100, backgroundImage: '/static/missing-background.png' }, layers: [{ uuid: 'title', type: 'w-text', left: 0, top: 0, width: 20, height: 20, fontClass: { url: '/static/missing-font.woff2' } }] }))
  r = await run('drafts', 'inspect-assets', '--input', missingAssets); assert.notEqual(r.code, 0)
  const unavailable = JSON.parse(r.stdout).issues.filter(issue => issue.code === 'RESOURCE_UNAVAILABLE')
  assert.equal(unavailable.length, 2); assert.deepEqual(unavailable.map(issue => issue.layerId), ['-1', 'title'])
  await writeFile(operations, JSON.stringify([{ action: 'remove', id: 'missing' }]))
  r = await run('drafts', 'apply', '--input', draft, '--operations', operations, '--output', path.join(dir, 'failed.json')); assert.notEqual(r.code, 0)
  const input = path.join(dir, 'ảnh nguồn.jpg'), output = path.join(dir, 'ảnh tách.png')
  await writeFile(input, 'source fixture')
  r = await run('cutout', 'run', '--input', input, '--output', output); assert.equal(r.code, 0, r.stderr); assert.equal(JSON.parse(r.stdout).cache, 'hit'); assert.equal(await readFile(output, 'utf8'), 'png fixture')
  r = await run('cutout', 'run', '--input', input, '--output', output); assert.notEqual(r.code, 0); assert.equal(await readFile(output, 'utf8'), 'png fixture')
  assert(!calls.some(x => x.includes('/ai/')))
  console.log('PASS CLI: structured results, errors, Unicode paths, BiRefNet and overwrite protection')
} finally { server.close(); await rm(dir, { recursive: true, force: true }) }
