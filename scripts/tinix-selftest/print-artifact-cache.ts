// [TINIX] Cache lifetime and production inputs affecting reuse.
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { createPrintArtifactCache, printArtifactKey } from '../../service/src/tinix/printArtifactCache'

let now = 0
const cache = createPrintArtifactCache(4,10,()=>now)
const bytes = Buffer.from('aa')
cache.set('A',bytes)
cache.set('B',bytes)
assert.strictEqual(cache.get('A'),bytes)
cache.set('C',bytes)
assert.strictEqual(cache.get('B'),undefined)
cache.set(undefined,bytes)
assert.strictEqual(cache.get(undefined),undefined)
now = 10
assert.strictEqual(cache.get('A'),undefined)

const root = path.resolve('fixture-static')
fs.mkdirSync(root,{recursive:true})
const asset = path.join(root,'leaf.png')
fs.writeFileSync(asset,'one')
const origin = 'http://127.0.0.1:7001'
const layout = { global:{width:100,height:150,referenceGuide:'editor-only'}, layers:[{ imgUrl:'/static/leaf.png', left:4 }] }
const key = (page = layout, options:unknown = ['svg',.3], renderer = 'build-A') => printArtifactKey(page,options,root,origin,renderer)
const original = key()
assert(original)
assert.strictEqual(original,key({...layout,global:{...layout.global,referenceGuide:'new guide'}}))
assert.notStrictEqual(original,key(layout,['svg',.4]))
assert.notStrictEqual(original,key(layout,['svg',.3],'build-B'))
assert.notStrictEqual(original,key({...layout,layers:[{...layout.layers[0],left:5}]}))
fs.writeFileSync(asset,'two longer')
assert.notStrictEqual(original,key())
assert.strictEqual(key({...layout,layers:[{imgUrl:'https://example.com/leaf.png',left:4}]}),undefined)
const nested = { ...layout, layers:[{imgUrl:'data:image/svg+xml;base64,' + Buffer.from('<svg><image href="/static/missing.jpg"/></svg>').toString('base64'),left:4}] }
assert.strictEqual(key(nested),undefined)
console.log('PASS artifact reuse, invalidation, expiry, LRU and unverified assets')
