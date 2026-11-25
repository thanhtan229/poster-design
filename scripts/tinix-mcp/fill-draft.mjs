// [TINIX] Bind photos to a separate draft with the existing TinixPoster slot and border implementation.
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { instantiate } from '../tinix-instantiate.mjs'
import { createJson } from '../tinix-drafts.mjs'
import { cutoutSubject } from './subject-preview.mjs' // [TINIX]

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')

export async function fillMaterialDraft(source, output, photos, subject, signal) {
  const template = JSON.parse(await readFile(path.join(source, 'draft.json'), 'utf8'))
  const frames = template.layers.filter(layer => layer.templateRole === 'photo' && layer.slot && layer.mask)
  const subjects = template.layers.filter(layer => layer.templateRole === 'subject' && layer.slot)
  if (frames.length !== 6 || subjects.length !== 1 || photos.length !== 6) throw new Error('Expected 6 masked photo slots and 1 subject')
  const ids = new Set(photos.map(photo => photo.id))
  if (ids.size !== 6 || frames.some(layer => !ids.has(layer.uuid))) throw new Error('Photo slot IDs do not match this draft')
  for (const photo of photos) {
    const { format: photoFormat } = await sharp(photo.file, { limitInputPixels: 32000000 }).metadata()
    if (!['jpeg', 'png', 'webp'].includes(photoFormat)) throw new Error('Ảnh khung phải là JPEG, PNG hoặc WebP.')
  }
  // [TINIX] Keep the uncut original alongside the full-size BiRefNet alpha for later editing.
  let subjectCutout
  if (subject.cutout !== subject.source) {
    subjectCutout = await cutoutSubject(subject.source, signal)
    await writeFile(subject.cutout, subjectCutout.png, { flag: 'wx' })
  }
  const { format, hasAlpha } = await sharp(subject.cutout, { limitInputPixels: 32000000 }).metadata()
  if (format !== 'png' || !hasAlpha) throw new Error('SUBJECT cần PNG đã tách nền có kênh alpha.')
  const alpha = await sharp(subject.cutout, { limitInputPixels: 32000000 }).extractChannel('alpha').raw().toBuffer()
  if (!alpha.some(value => value < 16) || !alpha.some(value => value >= 128)) {
    throw new Error('SUBJECT cần có cả vùng nền trong suốt và vùng ảnh rõ.')
  }
  const [anchor] = subjects
  const bindings = { customer: 'TinixPoster draft', slots: Object.fromEntries(photos.map(({ id, file }) => [id, { file }])) }
  bindings.slots[anchor.uuid] = { ...subject, mm: anchor.templateBorderMm ?? 0 } // [TINIX]
  const { layout, idMap } = await instantiate(template, bindings, output)
  // This operation makes a draft copy, with no newly assigned customer or library template record.
  if (template.global.collage === undefined) delete layout.global.collage
  else layout.global.collage = template.global.collage
  signal?.throwIfAborted()
  const { referenceGuide, ...global } = layout.global
  const renderSignal = AbortSignal.any([AbortSignal.timeout(100000), ...(signal ? [signal] : [])])
  const response = await fetch('http://127.0.0.1:7001/api/tinix/export-render', {
    method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, signal: renderSignal,
    body: JSON.stringify({ layout: { ...layout, global }, format: 'png' }),
  })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error('TinixPoster chưa render được bản nháp sau khi thay ảnh.')
  const render = Buffer.from(await response.arrayBuffer())
  signal?.throwIfAborted()
  // [TINIX] Write the draft only after the renderer succeeds.
  await createJson(path.join(output, 'draft.json'), layout)
  await writeFile(path.join(output, 'render.png'), render, { flag: 'wx' })
  return { status: 'rendered', photos: 6, subject: true, borderMm: anchor.templateBorderMm ?? 0, idMap,
    ...(subjectCutout && { subjectCutout: { engine: 'BiRefNet', width: subjectCutout.width, height: subjectCutout.height } }) }
}
