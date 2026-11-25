<!--
 * @Author: ShawnPhang
 * @Date: 2023-10-08 14:15:17
 * @Description: 手动抠图 - 修补擦除
 * @LastEditors: ShawnPhang <https://m.palxp.cn>, Jeremy Yu <https://github.com/JeremyYu-cn>
 * @Date: 2024-03-04 09:50:00
-->
<template>
  <div>
    <!-- [TINIX] Mount the legacy canvas after the dialog has a measured size. -->
    <el-dialog v-model="state.show" :title="advanced ? $t('tinix.ui.cutoutTools.title') : $t('business.cutout.edit')" append-to-body align-center width="90%" @opened="state.showMatting = !advanced" @close="state.showMatting = false">
      <template #header>
        <!-- [TINIX] Hand the current brush result to the curve editor. -->
        <div v-if="!advanced" class="tool-wrap">
          <el-button type="primary" plain @click="done">{{ $t('business.cutout.applyEdit') }}</el-button>
          <el-button :disabled="!mattingParam" @click="openAdvanced">{{ $t('tinix.ui.cutoutTools.title') }}</el-button>
          <el-radio-group v-model="state.isErasing" style="margin-left: 35px">
            <el-radio :value="false" size="large"> <b>{{ $t('business.cutout.fixBrush') }}</b> <i class="icon sd-xiubu" /></el-radio>
            <el-radio :value="true" size="large"> <b>{{ $t('business.cutout.eraseBrush') }}</b> <i class="icon sd-cachu" /></el-radio>
          </el-radio-group>
          <number-slider
            v-model="state.radius" class="slider-wrap"
            :label="$t('business.cutout.brushSize')" :showInput="false"
            labelWidth="90px" 
            :maxValue="state.constants?.RADIUS_SLIDER_MAX" :minValue="state.constants?.RADIUS_SLIDER_MIN" 
            :step="state.constants?.RADIUS_SLIDER_STEP"
          />
          <number-slider
            v-model="state.hardness" class="slider-wrap"
            :label="$t('business.cutout.brushHardness')" :showInput="false"
            labelWidth="90px" 
            :maxValue="state.constants?.HARDNESS_SLIDER_MAX" :minValue="state.constants?.HARDNESS_SLIDER_MIN"
            :step="state.constants?.HARDNESS_SLIDER_STEP"
          />
        </div>
      </template>
      <CutoutCurveEditor v-if="advanced && state.show" :raw="props.raw" :result="props.result" @done="applyResult" />
      <matting v-else-if="state.showMatting" :hasHeader="false" @register="mattingStart" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, shallowRef } from 'vue' // [TINIX]
import matting, { MattingType } from '@palxp/image-extraction'
import { ElRadioGroup, ElRadio } from 'element-plus'
import numberSlider from '@/components/modules/settings/numberSlider.vue'
import CutoutCurveEditor from '@/components/business/ai-assistant/CutoutCurveEditor.vue' // [TINIX]

type TState = {
  show: boolean;
  showMatting: boolean;
  isErasing: boolean;
  radius: number;
  brushSize: string;
  hardness: number;
  hardnessText: string;
  constants: MattingType['constants'] | null;
}

type TParams = {
  raw: string
  result: string
}

type TCallback = ((base64: string, usedCurves: boolean) => void) | null // [TINIX]

const props: TParams = {
  raw: '',
  result: ''
}

let callback: TCallback = null // 传回自动抠图的回调

const state = reactive<TState>({
  show: false,
  showMatting: false,
  isErasing: false,
  radius: 0, // 画笔尺寸
  brushSize: '', // 画笔尺寸：计算属性，显示值
  hardness: 0, // 画笔硬度
  hardnessText: '', // 画笔硬度：计算属性，显示值
  constants: null,
})

// [TINIX] Enable the new tools once the brush editor registers.
const mattingParam = shallowRef<MattingType>()
const advanced = ref(false)

const mattingStart = (mattingOptions: MattingType) => {
  mattingOptions.initLoadImages(props.raw, props.result)
  state.isErasing = mattingOptions.isErasing
  state.radius = mattingOptions.radius as number;
  state.hardness = mattingOptions.hardness as number;
  state.constants = mattingOptions.constants
  mattingParam.value = mattingOptions // [TINIX]
}

const open = (raw: string, result: string, cb: TCallback, useCurves = false) => {
  advanced.value = useCurves // [TINIX] The brush retains alpha only, so reopen cloned results in curve mode.
  mattingParam.value = undefined
  state.showMatting = false
  state.show = true
  props.raw = raw
  props.result = result
  callback = cb
}

defineExpose({
  open
})

const done = () => {
  const result = mattingParam.value?.getResult()
  if (result) applyResult(result)
}

// [TINIX] Preserve the existing apply and border workflow.
function applyResult(result: string) {
  state.show = false
  callback?.(result, advanced.value)
}

function openAdvanced() {
  const result = mattingParam.value?.getResult()
  if (!result) return
  props.result = result
  advanced.value = true
}

</script>


<style lang="less" scoped>
:deep(.el-dialog__body) {
  padding: 0 !important;
}
:deep(.el-dialog__header) {
  padding: 10px 35px;
  // var(--el-dialog-padding-primary)
}
.tool-wrap {
  display: flex;
  align-items: center;
}
// .tool-left {
//   display: inline-flex;
//   flex: 1;
// }
.slider-wrap {
  margin-left: 35px;
  width: 240px;
}
</style>

