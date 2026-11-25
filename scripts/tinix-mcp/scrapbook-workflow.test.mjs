import assert from 'node:assert/strict'
import { createHash,randomUUID } from 'node:crypto'
import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises'
import { createTinixMcp } from './server.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
const dir=process.argv[2]
if (!dir) throw new Error('Usage: node scripts/tinix-mcp/scrapbook-workflow.test.mjs <fixture-dir> [--finish]')
const root=dir+'/jobs'
const files=['compositions.zip','F01.png','F02.png','F03.png','F04.png','F05.png','F06.png','SUBJECT.png']
const attachment=name=>({file_id:name,file_name:name,download_url:'https://files.oaiusercontent.com/'+name})
const contents=new Map(await Promise.all(files.map(async n=>[n,await readFile(dir+'/'+n)])))
const rootFiles = async () => (await readdir(root)).filter(n=>/^[0-9a-f-]{36}$/.test(n)).sort()
await mkdir(root,{recursive:true})
const server=createTinixMcp({outputRoot:root,fetchFile:async url=>new Response(contents.get(url.pathname.slice(1)))})
const client=new Client({name:'studio-workflow-e2e',version:'1'})
const [cl,srv]=InMemoryTransport.createLinkedPair()
await server.connect(srv)
await client.connect(cl)
const call=async(name,arguments_)=>{
 const r=await client.callTool({name,arguments:arguments_},undefined,{timeout:300000})
 assert.ok(!r.isError,JSON.stringify(r.content.filter(item=>item.type==='text')))
 return r
}
const go=async(args)=>(await call('advance_scrapbook_workflow',args)).structuredContent
const job=(id,name)=>root+'/'+id+'/result/'+name
const parse=async p=>JSON.parse(await readFile(p,'utf8'))
const img=(r,i)=>Buffer.from(r.content.filter(item=>item.type==='image')[i].data,'base64')
const hash=data=>createHash('sha256').update(data).digest('hex')
async function main(){
try{
 if(process.argv.includes('--finish')){
  const {workflow_id,revised}=await parse(dir+'/checkpoint.json')
 const states=await readdir(root)
 const visual_review={...await parse(dir+'/visual-review.json'),job_id:revised}
 const finished=(await call('advance_scrapbook_workflow',{workflow_id,visual_review})).structuredContent
 assert.equal(finished.qaStatus,'passed',JSON.stringify(finished.lastError??finished.qa))
 assert.equal(finished.currentJobId,revised)
 assert.equal(finished.repairCount,1)
 assert.equal(finished.retryCount,1)
 assert.deepEqual(await readdir(root),states)
 const repeat=(await call('advance_scrapbook_workflow',{workflow_id})).structuredContent
 assert.equal(repeat.currentJobId,revised)
 const paths={final_render:'render.png',materials_zip:'material.zip',comparison:'comparison.png',qa_report:'qa.json'}
 for(const [artifact,name] of Object.entries(paths)){
  const result=await call('get_scrapbook_workflow',{workflow_id,artifact})
  const bytes=Buffer.from(result.content.find(block=>block.type==='resource').resource.blob,'base64')
  assert.equal(createHash('sha256').update(bytes).digest('hex'),result.structuredContent.sha256)
  if(artifact==='final_render')assert.deepEqual(bytes,await readFile(root+'/'+revised+'/result/render.png'))
  if(artifact==='qa_report'){
   const qa=JSON.parse(bytes)
   assert.equal(qa.pass,true)
   assert.equal(qa.material.render_pixel_identical_from_json,true)
   assert.ok(qa.material.min_bounding_box_gap_px>=12)
   assert.equal(qa.finalJobId,revised)
   assert.equal(Object.keys(qa.material.enclosed_windows_alpha_zero).length,6)
  }
  await writeFile(dir+'/delivery-'+name,bytes)
 }
 console.log(JSON.stringify({workflow_id,status:finished.qaStatus,report:finished.qa,artifacts:finished.artifacts,job:revised}))

  return
 }
 const workflow_id=randomUUID()
 const opts={request_id:workflow_id,compositions:attachment(files[0]),photos:files.slice(1,7).map(attachment),subject:attachment(files[7])}
 const start=await call('prepare_scrapbook_workflow',opts)
 assert.equal(start.structuredContent.qaStatus,'awaiting_demo')
 assert.equal(new Set(start.structuredContent.demos.map(x=>x.demoSha256)).size,3)
 for(let i=0;i<3;i++) await writeFile(dir+'/demo-'+['A','B','C'][i]+'.jpg',img(start,i))
 console.log('Prepared three demos:',workflow_id)
 assert.deepEqual((await call('prepare_scrapbook_workflow',opts)).structuredContent,start.structuredContent)
 const env=process.env.TINIX_APP_URL
 process.env.TINIX_APP_URL='http://127.0.0.1:1'
 let state
 try { state=await go({workflow_id,approved_demo_id:'B',policy:{subject_mask:true,layer_position:true}}) }
 finally { if(env===undefined)delete process.env.TINIX_APP_URL;else process.env.TINIX_APP_URL=env }
 assert.equal(state.qaStatus,'retryable_error',JSON.stringify(state.lastError))
 assert.equal(state.lastError.step,'compare',JSON.stringify(state.lastError))
 const upstream=state.importJobId
 const jobsAfterError=await rootFiles()
 const l=await go({workflow_id})
 assert.equal(l.qaStatus,'awaiting_layout_qa',JSON.stringify(l.lastError))
 assert.equal(l.importJobId,upstream)
 assert.deepEqual(await rootFiles(),jobsAfterError)
 assert.equal(l.approved.demoSha256,start.structuredContent.demos[1].demoSha256)
 const info=await parse(root+'/.workflows/'+workflow_id+'/comparison.json')
 assert.equal(info.approvedDemoSha256,l.approved.demoSha256)
 console.log('Resumed compare, reuse same import',upstream,'MAE',info.overall.mae)
 const filled=await go({workflow_id,layout_review:{job_id:upstream,status:'pass',notes:'Locked design and imported frames use the same source sprites and equivalent placement; inspect saved compare.'}})
 assert.equal(filled.qaStatus,'awaiting_visual_qa',JSON.stringify(filled.lastError))
 const current=await parse(job(filled.currentJobId,'draft.json'))
 console.log('Filled:',filled.currentJobId,filled.cropRows.map(r=>[r.code,r.status]))
 const capture=await call('get_material_draft_render',{job_id:filled.currentJobId})
 await writeFile(dir+'/subject-before.png',img(capture,0))
 const operations=await parse(dir+'/chairs-operations.json')
 const revised=await go({workflow_id,subject_operations:operations,visual_review:{job_id:filled.currentJobId,design:'pass',subject:'fail',crop:'pass',notes:'Restore visible chair rails and legs from the original; pose needs that support.'}})
 assert.equal(revised.qaStatus,'awaiting_visual_qa',JSON.stringify(revised.lastError))
 assert.equal(revised.parentJobId,filled.currentJobId)
 const revisedDraft=await parse(job(revised.currentJobId,'draft.json'))
 assert.deepEqual(current.layers.filter(x=>x.templateRole!=='subject'),revisedDraft.layers.filter(x=>x.templateRole!=='subject'))
 const revisedSubject=revisedDraft.layers.find(x=>x.templateRole==='subject')
 assert.ok(revisedSubject.slot&&!revisedSubject.linkedPhotoId)
 const beforeSubject=current.layers.find(x=>x.templateRole==='subject')
 assert.equal(beforeSubject.cutoutEdit.sourceUrl,revisedSubject.cutoutEdit.sourceUrl)
 assert.notEqual(beforeSubject.cutoutEdit.cutoutUrl,revisedSubject.cutoutEdit.cutoutUrl)
 const preview=await call('get_material_draft_render',{job_id:revised.currentJobId})
 await writeFile(dir+'/subject-after.png',img(preview,0))
 await writeFile(dir+'/checkpoint.json',JSON.stringify({workflow_id,upstream,filled:filled.currentJobId,revised:revised.currentJobId},null,2))
 console.log('Restored chairs:',revised.currentJobId,JSON.stringify(revised.cropRows.map(r=>[r.code,r.status])))
 // Swap all six images in a separate draft with the existing backwards-compatible tool.
 contents.set('cutout.png',Buffer.from(revisedSubject.cutoutEdit.cutoutUrl.split(',')[1],'base64'))
 const swap=await call('fill_material_draft_photos',{job_id:upstream,photos:[...opts.photos].reverse(),subject:attachment('cutout.png')})
 const swapped=await parse(job(swap.structuredContent.jobId,'draft.json'))
 const frames=(layout,report)=>report.photoSlots.map(s=>layout.layers.find(x=>x.uuid===s.id).imgUrl)
 assert.deepEqual(frames(swapped,swap.structuredContent),frames(current,await parse(job(filled.currentJobId,'report.json'))).reverse())

 console.log('Swapped 6 photos on independent copy:',swap.structuredContent.jobId)
 await writeFile(dir+'/checkpoint.json',JSON.stringify({workflow_id,upstream,filled:filled.currentJobId,revised:revised.currentJobId,swap:swap.structuredContent.jobId},null,2))
}finally{await client.close();await server.close()}

}
await main()
