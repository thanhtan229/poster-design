// [TINIX] Exercise real MCP discovery and persistent rejected operations without a renderer or approved ZIP.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
