<!-- [TINIX] Trợ lý AI → Dựng theo mẫu: học bố cục/phong cách của ảnh mẫu, dựng thành các lớp chỉnh được với nội dung mới. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <el-button size="small" @click="pick">Chọn ảnh thiết kế mẫu…</el-button>
      <input ref="fileRef" type="file" accept="image/*" style="display: none" @change="onFile" />
      <el-radio-group v-model="state.mode" size="small">
        <el-radio-button value="faithful">Giống mẫu</el-radio-button>
        <el-radio-button value="creative">Viết nội dung mới</el-radio-button>
      </el-radio-group>
      <template v-if="state.mode === 'creative'">
        <el-checkbox v-model="state.usePage" size="small">Viết chữ hợp với ảnh trang hiện tại</el-checkbox>
        <el-radio-group v-model="state.lang" size="small">
          <el-radio-button value="vi">Tiếng Việt</el-radio-button>
          <el-radio-button value="en">English</el-radio-button>
        </el-radio-group>
      </template>
    </div>
    <p v-if="state.mode === 'faithful'" class="tx-hint"><b>Giống mẫu</b>: AI chép <b>đúng chữ, ngôn ngữ, bố cục, cỡ chữ, màu</b>, chọn font <b>gần nhất trong kho</b>, vẽ khung/đường kẻ và nét trang trí, biểu tượng đơn giản bằng SVG. Chữ thư pháp, nét cọ hay hình phức tạp chỉ ở mức xấp xỉ; ảnh chụp là khung xám để bạn thay ảnh. Tất cả chỉnh được.</p>
    <p v-else class="tx-hint"><b>Viết nội dung mới</b>: AI chỉ học <b>bố cục, nhịp chữ, kiểu font, màu</b> của mẫu và viết <b>nội dung mới</b> (tiếng Việt hoặc English) — không chép chữ, logo hay hình minh hoạ.</p>
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
          <el-checkbox v-if="state.mode === 'faithful'" v-model="state.genPhoto" size="small">Tạo ảnh nền tương tự bằng AI (không chữ) — tốn thêm 1 lần tạo ảnh, khoảng 15–30 giây</el-checkbox>
          <el-checkbox v-model="state.matchSize" size="small">Đặt khổ trang theo tỉ lệ ảnh mẫu (chỉ khi trang còn trống hoặc đã chọn xoá lớp)</el-checkbox>
          <el-checkbox v-model="state.useBackground" size="small">Dùng màu nền của mẫu</el-checkbox>
          <el-checkbox v-model="state.clearFirst" size="small">Xoá các lớp hiện có trước khi dựng (giữ ảnh nền)</el-checkbox>
        </div>
        <div class="tx-row" v-if="state.mode === 'faithful' && state.genPhoto">
          <el-input v-model="state.result.photoPrompt" type="textarea" :rows="3" size="small" placeholder="Mô tả ảnh nền để AI tạo ảnh tương tự (tiếng Anh) — có thể sửa trước khi dựng" />
        </div>
        <div class="tx-row">
          <el-button type="primary" size="small" :loading="state.building" @click="build">{{ state.building && state.genPhoto ? 'Đang tạo ảnh nền…' : 'Dựng vào trang' }}</el-button>
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
import api from '@/api'
import { useWidgetStore, useCanvasStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import { capturePage, fileToDataUrl } from '@/utils/tinix/capture'
import { buildRebuildWidgets } from '@/utils/tinix/rebuild'
import { ensureFont } from '@/utils/tinix/psd-fit'

const widgetStore = useWidgetStore()
const canvasStore = useCanvasStore()
const { dPage } = storeToRefs(canvasStore)
const fileRef = ref<HTMLInputElement>()
const state = reactive({ lang: 'vi', usePage: true, reference: '', loading: false, building: false, mode: 'faithful' as 'faithful' | 'creative', useBackground: false, clearFirst: false, matchSize: true, genPhoto: false, refW: 0, refH: 0, result: null as any })

const textRegions = computed(() => (state.result?.regions || []).filter((r: any) => r.type === 'text'))
const counts = computed(() => {
  const rs = state.result?.regions || []
  const n = (t: string) => rs.filter((r: any) => r.type === t).length
  return `${n('text')} khối chữ · ${n('photo')} khung ảnh · ${n('shape')} khối màu · ${n('svg')} nét trang trí`
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
    const photo = state.mode === 'creative' && state.usePage && widgetStore.dWidgets.length > 0 ? await capturePage({ maxEdge: 768, hideText: true }) : undefined
    const res: any = await tinixAi.rebuild({ reference: state.reference, photo, lang: state.lang, mode: state.mode })
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
    // [TINIX] ảnh nền TƯƠNG TỰ (không chữ): AI mô tả ảnh của mẫu → tạo ảnh mới có tỉ lệ đúng bằng vùng ảnh lớn nhất
    let photoUrl = ''
    const prompt = String(state.result.photoPrompt || '').trim()
    if (state.mode === 'faithful' && state.genPhoto && prompt) {
      const big = [...state.result.regions].filter((r: any) => r.type === 'photo').sort((a: any, b: any) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h)[0]
      if (big) {
        const ratio = `${Math.max(1, Math.round(big.bbox.w * dPage.value.width))}:${Math.max(1, Math.round(big.bbox.h * dPage.value.height))}`
        // chừa khoảng trống sạch ở vùng sẽ đặt chữ (đầu/cuối khung) để chữ không đè lên chủ thể
        const tx = state.result.regions.filter((r: any) => r.type === 'text')
        let space = ''
        if (tx.length) {
          const y0 = Math.min(...tx.map((r: any) => r.bbox.y))
          const y1 = Math.max(...tx.map((r: any) => r.bbox.y + r.bbox.h))
          if (y1 < 0.5) space = ` Keep the top ${Math.min(60, Math.round(y1 * 100) + 8)}% of the frame calm and uncluttered (soft plain background, no subjects, no objects) to leave room for overlay text.`
          else if (y0 > 0.5) space = ` Keep the bottom ${Math.min(60, Math.round((1 - y0) * 100) + 8)}% of the frame calm and uncluttered (soft plain background, no subjects, no objects) to leave room for overlay text.`
        }
        try {
          const res: any = await api.ai.imageGenerate({ prompt: `${prompt}${space} Photorealistic photograph. No text, no letters, no watermark, no logo, no stickers, no graphic overlays.`, ratio }, { _noLoading: true, timeout: 180000 })
          if (res?.url) photoUrl = res.url
          else ElMessage.warning(res?.msg || 'Không tạo được ảnh nền, dùng khung ảnh giữ chỗ.')
        } catch (e: any) {
          ElMessage.warning(e?.message || 'Không tạo được ảnh nền, dùng khung ảnh giữ chỗ.')
        }
      }
    }
    const widgets = await buildRebuildWidgets(state.result.regions, { width: dPage.value.width, height: dPage.value.height }, { photoUrl })
    widgets.forEach((w) => widgetStore.addWidget(w))
    ElMessage.success(photoUrl ? `Đã dựng ${widgets.length} lớp, kèm ảnh nền tương tự. Chọn ảnh nền → "Thay ảnh" để đưa ảnh của bạn vào.` : `Đã dựng ${widgets.length} lớp. Chọn khung ảnh xám → "Thay ảnh" để đưa ảnh của bạn vào.`)
  } finally {
    state.building = false
  }
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
