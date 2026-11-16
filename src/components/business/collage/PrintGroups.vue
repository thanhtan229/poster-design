<template>
 <section class="print-groups" data-photo-history>
  <h3>Cụm in và cắt nổi trên trang</h3>
  <label><input v-model="printSelection.clean" type="checkbox" /> Xem nền sạch trên canvas</label>
  <p v-if="printSelection.clean" class="notice">Đang mô phỏng nền sạch. Chế độ này không thay đổi thiết kế hay bản khách đã duyệt.</p>
  <p>Bấm tên để đánh dấu cụm trên canvas. Tick nhiều cụm rồi Gộp; chỉ gộp cách in/cắt, không thay vị trí lớp.</p>
  <div v-for="unit in units" :key="unit.id" class="print-group" :class="{selected:printSelection.selected.includes(unit.id)}">
   <input type="checkbox" :checked="printSelection.selected.includes(unit.id)" :aria-label="'Chọn '+unit.name" @change="toggle(unit.id)" />
   <button class="unit-name" @click="pick(unit.id)">{{ unit.name }}</button>
   <select :value="unit.raised?'raised':'base'" :aria-label="'Cách in '+unit.name" @change="role(unit,($event.target as HTMLSelectElement).value)"><option value="base">In nền</option><option value="raised">Cắt nổi</option></select>
  </div>
  <div class="actions"><button :disabled="selected.length<2" @click="merge">Gộp cụm đã chọn</button><button :disabled="selected.length!==1||!canSplit" @click="split">Tách cụm in/cắt</button></div>
  <div v-if="selected.length===1" class="rename"><input v-model="name" maxlength="100" aria-label="Tên cụm in/cắt" @keydown.enter.prevent="rename" /><button @click="rename">Đổi tên cụm</button></div>
  <p v-if="message" role="status">{{ message }}</p>
 </section>
</template>
<script setup lang="ts">
import {computed,ref,watch,onMounted,onActivated,onDeactivated,onBeforeUnmount} from 'vue'
import {nanoid} from 'nanoid'
import {useRoute} from 'vue-router'
import {useWidgetStore,useCanvasStore,useHistoryStore,useControlStore} from '@/store'
import {printUnits} from '@/utils/tinix/collage-print'
import type {PrintUnit} from '@/utils/tinix/collage-print'
import {printSelection,resetPrintSelection} from '@/utils/tinix/print-selection'
import {flushHistory} from '@/common/hooks/history'
import {historyPatches} from '@/utils/widgets/diffLayouts'
const store=useWidgetStore(),canvas=useCanvasStore(),name=ref(''),message=ref('')
const units=computed(()=>printUnits(store.dWidgets)),selected=computed(()=>units.value.filter(u=>printSelection.selected.includes(u.id)))
const canSplit=computed(()=>{const unit=selected.value[0];if(!unit)return false;return (store.dWidgets as any[]).some(w=>unit.ids.includes(String(w.uuid))&&w.printGroup)})
watch(()=>selected.value.map(u=>u.name).join('|'),()=>{name.value=selected.value.length===1?selected.value[0].name:''})
watch(()=>canvas.dCurrentPage,()=>{printSelection.selected=[];printSelection.clean=false})
const route=useRoute()
watch(()=>route.query.id,()=>{printSelection.selected=[];printSelection.clean=false})
watch(()=>printSelection.clean,()=>{store.selectWidget({uuid:'-1'});useControlStore().setShowMoveable(false)})
watch(units,list=>{printSelection.selected=printSelection.selected.filter(id=>list.some(u=>u.id===id))})
onMounted(()=>printSelection.active=true);onActivated(()=>printSelection.active=true);onDeactivated(resetPrintSelection);onBeforeUnmount(resetPrintSelection)
function pick(id:string){printSelection.selected=[id];useControlStore().setShowMoveable(false)}
function toggle(id:string){printSelection.selected=printSelection.selected.includes(id)?printSelection.selected.filter(x=>x!==id):[...printSelection.selected,id]}
function change(action:()=>void){flushHistory();const before=JSON.parse(JSON.stringify(store.dLayouts));action();store.updateDWidgets();const after=JSON.parse(JSON.stringify(store.dLayouts)),patches=historyPatches(before,after);if(patches.patches.length)useHistoryStore().changeHistory(patches)}
function role(unit:PrintUnit,value:string){change(()=>{for(const w of store.dWidgets as any[])if(unit.ids.includes(String(w.uuid)))w.printRole=value})}
function merge(){if(selected.value.length<2)return;const ids=new Set(selected.value.flatMap(u=>u.ids)),id=nanoid(),raised=selected.value.some(u=>u.raised);change(()=>{for(const w of store.dWidgets as any[])if(ids.has(String(w.uuid))){w.printGroup=id;w.printRole=raised?'raised':'base';w.printName='Cụm ghép'}});printSelection.selected=[id];message.value='Đã gộp. Nếu có cụm cắt nổi, cụm ghép được đặt Cắt nổi; bạn có thể đổi lại.'}
function split(){const unit=selected.value[0];if(!unit||!canSplit.value)return;change(()=>{for(const w of store.dWidgets as any[])if(unit.ids.includes(String(w.uuid))){delete w.printGroup;delete w.printName}});printSelection.selected=[];message.value='Đã tách liên kết in/cắt. Nhóm thiết kế vẫn giữ nguyên; cần bỏ nhóm trong editor nếu muốn tách các lớp con.'}
function rename(){if(selected.value.length!==1||!name.value.trim())return;const unit=selected.value[0];change(()=>{for(const w of store.dWidgets as any[])if(unit.ids.includes(String(w.uuid)))w.printName=name.value.trim()})}
</script>
<style scoped>.print-groups{margin:12px 0 22px;padding:12px;background:#f4f7fa;border-radius:8px}.print-group{display:flex;align-items:center;gap:5px;border-bottom:1px solid #ddd;padding:6px 0}.print-group.selected{background:#d8ebff}.unit-name{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;background:transparent;border:0;cursor:pointer}.print-group select{max-width:90px}.actions,.rename{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.rename input{width:65%;min-width:0}.notice{color:#855500}p{font-size:12px;line-height:1.5}h3{font-size:15px}</style>
