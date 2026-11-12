<!-- [TINIX] Trợ lý AI → Dựng theo mẫu: học bố cục/phong cách của ảnh mẫu, dựng thành các lớp chỉnh được với nội dung mới. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <el-button size="small" @click="pick">Chọn ảnh thiết kế mẫu…</el-button>
      <input ref="fileRef" type="file" accept="image/*" style="display: none" @change="onFile" />
      <el-checkbox v-model="state.usePage" size="small">Viết chữ hợp với ảnh trang hiện tại</el-checkbox>
      <el-radio-group v-model="state.lang" size="small">
        <el-radio-button value="vi">Tiếng Việt</el-radio-button>
        <el-radio-button value="en">English</el-radio-button>
      </el-radio-group>
    </div>
    <p class="tx-hint">AI chỉ <b>học bố cục, nhịp chữ, kiểu font, màu</b> của mẫu (Pinterest, tạp chí…) và viết <b>nội dung mới</b> — không chép chữ, logo hay hình minh hoạ. Kết quả gồm lớp chữ, khung ảnh (thay ảnh của bạn vào) và khối màu, tất cả chỉnh được.</p>
    <div class="tx-row" v-if="state.reference">
      <img :src="state.reference" style="max-height: 150px; max-width: 45%; border-radius: 6px" />
      <el-button type="primary" size="small" :loading="state.loading" @click="analyze">{{ state.loading ? 'AI đang phân tích (30–90 giây)…' : '✨ Phân tích mẫu' }}</el-button>
    </div>

    <div v-if="state.result" class="tx-result">
      <div class="tx-card">
        <div class="tx-card-head"><b>Kết quả</b> <span class="tx-swatch" :style="{ background: state.result.background }" /> <span class="tx-label">{{ counts }}</span></div>
        <div v-for="(r, i) in textRegions" :key="i" class="tx-part">
          <span class="tx-label" style="min-width: 70px">{{ r.role }}</span>
          <span class="tx-part-text" :style="{ fontFamily: `'${r.fontFamily}'`, fontWeight: String(r.weight), fontStyle: r.italic ? 'italic' : 'normal', fontSize: '15px' }">{{ r.uppercase ? r.text.toUpperCase() : r.text }}</span>
          <span class="tx-label">{{ r.fontFamily }}</span>
        </div>
        <p v-if="state.result.notes" class="tx-hint">ℹ {{ state.result.notes }}</p>
        <div class="tx-row">
          <el-checkbox v-model="state.matchSize" size="small">Đặt khổ trang theo tỉ lệ ảnh mẫu (chỉ khi trang còn trống hoặc đã chọn xoá lớp)</el-checkbox>
          <el-checkbox v-model="state.useBackground" size="small">Dùng màu nền của mẫu</el-checkbox>
          <el-checkbox v-model="state.clearFirst" size="small">Xoá các lớp hiện có trước khi dựng (giữ ảnh nền)</el-checkbox>
        </div>
        <div class="tx-row">
          <el-button type="primary" size="small" :loading="state.building" @click="build">Dựng vào trang</el-button>
        </div>
      </div>
      <p class="tx-meta">Model: {{ state.result.model }} · lần gọi #{{ state.result.jobId }} · Hoàn tác: Ctrl+Z</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, computed, nextTick } from 'vue'
import { ElMessage, ElCheckbox, ElRadioGroup, ElRadioButton } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useWidgetStore, useCanvasStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import { capturePage, fileToDataUrl } from '@/utils/tinix/capture'
import { buildRebuildWidgets } from '@/utils/tinix/rebuild'
import { ensureFont } from '@/utils/tinix/psd-fit'

const widgetStore = useWidgetStore()
const canvasStore = useCanvasStore()
const { dPage } = storeToRefs(canvasStore)
const fileRef = ref<HTMLInputElement>()
const state = reactive({ lang: 'vi', usePage: true, reference: '', loading: false, building: false, useBackground: false, clearFirst: false, matchSize: true, refW: 0, refH: 0, result: null as any })

const textRegions = computed(() => (state.result?.regions || []).filter((r: any) => r.type === 'text'))
const counts = computed(() => {
  const rs = state.result?.regions || []
  const n = (t: string) => rs.filter((r: any) => r.type === t).length
  return `${n('text')} khối chữ · ${n('photo')} khung ảnh · ${n('shape')} khối màu`
})

function pick() {
  fileRef.value?.click()
}
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  state.reference = await fileToDataUrl(file)
  state.result = null
  // [TINIX] remember the reference size: the page is reshaped to its aspect ratio when building
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const im = new Image()
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => resolve({ w: 0, h: 0 })
    im.src = state.reference
  })
  state.refW = dims.w
  state.refH = dims.h
}

/** Long side of a page reshaped to the reference aspect ratio (px). */
const MATCH_LONG_SIDE = 1920

/** Reshape the page to the reference aspect ratio when it differs; returns true when changed. */
function matchPageToReference(): boolean {
  if (!state.matchSize || !state.refW || !state.refH) return false
  const pageEmpty = widgetStore.dWidgets.length === 0
  if (!pageEmpty && !state.clearFirst) return false
  const refRatio = state.refW / state.refH
  const pageRatio = dPage.value.width / dPage.value.height
  if (Math.abs(refRatio / pageRatio - 1) < 0.03) return false
  const width = refRatio >= 1 ? MATCH_LONG_SIDE : Math.round(MATCH_LONG_SIDE * refRatio)
  const height = refRatio >= 1 ? Math.round(MATCH_LONG_SIDE / refRatio) : MATCH_LONG_SIDE
  canvasStore.setDPage(Object.assign(dPage.value, { width, height }))
  return true
}

async function analyze() {
  state.loading = true
  try {
    // [TINIX] an empty page would be sent as a blank "customer photo" and confuse the AI: only capture a page that has layers
    const photo = state.usePage && widgetStore.dWidgets.length > 0 ? await capturePage({ maxEdge: 768, hideText: true }) : undefined
    const res: any = await tinixAi.rebuild({ reference: state.reference, photo, lang: state.lang })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Phân tích không thành công')
    state.result = res
    for (const r of res.regions) if (r.fontClass) ensureFont(r.fontClass.value, r.fontClass.url)
  } catch (e: any) {
    ElMessage.error(e?.message || 'Lỗi khi gọi AI')
  } finally {
    state.loading = false
  }
}

async function build() {
  if (!state.result) return
  state.building = true
  try {
    if (state.clearFirst) widgetStore.setDWidgets([])
    if (matchPageToReference()) await nextTick()
    if (state.useBackground) canvasStore.setDPage(Object.assign(dPage.value, { backgroundColor: state.result.background }))
    const widgets = await buildRebuildWidgets(state.result.regions, { width: dPage.value.width, height: dPage.value.height })
    widgets.forEach((w) => widgetStore.addWidget(w))
    ElMessage.success(`Đã dựng ${widgets.length} lớp. Chọn khung ảnh xám → "Thay ảnh" để đưa ảnh của bạn vào.`)
  } finally {
    state.building = false
  }
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
