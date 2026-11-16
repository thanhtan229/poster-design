<!--
 * @Author: ShawnPhang
 * @Date: 2024-04-09 11:24:57
 * @Description: 创建/编辑画布尺寸
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-16 17:11:59
-->
<template>
  <div>
    <el-dialog v-model="dialogVisible" center destroy-on-close :align-center="false" :title="libraryMode ? 'Thư viện kích thước' : params ? $t('business.create.editSize') : $t('business.create.newBlank')" width="780" draggable>
      <!-- <el-divider content-position="left">自定义尺寸</el-divider> -->
      <el-checkbox v-if="params" v-model="isAdaptive" :label="$t('business.create.adaptive')" size="large" />
      <p v-if="params" class="resize-hint">{{ $t('business.create.adaptiveHint') }}</p>
      <sizeEditor :params="page" show-swap :class="params ? 'editor-mode' : 'add-mode'">
        <el-button data-photo-history plain size="large" type="primary" @click="finish">{{ params ? $t('business.create.apply') : $t('business.create.create') }}</el-button>
      </sizeEditor>
      <canvas-sizes ref="sizesRef" :page="page" :unit="unit" :manage-initial="libraryMode" @choose="chooseSize" />
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, Ref } from 'vue'
import { ElCheckbox, ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import sizeEditor from './sizeEditor.vue'
import CanvasSizes from './CanvasSizes.vue'

import { useWidgetStore, useControlStore } from '@/store';
import { resizeCanvas } from '@/common/methods/resizeCanvas'
import { cmToPx, clampDpi, useSizeUnit, DEFAULT_DPI, MAX_SIDE_PX } from '@/utils/tinix/units' // [TINIX]

const router = useRouter()
const controlStore = useControlStore()
const widgetStore = useWidgetStore()
const props = withDefaults(
  defineProps<{
    params?: any
    libraryMode?: boolean
  }>(),
  {
    params: undefined,
  },
)
const dialogVisible: Ref<boolean> = ref(false)
const isAdaptive: Ref<boolean> = ref(true)
const page: any = ref({ width: 100, height: 100, dpi: DEFAULT_DPI }) // [TINIX] dpi
const { setUnit, unit } = useSizeUnit()
const sizesRef = ref<any>()
function chooseSize(s: any) { const dpi = s.unit === 'cm' ? clampDpi(s.dpi) : clampDpi(page.value.dpi); const w = s.unit === 'cm' ? cmToPx(s.width,dpi) : s.width; const h = s.unit === 'cm' ? cmToPx(s.height,dpi) : s.height; if (w > MAX_SIDE_PX || h > MAX_SIDE_PX || w*h > 80000000) { ElMessage.error('Kích thước vượt giới hạn canvas; hãy giảm DPI hoặc kích thước.'); return } page.value.dpi=dpi; page.value.width=w; page.value.height=h; setUnit(s.unit) }

const open = () => {
  controlStore.setShowMoveable(false) // 清理掉上一次的选择框
  if (props.params) {
    page.value.width = props.params.width
    page.value.height = props.params.height
  }
  page.value.dpi = clampDpi(props.params?.dpi || DEFAULT_DPI) // [TINIX]
  dialogVisible.value = true
  sizesRef.value?.load()
}

function finish() {
  const { width, height } = page.value
  if (![width, height].every(n => Number.isFinite(n) && n > 0) || width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height > 80000000) { ElMessage.error('Kích thước vượt giới hạn canvas (12.000 px mỗi cạnh, tối đa 80 triệu pixel).'); return }
  if (props.params) {
    resizeCanvas(page.value, isAdaptive.value)
    dialogVisible.value = false
  } else window.open(router.resolve(`/home?mode=create&w_h=${width}*${height}&dpi=${clampDpi(page.value.dpi)}`).href, '_blank')
}

defineExpose({
  open,
})
</script>

<style lang="less" scoped>
.resize-hint {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
:deep(.el-dialog__header) {
  padding-bottom: 7px !important;
}
.editor-mode {
  padding: 0 0 0.5rem 0;
}
.add-mode {
  padding: 1rem 0 0.5rem 0;
}
.print-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0.6rem 0 0 0;
  padding: 0;
  list-style: none;
  .chip {
    cursor: pointer;
    font-size: 12px;
    color: #333;
    padding: 4px 8px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    .info {
      color: #b4b8bf;
      margin-left: 2px;
    }
  }
  .chip:hover {
    background-color: #f6f7f9;
    border-color: #3f6af7;
  }
}
.pre-list {
  margin: 1rem 0;
  height: 245px;
  overflow-y: scroll;
  .item {
    padding: 10px 8px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    color: #333;
    .icon {
      margin-right: 0.2rem;
    }
    .info {
      margin-left: 0.4rem;
      font-size: 12px;
      color: #b4b8bf;
    }
  }
  .item:hover {
    background-color: #f6f7f9;
  }
}
</style>
