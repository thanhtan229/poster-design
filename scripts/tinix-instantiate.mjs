import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { validate } from './tinix-drafts.mjs'
import { placeCutout } from './tinix-mask.mjs'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')

export async function instantiate(template, bindings, directory) {
  const issues = validate(template)
  if (issues.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(issues))
  if (!bindings || typeof bindings.customer !== 'string' || !bindings.customer.trim() || !bindings.slots || typeof bindings.slots !== 'object' || Array.isArray(bindings.slots)) throw new Error('Expected customer and slots object')
  const slots = template.layers.filter(layer => ['photo', 'subject', 'text'].includes(layer.templateRole))
  if (template.layers.some(layer => layer.templateRole && !['fixed', 'photo', 'subject', 'text'].includes(layer.templateRole))) throw new Error('Unsupported template role')
  for (const id of Object.keys(bindings.slots)) if (!slots.some(slot => String(slot.uuid) === id)) throw new Error('Unknown template slot: ' + id)
  for (const slot of slots) {
    const binding = bindings.slots[String(slot.uuid)]
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw new Error('Missing slot binding: ' + slot.uuid)
    if (slot.templateRole === 'text') {
      if (slot.type !== 'w-text' || typeof binding.text !== 'string') throw new Error('Text binding required: ' + slot.uuid)
    } else {
      if (slot.type !== 'w-image' || slot.linkedPhotoId) throw new Error('Photo/subject slots must be independent image layers')
      if (slot.templateRole === 'photo' && typeof binding.file !== 'string') throw new Error('Photo file required: ' + slot.uuid)
      if (slot.templateRole === 'subject' && (typeof binding.source !== 'string' || typeof binding.cutout !== 'string' || !Number.isFinite(binding.mm) || binding.mm < 0 || binding.mm > 5)) throw new Error('Subject source, cutout and mm 0..5 required: ' + slot.uuid)
    }
  }
  let layout = structuredClone(template)
  for (const slot of slots) {
    const binding = bindings.slots[String(slot.uuid)]
    if (slot.templateRole === 'subject') {
      layout = (await placeCutout(layout, slot.uuid, path.resolve(directory, binding.source), path.resolve(directory, binding.cutout), binding.mm)).layout
    } else {
      const layer = layout.layers.find(layer => layer.uuid === slot.uuid)
      if (slot.templateRole === 'text') {
        layer.text = binding.text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]).replace(/\r\n|\r|\n/g, '<br>')
      } else {
        const png = await sharp(path.resolve(directory, binding.file), { limitInputPixels: 32000000 }).rotate().png().toBuffer()
        layer.imgUrl = 'data:image/png;base64,' + png.toString('base64')
        delete layer.origin; delete layer.cutoutEdit; delete layer.cutoutBorderUrl
      }
    }
  }
  const ids = new Map(layout.layers.map(layer => [String(layer.uuid), randomUUID()])), groups = new Map()
  // Sync before remapping, so links retain their template relationship.
  for (const layer of layout.layers.filter(layer => layer.linkedPhotoId)) {
    const source = layout.layers.find(source => String(source.uuid) === String(layer.linkedPhotoId))
    layer.imgUrl = source.imgUrl; layer.slot = false
    if (source.origin) layer.origin = structuredClone(source.origin); else delete layer.origin
  }
  for (const layer of layout.layers) {
    layer.uuid = ids.get(String(layer.uuid))
    if (layer.parent && layer.parent !== '-1') layer.parent = ids.get(String(layer.parent))
    if (layer.linkedPhotoId) layer.linkedPhotoId = ids.get(String(layer.linkedPhotoId))
    if (layer.printGroup) {
      if (!groups.has(layer.printGroup)) groups.set(layer.printGroup, randomUUID())
      layer.printGroup = groups.get(layer.printGroup)
    }
  }
  const sourceHash = createHash('sha256').update(JSON.stringify(template)).digest('hex')
  layout.global.collage = { template: 'local-' + sourceHash.slice(0, 16), version: 1, sourceHash, customer: bindings.customer.trim(), printWorkflow: 'separate-sheets' }
  const after = validate(layout)
  if (after.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(after))
  return { layout, idMap: Object.fromEntries(ids), sourceHash }
}
