// [TINIX] Verify the real MCP guard and actual before/after render using a synthetic contaminated source.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTinixMcp } from './server.mjs'

const [output, original] = process.argv.slice(2).map(folder => path.resolve(folder))
const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
assert(output, 'Usage: node scripts/tinix-mcp/source-qa-workflow.test.mjs <new-evidence-folder> [local-MCP-root-for-Demo-D]')
await mkdir(output)
const read = async file => JSON.parse(await readFile(file, 'utf8'))
const hash = data => createHash('sha256').update(data).digest('hex')
const auditTool = 'audit_scrapbook_source'
const advance = 'advance_scrapbook_workflow'
const workflowFolder = id => path.join(output, '.workflows', id)
const resultFolder = id => path.join(output, id, 'result')
const base = 'https://files.oaiusercontent.com/poisoned.zip'
let poisonKit
const server = createTinixMcp({ outputRoot: output, fetchFile: async url => {
  assert.equal(String(url), base)
  return new Response(poisonKit)
} })
const client = new Client({ name: 'tinix-source-qa-e2e', version: '1.0' })
const [local, remote] = InMemoryTransport.createLinkedPair()
await server.connect(remote)
await client.connect(local)
const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 250000 })
async function invoke(name, args) {
  const result = await call(name, args)
  assert.ok(!result.isError, JSON.stringify(result.content[0]))
  return result
}
const inspect = async (workflow_id, demo_id) => {
  const result = await invoke(auditTool, { workflow_id, demo_id })
  assert.equal(result.content.filter(item => item.type === 'image').length, 4)
  return result.structuredContent
}

try {
  const donor = randomUUID()
  const prepared = (await invoke('prepare_generated_scrapbook_workflow', {
    request_id: donor, brief: 'Sinh nhật bé gái pastel', skill_version: '1.2.13', demo_count: 2,
    skill_source_sha256: 'be9d6da6777fd4789319abe351d1213ee560ebba2c1c27f24a376516e4f0a0fc',
  })).structuredContent
  const clean = await inspect(donor, 'A')
  assert.equal(clean.status, 'pass')
  assert.equal(clean.sentinels.SUBJECT.outsideMaskPx, 0)
  assert.equal(clean.kitSha256, prepared.demos[0].materialSha256)

  // [TINIX] Simulate a trusted generator having recorded clean provenance for contaminated bytes.
  const parent = randomUUID()
  const folder = workflowFolder(parent)
  const legacy = path.join(folder, 'compositions')
  await mkdir(folder)
  await promisify(execFile)(process.env.TINIX_STUDIO_PYTHON || 'python', ['-B',
    path.resolve('scripts/tinix-mcp/source_qa_test.py'), path.join(workflowFolder(donor), 'compositions'),
    legacy, 'A', 'BACKGROUND', 'visible'], { windowsHide: true })
  const manifestPath = path.join(legacy, 'A.source.json')
  const evidencePaths = [manifestPath, path.join(legacy, 'A/demo.png'), path.join(legacy, 'A/material.zip')]
  const initial = await Promise.all(evidencePaths.map(file => readFile(file)))
  poisonKit = initial[2]
  const diagnosed = (await invoke('build_material_draft', { file: { file_id: 'fixture', file_name: 'poisoned.zip',
    download_url: base } })).structuredContent
  const manifest = JSON.parse(initial[0])
  const inputs = [...new Set([manifest.background, manifest.subject.asset, ...manifest.frames.flatMap(
    layer => [layer.asset, layer.photo]), ...manifest.decorations.map(layer => layer.asset)])].sort()
  const lock = { demoId: 'A', demoSha256: hash(initial[1]), manifestSha256: hash(initial[0]),
    materialSha256: hash(initial[2]), inputs: await Promise.all(inputs.map(async name =>
      [name, hash(await readFile(path.join(legacy, name)))])) }
  const evidence = await Promise.all(['blank.png', 'checker.png'].map(async name =>
    hash(await readFile(path.join(legacy, 'A', name)))))
  const parentState = { workflowId: parent, mode: 'template', generated: true, integrationFixture: true,
    demos: [{ demoId: 'A' }], approvedDemoId: null, currentJobId: diagnosed.jobId,
    qaStatus: 'awaiting_demo', sourceQaRequired: true, sourceReviews: [{ demoId: 'A', status: 'pass', evidence }],
    stepStatus: { prepare: 'done', sourceQa: 'done', approval: 'waiting' }, artifacts: {} }
  const workflowFile = path.join(folder, 'workflow.json')
  const lockFile = path.join(folder, 'locks.json')
  await writeFile(workflowFile, JSON.stringify(parentState), { flag: 'wx' })
  await writeFile(lockFile, JSON.stringify([lock]), { flag: 'wx' })
  const protectedFiles = [...evidencePaths, workflowFile, lockFile]
  const protectedHashes = await Promise.all(protectedFiles.map(async file => hash(await readFile(file))))
  const dirty = await inspect(parent, 'A')
  assert.equal(dirty.status, 'fail')
  assert.ok(dirty.issues.some(i => i.layer === 'BACKGROUND' && i.reason === 'exact_illustration_fragment' && i.provenanceVerified))
  const blocked = await call(advance, { workflow_id: parent, approved_demo_id: 'A' })
  assert.ok(blocked.isError)
  assert.match(blocked.content[0].text, /SOURCE_QA_FAIL/)

  const repairTool = 'repair_scrapbook_source_asset'
  const repair = { workflow_id: parent, demo_id: 'A', layer: 'BACKGROUND', donor_workflow_id: donor, donor_demo_id: 'A',
    donor_layer: 'BACKGROUND', reason: 'Replace the synthetic ghost with a verified generated background.' }
  const rejectedDonor = await call(repairTool, { ...repair, donor_workflow_id: parent })
  assert.ok(rejectedDonor.isError)
  assert.match(rejectedDonor.content[0].text, /SOURCE_QA_FAIL/)

  const repaired = (await invoke(repairTool, repair)).structuredContent
  assert.notEqual(repaired.workflowId, parent)
  assert.equal(repaired.after.status, 'pass', JSON.stringify(repaired.after.issues))
  assert.equal(repaired.before.status, 'fail')
  assert.equal(repaired.revision.approvalRequired, true)
  assert.notEqual(repaired.revision.beforeSha256, repaired.revision.afterSha256)
  assert.equal(repaired.revision.parentDemoSha256, hash(initial[1]))
  const revised = repaired.workflowId
  assert.equal((await read(path.join(workflowFolder(revised), 'workflow.json'))).approvedDemoId, null)
  const request = { workflow_id: revised }
  const built = (await invoke(advance, { ...request, approved_demo_id: 'A' })).structuredContent
  assert.equal(built.qaStatus, 'awaiting_layout_qa', JSON.stringify(built.lastError))
  assert.equal(built.exportSha256, repaired.after.kitSha256)
  const accepted = (await invoke(advance, { ...request, layout_review: {
    job_id: built.currentJobId, status: 'pass', notes: 'Technical smoke with synthetic data only.',
  } })).structuredContent
  assert.equal(accepted.qaStatus, 'passed', JSON.stringify(accepted.qa))
  const after = await inspect(revised, 'A')
  assert.equal(after.status, 'pass')
  assert.deepEqual(await Promise.all(protectedFiles.map(async file => hash(await readFile(file)))), protectedHashes)
  await copyFile(path.join(resultFolder(diagnosed.jobId), 'render.png'), path.join(output, 'before.png'))
  await copyFile(path.join(resultFolder(built.currentJobId), 'render.png'), path.join(output, 'after.png'))
  const [beforePixels, afterPixels] = await Promise.all(['before.png', 'after.png'].map(name =>
    sharp(path.join(output, name)).removeAlpha().raw().toBuffer()))
  assert.equal(beforePixels.length, afterPixels.length)
  assert.notDeepEqual(beforePixels, afterPixels, 'The ghost must be visible in the actual before render')

  let demoD = null
  if (original) {
    const demoWorkflow = '6bc43f19-d854-4136-93c8-04316c1bb0a7'
    const input = path.join(original, '.workflows', demoWorkflow)
    const frozen = path.join(input, 'compositions/D/demo.png')
    const before = hash(await readFile(frozen))
    const service = createTinixMcp({ outputRoot: original })
    const examiner = new Client({ name: 'demo-d-audit', version: '1.0' })
    const [a,b] = InMemoryTransport.createLinkedPair()
    await service.connect(b)
    await examiner.connect(a)
    try {
      const readOnly = await examiner.callTool({ name: auditTool, arguments: { workflow_id: demoWorkflow, demo_id: 'D' } },
        undefined, { timeout: 250000 })
      assert.ok(!readOnly.isError, JSON.stringify(readOnly.content[0]))
      demoD = readOnly.structuredContent
      assert.ok(['uncertain','fail'].includes(demoD.status))
      assert.equal(hash(await readFile(frozen)), before)
    } finally {
      await examiner.close()
      await service.close()
    }
  }
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ clean, dirty, after, demoD,
    originalUnchanged: true, manualApprovalBlocked: true, contaminatedDonorBlocked: true, donor,
    imports: { before: diagnosed.jobId, after: built.currentJobId }, revision: repaired.revision }, null, 2))
  console.log(JSON.stringify({ clean: clean.status, dirty: dirty.status, repaired: after.status, demoD: demoD?.status,
    before: diagnosed.jobId, after: built.currentJobId, parent, donor, revised }))
} finally {
  await client.close()
  await server.close()
}
