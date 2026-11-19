<template>
  <!-- [TINIX] Sửa thông tin một mục thư viện: tên, danh mục, loại (chất liệu) -->
  <el-dialog :model-value="modelValue" :title="$t('tinix.ui.library.editInfo')" width="420px" append-to-body @update:model-value="emit('update:modelValue', $event)" @open="onOpen">
    <el-form label-position="top" @submit.prevent>
      <el-form-item :label="$t('tinix.ui.library.name')">
        <el-input v-model="form.title" maxlength="100" />
      </el-form-item>
      <el-form-item :label="$t('tinix.ui.library.category')">
        <el-select v-model="form.cate" style="width: 100%">
          <el-option v-for="c in cates" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="kind === 'material' && form.type !== 'svg'" :label="$t('tinix.ui.library.type')">
        <el-select v-model="form.type" style="width: 100%">
          <el-option v-for="ty in TYPES" :key="ty" :label="$t('tinix.ui.library.type_' + ty)" :value="ty" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ $t('tinix.ui.library.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ $t('tinix.ui.library.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import api from '@/api'
import i18n from '@/languages'
import { getComp, notifyLibraryChanged, saveComp, updateMaterial } from '@/utils/tinix/library-api'

const props = defineProps<{ modelValue: boolean; kind: 'comp' | 'material'; item: any }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()
const t = (k: string) => i18n.global.t(k) as string
/** loại chất liệu đổi qua lại được (SVG giữ nguyên loại) */
const TYPES = ['image', 'mask', 'background']

const form = reactive({ title: '', cate: '', type: 'image' })
const cates = ref<{ value: string; label: string }[]>([])
const saving = ref(false)
let original = { cate: '' }

async function onOpen() {
  const it = props.item || {}
  form.title = it.title || ''
  if (props.kind === 'comp') {
    const [info, res]: any[] = await Promise.all([getComp(Number(it.id)).catch(() => null), api.home.getTemplateCategories(1)])
    cates.value = (res?.list || []).map((c: any) => ({ value: c.name, label: c.name }))
    form.cate = info?.cate || ''
    form.title = info?.title || form.title
  } else {
    const res: any = await api.material.getAssetCategories('materials')
    cates.value = (res?.list || []).map((c: any) => ({ value: c.cate, label: c.name }))
    form.cate = it._libraryRef?.cate || ''
    form.type = it.type === 'png' ? 'image' : it.type || 'image'
  }
  original = { cate: form.cate }
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning(t('tinix.ui.library.nameRequired'))
  saving.value = true
  try {
    if (props.kind === 'comp') await saveComp({ id: Number(props.item.id), title: form.title.trim(), cate: form.cate })
    else {
      const ref0 = props.item._libraryRef
      const patch: any = { title: form.title.trim() }
      if (props.item.type !== 'svg') patch.type = form.type
      await updateMaterial(ref0.cate, ref0.url, patch, form.cate !== original.cate ? form.cate : undefined)
    }
    notifyLibraryChanged(props.kind)
    ElMessage.success(t('tinix.ui.library.infoSaved'))
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error(e?.message || t('tinix.ui.library.failed'))
  } finally {
    saving.value = false
  }
}
</script>
