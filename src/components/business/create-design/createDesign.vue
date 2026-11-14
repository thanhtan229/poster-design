<!--
 * @Author: ShawnPhang
 * @Date: 2024-04-09 11:24:57
 * @Description: 创建/编辑画布尺寸
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-16 17:11:59
-->
<template>
  <div>
    <el-dialog v-model="dialogVisible" center destroy-on-close :align-center="false" :title="params ? $t('business.create.editSize') : $t('business.create.newBlank')" width="380" draggable>
      <!-- <el-divider content-position="left">自定义尺寸</el-divider> -->
      <el-checkbox v-if="params" v-model="isAdaptive" :label="$t('business.create.adaptive')" size="large" />
      <sizeEditor :params="page" :class="params ? 'editor-mode' : 'add-mode'">
        <el-button @click="finish" plain size="large" type="primary">{{ params ? $t('business.create.apply') : $t('business.create.create') }}</el-button>
      </sizeEditor>
      <!-- [TINIX] Khổ in thông dụng (cm): bấm để áp dụng theo DPI đang chọn -->
      <el-divider content-position="left">{{ $t('tinix.ui.sizeUnit.kho_in') }}</el-divider>
      <ul class="print-list">
        <li @click="applyPrintSize(s)" class="chip" v-for="s in PRINT_SIZES" :key="'p' + s.key">{{ s.key }} <span class="info">{{ s.w }} × {{ s.h }}</span></li>
      </ul>
      <el-divider content-position="left">{{ $t('business.create.recommended') }}</el-divider>
      <ul class="pre-list">
        <li @click="applySize(s)" class="item" v-for="(s, si) in sizes" :key="'s' + si">
          <i :class="['icon', s.icon]" /> {{ s.name }} <span class="info">{{ s.width }} × {{ s.height }} px</span>
        </li>
      </ul>
      <!-- <template #footer>
        <el-button type="primary" @click="dialogVisible = false"> Confirm </el-button>
      </template> -->
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, Ref } from 'vue'
import { ElCheckbox } from 'element-plus'
import { useRouter } from 'vue-router'
import sizeEditor from './sizeEditor.vue'
import sizes from '@/assets/data/PageSizeData'
import { useWidgetStore, useControlStore } from '@/store';
import { PRINT_SIZES, cmToPx, clampDpi, useSizeUnit, DEFAULT_DPI, MAX_SIDE_PX } from '@/utils/tinix/units' // [TINIX]

const router = useRouter()
const controlStore = useControlStore()
const widgetStore = useWidgetStore()
const props = withDefaults(
  defineProps<{
    params?: any
  }>(),
  {
    params: undefined,
  },
)
const dialogVisible: Ref<boolean> = ref(false)
const isAdaptive: Ref<boolean> = ref(true)
const page: any = ref({ width: 100, height: 100, dpi: DEFAULT_DPI }) // [TINIX] dpi
const { setUnit } = useSizeUnit()

const applySize = ({ width, height }: any) => {
  page.value.width = width
  page.value.height = height
}
// [TINIX] khổ in cm → px theo DPI hiện tại của hộp thoại, chuyển ô nhập sang cm để thấy đúng khổ
const applyPrintSize = ({ w, h }: { w: number; h: number }) => {
  const dpi = clampDpi(page.value.dpi)
  page.value.dpi = dpi
  page.value.width = Math.min(cmToPx(w, dpi), MAX_SIDE_PX)
  page.value.height = Math.min(cmToPx(h, dpi), MAX_SIDE_PX)
  setUnit('cm')
}

const open = () => {
  controlStore.setShowMoveable(false) // 清理掉上一次的选择框
  if (props.params) {
    page.value.width = props.params.width
    page.value.height = props.params.height
  }
  page.value.dpi = clampDpi(props.params?.dpi || DEFAULT_DPI) // [TINIX]
  dialogVisible.value = true
}

function finish() {
  const { width, height } = page.value
  if (props.params) {
    const lastPageData = JSON.parse(JSON.stringify(props.params))
    props.params.width = width
    props.params.height = height
    props.params.dpi = clampDpi(page.value.dpi) // [TINIX]
    isAdaptive.value && widgetStore.autoResizeAll(lastPageData)
  } else window.open(router.resolve(`/home?mode=create&w_h=${width}*${height}&dpi=${clampDpi(page.value.dpi)}`).href, '_blank')
}

defineExpose({
  open,
})
</script>

<style lang="less" scoped>
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
