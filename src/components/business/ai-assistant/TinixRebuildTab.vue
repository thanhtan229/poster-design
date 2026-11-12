<!-- [TINIX] Trợ lý AI → Dựng theo mẫu: học bố cục/phong cách của ảnh mẫu, dựng thành các lớp chỉnh được với nội dung mới. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <el-button size="small" @click="pick">{{ $t('tinix.ui.rebuildTab.chon_anh_thiet_ke_mau') }}</el-button>
      <input ref="fileRef" type="file" accept="image/*" style="display: none" @change="onFile" />
      <el-radio-group v-model="state.mode" size="small">
        <el-radio-button value="faithful">{{ $t('tinix.ui.rebuildTab.giong_mau') }}</el-radio-button>
        <el-radio-button value="creative">{{ $t('tinix.ui.rebuildTab.viet_noi_dung_moi') }}</el-radio-button>
      </el-radio-group>
      <template v-if="state.mode === 'creative'">
        <el-checkbox v-model="state.usePage" size="small">{{ $t('tinix.ui.rebuildTab.viet_chu_hop_voi_anh') }}</el-checkbox>
        <el-radio-group v-model="state.lang" size="small">
          <el-radio-button value="vi">{{ $t('tinix.ui.rebuildTab.tieng_viet') }}</el-radio-button>
          <el-radio-button value="en">English</el-radio-button>
        </el-radio-group>
      </template>
    </div>
    <p v-if="state.mode === 'faithful'" class="tx-hint" v-html="$t('tinix.ui.rebuildTab.hintFaithful')"></p>
    <p v-else class="tx-hint" v-html="$t('tinix.ui.rebuildTab.hintCreative')"></p>
    <div v-if="state.mode === 'faithful'" class="tx-row">
      <el-checkbox v-model="state.genPhoto" size="small">{{ $t('tinix.ui.rebuildTab.tu_tao_anh_nen_tuong') }}</el-checkbox>
    </div>
    <div class="tx-row" v-if="state.reference">
      <img :src="state.reference" style="max-height: 150px; max-width: 45%; border-radius: 6px" />
      <el-button type="primary" size="small" :loading="state.loading" @click="analyze">{{ state.loading ? $t('tinix.ui.rebuildTab.ai_dang_phan_tich_30') : $t('tinix.ui.rebuildTab.phan_tich_mau') }}</el-button>
    </div>

    <div v-if="state.result" class="tx-result">
      <div class="tx-card">
        <div class="tx-card-head"><b>{{ $t('tinix.ui.rebuildTab.ket_qua') }}</b> <span class="tx-swatch" :style="{ background: state.result.background }" /> <span class="tx-label">{{ counts }}</span></div>
        <div v-for="(r, i) in textRegions" :key="i" class="tx-part">
          <span class="tx-label" style="min-width: 70px">{{ r.role }}</span>
          <span class="tx-part-text" :style="{ fontFamily: `'${r.fontFamily}'`, fontWeight: String(r.weight), fontStyle: r.italic ? 'italic' : 'normal', fontSize: '15px' }">{{ r.uppercase ? r.text.toUpperCase() : r.text }}</span>
          <span class="tx-label">{{ r.fontFamily }}</span>
        </div>
        <p v-if="state.result.notes" class="tx-hint">ℹ {{ state.result.notes }}</p>

        <!-- [TINIX] ảnh nền tương tự: tạo ở nền ngay sau khi phân tích, xem trước, sửa mô tả rồi tạo lại -->
        <template v-if="state.mode === 'faithful' && state.genPhoto">
          <div class="tx-row" style="align-items: flex-start">
            <img v-if="state.photoUrl" :src="state.photoUrl" style="max-height: 120px; max-width: 30%; border-radius: 6px" />
            <div style="flex: 1; min-width: 200px">
              <el-input v-model="state.result.photoPrompt" type="textarea" :rows="3" size="small" :placeholder="$t('tinix.ui.rebuildTab.mo_ta_anh_nen_de')" />
              <div class="tx-row" style="margin-top: 6px">
                <el-button size="small" :loading="state.photoLoading" :disabled="!hasPhotoPrompt" @click="startPhoto">{{ state.photoLoading ? $t('tinix.ui.rebuildTab.dang_tao_anh_nen') : state.photoUrl ? $t('tinix.ui.rebuildTab.tao_lai_anh') : $t('tinix.ui.rebuildTab.tao_anh_nen') }}</el-button>
                <span v-if="state.photoError" class="tx-label" style="color: #c0392b">{{ state.photoError }}</span>
                <span v-else-if="state.photoUrl && !state.photoLoading" class="tx-label">{{ $t('tinix.ui.rebuildTab.anh_nen_da_san_sang') }}</span>
              </div>
            </div>
          </div>
        </template>

        <div class="tx-row">
          <el-checkbox v-model="state.matchSize" size="small">{{ $t('tinix.ui.rebuildTab.dat_kho_trang_theo_ti') }}</el-checkbox>
          <el-checkbox v-model="state.useBackground" size="small">{{ $t('tinix.ui.rebuildTab.dung_mau_nen_cua_mau') }}</el-checkbox>
          <el-checkbox v-model="state.clearFirst" size="small">{{ $t('tinix.ui.rebuildTab.xoa_cac_lop_hien_co') }}</el-checkbox>
        </div>
        <div class="tx-row">
          <el-button type="primary" size="small" :loading="state.building" @click="build">{{ state.building && state.photoLoading ? $t('tinix.ui.rebuildTab.dang_cho_anh_nen') : $t('tinix.ui.rebuildTab.dung_vao_trang') }}</el-button>
        </div>
      </div>
      <p class="tx-meta">{{ $t('tinix.ui.rebuildTab.meta', { model: state.result.model, job: state.result.jobId }) }}</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, computed, nextTick, watch } from 'vue'
import { ElMessage, ElCheckbox, ElRadioGroup, ElRadioButton } from 'element-plus'
import { storeToRefs } from 'pinia'
import api from '@/api'
import { useWidgetStore, useCanvasStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import { capturePage, fileToDataUrl } from '@/utils/tinix/capture'
import { buildRebuildWidgets } from '@/utils/tinix/rebuild'
import { ensureFont } from '@/utils/tinix/psd-fit'
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

const GEN_PHOTO_KEY = 'tinix_rebuild_gen_photo' // nhớ lựa chọn "tự tạo ảnh nền"

const widgetStore = useWidgetStore()
const canvasStore = useCanvasStore()
const { dPage } = storeToRefs(canvasStore)
const fileRef = ref<HTMLInputElement>()
const state = reactive({
  lang: 'vi',
  usePage: true,
  reference: '',
  loading: false,
  building: false,
  mode: 'faithful' as 'faithful' | 'creative',
  useBackground: false,
  clearFirst: false,
  matchSize: true,
  genPhoto: localStorage.getItem(GEN_PHOTO_KEY) === '1',
  refW: 0,
  refH: 0,
  result: null as any,
  // ảnh nền tương tự
  photoUrl: '',
  photoLoading: false,
  photoError: '',
})

/** Lần tạo ảnh đang chạy (Dựng vào trang chờ nó) và số thứ tự để bỏ kết quả cũ khi phân tích lại / tạo lại. */
let photoJob: Promise<void> | null = null
let photoSeq = 0

const textRegions = computed(() => (state.result?.regions || []).filter((r: any) => r.type === 'text'))
const counts = computed(() => {
  const rs = state.result?.regions || []
  const n = (t: string) => rs.filter((r: any) => r.type === t).length
  return i18t('tinix.ui.rebuildTab.counts', { text: n('text'), photo: n('photo'), shape: n('shape'), svg: n('svg') })
})
const hasPhotoPrompt = computed(() => !!String(state.result?.photoPrompt || '').trim())

watch(
  () => state.genPhoto,
  (on) => {
    localStorage.setItem(GEN_PHOTO_KEY, on ? '1' : '0')
    // bật sau khi đã phân tích: tạo luôn ở nền
    if (on && state.mode === 'faithful' && state.result && !state.photoUrl && !state.photoLoading) startPhoto()
  },
)

function resetPhoto() {
  photoSeq++ // kết quả của lần tạo cũ (nếu còn chạy) sẽ bị bỏ
  photoJob = null
  state.photoUrl = ''
  state.photoLoading = false
  state.photoError = ''
}

function pick() {
  fileRef.value?.click()
}
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  state.reference = await fileToDataUrl(file)
  state.result = null
  resetPhoto()
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

/** Page size the build will use: the reference aspect ratio when the page will be reshaped, else the current page. */
function targetPageSize(): { width: number; height: number; reshape: boolean } {
  const cur = { width: dPage.value.width, height: dPage.value.height, reshape: false }
  if (!state.matchSize || !state.refW || !state.refH) return cur
  const pageEmpty = widgetStore.dWidgets.length === 0
  if (!pageEmpty && !state.clearFirst) return cur
  const refRatio = state.refW / state.refH
  if (Math.abs(refRatio / (cur.width / cur.height) - 1) < 0.03) return cur
  return {
    width: refRatio >= 1 ? MATCH_LONG_SIDE : Math.round(MATCH_LONG_SIDE * refRatio),
    height: refRatio >= 1 ? Math.round(MATCH_LONG_SIDE / refRatio) : MATCH_LONG_SIDE,
    reshape: true,
  }
}

/** Reshape the page to the reference aspect ratio when it differs; returns true when changed. */
function matchPageToReference(): boolean {
  const t = targetPageSize()
  if (!t.reshape) return false
  canvasStore.setDPage(Object.assign(dPage.value, { width: t.width, height: t.height }))
  return true
}

/** Lời nhắc tạo ảnh: mô tả của AI + chừa khoảng trống ở vùng có chữ + không chữ/không hình dán. */
function photoPromptText(): string {
  const prompt = String(state.result?.photoPrompt || '').trim()
  const tx = (state.result?.regions || []).filter((r: any) => r.type === 'text')
  let space = ''
  if (tx.length) {
    const y0 = Math.min(...tx.map((r: any) => r.bbox.y))
    const y1 = Math.max(...tx.map((r: any) => r.bbox.y + r.bbox.h))
    // tông nền vùng chữ tương phản với màu chữ: chữ sáng → nền tối hơn, chữ tối → nền sáng
    const lum = (hex: string) => {
      const h = String(hex || '#222222').replace('#', '')
      const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
    const avg = tx.reduce((s: number, r: any) => s + lum(r.color), 0) / tx.length
    const tone = avg > 0.6 ? 'with fairly dark, moody tones there so light text stays readable' : avg < 0.4 ? 'with light, bright tones there so dark text stays readable' : ''
    const area = y1 < 0.5 ? `top ${Math.min(60, Math.round(y1 * 100) + 8)}%` : y0 > 0.5 ? `bottom ${Math.min(60, Math.round((1 - y0) * 100) + 8)}%` : ''
    if (area) space = ` Keep the ${area} of the frame calm and uncluttered (soft plain background, no subjects, no objects)${tone ? ' ' + tone : ''} to leave room for overlay text.`
  }
  return `${prompt}${space} Photorealistic photograph. No text, no letters, no watermark, no logo, no stickers, no graphic overlays.`
}

/** Vùng ảnh lớn nhất (ảnh nền sẽ đặt vào đây). */
function biggestPhoto(): any {
  return [...(state.result?.regions || [])].filter((r: any) => r.type === 'photo').sort((a: any, b: any) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h)[0]
}

/** [TINIX] Tạo ảnh nền tương tự ở nền (không chặn giao diện). Gọi lại = tạo lại, bỏ kết quả lần trước. */
function startPhoto(): Promise<void> {
  const big = biggestPhoto()
  if (!state.result || !big || !hasPhotoPrompt.value) {
    state.photoError = !big ? i18t('tinix.ui.rebuildTab.mau_khong_co_vung_anh') : ''
    return Promise.resolve()
  }
  const seq = ++photoSeq
  const page = targetPageSize()
  const ratio = `${Math.max(1, Math.round(big.bbox.w * page.width))}:${Math.max(1, Math.round(big.bbox.h * page.height))}`
  state.photoLoading = true
  state.photoError = ''
  const job = (async () => {
    try {
      const res: any = await api.ai.imageGenerate({ prompt: photoPromptText(), ratio }, { _noLoading: true, timeout: 180000 })
      if (seq !== photoSeq) return // đã phân tích lại / tạo lại: bỏ kết quả cũ
      if (res?.url) state.photoUrl = res.url
      else state.photoError = res?.msg || i18t('tinix.ui.rebuildTab.khong_tao_duoc_anh_nen')
    } catch (e: any) {
      if (seq === photoSeq) state.photoError = e?.message || i18t('tinix.ui.rebuildTab.khong_tao_duoc_anh_nen')
    } finally {
      if (seq === photoSeq) state.photoLoading = false
    }
  })()
  photoJob = job
  return job
}

async function analyze() {
  state.loading = true
  resetPhoto()
  try {
    // [TINIX] an empty page would be sent as a blank "customer photo" and confuse the AI: only capture a page that has layers
    const photo = state.mode === 'creative' && state.usePage && widgetStore.dWidgets.length > 0 ? await capturePage({ maxEdge: 768, hideText: true }) : undefined
    const res: any = await tinixAi.rebuild({ reference: state.reference, photo, lang: state.lang, mode: state.mode })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.rebuildTab.phan_tich_khong_thanh_cong'))
    state.result = res
    for (const r of res.regions) if (r.fontClass) ensureFont(r.fontClass.value, r.fontClass.url)
    // [TINIX] tự tạo ảnh nền ngay (chạy ở nền trong lúc bạn xem kết quả)
    if (state.mode === 'faithful' && state.genPhoto) startPhoto()
  } catch (e: any) {
    ElMessage.error(e?.message || i18t('tinix.ui.rebuildTab.loi_khi_goi_ai'))
  } finally {
    state.loading = false
  }
}

async function build() {
  if (!state.result) return
  state.building = true
  try {
    // [TINIX] ảnh nền tương tự: dùng ảnh đã tạo sẵn, hoặc chờ lần tạo đang chạy, hoặc tạo ngay nếu chưa có
    let photoUrl = ''
    if (state.mode === 'faithful' && state.genPhoto) {
      if (state.photoLoading && photoJob) await photoJob
      else if (!state.photoUrl && hasPhotoPrompt.value) await startPhoto()
      photoUrl = state.photoUrl
      if (!photoUrl && state.photoError) ElMessage.warning(i18t('tinix.ui.rebuildTab.photoFallback', { err: state.photoError }))
    }
    if (state.clearFirst) widgetStore.setDWidgets([])
    if (matchPageToReference()) await nextTick()
    if (state.useBackground) canvasStore.setDPage(Object.assign(dPage.value, { backgroundColor: state.result.background }))
    const widgets = await buildRebuildWidgets(state.result.regions, { width: dPage.value.width, height: dPage.value.height }, { photoUrl })
    widgets.forEach((w) => widgetStore.addWidget(w))
    ElMessage.success(i18t(photoUrl ? 'tinix.ui.rebuildTab.builtWithPhoto' : 'tinix.ui.rebuildTab.built', { n: widgets.length }))
  } finally {
    state.building = false
  }
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
