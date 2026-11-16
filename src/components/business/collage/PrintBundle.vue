<template>
 <el-button type="primary" :disabled="disabled" @click="open=true">Xuất bộ JPG cắt dán</el-button>
 <el-dialog v-model="open" class="print-bundle-dialog" title="Xuất bộ JPG cắt dán" width="850px" top="4vh" append-to-body :close-on-click-modal="!running" :close-on-press-escape="!running" :show-close="!running">
  <p>Nền sạch + các tờ chi tiết cắt + ảnh hoàn thiện. Mỗi cụm giữ nguyên kích thước in; không tự thu nhỏ.</p>
  <fieldset :disabled="running">
   <p><b>Tất cả JPG cùng khổ {{ (canvas.dPage.width*25.4/(canvas.dPage.dpi||300)).toFixed(1) }} × {{ (canvas.dPage.height*25.4/(canvas.dPage.dpi||300)).toFixed(1) }} mm</b> · {{ canvas.dPage.width }} × {{ canvas.dPage.height }} px. Tự thêm tờ cùng khổ khi thiếu chỗ.</p>
   <label>Lề <input v-model.number="margin" type="number" min="0" max="100" /> mm</label><label>Khoảng cách <input v-model.number="gap" type="number" min="0" max="100" /> mm</label>
   <p>Cụm nhiều lớp được xuất thành một mảnh. Đổi lựa chọn ở đây sẽ được lưu cùng thiết kế.</p>
   <div class="unit" v-for="unit in units" :key="unit.id"><span>{{ unit.name }}</span><select :value="unit.raised?'raised':'base'" @change="setRole(unit,($event.target as HTMLSelectElement).value)"><option value="base">In trên nền</option><option value="raised">Cắt nổi</option></select></div>
  </fieldset>
  <p role="status">{{ summary }}</p><p class="error" role="alert">{{ error }}</p>
  <ul class="preflight-issues"><li v-for="(issue,i) in issues" :key="i" :class="issue.severity">{{ issue.message }}</li></ul>
  <p v-if="stale && files.length" class="error">Thiết kế hoặc thiết lập đã thay đổi. Hãy kiểm tra và tạo lại ảnh xem trước.</p>
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
  <template #footer><el-button :disabled="running" @click="open=false">Đóng</el-button><el-button type="primary" :disabled="running||!!planning.error" :loading="running" @click="exportBundle">Kiểm tra và tạo ảnh xem trước</el-button><el-button v-if="files.length" type="success" :disabled="running||stale||!approved" @click="download">Tải bộ JPG (ZIP)</el-button></template>
 </el-dialog>
</template>
<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {useWidgetStore,useCanvasStore} from '@/store'
import {printUnits,planCollagePrint} from '@/utils/tinix/collage-print'
import type {PrintUnit} from '@/utils/tinix/collage-print'
import config from '@/config'
import {zipImages} from '@/utils/tinix/zip'
import downloadBlob from '@/common/methods/download/downloadBlob'
const props=defineProps<{saveDesign:()=>Promise<any>;title:string;disabled?:boolean}>()
const store=useWidgetStore(),canvas=useCanvasStore(),open=ref(false),running=ref(false),progress=ref(''),failure=ref('')
const customerApproved=ref(false),approvalNote=ref(''),archivedId=ref(''),activeJob=ref('')
function releaseJob(){if(activeJob.value){fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${activeJob.value}`,{method:'DELETE'}).catch(()=>{});activeJob.value=''}}
async function archive(){
 if(!approved.value||!customerApproved.value||stale.value||running.value||!activeJob.value)return
 running.value=true;failure.value=''
 try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${activeJob.value}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operatorReviewed:true,customerApproved:true,note:approvalNote.value})});const data=await r.json();if(!r.ok)throw new Error(data.message);archivedId.value=data.id;window.dispatchEvent(new Event('tinix:approved-prints-changed'))}catch(e:any){failure.value=e.message}finally{running.value=false}
}
const margin=ref(10),gap=ref(5)
const options=computed(()=>({marginMm:margin.value,gapMm:gap.value}))
const files=ref<Array<{name:string;blob:Blob;url:string}>>([]),issues=ref<Array<{severity:string;message:string}>>([]),approved=ref(false),previewSignature=ref('')
const signature=computed(()=>JSON.stringify({page:canvas.dPage,layers:store.dWidgets,options:options.value}))
const stale=computed(()=>signature.value!==previewSignature.value)
watch(signature,()=>{approved.value=false;customerApproved.value=false})
function clearFiles(){for(const file of files.value)URL.revokeObjectURL(file.url);files.value=[];approved.value=false;customerApproved.value=false;archivedId.value='';releaseJob()}
watch(open,v=>{if(!v){clearFiles();issues.value=[];failure.value=''}})
onBeforeUnmount(clearFiles)
async function download(){if(stale.value||!approved.value||running.value)return;running.value=true;try{downloadBlob(await zipImages(files.value),`${(props.title||'cat-dan').replace(/[<>:"/\\|?*]/g,'-')}-bo-in.zip`);open.value=false}catch(e:any){failure.value=e.message}finally{running.value=false}}
const units=computed(()=>printUnits(store.dWidgets))
function setRole(unit:PrintUnit,role:string){for(const w of store.dWidgets as any[])if(unit.ids.includes(String(w.uuid)))w.printRole=role;store.updateDWidgets();failure.value=''}
const planning=computed(()=>{try{return {plan:planCollagePrint({global:canvas.dPage,layers:store.dWidgets},options.value),error:''}}catch(e:any){return {plan:null,error:e.message}}})
const error=computed(()=>planning.value.error||failure.value)
const summary=computed(()=>running.value?progress.value:planning.value.plan?`${planning.value.plan.units.filter(u=>u.raised).length} mảnh cắt · ${planning.value.plan.names.length-2} tờ cắt · ${canvas.dPage.dpi||300} DPI`:'')
async function exportBundle(){
 if(running.value)return;running.value=true;failure.value='';clearFiles();issues.value=[]
 try{
  const captured=signature.value,pageIndex=canvas.dCurrentPage,id=await props.saveDesign();if(!id)throw new Error('Không lưu được thiết kế')
  const response=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:id,pageIndex,options:options.value})})
  const job=await response.json();issues.value=job.issues||[];if(!response.ok)throw new Error(job.message||'Không chuẩn bị được bộ xuất')
  activeJob.value=job.id
  for(let i=0;i<job.names.length;i++){
   progress.value=`Đang xuất ${i+1}/${job.names.length}: ${job.names[i]}`
   const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${job.id}/image/${i}`,{signal:AbortSignal.timeout(200000)})
   if(!r.ok){const e=await r.json();throw new Error(e.message||'Lỗi xuất ảnh')}
   const blob=await r.blob(),bytes=new Uint8Array(await blob.slice(0,3).arrayBuffer());if(bytes[0]!==255||bytes[1]!==216)throw new Error('Máy chủ chưa hỗ trợ bộ JPG. Hãy khởi động lại app.')
   const file={name:job.names[i],blob,url:URL.createObjectURL(blob)};files.value.push(file)
  }
  previewSignature.value=captured
  progress.value='Đã kiểm tra và tạo toàn bộ ảnh xem trước. Xem từng ảnh trước khi tải.'
 }catch(e:any){clearFiles();failure.value=e.message}finally{running.value=false}
}
</script>
<style scoped>fieldset{border:0;padding:0}label{display:inline-flex;gap:8px;align-items:center;margin:8px}input{width:75px}.unit{display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;gap:12px}.unit span{overflow:hidden;text-overflow:ellipsis}.error{color:#b42318}p{line-height:1.6;font-size:13px}.sheets{display:flex;gap:12px;overflow:auto;max-height:270px;padding:8px}.sheet{position:relative;width:150px;border:1px solid #999;background:white}.piece{position:absolute;background:#f3e4ce;border:1px solid #ae8560;font-size:9px;overflow:hidden;box-sizing:border-box}.real-previews{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:430px;overflow:auto}.real-previews figure{margin:0;border:1px solid #ddd;padding:8px}.real-previews img{display:block;width:100%;height:auto}.real-previews small{display:block;font-size:11px}.preflight-issues .warning{color:#8d5b00}.preflight-issues .error{color:#b42318}input[type=checkbox]{width:auto}</style>

<style>.print-bundle-dialog .el-dialog__body{max-height:70vh;overflow-y:auto}.print-bundle-dialog{max-width:96vw}</style>
