// [TINIX] Folder order must not determine the suggested role.
import assert from 'node:assert/strict'
import { suggestMaterialRoles } from '../../src/utils/tinix/material-folder'

const image = (name: string, detail: number, transparent = 0) => ({
  name, detail, transparent, ratio: .75, type: 'image/png',
})
const reference = image('camera-1.png', 20)
const background = image('camera-2.png', 2)
const diagram = image('camera-3.png', 11)
const sheet = image('camera-4.png', 30, .55)
assert.deepEqual(suggestMaterialRoles([diagram, background, sheet, reference]), { reference, background, sheet })
assert.equal(suggestMaterialRoles([background, reference, image('similar.png', 19), sheet]).reference, undefined)
assert.equal(suggestMaterialRoles([background, reference, sheet, image('other.png', 30, .55)]).sheet, undefined)
assert.equal(suggestMaterialRoles([background, reference, image('tấm mảnh.png', 30)]).sheet, undefined)

const labeled = image('01_ảnh mẫu hoàn chỉnh.png', 8)
const guide = image('03_sơ đồ bố cục.png', 34)
assert.deepEqual(suggestMaterialRoles([labeled, guide, background, sheet]), { reference: labeled, background, sheet })
console.log('Material folder suggestions verified')
