<!--
 [TINIX] Thanh nhóm mẫu thiết kế: Tất cả · Chưa phân nhóm · các nhóm (có số mẫu).
 Admin: thêm nhóm, đổi tên / đưa lên-xuống / xóa nhóm đang chọn, chọn nhiều thẻ.
 Một mẫu có thể thuộc nhiều nhóm (server: service/src/tinix/templateGroups.ts).
-->
<template>
  <div class="tinix-group-bar">
    <div class="chips">
      <span :class="['chip', { on: modelValue === 0 }]" @click="pick(0, '')">{{ $t('tinix.ui.templateGroups.tat_ca') }}<i>{{ total }}</i></span>
      <span :class="['chip', { on: modelValue === 'none' }]" @click="pick('none', $t('tinix.ui.templateGroups.chua_phan_nhom'))">{{ $t('tinix.ui.templateGroups.chua_phan_nhom') }}<i>{{ uncategorized }}</i></span>
      <span v-for="g in groups" :key="g.id" :class="['chip', { on: modelValue === g.id }]" @click="pick(g.id, g.name)">
        {{ g.name }}<i>{{ g.count }}</i>
        <el-dropdown v-if="isAdmin && modelValue === g.id" trigger="click" @command="(c: string) => onCommand(c, g)">
          <span class="more" @click.stop>⋯</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">{{ $t('tinix.ui.templateGroups.doi_ten') }}</el-dropdown-item>
              <el-dropdown-item command="up" :disabled="isFirst(g)">{{ $t('tinix.ui.templateGroups.len') }}</el-dropdown-item>
              <el-dropdown-item command="down" :disabled="isLast(g)">{{ $t('tinix.ui.templateGroups.xuong') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ $t('tinix.ui.templateGroups.xoa_nhom') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </span>
      <span v-if="isAdmin" class="chip add" @click="startAdd">+ {{ $t('tinix.ui.templateGroups.them_nhom') }}</span>
    </div>
    <div v-if="adding" class="add-row">
      <el-input ref="addInput" v-model="newName" size="small" :placeholder="$t('tinix.ui.templateGroups.ten_nhom_moi')" maxlength="40" @keyup.enter="submitAdd" @keyup.esc="adding = false" />
      <el-button size="small" type="primary" @click="submitAdd">{{ $t('tinix.ui.templateGroups.them_nhom') }}</el-button>
    </div>
    <div v-if="isAdmin" class="tools">
      <el-button size="small" link :type="selectMode ? 'primary' : 'default'" @click="emit('toggle-select')">{{ selectMode ? $t('tinix.ui.templateGroups.xong_chon') : $t('tinix.ui.templateGroups.chon_nhieu') }}</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElInput, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import * as adminApi from '@/api/admin'
import i18n from '@/languages'
import { apiFailed, apiMessage } from '@/utils/tinix/api-result'
import type { TTemplateGroup } from '@/api/home'

const props = defineProps<{ modelValue: number | 'none'; isAdmin: boolean; selectMode?: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: number | 'none'): void
  (e: 'change', v: { id: number | 'none'; name: string }): void
  (e: 'changed'): void // đã thêm/đổi tên/xóa/sắp xếp nhóm → danh sách mẫu cần làm mới
  (e: 'toggle-select'): void
}>()

const t = (k: string, p?: any) => i18n.global.t(k, p) as string
const groups = ref<TTemplateGroup[]>([])
const uncategorized = ref(0)
const total = ref(0)
const adding = ref(false)
const newName = ref('')
const addInput = ref<any>(null)

async function reload() {
  try {
    const res: any = await api.home.getTemplateCategories(0)
    groups.value = Array.isArray(res?.list) ? res.list : []
    uncategorized.value = Number(res?.uncategorized || 0)
    total.value = Number(res?.total || 0)
    // nhóm đang chọn đã bị xóa ở nơi khác → về "Tất cả"
    if (typeof props.modelValue === 'number' && props.modelValue > 0 && !groups.value.some((g) => g.id === props.modelValue)) pick(0, '')
  } catch (e) {
    // không tải được: giữ danh sách cũ
  }
}

function pick(id: number | 'none', name: string) {
  emit('update:modelValue', id)
  emit('change', { id, name })
}

function startAdd() {
  adding.value = true
  newName.value = ''
  nextTick(() => addInput.value && addInput.value.focus && addInput.value.focus())
}

async function submitAdd() {
  const name = newName.value.trim()
  if (!name) return ElMessage.warning(t('tinix.ui.templateGroups.ten_trong'))
  const res: any = await adminApi.addTemplateCategory({ name, type: 0 })
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.templateGroups.that_bai')))
  adding.value = false
  ElMessage.success(t('tinix.ui.templateGroups.da_them'))
  await reload()
  emit('changed')
}

const isFirst = (g: TTemplateGroup) => groups.value.length > 0 && groups.value[0].id === g.id
const isLast = (g: TTemplateGroup) => groups.value.length > 0 && groups.value[groups.value.length - 1].id === g.id

async function onCommand(cmd: string, g: TTemplateGroup) {
  if (cmd === 'rename') return rename(g)
  if (cmd === 'delete') return remove(g)
  const ids = groups.value.map((x) => x.id)
  const i = ids.indexOf(g.id)
  const j = cmd === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  const res: any = await adminApi.reorderTemplateCategories(ids, 0)
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.templateGroups.that_bai')))
  await reload()
}

async function rename(g: TTemplateGroup) {
  let value = ''
  try {
    const r: any = await ElMessageBox.prompt(t('tinix.ui.templateGroups.nhap_ten'), t('tinix.ui.templateGroups.doi_ten_tieu_de'), {
      inputValue: g.name,
      confirmButtonText: t('tinix.ui.templateGroups.luu'),
      cancelButtonText: t('tinix.ui.templateGroups.huy'),
      inputValidator: (v: string) => (v && v.trim() ? true : t('tinix.ui.templateGroups.ten_trong')),
    })
    value = String(r.value || '').trim()
  } catch (e) {
    return // bấm Hủy
  }
  if (!value || value === g.name) return
  const res: any = await adminApi.renameTemplateCategory({ id: g.id, name: value })
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.templateGroups.that_bai')))
  ElMessage.success(t('tinix.ui.templateGroups.da_doi_ten'))
  await reload()
  emit('changed')
}

async function remove(g: TTemplateGroup) {
  const n = Number(g.count || 0)
  try {
    await ElMessageBox.confirm(n > 0 ? t('tinix.ui.templateGroups.xac_nhan_xoa_nhom', { name: g.name, n }) : t('tinix.ui.templateGroups.xac_nhan_xoa_nhom_trong', { name: g.name }), t('tinix.ui.templateGroups.xoa_nhom'), {
      type: 'warning',
      confirmButtonText: t('tinix.ui.templateGroups.xoa_nhom'),
      cancelButtonText: t('tinix.ui.templateGroups.huy'),
    })
  } catch (e) {
    return
  }
  const res: any = await adminApi.deleteTemplateCategory(g.id, true)
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.templateGroups.that_bai')))
  ElMessage.success(t('tinix.ui.templateGroups.da_xoa'))
  if (props.modelValue === g.id) pick(0, '')
  await reload()
  emit('changed')
}

const onChanged = () => reload() // mẫu được lưu/xóa/gán nhóm ở nơi khác → cập nhật số đếm
onMounted(() => {
  reload()
  window.addEventListener('tinix:templates-changed', onChanged)
})
onBeforeUnmount(() => window.removeEventListener('tinix:templates-changed', onChanged))

defineExpose({ reload, groups })
</script>

<style lang="less" scoped>
.tinix-group-bar {
  padding: 10px 1rem 0 14px;
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    line-height: 1;
    color: #555;
    padding: 5px 9px;
    border: 1px solid #e4e7ed;
    border-radius: 14px;
    background: #fff;
    i {
      font-style: normal;
      color: #b4b8bf;
    }
    .more {
      margin-left: 2px;
      padding: 0 3px;
      color: #fff;
      font-size: 14px;
      line-height: 10px;
    }
  }
  .chip:hover {
    border-color: #3f6af7;
  }
  .chip.on {
    color: #fff;
    background: #3f6af7;
    border-color: #3f6af7;
    i {
      color: rgba(255, 255, 255, 0.75);
    }
  }
  .chip.add {
    color: #3f6af7;
    border-style: dashed;
  }
  .add-row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .tools {
    display: flex;
    gap: 12px;
    margin-top: 6px;
  }
}
</style>
