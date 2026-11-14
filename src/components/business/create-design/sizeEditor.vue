<!--
 * @Author: ShawnPhang
 * @Date: 2024-04-08 21:33:59
 * @Description: 尺寸编辑
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-09 15:55:33
-->
<template>
  <div class="size-editor">
    <!-- [TINIX] Công tắc đơn vị px | cm (+ DPI khi chọn cm). px vẫn là đơn vị gốc của canvas -->
    <div class="unit-row">
      <div class="unit-switch" role="group" :aria-label="$t('tinix.ui.sizeUnit.don_vi')">
        <button type="button" :class="{ on: unit === 'px' }" @click="setUnit('px')">px</button>
        <button type="button" :class="{ on: unit === 'cm' }" @click="setUnit('cm')">cm</button>
      </div>
      <template v-if="unit === 'cm'">
        <el-tooltip :show-after="300" :hide-after="0" effect="dark" :content="$t('tinix.ui.sizeUnit.dpi_tip')" placement="top">
          <span class="dpi-label">{{ $t('tinix.ui.sizeUnit.dpi') }}</span>
        </el-tooltip>
        <el-select v-if="allowDpiEdit" class="dpi-select" size="small" :model-value="dpi" filterable allow-create default-first-option @change="onDpiChange">
          <el-option v-for="d in DPI_CHOICES" :key="d" :label="String(d)" :value="d" />
        </el-select>
        <span v-else class="dpi-fixed">{{ dpi }}</span>
      </template>
    </div>
    <div class="position-size">
      <number-input v-if="unit === 'px'" v-model="params.width" :label="$t('editor.prop.width')" :maxValue="MAX_SIDE_PX" />
      <number-input v-else v-model="wCm" :label="$t('editor.prop.width')" :maxValue="maxCm" :minValue="0" @update:modelValue="onCmInput('width', $event)" />
      <el-tooltip :show-after="300" :hide-after="0" effect="dark" :content="lockRatio ? $t('business.create.lockRatio') : $t('business.create.freeResize')" placement="top">
        <i @click="changeRatio" :class="['icon', lockRatio ? 'sd-db' : 'sd-fdb']" />
      </el-tooltip>
      <number-input v-if="unit === 'px'" v-model="params.height" :label="$t('editor.prop.height')" :maxValue="MAX_SIDE_PX" /><!-- [TINIX] 5000 → 10000: PSD imports are often bigger -->
      <number-input v-else v-model="hCm" :label="$t('editor.prop.height')" :maxValue="maxCm" :minValue="0" @update:modelValue="onCmInput('height', $event)" />
      <slot />
    </div>
    <!-- [TINIX] Dòng quy đổi + cảnh báo kích thước quá lớn -->
    <div class="size-info">{{ info }}</div>
    <div v-if="warn" class="size-warn">{{ warn }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import numberInput from '@/components/modules/settings/numberInput.vue'
import i18n from '@/languages'
import { clampDpi, cmToPx, pxToCm, sizeWarning, useSizeUnit, DEFAULT_DPI, MAX_SIDE_PX } from '@/utils/tinix/units'

type TProps = {
  params: any
  /** [TINIX] false: DPI chỉ hiển thị (panel chỉnh trực tiếp trên canvas), đổi DPI chỉ làm ở hộp thoại */
  allowDpiEdit?: boolean
}
const props = withDefaults(defineProps<TProps>(), {
  params: {},
  allowDpiEdit: true,
})

const DPI_CHOICES = [72, 96, 150, 200, 300, 600]
const { unit, setUnit } = useSizeUnit()
const t = (k: string, p?: any) => i18n.global.t(k, p) as string

const lockRatio = ref(false) // 锁定比例缩放画布
let scale = 0,
  temp = { width: 0, height: 0 }

const dpi = computed(() => clampDpi(props.params.dpi || DEFAULT_DPI))
const maxCm = computed(() => pxToCm(MAX_SIDE_PX, dpi.value))

// ── cm: giá trị đang nhập giữ riêng (tránh làm tròn ngược khi đang gõ); chỉ đồng bộ lại khi px đổi từ nơi khác ──
const wCm = ref<number>(pxToCm(props.params.width, dpi.value))
const hCm = ref<number>(pxToCm(props.params.height, dpi.value))
function syncCm() {
  if (cmToPx(wCm.value, dpi.value) !== Number(props.params.width)) wCm.value = pxToCm(props.params.width, dpi.value)
  if (cmToPx(hCm.value, dpi.value) !== Number(props.params.height)) hCm.value = pxToCm(props.params.height, dpi.value)
}
watch(() => [props.params.width, props.params.height, dpi.value], syncCm)

function onCmInput(key: 'width' | 'height', cm: number | string) {
  const n = Number(cm)
  if (!isFinite(n) || n <= 0) return
  const px = cmToPx(n, dpi.value)
  if (px < 1) return
  props.params[key] = Math.min(px, MAX_SIDE_PX)
  props.params.dpi = dpi.value // lưu DPI cùng thiết kế để lần sau còn đúng cm
}

// Đổi DPI: giữ nguyên cm, tính lại px (physical size là ý định khi in)
function onDpiChange(v: any) {
  const nd = clampDpi(v)
  const w = wCm.value, h = hCm.value
  props.params.dpi = nd
  if (w > 0) props.params.width = Math.min(cmToPx(w, nd), MAX_SIDE_PX)
  if (h > 0) props.params.height = Math.min(cmToPx(h, nd), MAX_SIDE_PX)
}

const info = computed(() => {
  const w = Number(props.params.width), h = Number(props.params.height)
  if (unit.value === 'cm') return t('tinix.ui.sizeUnit.quy_doi', { w: Math.round(w), h: Math.round(h), mp: ((w * h) / 1e6).toFixed(1) })
  return t('tinix.ui.sizeUnit.quy_doi_cm', { w: pxToCm(w, dpi.value), h: pxToCm(h, dpi.value), dpi: dpi.value })
})
const warn = computed(() => {
  const k = sizeWarning(Number(props.params.width), Number(props.params.height))
  return k === 'side' ? t('tinix.ui.sizeUnit.qua_gioi_han_canh') : k === 'pixels' ? t('tinix.ui.sizeUnit.qua_nhieu_diem_anh') : ''
})

watch(
  () => props.params.width,
  (val, old) => {
    if (scale && isNumber(val) && isNumber(old)) {
      temp.width === 0 && (temp.width = props.params.width)
      setChange()
    }
  },
)
watch(
  () => props.params.height,
  (val, old) => {
    if (scale && isNumber(val) && isNumber(old)) {
      temp.height === 0 && (temp.height = props.params.height)
      setChange()
    }
  },
)

// 锁定宽高比
function changeRatio() {
  lockRatio.value = !lockRatio.value
  if (lockRatio.value) {
    scale = props.params.width / props.params.height
  } else scale = 0
}

// 应用更改
let timer: any = null
function setChange() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    temp.width > 0 && temp.height === 0 && (props.params.height = Math.round(props.params.width / scale)) // [TINIX] px nguyên: tránh số lẻ khi khóa tỉ lệ ở chế độ cm
    temp.height > 0 && temp.width === 0 && (props.params.width = Math.round(props.params.height * scale))
    if (temp.width > 0 && temp.height > 0) {
      temp = { width: 0, height: 0 }
    }
  }, 300)
}

function isNumber(val: any) {
  return typeof val === 'number'
}
</script>

<style lang="less" scoped>
.size-editor {
  width: 100%;
}
.unit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  .unit-switch {
    display: inline-flex;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    overflow: hidden;
    button {
      border: 0;
      background: #fff;
      color: #666;
      font-size: 12px;
      padding: 3px 12px;
      cursor: pointer;
    }
    button.on {
      background: #3f6af7;
      color: #fff;
    }
  }
  .dpi-label {
    font-size: 12px;
    color: #999;
    cursor: help;
  }
  .dpi-select {
    width: 78px;
  }
  .dpi-fixed {
    font-size: 12px;
    color: #333;
  }
}
.size-info {
  margin-top: 6px;
  font-size: 12px;
  color: #999;
}
.size-warn {
  margin-top: 4px;
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.4;
}
.position-size {
  display: flex;
  align-items: center;
  // justify-content: space-between;
  width: 100%;
  .number-input {
    flex: 0.2;
  }
  .icon {
    cursor: pointer;
    font-size: 19px;
  }
  .sd-fdb,
  .sd-db {
    color: #999999;
    margin: 0 6px 0 -4px;
  }
  .sd-db {
    color: #333333;
  }
}
</style>
