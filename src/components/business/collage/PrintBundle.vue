<template>
 <el-dialog v-model="open" class="print-bundle-dialog" title="Xuất bộ JPG cắt dán" width="850px" top="4vh" append-to-body :close-on-click-modal="!running" :close-on-press-escape="!running" :show-close="!running">
  <p>Nền sạch + các tờ chi tiết cắt + ảnh hoàn thiện. Mỗi cụm giữ nguyên kích thước in; không tự thu nhỏ.</p>
  <fieldset :disabled="running">
   <p><b>Tất cả JPG cùng khổ {{ (canvas.dPage.width*25.4/(canvas.dPage.dpi||300)).toFixed(1) }} × {{ (canvas.dPage.height*25.4/(canvas.dPage.dpi||300)).toFixed(1) }} mm</b> · {{ canvas.dPage.width }} × {{ canvas.dPage.height }} px. Tự thêm tờ cùng khổ khi thiếu chỗ.</p>
   <label>Lề <input v-model.number="margin" type="number" min="0" max="100" /> mm</label><label>Khoảng cách <input v-model.number="gap" type="number" min="0" max="100" /> mm</label>
   <!-- [TINIX] Prefer previous positions when they fit without extra sheets. -->
   <label><input v-model="retainPositions" type="checkbox" /> {{ t('tinix.ui.trimReview.retainPositions') }}</label>
   <label><input v-model="laserSvg" type="checkbox" /> {{ $t('tinix.ui.printLaser.svg') }}</label><label><input v-model="marks" type="checkbox" /> {{ $t('tinix.ui.printLaser.marks') }}</label>
   <!-- [TINIX] Đo đường cắt thành phẩm theo mm, dùng chung SVG với bộ xuất. -->
   <label><input v-model="checkCuts" type="checkbox" /> {{ t('tinix.ui.cutReadiness.enable') }}</label>
   <label v-if="checkCuts">{{ t('tinix.ui.cutReadiness.limit') }} <input v-model.number="cutLimit" type="number" min="1" max="10" step="0.1" /> mm</label>
   <p v-if="(marks||laserSvg) && margin<markMinMargin" class="error">{{ $t('tinix.ui.printLaser.can_le', { mm: markMinMargin }) }}</p><p v-if="laserSvg">{{ $t('tinix.ui.printLaser.tip') }}</p>
   <p>Cụm nhiều lớp được xuất thành một mảnh. Đổi lựa chọn ở đây sẽ được lưu cùng thiết kế.</p>
   <div v-for="unit in units" :key="unit.id" class="unit"><span>{{ unit.name }}</span><select :value="unit.raised?'raised':'base'" @change="setRole(unit,($event.target as HTMLSelectElement).value)"><option value="base">In trên nền</option><option value="raised">Cắt nổi</option></select></div>
  </fieldset>
  <p role="status">{{ summary }}</p><p class="error" role="alert">{{ error }}</p>
  <!-- [TINIX] Show how much of the complete bundle was regenerated. -->
  <p v-if="bundleStats && !stale" class="bundle-render-stats">{{ t('tinix.ui.trimReview.bundleStats', { ...bundleStats, seconds: cutNumber(bundleStats.milliseconds/1000) }) }}</p>
  <p v-if="packingStats && !stale" class="packing-stats">{{ t('tinix.ui.trimReview.' + packingStats.mode, packingStats) }}</p>
  <ul class="preflight-issues"><li v-for="(issue,i) in shownIssues" :key="i" :class="issue.severity">{{ issue.message }}</li></ul>
  <p v-if="stale && files.length" class="error">Thiết kế hoặc thiết lập đã thay đổi. Hãy kiểm tra và tạo lại ảnh xem trước.</p>
  <!-- [TINIX] Keep trim confirmation tied to the exact layout that was measured. -->
  <section v-if="trimComplete && !stale" class="cut-readiness trim-review">
   <h3>{{ t('tinix.ui.trimReview.heading') }}</h3>
   <p>{{ t('tinix.ui.trimReview.method') }}</p>
   <p v-if="trimStats" class="trim-stats">{{ t('tinix.ui.trimReview.stats', { ...trimStats, seconds: cutNumber(trimStats.milliseconds / 1000) }) }}</p>
   <p v-if="!trimRows.length">{{ t('tinix.ui.trimReview.clear') }}</p>
   <table v-else>
    <thead><tr><th>{{ t('tinix.ui.trimReview.layer') }}</th><th>{{ t('tinix.ui.trimReview.status') }}</th><th>{{ t('tinix.ui.trimReview.edge') }}</th><th></th></tr></thead>
    <tbody>
     <tr v-for="row in orderedTrimRows" :key="row.id" :class="{ 'cut-warning': trimPriority(row) > 0 }">
      <th scope="row">{{ row.name }}</th>
      <td>{{ t('tinix.ui.trimReview.' + (intentional.includes(row.id) ? 'intentional' : row.status)) }}</td>
      <td>{{ row.edges.map(edge => t('tinix.ui.pieceReview.' + edge) + (row.extent[edge] > 0 ? ' · ' + cutNumber(row.extent[edge]*25.4/(canvas.dPage.dpi||300)) + ' mm' : '')).join(', ') || '—' }}</td>
      <td><button v-if="row.status === 'touching' || row.status === 'overflow'" class="cut-row-link" type="button"
        :aria-pressed="intentional.includes(row.id)" @click="toggleIntent(row.id)">{{ t(intentional.includes(row.id) ? 'tinix.ui.trimReview.undoIntent' : 'tinix.ui.trimReview.confirmIntent') }}</button></td>
     </tr>
    </tbody>
   </table>
  </section>
  <section v-if="cutRows.length && !stale" class="cut-readiness">
   <h3>{{ t('tinix.ui.cutReadiness.heading') }}</h3>
   <p>{{ t('tinix.ui.cutReadiness.method', { mm: cutLimit }) }}</p>
   <table>
    <thead><tr>
     <th>{{ t('tinix.ui.cutReadiness.piece') }}</th><th>{{ t('tinix.ui.cutReadiness.size') }}</th>
     <th>{{ t('tinix.ui.cutReadiness.parts') }}</th><th>{{ t('tinix.ui.cutReadiness.holes') }}</th><th>{{ t('tinix.ui.cutReadiness.joins') }}</th>
    </tr></thead>
    <tbody>
     <tr v-for="row in orderedCutRows" :key="row.sheet + ':' + row.id" :class="{ 'cut-warning': hasCutIssue(row) }">
      <th scope="row">
       <!-- [TINIX] Open the isolated canvas review for this production unit. -->
       <button v-if="row.id" class="cut-row-link" type="button" @click="reviewPiece(row.id)">{{ row.name }}</button>
       <template v-else>{{ t('tinix.ui.cutReadiness.unassigned') }}</template>
       <small>{{ t('tinix.ui.cutReadiness.sheet', { n: row.sheet }) }}</small>
      </th>
      <td>{{ row.box ? cutSize(row.box) : t('tinix.ui.cutReadiness.missing') }}</td>
      <td>{{ row.parts.length }}<small v-if="row.parts.length > 1">{{ row.parts.map(cutSize).join(' · ') }}</small></td>
      <td>{{ row.holes }}<small v-if="row.smallHoles.length">{{ t('tinix.ui.cutReadiness.small', { n: row.smallHoles.length }) }} · {{ row.smallHoles.map(hole => cutNumber(hole.openingMm) + ' mm').join(' · ') }}</small></td>
      <td>{{ row.narrowJoins.length ? t('tinix.ui.cutReadiness.narrow', { n: row.narrowJoins.length, mm: cutLimit }) : '—' }}</td>
     </tr>
    </tbody>
   </table>
  </section>
  <div v-if="files.length" class="real-previews">
   <figure v-for="file in files" :key="file.name"><figcaption>{{ file.name }}</figcaption><a :href="file.url" target="_blank" rel="noopener"><img :src="file.url" :alt="file.name" /></a><small>Bấm ảnh để xem lớn · cùng khổ thành phẩm</small></figure>
  </div>
  <p v-if="files.length && !stale"><label><input v-model="approved" type="checkbox" /> Người làm: tôi đã xem nền sạch, tất cả tờ cắt và ảnh hoàn thiện (chưa phải khách duyệt).</label></p>
  <fieldset v-if="files.length && !stale" :disabled="running||!!archivedId" class="customer-approval">
   <label><input v-model="customerApproved" type="checkbox" /> Khách đã duyệt đúng bộ ảnh đang xem.</label>
   <label>Ghi chú duyệt <input v-model="approvalNote" maxlength="1000" placeholder="Tên người duyệt / mã trao đổi (tùy chọn)" style="width:300px" /></label>
   <el-button :disabled="!approved||!customerApproved||running||!!archivedId" @click="archive">Lưu cố định bản khách đã duyệt</el-button>
  </fieldset>
  <p v-if="archivedId" class="saved-approval">Đã lưu bản khách duyệt. Có thể tải lại trong mục Bản khách đã duyệt dù thiết kế thay đổi.</p>
  <p>In JPG ở kích thước thật / 100%, tắt tự co vừa trang. File ảnh hoàn thiện dùng gửi khách duyệt và đối chiếu lắp ráp.</p>
  <template #footer><el-button :disabled="running" @click="open=false">Đóng</el-button><el-button type="primary" :disabled="running||!!errorBeforeExport" :loading="running" @click="exportBundle">Kiểm tra và tạo ảnh xem trước</el-button><el-button v-if="files.length" type="success" :disabled="running||stale||!approved" @click="download">Tải bộ JPG (ZIP)</el-button></template>
 </el-dialog>
</template>
<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {useWidgetStore,useCanvasStore} from '@/store'
import {printUnits,planCollagePrint,MARK, type PrintUnit, type PrintPacking} from '@/utils/tinix/collage-print'
import {DEFAULT_CUT_LIMIT_MM, inspectCutSheet, type CutReadinessRow} from '@/utils/tinix/cut-readiness'
import {CUT_REVIEW_EVENT} from '@/utils/tinix/cut-piece-review' // [TINIX]
import {printTrimCache, inspectPrintTrim, type TrimRow} from '@/utils/tinix/print-trim-review'
import { COLLAGE_REVIEW_EVENT, cutNeedsReview, type CollageReviewReport } from '@/utils/tinix/collage-review' // [TINIX]
import i18n from '@/languages'

import config from '@/config'
import {zipImages} from '@/utils/tinix/zip'
import downloadBlob from '@/common/methods/download/downloadBlob'
const props=defineProps<{saveDesign:()=>Promise<any>;title:string;disabled?:boolean}>()
defineExpose({open:()=>{if(!props.disabled)open.value=true}}) // [TINIX] mở từ hộp thoại Xuất
const store=useWidgetStore(); const canvas=useCanvasStore(); const open=ref(false); const running=ref(false); const progress=ref(''); const failure=ref('')
const customerApproved=ref(false); const approvalNote=ref(''); const archivedId=ref(''); const activeJob=ref('')
function releaseJob(){if(activeJob.value){fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${activeJob.value}`,{method:'DELETE'}).catch(()=>{});activeJob.value=''}}
async function archive(){
 if(!approved.value||!customerApproved.value||stale.value||running.value||!activeJob.value)return
 running.value=true;failure.value=''
 try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${activeJob.value}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operatorReviewed:true,customerApproved:true,note:approvalNote.value})});const data=await r.json();if(!r.ok)throw new Error(data.message);archivedId.value=data.id;window.dispatchEvent(new Event('tinix:approved-prints-changed'))}catch(e:any){failure.value=e.message}finally{running.value=false}
}
const margin=ref(10); const gap=ref(5)
const retainPositions=ref(true)
let previousPacking:{design:string;pageIndex:number;packing:PrintPacking}|undefined
const packingStats=ref<{mode:string;retained:number;rebuilt:number;sheets:number}>()
const laserSvg=ref(true); const marks=ref(true); const markMinMargin=MARK.minMarginMm
const checkCuts=ref(true); const cutLimit=ref(DEFAULT_CUT_LIMIT_MM); const cutRows=ref<CutReadinessRow[]>([])
const hasCutIssue=cutNeedsReview
const orderedCutRows=computed(()=>[...cutRows.value].sort((a,b)=>Number(hasCutIssue(b))-Number(hasCutIssue(a))))
const cutNumber=(n:number)=>n.toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:2})
const cutSize=(b:{width:number;height:number})=>cutNumber(b.width)+' × '+cutNumber(b.height)+' mm'
function reviewPiece(id:string){
 open.value=false
 window.dispatchEvent(new CustomEvent(CUT_REVIEW_EVENT,{detail:{id,limit:cutLimit.value}}))
}
const t=(k:string,p?:any)=>i18n.global.t(k,p) as string
const options=computed(()=>({marginMm:margin.value,gapMm:gap.value,marks:marks.value||laserSvg.value}))
const files=ref<Array<{name:string;blob:Blob;url:string}>>([]); const issues=ref<Array<{severity:string;message:string}>>([]); const approved=ref(false); const previewSignature=ref('')
const trimRows=ref<TrimRow[]>([])
const trimComplete=ref(false)
const trimStats=ref<Awaited<ReturnType<typeof inspectPrintTrim>>['stats']>()
const bundleStats=ref<{ jpg:number; svg:number; totalJpg:number; totalSvg:number; milliseconds:number }>()
const intentional=ref<string[]>([])
let trimController:AbortController|undefined
function trimPriority(row:TrimRow){
 if(row.status==='overflow'&&!intentional.value.includes(row.id))return 3
 if(row.status==='unknown')return 2
 return Number(row.status==='touching'&&!intentional.value.includes(row.id))
}
const orderedTrimRows=computed(()=>[...trimRows.value].sort((a,b)=>trimPriority(b)-trimPriority(a)))
function toggleIntent(id:string){
 intentional.value=intentional.value.includes(id)?intentional.value.filter(value=>value!==id):[...intentional.value,id]
}
const shownIssues=computed(()=>{
 if(stale.value)return issues.value
 const measured=new Set(trimRows.value.filter(row=>row.boxWarning).map(row=>row.name+': vượt mép thành phẩm, hãy kiểm tra phần bị cắt.'))
 return issues.value.filter(issue=>issue.severity!=='warning'||!measured.has(issue.message))
})
const signature=computed(()=>JSON.stringify({pageIndex:canvas.dCurrentPage,page:canvas.dPage,layers:store.dWidgets,options:options.value,laserSvg:laserSvg.value,checkCuts:checkCuts.value,cutLimit:cutLimit.value,retainPositions:retainPositions.value}))
const stale=computed(()=>signature.value!==previewSignature.value)
watch(signature,()=>{approved.value=false;customerApproved.value=false;intentional.value=[]})
function clearFiles(){trimController?.abort();for(const file of files.value)URL.revokeObjectURL(file.url);files.value=[];cutRows.value=[];trimRows.value=[];trimComplete.value=false;trimStats.value=undefined;bundleStats.value=undefined;packingStats.value=undefined;intentional.value=[];approved.value=false;customerApproved.value=false;archivedId.value='';releaseJob()}
watch(open,v=>{if(!v){clearFiles();issues.value=[];failure.value=''}})
onBeforeUnmount(clearFiles)
async function download(){if(stale.value||!approved.value||running.value)return;running.value=true;try{downloadBlob(await zipImages(files.value),`${(props.title||'cat-dan').replace(/[<>:"/\\|?*]/g,'-')}-bo-in.zip`);open.value=false}catch(e:any){failure.value=e.message}finally{running.value=false}}
const units=computed(()=>printUnits(store.dWidgets))
function setRole(unit:PrintUnit,role:string){for(const w of store.dWidgets as any[])if(unit.ids.includes(String(w.uuid)))w.printRole=role;store.updateDWidgets();failure.value=''}
const planning=computed(()=>{try{return {plan:planCollagePrint({global:canvas.dPage,layers:store.dWidgets},options.value),error:''}}catch(e:any){return {plan:null,error:e.message}}})
const errorBeforeExport=computed(()=>planning.value.error||(checkCuts.value&&(!Number.isFinite(cutLimit.value)||cutLimit.value<1||cutLimit.value>10)?t('tinix.ui.cutReadiness.invalid'):''))
const error=computed(()=>errorBeforeExport.value||failure.value)
const summary=computed(()=>running.value?progress.value:planning.value.plan?`${planning.value.plan.units.filter(u=>u.raised).length} mảnh cắt · ${planning.value.plan.names.length-2} tờ cắt · ${canvas.dPage.dpi||300} DPI`:'')
async function exportBundle(){
 if(running.value)return;running.value=true;failure.value='';clearFiles();issues.value=[]
 const started=performance.now()
 try{
  const plan=planning.value.plan
  if(!plan||errorBeforeExport.value)throw new Error(errorBeforeExport.value)
  const captured=signature.value; const pageIndex=canvas.dCurrentPage; const id=await props.saveDesign();if(!id)throw new Error('Không lưu được thiết kế')
  const previous=retainPositions.value&&previousPacking?.design===String(id)&&previousPacking.pageIndex===pageIndex?previousPacking.packing:undefined
  const response=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:id,pageIndex,options:options.value,previousPacking:previous})})
  const job=await response.json();issues.value=job.issues||[];if(!response.ok)throw new Error(job.message||'Không chuẩn bị được bộ xuất')
  activeJob.value=job.id
  const artifacts={jpg:0,svg:0,totalJpg:job.names.length,totalSvg:0}
  const rebuilt=new Set<number>()
  const review=new AbortController()
  trimController=review
  try{
   const snapshot=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${job.id}/data`,{signal:AbortSignal.any([review.signal,AbortSignal.timeout(15000)])})
   if(!snapshot.ok)throw new Error('Missing print layout')
   const page=JSON.parse((await snapshot.json()).data).at(-1)
   const trim=await inspectPrintTrim(page.global,page.layers,review.signal,(i,n)=>{
    progress.value=t('tinix.ui.trimReview.progress',{i,n})
   },printTrimCache)
   trimRows.value=trim.rows
   trimStats.value=trim.stats
   trimComplete.value=true
  }catch{
   if(review.signal.aborted)return
   issues.value.push({severity:'warning',message:t('tinix.ui.trimReview.failed')})
  }
  for(let i=0;i<job.names.length;i++){
   progress.value=`Đang xuất ${i+1}/${job.names.length}: ${job.names[i]}`
   const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${job.id}/image/${i}`,{signal:AbortSignal.timeout(200000)})
   if(!r.ok){const e=await r.json();throw new Error(e.message||'Lỗi xuất ảnh')}
   if(r.headers.get('X-Tinix-Print-Cache')==='hit')artifacts.jpg++
   else if(i>0&&i<job.names.length-1)rebuilt.add(i)
   const blob=await r.blob(); const bytes=new Uint8Array(await blob.slice(0,3).arrayBuffer());if(bytes[0]!==255||bytes[1]!==216)throw new Error('Máy chủ chưa hỗ trợ bộ JPG. Hãy khởi động lại app.')
   const file={name:job.names[i],blob,url:URL.createObjectURL(blob)};files.value.push(file)
  }
  // File SVG đường cắt cho máy laser: mỗi tờ chi tiết cắt một file (mm, 1:1, lớp Cat đỏ + lớp Can xanh)
  const report:CutReadinessRow[]=[]
  if(laserSvg.value||checkCuts.value)for(let i=0;i<job.names.length;i++){
   if(!/^02_chi_tiet_cat_/.test(job.names[i]))continue
   progress.value=t('tinix.ui.printLaser.dang_xuat',{i,n:job.names.length-2,name:job.names[i]})
   const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${job.id}/cut/${i}`,{signal:AbortSignal.timeout(300000)})
   if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||t('tinix.ui.printLaser.loi_svg'))}
   artifacts.totalSvg++
   if(r.headers.get('X-Tinix-Print-Cache')==='hit')artifacts.svg++
   else rebuilt.add(i)
   const svg=await r.text()
   if(checkCuts.value){
    try{report.push(...inspectCutSheet(svg,job.packing?.placements||plan.placements,plan.units,i,job.dpi,cutLimit.value))}
    catch{throw new Error(t('tinix.ui.cutReadiness.invalidSvg',{n:i}))}
   }
   if(laserSvg.value){
    const blob=new Blob([svg],{type:'image/svg+xml'});files.value.push({name:job.names[i].replace('02_chi_tiet_cat_','02_duong_cat_').replace(/\.jpg$/,'.svg'),blob,url:URL.createObjectURL(blob)})
   }
  }
  cutRows.value=report
  bundleStats.value={...artifacts,milliseconds:Math.round(performance.now()-started)}
  if(job.packing){
   packingStats.value={mode:job.packingMode,retained:job.retained,rebuilt:rebuilt.size,sheets:job.names.length-2}
   previousPacking={design:String(id),pageIndex,packing:job.packing}
  }
  previewSignature.value=captured
  if (!stale.value) window.dispatchEvent(new CustomEvent<CollageReviewReport>(COLLAGE_REVIEW_EVENT, {
   detail: { page: canvas.dPage, full: true, trim: trimComplete.value ? trimRows.value : undefined,
    cut: checkCuts.value ? { rows: report, limit: cutLimit.value } : undefined },
  }))
  progress.value='Đã kiểm tra và tạo toàn bộ ảnh xem trước. Xem từng ảnh trước khi tải.'
 }catch(e:any){clearFiles();failure.value=e.message}finally{running.value=false}
}
</script>
<style scoped>
.cut-readiness { overflow-x: auto; margin-block: 12px; }
.cut-readiness table { border-collapse: collapse; width: 100%; text-align: left; font-size: 13px; }
.cut-readiness th, .cut-readiness td { padding: 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
.cut-readiness small { display: block; }
.cut-warning { background: #fff4dc; color: #6a3d00; }
.cut-row-link { background: none; border: 0; padding: 0; color: #1855a0; font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
</style>
<style scoped>fieldset{border:0;padding:0}label{display:inline-flex;gap:8px;align-items:center;margin:8px}input{width:75px}.unit{display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;gap:12px}.unit span{overflow:hidden;text-overflow:ellipsis}.error{color:#b42318}p{line-height:1.6;font-size:13px}.sheets{display:flex;gap:12px;overflow:auto;max-height:270px;padding:8px}.sheet{position:relative;width:150px;border:1px solid #999;background:white}.piece{position:absolute;background:#f3e4ce;border:1px solid #ae8560;font-size:9px;overflow:hidden;box-sizing:border-box}.real-previews{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:430px;overflow:auto}.real-previews figure{margin:0;border:1px solid #ddd;padding:8px}.real-previews img{display:block;width:100%;height:auto}.real-previews small{display:block;font-size:11px}.preflight-issues .warning{color:#8d5b00}.preflight-issues .error{color:#b42318}input[type=checkbox]{width:auto}</style>

<style>.print-bundle-dialog .el-dialog__body{max-height:70vh;overflow-y:auto}.print-bundle-dialog{max-width:96vw}</style>
