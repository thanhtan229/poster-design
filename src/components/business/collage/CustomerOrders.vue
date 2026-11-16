<template>
 <el-button @click="show">Đơn cắt dán</el-button>
 <el-dialog v-model="open" title="Quản lý đơn cắt dán" width="1050px" top="4vh" append-to-body>
  <div class="filters"><input v-model="query" placeholder="Tìm tên khách / mã đơn" @input="schedule"/><select v-model="filter" @change="load"><option value="">Tất cả trạng thái</option><option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option></select><button @click="load">Làm mới</button></div>
  <p role="status">{{ message }}</p><p v-if="!loading&&!rows.length">Chưa có đơn phù hợp.</p>
  <div v-for="row in rows" :key="row.id" class="order">
   <div><img v-if="row.cover" :src="row.cover" alt=""/><div v-else class="placeholder">{{ row.customer?.slice(0,1)||'Ảnh' }}</div></div>
   <div class="details"><b>{{ row.customer||row.title }}</b><small>Mã #{{ row.id }} · {{ row.title }}</small><small>{{ (row.width*2.54/row.dpi).toFixed(1) }} × {{ (row.height*2.54/row.dpi).toFixed(1) }} cm · {{ row.dpi }} DPI</small><a :href="'/home?id='+row.id" target="_blank" rel="noopener">Mở thiết kế làm việc</a></div>
   <div><label>Trạng thái <select :value="row.status" @change="change(row,($event.target as HTMLSelectElement).value)"><option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option></select></label><label v-if="row.approvals.length">Bản duyệt để ghi nhận đã in <select v-model="selected[row.id]"><option value="">Chọn phiên bản</option><option v-for="a in row.approvals" :key="a.id" :value="a.id">{{ new Date(a.created_at).toLocaleString('vi-VN') }} · {{ a.id.slice(0,8) }}</option></select></label><small v-if="row.printedApproval">Đã in bản: {{ row.printedApproval.slice(0,8) }}</small></div>
   <details @toggle="loadEvents(row,$event)"><summary>Lịch sử trạng thái</summary><div v-for="(event,i) in events[row.id]||[]" :key="i"><small>{{ new Date(event.created_at).toLocaleString('vi-VN') }} · {{ statuses.find(s=>s.value===event.status)?.label }} <span v-if="event.approval_id">· bản {{ event.approval_id.slice(0,8) }}</span></small></div></details>
   <details><summary>{{ row.approvals.length }} bản khách đã duyệt</summary><div v-for="a in row.approvals" :key="a.id"><small>{{ new Date(a.created_at).toLocaleString('vi-VN') }} · {{ a.id.slice(0,8) }} · {{ a.note }}</small><button :disabled="busy" @click="download(a)">Tải bộ JPG đã duyệt</button></div></details>
  </div>
 </el-dialog>
</template>
<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue'
import config from '@/config'
import {zipImages} from '@/utils/tinix/zip'
import downloadBlob from '@/common/methods/download/downloadBlob'
const open=ref(false); const loading=ref(false); const busy=ref(false); const query=ref(''); const filter=ref(''); const message=ref(''); const rows=ref<any[]>([]); const selected=ref<Record<number,string>>({})
const statuses=[{value:'working',label:'Đang làm'},{value:'waiting',label:'Chờ khách duyệt'},{value:'approved',label:'Đã duyệt'},{value:'printed',label:'Đã in'},{value:'completed',label:'Hoàn thành'}]
const events=ref<Record<number,any[]>>({})
async function loadEvents(row:any,event:Event){if(!(event.target as HTMLDetailsElement).open)return;try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-orders/${row.id}/events`);if(!r.ok)throw new Error('Không tải được lịch sử');events.value[row.id]=(await r.json()).list}catch(e:any){message.value=e.message}}
let timer:ReturnType<typeof setTimeout>; let request=0
function schedule(){clearTimeout(timer);timer=setTimeout(load,250)}
onBeforeUnmount(()=>clearTimeout(timer))
async function show(){open.value=true;await load()}
async function load(){const seq=++request;loading.value=true;try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-orders?q=${encodeURIComponent(query.value)}&status=${encodeURIComponent(filter.value)}`);const data=await r.json();if(!r.ok)throw new Error(data.message);if(seq===request){rows.value=data.list;message.value=''}}catch(e:any){if(seq===request)message.value=e.message}finally{if(seq===request)loading.value=false}}
async function change(row:any,status:string){try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-orders/${row.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,approvalId:selected.value[row.id]||null})});const data=await r.json();if(!r.ok)throw new Error(data.message);await load()}catch(e:any){message.value=e.message;await load();message.value=e.message}}
async function download(a:any){busy.value=true;try{const files=[];for(const f of a.files){const r=await fetch(`${config.SCREEN_URL}/api/tinix/approved-prints/${a.id}/image/${f.index}`);if(!r.ok)throw new Error('Không đọc được bản duyệt; kiểm tra dữ liệu lưu trữ.');files.push({name:f.name,blob:await r.blob()})}downloadBlob(await zipImages(files),`da-duyet-${a.id.slice(0,8)}.zip`)}catch(e:any){message.value=e.message}finally{busy.value=false}}
</script>
<style scoped>.filters{display:flex;gap:10px}.filters input{flex:1}.order{display:grid;grid-template-columns:80px 1fr 270px;gap:16px;padding:16px 0;border-bottom:1px solid #ddd}.order img,.placeholder{width:80px;height:80px;object-fit:cover;background:#f2e5d4}.details,small,label{display:block}.details small,small{margin:5px 0}.order details{grid-column:2/4}.order label{margin-bottom:10px}.order select{display:block;max-width:250px}.order a{display:block;margin-top:8px}</style>
<style>.el-dialog:has(.order) .el-dialog__body{max-height:75vh;overflow:auto}</style>
