<template>
  <!-- [TINIX] Khối "Thư viện" trong bảng Thiết lập: lưu lớp / nhóm đang chọn ngược về tab Chữ / Chất liệu (giống menu chuột phải → Thư viện) -->
  <section v-if="target" class="lib-panel">
    <div class="lib-panel__head">
      <strong>{{ $t('tinix.ui.library.menu') }}</strong>
      <span class="lib-panel__kind">{{ $t(target.kind === 'comp' ? 'tinix.ui.library.kindComp' : 'tinix.ui.library.kindMaterial') }}</span>
    </div>
    <p class="lib-panel__hint">
      <template v-if="hasRef">{{ $t('tinix.ui.library.fromLibrary', { name: refName || '…' }) }}</template>
      <template v-else>{{ $t('tinix.ui.library.notInLibrary') }}</template>
    </p>
    <div class="lib-panel__actions">
      <el-button v-if="hasRef" size="small" type="primary" :loading="busy === 'over'" :disabled="!!busy" @click="() => run('over')">{{ $t('tinix.ui.library.saveOver') }}</el-button>
      <el-button size="small" :type="hasRef ? 'default' : 'primary'" plain :loading="busy === 'new'" :disabled="!!busy" @click="() => run('new')">{{ $t(hasRef ? 'tinix.ui.library.saveNew' : 'tinix.ui.library.saveToLibrary') }}</el-button>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useWidgetStore } from '@/store'
import { libraryTarget, saveToLibrary } from '@/utils/tinix/library-save'
import { getComp } from '@/utils/tinix/library-api'

const ws = useWidgetStore()
const { dActiveElement, dWidgets } = storeToRefs(ws)
const busy = ref<'' | 'over' | 'new'>('')
const refName = ref('')
const tick = ref(0) // libraryRef đổi sau khi lưu (gán trên lớp, không qua reactivity của mảng) → buộc tính lại

const target = computed(() => {
  void tick.value
  void dWidgets.value.length
  const el: any = dActiveElement.value
  if (!el || el.uuid === '-1') return null
  return libraryTarget()
})
const hasRef = computed(() => !!target.value?.ref && target.value.ref.kind === target.value.kind)

watch(
  () => (hasRef.value ? JSON.stringify(target.value?.ref) : ''),
  async (key) => {
    refName.value = ''
    if (!key) return
    const r: any = target.value?.ref
    if (r.kind === 'comp') {
      try {
        refName.value = (await getComp(r.id)).title
      } catch {
        refName.value = ''
      }
    } else refName.value = String(r.url || '').startsWith('<svg') ? 'SVG' : String(r.url || '').split('/').pop() || ''
  },
  { immediate: true },
)

async function run(mode: 'over' | 'new') {
  busy.value = mode
  try {
    await saveToLibrary(mode)
  } finally {
    busy.value = ''
    tick.value++
  }
}
</script>

<style lang="less" scoped>
.lib-panel {
  margin: 10px 0 4px;
  padding: 10px 12px;
  background: #f4f7fa;
  border-radius: 8px;
  font-size: 13px;
}
.lib-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lib-panel__kind {
  font-size: 12px;
  color: #64748b;
}
.lib-panel__hint {
  margin: 4px 0 8px;
  color: #8a8f99;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
}
.lib-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lib-panel__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
