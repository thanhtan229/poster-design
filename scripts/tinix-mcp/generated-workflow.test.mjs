// [TINIX] Verify the real MCP inventory, prepare-time export, and immutable ZIP import on localhost.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTinixMcp } from './server.mjs'

const folder = process.argv[2]
assert(folder, 'Usage: node scripts/tinix-mcp/generated-workflow.test.mjs <new-evidence-directory>')
const output = path.resolve(folder)
await mkdir(output)
const bytesById = new Map()
let downloads = 0
const server = createTinixMcp({ outputRoot: output, fetchFile: async url => {
  downloads++
  const bytes = bytesById.get(url.pathname.slice(1))
  assert(bytes)
  return new Response(bytes)
} })
const client = new Client({ name: 'tinix-generated-workflow-e2e', version: '1.0' })
const [local, remote] = InMemoryTransport.createLinkedPair()
await server.connect(remote)
await client.connect(local)

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 250000 })
async function invoke(name, args) {
  const response = await call(name, args)
  assert.ok(!response.isError, JSON.stringify(response.content[0]))
  return response
}
const prepare = 'prepare_generated_scrapbook_workflow'
const advance = 'advance_scrapbook_workflow'
const sourceReview = 'review_scrapbook_template_sources'
const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const base = { brief: 'Sinh nhật bé gái pastel Mixed Handcut', aspect_ratio: '1:1', skill_version: '1.2.13',
  skill_source_sha256: 'be9d6da6777fd4789319abe351d1213ee560ebba2c1c27f24a376516e4f0a0fc' }

async function checkBatch(args, count) {
  const prepared = await invoke(prepare, args)
  const state = prepared.structuredContent
  const directory = path.join(output, '.workflows', state.workflowId, 'compositions')
  assert.equal(prepared.content.filter(item => item.type === 'image').length, count * 3)
  assert.equal(state.qaStatus, 'awaiting_source_qa')
  assert.equal(state.demos.length, count)
  assert.equal(new Set(state.demos.map(demo => demo.demoSha256)).size, count)
  assert.equal(new Set(state.demos.map(demo => demo.materialSha256)).size, count)
  assert.ok(state.batch.kits.every(kit => kit.demoPreviewMs > 0 && kit.kitExportMs > 0))
  const catalog = await json(path.join(directory, 'catalog.json'))
  const byFile = new Map(catalog.assets.map(asset => [asset.file, asset]))
  const poses = new Set()
  for (const { demoId, demoSha256, manifestSha256, materialSha256 } of state.demos) {
    const home = path.join(directory, demoId)
    const source = path.join(directory, demoId + '.source.json')
    assert.equal(hash(await readFile(source)), manifestSha256)
    assert.equal(hash(await readFile(path.join(home, 'demo.png'))), demoSha256)
    assert.equal(hash(await readFile(path.join(home, 'material.zip'))), materialSha256)
    const manifest = await json(source)
    assert.deepEqual(manifest.illustrationHashes, state.batch.illustrationHashes)
    assert.equal(manifest.frames.length, 6)
    assert.equal(byFile.get(manifest.subject.asset).style, 'SUBJECT')
    const z = [...manifest.frames, ...manifest.decorations, manifest.subject].map(layer => layer.z)
    assert.ok(z.every(Number.isInteger))
    assert.equal(new Set(z).size, z.length)
    for (const frame of manifest.frames) {
      assert.equal(byFile.get(frame.asset).alpha, 'closed-window')
      assert.equal(byFile.get(frame.asset).whiteCutline, 'white')
      assert.equal(byFile.get(frame.photo).style, frame.code)
    }
    for (const name of [manifest.background, ...[...manifest.frames, ...manifest.decorations].map(layer => layer.asset)]) {
      assert.equal(byFile.get(name).previewOnly, false)
      assert.ok(!Object.values(manifest.illustrationHashes).includes(hash(await readFile(path.join(directory, name)))))
    }
    assert.deepEqual((await readdir(path.join(home, 'material'))).sort(),
      ['01_anh_mau.png', '02_nen_sach.png', '03_so_do_bo_cuc.png', '04_tam_manh_RGBA.png', 'layout.json'])
    const qa = await json(path.join(home, 'qa', 'tinixposter_qa.json'))
    assert.equal(qa.subject_count, 1)
    assert.equal(Object.keys(qa.enclosed_windows_alpha_zero).length, 6)
    assert.ok(qa.min_bounding_box_gap_px >= 12)
    assert.deepEqual(Object.values(qa.components_by_alpha), Array(4).fill(qa.pieces))
    assert.ok(qa.render_pixel_identical_from_json)
    poses.add(JSON.stringify(manifest.frames.map(fr => fr.target)))
  }
  assert.equal(poses.size, count)
  return { state, directory, catalog }
}

// [TINIX] Exercise the old customer workflow with synthetic inputs and a stub at the BiRefNet boundary.
async function checkOldCustomer(source) {
  const sourceZip = path.join(output, 'legacy-customer-source.zip')
  const zipScript = [
    'from pathlib import Path',
    'from zipfile import ZipFile, ZIP_DEFLATED',
    'import sys',
    'folder = Path(sys.argv[1])',
    'with ZipFile(sys.argv[2], "x", ZIP_DEFLATED) as out:',
    ' for code in "ABC": out.write(folder / (code + ".source.json"), code + ".json")',
    ' for asset in (folder / "assets").glob("*.png"): out.write(asset, "assets/" + asset.name)',
  ].join('\n')
  await promisify(execFile)(process.env.TINIX_STUDIO_PYTHON || 'python',
    ['-B', '-c', zipScript, source, sourceZip], { windowsHide: true })
  bytesById.set('composition', await readFile(sourceZip))
  const cutout = bytesById.get('SUBJECT')
  bytesById.set('original', await sharp(cutout).flatten({background:'#eae4d5'}).png().toBuffer())
  const attachment = (id, ext = 'png') => ({ file_id: id, file_name: id + '.' + ext,
    download_url: 'https://files.oaiusercontent.com/' + id })
  const originalFetch = globalThis.fetch
  globalThis.fetch = (url, options) => String(url) === 'http://127.0.0.1:7001/api/tinix/cutout/birefnet'
    ? Promise.resolve(new Response(cutout, { headers: { 'Content-Type': 'image/png' } }))
    : originalFetch(url, options)
  try {
    const { workflowId } = (await invoke('prepare_scrapbook_workflow', { request_id: randomUUID(),
      compositions: attachment('composition', 'zip'),
      photos: [...bytesById.keys()].filter(code => /^F0[1-6]$/.test(code)).map(code => attachment(code)),
      subject: attachment('original') })).structuredContent
    const run = { workflow_id: workflowId }
    const draft = (await invoke(advance, { ...run, approved_demo_id: 'B' })).structuredContent
    assert.equal(draft.qaStatus, 'awaiting_layout_qa', JSON.stringify(draft.lastError))
    const filled = (await invoke(advance, { ...run, layout_review: { job_id: draft.currentJobId, status: 'pass',
      notes: 'Technical smoke with synthetic inputs.' } })).structuredContent
    assert.equal(filled.qaStatus, 'awaiting_visual_qa', JSON.stringify(filled.lastError))
    assert.equal(filled.cropRows.length, 6)
    const result = (await invoke('get_material_draft_render', { job_id: filled.currentJobId })).structuredContent
    assert.equal(result.subjectIndependent, true)
    assert.equal(result.photoSlots.length, 6)
    return { workflowId, filledJobId: filled.currentJobId, cropRows: filled.cropRows.length, cutout: 'stub' }
  } finally { globalThis.fetch = originalFetch }
}

try {
  const previous = await json(new URL('./evidence/p0/mcp-local-tools.json', import.meta.url))
  const { tools } = await client.listTools()
  assert.equal(client.getServerVersion().version, '1.3.0') // [TINIX]
  assert.equal(new Set(tools.map(tool => tool.name)).size, 18) // [TINIX]
  for (const old of previous) assert.deepEqual(tools.find(tool => tool.name === old.name), old, old.name)
  assert.ok(tools.some(tool => tool.name === prepare))
  assert.ok((await call(prepare, { ...base, request_id: randomUUID(), skill_version: '1.2.6' })).isError)
  const first = { ...base, request_id: randomUUID() }
  const three = await checkBatch(first, 3)
  const { workflowId } = three.state
  assert.equal(three.state.batch.upstreamAiCalls, 0)
  assert.equal(downloads, 0)
  assert.deepEqual((await invoke(prepare, first)).structuredContent, three.state)
  assert.ok((await call(prepare, { ...first, brief: 'Changed' })).isError)
  assert.ok((await call(advance, { workflow_id: workflowId, approved_demo_id: 'B' })).isError)
  const inputs = three.catalog.assets.filter(asset => asset.previewOnly)
  for (const asset of inputs) bytesById.set(asset.style, await readFile(path.join(three.directory, asset.file)))
  const four = await checkBatch({ ...base, request_id: randomUUID(), demo_count: 4,
    illustrations: inputs.map(asset => ({ file_id: asset.style, file_name: asset.style + '.png',
      download_url: 'https://files.oaiusercontent.com/' + asset.style })) }, 4)
  assert.equal(four.state.batch.upstreamAiCalls, null)
  assert.equal(downloads, 7)
  assert.deepEqual(await readdir(output), ['.workflows'])

  const reviews = three.state.demos.map(({ demoId }) => ({ demo_id: demoId, status: 'pass',
    notes: 'Synthetic fixture only. Structural checks verified and blank/checker evidence available.' }))
  const selected = path.join(three.directory, 'B', 'material.zip')
  const exact = await readFile(selected)
  try {
    await writeFile(selected, Buffer.concat([exact, Buffer.from('changed')]))
    const tampered = await call(sourceReview, { workflow_id: workflowId, reviews })
    assert.ok(tampered.isError)
    assert.match(tampered.content[0].text, /thay đổi/)
  } finally {
    await writeFile(selected, exact)
  }
  await invoke(sourceReview, { workflow_id: workflowId, reviews })
  const built = (await invoke(advance, { workflow_id: workflowId, approved_demo_id: 'B' })).structuredContent
  assert.equal(built.qaStatus, 'awaiting_layout_qa', JSON.stringify(built.lastError))
  assert.equal(built.exportSha256, hash(exact))
  assert.deepEqual(await readFile(selected), exact)
  const jobResults = path.join(output, built.currentJobId, 'result')
  const report = await json(path.join(jobResults, 'report.json'))
  assert.equal(report.status, 'rendered')
  assert.equal(report.sourceKitSha256, hash(exact))
  assert.deepEqual((await readdir(output)).filter(item => !item.startsWith('.')), [built.currentJobId]) // [TINIX]
  const stored = (await invoke('get_material_draft_render', { job_id: built.currentJobId })).structuredContent
  assert.equal(stored.subjectIndependent, true)
  assert.equal(stored.photoSlots.length, 6)
  const done = (await invoke(advance, { workflow_id: workflowId, layout_review: {
    job_id: built.currentJobId, status: 'pass', notes: 'Synthetic integration fixture covers technical delivery only.',
  } })).structuredContent
  assert.equal(done.qaStatus, 'passed', JSON.stringify(done.lastError ?? done.qa))
  const kit = await invoke('get_scrapbook_workflow', { workflow_id: workflowId, artifact: 'materials_zip' })
  assert.deepEqual(Buffer.from(kit.content.find(item => item.type === 'resource').resource.blob, 'base64'), exact)
  const legacyCustomer = await checkOldCustomer(three.directory)
  const result = { three: three.state, four: four.state, installedMcpTools: tools.length,
    selectedDemo: 'B', jobId: built.currentJobId, importedKitSha256: hash(exact), render: path.join(jobResults, 'render.png'),
    legacyCustomer }
  await writeFile(path.join(output, 'test-report.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ status: 'passed', workflows: [workflowId, four.state.workflowId],
    jobId: built.currentJobId, selected: 'B', kitSha256: hash(exact), downloads, legacyCustomer }))
} finally {
  await client.close()
  await server.close()
}
