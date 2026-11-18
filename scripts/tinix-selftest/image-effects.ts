import assert from 'node:assert/strict'
import { imageEffects, imageFilterStyle, resolveLinkedImage, syncLinkedImages, remapImageLinks } from '../../src/utils/tinix/image-effects'
import { swapToOriginalInData } from '../../src/utils/tinix/photo-source'
import { countPhotoSlots } from '../../service/src/tinix/templateSlots'
const main:any={uuid:'main',type:'w-image',slot:true,imgUrl:'web',origin:{proxy:'web',original:'hq'},effects:{grayscale:true}}
const bg:any={uuid:'bg',type:'w-image',slot:true,linkedPhotoId:'main',imgUrl:'old',width:1000,height:1000,effects:{blur:12}}
const layers=[bg,main]
assert.equal(countPhotoSlots(JSON.stringify([{layers} ])),1)
syncLinkedImages(layers);assert.equal(bg.slot,false);assert.equal(bg.imgUrl,'web');assert.equal(bg.origin.original,'hq');assert.equal(imageEffects(bg).grayscale,false)
assert.equal(imageEffects({}).brightness,100);assert.match(imageFilterStyle(bg).filter,/blur\(12px\)/)
main.imgUrl='new';delete main.origin;syncLinkedImages(layers);assert.equal(bg.imgUrl,'new');assert.equal(bg.origin,undefined)
const copy=JSON.parse(JSON.stringify(layers));remapImageLinks(copy,new Map([['main','copy-main']]));assert.equal(copy[0].linkedPhotoId,'copy-main')
main.origin={proxy:'new',original:'original'};swapToOriginalInData(layers);assert.equal(bg.imgUrl,'original');assert.equal(main.imgUrl,'original')
assert.equal(resolveLinkedImage({uuid:'x',linkedPhotoId:'missing'},layers).uuid,'x')
const cycle:any[]=[{uuid:'a',linkedPhotoId:'b'},{uuid:'b',linkedPhotoId:'a'}];assert.ok(resolveLinkedImage(cycle[0],cycle))
console.log('PASS appearance defaults, linked slot count, replace, HQ export, remap, missing/cyclic links')

import { photoRole, templatePhotoStatus } from '../../src/utils/tinix/template-photo'
assert.equal(photoRole({slot:true}),'main')
assert.equal(photoRole({slot:true,linkedPhotoId:'main'}),'linked')
assert.equal(templatePhotoStatus([{uuid:'main',type:'w-image',slot:true},{uuid:'bg',type:'w-image',linkedPhotoId:'main'}]).count,1)
assert.equal(templatePhotoStatus([{type:'w-image',linkedPhotoId:'missing'}]).issues.length,1)
assert.equal(templatePhotoStatus([{uuid:'main',type:'w-image',slot:true,hidden:true},{type:'w-image',linkedPhotoId:'main'}]).issues.length,1)
console.log('PASS template roles and missing/hidden source diagnostics')
