import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertOneSlot, assertPersisted } from './material-gui-replace-assert.mjs'

const frame = (uuid, sha, img) => ({
  uuid, sha256:sha, imgSha256:img, fields:{
    left:10,top:20,width:100,height:130,rotate:0,parent:'group',
    fit:'cover',zoom:1,cropX:null,cropY:null,transform:'',mask:'mask',
    templateRole:'photo',slot:true,printGroup:'group',printRole:'raised',
    templateBorderMm:null,cutoutEdit:false,stickerBorder:false,
  },
})
const subject = (sha,img) => ({
  uuid:'subject',sha256:sha,imgSha256:img,fields:{
    ...frame('f','h','p').fields,left:50,top:70,width:200,height:400,
    templateRole:'subject',cutoutEdit:true,stickerBorder:false,
    templateBorderMm:1,
  },
})
const baseline=()=>({pageHash:'page',layers:[frame('f01','sha-a','a'),frame('f02','sha-b','b'),subject('sha-s','s')]})
const changed = base => structuredClone(base)

test('real picker frame changes exactly one source without crop or order changes',()=>{
  const a=baseline(),b=changed(a)
  b.layers[0].sha256='sha-a1';b.layers[0].imgSha256='new-a'
  const info=assertOneSlot(a,b,'f01','frame')
  assert.equal(info.changedLayers,1)
})
test('other frame mutation is rejected even if selected frame changed',()=>{
  const a=baseline(),b=changed(a)
  b.layers[0].sha256='sha-a1';b.layers[0].imgSha256='new-a'
  b.layers[1].sha256='sha-b1'
  assert.throws(()=>assertOneSlot(a,b,'f01','frame'),/WRONG_LAYER_CHANGED/)
})
test('crop mutation is rejected',()=>{
  const a=baseline(),b=changed(a)
  b.layers[0].sha256='sha-a1';b.layers[0].imgSha256='new-a'
  b.layers[0].fields.cropX=50
  assert.throws(()=>assertOneSlot(a,b,'f01','frame'),/CROP_OR_FRAME_CHANGED:cropX/)
})
test('SUBJECT must be replaced independently, old cutout cleared and border retained',()=>{
  const a=baseline(),b=changed(a)
  b.layers[2].sha256='sha-s1';b.layers[2].imgSha256='new-s'
  b.layers[2].fields.cutoutEdit=false
  b.layers[2].fields.stickerBorder=true
  assertOneSlot(a,b,'subject','subject')
})
test('SUBJECT stale cutout fails',()=>{
  const a=baseline(),b=changed(a)
  b.layers[2].sha256='sha-s1';b.layers[2].imgSha256='new-s'
  b.layers[2].fields.stickerBorder=true
  assert.throws(()=>assertOneSlot(a,b,'subject','subject'),/STALE_SUBJECT_CUTOUT_EDIT/)
})
test('save/reopen must preserve every layer',()=>{
  const a=baseline(),b=changed(a)
  assert.equal(assertPersisted(a,b).persisted,3)
  b.layers[1].sha256='unexpected'
  assert.throws(()=>assertPersisted(a,b),/LAYER_CONTENT_CHANGED_AFTER_REOPEN/)
})
