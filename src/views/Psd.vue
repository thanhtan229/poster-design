<!--
 * @Author: ShawnPhang
 * @Date: 2022-01-10 14:57:53
 * @Description: Psd文件解析
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2025-01-15 22:05:57
-->
<template>
  <div id="page-design-index" ref="pageDesignIndex">
    <div class="top-nav">
      <div class="top-nav-wrap">
        <div class="top-left">
          <div class="name" style="font-size: 15px">{{ $t('business.psd.title') }}</div>
        </div>
        <div style="flex: 1">
          <el-button plain type="primary" @click="jump2word">{{ $t('business.psd.spec') }}</el-button>
          <!-- [TINIX] chọn nhiều file .psd cùng lúc → tự nhập thành mẫu; chọn danh mục (tùy chọn) cho các mẫu đó -->
          <el-select v-model="batch.cate" clearable size="default" style="width: 200px; margin-left: 12px" :placeholder="$t('tinix.ui.psdPage.danh_muc_mau')">
            <el-option v-for="c in batch.cates" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
        </div>
        <el-button v-show="state.isDone" @click="clear">{{ $t('business.psd.clear') }}</el-button>
        <div class="v-tips">
          <HeaderOptions ref="headerRef" :isDone="state.isDone" @change="optionsChange" />
        </div>
      </div>
    </div>

    <div class="page-design-index-wrap">
      <!-- <widget-panel></widget-panel> -->
      <design-board class="page-design-wrap" pageDesignCanvasId="page-design-canvas">
        <div v-if="state.isDone" class="shelter" :style="{ width: (dPage.width * dZoom) / 100 + 'px', height: (dPage.height * dZoom) / 100 + 'px' }"></div>
        <uploader v-else accept=".psd" :hold="true" :drag="true" class="uploader" @load="selectFile">
          <div class="uploader__box"><img style="margin-right: 1rem" src="https://cdn.dancf.com/design/svg/icon_psdimport.37e6f23e.svg" alt="upload" /> {{ $t('business.psd.drop') }}</div>
        </uploader>
      </design-board>
      <style-panel v-show="state.isDone"></style-panel>
    </div>
    <!-- 缩放控制 -->
    <zoom-control v-if="state.isDone" ref="zoomControlRef" />
    <!-- 右键菜单 -->
    <right-click-menu />
    <!-- 旋转缩放组件 -->
    <Moveable />
    <!-- 遮罩百分比进度条 -->
    <!-- [TINIX] tiến độ / kết quả nhập nhiều PSD -->
    <el-dialog :model-value="batch.running || batch.done" :title="$t('tinix.ui.psdPage.nhap_nhieu_mau')" width="520px" :close-on-click-modal="false" :show-close="!batch.running" @close="batch.done = false">
      <el-progress :percentage="batch.total ? Math.round(((batch.running ? batch.index - 1 : batch.total) / batch.total) * 100) : 0" />
      <p v-if="batch.running" style="margin-top: 12px">{{ $t('tinix.ui.psdPage.dang_nhap', { i: batch.index, n: batch.total, name: batch.name }) }}</p>
      <div v-else style="margin-top: 12px; line-height: 1.8">
        <div>{{ $t('tinix.ui.psdPage.ket_qua_nhap', { ok: batch.ok.length, skipped: batch.skipped.length, failed: batch.failed.length }) }}</div>
        <div v-for="f in batch.failed" :key="f.name" style="color: #f56c6c">{{ f.name }}: {{ f.msg }}</div>
      </div>
    </el-dialog>
    <ProgressLoading :percent="state.downloadPercent" :text="state.downloadText" :cancelText="state.cancelText" :msg="state.downloadMsg" @cancel="cancel" @done="state.downloadPercent = 0" />
  </div>
</template>

<script lang="ts" setup>
import i18n from '@/languages'
import { reactive, onMounted, nextTick, onBeforeMount, ref, getCurrentInstance } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { loadLibraryFonts, matchPsdFont } from '@/utils/tinix/psd-font-map' // [TINIX]
import { fitPointText } from '@/utils/tinix/psd-fit' // [TINIX]
import RightClickMenu from '@/components/business/right-click-menu/RcMenu.vue'
import Moveable from '@/components/business/moveable/Moveable.vue'
import shortcuts from '@/mixins/shortcuts'
// import wText from '@/components/modules/widgets/wText/wText.vue'
// import wImage from '@/components/modules/widgets/wImage/wImage.vue'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import useLoading from '@/common/methods/loading'
import uploader from '@/components/common/Uploader/index.vue'
import designBoard from '@/components/modules/layout/designBoard/index.vue'
import zoomControl from '@/components/modules/layout/zoomControl/index.vue'
import HeaderOptions, { TEmitChangeData } from './components/UploadTemplate.vue'
import ProgressLoading from '@/components/common/ProgressLoading/index.vue'
import useWorker from '@/utils/plugins/webWorker'
import psdWorker from '../utils/plugins/worker/loadPSD.worker.ts?worker'
// import { processPSD2Page } from '@/utils/plugins/psd'
import { createBase64 } from '@/utils/plugins/psd'
// import { useSetupMapGetters } from '@/common/hooks/mapGetters'
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import { useCanvasStore, useControlStore, useWidgetStore, useGroupStore } from '@/store'
import { storeToRefs } from 'pinia'
import { wGroupSetting } from '@/components/modules/widgets/wGroup/groupSetting'
import * as adminApi from '@/api/admin' // [TINIX] nhập nhiều PSD
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

type TState = {
  isDone: boolean
  downloadPercent: number // 下载进度
  downloadText: string
  downloadMsg: string
  cancelText: string
}

// mixins: [shortcuts],
const state = reactive<TState>({
  isDone: true,
  downloadPercent: 0, // 下载进度
  downloadText: '',
  downloadMsg: '',
  cancelText: '',
})
const widgetStore = useWidgetStore()
const controlStore = useControlStore()

const route = useRoute()

// const { dZoom } = useSetupMapGetters(['dZoom'])
const groupStore = useGroupStore()
const pageStore = useCanvasStore()
const { dPage } = storeToRefs(pageStore)
const { dZoom } = storeToRefs(useCanvasStore())

const zoomControlRef = ref<typeof zoomControl | null>()

// 管理员守卫：导入 PSD 功能已移至管理后台，仅管理员可访问
try {
  const user = JSON.parse(localStorage.getItem('xp_user') || 'null')
  if (!user || user.role !== 1) {
    ElMessage.warning(i18t('tinix.ui.psdPage.chi_tai_khoan_quan_tri')) // [TINIX]
    setTimeout(() => (window.location.href = './'), 600)
  }
} catch (e) {
  setTimeout(() => (window.location.href = './'), 600)
}

let loading: ReturnType<typeof useLoading> | null = null
const myWorker = new useWorker(psdWorker)

onMounted(async () => {
  groupStore.initGroupJson(JSON.stringify(wGroupSetting))
  adminApi.getTemplateCategories(0, { page: 1, pageSize: 100 }).then((r: any) => (batch.cates = Array.isArray(r?.list) ? r.list : [])).catch(() => {}) // [TINIX]
  await nextTick()
  if (zoomControlRef.value) {
    zoomControlRef.value.screenChange()
  }
  state.isDone = false
})

// [TINIX] nhiều file chọn cùng lúc: gom lại (Uploader phát 'load' từng file) rồi nhập tuần tự thành mẫu; một file thì giữ nguyên luồng cũ (mở trong editor)
const headerRef = ref<any>(null)
const batch = reactive({ running: false, done: false, total: 0, index: 0, name: '', cate: '', cates: [] as any[], ok: [] as string[], skipped: [] as string[], failed: [] as Array<{ name: string; msg: string }> })
const pendingFiles: File[] = []
let collectTimer: any

async function selectFile(file: File) {
  pendingFiles.push(file)
  clearTimeout(collectTimer)
  collectTimer = setTimeout(runPending, 250)
}

async function runPending() {
  const files = pendingFiles.splice(0)
  if (files.length > 1) return importBatch(files)
  loading = useLoading()
  await loadPSD(files[0])
  loading.close()
  state.isDone = true
}

/** Tiêu đề các mẫu đã có (để bỏ qua file trùng tên khi nhập lại) */
async function existingTemplateTitles(): Promise<Set<string>> {
  const titles = new Set<string>()
  try {
    for (let page = 1; page <= 20; page++) {
      const res: any = await adminApi.getTemplates({ page, pageSize: 100 })
      const list: any[] = Array.isArray(res?.list) ? res.list : []
      list.forEach((t) => titles.add(String(t.title)))
      if (list.length < 100) break
    }
  } catch (e) {
    // không lấy được danh sách: vẫn nhập, chỉ không bỏ qua được mẫu trùng
  }
  return titles
}

async function importBatch(files: File[]) {
  Object.assign(batch, { running: true, done: false, total: files.length, index: 0, name: '', ok: [], skipped: [], failed: [] })
  const existing = await existingTemplateTitles()
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const title = file.name.replace(/\.psd$/i, '')
    batch.index = i + 1
    batch.name = file.name
    if (existing.has(title)) {
      batch.skipped.push(file.name)
      continue
    }
    try {
      if (!(await loadPSD(file))) throw new Error(i18t('tinix.ui.psdPage.khong_doc_duoc_file_psd'))
      await headerRef.value.saveAsTemplate(title, batch.cate)
      batch.ok.push(file.name)
      existing.add(title)
    } catch (e: any) {
      batch.failed.push({ name: file.name, msg: String((e && (e.msg || e.message)) || e).slice(0, 160) })
    } finally {
      await clear() // dọn trang trước khi sang file kế
    }
  }
  batch.running = false
  batch.done = true
}

const types: any = {
  text: wTextSetting,
  image: wImageSetting,
}

async function loadPSD(file: File) {
  // const { compositeBuffer, psdFile } = await myWorker.start(file)
  const { data, error }: any = await myWorker.start(file)
  // const data = await processPSD2Page(file)
  // [TINIX] the psd.js parser cannot read some files saved by recent Photoshop versions
  if (error || !data) {
    console.error('[tinix:psd] parse failed:', error)
    ElMessage({ type: 'error', duration: 0, showClose: true, message: i18t('tinix.ui.psdPage.khong_doc_duoc_file_psd') })
    return false
  }
  // [TINIX] set the page size first: widgets added while the page is still the default 1920px get clamped to it
  pageStore.setDPage(Object.assign(pageStore.dPage, { width: data.width, height: data.height }))
  const library = await loadLibraryFonts() // [TINIX] map PSD fonts → library fonts
  const substituted = new Map<string, string>()

  for (let i = 0; i < data.clouds.length; i++) {
    const x: any = data.clouds[i]
    const rawData = JSON.parse(JSON.stringify(types[x.type])) || {}
    // [TINIX] text: use the closest library font instead of the default 站酷快乐体
    if (x.type === 'text' && x.psdFont) {
      const m = matchPsdFont(x.psdFont, library)
      if (m) {
        rawData.fontClass = m.fontClass
        x.fontWeight = m.fontWeight || x.fontWeight // keep faux bold when the name has no weight
        x.fontStyle = m.fontStyle || x.fontStyle
        if (!m.exact) substituted.set(x.psdFont, m.fontClass.alias)
      }
      if (x.psdPointText) await fitPointText(x, rawData.fontClass, data.width) // [TINIX] no unwanted wrapping
    }
    delete x.type
    x.src && (x.imgUrl = createBase64(x.src, { width: x.width, height: x.height })) && delete x.src
    widgetStore.addWidget(Object.assign(rawData, x))
  }

  const { width, height, background: bg } = data
  pageStore.setDPage(Object.assign(pageStore.dPage, { width, height, backgroundColor: bg.color, backgroundImage: createBase64(bg.image, { width, height }) }))
  // [TINIX] tell the user which PSD fonts were replaced
  if (substituted.size) {
    const list = [...substituted].map(([from, to]) => `${from} → ${to}`).join('; ')
    ElMessage({ type: 'info', duration: 8000, showClose: true, message: i18t('tinix.ui.psdPage.substituted', { list }) })
  }
  await loadDone()
  return true
}

async function clear() {
  widgetStore.setDWidgets([])
  pageStore.setDPage(Object.assign(pageStore.dPage, { width: 1920, height: 1080, backgroundColor: '#ffffff', backgroundImage: '' }))
  controlStore.setShowMoveable(false)

  await nextTick()
  state.isDone = false
}

const optionsChange = ({ downloadPercent, downloadText, downloadMsg = '', cancelText = '' }: TEmitChangeData) => {
  typeof downloadPercent === 'number' && (state.downloadPercent = downloadPercent)
  state.downloadText = downloadText
  state.downloadMsg = downloadMsg
  state.cancelText = cancelText
}

const cancel = () => {
  state.downloadPercent = 100
  window.open(`${window.location.protocol + '//' + window.location.host}/home?id=${route.query.id}`)
}

const { handleKeydowm, handleKeyup, dealCtrl } = shortcuts.methods

// ...mapGetters(['dPage', 'dZoom']),

let checkCtrl: number | undefined

onMounted(() => {
  const instance = getCurrentInstance()
  document.addEventListener('keydown', handleKeydowm(controlStore, checkCtrl, instance, dealCtrl), false)
  document.addEventListener('keyup', handleKeyup(controlStore, checkCtrl), false)
})

onBeforeMount(() => {
  const instance = getCurrentInstance()
  document.removeEventListener('keydown', handleKeydowm(controlStore, checkCtrl, instance, dealCtrl), false)
  document.removeEventListener('keyup', handleKeyup(controlStore, checkCtrl), false)
  document.oncontextmenu = null
})
// ...mapActions(['selectWidget']),

async function loadDone() {
  await nextTick()
  if (!zoomControlRef.value) return
  zoomControlRef.value.screenChange()
  setTimeout(() => {
    widgetStore.selectWidget({ uuid: '-1' })
    // store.dispatch('selectWidget', { uuid: '-1' })
    // selectWidget({
    //   uuid: '-1',
    // })
    // this.$store.commit('setShowMoveable', false)
  }, 100)
}
function jump2word() {
  window.open('https://kdocs.cn/l/clmBsIkhve8d')
}

defineExpose({
  selectFile,
  clear,
  cancel,
  optionsChange,
})
</script>

<style lang="less" scoped>
@import url('@/assets/styles/design.less');
.uploader {
  position: absolute;
  z-index: 999;
  left: 50%;
  transform: translate(-50%, -50%);
  top: 50%;
  &__box {
    color: #666666;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }
}
.v-tips {
  padding: 0 1rem;
  font-size: 15px;
  color: #666666;
}
</style>
