<!--
 * @Author: ShawnPhang
 * @Date: 2024-03-03 19:00:00
 * @Description: 裁剪组件
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @Date: 2024-03-03 19:00:00
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
-->
<template>
  <el-dialog v-model="state.show" :title="$t(pairOnly ? 'tinix.ui.cutoutTools.openPair' : 'business.cutout.title')" align-center width="650" append-to-body :z-index="22000" @close="handleClose">
    <!-- [TINIX] chọn model tách nền; đổi model khi đã có ảnh thì tách lại bằng model mới -->
    <div v-if="!pairOnly" class="tinix-engine">
      <span>{{ $t('tinix.ui.cutoutEngine.model') }}</span>
      <el-radio-group v-model="engine" size="small" @change="onEngineChange">
        <el-radio-button value="birefnet">{{ $t('tinix.ui.cutoutEngine.birefnet') }}</el-radio-button>
        <el-radio-button value="u2net">{{ $t('tinix.ui.cutoutEngine.u2net') }}</el-radio-button>
      </el-radio-group>
      <small>{{ engine === 'birefnet' ? $t('tinix.ui.cutoutEngine.birefnet_hint') : $t('tinix.ui.cutoutEngine.u2net_hint') }}</small>
    </div>
    <uploader v-if="!pairOnly && !state.rawImage" :hold="true" :drag="true" :multiple="true" class="uploader" @load="handleUploaderLoad">
      <div class="uploader__box">
        <upload-filled style="width: 64px; height: 64px" />
        <!-- <div class="el-upload__text">在此拖入或选择<em>上传图片</em></div> -->
        <div class="el-upload__text">{{ $t('business.cutout.local') }}</div>
      </div>
      <div class="el-upload__tip el-upload__text"><em>{{ $t('business.cutout.firstUse') }}</em></div>
    </uploader>
    <!-- [TINIX] Repair an existing pair without starting background removal. -->
    <form v-if="state.show && pairOnly" class="tinix-pair" @submit.prevent="openPair">
      <label>{{ $t('tinix.ui.cutoutTools.original') }}
        <input type="file" accept="image/*" :disabled="pairBusy" @change="selectPairFile($event, 'raw')" />
      </label>
      <label>{{ $t('tinix.ui.cutoutTools.result') }} (PNG)
        <input type="file" accept="image/png" :disabled="pairBusy" @change="selectPairFile($event, 'cut')" />
      </label>
      <el-button native-type="submit" :disabled="!pair.raw || !pair.cut" :loading="pairBusy">{{ $t('tinix.ui.cutoutTools.openPair') }}</el-button>
      <small v-if="pairError" role="alert">{{ $t('tinix.ui.cutoutTools.' + pairError) }}</small>
    </form>
    <el-progress v-if="!state.cutImage && state.progressText" :percentage="state.progress">
      <el-button text>
        {{ state.progressText }} <span v-show="state.progress">{{ state.progress }}%</span>
      </el-button>
    </el-progress>
    <div class="content">
      <div v-show="state.rawImage" v-loading="!state.cutImage" :style="{ width: state.offsetWidth ? state.offsetWidth + 'px' : '100%' }" class="scan-effect transparent-bg">
        <img ref="raw" :style="{ 'clip-path': 'inset(0 0 0 ' + state.percent + '%)' }" :src="state.rawImage" alt="" />
        <img v-show="state.cutImage" :src="state.cutImage" :alt="$t('business.cutout.resultAlt')" @mousemove="mousemove" />
        <div v-show="state.cutImage" :style="{ left: state.percent + '%' }" class="scan-line"></div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <!-- [TINIX] chỉ khi tách nền ảnh trên canvas: áp luôn viền trắng hình dán (mm); 0 = không viền -->
        <span v-show="state.cutImage && !state.toolModel" class="tinix-sticker">
          {{ $t('tinix.ui.stickerBorder.dialog_label') }}
          <el-input-number v-model="borderMm" :min="0" :max="8" :step="0.5" size="small" controls-position="right" @change="onBorderChange" /> mm
        </span>
        <el-button v-show="state.cutImage && state.toolModel" @click="clear">{{ $t('business.cutout.reselect') }}</el-button>
        <!-- [TINIX] Open the exact mask directly and retain cloned pixels when reopening. -->
        <el-button v-show="state.cutImage && !usedCurves" type="primary" plain @click="edit(false)">{{ $t('business.cutout.edit') }}</el-button>
        <el-button v-show="state.cutImage" @click="edit(true)">{{ $t('tinix.ui.cutoutTools.title') }}</el-button>
        <el-button v-show="state.cutImage && state.toolModel" type="primary" @click="download"> {{ $t('business.cutout.download') }} </el-button>
        <el-button v-show="state.cutImage && !state.toolModel" v-loading="state.loading" type="primary" @click="cutDone"> {{ state.loading ? $t('business.cutout.uploading') : $t('business.cutout.done') }} </el-button>
      </span>
    </template>
    <ImageExtraction ref="matting" />
  </el-dialog>
</template>

<script lang="ts" setup>
import { reactive, nextTick, ref } from 'vue'
import { getCutoutEngine, setCutoutEngine, type CutoutEngine } from '@/utils/tinix/cutout-engine' // [TINIX]
import { readCutoutFile, readCutoutImage } from '@/utils/tinix/cutout-workspace' // [TINIX]
import { ElProgress, ElRadioGroup, ElRadioButton, ElInputNumber } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import uploader from '@/components/common/Uploader/index.vue'
import _dl from '@/common/methods/download'
import ImageExtraction from '../ImageExtraction/index.vue'
import { selectImageFile, uploadCutPhotoToCloud } from './method'
import { useControlStore } from '@/store'

export type TImageCutoutState = {
    show: boolean;
    rawImage: string;
    cutImage: string;
    offsetWidth: number;
    percent: number;
    progress: number;
    progressText: string;
    toolModel: boolean;
    loading: boolean;
}

const controlStore = useControlStore()
const state = reactive<TImageCutoutState>({
  show: false,
  rawImage: '',
  cutImage: '',
  offsetWidth: 0,
  percent: 0,
  progress: 0,
  progressText: '',
  toolModel: true,
  loading: false,
})

let fileName: string = 'unknow'
const engine = ref<CutoutEngine>(getCutoutEngine()) // [TINIX]
const borderMm = ref<number>(Number(localStorage.getItem('tinix.stickerBorderMm')) || 0) // [TINIX]
function onBorderChange(v: any) {
  localStorage.setItem('tinix.stickerBorderMm', String(v || 0))
}
let currentFile: File | null = null // [TINIX] ảnh đang tách, để tách lại khi đổi model
let localResult: ((image: string, border: number) => void) | undefined // [TINIX] Crop is kept in its draft.
let isRuning: boolean = false

const emits = defineEmits<{
  (event: "done", data: string, borderMm?: number): void
}>()

const raw = ref(null)
const matting = ref<typeof ImageExtraction | null>(null)
const usedCurves = ref(false) // [TINIX]
// [TINIX] This path only reads local files and downloads the edited PNG.
const pair = reactive<{ raw?: File; cut?: File }>({})
const pairOnly = ref(false)
const pairBusy = ref(false)
const pairError = ref('')

function selectPairFile(event: Event, side: 'raw' | 'cut') {
  pair[side] = (event.target as HTMLInputElement).files?.[0]
  pairError.value = ''
}

async function openPair() {
  const { raw, cut } = pair
  if (!raw || !cut || pairBusy.value) return
  pairBusy.value = true
  pairError.value = ''
  try {
    const [source, result] = await Promise.all([readCutoutFile(raw), readCutoutFile(cut)])
    const [sourceImage, resultImage] = await Promise.all([readCutoutImage(source), readCutoutImage(result)])
    if (!state.show || pair.cut !== cut) return
    if (sourceImage.naturalWidth !== resultImage.naturalWidth || sourceImage.naturalHeight !== resultImage.naturalHeight) {
      pairError.value = 'pairSize'
      return
    }
    matting.value?.open(source, result, (image: string) => {
      _dl.downloadBase64File(image, cut.name.replace(/\.png$/i, '') + '-edited.png')
    }, true)
  } catch {
    if (pair.cut === cut) pairError.value = 'readError'
  } finally {
    pairBusy.value = false
  }
}

const open = (file: File) => {
  localResult = undefined
  pairOnly.value = false // [TINIX]
  clear()
  state.toolModel = !file // [TINIX] Show the local pair form only in the standalone tool.
  state.loading = false
  state.show = true
  controlStore.setShowMoveable(false)
  nextTick(() => {
    if (file) {
      handleUploaderLoad(file)
    }
  })
}

function openPairInput() {
  localResult = undefined
  clear()
  pairOnly.value = true
  state.toolModel = true
  state.show = true
  controlStore.setShowMoveable(false)
}

function openLocal(file: File, done: (image: string, border: number) => void) {
  open(file)
  localResult = done
  if (!borderMm.value) borderMm.value = 1
}

defineExpose({ open, openPairInput, openLocal })

const handleUploaderLoad = (file: File) => {
  usedCurves.value = false // [TINIX] A new cutout starts with the original colors.
  currentFile = file
  selectImageFile(state as TImageCutoutState, raw, file, (result, name) => {
    fileName = name
    state.rawImage && (state.cutImage = result)
    requestAnimationFrame(run)
  }, engine.value)
}

// [TINIX] đổi model: nhớ lựa chọn; đã có ảnh thì tách lại
function onEngineChange(v: any) {
  setCutoutEngine(v)
  if (!currentFile || !state.rawImage) return
  state.cutImage = ''
  handleUploaderLoad(currentFile)
}

const handleClose = () => {
  localResult = undefined
  pair.raw = pair.cut = undefined // [TINIX]
  pairError.value = ''
  controlStore.setShowMoveable(true)
}

const mousemove = (e: MouseEvent) => {
  !isRuning && (state.percent = (e.offsetX / (e.target as any).width) * 100)
}

const download = () => {
  _dl.downloadBase64File(state.cutImage, fileName)
}

const clear = () => {
  URL.revokeObjectURL(state.rawImage)
  state.rawImage = ''
  state.cutImage = ''
  state.percent = 0
  state.offsetWidth = 0
}

const run = () => {
  state.percent += 1
  isRuning = true
  state.percent < 100 ? requestAnimationFrame(run) : (isRuning = false)
}

const cutDone = async () => {
  if (localResult) {
    localResult(state.cutImage, borderMm.value)
    state.show = false
    handleClose()
    return
  }
  state.loading = true
  const url = await uploadCutPhotoToCloud(state.cutImage)
  emits('done', url, borderMm.value)
  state.show = false
  handleClose()
}

// [TINIX] The curve editor returns the full PNG including any cloned color.
const edit = (useCurves: boolean) => {
  if (!matting.value) return
  matting.value.open(state.rawImage, state.cutImage, (base64: string, used: boolean) => {
    usedCurves.value = used
    state.cutImage = base64
    state.percent = 0
    requestAnimationFrame(run)
  }, useCurves || usedCurves.value)
}

</script>

<style lang="less" scoped>
.tinix-engine {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-bottom: 12px;
  font-size: 13px;
  small {
    flex-basis: 100%;
    color: #8a8f99;
  }
}
/* [TINIX] A standalone input for an already matched pair. */
.tinix-pair {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  label { display: flex; flex-wrap: wrap; gap: 6px; }
}
.uploader {
  &__box {
    color: #333333;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  }
}
.content {
  position: relative;
  display: flex;
  justify-content: center;
}
.scan-effect {
  position: relative;
  height: 50vh;
  overflow: hidden;
  img {
    // width: 100%;
    height: 100%;
    object-fit: contain;
    position: absolute;
  }
}

.scan-line {
  position: absolute;
  top: 0;
  width: 1.5px;
  height: 100%;
  background: rgba(255, 255, 255, 0.7);
  // background-image: linear-gradient(to top, transparent, rgba(255, 255, 255, 0.7), transparent);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
}

.progress {
  width: 100%;
}
</style>


