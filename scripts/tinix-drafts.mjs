import { readFile, writeFile } from 'node:fs/promises'

export function validate(layout) {
  const issues = [], ids = new Set()
  if (!layout?.global || !Array.isArray(layout.layers)) throw new Error('Expected layout with global and layers')
  if (![layout.global.width, layout.global.height].every(n => Number.isFinite(n) && n > 0)) issues.push({ code: 'PAGE_SIZE', severity: 'error' })
  for (const layer of layout.layers) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) { issues.push({ code: 'INVALID_LAYER', severity: 'error' }); continue }
    const id = String(layer.uuid || '')
    if (!id || ids.has(id)) issues.push({ code: 'LAYER_ID', severity: 'error', layerId: id })
    ids.add(id)
    if (![layer.left, layer.top, layer.width, layer.height].every(Number.isFinite) || layer.width <= 0 || layer.height <= 0) issues.push({ code: 'LAYER_GEOMETRY', severity: 'error', layerId: id })
  }
  const byId = new Map(layout.layers.filter(layer => layer && typeof layer === 'object').map(layer => [String(layer.uuid), layer]))
  for (const layer of layout.layers) {
    if (!layer || typeof layer !== 'object') continue
    if (layer.parent && layer.parent !== '-1' && !ids.has(String(layer.parent))) issues.push({ code: 'MISSING_PARENT', severity: 'error', layerId: layer.uuid })
    if (layer.linkedPhotoId) {
      const source = byId.get(String(layer.linkedPhotoId))
      if (!source || source.type !== 'w-image' || !source.slot || source.hidden || source.linkedPhotoId) issues.push({ code: 'INVALID_LINK', severity: 'error', layerId: layer.uuid, targetId: layer.linkedPhotoId })
    }
    const seen = new Set([String(layer.uuid)])
    let parent = layer.parent
    while (parent && parent !== '-1' && byId.has(String(parent))) {
      if (seen.has(String(parent))) { issues.push({ code: 'PARENT_CYCLE', severity: 'error', layerId: layer.uuid }); break }
      seen.add(String(parent)); parent = byId.get(String(parent)).parent
    }
  }
  return issues
}
export function apply(layout, operations) {
  const next = structuredClone(layout)
  if (!Array.isArray(operations)) throw new Error('Operations must be an array')
  for (const op of operations) {
    if (op.action === 'page') {
      if (!op.changes || typeof op.changes !== 'object' || Array.isArray(op.changes) || 'uuid' in op.changes || 'type' in op.changes) throw new Error('Invalid page update')
      Object.assign(next.global, op.changes)
      continue
    }
    const index = next.layers.findIndex(layer => layer.uuid === op.id)
    if (op.action === 'add') {
      if (!op.layer?.uuid || next.layers.some(layer => layer.uuid === op.layer.uuid)) throw new Error('Invalid or duplicate layer ID')
      next.layers.push(op.layer)
    } else if (op.action === 'update') {
      if (index < 0 || !op.changes || typeof op.changes !== 'object' || Array.isArray(op.changes) || 'uuid' in op.changes) throw new Error('Invalid layer update')
      Object.assign(next.layers[index], op.changes)
    } else if (op.action === 'remove') {
      if (index < 0) throw new Error('Layer not found')
      next.layers.splice(index, 1)
    } else if (op.action === 'reorder') {
      if (!Array.isArray(op.ids) || op.ids.length !== next.layers.length || new Set(op.ids).size !== op.ids.length || op.ids.some(id => !next.layers.some(layer => layer.uuid === id))) throw new Error('Order must include every layer ID exactly once')
      const map = new Map(next.layers.map(layer => [layer.uuid, layer]))
      next.layers = op.ids.map(id => map.get(id))
    } else throw new Error('Unknown operation')
  }
  const issues = validate(next)
  if (issues.some(i => i.severity === 'error')) throw new Error(JSON.stringify(issues))
  for (const linked of next.layers.filter(layer => layer.linkedPhotoId)) {
    const source = next.layers.find(layer => String(layer.uuid) === String(linked.linkedPhotoId))
    linked.imgUrl = source.imgUrl; linked.slot = false
    if (source.origin) linked.origin = structuredClone(source.origin); else delete linked.origin
  }
  return next
}
export async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')) }
export async function createJson(file, data) { await writeFile(file, JSON.stringify(data, null, 2), { flag: 'wx' }) }
