#!/usr/bin/env node
// [TINIX] Host-only E2E for one missing synthetic asset inside a local .tinix.zip.
// Opens via Tệp -> Mở dự án. Uses real /api/tinix/local-assets/missing and PUT /api/tinix/local-asset.
// No customer media, no production calls, no template-library saves.
// Usage: TINIX_QA_STATIC_ROOT=<backend-static-root> node scripts/tinix-mcp/material-missing-asset-live-qa.mjs JOB_ID [RUNTIME_ROOT]
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, mkdtemp, rm, writeFile, unlink, lstat } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { makeStoredZip } from './qa-project-zip.mjs'
import { staticRootOf, snapshotStatic, awaitCoverSettled, cleanupQaArtifacts,
  resolveRestoredAsset, startQaAssetTracking, recordRestoredAsset } from './qa-artifact-cleanup.mjs'

const require=createRequire(import.meta.url)
const puppeteer=require('../../service/node_modules/puppeteer')
const sharp=require('../../service/node_modules/sharp')
const repoRoot=fileURLToPath(new URL('../../',import.meta.url))
const jobId=process.argv[2]
const runtime=path.resolve(process.argv[3]||path.join(repoRoot,'.runtime','mcp-material'))
const frontend=new URL(process.env.TINIX_APP_URL||'http://127.0.0.1:7183')
const backend=new URL(process.env.TINIX_API_URL||'http://127.0.0.1:7001')
const sha=b=>createHash('sha256').update(b).digest('hex')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const reportDir=path.join(runtime,jobId||'invalid','material-export','missing-asset-qa')
const reportPath=path.join(reportDir,'report.json')
const originalDir=path.join(runtime,jobId||'invalid','result')
const hashes=['draft.json','render.png','report.json']

function guardLocal(url) {
  assert.equal(url.protocol,'http:','QA_HOST_MUST_BE_HTTP')
  assert(['127.0.0.1','localhost'].includes(url.hostname),'QA_HOST_MUST_BE_LOOPBACK')
  assert.equal(url.pathname,'/','QA_HOST_MUST_BE_ORIGIN')
}
function fileName(prefix,id) {return prefix+id+'.png'}
async function present(file) {
  try {const stat=await lstat(file);return stat.isFile()&&!stat.isSymbolicLink()}
  catch(e){if(e?.code==='ENOENT')return false;throw e}
}
async function api(route,body) {
  const r=await fetch(backend.origin+route,{
    method:'POST',redirect:'error',headers:{'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(120000)
  })
  const data=await r.json()
  if(!r.ok||data.code!==200)throw Error('QA_DESIGN_API_FAILED:'+route+':'+r.status)
  return data.result
}
async function chooseOpen(page) {
  await page.$eval('.sd-wenjian',el=>el.closest('.operation-item').click())
  const element=await page.waitForFunction(()=>
    [...document.querySelectorAll('.el-dropdown-menu__item')].find(el=>
      el.getBoundingClientRect().width>0&&el.textContent?.trim().startsWith('Mở dự án')),
    {timeout:12000})
  await element.evaluate(el=>el.click())
}
async function syntheticPng(label,color) {
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">'+
    '<rect width="360" height="260" fill="'+color+'"/>'+
    '<circle cx="95" cy="115" r="53" fill="#ffffff"/>'+
    '<text x="180" y="232" text-anchor="middle" font-size="28" font-family="Arial" fill="#ffffff">'+
    label+'</text></svg>')
  return sharp(svg).png().toBuffer()
}
async function main() {
  assert(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(jobId||''),'VALID_JOB_REQUIRED')
  guardLocal(frontend)
  guardLocal(backend)
  const staticRoot=await staticRootOf(process.env.TINIX_QA_STATIC_ROOT)
  const baseline=await snapshotStatic(staticRoot)
  const original=await Promise.all(hashes.map(n=>readFile(path.join(originalDir,n))))
  const initialHashes=original.map(sha)
  const nonce=randomUUID().replace(/-/g,'')
  const missingUrl='/static/photos/'+fileName('qa-missing-',nonce)
  const existingUrl='/static/photos/'+fileName('qa-existing-',nonce)
  const missingFile=await resolveRestoredAsset(staticRoot,missingUrl)
  const existingFile=await resolveRestoredAsset(staticRoot,existingUrl)
  assert.equal(await present(missingFile),false,'MISSING_QA_ASSET_ALREADY_EXISTS')
  assert.equal(await present(existingFile),false,'SENTINEL_QA_ASSET_ALREADY_EXISTS')
  const work=await mkdtemp(path.join(tmpdir(),'tinix-one-missing-asset-'))
  await mkdir(reportDir,{recursive:true})
  let browser=null,designId=null,assetRecord=null,sentinelCreated=false,cleanupError=null
  const result={jobId, status:'blocked',frontend:frontend.origin,backend:backend.origin,
    scope:'exactly one absent synthetic image and one pre-existing synthetic sentinel',
    testDesignDeleted:false,sourceJobUnchanged:false,expectedMissing:missingUrl,
    existingSentinel:existingUrl}
  const missingBytes=await syntheticPng('MISSING ASSET QA','#195e9d')
  const existingBytes=await syntheticPng('EXISTING QA','#5f7c41')
  const tracked=await startQaAssetTracking(staticRoot,missingUrl,missingBytes)
  assert.equal(tracked.beforeExisted,false)
  try {
    await mkdir(path.dirname(existingFile),{recursive:true})
    await writeFile(existingFile,existingBytes,{flag:'wx'})
    sentinelCreated=true
    const pngData='data:image/png;base64,'+missingBytes.toString('base64')
    browser=await puppeteer.launch({headless:true,protocolTimeout:180000,
      args:['--no-first-run']})
    const page=await browser.newPage()
    const errors=[],observedPuts=[]
    page.on('pageerror',e=>errors.push(String(e?.message||e)))
    await page.evaluateOnNewDocument(()=>{
      Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true})
      Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true})
    })
    await page.setViewport({width:1600,height:1100})
    await page.goto(frontend.origin+'/home',{waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForSelector('.design-canvas',{timeout:120000})
    const sourceLayout=await page.evaluate(()=>{
      const stores=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s
      const base=JSON.parse(JSON.stringify(stores.get('widgetStore').dLayouts[0]))
      if(!base||!base.global||!Array.isArray(base.layers))throw Error('CANVAS_LAYOUT_UNAVAILABLE')
      return base
    })
    const uuid='qa-synthetic-'+nonce
    const image={name:'Synthetic QA image',type:'w-image',uuid,parent:'-1',left:145,top:120,
      width:320,height:230,zoom:1,fit:'contain',cropX:50,cropY:50,transform:'',
      opacity:1,rotate:0,radius:0,mask:'',flip:'',isNinePatch:false,
      sliceData:{ratio:0,left:0},lock:false,setting:[],record:{
        width:320,height:230,minWidth:10,minHeight:10,dir:'all'
      },imgUrl:missingUrl}
    const layout={...sourceLayout,
      global:{...sourceLayout.global,width:800,height:600,backgroundColor:'#f5f5f5ff',
        backgroundImage:'',backgroundGradient:''},
      layers:[image]}
    const coverLayout=structuredClone(layout)
    coverLayout.layers[0].imgUrl=pngData
    const created=await api('/design/save',{title:'Synthetic QA missing asset '+nonce,
      data:JSON.stringify([coverLayout]),width:800,height:600})
    designId=Number(created?.id)
    assert(Number.isSafeInteger(designId)&&designId>0,'QA_TEMP_DESIGN_NOT_CREATED')
    result.temporaryDesignId=designId
    await page.goto(frontend.origin+'/home?id='+designId,
      {waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForSelector('.w-image',{timeout:120000})
    // The archive has TWO image entries, but one is already on disk.
    // Thus /local-assets/missing must return EXACTLY the one target path.
    const packagePayload={format:'tinix-design',version:2,
      title:'Synthetic missing-asset QA '+nonce,
      savedAt:new Date().toISOString(),layouts:[layout],project:{photos:[]}}
    const zip=makeStoredZip([
      {name:'design.json',bytes:Buffer.from(JSON.stringify(packagePayload),'utf8')},
      {name:'assets'+missingUrl,bytes:missingBytes},
      {name:'assets'+existingUrl,bytes:existingBytes},
    ])
    const zipFile=path.join(work,'synthetic-one-missing.tinix.zip')
    await writeFile(zipFile,zip)
    result.archiveHash=sha(zip)
    const missingSeen=page.waitForResponse(r=>{
      const u=new URL(r.url())
      return u.pathname==='/api/tinix/local-assets/missing'&&r.request().method()==='POST'
    },{timeout:60000})
    const putSeen=page.waitForResponse(r=>{
      const u=new URL(r.url())
      return u.pathname==='/api/tinix/local-asset'&&r.request().method()==='PUT'&&
        u.searchParams.get('path')===missingUrl
    },{timeout:60000})
    page.on('request',req=>{
      try {
        const u=new URL(req.url())
        if(u.pathname==='/api/tinix/local-asset'&&req.method()==='PUT')
          observedPuts.push(u.searchParams.get('path'))
      } catch(e){errors.push('REQUEST_CHECK:'+String(e))}
    })
    const [chooser]=await Promise.all([
      page.waitForFileChooser({timeout:15000}),chooseOpen(page)
    ])
    await chooser.accept([zipFile])
    const missingReply=await missingSeen,putReply=await putSeen
    assert.equal(missingReply.ok(),true,'MISSING_CHECK_FAILED')
    const missingData=await missingReply.json()
    assert.deepEqual(missingData.missing,[missingUrl],'EXPECTED_EXACTLY_ONE_MISSING_ASSET')
    assert.deepEqual(missingData.invalid,[],'INVALID_ASSETS_IN_SYNTHETIC_PACKAGE')
    assert.equal(putReply.ok(),true,'RESTORE_PUT_FAILED')
    const putData=await putReply.json()
    assert.equal(putData.written,true,'RESTORE_WAS_NOT_WRITTEN')
    assetRecord=await recordRestoredAsset(staticRoot,tracked,putData)
    assert(assetRecord,'NEW_ASSET_NOT_RECORDED')
    assert.deepEqual(observedPuts,[missingUrl],'UNEXPECTED_ASSET_RESTORE_PUT')
    result.restoredAsset={url:missingUrl,written:true,sha256:assetRecord.sha256,
      byteIdentical:sha(await readFile(missingFile))===sha(missingBytes)}
    assert.equal(result.restoredAsset.byteIdentical,true,'RESTORED_PNG_MISMATCH')
    await page.waitForFunction((id,url)=>{
      const app=document.querySelector('#app')?.__vue_app__
      const ws=app?.config.globalProperties.$pinia._s.get('widgetStore')
      const w=ws?.dWidgets.find(w=>w.uuid===id)
      const img=document.getElementById(id)?.querySelector('img.target')
      return !!w&&w.imgUrl===url&&!!img&&img.complete&&img.naturalWidth===360
    },{timeout:60000},uuid,missingUrl)
    assert.equal(sha(await readFile(existingFile)),sha(existingBytes),'EXISTING_ASSET_OVERWRITTEN')
    result.existingAssetPreserved=true
    result.renderedImage=true
    assert.deepEqual(errors,[],'BROWSER_ERRORS')
    if(process.env.TINIX_QA_CAPTURE==='1') {
      await page.screenshot({path:path.join(reportDir,'synthetic-opened.png'),fullPage:false})
    }
    result.status='pass'
  } catch(e) {
    result.error=String(e?.stack||e)
    result.status='blocked'
  } finally {
    try{if(browser)await browser.close()}
    catch(e){cleanupError='BROWSER_CLOSE_FAILED:'+String(e?.message||e)}
    let coverReady={complete:false,reason:'NO_QA_DESIGN'}
    if(designId) {
      try {
        coverReady=await awaitCoverSettled(staticRoot,designId,{
          ready:async()=>{
            const r=await fetch(backend.origin+'/design/poster?id='+designId,
              {signal:AbortSignal.timeout(7000)})
            const data=await r.json()
            return r.ok&&data.code===200&&data.result?.cover==='/static/'+designId+'-cover.jpg'
          }
        })
      } catch(e){cleanupError='COVER_WAIT_FAILED:'+String(e?.message||e)}
      try {
        await api('/design/poster/del',{id:designId})
        const reply=await fetch(backend.origin+'/design/poster?id='+designId,
          {signal:AbortSignal.timeout(10000)})
        const data=await reply.json()
        assert.notEqual(data.code,200,'QA_DESIGN_STILL_EXISTS')
        result.testDesignDeleted=true
      } catch(e){cleanupError='QA_DESIGN_DELETE_UNVERIFIED:'+String(e?.message||e)}
      if(result.testDesignDeleted) {
        try {
          result.artifactCleanup=await cleanupQaArtifacts({staticRoot,designId,baselineNames:baseline,
            restoredAssets:assetRecord?[assetRecord]:[],coverReady})
          if(result.artifactCleanup.status!=='pass')cleanupError='QA_ARTIFACT_CLEANUP_BLOCKED'
        } catch(e){cleanupError='QA_ARTIFACT_CLEANUP_FAILED:'+String(e?.message||e)}
      }
    }
    // The second image was deliberately created BEFORE opening the ZIP to
    // check the app does not overwrite existing assets. It is not restored.
    // Clean ONLY our uniquely named, byte-identical synthetic sentinel.
    if(sentinelCreated) {
      try {
        assert.equal(await present(existingFile),true,'SYNTHETIC_SENTINEL_NOT_PLAIN_FILE')
        assert.equal(sha(await readFile(existingFile)),sha(existingBytes),'SYNTHETIC_SENTINEL_MODIFIED')
        await unlink(existingFile)
        result.syntheticSentinelDeleted=true
      } catch(e) {cleanupError='SENTINEL_CLEANUP_BLOCKED:'+String(e?.message||e)}
    }
    try {await rm(work,{recursive:true,force:true})}
    catch(e){cleanupError='QA_TEMP_FILES_DELETE_FAILED:'+String(e?.message||e)}
    try {
      const current=await Promise.all(hashes.map(n=>readFile(path.join(originalDir,n))))
      result.sourceHashes=Object.fromEntries(hashes.map((name,i)=>[name,{
        before:initialHashes[i],after:sha(current[i])
      }]))
      result.sourceJobUnchanged=Object.values(result.sourceHashes).every(x=>x.before===x.after)
      if(!result.sourceJobUnchanged)cleanupError='SOURCE_JOB_CHANGED'
    }catch(e){result.sourceJobUnchanged=false;cleanupError='SOURCE_HASH_CHECK_FAILED'}
    result.restoredAssetAbsentAfterCleanup=!(await present(missingFile))
    result.syntheticSentinelAbsentAfterCleanup=!(await present(existingFile))
    if(!result.testDesignDeleted||result.artifactCleanup?.status!=='pass'||
      !result.syntheticSentinelDeleted||!result.sourceJobUnchanged||
      !result.restoredAssetAbsentAfterCleanup||!result.syntheticSentinelAbsentAfterCleanup) {
      result.status='blocked'
    }
    if(cleanupError){result.cleanupError=cleanupError;result.status='blocked'}
    await writeFile(reportPath,JSON.stringify(result,null,2))
    console.log(JSON.stringify({status:result.status,jobId,temporaryDesignId:designId,
      restoredAsset:result.restoredAsset,existingAssetPreserved:result.existingAssetPreserved,
      renderedImage:result.renderedImage,testDesignDeleted:result.testDesignDeleted,
      artifactCleanup:result.artifactCleanup,sourceJobUnchanged:result.sourceJobUnchanged,
      reportPath,...result.error?{error:result.error}:{}},null,2))
    if(result.status!=='pass')process.exitCode=2
  }
}
main().catch(e=>{
  console.error(JSON.stringify({status:'blocked',reason:String(e?.message||e)}))
  process.exitCode=2
})
