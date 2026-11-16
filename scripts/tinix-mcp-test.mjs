import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const dir = await mkdtemp(path.join(os.tmpdir(), 'tinix-mcp-'))
const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('scripts/tinix-mcp.mjs')], cwd: process.cwd(), stderr: 'pipe' })
const client = new Client({ name: 'tinix-test', version: '1.0.0' })
try {
  await client.connect(transport)
  const list = await client.listTools(); assert(list.tools.some(t => t.name === 'draft_create')); assert(list.tools.some(t => t.name === 'view_image'))
  for (const name of ['draft_from_reference', 'reference_grid', 'reference_compare']) assert(list.tools.some(t => t.name === name), `thiếu công cụ ${name}`)
  const draft = path.join(dir, 'draft.json')
  let result = await client.callTool({ name: 'draft_create', arguments: { width: '600', height: '400', output: draft } })
  assert(!result.isError, JSON.stringify(result))
  result = await client.callTool({ name: 'draft_validate', arguments: { input: draft } })
  assert.equal(JSON.parse(result.content[0].text).valid, true)
  result = await client.callTool({ name: 'draft_create', arguments: { width: '600', height: '400', output: draft } })
  assert(result.isError, 'Existing output must fail')
  const image = path.join(dir, 'photo.png')
  await sharp({ create: { width: 50, height: 40, channels: 3, background: '#f00' } }).png().toFile(image)
  result = await client.callTool({ name: 'view_image', arguments: { file: image } })
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].mimeType, 'image/jpeg')
  assert.equal((await sharp(Buffer.from(result.content[1].data, 'base64')).metadata()).width, 50)
  result = await client.callTool({ name: 'view_image', arguments: { file: path.join(dir, 'missing.png') } }); assert(result.isError)
  if (process.env.TINIX_MCP_LIVE === '1') {
    const preview = path.join(dir, 'preview.png')
    result = await client.callTool({ name: 'draft_render', arguments: { input: draft, output: preview } })
    assert(!result.isError, JSON.stringify(result))
    result = await client.callTool({ name: 'view_image', arguments: { file: preview } })
    assert.equal(result.content[1].type, 'image')
    const rendered = await sharp(Buffer.from(result.content[1].data, 'base64')).metadata()
    assert.equal(rendered.width, 600); assert.equal(rendered.height, 400)
  }
  console.log('PASS MCP: official client, discovery, draft creation/validation, error propagation and image content')
} finally { await client.close(); await rm(dir, { recursive: true, force: true }) }
