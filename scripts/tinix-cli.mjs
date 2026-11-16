#!/usr/bin/env node
// Local automation entry point. Only explicitly supported routes are exposed.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { validate, apply, readJson, createJson } from './tinix-drafts.mjs'
import { historySave, historyList, historyRead } from './tinix-draft-history.mjs'
import { editMask, borderMask, placeCutout } from './tinix-mask.mjs'
import { instantiate } from './tinix-instantiate.mjs'

const help = `Tinix CLI (local templates, drafts and cutouts)
Usage: node scripts/tinix-cli.mjs <command> [options]
  status
  templates list [--kind collage|standard] [--page N] [--page-size N]
  templates get --kind collage|standard --id N
  fonts list
  assets list
  cutout run --input FILE --output FILE
  cutout edit --source FILE --input PNG --operations FILE --output PNG
  cutout border --input PNG --output PNG --image-output PNG --mm N --dpi N --scale N
  cutout place --input DRAFT --id LAYER --source FILE --cutout PNG --mm N --output DRAFT
  drafts validate --input FILE
  drafts inspect-assets --input FILE
  drafts create --width PX --height PX --output FILE
  drafts render --input FILE --output FILE
  drafts diff --input FILE --other FILE
  drafts save --input FILE --store FILE --expected-version N [--note TEXT]
  drafts history --store FILE
  drafts checkout --store FILE --version N --output FILE
  drafts restore --store FILE --version N --expected-version N
  drafts from-template --id N --output FILE [--kind standard|collage]
  drafts apply --input FILE --operations FILE --output FILE
  designs create --input FILE --title TITLE
  designs render --id N --width PX --height PX --output FILE
  collage export --id N --directory DIR [--margin MM] [--gap MM]
  templates save-collage --input FILE --name NAME [--category NAME]
  templates instantiate --input TEMPLATE --bindings JSON --output DRAFT
Options: --url URL (default TINIX_APP_URL or http://127.0.0.1:7001)
JSON is written to stdout; failures are JSON on stderr with a nonzero exit code.`

function parse(args) {
  const words = [], options = {}
  while (args.length) {
    const arg = args.shift()
    if (!arg.startsWith('--')) words.push(arg)
    else {
      const key = arg.slice(2), value = args.shift()
      if (!value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error(`Invalid option: ${arg}`)
      options[key] = value
    }
  }
  return { words, options }
}
function check(options, allowed) {
  for (const key of Object.keys(options)) if (!allowed.includes(key) && key !== 'url') throw new Error(`Unknown option: --${key}`)
}
function positive(value, label) {
  if (!/^[1-9]\d*$/.test(value || '') || !Number.isSafeInteger(Number(value))) throw new Error(`${label} must be a positive integer`)
  return Number(value)
}
function baseUrl(value) {
  const url = new URL(value || process.env.TINIX_APP_URL || 'http://127.0.0.1:7001')
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('URL must be a local Tinix service origin')
  return url.origin
}
async function request(base, route, init = {}) {
  const response = await fetch(base + route, { ...init, signal: AbortSignal.timeout(init.timeout || 20000) })
  if (!response.ok) {
    const body = await response.text()
    const error = new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`)
    try { const data = JSON.parse(body); if (Array.isArray(data.issues)) error.issues = data.issues } catch {}
    throw error
  }
  return response
}
async function json(base, route, init) {
  const result = await (await request(base, route, init)).json()
  if (typeof result.code === 'number' && result.code !== 200) throw new Error(result.msg || `API error ${result.code}`)
  return typeof result.code === 'number' ? result.result : result
}
function post(body) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } }
async function saveResponse(response, file) {
  const type = response.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error(`Expected image, got ${type}: ${(await response.text()).slice(0, 500)}`)
  await writeFile(file, Buffer.from(await response.arrayBuffer()), { flag: 'wx' })
}
async function main() {
  if (!process.argv[2] || process.argv[2] === '--help') { console.log(help); return }
  const { words, options } = parse(process.argv.slice(2)), base = baseUrl(options.url)
  let result
  switch (words.join(' ')) {
    case 'templates instantiate': {
      check(options, ['input', 'bindings', 'output'])
      if (!options.input || !options.bindings || !options.output) throw new Error('--input, --bindings and --output are required')
      const resultData = await instantiate(await readJson(options.input), await readJson(options.bindings), path.dirname(path.resolve(options.bindings)))
      await createJson(options.output, resultData.layout)
      result = { output: path.resolve(options.output), idMap: resultData.idMap, sourceHash: resultData.sourceHash }
      break
    }
    case 'cutout place': {
      check(options, ['input', 'id', 'source', 'cutout', 'mm', 'output'])
      if (['input', 'id', 'source', 'cutout', 'mm', 'output'].some(key => options[key] === undefined)) throw new Error('All placement options are required')
      const layout = await readJson(options.input), issues = validate(layout)
      if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
      const placed = await placeCutout(layout, options.id, options.source, options.cutout, Number(options.mm))
      const afterIssues = validate(placed.layout)
      if (afterIssues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(afterIssues))
      await createJson(options.output, placed.layout)
      result = { output: path.resolve(options.output), layerId: options.id, ...placed.geometry }
      break
    }
    case 'cutout border': {
      check(options, ['input', 'output', 'image-output', 'mm', 'dpi', 'scale'])
      if (!options.input || !options.output || !options['image-output'] || options.mm === undefined || !options.dpi || !options.scale) throw new Error('--input, --output, --image-output, --mm, --dpi and --scale are required')
      const paths = [options.input, options.output, options['image-output']].map(file => path.resolve(file).toLowerCase())
      if (new Set(paths).size !== 3) throw new Error('Input, image output and border output must differ')
      result = { ...await borderMask(options.input, options.output, { mm: Number(options.mm), dpi: Number(options.dpi), scale: Number(options.scale), imageOutput: options['image-output'] }), output: path.resolve(options.output), imageOutput: path.resolve(options['image-output']) }
      break
    }
    case 'cutout edit': {
      check(options, ['source', 'input', 'operations', 'output'])
      if (!options.source || !options.input || !options.operations || !options.output) throw new Error('--source, --input, --operations and --output are required')
      if ([options.source, options.input].some(file => path.resolve(file).toLowerCase() === path.resolve(options.output).toLowerCase())) throw new Error('Output must differ from source and cutout')
      result = { ...await editMask(options.source, options.input, await readJson(options.operations), options.output), output: path.resolve(options.output) }
      break
    }
    case 'drafts save': {
      check(options, ['input', 'store', 'expected-version', 'note'])
      if (!options.input || !options.store || !/^(0|[1-9]\d*)$/.test(options['expected-version'] || '') || !Number.isSafeInteger(Number(options['expected-version']))) throw new Error('--input, --store and nonnegative --expected-version are required')
      result = historySave(options.store, await readJson(options.input), Number(options['expected-version']), options.note || '')
      break
    }
    case 'drafts history': {
      check(options, ['store']); if (!options.store) throw new Error('--store is required')
      result = { revisions: historyList(options.store) }; break
    }
    case 'drafts checkout': {
      check(options, ['store', 'version', 'output'])
      if (!options.store || !options.output) throw new Error('--store and --output are required')
      const version = positive(options.version, 'version')
      await createJson(options.output, historyRead(options.store, version))
      result = { version, output: path.resolve(options.output) }; break
    }
    case 'drafts restore': {
      check(options, ['store', 'version', 'expected-version'])
      if (!options.store) throw new Error('--store is required')
      const version = positive(options.version, 'version'), expected = positive(options['expected-version'], 'expected-version')
      result = historySave(options.store, historyRead(options.store, version), expected, 'Restore revision ' + version, version)
      break
    }
    case 'drafts inspect-assets': {
      check(options, ['input'])
      if (!options.input) throw new Error('--input is required')
      const layout = await readJson(options.input), issues = validate(layout)
      const resources = []
      if (layout.global.backgroundImage) resources.push({ layerId: '-1', kind: 'background', url: layout.global.backgroundImage })
      for (const layer of layout.layers) {
        if (!layer || layer.hidden) continue
        for (const [kind, url] of [['image', layer.origin && layer.imgUrl === layer.origin.proxy ? layer.origin.original : layer.imgUrl], ['border', layer.cutoutBorderUrl], ['font', layer.fontClass?.url]]) {
          if (url) resources.push({ layerId: layer.uuid, kind, url })
        }
      }
      const cache = new Map()
      for (const resource of resources) {
        if (resource.url.startsWith('data:')) { resource.url = resource.url.slice(0, resource.url.indexOf(',') + 1) + '[embedded]'; resource.status = 'embedded-not-verified'; continue }
        let url
        try { url = new URL(resource.url, base) } catch { issues.push({ code: 'INVALID_RESOURCE_URL', severity: 'error', ...resource }); continue }
        if (url.origin !== base) { issues.push({ code: 'EXTERNAL_RESOURCE', severity: 'warning', ...resource }); continue }
        if (!cache.has(url.href)) {
          try {
            const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) })
            const contentType = response.headers.get('content-type') || ''
            const available = response.ok && !contentType.includes('text/html') && !contentType.includes('application/json')
            cache.set(url.href, { available, httpStatus: response.status, contentType })
          } catch (error) { cache.set(url.href, { available: false, error: error.message }) }
        }
        Object.assign(resource, cache.get(url.href))
        if (!resource.available) issues.push({ code: 'RESOURCE_UNAVAILABLE', severity: 'error', ...resource })
      }
      result = { valid: !issues.some(issue => issue.severity === 'error'), resources, issues }
      if (!result.valid) process.exitCode = 1
      break
    }
    case 'drafts diff': {
      check(options, ['input', 'other'])
      if (!options.input || !options.other) throw new Error('--input and --other are required')
      const before = await readJson(options.input), after = await readJson(options.other)
      validate(before); validate(after)
      const oldLayers = new Map(before.layers.map(layer => [layer.uuid, layer])), newLayers = new Map(after.layers.map(layer => [layer.uuid, layer]))
      result = { pageChanged: JSON.stringify(before.global) !== JSON.stringify(after.global), orderChanged: JSON.stringify(before.layers.map(layer => layer.uuid)) !== JSON.stringify(after.layers.map(layer => layer.uuid)), added: after.layers.filter(layer => !oldLayers.has(layer.uuid)).map(layer => layer.uuid), removed: before.layers.filter(layer => !newLayers.has(layer.uuid)).map(layer => layer.uuid), changed: after.layers.filter(layer => oldLayers.has(layer.uuid) && JSON.stringify(oldLayers.get(layer.uuid)) !== JSON.stringify(layer)).map(layer => layer.uuid) }
      break
    }
    case 'drafts create': {
      check(options, ['width', 'height', 'output'])
      const width = positive(options.width, 'width'), height = positive(options.height, 'height')
      if (!options.output || width > 12000 || height > 12000 || width * height > 80000000) throw new Error('Invalid output or page dimensions')
      await createJson(options.output, { global: { name: 'Agent draft', type: 'page', uuid: '-1', left: 0, top: 0, width, height, dpi: 300, backgroundColor: '#ffffffff', backgroundGradient: '', backgroundImage: '', backgroundTransform: {}, opacity: 1, record: {} }, layers: [] })
      result = { output: path.resolve(options.output) }
      break
    }
    case 'drafts render': {
      check(options, ['input', 'output'])
      if (!options.input || !options.output) throw new Error('--input and --output are required')
      const layout = await readJson(options.input), issues = validate(layout)
      if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
      const { width, height } = layout.global
      if (width > 12000 || height > 12000 || width * height > 80000000) throw new Error('Page exceeds render limits')
      const saved = await json(base, '/design/save', post({ title: 'Temporary CLI draft render', data: JSON.stringify([layout]), width, height }))
      if (!Number.isSafeInteger(saved?.id) || saved.id <= 0) throw new Error('Service did not return a design ID')
      try {
        await saveResponse(await request(base, `/api/screenshots?id=${saved.id}&width=${width}&height=${height}`, { timeout: 180000 }), options.output)
        result = { output: path.resolve(options.output), width, height }
      } finally {
        try { await json(base, '/design/poster/del', post({ id: saved.id })) }
        catch (error) { throw new Error(`Cleanup failed for temporary design ${saved.id}: ${error.message}`) }
      }
      break
    }
    case 'drafts from-template': {
      check(options, ['id', 'kind', 'output'])
      const id = positive(options.id, 'id'), kind = options.kind || 'standard'
      if (!options.output) throw new Error('--output is required')
      let layout
      if (kind === 'standard') {
        const template = await json(base, `/design/temp?type=0&id=${id}`)
        const data = typeof template.data === 'string' ? JSON.parse(template.data) : template.data
        layout = Array.isArray(data) ? data[0] : data?.page && Array.isArray(data.widgets) ? { global: data.page, layers: data.widgets } : data
      } else if (kind === 'collage') {
        const data = await json(base, '/api/tinix/collage-templates')
        layout = data.list.find(item => Number(item.id) === id)?.data
        if (!layout) throw new Error('Collage template not found')
      } else throw new Error('kind must be standard or collage')
      const issues = validate(layout)
      if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
      await createJson(options.output, layout)
      result = { output: path.resolve(options.output), layers: layout.layers.length, issues }
      break
    }
    case 'designs create': {
      check(options, ['input', 'title'])
      if (!options.input || !options.title) throw new Error('--input and --title are required')
      const layout = await readJson(options.input), issues = validate(layout)
      if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
      result = await json(base, '/design/save', post({ title: options.title, data: JSON.stringify([layout]), width: layout.global.width, height: layout.global.height }))
      break
    }
    case 'templates save-collage': {
      check(options, ['input', 'name', 'category'])
      if (!options.input || !options.name) throw new Error('--input and --name are required')
      const layout = await readJson(options.input), issues = validate(layout)
      if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
      result = await json(base, '/api/tinix/collage-templates', post({ name: options.name, category: options.category || '', layout }))
      break
    }
    case 'designs render': {
      check(options, ['id', 'width', 'height', 'output'])
      const id = positive(options.id, 'id'), width = positive(options.width, 'width'), height = positive(options.height, 'height')
      if (!options.output || width > 12000 || height > 12000 || width * height > 80000000) throw new Error('Invalid output or render dimensions')
      const response = await request(base, `/api/screenshots?id=${id}&width=${width}&height=${height}`, { timeout: 180000 })
      await saveResponse(response, options.output)
      result = { output: path.resolve(options.output), id }
      break
    }
    case 'collage export': {
      check(options, ['id', 'directory', 'margin', 'gap'])
      const id = positive(options.id, 'id'), marginMm = Number(options.margin ?? 5), gapMm = Number(options.gap ?? 5)
      if (!options.directory || !Number.isFinite(marginMm) || !Number.isFinite(gapMm) || marginMm < 0 || gapMm < 0) throw new Error('Invalid directory, margin or gap')
      const job = await json(base, '/api/tinix/collage-print', post({ designId: id, pageIndex: 0, options: { marginMm, gapMm } }))
      try {
        await mkdir(options.directory, { recursive: true })
        const snapshot = await json(base, `/api/tinix/collage-print/${encodeURIComponent(job.id)}/data`)
        await createJson(path.join(options.directory, 'manifest.json'), { designId: id, names: job.names, dpi: job.dpi, issues: job.issues, layouts: JSON.parse(snapshot.data) })
        const files = []
        for (let i = 0; i < job.names.length; i++) {
          const file = path.join(options.directory, path.basename(job.names[i]))
          await saveResponse(await request(base, `/api/tinix/collage-print/${encodeURIComponent(job.id)}/image/${i}`, { timeout: 180000 }), file)
          files.push(path.resolve(file))
        }
        result = { files, issues: job.issues, dpi: job.dpi }
      } finally { await request(base, `/api/tinix/collage-print/${encodeURIComponent(job.id)}`, { method: 'DELETE' }) }
      break
    }
    case 'drafts validate': {
      check(options, ['input'])
      if (!options.input) throw new Error('--input is required')
      const issues = validate(await readJson(options.input))
      result = { valid: !issues.some(i => i.severity === 'error'), issues }
      if (!result.valid) process.exitCode = 1
      break
    }
    case 'drafts apply': {
      check(options, ['input', 'operations', 'output'])
      if (!options.input || !options.operations || !options.output) throw new Error('--input, --operations and --output are required')
      const layout = await readJson(options.input), operations = await readJson(options.operations)
      const next = apply(layout, operations)
      await createJson(options.output, next)
      result = { output: path.resolve(options.output), layers: next.layers.length }
      break
    }
    case 'status':
      check(options, [])
      await json(base, '/api/tinix/collage-templates')
      result = { service: 'available', url: base, birefnet: 'not tested', renderer: 'not tested' }
      break
    case 'templates list': {
      check(options, ['kind', 'page', 'page-size'])
      const kind = options.kind || 'standard'
      if (kind === 'collage') {
        if (options.page || options['page-size']) throw new Error('Pagination is not supported for collage templates')
        result = await json(base, '/api/tinix/collage-templates')
      } else if (kind === 'standard') {
        const page = options.page ? positive(options.page, 'page') : 1
        const size = options['page-size'] ? positive(options['page-size'], 'page-size') : 20
        if (size > 100) throw new Error('page-size cannot exceed 100')
        result = await json(base, `/design/list?type=0&page=${page}&pageSize=${size}`)
      } else throw new Error('kind must be standard or collage')
      break
    }
    case 'templates get': {
      check(options, ['kind', 'id'])
      const id = positive(options.id, 'id'), kind = options.kind || 'standard'
      if (kind === 'standard') result = await json(base, `/design/temp?type=0&id=${id}`)
      else if (kind === 'collage') {
        const data = await json(base, '/api/tinix/collage-templates')
        result = data.list.find(item => Number(item.id) === id)
        if (!result) throw new Error('Collage template not found')
      } else throw new Error('kind must be standard or collage')
      break
    }
    case 'fonts list': check(options, []); result = await json(base, '/design/fonts'); break
    case 'assets list': check(options, []); result = await json(base, '/design/material'); break
    case 'cutout run': {
      check(options, ['input', 'output'])
      if (!options.input || !options.output) throw new Error('Both --input and --output are required')
      if (path.resolve(options.input).toLowerCase() === path.resolve(options.output).toLowerCase()) throw new Error('Input and output must be different files')
      const data = await readFile(options.input), body = new FormData()
      body.append('file', new Blob([data]), path.basename(options.input))
      const response = await request(base, '/api/tinix/cutout/birefnet', { method: 'POST', body, timeout: 200000 })
      if (!response.headers.get('content-type')?.startsWith('image/png')) throw new Error('BiRefNet did not return a PNG')
      const output = path.resolve(options.output)
      await writeFile(output, Buffer.from(await response.arrayBuffer()), { flag: 'wx' })
      result = { output, cache: response.headers.get('x-cutout-cache'), gpu: response.headers.get('x-cutout-gpu'), seconds: response.headers.get('x-cutout-seconds') }
      break
    }
    default: throw new Error(`Unknown command: ${words.join(' ')}`)
  }
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(JSON.stringify({ error: error.message, issues: error.issues })); process.exitCode = 1 })
