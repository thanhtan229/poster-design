// [TINIX] Exercise real MCP discovery and persistent rejected operations without a renderer or approved ZIP.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTinixMcp } from './server.mjs'

test('discovery, version verification and no replay with a different payload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tinix-p3-contract-'))
  const archive = path.join(root, 'source.zip')
  await writeFile(archive, 'wrong archive')
  const previous = process.env.TINIX_STUDIO_SKILL_ARCHIVE
  process.env.TINIX_STUDIO_SKILL_ARCHIVE = archive
  const server = createTinixMcp({ outputRoot: root })
  const client = new Client({ name: 'p3-ci', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(b)
    await client.connect(a)
    const { tools } = await client.listTools()
    assert.equal(client.getServerVersion().version, '1.3.0')
    assert.equal(new Set(tools.map(tool => tool.name)).size, 18)
    const name = 'orchestrate_scrapbook_workflow'
    const old = JSON.parse(await readFile(new URL('./evidence/p0/mcp-local-tools.json', import.meta.url), 'utf8'))
    for (const tool of old) assert.deepEqual(tools.find(row => row.name === tool.name), tool)
    assert.deepEqual(tools.find(tool => tool.name === name).inputSchema.required,
      ['action', 'workflow_id', 'operation_id'])
    const ids = { workflow_id: randomUUID(), operation_id: randomUUID() }
    const call = args => client.callTool({ name, arguments: { ...ids, ...args } })
    const rejected = await call({ action: 'prepare', brief: 'Synthetic test' })
    assert.equal(rejected.isError, true)
    assert.match(rejected.content[0].text, /SKILL_SOURCE_MISMATCH/)
    const status = await call({ action: 'status' })
    assert.equal(status.structuredContent.operation.status, 'error')
    const reused = await call({ action: 'prepare', brief: 'Different brief' })
    assert.equal(reused.isError, true)
    assert.match(reused.content[0].text, /OPERATION_ID_REUSED/)
  } finally {
    await client.close()
    await server.close()
    if (previous === undefined) delete process.env.TINIX_STUDIO_SKILL_ARCHIVE
    else process.env.TINIX_STUDIO_SKILL_ARCHIVE = previous
    await rm(root, { recursive: true, force: true })
  }
})

// [TINIX] A visually reviewed but geometrically invalid candidate cannot receive a pass.
test('source QA pass does not bypass the Mixed Handcut geometry gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tinix-style-contract-'))
  const workflowId = randomUUID()
  const home = path.join(root, '.workflows', workflowId)
  await mkdir(home, { recursive: true })
  await writeFile(path.join(home, 'workflow.json'), JSON.stringify({
    workflowId, sourceQaRequired: true, orchestration: 3,
    demos: [{ demoId: 'A' }], sourceScreen: { A: { status: 'pass', mixedHandcutGeometry: { status: 'fail' } } },
  }))
  await writeFile(path.join(home, 'locks.json'), '[{"demoId":"A"}]')
  const server = createTinixMcp({ outputRoot: root })
  const client = new Client({ name: 'p4-ci', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(b)
    await client.connect(a)
    const rejected = await client.callTool({ name: 'orchestrate_scrapbook_workflow', arguments: {
      action: 'review_sources', workflow_id: workflowId, operation_id: randomUUID(),
      reviews: [{ demo_id: 'A', status: 'pass', notes: 'Test a false visual pass' }],
    } })
    assert.equal(rejected.isError, true)
    assert.match(rejected.content[0].text, /MIXED_HANDCUT_GEOMETRY_BLOCKED: A/)
    assert.equal(JSON.parse(await readFile(path.join(home, 'workflow.json'), 'utf8')).sourceReviews, undefined)
  } finally {
    await client.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})

// [TINIX] Returning the locked candidate is read-only, and an old kit hash cannot allocate a job.
test('embroidery candidate bytes and approval stay bound to the same SHA-256', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tinix-lace-contract-'))
  const workflowId = randomUUID()
  const home = path.join(root, '.workflows', workflowId)
  const kitFile = path.join(home, 'compositions', 'B', 'material.zip')
  await mkdir(path.dirname(kitFile), { recursive: true })
  const sha = value => createHash('sha256').update(value).digest('hex')
  const kit = Buffer.from('new kit fixture')
  const legacy = Buffer.from('old kit fixture')
  await writeFile(kitFile, kit)
  const candidate = { workflowId, orchestration: 3, mode: 'template', generated: true, laceStyle: 'embroidered_pastel',
    skillProof: { version: '1.2.13' }, // Fixture represents a previously verified prepare.
    sourceScreen: { B: { status: 'pass', mixedHandcutGeometry: { status: 'pass' } } },
    demos: [{ demoId: 'B', materialSha256: sha(kit), reviewImageSha256: [] }],
    approvedDemoId: null, currentJobId: null }
  const state = path.join(home, 'workflow.json')
  await writeFile(state, JSON.stringify(candidate))
  const server = createTinixMcp({ outputRoot: root })
  const client = new Client({ name: 'p4-lace-ci', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const call = args => client.callTool({ name: 'orchestrate_scrapbook_workflow',
    arguments: { workflow_id: workflowId, operation_id: randomUUID(), ...args } })
  const read = () => call({ action: 'preview_artifact', demo_id: 'B', preview_kind: 'materials_zip' })
  const advance = expected_material_sha256 => call({ action: 'advance', approved_demo_id: 'B', expected_material_sha256 })
  try {
    await server.connect(b)
    await client.connect(a)
    const preview = await read()
    assert.equal(preview.structuredContent.sha256, sha(kit))
    assert.deepEqual(Buffer.from(preview.content[1].resource.blob, 'base64'), kit)
    assert.match((await advance(sha(legacy))).content[0].text, /APPROVED_KIT_HASH_MISMATCH/)
    await writeFile(kitFile, legacy)
    assert.match((await read()).content[0].text, /CANDIDATE_ARTIFACT_HASH_MISMATCH/)
    assert.match((await advance(sha(kit))).content[0].text, /APPROVED_KIT_HASH_MISMATCH/)
    const donorId = randomUUID()
    const donorHome = path.join(root, '.workflows', donorId)
    await mkdir(donorHome)
    await writeFile(path.join(donorHome, 'workflow.json'), JSON.stringify({ demos: [{ demoId: 'B' }] }))
    const repair = await call({ action: 'repair', demo_id: 'B', layer: 'D04',
      donor_workflow_id: donorId, donor_demo_id: 'B', donor_layer: 'D04', reason: 'Test old lace identity' })
    assert.equal(repair.structuredContent.qaStatus, 'blocked')
    assert.match(repair.structuredContent.reason, /REPAIR_BLOCKED/)
    assert.deepEqual(JSON.parse(await readFile(state, 'utf8')), candidate)
  } finally {
    await client.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
