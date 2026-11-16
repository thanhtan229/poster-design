<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * @Author: ShawnPhang
 * @Date: 2022-01-12 11:26:53
 * @Description: 顶部操作按钮组
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2026-08-31 21:36:33
-->
<template>
  <div class="top-title"><el-input v-model="state.title" :placeholder="$t('editor.header.untitledDesign')" class="input-wrap" /></div>
  <div class="top-icon-wrap">
    <template v-if="tempEditing">
      <el-button plain type="primary" :loading="state.loading" :disabled="state.loading" @click="saveTemp">{{ $t('editor.header.saveTemplate') }}</el-button>
      <el-button @click="userStore.managerEdit(false)">{{ $t('common.cancel') }}</el-button>
      <div class="divide__line">|</div>
    </template>
    <watermark-option style="margin-right: 0.5rem" />
    <PrintBundle v-if="(dPage as any).collage" :save-design="()=>save(true)" :title="state.title" :disabled="tempEditing" />
    <ApprovedPrints />
    <CustomerOrders />
    <el-button type="primary" :loading="jpgRunning" :disabled="tempEditing" @click="exportPrintJpg">Xuất JPG để in</el-button>
    <el-button plain @click="openBatch">{{ i18t('tinix.ui.batch.title') }}</el-button>
    <slot />
  </div>
  <!-- 生成图片组件 -->
  <SaveImage ref="canvasImage" />
  <el-dialog v-model="batch.open" :title="i18t('tinix.ui.batch.title')" width="480px" append-to-body>
    <p>{{ i18t('tinix.ui.batch.select') }}</p>
    <el-checkbox-group v-model="batch.pages" :disabled="batch.running">
      <el-checkbox v-for="(_, i) in dLayouts" :key="i" :label="i">{{ i18t('tinix.ui.batch.page', { n: i + 1 }) }}</el-checkbox>
    </el-checkbox-group>
    <p>{{ i18t('tinix.ui.batch.format') }} <el-select v-model="batch.format" :disabled="batch.running"><el-option label="PNG" value="png" /><el-option label="JPG" value="jpg" /></el-select></p>
    <p>{{ i18t('tinix.ui.batch.resolution') }} <el-select v-model="batch.scale" :disabled="batch.running"><el-option label="100%" :value="1" /><el-option label="50%" :value="0.5" /></el-select></p>
    <p v-if="batch.running || batch.done">{{ i18t('tinix.ui.batch.progress', { n: batch.done, total: batch.total }) }}</p>
    <p v-if="batch.failed.length">{{ i18t('tinix.ui.batch.failed', { pages: batch.failed.map((n) => n + 1).join(', ') }) }}</p>
    <template #footer>
      <el-button :disabled="batch.running" @click="batch.open = false">{{ i18t('common.cancel') }}</el-button>
      <el-button v-if="batch.failed.length" :disabled="batch.running" @click="runBatch(true)">{{ i18t('tinix.ui.batch.retry') }}</el-button>
      <el-button type="primary" :disabled="batch.running || !batch.pages.length" @click="runBatch(false)">{{ i18t('tinix.ui.batch.start') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import i18n from '@/languages'
import api from '@/api'
import * as adminApi from '@/api/admin' // [TINIX]
import { reactive, ref } from 'vue'
import { ElCheckbox, ElCheckboxGroup, ElOption, ElSelect } from 'element-plus' // [TINIX] điều khiển chọn trang và định dạng
import { useRoute, useRouter } from 'vue-router'
import _dl from '@/common/methods/download'
import useNotification from '@/common/methods/notification'
import SaveImage from '@/components/business/save-download/CreateCover.vue'
import PrintBundle from '@/components/business/collage/PrintBundle.vue'
import ApprovedPrints from '@/components/business/collage/ApprovedPrints.vue'
import CustomerOrders from '@/components/business/collage/CustomerOrders.vue'
import { useFontStore } from '@/common/methods/fonts'
import downloadBlob from '@/common/methods/download/downloadBlob'
import { useControlStore, useCanvasStore, useUserStore, useWidgetStore } from '@/store/index'
import { storeToRefs } from 'pinia'
import watermarkOption from './Watermark.vue'
import { clampDpi, DEFAULT_DPI } from '@/utils/tinix/units' // [TINIX]
import { withPngDpi } from '@/utils/tinix/png-dpi' // [TINIX]
import { zipImages } from '@/utils/tinix/zip' // [TINIX]
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

type TProps = {
  modelValue?: boolean
}

type TEmits = {
  (event: 'change', data: { downloadPercent: number; downloadText: string; downloadMsg?: string }): void
  (event: 'update:modelValue', data: boolean): void
}

type TState = {
  stateBollean: boolean
  wmBollean: boolean
  title: string
  loading: boolean
}

const props = defineProps<TProps>()
const emit = defineEmits<TEmits>()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const widgetStore = useWidgetStore()

const canvasImage = ref<typeof SaveImage | null>(null)
const jpgRunning = ref(false)
async function exportPrintJpg() {
  if (jpgRunning.value) return
  jpgRunning.value = true
  try {
    const id = await save(true)
    if (!id) throw new Error('Không lưu được thiết kế')
    const page = pageStore.dPage
    const url = api.home.download({ id, width: page.width, height: page.height, index: pageStore.dCurrentPage, dpi: clampDpi(page.dpi || DEFAULT_DPI) }) + '&format=jpg'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('Không tạo được JPG; kiểm tra ảnh và font rồi thử lại')
      const blob = await response.blob()
      const signature = new Uint8Array(await blob.slice(0, 3).arrayBuffer())
      if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) throw new Error('Máy chủ chưa trả về JPG hợp lệ. Hãy khởi động lại app sau khi cập nhật.')
      downloadBlob(blob, `${(state.title || 'cat-dan').replace(/[<>:"/\\|?*]/g, '-')}.jpg`)
    } finally { clearTimeout(timer) }
  } catch (e:any) { useNotification('Xuất JPG thất bại', e?.message || '', { type: 'error' }) }
  finally { jpgRunning.value = false }
}

const pageStore = useCanvasStore()
const controlStore = useControlStore()

const { dPage } = storeToRefs(pageStore)
const { tempEditing } = storeToRefs(userStore)
const { dWidgets, dLayouts } = storeToRefs(widgetStore)

const state = reactive<TState>({
  stateBollean: false,
  wmBollean: false,
  title: '',
  loading: false,
})

// [TINIX] Xuất tuần tự để tránh các lần chụp dùng chung tệp ảnh tạm trên server.
const batch = reactive({ open: false, running: false, pages: [] as number[], failed: [] as number[], done: 0, total: 0, format: 'png', scale: 1 })
function openBatch() {
  batch.pages = dLayouts.value.map((_, i) => i)
  batch.failed = []
  batch.done = 0
  batch.open = true
}
async function convertBatchImage(blob: Blob, format: string, scale: number, dpi: number): Promise<Blob> {
  const image = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    if (format === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95))
    if (!result) throw new Error('Image encoding failed')
    return format === 'png' ? withPngDpi(result, dpi) : result
  } finally { image.close() }
}
async function runBatch(retry: boolean) {
  if (batch.running) return
  const pages = (retry ? batch.failed : batch.pages).slice().sort((a, b) => a - b)
  batch.running = true; batch.failed = []; batch.done = 0; batch.total = pages.length
  const files: Array<{ name: string; blob: Blob }> = []
  try {
    if (tempEditing.value) throw new Error(i18t('tinix.ui.batch.design_only'))
    const id = await save(true)
    if (!id) throw new Error(i18t('tinix.ui.batch.save_failed'))
    for (const index of pages) {
      try {
        const page = dLayouts.value[index]?.global
        if (!page) throw new Error('Page unavailable')
        const url = api.home.download({ id, width: page.width, height: page.height, index, dpi: clampDpi(page.dpi || DEFAULT_DPI) })
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 90000)
        let response: Response
        try { response = await fetch(url, { signal: controller.signal }) } finally { clearTimeout(timer) }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        let blob = await response.blob()
        const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
        if (signature[0] !== 137 || signature[1] !== 80 || signature[2] !== 78 || signature[3] !== 71) throw new Error('Invalid PNG')
        if (batch.format === 'jpg' || batch.scale !== 1) blob = await convertBatchImage(blob, batch.format, batch.scale, clampDpi(page.dpi || DEFAULT_DPI))
        files.push({ name: `trang-${String(index + 1).padStart(3, '0')}.${batch.format}`, blob })
      } catch (e) { batch.failed.push(index) }
      batch.done++
    }
    if (files.length) downloadBlob(await zipImages(files), `${state.title || 'TinixPoster'}-trang.zip`)
  } catch (e: any) {
    batch.failed = pages
    useNotification(i18t('tinix.ui.photoAuto.xuat_loi'), e?.message || '', { type: 'error' })
  } finally { batch.running = false }
}

// 保存作品，返回保存后的作品 id（新建作品时返回创建后的新 id；失败返回 undefined）
async function save(silent: boolean = false) {
  if (tempEditing.value) {
    await saveTemp()
    return
  }
  const { id, tempid } = route.query
  const designId = typeof id === 'string' ? id : undefined
  const templateId = typeof tempid === 'string' ? tempid : undefined
  const res: any = await api.home.saveWorks({
    id: designId,
    title: state.title || i18n.global.t('editor.header.untitledDesign'),
    data: JSON.stringify(dLayouts.value),
    temp_id: templateId,
    width: Number(dPage.value.width),
    height: Number(dPage.value.height),
  })
  if (res?.id) {
    if (!silent) useNotification(i18n.global.t('editor.header.saveSuccess'), i18n.global.t('editor.header.designSaved'))
    if (!designId) router.replace({ path: '/home', query: { ...route.query, id: String(res.id) } })
    return res.id
  } else {
    useNotification(i18n.global.t('editor.header.saveFailed'), res?.msg || i18n.global.t('editor.header.designSaveFailed'), { type: 'error' })
  }
}

// 保存模板
async function saveTemp() {
  if (state.loading) return
  const { tempid, tempType: type } = route.query
  if (!tempid) return
  state.loading = true
  try {
    let res: any = null
    const data = widgetStore.dLayouts
    if (Number(type) == 1) {
      // 保存组件，组合元素要保证在最后一位，才能默认选中
      if (dWidgets.value[0].type === 'w-group') {
        const group = dWidgets.value.shift()
        if (!group) return
        group.record.width = 0
        group.record.height = 0
        dWidgets.value.push(group)
      }
      // TODO：如果保存组件不存在组合，则添加组合。该功能待优化
      if (!dWidgets.value.some((x: Record<string, any>) => x.type === 'w-group')) {
        alert(i18n.global.t('editor.header.groupRequired'))
        return
      }
      res = await api.home.saveTemp({ id: tempid, type, title: state.title || i18n.global.t('editor.header.untitledComponent'), data: JSON.stringify(dWidgets.value), width: dPage.value.width, height: dPage.value.height })
    } else res = await api.home.saveTemp({ id: tempid, title: state.title || i18n.global.t('editor.header.untitledTemplate'), data: JSON.stringify(data), width: dPage.value.width, height: dPage.value.height })
    if (res?.id || res?.result?.id || res?.stat) {
      window.dispatchEvent(new Event('tinix:templates-changed')) // [TINIX] làm mới danh sách Mẫu thiết kế (bìa mới)
      useNotification(i18n.global.t('editor.header.saveSuccess'), i18n.global.t('editor.header.templateUpdated'))
    } else {
      useNotification(i18n.global.t('editor.header.saveFailed'), res?.msg || i18n.global.t('editor.header.templateSaveFailed'), { type: 'error' })
    }
  } catch (error: any) {
    useNotification(i18n.global.t('editor.header.saveFailed'), error?.message || i18n.global.t('editor.header.templateSaveFailed'), { type: 'error' })
  } finally {
    state.loading = false
  }
}

// [TINIX] Lưu thiết kế hiện tại thành MẪU CÔNG KHAI (bảng templates, hiện ở thẻ "Mẫu thiết kế") — chỉ admin
async function saveAsTemplate() {
  if (state.loading) return
  state.loading = true
  try {
    const { id } = await adminApi.saveTemplate({
      title: state.title || i18t('tinix.ui.headerOptions.mau_chua_dat_ten'),
      type: 0,
      data: JSON.stringify(dLayouts.value),
      width: Number(dPage.value.width),
      height: Number(dPage.value.height),
    })
    window.dispatchEvent(new Event('tinix:templates-changed')) // làm mới danh sách Mẫu thiết kế
    useNotification(i18t('tinix.ui.headerOptions.da_luu_thanh_mau'), i18t('tinix.ui.headerOptions.savedBody', { id }))
  } catch (error: any) {
    useNotification(i18t('tinix.ui.headerOptions.luu_thanh_mau_khong_thanh'), error?.msg || error?.message || i18t('tinix.ui.headerOptions.vui_long_thu_lai'), { type: 'error' })
  } finally {
    state.loading = false
  }
}

// 停用启用
async function stateChange(e: string | number | boolean) {
  const { tempid, tempType: type } = route.query
  const { stat } = await api.home.saveTemp({ id: tempid, type, state: e ? 1 : 0 })
  stat != 0 && useNotification(i18n.global.t('editor.header.saveSuccess'), i18n.global.t('editor.header.templateUpdated'))
}
async function download() {
  if (state.loading === true) {
    useNotification(i18n.global.t('editor.header.exporting'), i18n.global.t('editor.header.exportingWait'))
    return
  }
  state.loading = true
  try { // [TINIX] luôn mở khóa nút xuất khi xảy ra lỗi
  const currentRecord = pageStore.dCurrentPage
  const backEndCapture: boolean = checkDownloadPoster(dLayouts.value[currentRecord])
  const fileName = `${state.title || i18n.global.t('editor.header.untitledWork')}.png`
  if (!backEndCapture) {
    // 无特殊条件命中则直接从前端出图，无需登录保存
    const { blob } = await canvasImage.value?.createPoster()
    downloadBlob(await withPngDpi(blob, clampDpi(dPage.value.dpi || DEFAULT_DPI)), fileName) // [TINIX] ghi DPI vào PNG để Photoshop/tiệm in mở đúng khổ
    return
  }
  // 服务端出图依赖作品数据，需先保存；无 id 的新作品在此静默创建，并返回新 id 供出图使用
  const savedId = await save(true)
  const { id, tempid } = route.query
  // 从服务端生成图片
  const { width, height } = dPage.value
  // 后台模板编辑页可能保留之前作品的 id；模板编辑时必须只使用 tempid，
  // 否则截图服务会按 id 优先加载另一条用户作品。
  const screenshotId = route.query.edit === '1' && tempid ? undefined : (savedId || id)
  emit('update:modelValue', true)
  emit('change', { downloadPercent: 1, downloadText: i18n.global.t('editor.header.processing') })
  let timerCount = 0
  const animation = setInterval(() => {
    if (props.modelValue && timerCount < 75) {
      timerCount += RandomNumber(1, 10)
      emit('change', { downloadPercent: 1 + timerCount, downloadText: i18n.global.t('editor.header.composing') })
    } else {
      clearInterval(animation)
    }
  }, 800)
  await _dl.downloadImg(
      api.home.download({ id: screenshotId, tempid, width, height, index: pageStore.dCurrentPage, dpi: clampDpi(dPage.value.dpi || DEFAULT_DPI) }) + '&r=' + Math.random(),
    (progress: number, xhr: any) => {
      if (props.modelValue) {
        clearInterval(animation)
        progress >= timerCount && emit('change', { downloadPercent: Number(progress.toFixed(0)), downloadText: i18n.global.t('editor.header.generating') })
      } else {
        xhr.abort()
        state.loading = false
      }
    },
    fileName,
  )
  emit('change', { downloadPercent: 100, downloadText: i18n.global.t('editor.header.downloadDone'), downloadMsg: '' })
  } catch (error: any) {
    emit('update:modelValue', false)
    useNotification(i18t('tinix.ui.photoAuto.xuat_loi'), error?.message || '', { type: 'error' })
  } finally {
    state.loading = false
  }
}
function RandomNumber(min: number, max: number) {
  return Math.ceil(Math.random() * (max - min)) + min
}

async function load(cb: () => void) {
  const { id, tempid: tempId, tempType: type, w_h, dpi } = route.query
  if (route.name !== 'Draw') {
    await useFontStore.init() // 初始化加载字体
  }
  const apiName = tempId && !id ? 'getTempDetail' : 'getWorks'
  if (w_h && !id && !tempId) {
    // 用于初始化画布大小，创建空作品
    const wh: any = w_h.toString().split('*')
    wh[0] && (dPage.value.width = wh[0])
    wh[1] && (dPage.value.height = wh[1])
    dpi && (dPage.value.dpi = clampDpi(dpi)) // [TINIX] DPI đi kèm kích thước cm khi tạo thiết kế mới
  }
  if (!id && !tempId) {
    initBoard()
    cb()
    return
  }
  const { data: content, title, state: _state, width, height } = await api.home[apiName]({ id: (id || tempId) as any, type: type as any })
  if (!content) return
  const data = JSON.parse(content)
  state.stateBollean = !!_state
  state.title = title
  controlStore.setShowMoveable(false) // 清理掉上一次的选择框
  if (Number(type) == 1) {
    // 加载文字组合组件
    dPage.value.width = width
    dPage.value.height = height
    widgetStore.addGroup(data)
  } else {
    if (Array.isArray(data)) {
      widgetStore.dLayouts = data
      widgetStore.setDWidgets(widgetStore.getWidgets())
    } else {
      widgetStore.dLayouts = [{ global: data.page, layers: data.widgets }]
      id ? widgetStore.setDWidgets(widgetStore.getWidgets()) : widgetStore.setTemplate(widgetStore.getWidgets())
    }
    pageStore.setDPage(pageStore.getDPage())
  }
  cb()
}

function initBoard() {
  widgetStore.setDWidgets(widgetStore.getWidgets())
  pageStore.setDPage(pageStore.getDPage())
}

function checkDownloadPoster({ layers }: any) {
  let backEndCapture = false
  for (let i = 0; i < layers.length; i++) {
    const { type, mask, textEffects } = layers[i]
    if ((type === 'w-image' && mask) || type === 'w-svg' || type === 'w-qrcode' || (textEffects && textEffects.length > 0)) {
      backEndCapture = true
      break
    }
  }
  return backEndCapture
}

defineExpose({
  download,
  save,
  saveTemp,
  saveAsTemplate, // [TINIX]
  getTitle: () => state.title, // [TINIX] tên file khi xuất PSD
  stateChange,
  load,
})
</script>

<style lang="less" scoped>
.top-icon-wrap {
  display: flex;
  align-items: center;
  padding-right: 20px;
  height: 54px;
  .top-icon {
    background-color: rgba(0, 0, 0, 0.4);
    border-radius: @radius-sm;
    color: #ffffff;
    cursor: pointer;
    font-weight: 600;
    margin: 8px;
    padding: 5px 8px;
    &:hover {
      background-color: rgba(0, 0, 0, 0.5);
    }
  }
}
.top-title {
  color: @color-black;
  flex: 1;
  padding-left: 20px;
  // font-weight: bold;
  .input-wrap {
    // box-shadow: none;
    width: 15rem;
    :deep(input) {
      border-color: #ffffff;
      // border-color: #e8eaec;
    }
  }
  .input-wrap:hover {
    :deep(input) {
      // border-color: #e8eaec;
    }
  }
}
.primary-btn {
  font-weight: 600;
  transform: scale(0.95);
  margin-left: 10px;
}
.divide__line {
  margin: 0 1rem;
  color: #e8eaec;
  height: 20px;
}
</style>
