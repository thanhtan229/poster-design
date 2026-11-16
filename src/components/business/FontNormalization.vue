<template><span class="font-normalization"><el-button size="small" :loading="running" @click="start">{{running?'Đang kiểm tra font…':'Chuẩn hóa font'}}</el-button><span v-if="message" role="status">{{message}}</span></span></template>
<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {ElMessage} from 'element-plus'
import {startFontNormalization,getFontNormalizationStatus} from '@/api/admin'
const emit=defineEmits<{done:[]}>();const running=ref(false); const message=ref('');let timer:ReturnType<typeof setTimeout>|null=null; let disposed=false; let observed=false
async function poll(){try{const s=await getFontNormalizationStatus();if(disposed)return;running.value=s.running;if(s.running){observed=true;timer=setTimeout(poll,1500)}else if(observed){observed=false;message.value=s.exitCode===0?'Đã chuẩn hóa. Hồ sơ font đã cập nhật.':'Chuẩn hóa chưa hoàn tất. Kiểm tra Python/fontTools và thử lại.';emit('done')}}catch{message.value='Không đọc được trạng thái chuẩn hóa.';running.value=false}}
async function start(){try{const s=await startFontNormalization();running.value=s.running;observed=s.running;message.value='Kiểm tra tệp, ký tự và biến thể; giữ nguyên tên và tag đã chỉnh.';if(timer)clearTimeout(timer);timer=setTimeout(poll,1000)}catch{ElMessage.error('Không thể bắt đầu chuẩn hóa font.')}}
onMounted(poll);onBeforeUnmount(()=>{disposed=true;if(timer)clearTimeout(timer)})
</script>
<style scoped>.font-normalization{display:inline-flex;align-items:center;gap:8px}.font-normalization [role=status]{font-size:12px;max-width:240px;color:#64748b}</style>
