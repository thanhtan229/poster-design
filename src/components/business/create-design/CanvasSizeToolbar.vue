<template>
  <div class="canvas-size-toolbar">
    <el-button plain type="primary" @click="library?.open()">Canvas size</el-button>
    <el-select class="favorite-sizes" :model-value="null" placeholder="★ Yêu thích" aria-label="Kích thước yêu thích" @visible-change="onFavoritesOpen" @change="chooseFavorite">
      <el-option v-for="item in favorites" :key="item.id" :value="item.id" :label="`${item.name} · ${item.width} × ${item.height} ${item.unit}`" />
      <template #empty><div class="favorite-empty">{{ favoriteError || 'Chưa có kích thước yêu thích. Bấm ★ trong Canvas size để thêm.' }}</div></template>
    </el-select>
    <div class="quick-size" data-photo-history @keydown.enter.capture.prevent.stop="apply" @keydown.esc.capture.prevent.stop="reset">
      <size-editor ref="editor" :key="revision" :params="draft" compact show-swap :allow-dpi-edit="false">
        <el-button type="primary" :disabled="!dirty" @click="apply">Áp dụng</el-button>
      </size-editor>
    </div>
    <el-button class="size-summary" @click="library?.open()">{{ summary }}</el-button>
    <create-design ref="library" :params="canvas.dPage" library-mode />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElButton, ElMessage, ElSelect, ElOption } from 'element-plus'
import { useCanvasStore } from '@/store'
import { resizeCanvas } from '@/common/methods/resizeCanvas'
import { pxToCm, cmToPx, clampDpi, useSizeUnit, DEFAULT_DPI } from '@/utils/tinix/units'
import fetch from '@/utils/axios'
import SizeEditor from './sizeEditor.vue'
import CreateDesign from './createDesign.vue'

const canvas = useCanvasStore()
const library = ref<InstanceType<typeof CreateDesign>>()
const editor = ref<InstanceType<typeof SizeEditor>>()
const draft = reactive({ width: 0, height: 0, dpi: DEFAULT_DPI })
const revision = ref(0)
const favorites = ref<any[]>([])
const favoriteError = ref('')
const { unit, setUnit } = useSizeUnit()
async function onFavoritesOpen(open: boolean) {
  if (!open) return
  try {
    const response: any = await fetch('api/tinix/canvas-sizes', {}, 'get')
    if (!response.list) throw new Error(response.msg || 'Không tải được kích thước yêu thích')
    favorites.value = response.list.filter((item: any) => item.favorite && !item.hidden && !item.deleted && !['polaroid', 'photobooth', 'khác'].includes(String(item.category).toLowerCase()))
    favoriteError.value = ''
  } catch (error) { favorites.value = []; favoriteError.value = (error as Error).message }
}
function chooseFavorite(id: number) {
  const item = favorites.value.find(item => item.id === id)
  if (!item) return
  const dpi = item.unit === 'cm' ? clampDpi(item.dpi) : clampDpi(canvas.dPage.dpi)
  const width = item.unit === 'cm' ? cmToPx(item.width, dpi) : item.width
  const height = item.unit === 'cm' ? cmToPx(item.height, dpi) : item.height
  try { resizeCanvas({ width, height, dpi }); setUnit(item.unit); reset() } catch (error) { ElMessage.error((error as Error).message) }
}
function reset() {
  Object.assign(draft, { width: canvas.dPage.width, height: canvas.dPage.height, dpi: canvas.dPage.dpi || DEFAULT_DPI })
  revision.value++
}
watch(() => [canvas.dCurrentPage, canvas.dPage.width, canvas.dPage.height, canvas.dPage.dpi], reset, { immediate: true })
const dirty = computed(() => draft.width !== canvas.dPage.width || draft.height !== canvas.dPage.height)
const summary = computed(() => unit.value === 'cm'
  ? `${pxToCm(canvas.dPage.width, draft.dpi)} × ${pxToCm(canvas.dPage.height, draft.dpi)} cm`
  : `${canvas.dPage.width} × ${canvas.dPage.height} px`)
function apply() {
  editor.value?.flushSizeChanges()
  if (!dirty.value) return
  try { resizeCanvas(draft); reset() } catch (error) { ElMessage.error((error as Error).message) }
}
</script>
<style scoped>
.canvas-size-toolbar { display: flex; align-items: center; gap: 6px; margin: 0 8px; }
.size-summary { display: none; }
.quick-size { position: relative; }
.favorite-sizes { width: 160px; flex: none; }
.favorite-empty { padding: 12px; color: #909399; font-size: 13px; }
@media (max-width: 1350px) { .quick-size { display: none; } .size-summary { display: inline-flex; margin: 0; } }
</style>
