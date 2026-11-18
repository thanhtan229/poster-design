import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { instantiate } from './tinix-instantiate.mjs'
import { apply } from './tinix-drafts.mjs'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const dir = await mkdtemp(path.join(os.tmpdir(), 'tinix-instantiate-'))
try {
  await sharp({ create: { width: 20, height: 10, channels: 3, background: '#f00' } }).png().toFile(path.join(dir, 'photo.png'))
  const layer = (uuid, extra) => ({ uuid, left: 0, top: 0, width: 100, height: 100, parent: '-1', ...extra })
  const template = { global: { width: 600, height: 400 }, layers: [layer('group', { type: 'w-group' }), layer('photo', { type: 'w-image', slot: true, templateRole: 'photo', printGroup: 'p', imgUrl: 'old', parent: 'group' }), layer('link', { type: 'w-image', linkedPhotoId: 'photo', imgUrl: 'old' }), layer('text', { type: 'w-text', templateRole: 'text', text: 'old' }), layer('fixed', { type: 'w-image', imgUrl: 'fixed', printGroup: 'p' })] }
  const original = JSON.stringify(template)
  const bindings = { customer: 'One', slots: { photo: { file: 'photo.png' }, text: { text: '<b>Tiếng Việt</b>\nDòng 2' } } }
  const first = await instantiate(template, bindings, dir), second = await instantiate(template, { ...bindings, customer: 'Two' }, dir)
  assert.equal(JSON.stringify(template), original)
  assert.notDeepEqual(first.idMap, second.idMap)
  const photo = first.layout.layers.find(l => l.uuid === first.idMap.photo), linked = first.layout.layers.find(l => l.uuid === first.idMap.link)
  assert.equal(photo.parent, first.idMap.group); assert.equal(linked.linkedPhotoId, photo.uuid); assert.equal(linked.imgUrl, photo.imgUrl)
  assert.equal(first.layout.layers.find(l => l.uuid === first.idMap.fixed).imgUrl, 'fixed')
  assert.equal(photo.printGroup, first.layout.layers.find(l => l.uuid === first.idMap.fixed).printGroup); assert.notEqual(photo.printGroup, 'p')
  const changedPhoto = apply(first.layout, [{ action: 'update', id: photo.uuid, changes: { imgUrl: 'new-photo', origin: { proxy: 'new-photo', original: 'hq-photo' } } }])
  assert.equal(changedPhoto.layers.find(l => l.uuid === linked.uuid).imgUrl, 'new-photo')
  assert.deepEqual(changedPhoto.layers.find(l => l.uuid === linked.uuid).origin, { proxy: 'new-photo', original: 'hq-photo' })
  assert.notEqual(linked.imgUrl, 'new-photo')
  assert.equal(first.layout.layers.find(l => l.uuid === first.idMap.text).text, '&lt;b&gt;Tiếng Việt&lt;/b&gt;<br>Dòng 2')
  assert.equal(first.sourceHash, second.sourceHash)
  first.layout.layers[0].width = 1; assert.equal(second.layout.layers[0].width, 100)
  await assert.rejects(instantiate(template, { customer: 'Missing', slots: {} }, dir), /Missing slot/)
  await assert.rejects(instantiate(template, { ...bindings, slots: { ...bindings.slots, unknown: {} } }, dir), /Unknown/)
  console.log('PASS instantiate: independent IDs, links, parents, print groups, literal text, missing/unknown slots')
} finally { await rm(dir, { recursive: true, force: true }) }
