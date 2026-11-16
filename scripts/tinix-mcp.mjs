import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'scripts/tinix-cli.mjs')
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const server = new McpServer({ name: 'tinix-poster', version: '0.1.0' })
// Tool descriptions and arguments map directly to the CLI, without a shell.
const commands = [
  ['status', 'status', 'Check the local Tinix service.', [], []],
  ['templates_list', 'templates list', 'List templates; kind is standard or collage.', [], ['kind','page','page-size']],
  ['templates_get', 'templates get', 'Get a template by ID.', ['id'], ['kind']],
  ['fonts_list', 'fonts list', 'List library fonts.', [], []],
  ['assets_list', 'assets list', 'List library assets.', [], []],
  ['draft_create', 'drafts create', 'Create an empty draft JSON file.', ['width','height','output'], []],
  ['draft_from_template', 'drafts from-template', 'Create a draft from a template.', ['id','output'], ['kind']],
  ['draft_validate', 'drafts validate', 'Check draft structure and linked images.', ['input'], []],
  ['draft_inspect_assets', 'drafts inspect-assets', 'Check availability of local assets; embedded images are not decoded.', ['input'], []],
  ['draft_apply', 'drafts apply', 'Apply a JSON operations file to a draft and write a new file.', ['input','operations','output'], []],
  ['draft_diff', 'drafts diff', 'Compare two draft files.', ['input','other'], []],
  ['draft_render', 'drafts render', 'Render a draft to a new PNG, cleaning up the temporary design.', ['input','output'], []],
  ['draft_save', 'drafts save', 'Save a revision with optimistic concurrency; initial expected-version is 0.', ['input','store','expected-version'], ['note']],
  ['draft_history', 'drafts history', 'List draft revisions.', ['store'], []],
  ['draft_checkout', 'drafts checkout', 'Export a revision to a new draft file.', ['store','version','output'], []],
  ['draft_restore', 'drafts restore', 'Restore an old revision as a new revision.', ['store','version','expected-version'], []],
  ['cutout_run', 'cutout run', 'Run local BiRefNet; no paid AI API is used.', ['input','output'], []],
  ['cutout_edit', 'cutout edit', 'Apply mask operations from JSON, preserving the source.', ['source','input','operations','output'], []],
  ['cutout_border', 'cutout border', 'Generate aligned subject and rim using editor rendering; scale is document pixels per source pixel.', ['input','output','image-output','mm','dpi','scale'], []],
  ['cutout_place', 'cutout place', 'Place an already reviewed cutout into a subject image layer.', ['input','id','source','cutout','mm','output'], []],
  ['template_instantiate', 'templates instantiate', 'Apply photo, subject and text bindings from JSON to a template; creates an independent draft.', ['input','bindings','output'], []],
  ['template_save_collage', 'templates save-collage', 'Save a new collage template in the application.', ['input','name'], ['category']],
  ['design_create', 'designs create', 'Create a saved design from a draft.', ['input','title'], []],
  ['design_render', 'designs render', 'Render a saved design to PNG.', ['id','width','height','output'], []],
  ['collage_export', 'collage export', 'Create base, cutting sheets and finished image plus manifest; does not approve printing.', ['id','directory'], ['margin','gap']]
]
function callCli(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...command.split(' '), ...Object.entries(args).flatMap(([key, value]) => ['--' + key, value])], { cwd: root, windowsHide: true })
    let stdout = '', stderr = '', oversized = false
    const capture = (chunk, target) => {
      if (target === 'out') stdout += chunk; else stderr += chunk
      if (stdout.length + stderr.length > 16 * 1024 * 1024) { oversized = true; child.kill() }
    }
    child.stdout.on('data', chunk => capture(chunk, 'out')); child.stderr.on('data', chunk => capture(chunk, 'err'))
    child.on('error', reject)
    child.on('close', code => {
      if (oversized) return reject(new Error('CLI output exceeded 16 MiB'))
      let payload
      try { payload = JSON.parse(code === 0 ? stdout : stderr) } catch { return reject(new Error((stderr || stdout || `CLI exited ${code}`).slice(0, 4000))) }
      resolve({ content: [{ type: 'text', text: JSON.stringify(payload) }], isError: code !== 0 })
    })
  })
}
for (const [name, command, description, required, optional] of commands) {
  const schema = Object.fromEntries([...required.map(key => [key, z.string().min(1)]), ...optional.map(key => [key, z.string().min(1).optional()])])
  server.registerTool(name, { description: `${description} All paths are local to the Tinix machine; existing output files are not overwritten. See docs/tinix-cli.md.`, inputSchema: schema }, async args => {
    try { return await callCli(command, Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined))) }
    catch (error) { return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true } }
  })
}
server.registerTool('view_image', { description: 'Inspect a local PNG or JPEG, resized to a maximum edge of 1600 pixels. Returns an image directly.', inputSchema: { file: z.string().min(1) } }, async ({ file }) => {
  try {
    const input = await readFile(file), metadata = await sharp(input, { limitInputPixels: 80000000 }).metadata()
    if (!['png', 'jpeg'].includes(metadata.format)) throw new Error('Only PNG and JPEG are supported')
    const preview = await sharp(input).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
    return { content: [{ type: 'text', text: JSON.stringify({ file: path.resolve(file), width: metadata.width, height: metadata.height }) }, { type: 'image', data: preview.toString('base64'), mimeType: 'image/jpeg' }] }
  } catch (error) { return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true } }
})
await server.connect(new StdioServerTransport())
