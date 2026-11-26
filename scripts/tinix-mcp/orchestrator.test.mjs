// [TINIX] Exercise orchestration across sessions and a retry against the real local renderer.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTinixMcp } from './server.mjs'
import { runScrapbookWorkflow } from './scrapbook-workflow.mjs'

assert(process.argv[2], 'Usage: node scripts/tinix-mcp/orchestrator.test.mjs <new-output-directory> [P2 fixture MCP root]')
const output = path.resolve(process.argv[2])
const fixture = process.argv[3] && path.resolve(process.argv[3])
await mkdir(output)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async name => JSON.parse(await readFile(name, 'utf8'))
const orchestrator = 'orchestrate_scrapbook_workflow'
const workflowId = randomUUID()
const folder = path.join(output, '.workflows', workflowId)
const op = (action, fields) => ({ action, workflow_id: workflowId, operation_id: randomUUID(), ...fields })

async function connect(outputRoot = output) {
  const server = createTinixMcp({ outputRoot })
  const client = new Client({ name: 'tinix-p3-regression', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(b)
  await client.connect(a)
  return { client, close: async () => { await client.close(); await server.close() } }
}

async function invoke(client, name, args, error) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300000 })
  if (error) {
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, error)
  } else assert.ok(!result.isError, JSON.stringify(result.content[0]))
  return result
}

let session = await connect()
try {
  const inventory = await session.client.listTools()
  assert.equal(new Set(inventory.tools.map(tool => tool.name)).size, 19) // P3 + export_material_draft
  assert.ok(inventory.tools.some(tool => tool.name === 'export_material_draft'))
  assert.equal(session.client.getServerVersion().version, '1.3.0')
  const start = op('prepare', { brief: 'Sinh nhật bé gái, giấy pastel Mixed Handcut' })
  const savedEnv = process.env.TINIX_STUDIO_SKILL_ARCHIVE
  const fake = path.join(output, 'unapproved-skill.zip')
  await writeFile(fake, 'unapproved')
  try {
    process.env.TINIX_STUDIO_SKILL_ARCHIVE = fake
    await invoke(session.client, orchestrator, start, /SKILL_SOURCE_MISMATCH/)
    const status = (await invoke(session.client, orchestrator, { ...op('status'),
      operation_id: start.operation_id })).structuredContent
    assert.equal(status.operation.status, 'error')
  } finally {
    if (savedEnv === undefined) delete process.env.TINIX_STUDIO_SKILL_ARCHIVE
    else process.env.TINIX_STUDIO_SKILL_ARCHIVE = savedEnv
  }
  const prepared = await invoke(session.client, orchestrator, start)
  const state = prepared.structuredContent
  assert.equal(state.skillProof.verifiedBy, 'host_archive_sha256')
  assert.equal(state.skillProof.clientSkill, 'not_verified')
  assert.equal(state.demos.length, 3)
  assert.equal(prepared.content.filter(item => item.type === 'image').length, 9)
  assert.ok(Object.values(state.sourceScreen).every(row => row.status === 'pass'))
  const kits = await Promise.all(state.demos.map(async demo => {
    const file = path.join(folder, 'compositions', demo.demoId, 'material.zip')
    const bytes = await readFile(file)
    assert.equal(hash(bytes), demo.materialSha256)
    return bytes
  }))
  assert.equal((await readdir(output)).filter(name => /^[a-f0-9-]{36}$/.test(name)).length, 0)
  const choose = op('advance', { approved_demo_id: 'B' })
  await invoke(session.client, orchestrator, choose, /chưa qua kiểm nguồn/)
  await session.close()
  session = await connect()
  assert.deepEqual((await invoke(session.client, orchestrator, op('status'))).structuredContent.demos, state.demos)
  await invoke(session.client, orchestrator, { ...start, brief: 'Changed' }, /OPERATION_ID_REUSED/)
  const duplicate = (await invoke(session.client, orchestrator, start)).structuredContent
  assert.deepEqual(duplicate.demos, state.demos)
  assert.deepEqual(duplicate.batch, state.batch)
  const reviews = state.demos.map(({ demoId }) => ({ demo_id: demoId, status: 'pass',
    notes: 'Synthetic evidence only. White cutline and subject checked in source previews.' }))
  await invoke(session.client, orchestrator, op('review_sources', { reviews }))

  // Inject one HTTP 408 at the renderer adapter boundary; the retry calls the real CLI and renderer.
  let injected = 0
  const retrying = await runScrapbookWorkflow(output, orchestrator, choose, AbortSignal.timeout(180000), {
    build: async () => { injected++; throw new Error('Injected HTTP 408') },
  })
  assert.equal(injected, 1)
  assert.equal(retrying.structuredContent.qaStatus, 'retryable_error')
  const reserved = retrying.structuredContent.importJobId
  assert(reserved)
  const built = (await invoke(session.client, orchestrator, choose)).structuredContent
  assert.equal(built.qaStatus, 'awaiting_layout_qa', JSON.stringify(built.lastError))
  assert.equal(built.currentJobId, reserved)
  assert.equal(built.exportSha256, hash(kits[1]))
  assert.equal((await invoke(session.client, orchestrator, choose)).structuredContent.currentJobId, reserved)
  assert.deepEqual((await readdir(output)).filter(name => /^[a-f0-9-]{36}$/.test(name)), [reserved])
  const finish = op('advance', { layout_review: { job_id: reserved, status: 'pass',
    notes: 'Synthetic fixture, technical gate only. Not commercial artwork approval.' } })
  const completed = (await invoke(session.client, orchestrator, finish)).structuredContent
  assert.equal(completed.qaStatus, 'passed', JSON.stringify(completed.lastError ?? completed.qa))
  assert.equal(completed.delivery.length, 4)
  for (const artifact of completed.delivery) {
    const downloaded = await invoke(session.client, 'get_scrapbook_workflow',
      { workflow_id: workflowId, artifact: artifact.artifact })
    const bytes = Buffer.from(downloaded.content.find(item => item.type === 'resource').resource.blob, 'base64')
    assert.equal(hash(bytes), artifact.sha256)
    assert.equal(bytes.length, artifact.bytes)
    if (artifact.artifact === 'materials_zip') assert.deepEqual(bytes, kits[1])
  }
  let repair = null
  if (fixture) {
    // Copy only the synthetic contaminated workflow. The parent in the original runtime remains untouched.
    const { cp } = await import('node:fs/promises')
    const parent = '79fb93c1-ea3d-4ca7-92dc-dcc1b6590908'
    const relative = path.join('.workflows', parent)
    await cp(path.join(fixture, relative), path.join(output, relative), { recursive: true, force: false, errorOnExist: true })
    const parentFolder = path.join(output, relative)
    const names = ['workflow.json', 'locks.json', 'compositions/A.source.json', 'compositions/A/material.zip']
    const fingerprints = () => Promise.all(names.map(async file => hash(await readFile(path.join(parentFolder, file)))))
    const before = await fingerprints()
    const bad = (await invoke(session.client, 'audit_scrapbook_source', { workflow_id: parent, demo_id: 'A' })).structuredContent
    assert.equal(bad.status, 'fail')
    await invoke(session.client, 'advance_scrapbook_workflow', { workflow_id: parent, approved_demo_id: 'A' }, /SOURCE_QA_FAIL/)
    const request = op('repair', { workflow_id: parent, demo_id: 'A', layer: 'BACKGROUND', donor_workflow_id: workflowId,
      donor_demo_id: 'A', donor_layer: 'BACKGROUND', reason: 'Replace the known synthetic ghost.' })
    const rejected = (await invoke(session.client, orchestrator,
      { ...request, operation_id: randomUUID(), donor_workflow_id: parent })).structuredContent
    assert.equal(rejected.qaStatus, 'blocked')
    const revised = (await invoke(session.client, orchestrator, request)).structuredContent
    assert.equal(revised.workflowId, request.operation_id)
    assert.equal(revised.qaStatus, 'awaiting_demo')
    assert.equal(revised.approvedDemoId, null)
    assert.equal(revised.after.status, 'pass')
    assert.equal((await invoke(session.client, orchestrator, request)).structuredContent.workflowId, revised.workflowId)
    assert.deepEqual(await fingerprints(), before)
    repair = { parentWorkflowId: parent, revisionId: revised.workflowId, before: bad.status, after: revised.after.status }
  }
  const result = { workflowId, jobId: reserved, selected: 'B', delivery: completed.delivery, demos: state.demos,
    renderer: 'real-local', retryInjection: 'HTTP 408 at build adapter', distinctJobsForSelection: 1,
    upstreamAiCalls: state.batch.upstreamAiCalls, restart: 'MCP sessions recreated', repair }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally { await session.close() }
