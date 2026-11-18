import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001'
const dir = await mkdtemp(path.join(os.tmpdir(), 'tinix-cli-live-'))
let id
function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...args, '--url', base])
    let out = '', err = ''
    child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b)
    child.on('error', reject); child.on('close', code => code ? reject(new Error(err)) : resolve(JSON.parse(out)))
  })
}
try {
  const list = await run('templates', 'list', '--kind', 'standard', '--page-size', '1')
  assert(list.list.length, 'A standard template fixture is required')
  const template = await run('templates', 'get', '--id', String(list.list[0].id))
  const layout = JSON.parse(template.data)[0]
  const raised = layout.layers.find(layer => layer.type === 'w-image' && layer.width < layout.global.width && layer.height < layout.global.height)
  assert(raised, 'Fixture needs an image smaller than the page')
  raised.printRole = 'raised'
  const input = path.join(dir, 'draft.json'), image = path.join(dir, 'preview.png')
  await writeFile(input, JSON.stringify(layout))
  const validation = await run('drafts', 'validate', '--input', input)
  assert(validation.valid)
  const saved = await run('designs', 'create', '--input', input, '--title', 'CLI temporary verification')
  id = saved.id; assert(id)
  console.error('Testing preview render')
  await run('designs', 'render', '--id', String(id), '--width', String(layout.global.width), '--height', String(layout.global.height), '--output', image)
  const bytes = await readFile(image); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  console.error('Testing collage export')
  const bundle = await run('collage', 'export', '--id', String(id), '--directory', path.join(dir, 'export'))
  assert(bundle.files.length >= 3, 'Expected base, cut sheet and finished image')
  for (const file of bundle.files) assert.equal((await readFile(file)).subarray(0, 2).toString('hex'), 'ffd8')
  console.log(JSON.stringify({ pass: true, images: bundle.files.length, warnings: bundle.issues }))
} finally {
  if (id) {
    const r = await fetch(base + '/design/poster/del', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    const body = await r.json(); if (body.code !== 200) console.error('Could not delete temporary design', id, body)
  }
  await rm(dir, { recursive: true, force: true })
}
