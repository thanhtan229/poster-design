// [TINIX] Read-only production boundary, real MCP prepare and self-cleaning synthetic QA.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('../../', import.meta.url))
const toolName = 'orchestrate_scrapbook_workflow'
const lace = 'embroidered_pastel'
const runtimeMarkers = ['mcp-material', 'secure-mcp-tunnel']
const blockedEnv = ['TINIX_APP_URL', 'TINIX_DB', 'TINIX_STATIC_DIR', 'TINIX_BACKUP_DIR', 'TINIX_MCP_OUTPUT_ROOT']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const rounded = ms => Math.round(ms)
const readJson = async file => JSON.parse(await readFile(file, 'utf8'))
const run = (cmd, args, timeout = 10000) => exec(cmd, args, { cwd: repo, timeout, windowsHide: true })
const git = async (...args) => (await run('git', args)).stdout.trim()
const exists = pathname => lstat(pathname).then(() => true, err => {
  if (err.code !== 'ENOENT') throw err
  return false
})
const normalize = p => process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p)
function contains(parent, child) {
  const rel = path.relative(normalize(parent), normalize(child))
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep))
}

export function assertIsolation({ checkout, primary, parent, worktrees, argv = [], env = {}, runtime = [] }) {
  assert.equal(argv.length, 0, 'Quick preflight takes no paths, endpoints or job IDs')
  assert(!blockedEnv.some(key => env[key]), 'Unset renderer and runtime overrides for the renderer-free preflight')
  assert(checkout && primary && !contains(primary, checkout) && !contains(checkout, primary),
    'Run in a linked worktree outside the primary checkout')
  assert(runtime.length === 0, 'The linked worktree already has a Materials runtime or tunnel')
  assert(!worktrees.some(tree => contains(tree, parent) || contains(parent, tree)),
    'QA temporary parent overlaps a repository worktree')
}

function canonicalJson(value) {
  return JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]))
    : entry)
}

export function verifyCatalog({ tools, nextCursor }, baseline, version) {
  assert.equal(version, '1.3.0', 'Unexpected MCP server version')
  assert(!nextCursor, 'Catalog unexpectedly paginated')
  assert.equal(Object.keys(baseline.tools).length, 18, 'Invalid P4 contract fixture')
  const byName = new Map(tools.map(tool => [tool.name, tool]))
  assert.equal(tools.length, 19, 'Expected exactly 19 MCP tools')
  assert.equal(byName.size, 19, 'Duplicate tool name')
  for (const [name, expected] of Object.entries(baseline.tools)) {
    assert(byName.has(name), 'Missing P4 tool ' + name)
    assert.equal(sha(canonicalJson(byName.get(name))), expected, 'P4 contract mismatch for ' + name)
  }
  const exporter = byName.get('export_material_draft')
  assert(exporter, 'Missing material exporter')
  assert.deepEqual(exporter.inputSchema.required, ['job_id'])
  assert.deepEqual(exporter._meta['openai/fileParams'], ['source_material'])
  assert.deepEqual(exporter.inputSchema.properties.source_material.required, ['file_id', 'download_url'])
  assert.equal(exporter.inputSchema.properties.job_id.pattern, '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
  const names = [...byName.keys()].sort()
  return { version, names, baselineCommit: baseline.baselineCommit, sha256: sha(canonicalJson(names.map(name => byName.get(name)))) }
}

export function verifyPreview(result, expected, disk) {
  const { structuredContent: meta, content } = result
  assert(!result.isError && meta, 'MCP preview rejected')
  const resources = content.filter(item => item.type === 'resource')
  assert.equal(resources.length, 1)
  const { mimeType, blob } = resources[0].resource
  assert.equal(mimeType, 'application/zip')
  assert.equal(meta.artifact, 'materials_zip')
  for (const key of ['workflowId', 'demoId', 'laceStyle', 'sha256']) assert.equal(meta[key], expected[key], 'Preview metadata ' + key)
  assert.equal(typeof blob, 'string')
  const bytes = Buffer.from(blob, 'base64')
  assert.equal(bytes.toString('base64'), blob, 'Invalid ZIP resource encoding')
  assert.equal(bytes.length, meta.bytes, 'ZIP length mismatch')
  assert.equal(sha(bytes), meta.sha256, 'ZIP SHA-256 mismatch')
  assert(bytes.equals(disk), 'Preview ZIP differs from stored ZIP')
  return { bytes, sha256: meta.sha256 }
}

async function discoverWorktree(argv) {
  const checkout = await realpath(await git('rev-parse', '--show-toplevel'))
  assert.equal(normalize(checkout), normalize(await realpath(repo)), 'Git did not resolve the script worktree')
  const common = await realpath(await git('rev-parse', '--path-format=absolute', '--git-common-dir'))
  const primary = path.dirname(common)
  const list = (await exec('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: repo, windowsHide: true })).stdout
  const worktrees = list.split('\0').filter(item => item.startsWith('worktree ')).map(item => item.slice(9))
  const canonicalWorktrees = await Promise.all(worktrees.map(tree => realpath(tree).catch(err => {
    if (err.code !== 'ENOENT') throw err
    return tree
  })))
  const parent = await realpath(process.platform === 'win32'
    ? path.join(homedir(), 'AppData', 'Local', 'Temp') : '/tmp')
  const runtime = []
  for (const marker of runtimeMarkers) {
    if (await exists(path.join(checkout, '.runtime', marker))) runtime.push(marker)
  }
  assertIsolation({ checkout, primary, parent, worktrees: canonicalWorktrees, argv, env: process.env, runtime })
  assert(canonicalWorktrees.some(tree => normalize(tree) === normalize(checkout)), 'Unregistered Git worktree')
  const [commit, branch, status] = await Promise.all([
    git('rev-parse', '--verify', 'HEAD'), git('rev-parse', '--abbrev-ref', 'HEAD'), git('status', '--porcelain'),
  ])
  return { parent, commit, branch, clean: status === '' }
}

function prepareProof(state, workflowId, runtime) {
  assert.equal(state.workflowId, workflowId)
  assert.equal(state.qaStatus, 'awaiting_source_qa', 'Prepare must wait for visual source QA')
  assert.equal(state.approvedDemoId, null)
  assert.equal(state.currentJobId, null)
  assert.equal(state.laceStyle, lace, 'Ren thêu phải là tùy chọn đã chọn')
  assert.equal(state.batch?.illustrationMode, 'procedural-fixture', 'Expected the seven procedural illustrations')
  assert.equal(state.batch?.sharedIllustrations, 7, 'Expected six illustrations and one independent SUBJECT')
  assert.equal(state.generatorCommitSha, runtime.generatorCommitSha)
  assert.equal(state.generatorSourceSha256, runtime.generatorSourceSha256)
  assert.equal(state.skillProof?.version, '1.2.13')
  assert.equal(state.skillProof.verifiedBy, 'host_archive_sha256')
  assert.deepEqual(state.demos.map(row => row.demoId), ['A', 'B'])
  assert.deepEqual(Object.keys(state.sourceScreen).sort(), ['A', 'B'])
  return state.demos.map(demo => {
    const screen = state.sourceScreen[demo.demoId]
    const geometry = screen?.mixedHandcutGeometry
    assert.equal(screen?.status, 'pass', demo.demoId + ' source QA failed')
    assert.equal(geometry?.status, 'pass', demo.demoId + ' geometry QA failed')
    assert(geometry.silhouettePairs.some(pair => pair.distinct)
      && geometry.polaroids.length && geometry.stampsOrTickets.length && geometry.notebooks.length,
    'Incomplete Mixed Handcut evidence')
    assert(Object.values(geometry.frames).length === 6 &&
      Object.values(geometry.frames).every(frame => frame.closedAlphaZeroHoles === 1))
    assert.equal(screen.kitSha256, demo.materialSha256)
    assert.equal(screen.manifestSha256, demo.manifestSha256)
    return { demoId: demo.demoId, demoSha256: demo.demoSha256, materialSha256: demo.materialSha256,
      manifestSha256: demo.manifestSha256, source: screen.status, geometry: geometry.status }
  })
}

async function assertNoJobs(root) {
  assert.deepEqual((await readdir(root)).sort(), ['.source-qa', '.workflow-operations', '.workflows'],
    'Unexpected output in the isolated MCP runtime')
}

async function main() {
  const start = performance.now()
  const report = { status: 'BLOCKED', stage: 'worktree', synthetic: true, durationsMs: {},
    isolation: { transport: 'sdk-in-memory', renderer: 'not_invoked', model: 'not_invoked', attachments: 'none' } }
  let qaRoot
  let scratch
  let client
  let server
  let originalFetch
  async function measure(name, task) {
    report.stage = name
    const started = performance.now()
    try { return await task() } finally { report.durationsMs[name] = rounded(performance.now() - started) }
  }
  try {
    const { parent, ...identity } = await measure('worktree', () => discoverWorktree(process.argv.slice(2)))
    report.git = identity
    qaRoot = await mkdtemp(path.join(parent, 'tinix-staging-preflight-'))
    scratch = path.join(qaRoot, 'scratch')
    await mkdir(scratch)
    const python = process.env.TINIX_STUDIO_PYTHON || 'python'
    const { Client, InMemoryTransport, createTinixMcp } = await measure('dependencies', async () => {
      const archive = process.env.TINIX_STUDIO_SKILL_ARCHIVE || path.join(homedir(), 'Downloads', 'skill (8).zip')
      assert((await lstat(archive)).isFile(), 'An approved regular Skill archive is required')
      const { stdout } = await run(python, ['-B', '-c',
        'import sys, PIL, numpy, scipy, cv2; print(sys.version.split()[0]); assert sys.version_info >= (3, 11)'])
      report.versions = { node: process.version, python: stdout.trim() }
      const [{ Client }, { InMemoryTransport }, { createTinixMcp }] = await Promise.all([
        import('@modelcontextprotocol/sdk/client/index.js'), import('@modelcontextprotocol/sdk/inMemory.js'),
        import('./server.mjs'),
      ])
      return { Client, InMemoryTransport, createTinixMcp }
    })
    report.status = 'FAIL'
    const root = path.join(scratch, 'mcp')
    await mkdir(root)
    // Only this standalone process is affected. Disallow network requests instead of relying on a renderer URL.
    originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('PREFLIGHT_NETWORK_FORBIDDEN') }
    const runtime = { generatorCommitSha: identity.commit, generatorSourceSha256: sha(await readFile(new URL('./generate_compositions.py', import.meta.url))) }
    await measure('catalog', async () => {
      server = createTinixMcp({ outputRoot: root, generatorRuntime: runtime, fetchFile: globalThis.fetch })
      client = new Client({ name: 'tinix-staging-preflight', version: '1' })
      const [a, b] = InMemoryTransport.createLinkedPair()
      await server.connect(b)
      await client.connect(a)
      const baseline = await readJson(new URL('./staging-preflight-p4-contract.json', import.meta.url))
      report.catalog = verifyCatalog(await client.listTools(), baseline, client.getServerVersion()?.version)
    })
    const workflowId = randomUUID()
    const call = args => client.callTool({ name: toolName, arguments: {
      workflow_id: workflowId, operation_id: randomUUID(), ...args,
    } }, undefined, { timeout: 180000 })
    const state = await measure('prepare', async () => {
      const result = await call({ action: 'prepare', brief: 'Synthetic pastel scrapbook staging preflight',
        theme: 'pastel', lace_style: lace, demo_count: 2, aspect_ratio: '1:1' })
      if (result.isError && result.content[0]?.text?.startsWith('SKILL_SOURCE_MISMATCH')) {
        report.status = 'BLOCKED'
        assert.fail('Approved Skill SHA-256 verification failed')
      }
      assert(!result.isError && result.structuredContent, 'Synthetic MCP prepare failed')
      report.demos = prepareProof(result.structuredContent, workflowId, runtime)
      report.skill = result.structuredContent.skillProof
      report.generator = runtime
      await assertNoJobs(root)
      return result.structuredContent
    })
    await measure('zipValidation', async () => {
      const home = path.join(root, '.workflows', workflowId)
      const workflow = path.join(home, 'workflow.json')
      const journal = path.join(root, '.workflow-operations', workflowId)
      const savedState = await readFile(workflow)
      const savedJournal = (await readdir(journal)).sort()
      const demoId = 'A'
      const diskPath = path.join(home, 'compositions', demoId, 'material.zip')
      const disk = await readFile(diskPath)
      const preview = { action: 'preview_artifact', demo_id: demoId, preview_kind: 'materials_zip' }
      const { bytes, sha256 } = verifyPreview(await call(preview),
        { workflowId, demoId, laceStyle: lace, sha256: state.demos[0].materialSha256 }, disk)
      const file = path.join(scratch, 'preview.zip')
      await writeFile(file, bytes, { flag: 'wx' })
      const { stdout } = await run(python, ['-B', fileURLToPath(new URL('./staging_preflight_zip.py', import.meta.url)), file], 60000)
      const info = JSON.parse(stdout)
      assert.equal(info.pixelIdentical, true)
      report.artifact = { demoId, bytes: bytes.length, sha256, payloadSha256: sha(canonicalJson(info.members)), ...info }
      // The substitution exists only in this disposable synthetic workflow.
      await writeFile(diskPath, Buffer.concat([disk, Buffer.from('synthetic substitution')]))
      const rejected = await call(preview)
      assert.equal(rejected.isError, true)
      assert.equal(rejected.content[0].text, 'CANDIDATE_ARTIFACT_HASH_MISMATCH')
      assert.deepEqual(await readFile(workflow), savedState, 'Preview changed workflow')
      assert.deepEqual((await readdir(journal)).sort(), savedJournal, 'Preview created an operation')
      await assertNoJobs(root)
      report.negative = { substitutedZip: 'BLOCKED', approvalOrRenderJobs: 0, workflowUnchanged: true }
    })
    report.status = 'PASS'
    delete report.stage
  } catch (error) {
    // Do not publish environment paths, arbitrary file IDs or subprocess output.
    report.reason = report.stage === 'worktree' || error.name === 'AssertionError'
      ? (error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : 'Worktree safety check failed')
      : (report.stage === 'dependencies' ? 'Install Node/Python dependencies and provide the approved Skill archive'
        : report.status === 'BLOCKED' ? 'Approved Skill verification or QA root setup failed' : 'Preflight step failed')
  } finally {
    const cleanupStart = performance.now()
    try {
      const closed = await Promise.allSettled([client?.close(), server?.close()])
      if (scratch) {
        assert(path.dirname(scratch) === qaRoot && path.basename(scratch) === 'scratch')
        await rm(scratch, { recursive: true, force: true, maxRetries: 3 })
        assert(!(await exists(scratch)))
      }
      assert(closed.every(result => result.status === 'fulfilled'))
      report.cleanup = scratch ? 'PASS' : 'not_applicable'
    } catch {
      report.status = 'BLOCKED'
      report.stage = 'cleanup'
      report.cleanup = 'FAIL'
      report.reason = 'Disposable workflow or MCP session could not be cleaned'
    }
    if (originalFetch) globalThis.fetch = originalFetch
    report.durationsMs.cleanup = rounded(performance.now() - cleanupStart)
    report.durationsMs.total = rounded(performance.now() - start)
  }
  if (qaRoot) {
    try { await writeFile(path.join(qaRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }) } catch {
      report.status = 'BLOCKED'
      report.stage = 'report'
      report.reason = 'Could not persist QA report'
    }
  }
  console.log(JSON.stringify({ status: report.status, stage: report.stage, reason: report.reason,
    commit: report.git?.commit, contractSha256: report.catalog?.sha256, artifactSha256: report.artifact?.sha256,
    durationsMs: report.durationsMs, cleanup: report.cleanup, report: qaRoot && path.join(qaRoot, 'report.json') }))
  process.exitCode = report.status === 'PASS' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
