<template>
  <div class="sizes">
    <div class="category-buttons"><div class="category-filters" role="group" aria-label="Lọc theo nhóm kích thước"><button v-for="c in ['', ...categories]" :key="c" type="button" :class="{ active: category === c }" :aria-pressed="category === c" @click="category = c">{{ c || 'Tất cả' }}</button></div><el-input v-model="query" class="category-search" placeholder="Tìm tên hoặc kích thước" clearable /></div>
    <div class="toolbar"><el-checkbox v-model="favorites">Yêu thích</el-checkbox><el-button size="small" @click="createFromCurrent">Lưu kích thước hiện tại</el-button><el-button size="small" @click="newSize">Thêm</el-button></div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="list"><div v-for="s in filtered" :key="s.id" class="row">
      <button class="star" @click="state(s, s.favorite ? 'unfavorite' : 'favorite')">{{ s.favorite ? '★' : '☆' }}</button>
      <button class="select" :disabled="!!s.deleted || !!s.hidden" @click="$emit('choose', s)"><b>{{ s.name }}</b><small>{{ s.category }} · {{ s.width }} × {{ s.height }} {{ s.unit }}{{ s.unit === 'cm' ? ` · ${s.dpi} DPI` : '' }}{{ s.deleted ? ' · Đã xóa' : s.hidden ? ' · Đã ẩn' : '' }}</small></button>
      <template><el-button size="small" @click="edit(s)" :disabled="!!s.deleted">Sửa</el-button><el-button size="small" @click="duplicate(s)">Nhân bản</el-button><el-button size="small" @click="state(s, s.hidden ? 'show' : 'hide')" :disabled="!!s.deleted">{{ s.hidden ? 'Hiện' : 'Ẩn' }}</el-button><el-button size="small" @click="state(s, s.deleted ? 'restore' : 'delete')">{{ s.deleted ? 'Khôi phục' : 'Xóa' }}</el-button></template>
    </div><p v-if="!filtered.length">Không có kích thước phù hợp.</p></div>
    <el-dialog v-model="editing" :title="form.id ? 'Sửa kích thước' : 'Thêm kích thước'" width="420" append-to-body>
      <el-form label-position="top"><el-form-item label="Tên"><el-input v-model="form.name" maxlength="100" /></el-form-item><el-form-item label="Nhóm"><el-select v-model="form.category" filterable allow-create default-first-option><el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item><el-form-item label="Đơn vị"><el-radio-group v-model="form.unit"><el-radio-button label="px" /><el-radio-button label="cm" /></el-radio-group></el-form-item><el-form-item label="Rộng × cao"><el-input-number v-model="form.width" :min="0.01" :precision="form.unit === 'cm' ? 2 : 0" /><span> × </span><el-input-number v-model="form.height" :min="0.01" :precision="form.unit === 'cm' ? 2 : 0" /></el-form-item><el-form-item v-if="form.unit === 'cm'" label="DPI"><el-input-number v-model="form.dpi" :min="36" :max="1200" /></el-form-item></el-form>
      <template #footer><p v-if="error" class="error">{{ error }}</p><el-button @click="editing=false">Hủy</el-button><el-button type="primary" @click="save">Lưu</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox, ElInput, ElSelect, ElOption, ElCheckbox, ElButton, ElDialog, ElForm, ElFormItem, ElInputNumber, ElRadioGroup, ElRadioButton } from 'element-plus'
import fetch from '@/utils/axios'
import { pxToCm } from '@/utils/tinix/units'
const props = defineProps<{ page: any; unit: string; manageInitial?: boolean }>()
defineEmits(['choose'])
const list = ref<any[]>([]), query = ref(''), category = ref(''), favorites = ref(false), editing = ref(false), error = ref('')
const form = ref<any>({})
const hiddenCategories = new Set(['polaroid', 'photobooth', 'khác'])
const displayCategory = (value: string) => value === 'Facebook Ads' ? 'Facebook' : value === 'Khổ giấy' ? 'In ảnh' : value
const categories = computed(() => Array.from(new Set(['Facebook','Instagram','YouTube','TikTok','In ảnh', ...list.value.map(s => displayCategory(s.category))])).filter(c => !hiddenCategories.has(String(c).toLowerCase())))
const normalize = (v: string) => String(v).toLowerCase().replace(/[\s×*]/g,'x').replace(/x+/g,'x')
const filtered = computed(() => list.value.filter(s => !hiddenCategories.has(String(s.category).toLowerCase()) && (!category.value || displayCategory(s.category) === category.value) && (!favorites.value || s.favorite) && (!query.value || normalize(`${s.name} ${s.category} ${s.width}x${s.height}`).includes(normalize(query.value)))))
async function load() { try { const r: any = await fetch('api/tinix/canvas-sizes', {}, 'get'); if (!r.list) throw new Error(r.msg || 'Không tải được thư viện'); list.value = r.list; error.value = '' } catch(e) { error.value = (e as Error).message } }
async function call(path: string, data: any) { const r: any = await fetch(`api/tinix/canvas-sizes/${path}`, data, 'post'); if (!r.ok) throw new Error(r.msg || 'Không lưu được kích thước') }
function newSize() { form.value = {name:'',category:'In ảnh',width:900,height:900,unit:'px',dpi:300}; editing.value=true }
function createFromCurrent() { const d=props.page.dpi || 300; form.value={name:'',category:'In ảnh',width:props.unit === 'cm' ? pxToCm(props.page.width,d) : props.page.width,height:props.unit === 'cm' ? pxToCm(props.page.height,d) : props.page.height,unit:props.unit,dpi:d}; editing.value=true }
function edit(s: any) { form.value = {...s}; editing.value=true }
function duplicate(s: any) { form.value = {...s,id:undefined,name:s.name + ' (bản sao)'}; editing.value=true }
async function save() { try { await call('save', form.value); editing.value=false; await load() } catch(e) { error.value=(e as Error).message } }
async function state(s: any, action: string) { try { if (action === 'delete') await ElMessageBox.confirm(`Xóa kích thước “${s.name}”?`, 'Xác nhận', {type:'warning'}); await call('state',{id:s.id,version:s.version,action}); await load() } catch(e) { if (e !== 'cancel' && e !== 'close') error.value=(e as Error).message || String(e) } }
onMounted(() => { load(); window.addEventListener('focus', load) })
onUnmounted(() => window.removeEventListener('focus', load))
defineExpose({load})
</script>
<style scoped>.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}.category-buttons{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}.category-filters{display:flex;flex-wrap:wrap;gap:6px}.category-search{width:220px;margin-left:auto}.category-buttons button{border:1px solid #dcdfe6;background:#fff;border-radius:5px;padding:6px 10px;cursor:pointer;color:#606266}.category-buttons button.active{border-color:#409eff;color:#409eff;background:#ecf5ff}.category-buttons button:focus-visible{outline:2px solid #409eff;outline-offset:2px}.list{max-height:280px;overflow:auto}.row{display:flex;align-items:center;gap:4px;border-bottom:1px solid #eee;padding:5px}.select{flex:1;text-align:left;border:0;background:transparent;cursor:pointer}.select small{display:block;color:#777}.star{border:0;background:none;font-size:20px;color:#e9a900;cursor:pointer}.error{color:#c33}</style>
