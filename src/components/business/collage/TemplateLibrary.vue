<template>
 <section class="custom-templates">
  <div v-if="props.search === undefined" class="tpl-toolbar"><!-- [TINIX] lưu/mở/làm mới đã gom vào menu Tệp -->
   <el-input v-model="localSearch" :placeholder="$t('tinix.ui.collageTab.search')" clearable class="tpl-search" />
  </div>
  <div v-if="props.group === undefined" class="tpl-cats"><button v-for="c in cats" :key="c" :class="{on:cat===c}" @click="cat=c">{{ c===ALL?$t('tinix.ui.collageTab.all_cats'):c }}</button></div>
  <p v-if="message" role="status" class="tpl-msg">{{ message }}</p>
  <p v-if="!shown.length" class="tpl-empty">{{ $t('tinix.ui.collageTab.empty') }}</p>
  <!-- [TINIX] trình bày giống mẫu thiết kế thường: chỉ ảnh xem trước, bấm vào ảnh để dùng; thao tác hiện khi rê chuột -->
  <div class="tpl-masonry">
   <div v-for="t in shown" :key="t.id" class="tpl-tile" :title="tileTitle(t)" @click="useTemplate(t)">
    <CollagePreview :layout="t.data" />
    <span class="tpl-badge">{{ $t('tinix.ui.collageTab.badge') }}</span>
    <span class="tpl-slots">{{ $t('tinix.ui.photoAuto.n_anh', { n: Math.max(1, t.photo_slots || 0) }) }}</span>
    <!-- [TINIX] cùng bộ nút với thẻ mẫu thường (imgWaterFall.vue): Sửa (tab mới, chế độ Sửa mẫu) · Nhóm · Xóa; đổi tên = sửa ô tên rồi Lưu đè -->
    <div class="tpl-card-actions" @click.stop>
     <button type="button" class="tpl-edit-btn" :title="$t('tinix.ui.collageTab.edit_tip')" @click.stop="editTemplate(t)">{{ $t('tinix.ui.templateCard.sua_mau') }}</button>
     <button v-if="props.allGroups" type="button" class="tpl-edit-btn grp" :title="$t('tinix.ui.templateGroups.nhom_tip')" @click.stop="grouping={open:true,id:t.id,ids:[...(t.groups||[])]}">{{ $t('tinix.ui.templateCard.nhom') }}</button>
     <button type="button" class="tpl-edit-btn danger" :title="$t('tinix.ui.templateCard.xoa_mau_tip')" @click.stop="removeTemplate(t)">{{ $t('tinix.ui.templateCard.xoa_mau') }}</button>
    </div>
   </div>
  </div>
  <el-dialog v-model="grouping.open" :title="$t('tinix.ui.collageTab.groups_title')" width="340px" append-to-body>
   <p v-if="!(props.allGroups||[]).length" class="tpl-empty">{{ $t('tinix.ui.collageTab.no_groups') }}</p>
   <el-checkbox-group v-else v-model="grouping.ids" class="tpl-check"><el-checkbox v-for="g in props.allGroups" :key="g.id" :value="g.id">{{ g.name }}</el-checkbox></el-checkbox-group>
   <template #footer><el-button @click="grouping.open=false">{{ $t('tinix.ui.collageTab.cancel') }}</el-button><el-button type="primary" :loading="busy" @click="saveGroups">{{ $t('tinix.ui.templateGroups.luu') }}</el-button></template>
  </el-dialog>
 </section>
</template>
<script setup lang="ts">
// [TINIX] Thư viện mẫu cắt dán: bấm vào mẫu để mở lên canvas (không tạo đơn, không ghi CSDL).
// Thẻ có Sửa · Nhóm · Xóa như mẫu thường; lưu mẫu (đè / mới) nằm ở menu Tệp (utils/tinix/template-save.ts).
import {ref,computed,onMounted,onBeforeUnmount} from 'vue'
import i18n from '@/languages'
import {ElMessage,ElMessageBox,ElCheckbox,ElCheckboxGroup} from 'element-plus'
import {useRouter} from 'vue-router'
import {TEMPLATES_CHANGED_KEY} from '@/utils/tinix/template-save'
import CollagePreview from './CollagePreview.vue'
import config from '@/config'
import {openTemplateOnCanvas} from '@/utils/tinix/design-file'
// [TINIX] gộp tab Mẫu: ô tìm kiếm, nhóm chủ đề (0 = tất cả, 'none' = chưa phân nhóm), số ảnh do tab Mẫu truyền xuống
const props = defineProps<{ search?: string; group?: number | 'none'; photos?: string; allGroups?: Array<{ id: number; name: string; hidden?: number }> }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const templates=ref<any[]>([]); const message=ref(''); const busy=ref(false)
const tt=(k:string,p?:any)=>i18n.global.t('tinix.ui.collageTab.'+k,p) as string
const ALL='__all'; const localSearch=ref(''); const cat=ref(ALL)
const cats=computed(()=>[ALL,...Array.from(new Set(templates.value.map(t=>t.category||tt('no_cat'))))])
const hiddenIds=computed(()=>new Set((props.allGroups||[]).filter(g=>g.hidden).map(g=>g.id)))
function inGroup(t:any){const gs:number[]=t.groups||[];const g=props.group;if(g===undefined)return cat.value===ALL||(t.category||tt('no_cat'))===cat.value;if(g==='none')return !gs.length;if(g)return gs.includes(g);return !gs.length||gs.some(id=>!hiddenIds.value.has(id))}
function photosOk(t:any){const p=props.photos;if(!p)return true;const n=Number(t.photo_slots||0);if(p==='5+')return n>=5;return Number(p)===1?n<=1:n===Number(p)}
function tileTitle(t:any){const g=groupNames(t);return t.name+(g?' · '+g:'')}
function groupNames(t:any){const by=new Map((props.allGroups||[]).map(g=>[g.id,g.name]));return (t.groups||[]).map((id:number)=>by.get(id)).filter(Boolean).join(', ')||t.category||''}
const shown=computed(()=>templates.value.filter(t=>inGroup(t)&&photosOk(t)&&String(t.name).toLowerCase().includes((props.search ?? localSearch.value).trim().toLowerCase())))
async function load(){try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`);if(!r.ok)throw new Error('Không tải được mẫu');templates.value=(await r.json()).list}catch(e:any){message.value=e.message}}
async function useTemplate(t:any){
 try{if(await openTemplateOnCanvas(t.data,t.name,{kind:'collage',id:t.id,name:t.name,version:t.version})){ElMessage.success(i18n.global.t('tinix.ui.collageTab.opened',{name:t.name}));fetch(`${config.SCREEN_URL}/api/tinix/template-used`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'collage',id:t.id})}).catch(()=>undefined)}}
 catch(e:any){ElMessage.error(e.message)}
}
async function removeTemplate(t:any){
 try{await ElMessageBox.confirm(tt('remove_confirm',{name:t.name}),tt('remove_title'),{type:'warning',confirmButtonText:tt('remove_btn'),cancelButtonText:tt('cancel')})}catch{return}
 try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates/${t.id}`,{method:'DELETE'});if(!r.ok)throw new Error((await r.json()).message);ElMessage.success(tt('removed'));await load();emit('changed')}catch(e:any){ElMessage.error(e.message)}
}
// [TINIX] Nhóm chủ đề của mẫu cắt dán (dùng chung với mẫu thường)
const grouping=ref({open:false,id:0,ids:[] as number[]})
async function saveGroups(){busy.value=true;try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates/${grouping.value.id}/groups`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({ids:grouping.value.ids})});if(!r.ok)throw new Error((await r.json()).message);grouping.value.open=false;ElMessage.success(tt('groups_saved'));await load();emit('changed')}catch(e:any){ElMessage.error(e.message)}finally{busy.value=false}}
// [TINIX] Sửa mẫu: mở tab mới ở chế độ Sửa mẫu (giống thẻ mẫu thường) — hiện công cụ đánh dấu khung ảnh, ô tên ở thanh trên, Tệp → Lưu đè mẫu
const router=useRouter()
function editTemplate(t:any){window.open(router.resolve({path:'/home',query:{ctemplate:String(t.id),edit:'1'}}).href,'_blank')}
// tab Sửa mẫu lưu xong thì danh sách ở tab này tải lại (sự kiện 'storage' chỉ bắn ở tab khác)
const onStorage=(e:StorageEvent)=>{if(e.key===TEMPLATES_CHANGED_KEY)load()}
onMounted(()=>{load();window.addEventListener('tinix:templates-changed',load);window.addEventListener('storage',onStorage)})
onBeforeUnmount(()=>{window.removeEventListener('tinix:templates-changed',load);window.removeEventListener('storage',onStorage)})
</script>
<style scoped>
.custom-templates{padding:4px 0}
.tpl-toolbar{display:flex;gap:8px;flex-wrap:wrap}.tpl-search{flex:1;min-width:140px}
.tpl-cats{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.tpl-cats button{border:1px solid #d9cdbf;background:#fff;border-radius:14px;padding:3px 11px;font-size:12px;cursor:pointer;color:#6b5c52}.tpl-cats button.on{background:#733e43;border-color:#733e43;color:#fff}
.tpl-msg{font-size:12px;color:#246b36}.tpl-empty{color:#999;text-align:center;padding:24px 0;font-size:13px}
.tpl-toolbar,.tpl-msg,.tpl-empty{margin-left:14px;margin-right:14px}
.tpl-masonry{column-width:140px;column-gap:7px;margin:0 14px 0 14px}
.tpl-tile{position:relative;break-inside:avoid;margin-bottom:7px;border:1px solid #e0e5ea;border-radius:5px;overflow:hidden;cursor:pointer;background:#f3ece2}
.tpl-card-actions{position:absolute;top:6px;right:6px;z-index:3;display:none;gap:4px}
.tpl-tile:hover .tpl-card-actions{display:flex}
.tpl-tile:hover .tpl-badge{display:none}
.tpl-edit-btn{border:0;border-radius:4px;padding:2px 8px;font-size:12px;color:#fff;background:rgba(63,106,247,.92);cursor:pointer}
.tpl-edit-btn.grp{background:rgba(103,194,58,.95)}.tpl-edit-btn.danger{background:rgba(245,108,108,.95)}
.tpl-tile:hover::before{content:' ';position:absolute;inset:0;background:rgba(0,0,0,.15);z-index:1;pointer-events:none}
.tpl-tile .tpl-badge{z-index:2}
.tpl-slots{position:absolute;left:6px;bottom:6px;z-index:2;padding:1px 6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);border-radius:8px;pointer-events:none}
.tpl-thumb{cursor:pointer;background:#f3ece2;position:relative}.tpl-badge{position:absolute;left:6px;top:6px;background:#733e43;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;opacity:.9}.tpl-info{padding:8px 8px 0;display:flex;flex-direction:column;gap:2px;min-height:44px}.tpl-info b{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tpl-info small{font-size:11px;color:#8a7d72}
.tpl-check{display:flex;flex-wrap:wrap;gap:2px 14px}
</style>
