#!/usr/bin/env node
// [TINIX] Seven real editor "Thay ảnh" clicks against an imported material draft.
// Runs ONLY on the TinixPoster host with a local test service (e.g. 7183).
// Uses synthetic picker photos; intercepts ALL BiRefNet/asset uploads; never writes to photo/template libraries.
// Retains no customer photos outside the existing host. Removes its temporary design even on failure.
// Usage: node scripts/tinix-mcp/material-gui-replace-seven.mjs JOB_ID [MCP_RUNTIME_ROOT]
// Requires: <root>/<job>/material-export/material.zip, TinixPoster GUI + renderer on local host.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { instantiate } from '../tinix-instantiate.mjs'
import { prepareMaterialDraft } from '../lib/material-archive-cli.mjs'
import { readMaterialJob } from './subject-edit.mjs'
import { CODES, assertOneSlot, assertPersisted } from './material-gui-replace-assert.mjs'
import { staticRootOf, snapshotStatic, awaitCoverSettled, cleanupQaArtifacts,
  startQaAssetTracking, recordRestoredAsset } from './qa-artifact-cleanup.mjs'

const require = createRequire(import.meta.url)
const puppeteer = require('../../service/node_modules/puppeteer')
const sharp = require('../../service/node_modules/sharp')
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const jobId = process.argv[2]
const runtime = path.resolve(process.argv[3] || path.join(ROOT, '.runtime', 'mcp-material'))
const base = new URL(process.env.TINIX_APP_URL || 'http://127.0.0.1:7183')
assert.equal(base.protocol, 'http:', 'TEST_SERVICE_MUST_BE_HTTP_LOOPBACK')
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'TEST_SERVICE_MUST_BE_LOOPBACK')
assert(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(jobId || ''), 'JOB_ID_REQUIRED')
assert.equal(base.pathname, '/', 'TEST_SERVICE_MUST_BE_ORIGIN')
const origin = base.origin
// Vite port 7183 serves the UI; its /design and /api endpoints normally live on port 7001.
const apiBase = new URL(process.env.TINIX_API_URL || 'http://127.0.0.1:7001')
assert.equal(apiBase.protocol, 'http:')
assert(['127.0.0.1', 'localhost'].includes(apiBase.hostname), 'API_MUST_BE_LOOPBACK')
assert.equal(apiBase.pathname, '/')
const sourceDir = path.join(runtime, jobId, 'result')
const kit = path.join(runtime, jobId, 'material-export', 'material.zip')
const output = path.join(runtime, jobId, 'material-export', 'gui-seven-qa')
const outputReport = path.join(output, 'report.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const dataPng = value => {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) throw Error('PHOTO_SOURCE_PNG_REQUIRED')
  return Buffer.from(value.slice('data:image/png;base64,'.length), 'base64')
}
const responseJson = value => ({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS' }, body: JSON.stringify({code:200,result:value}) })

function pageSnapshot() {
  return async () => {
    const app = document.querySelector('#app')?.__vue_app__
    const stores = app?.config.globalProperties.$pinia._s
    const ws = stores.get('widgetStore'), cs = stores.get('canvasStore')
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2,'0')).join('')
    const fields = w => Object.fromEntries([
      'left', 'top', 'width', 'height', 'rotate', 'parent', 'fit', 'zoom',
      'cropX', 'cropY', 'transform', 'mask', 'templateRole', 'slot',
      'printGroup', 'printRole', 'templateBorderMm',
    ].map(k => [k, w[k] ?? null]).concat([
      ['cutoutEdit', Boolean(w.cutoutEdit)], ['stickerBorder', Boolean(w.stickerBorder)]
    ]))
    const layers = await Promise.all(ws.dWidgets.map(async w => ({
      uuid:String(w.uuid), sha256:await digest(JSON.stringify(w)),
      imgSha256:await digest(String(w.imgUrl || '')), fields:fields(w),
    })))
    return { pageHash:await digest(JSON.stringify(cs.dPage)), layers }
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function capture(page) { return page.evaluate(pageSnapshot()) }
async function rest(route, body) {
  const r = await fetch(apiBase.origin + route, { method: 'POST', redirect:'error',
    headers: {'content-type':'application/json'}, body:JSON.stringify(body),
    signal:AbortSignal.timeout(120000) })
  const res = await r.json()
  if (!r.ok || (typeof res.code === 'number' && res.code !== 200)) {
    throw Error('TINIX_API_FAILED:' + route + ':' + r.status)
  }
  return typeof res.code === 'number' ? res.result : res
}
async function makeFixture(code, color) {
  const label = code === 'SUBJECT' ? 'SUBJECT QA' : code + ' QA'
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">' +
    '<rect width="360" height="260" fill="' + color + '"/>' +
    '<rect x="14" y="14" width="332" height="232" fill="none" stroke="#fff" stroke-width="9"/>' +
    '<text x="180" y="142" text-anchor="middle" font-size="54" fill="white" font-family="Arial" font-weight="bold">' +
    label + '</text></svg>')
  return await sharp(svg).png().toBuffer()
}
async function makeTransparentSubject() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360">' +
    '<ellipse cx="120" cy="72" rx="57" ry="62" fill="#5cbe9e"/>' +
    '<rect x="39" y="126" width="162" height="180" rx="70" fill="#3977c4"/>' +
    '<path d="M72 303 H168 L187 351 H53 Z" fill="#1e3057"/>' +
    '</svg>')
  return sharp(svg).png().toBuffer()
}
async function makeBorderSubject() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="272" height="392">' +
    '<ellipse cx="136" cy="88" rx="64" ry="68" fill="#5cbe9e" stroke="white" stroke-width="11"/>' +
    '<rect x="51" y="142" width="170" height="184" rx="74" fill="#3977c4" stroke="white" stroke-width="11"/>' +
    '<path d="M87 319 H185 L209 369 H63 Z" fill="#1e3057" stroke="white" stroke-width="11"/></svg>')
  return sharp(svg).png().toBuffer()
}
async function selectLayer(page, uuid) {
  // The actual replacement and image choice use real GUI controls. Selection
  // is made by UUID because nested collage groups can intercept canvas clicks.
  await page.evaluate(uuid => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetStore')
    store.selectWidget({uuid})
  }, uuid)
  await page.waitForFunction(uuid => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties.$pinia._s.get('widgetStore')
    return store?.dActiveElement?.uuid === uuid &&
      !!document.querySelector('#w-image-style button, #w-image-style .el-button')
  }, {timeout:30000},uuid)
}
async function choosePicker(page, index) {
  const buttons = await page.$$('#w-image-style button')
  let button
  for (const handle of buttons) {
    const label = await handle.evaluate(el => el.textContent?.trim() || '')
    if (/Thay ảnh|Replace|替换图片/i.test(label)) { button=handle; break }
  }
  if (!button) throw Error('GUI_REPLACE_BUTTON_NOT_FOUND')
  assert.equal(await button.evaluate(el=>el.disabled),false,'GUI_REPLACE_BUTTON_DISABLED')
  await button.click()
  await page.waitForFunction(() => [...document.querySelectorAll('.el-dialog')]
    .some(d=>d.getBoundingClientRect().width>0 && d.querySelectorAll('.img-list-wrap .list__img').length===7),
    {timeout:45000})
  const items = await page.$$('.el-dialog .img-list-wrap .list__img')
  if (items.length !== 7) throw Error('PHOTO_PICKER_FIXTURES_MISSING:' + items.length)
  await items[index].click()
  await page.waitForFunction(() => ![...document.querySelectorAll('.el-dialog')]
    .some(d=>d.getBoundingClientRect().width>0 && d.querySelector('.img-list-wrap')),
    {timeout:30000})
}

// [TINIX] The editor persists projects through the File menu as a local ZIP.
async function chooseFileMenu(page, label) {
  await page.$eval('.sd-wenjian', icon => icon.closest('.operation-item').click())
  const item = await page.waitForFunction(label => [...document.querySelectorAll('.el-dropdown-menu__item')]
    .find(el => el.getBoundingClientRect().width > 0 && el.textContent?.trim().startsWith(label)),
  { timeout: 10000 }, label)
  await item.evaluate(el => el.click())
}

async function findSavedProject(directory) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const archive = (await readdir(directory)).find(name => name.endsWith('.tinix.zip'))
    if (archive) return path.join(directory, archive)
    await sleep(250)
  }
  throw Error('GUI_PROJECT_DOWNLOAD_MISSING')
}
async function main() {
  // The host MUST provide the same static root configured for the local backend.
  // Refuse to create a QA design if cleanup ownership cannot be established.
  const staticRoot = await staticRootOf(process.env.TINIX_QA_STATIC_ROOT)
  const baselineNames = await snapshotStatic(staticRoot)
  await mkdir(output,{recursive:true})
  const originalFiles = await Promise.all(['draft.json','render.png','report.json'].map(n=>readFile(path.join(sourceDir,n))))
  const originalChecksums = originalFiles.map(sha)
  const entry = await readMaterialJob(runtime,jobId)
  assert.equal(entry.report.photoSlots?.length,6,'REQUIRES_SIX_PHOTOS')
  assert.ok(entry.subject?.cutoutEdit?.cutoutUrl, 'REQUIRES_EDITED_SUBJECT')
  const opened = await prepareMaterialDraft(kit)
  assert.equal(opened.report?.status,'ready','EXPORTED_KIT_FAILED_IMPORT')
  assert.equal(opened.report.photoSlots?.length,6,'EXPORTED_KIT_MISSING_PHOTOS')
  const work=await mkdtemp(path.join(tmpdir(),'tinix-gui-seven-'))
  let browser=null, designId=null, cleanupError=null
  const assetAttempts = new Map(), restoredAssets = [], assetTasks = []
  const result = { status:'blocked',jobId, app:origin, cases:[], testDesignDeleted:false,
    sourceJobUnchanged:false, imagesStoredInLibrary:false,
    mediaRequestsMocked:true, realBiRefNetTested:false,
    notes:'Real picker UI actions, synthetic images and isolated subject cutout/upload responses.' }
  try {
    const bindings={}
    const expectedIds={}
    for (const slot of opened.report.photoSlots) {
      const previous=entry.report.photoSlots.find(x=>x.code===slot.code)
      assert.ok(previous,'MISSING_ORIGINAL_CODE:'+slot.code)
      const old=entry.layout.layers.find(w=>w.uuid===previous.id && w.templateRole==='photo')
      assert.ok(old,'MISSING_SOURCE_PHOTO:'+slot.code)
      const file=path.join(work,slot.code+'.png')
      await writeFile(file,dataPng(old.imgUrl))
      bindings[slot.id]={file}
    }
    const subjectId=opened.draft.layers.find(w=>w.slot && w.templateRole==='subject')?.uuid
    assert.ok(subjectId,'MISSING_IMPORTED_SUBJECT')
    const subjectSource=path.join(work,'subject-source.png')
    const subjectAlpha=path.join(work,'subject-alpha.png')
    await writeFile(subjectSource,dataPng(entry.subject.cutoutEdit.sourceUrl))
    await writeFile(subjectAlpha,dataPng(entry.subject.cutoutEdit.cutoutUrl))
    bindings[subjectId]={ source:subjectSource,cutout:subjectAlpha,
      mm:entry.subject.templateBorderMm??0 }
    const reimported=await instantiate(opened.draft,{customer:'LOCAL QA ONLY',slots:bindings},work)
    for (const slot of opened.report.photoSlots) {
      const oldId=entry.report.photoSlots.find(x=>x.code===slot.code).id
      const old=entry.layout.layers.find(w=>w.uuid===oldId)
      const next=reimported.layout.layers.find(w=>w.uuid===reimported.idMap[slot.id])
      assert.ok(next && old,'REIMPORT_BINDING_MISSING:'+slot.code)
      for (const key of ['fit','zoom','cropX','cropY','transform','imgRotate']) {
        if (Object.prototype.hasOwnProperty.call(old,key)) next[key]=structuredClone(old[key])
        else delete next[key]
      }
      if (['F01','F05'].includes(slot.code)) {
        assert.equal(next.fit,'cover')
        assert.equal(next.zoom,1)
        assert.ok(next.cropX===undefined && next.cropY===undefined)
        assert.equal(next.transform,'')
      }
      expectedIds[slot.code]=next.uuid
    }
    expectedIds.SUBJECT=reimported.idMap[subjectId]
    assert.ok(expectedIds.SUBJECT,'MISSING_SUBJECT_BINDING')
    const created=await rest('/design/save',{title:'QA 7 slots temporary - '+jobId.slice(0,8),
      data:JSON.stringify([reimported.layout]),width:reimported.layout.global.width,
      height:reimported.layout.global.height})
    designId=Number(created?.id)
    assert(Number.isSafeInteger(designId)&&designId>0,'TEMP_DESIGN_NOT_CREATED')
    result.temporaryDesignId=designId

    const palettes=['#c84747','#1b7b87','#5e5eb2','#c07b25','#78965e','#963d83','#3274b1']
    const fixtures=new Map()
    for(let i=0;i<CODES.length;i++)fixtures.set('/__tinix_qa__/'+CODES[i]+'.png',
      await makeFixture(CODES[i],palettes[i]))
    fixtures.set('/__tinix_qa__/subject-cutout.png',await makeTransparentSubject())
    fixtures.set('/__tinix_qa__/subject-border.png',await makeBorderSubject())
    const images=CODES.map((code,i)=>({ id:9900+i,width:360,height:260,
      url:origin+'/__tinix_qa__/'+code+'.png',thumb:origin+'/__tinix_qa__/'+code+'.png',
      created_time:'2026-01-01',user_id:0 }))
    let uploads=0,cutouts=0,pickerCalls=0
    browser=await puppeteer.launch({headless:true,args:['--no-first-run'],protocolTimeout:180000})
    const page=await browser.newPage(),errors=[]
    const blockedExternalHosts=new Set()
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    })
    const downloadDir=path.join(work,'downloads')
    await mkdir(downloadDir)
    const cdp=await page.createCDPSession()
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir})
    page.on('pageerror',err=>errors.push(String(err.message||err)))
    page.on('response',res => {
      const attempt=assetAttempts.get(res.request())
      if(!attempt)return
      const task=(async()=>{
        if(!res.ok())throw Error('QA_LOCAL_ASSET_RESTORE_FAILED_HTTP')
        const response=await res.json()
        const recorded=await recordRestoredAsset(staticRoot,attempt,response)
        if(recorded)restoredAssets.push(recorded)
        else if(response.written===true && !attempt.beforeExisted)throw Error('QA_RESTORED_ASSET_NOT_VERIFIED')
        assetAttempts.delete(res.request())
      })().catch(e=>errors.push('RESTORED_ASSET:'+String(e.message||e)))
      assetTasks.push(task)
    })
    await page.setViewport({width:1700,height:1200})
    await page.setRequestInterception(true)
    page.on('request',async req=>{
      try {
        const url=new URL(req.url())
        if(req.method()==='OPTIONS' && /\/api\/(file\/upload|tinix\/cutout\/birefnet)$/.test(url.pathname)) {
          return await req.respond({status:204,headers:{'access-control-allow-origin':'*',
            'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}})
        }
        // Track exact assets a local .tinix.zip open may write. Only delete if
        // absent before this request, server said written:true and hash still matches.
        if(url.pathname==='/api/tinix/local-asset' && req.method()==='PUT') {
          const bytes=await req.content()
          const attempt=await startQaAssetTracking(staticRoot,url.searchParams.get('path'),bytes && Buffer.from(bytes))
          assetAttempts.set(req,attempt)
        }
        if(url.pathname.includes('/design/user/image') && req.method()==='GET') {
          pickerCalls++
          // [TINIX] Mimic the end of pagination when the picker is reopened.
          const list=Number(url.searchParams.get('page') || 1) === 1 ? images : []
          return await req.respond(responseJson({list,total:7}))
        }
        if(fixtures.has(url.pathname) && req.method()==='GET') {
          return await req.respond({status:200,contentType:'image/png',body:fixtures.get(url.pathname),
            headers:{'access-control-allow-origin':'*'}})
        }
        if(url.pathname.endsWith('/api/tinix/cutout/birefnet') && req.method()==='POST') {
          cutouts++
          return await req.respond({status:200,contentType:'image/png',
            body:fixtures.get('/__tinix_qa__/subject-cutout.png'),
            headers:{'access-control-allow-origin':'*'}})
        }
        if(url.pathname.endsWith('/api/file/upload') && req.method()==='POST') {
          uploads++
          assert(uploads<=2,'UNEXPECTED_UPLOAD_REQUEST')
          return await req.respond(responseJson({
            url:origin+'/__tinix_qa__/'+(uploads===1?'subject-cutout.png':'subject-border.png')
          }))
        }
        if((url.protocol==='http:'||url.protocol==='https:') &&
          !['localhost','127.0.0.1'].includes(url.hostname)) {
          // [TINIX] Local QA deliberately blocks public assets without treating a blocked fetch as a page exception.
          blockedExternalHosts.add(url.hostname)
          return await req.abort()
        }
        return await req.continue()
      } catch(err){errors.push('INTERCEPT:'+String(err.message||err));try{await req.abort()}catch{}}
    })
    await page.goto(origin+'/home?id='+designId,{waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForSelector('.w-image',{timeout:120000})
    const initial=await capture(page)
    assert(initial.layers.length>35,'MATERIAL_LAYERS_NOT_LOADED')
    for(let i=0;i<CODES.length;i++) {
      const code=CODES[i],uuid=expectedIds[code]
      result.activeCase=code
      assert(initial.layers.some(l=>l.uuid===uuid),'IMPORTED_SLOT_NOT_RENDERED:'+code)
      await selectLayer(page,uuid)
      await sleep(200)
      const before=await capture(page)
      await choosePicker(page,i)
      const target=code==='SUBJECT'
        ? origin+'/__tinix_qa__/'+(Number(entry.subject.templateBorderMm)>0?'subject-border.png':'subject-cutout.png')
        : images[i].url
      await page.waitForFunction(({uuid,url})=>{
        const ws=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia._s.get('widgetStore')
        const w=ws?.dWidgets.find(it=>it.uuid===uuid)
        return w?.imgUrl===url && (w.templateRole!=='subject'||(!w.cutoutEdit&&w.subjectFrame))
      },{timeout:120000},{uuid,url:target})
      await sleep(350)
      const after=await capture(page)
      const test=assertOneSlot(before,after,uuid,code==='SUBJECT'?'subject':'frame')
      assert.equal(after.layers.find(l=>l.uuid===uuid)?.imgSha256,sha(Buffer.from(target)),
        'WRONG_PICKER_IMAGE:'+code)
      result.cases.push({code,ok:true,changedLayers:test.changedLayers,
        cropUnchanged:code!=='SUBJECT',subjectCutoutMocked:code==='SUBJECT'})
      result.guiClicks=result.cases.length
      if(process.env.TINIX_QA_CAPTURE==='1')await page.screenshot({
        path:path.join(output,code+'-local-evidence.png'),fullPage:false})
    }
    assert.equal(result.cases.length,7,'SEVEN_CLICKS_REQUIRED')
    assert(pickerCalls>=1,'PICKER_REQUEST_NOT_EXERCISED')
    assert.equal(cutouts,1,'SUBJECT_CUTOUT_GUI_NOT_EXERCISED')
    assert.equal(uploads,Number(entry.subject.templateBorderMm)>0?2:1,'SUBJECT_UPLOAD_FLOW_NOT_EXERCISED')
    assert.deepEqual(errors,[],'BROWSER_ERRORS')
    const saved=await capture(page)
    result.activeCase='save-reopen'
    await chooseFileMenu(page,'Lưu dự án')
    const savedProject=await findSavedProject(downloadDir)
    result.savedProjectSha256=sha(await readFile(savedProject))
    result.activeCase='reopen'
    await page.goto(origin+'/home',{waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForSelector('.sd-wenjian',{timeout:30000})
    const [chooser]=await Promise.all([
      page.waitForFileChooser({timeout:10000}),chooseFileMenu(page,'Mở dự án'),
    ])
    await chooser.accept([savedProject])
    await page.waitForFunction(uuid=>!!document.getElementById(uuid),{timeout:30000},expectedIds.F01)
    const reopened=await capture(page)
    result.persisted=assertPersisted(saved,reopened)
    await Promise.allSettled(assetTasks)
    if(process.env.TINIX_QA_CAPTURE==='1') await page.screenshot({
      path:path.join(output,'reopened-local-evidence.png'),fullPage:false})
    assert.deepEqual(errors,[],'BROWSER_ERRORS_AFTER_SAVE_REOPEN')
    result.guiClicks=7
    result.mocks={pickerCalls,cutouts,uploads}
    result.blockedExternalHosts=[...blockedExternalHosts].sort()
    result.browserErrors=errors
    delete result.activeCase
    result.status='pass'
  }catch(e){result.error=String(e?.message||e);result.status='blocked'}
  finally {
    try{if(browser)await browser.close()}catch(e){cleanupError='BROWSER_CLOSE_FAILED:'+String(e?.message||e)}
    await Promise.allSettled(assetTasks)
    let coverReady={complete:false,reason:'NO_DESIGN'}
    if(designId) {
      try {
        coverReady=await awaitCoverSettled(staticRoot,designId,{
          // [TINIX] The backend records the cover only after its screenshot request completes.
          ready:async()=>{
            const response=await fetch(apiBase.origin+'/design/poster?id='+designId,{signal:AbortSignal.timeout(5000)})
            const data=await response.json()
            return response.ok && data.code===200 && Number(data.result?.id)===designId &&
              data.result?.cover==='/static/'+designId+'-cover.jpg'
          },
        })
      }
      catch(e){cleanupError='COVER_WAIT_FAILED:'+String(e?.message||e)}
      try{
        await rest('/design/poster/del',{id:designId})
        // [TINIX] Confirm the exact temporary design is no longer retrievable.
        const lookup=await fetch(apiBase.origin+'/design/poster?id='+designId,{signal:AbortSignal.timeout(10000)})
        const deleted=await lookup.json()
        assert.notEqual(deleted.code,200,'TEMP_DESIGN_STILL_EXISTS')
        assert.match(JSON.stringify(deleted),/Thiết kế không tồn tại/,'TEMP_DESIGN_DELETE_UNVERIFIED')
        result.testDesignDeleteVerifiedByLookup=true
        result.testDesignDeleted=true
      }catch(e){cleanupError='TEMP_DESIGN_DELETE_FAILED:'+String(e?.message||e)}
      if(result.testDesignDeleted) {
        try {
          result.artifactCleanup=await cleanupQaArtifacts({
            staticRoot,designId,baselineNames,restoredAssets,coverReady,
          })
          if(result.artifactCleanup.status!=='pass')cleanupError='QA_ARTIFACT_CLEANUP_BLOCKED'
        }catch(e){cleanupError='QA_ARTIFACT_CLEANUP_FAILED:'+String(e?.message||e)}
      }
    }
    if(assetAttempts.size) {
      result.unverifiedAssetWrites=[...assetAttempts.values()].map(attempt=>attempt.url)
      if(result.artifactCleanup) result.artifactCleanup.status='blocked'
      cleanupError='QA_ASSET_WRITES_UNVERIFIED'
    }
    try{await rm(work,{recursive:true,force:true})}
    catch(e){cleanupError='TEMP_WORKSPACE_REMOVE_FAILED:'+String(e?.message||e)}
    try{
      const current=await Promise.all(['draft.json','render.png','report.json'].map(n=>readFile(path.join(sourceDir,n))))
      result.sourceHashes=Object.fromEntries(['draft.json','render.png','report.json'].map((name,i)=>
        [name,{before:originalChecksums[i],after:sha(current[i])}]))
      result.sourceJobUnchanged=Object.values(result.sourceHashes).every(hash=>hash.before===hash.after)
    }catch(e){result.sourceJobUnchanged=false;cleanupError='SOURCE_JOB_HASH_RECHECK_FAILED'}
    if(!result.sourceJobUnchanged)cleanupError='SOURCE_JOB_CHANGED'
    if(cleanupError){result.cleanupError=cleanupError;result.status='blocked'}
    if(!result.testDesignDeleted || result.artifactCleanup?.status!=='pass')result.status='blocked'
    await writeFile(outputReport,JSON.stringify(result,null,2))
    console.log(JSON.stringify({status:result.status,jobId,guiClicks:result.guiClicks||0,
      cases:result.cases,persisted:result.persisted,sourceJobUnchanged:result.sourceJobUnchanged,
      testDesignDeleted:result.testDesignDeleted,artifactCleanup:result.artifactCleanup,
      qaFile:outputReport,
      ...result.error?{error:result.error}:{},
      ...result.cleanupError?{cleanupError:result.cleanupError}:{}},null,2))
    if(result.status!=='pass')process.exitCode=2
  }
}
main().catch(e=>{
  console.error(JSON.stringify({status:'blocked',reason:String(e?.message||e)}))
  process.exitCode=2
})
