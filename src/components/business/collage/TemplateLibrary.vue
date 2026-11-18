<template>
 <section class="custom-templates">
  <div class="tpl-toolbar">
   <el-input v-if="props.search === undefined" v-model="localSearch" :placeholder="$t('tinix.ui.collageTab.search')" clearable class="tpl-search" />
   <el-button @click="load">{{ $t('tinix.ui.collageTab.refresh') }}</el-button>
   <el-button @click="() => editCurrent()">{{ $t('tinix.ui.collageTab.save_current') }}</el-button>
  </div>
  <div class="tpl-actions-file">
   <el-button size="small" @click="openFile">{{ $t('tinix.ui.localFile.open') }}</el-button>
   <el-button size="small" @click="() => saveFile()">{{ $t('tinix.ui.localFile.save') }}</el-button>
  </div>
  <div class="tpl-cats"><button v-for="c in cats" :key="c" :class="{on:cat===c}" @click="cat=c">{{ c===ALL?$t('tinix.ui.collageTab.all_cats'):c }}</button></div>
  <p v-if="message" role="status" class="tpl-msg">{{ message }}</p>
  <p v-if="!shown.length" class="tpl-empty">{{ $t('tinix.ui.collageTab.empty') }}</p>
  <div class="tpl-grid">
   <article v-for="t in shown" :key="t.id" class="tpl-card">
    <div class="tpl-thumb" @click="useTemplate(t)"><CollagePreview :layout="t.data" /><span class="tpl-badge">{{ $t('tinix.ui.collageTab.badge') }}</span></div>
    <div class="tpl-info"><b :title="t.name">{{ t.name }}</b><small>{{ t.category||$t('tinix.ui.collageTab.no_cat') }} · {{ $t('tinix.ui.collageTab.version',{v:t.version}) }}</small></div>
    <div class="tpl-actions">
     <el-button type="primary" size="small" style="flex:1" @click="useTemplate(t)">{{ $t('tinix.ui.collageTab.use') }}</el-button>
     <el-dropdown trigger="click" @command="(c:string)=>onMenu(t,c)">
      <el-button size="small" :title="$t('tinix.ui.collageTab.more')">⋯</el-button>
      <template #dropdown><el-dropdown-menu><el-dropdown-item command="ver">{{ $t('tinix.ui.collageTab.save_new_version') }}</el-dropdown-item><el-dropdown-item command="dup">{{ $t('tinix.ui.collageTab.duplicate') }}</el-dropdown-item><el-dropdown-item command="rename" divided>{{ $t('tinix.ui.collageTab.rename') }}</el-dropdown-item><el-dropdown-item command="remove">{{ $t('tinix.ui.collageTab.remove') }}</el-dropdown-item></el-dropdown-menu></template>
     </el-dropdown>
    </div>
   </article>
  </div>
  <el-dialog v-model="renaming.open" :title="$t('tinix.ui.collageTab.rename_title')" width="380px" append-to-body>
   <el-form label-position="top"><el-form-item :label="$t('tinix.ui.collageTab.tpl_name')"><el-input v-model="renaming.name" maxlength="100" /></el-form-item><el-form-item :label="$t('tinix.ui.collageTab.tpl_cat')"><el-input v-model="renaming.category" maxlength="100" /></el-form-item></el-form>
   <template #footer><el-button @click="renaming.open=false">{{ $t('tinix.ui.collageTab.cancel') }}</el-button><el-button type="primary" :loading="busy" :disabled="!renaming.name.trim()" @click="saveRename">{{ $t('tinix.ui.collageTab.save') }}</el-button></template>
  </el-dialog>
  <el-dialog v-model="editing" :title="$t('tinix.ui.collageTab.save_dialog')" width="640px" append-to-body>
   <el-form label-position="top"><el-form-item :label="$t('tinix.ui.collageTab.tpl_name')"><el-input v-model="name" maxlength="100" /></el-form-item><el-form-item :label="$t('tinix.ui.collageTab.tpl_cat')"><el-input v-model="category" maxlength="100" /></el-form-item></el-form>
   <p class="hint">{{ $t('tinix.ui.collageTab.slot_hint') }}</p>
   <div class="slot-list">
    <div v-for="w in candidateLayers" :key="w.uuid" class="slot-row"><span :title="w.name||w.type">{{ w.name||w.type }}</span>
     <el-select v-model="roles[w.uuid]" size="small" style="width:170px"><el-option value="fixed" :label="$t('tinix.ui.collageTab.role_fixed')" /><el-option v-if="w.type==='w-image' && !w.linkedPhotoId" value="photo" :label="$t('tinix.ui.collageTab.role_photo')" /><el-option v-if="w.type==='w-image' && !w.linkedPhotoId" value="subject" :label="$t('tinix.ui.collageTab.role_subject')" /><el-option v-if="w.type==='w-text'" value="text" :label="$t('tinix.ui.collageTab.role_text')" /></el-select>
     <el-select v-if="roles[w.uuid]==='subject'" v-model="anchors[w.uuid]" size="small" style="width:110px" :placeholder="$t('tinix.ui.collageTab.anchor')"><el-option value="bottom" :label="$t('tinix.ui.collageTab.anchor_bottom')" /><el-option value="center" :label="$t('tinix.ui.collageTab.anchor_center')" /></el-select>
    </div>
   </div>
   <template #footer><el-button @click="editing=false">{{ $t('tinix.ui.collageTab.cancel') }}</el-button><el-button type="primary" :loading="busy" @click="saveTemplate">{{ $t('tinix.ui.collageTab.save') }}</el-button></template>
  </el-dialog>
 </section>
</template>
<script setup lang="ts">
// [TINIX] Thư viện mẫu cắt dán: bấm "Dùng mẫu này" mở thẳng mẫu lên canvas (không tạo đơn, không ghi CSDL).
// Thiết kế được lưu/mở dưới dạng tệp .tinix.zip trên máy (xem utils/tinix/design-file.ts).
import {ref,computed,onMounted} from 'vue'
import i18n from '@/languages'
import {ElForm,ElFormItem,ElDropdown,ElDropdownMenu,ElDropdownItem,ElSelect,ElOption,ElMessage,ElMessageBox} from 'element-plus'
import CollagePreview from './CollagePreview.vue'
import {useWidgetStore,useCanvasStore} from '@/store'
import config from '@/config'
import {openTemplateOnCanvas,pickAndOpen,saveToDisk} from '@/utils/tinix/design-file'
const props = defineProps<{ search?: string }>() // [TINIX] gộp tab Mẫu: ô tìm kiếm của tab Mẫu truyền xuống
const store=useWidgetStore(); const canvas=useCanvasStore(); const templates=ref<any[]>([]); const message=ref(''); const editing=ref(false); const busy=ref(false); const name=ref(''); const category=ref('')
const roles=ref<Record<string,string>>({}); const anchors=ref<Record<string,string>>({}); const current=ref<any>(null)
const tt=(k:string,p?:any)=>i18n.global.t('tinix.ui.collageTab.'+k,p) as string
const ALL='__all'; const localSearch=ref(''); const cat=ref(ALL)
const cats=computed(()=>[ALL,...Array.from(new Set(templates.value.map(t=>t.category||tt('no_cat'))))])
const shown=computed(()=>templates.value.filter(t=>(cat.value===ALL||(t.category||tt('no_cat'))===cat.value)&&String(t.name).toLowerCase().includes((props.search ?? localSearch.value).trim().toLowerCase())))
const candidateLayers=computed(()=>(store.dWidgets as any[]).filter(w=>!w.hidden&&(w.type==='w-image'||w.type==='w-text')))
async function load(){try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`);if(!r.ok)throw new Error('Không tải được mẫu');templates.value=(await r.json()).list}catch(e:any){message.value=e.message}}
async function useTemplate(t:any){
 try{if(await openTemplateOnCanvas(t.data,t.name))ElMessage.success(i18n.global.t('tinix.ui.collageTab.opened',{name:t.name}))}
 catch(e:any){ElMessage.error(e.message)}
}
async function openFile(){try{await pickAndOpen()}catch(e:any){ElMessage.error(i18n.global.t('tinix.ui.localFile.open_failed')+': '+e.message)}}
async function saveFile(){try{await saveToDisk()}catch(e:any){ElMessage.error(i18n.global.t('tinix.ui.localFile.save_failed')+': '+e.message)}}
function editCurrent(t?:any,duplicate=false){current.value=duplicate?null:t||null;name.value=t?.name||'';category.value=t?.category||'';roles.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateRole||'fixed']));anchors.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateAnchor||'bottom']));editing.value=true}
async function saveTemplate(){busy.value=true;try{const layers=JSON.parse(JSON.stringify(store.dWidgets));for(const w of layers){w.templateRole=roles.value[w.uuid]||'fixed';if(w.templateRole==='subject')w.templateAnchor=anchors.value[w.uuid]||'bottom'}const layout={global:JSON.parse(JSON.stringify(canvas.dPage)),layers};const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.value?.id,version:current.value?.version,name:name.value,category:category.value,layout})});const data=await r.json();if(!r.ok)throw new Error(data.message);editing.value=false;message.value=tt('saved',{v:data.version});await load()}catch(e:any){message.value=e.message}finally{busy.value=false}}
// [TINIX] Quản lý mẫu cắt dán: đổi tên/danh mục, xóa (cùng mọi phiên bản)
const renaming=ref({open:false,id:0,name:'',category:''})
function onMenu(t:any,c:string){if(c==='rename')renaming.value={open:true,id:t.id,name:t.name,category:t.category||''};else if(c==='remove')removeTemplate(t);else editCurrent(t,c==='dup')}
async function saveRename(){busy.value=true;try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates/${renaming.value.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:renaming.value.name,category:renaming.value.category})});if(!r.ok)throw new Error((await r.json()).message);renaming.value.open=false;ElMessage.success(tt('renamed'));await load()}catch(e:any){ElMessage.error(e.message)}finally{busy.value=false}}
async function removeTemplate(t:any){
 try{await ElMessageBox.confirm(tt('remove_confirm',{name:t.name,n:t.version}),tt('remove_title'),{type:'warning',confirmButtonText:tt('remove_btn'),cancelButtonText:tt('cancel')})}catch{return}
 try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates/${t.id}`,{method:'DELETE'});if(!r.ok)throw new Error((await r.json()).message);ElMessage.success(tt('removed'));await load()}catch(e:any){ElMessage.error(e.message)}
}
onMounted(load)
</script>
<style scoped>
.custom-templates{padding:4px 0}
.tpl-toolbar{display:flex;gap:8px;flex-wrap:wrap}.tpl-search{flex:1;min-width:140px}
.tpl-actions-file{display:flex;gap:6px;margin-top:8px}
.tpl-cats{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.tpl-cats button{border:1px solid #d9cdbf;background:#fff;border-radius:14px;padding:3px 11px;font-size:12px;cursor:pointer;color:#6b5c52}.tpl-cats button.on{background:#733e43;border-color:#733e43;color:#fff}
.tpl-msg{font-size:12px;color:#246b36}.tpl-empty{color:#999;text-align:center;padding:24px 0;font-size:13px}
.tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px}
.tpl-card{background:#fff;border:1px solid #e6dccf;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.tpl-thumb{cursor:pointer;background:#f3ece2;position:relative}.tpl-badge{position:absolute;left:6px;top:6px;background:#733e43;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;opacity:.9}.tpl-info{padding:8px 8px 0;display:flex;flex-direction:column;gap:2px;min-height:44px}.tpl-info b{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tpl-info small{font-size:11px;color:#8a7d72}
.tpl-actions{display:flex;gap:6px;padding:8px}
.hint{font-size:12px;color:#8a7d72;line-height:1.5}
.slot-list{max-height:340px;overflow:auto;border:1px solid #eee;border-radius:6px}.slot-row{display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid #f0f0f0}.slot-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
</style>
