import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { staticRootOf, matchesQaScreenshot, snapshotStatic, resolveRestoredAsset,
  startQaAssetTracking, recordRestoredAsset, awaitCoverSettled, cleanupQaArtifacts } from './qa-artifact-cleanup.mjs'

async function fixture(fn) {
  const outer=await mkdtemp(join(tmpdir(),'tinix-qa-artifacts-'))
  const root=join(outer,'static')
  await mkdir(root)
  try{await fn(root)}finally{await rm(outer,{recursive:true,force:true})}
}
async function exists(p){try{await lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}

test('strict ID ownership, negative and similar ID filenames are protected',async()=>{
  assert(matchesQaScreenshot('701-cover.jpg',701))
  assert(matchesQaScreenshot('701-screenshot.png',701))
  assert(matchesQaScreenshot('701-screenshot-a1_b2.png',701))
  assert(!matchesQaScreenshot('7010-cover.jpg',701))
  assert(!matchesQaScreenshot('701-design.png',701))
  assert(!matchesQaScreenshot('701-cover.jpg.bak',701))
  assert(!matchesQaScreenshot('foo-701-cover.jpg',701))
  assert.throws(()=>matchesQaScreenshot('1-cover.jpg',-1),/INVALID_QA_DESIGN_ID/)
})

test('cleanup keeps unrelated and pre-existing files, deletes only new QA outputs',async()=>{
  await fixture(async root=>{
    await writeFile(join(root,'701-cover.jpg'),'preexisting')
    await writeFile(join(root,'702-cover.jpg'),'unrelated')
    const before=await snapshotStatic(root)
    const name='704'
    await writeFile(join(root,name+'-cover.jpg'),'cover')
    await writeFile(join(root,name+'-screenshot.png'),'full')
    await writeFile(join(root,name+'-screenshot-xyz.png'),'extra')
    const coverReady=await awaitCoverSettled(root,name,{timeoutMs:800,pollMs:25,stableMs:80})
    assert(coverReady.complete)
    const report=await cleanupQaArtifacts({
      staticRoot:root,designId:name,baselineNames:before,coverReady,
    })
    assert.equal(report.status,'pass',JSON.stringify(report))
    assert.equal(report.deleted.length,3)
    assert(!await exists(join(root,name+'-cover.jpg')))
    assert(!await exists(join(root,name+'-screenshot.png')))
    assert(!await exists(join(root,name+'-screenshot-xyz.png')))
    assert(await exists(join(root,'701-cover.jpg')))
    assert(await exists(join(root,'702-cover.jpg')))
  })
})

test('refuses PASS when expected cover was never created',async()=>{
  await fixture(async root=>{
    const before=await snapshotStatic(root)
    const ready=await awaitCoverSettled(root,55,{timeoutMs:90,pollMs:20,stableMs:40})
    assert.equal(ready.complete,false)
    const result=await cleanupQaArtifacts({staticRoot:root,designId:55,
      baselineNames:before,coverReady:ready})
    assert.equal(result.status,'blocked')
  })
})

test('restored assets deleted only with recorded new-file hash and successful backend acknowledgement',async()=>{
  await fixture(async root=>{
    const dir=join(root,'photos')
    await mkdir(dir)
    const a=Buffer.from('test bytes'),url='/static/photos/test-qa-001.png'
    const track=await startQaAssetTracking(root,url,a)
    assert.equal(track.beforeExisted,false)
    const file=join(dir,'test-qa-001.png')
    await writeFile(file,a)
    const record=await recordRestoredAsset(root,track,{written:true})
    assert.equal(record.url,url)
    await writeFile(join(root,'900-cover.jpg'),'cover')
    await writeFile(join(root,'900-screenshot.png'),'shot')
    const check=await cleanupQaArtifacts({staticRoot:root,designId:900,baselineNames:new Set(),
      restoredAssets:[record],coverReady:{complete:true}})
    assert.equal(check.status,'pass')
    assert(!await exists(file))
    const existing=Buffer.from('original')
    await writeFile(file,existing)
    const other=await startQaAssetTracking(root,url,a)
    assert.equal(other.beforeExisted,true)
    assert.equal(await recordRestoredAsset(root,other,{written:true}),null)
    assert.equal((await readFile(file)).toString(),'original')
  })
})

test('changed asset is preserved and blocks QA',async()=>{
  await fixture(async root=>{
    const dir=join(root,'photos')
    await mkdir(dir)
    const url='/static/photos/changed.png',original=Buffer.from('new qa image')
    const attempt=await startQaAssetTracking(root,url,original)
    await writeFile(join(dir,'changed.png'),original)
    const rec=await recordRestoredAsset(root,attempt,{written:true})
    await writeFile(join(dir,'changed.png'),Buffer.from('externally edited'))
    await writeFile(join(root,'811-cover.jpg'),'cover')
    await writeFile(join(root,'811-screenshot.png'),'shot')
    const report=await cleanupQaArtifacts({staticRoot:root,designId:811,baselineNames:new Set(),
      restoredAssets:[rec],coverReady:{complete:true}})
    assert.equal(report.status,'blocked')
    assert(await exists(join(dir,'changed.png')))
  })
})

test('rejects unknown static root and unsafe asset path',async()=>{
  await fixture(async root=>{
    assert.equal(await staticRootOf(root),await staticRootOf(resolve(root)))
    await assert.rejects(staticRootOf('/'),/MUST_END_STATIC_OR_CACHE/)
    await assert.rejects(resolveRestoredAsset(root,'/static/photos/../../private.png'),/UNSAFE_QA_ASSET_URL/)
    await assert.rejects(resolveRestoredAsset(root,'/static/photos/a%2fprivate.png'),/UNSAFE_QA_ASSET_URL/)
    await assert.rejects(resolveRestoredAsset(root,'/static/templates/image.png'),/UNSAFE_QA_ASSET_URL/)
    await assert.rejects(resolveRestoredAsset(root,'https://example.com/static/photos/x.png'),/UNSAFE_QA_ASSET_URL/)
  })
})


test('rejects symlinked asset directory so cleanup cannot escape root',async()=>{
  await fixture(async root=>{
    const outside=join(root,'..','private')
    await mkdir(outside)
    await symlink(outside,join(root,'photos'),'dir')
    await assert.rejects(resolveRestoredAsset(root,'/static/photos/customer.png'),/UNSAFE_ASSET_PARENT/)
  })
})

test('pre-existing design-ID cover is never removed, blocks success',async()=>{
  await fixture(async root=>{
    await writeFile(join(root,'901-cover.jpg'),'existing cover')
    const baseline=await snapshotStatic(root)
    await writeFile(join(root,'901-screenshot.png'),'fresh')
    const report=await cleanupQaArtifacts({staticRoot:root,designId:901,
      baselineNames:baseline,coverReady:{complete:true}})
    assert.equal(report.status,'blocked')
    assert(await exists(join(root,'901-cover.jpg')))
    assert(!await exists(join(root,'901-screenshot.png')))
  })
})
