// [TINIX] Exercise the template workflow through MCP using a local composition ZIP.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTinixMcp } from './server.mjs'

const fixture = process.argv[2]
if (!fixture) throw new Error('Usage: node scripts/tinix-mcp/template-workflow.test.mjs <fixture-directory>')
const root = path.join(fixture, 'jobs')
await mkdir(root, { recursive: true })
const source = await readFile(path.join(fixture, 'source.zip'))
const workflowId = randomUUID()
const server = createTinixMcp({ outputRoot: root, fetchFile: async () => new Response(source) })
const client = new Client({ name: 'template-workflow-e2e', version: '1.0' })
const [local, remote] = InMemoryTransport.createLinkedPair()
await server.connect(remote)
await client.connect(local)

async function call(name, args, expectError = false) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 240000 })
  assert.equal(Boolean(result.isError), expectError, JSON.stringify(result.content[0]))
  return result
}

const prepare = 'prepare_scrapbook_workflow'
const advance = 'advance_scrapbook_workflow'
const folder = path.join(root, '.workflows', workflowId)
const packagePath = demo => path.join(folder, 'compositions', demo, 'material.zip')
const args = { request_id: workflowId, mode: 'template', aspect_ratio: '1:1', demo_count: 4, brief: 'Square birthday',
  compositions: { file_id: 'source', file_name: 'source.zip', download_url: 'https://files.oaiusercontent.com/source.zip' } }
const run = { workflow_id: workflowId }
try {
  const initial = await call(prepare, args)
  assert.equal(initial.content.filter(item => item.type === 'image').length, 12)
  assert.equal(initial.structuredContent.qaStatus, 'awaiting_source_qa')
  assert.equal(new Set(initial.structuredContent.demos.map(item => item.demoSha256)).size, 4)
  for (const demo of ['A', 'B', 'C', 'D']) await assert.rejects(access(packagePath(demo)), { code: 'ENOENT' })
  assert.deepEqual((await call(prepare, args)).structuredContent, initial.structuredContent)
  await call(prepare, { ...args, demo_count: 3 }, true)
  await call(advance, { ...run, approved_demo_id: 'D' }, true)
  const reviewed = await call('review_scrapbook_template_sources', { ...run,
    reviews: ['A', 'B', 'C', 'D'].map(demo_id => ({
      demo_id, status: demo_id === 'A' ? 'fail' : 'pass', notes: 'Fixture checks source QA gating.',
    })) })
  assert.equal(reviewed.structuredContent.qaStatus, 'awaiting_demo')
  await call(advance, { ...run, approved_demo_id: 'A' }, true)
  const review = (await call(advance, { ...run, approved_demo_id: 'D' })).structuredContent
  assert.equal(review.qaStatus, 'awaiting_layout_qa', JSON.stringify(review.lastError))
  const id = review.currentJobId
  for (const demo of ['A', 'B', 'C']) await assert.rejects(access(packagePath(demo)), { code: 'ENOENT' })
  await access(packagePath('D'))
  await call(advance, { ...run, approved_demo_id: 'B' }, true)
  const compared = JSON.parse(await readFile(path.join(folder, 'comparison.json'), 'utf8'))
  assert.equal(compared.approvedDemoSha256, initial.structuredContent.demos[3].demoSha256)
  assert.ok(compared.excluded.photoAndSubjectPixels > 0)
  const uncertain = (await call(advance, { ...run, layout_review: { job_id: id,
    status: 'uncertain', notes: 'Gate regression check.' } })).structuredContent
  assert.equal(uncertain.qaStatus, 'exception')
  assert.equal(uncertain.artifacts.final_render, undefined)
  const delivery = (await call(advance, { ...run, layout_review: { job_id: id,
    status: 'pass', notes: 'Synthetic fixture: compare paper, title and six frame silhouettes outside placeholder regions.' } })).structuredContent
  assert.equal(delivery.qaStatus, 'passed', JSON.stringify(delivery.lastError ?? delivery.qa))
  assert.equal(delivery.stepStatus.fill, undefined)
  assert.equal(delivery.stepStatus.cropReview, undefined)
  assert.equal(delivery.currentJobId, id)
  const state = (await call(advance, run)).structuredContent
  assert.equal(state.currentJobId, id)
  const filenames = { final_render: 'placeholder.png', materials_zip: 'material.zip', comparison: 'comparison.png', qa_report: 'qa.json' }
  for (const [artifact, filename] of Object.entries(filenames)) {
    const result = await call('get_scrapbook_workflow', { ...run, artifact })
    const bytes = Buffer.from(result.content.find(item => item.type === 'resource').resource.blob, 'base64')
    assert.equal(bytes.length, result.structuredContent.bytes)
    await writeFile(path.join(fixture, filename), bytes)
  }
  const lockedDemo = path.join(folder, 'compositions', 'D', 'demo.png')
  const approvedBytes = await readFile(lockedDemo)
  try {
    await writeFile(lockedDemo, Buffer.concat([approvedBytes, Buffer.from('changed')]))
    const blocked = await call(advance, run, true)
    assert.match(blocked.content[0].text, /đã khóa bị thay đổi/)
  } finally {
    await writeFile(lockedDemo, approvedBytes)
  }
  console.log(JSON.stringify({ workflowId, jobId: id, status: state.qaStatus, overall: compared.overall,
    demoCount: state.demos.length, selected: state.approvedDemoId }))
} finally {
  await client.close()
  await server.close()
}
