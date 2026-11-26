// [TINIX] Verify guards, stable contracts and strict preview transport without the proprietary Skill.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { assertIsolation, verifyCatalog, verifyPreview } from './staging-preflight.mjs'
import { createTinixMcp } from './server.mjs'

test('requires a separate worktree and rejects runtime paths, live URL and job IDs', () => {
  const primary = path.resolve('repo', 'live')
  const checkout = path.resolve('repo', 'staging')
  const safe = { primary, checkout, parent: path.resolve('tmp'), worktrees: [primary, checkout] }
  assert.doesNotThrow(() => assertIsolation(safe))
  assert.throws(() => assertIsolation({ ...safe, checkout: primary }), /linked worktree/)
  assert.throws(() => assertIsolation({ ...safe, checkout: path.join(primary, 'nested') }), /linked worktree/)
  assert.throws(() => assertIsolation({ ...safe, parent: path.join(primary, '.runtime') }), /overlaps/)
  assert.throws(() => assertIsolation({ ...safe, parent: path.dirname(primary) }), /overlaps/)
  assert.throws(() => assertIsolation({ ...safe, runtime: ['secure-mcp-tunnel'] }), /already has/)
  assert.throws(() => assertIsolation({ ...safe, runtime: ['mcp-material'] }), /already has/)
  for (const env of [{ TINIX_APP_URL: 'http://127.0.0.1:7001' }, { TINIX_APP_URL: 'https://example.com' },
    { TINIX_DB: 'customer.db' }, { TINIX_STATIC_DIR: 'service/static' }, { TINIX_BACKUP_DIR: 'backups' }]) {
    assert.throws(() => assertIsolation({ ...safe, env }), /runtime overrides/)
  }
  assert.throws(() => assertIsolation({ ...safe, argv: ['--job-id', 'fixture-identifier'] }), /no paths, endpoints or job IDs/)
})

test('queries real MCP discovery, checks 18 pinned contracts and the material exporter', async () => {
  const server = createTinixMcp()
  const client = new Client({ name: 'staging-preflight-test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(b)
    await client.connect(a)
    const catalog = await client.listTools()
    const baseline = JSON.parse(await readFile(new URL('./staging-preflight-p4-contract.json', import.meta.url), 'utf8'))
    const ver = client.getServerVersion().version
    const accepted = verifyCatalog(catalog, baseline, ver)
    assert.equal(accepted.names.length, 19)
    assert.match(accepted.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(verifyCatalog({ tools: [...catalog.tools].reverse() }, baseline, ver), accepted)
    assert.throws(() => verifyCatalog({ tools: catalog.tools.slice(1) }, baseline, ver), /exactly 19/)
    const duplicate = [catalog.tools[1], ...catalog.tools.slice(1)]
    assert.throws(() => verifyCatalog({ tools: duplicate }, baseline, ver), /Duplicate/)
    const altered = structuredClone(catalog)
    altered.tools.find(row => row.name === 'orchestrate_scrapbook_workflow').annotations.readOnlyHint = true
    assert.throws(() => verifyCatalog(altered, baseline, ver), /P4 contract mismatch/)
    const exporter = altered.tools.find(row => row.name === 'export_material_draft')
    const unchanged = catalog.tools.find(row => row.name === 'orchestrate_scrapbook_workflow')
    altered.tools.splice(altered.tools.findIndex(row => row.name === unchanged.name), 1, unchanged)
    exporter._meta['openai/fileParams'] = []
    assert.throws(() => verifyCatalog(altered, baseline, ver))
  } finally {
    await client.close()
    await server.close()
  }
})

test('MCP ZIP preview requires byte equality with disk, code, length and hash', () => {
  const zip = Buffer.from('synthetic unit transport fixture')
  const sha256 = createHash('sha256').update(zip).digest('hex')
  const expected = { workflowId: 'fixture', demoId: 'A', laceStyle: 'embroidered_pastel', sha256 }
  const reply = { structuredContent: { ...expected, bytes: zip.length, artifact: 'materials_zip' },
    content: [{ type: 'resource', resource: { mimeType: 'application/zip', blob: zip.toString('base64') } }] }
  assert.deepEqual(verifyPreview(reply, expected, zip), { bytes: zip, sha256 })
  assert.throws(() => verifyPreview(reply, expected, Buffer.from('wrong disk ZIP')), /stored ZIP/)
  assert.throws(() => verifyPreview({ ...reply, structuredContent: { ...reply.structuredContent, bytes: 0 } }, expected, zip), /length/)
  const wrongHash = { ...expected, sha256: '0'.repeat(64) }
  assert.throws(() => verifyPreview(reply, wrongHash, zip), /metadata sha256/)
  reply.structuredContent.sha256 = wrongHash.sha256
  assert.throws(() => verifyPreview(reply, wrongHash, zip), /SHA-256 mismatch/)
})
