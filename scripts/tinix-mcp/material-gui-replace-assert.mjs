import assert from 'node:assert/strict'

export const CODES = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'SUBJECT']
export const FRAME_KEYS = [
  'left', 'top', 'width', 'height', 'rotate', 'parent', 'fit',
  'zoom', 'cropX', 'cropY', 'transform', 'mask', 'templateRole',
  'slot', 'printGroup', 'printRole',
]

export function assertOneSlot(before, after, uuid, kind) {
  assert.equal(before.pageHash, after.pageHash, 'PAGE_GLOBAL_CHANGED')
  const a = before.layers
  const b = after.layers
  assert.deepEqual(a.map(w => w.uuid), b.map(w => w.uuid), 'LAYER_ORDER_OR_ID_CHANGED')
  const changed = b.filter((w, i) => w.sha256 !== a[i].sha256).map(w => w.uuid)
  assert.deepEqual(changed, [uuid], 'WRONG_LAYER_CHANGED')
  const old = a.find(w => w.uuid === uuid)
  const next = b.find(w => w.uuid === uuid)
  assert.ok(old && next, 'MISSING_SELECTED_LAYER')
  assert.notEqual(old.imgSha256, next.imgSha256, 'SELECTED_IMAGE_NOT_REPLACED')
  assert.equal(next.fields.templateRole, kind === 'subject' ? 'subject' : 'photo')
  assert.equal(next.fields.slot, true)
  if (kind === 'frame') {
    for (const key of FRAME_KEYS) {
      assert.deepEqual(next.fields[key], old.fields[key], 'CROP_OR_FRAME_CHANGED:' + key)
    }
  } else {
    for (const key of ['rotate', 'parent', 'templateRole', 'slot', 'printGroup', 'printRole']) {
      assert.deepEqual(next.fields[key], old.fields[key], 'SUBJECT_ROLE_CHANGED:' + key)
    }
    assert.equal(next.fields.cutoutEdit, false, 'STALE_SUBJECT_CUTOUT_EDIT')
    if (Number(old.fields.templateBorderMm) > 0) assert.equal(next.fields.stickerBorder, true, 'SUBJECT_BORDER_NOT_APPLIED')
  }
  return { uuid, kind, changedLayers: changed.length, oldImageHash: old.imgSha256, newImageHash: next.imgSha256 }
}

export function assertPersisted(saved, reopened) {
  assert.equal(saved.pageHash, reopened.pageHash, 'PAGE_CHANGED_AFTER_REOPEN')
  assert.deepEqual(saved.layers.map(w => w.uuid), reopened.layers.map(w => w.uuid),
    'LAYER_LIST_CHANGED_AFTER_REOPEN')
  const changes = reopened.layers.filter((w, i) => w.sha256 !== saved.layers[i].sha256).map(w => w.uuid)
  assert.deepEqual(changes, [], 'LAYER_CONTENT_CHANGED_AFTER_REOPEN')
  return { persisted: reopened.layers.length, changed: changes.length }
}
