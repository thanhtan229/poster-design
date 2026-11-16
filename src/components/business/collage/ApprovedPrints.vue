<template>
 <el-button :disabled="!designId" @click="show">Bản khách đã duyệt</el-button>
 <el-dialog v-model="open" title="Bản khách đã duyệt · tải lại đúng bộ đã lưu" width="850px" top="4vh" append-to-body :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
  <p>Mỗi bản lưu có ảnh in cố định. Tải lại không dùng thiết kế đang sửa và không chạy AI.</p>
  <p v-if="!rows.length">Chưa có bản khách đã duyệt cho đơn này. Vào Xuất bộ JPG cắt dán để xem file và xác nhận riêng khách đã duyệt.</p>
  <div v-for="row in rows" :key="row.id" class="archive-row"><b>{{ row.title }}</b> · {{ new Date(row.created_at).toLocaleString('vi-VN') }}<p>{{ row.note || 'Không có ghi chú' }} · {{ row.files.length }} JPG · Mã {{ row.id.slice(0,8) }}</p><el-button :disabled="busy" @click="view(row)">Xem bản đã duyệt</el-button><el-button :disabled="busy" @click="download(row)">Tải lại bộ JPG</el-button></div>
  <p role="status">{{ status }}</p>
  <div class="archive-images"><figure v-for="file in previews" :key="file.name"><figcaption>{{ file.name }}</figcaption><a :href="file.url" target="_blank" rel="noopener"><img :src="file.url" :alt="file.name" /></a></figure></div>
  <template #footer><el-button :disabled="busy" @click="open=false">Đóng</el-button></template>
 </el-dialog>
</template>
<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import config from '@/config'
import {zipImages} from '@/utils/tinix/zip'
import downloadBlob from '@/common/methods/download/downloadBlob'
const route=useRoute(); const designId=computed(()=>route.query.id); const open=ref(false); const busy=ref(false); const rows=ref<any[]>([]); const status=ref(''); const previews=ref<Array<{name:string;blob:Blob;url:string}>>([]); const loadedId=ref('')
function clear(){for(const f of previews.value)URL.revokeObjectURL(f.url);previews.value=[];loadedId.value=''}
watch(open,v=>{if(!v)clear()});onBeforeUnmount(clear)
async function show(){open.value=true;status.value='Đang tải…';rows.value=[];clear();try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/approved-prints?designId=${encodeURIComponent(String(designId.value))}`);const data=await r.json();if(!r.ok)throw new Error(data.message);rows.value=data.list;status.value=''}catch(e:any){status.value=e.message}}
async function load(row:any){if(loadedId.value===row.id)return;clear();try{for(const file of row.files){status.value='Đang đọc '+file.name;const r=await fetch(`${config.SCREEN_URL}/api/tinix/approved-prints/${row.id}/image/${file.index}`);if(!r.ok){const e=await r.json();throw new Error(e.message)}const blob=await r.blob();previews.value.push({name:file.name,blob,url:URL.createObjectURL(blob)})}loadedId.value=row.id;status.value='Bộ JPG gốc đã lưu, không render lại.'}catch(e){clear();throw e}}
async function view(row:any){busy.value=true;try{await load(row)}catch(e:any){status.value=e.message}finally{busy.value=false}}
async function download(row:any){busy.value=true;try{await load(row);downloadBlob(await zipImages(previews.value),`${row.title.replace(/[<>:"/\\|?*]/g,'-')}-da-duyet-${row.id.slice(0,8)}.zip`)}catch(e:any){status.value=e.message}finally{busy.value=false}}
</script>
<style scoped>.archive-row{padding:12px;border-bottom:1px solid #ddd}.archive-images{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:55vh;overflow:auto}figure{margin:0}img{width:100%;height:auto}p{font-size:13px;line-height:1.5}</style>
