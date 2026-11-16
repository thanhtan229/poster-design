<template><aside v-if="editing" data-template-photo-status class="template-photo-status"><strong>{{status.count}} khung nhận ảnh · {{status.linked}} nền liên kết</strong><span v-if="!status.count" role="alert">Mẫu chưa có khung nhận ảnh. Chọn ảnh và đặt vai trò Ảnh chính.</span><button v-for="issue in status.issues" :key="issue.uuid" @click="select(issue.uuid)">{{issue.message}} Xem lớp</button></aside></template>
<script setup lang="ts">
import {computed} from 'vue'
import {useWidgetStore,useUserStore} from '@/store'
import {templatePhotoStatus} from '@/utils/tinix/template-photo'
const ws=useWidgetStore();const editing=computed(()=>useUserStore().tempEditing)
const status=computed(()=>templatePhotoStatus(ws.dWidgets))
function select(uuid:string){ws.selectWidget({uuid})}
</script>
<style scoped>.template-photo-status{display:flex;flex-wrap:wrap;gap:8px;padding:6px 12px;background:#f8fafc;font-size:12px}.template-photo-status [role=alert],button{color:#b45309}.template-photo-status button{border:0;background:none;text-decoration:underline;cursor:pointer;font:inherit}</style>
