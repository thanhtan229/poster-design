<!-- [TINIX] Trợ lý AI → Gợi ý chữ: AI xem ảnh trang, đề xuất 3 phương án chữ, đặt vào vùng trống. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <span class="tx-label">Ngôn ngữ chữ</span>
      <el-radio-group v-model="state.lang" size="small">
        <el-radio-button value="vi">Tiếng Việt</el-radio-button>
        <el-radio-button value="en">English</el-radio-button>
      </el-radio-group>
      <el-button type="primary" size="small" :loading="state.loading" @click="suggest">{{ state.loading ? 'AI đang xem ảnh…' : '✨ Gợi ý' }}</el-button>
    </div>
    <p class="tx-hint">Thả ảnh vào trang trước (nên phủ kín trang). AI xem ảnh, tìm khoảng trống rồi đề xuất chữ, font và màu. Chữ đang có trên trang được ẩn khi gửi ảnh.</p>

    <div v-if="state.result" class="tx-result">
      <p v-if="state.result.scene" class="tx-scene">🖼 {{ state.result.scene }}</p>
      <div v-for="(opt, i) in state.result.options" :key="i" class="tx-card">
        <div class="tx-card-head">
          <b>{{ i + 1 }}. {{ opt.styleName }}</b>
          <span class="tx-swatch" :style="{ background: opt.palette.primary }" /><span class="tx-swatch" :style="{ background: opt.palette.secondary }" />
        </div>
        <div v-for="key in PART_ORDER" :key="key">
          <div v-if="opt.parts[key]" class="tx-part">
            <el-checkbox v-model="state.picks[i][key]" size="small">{{ PART_LABEL[key] }}</el-checkbox>
            <span class="tx-part-text" :style="partStyle(opt, key)">{{ partText(opt, key) }}</span>
            <el-select v-model="state.fontPick[i][key]" size="small" filterable class="tx-font" placeholder="Font" @change="(v: string) => changeFont(i, key, v)">
              <el-option v-for="f in fonts" :key="f.value" :label="f.alias" :value="f.value" />
            </el-select>
          </div>
        </div>
        <div class="tx-row">
          <el-radio-group v-model="state.align[i]" size="small">
            <el-radio-button value="left">Trái</el-radio-button>
            <el-radio-button value="center">Giữa</el-radio-button>
            <el-radio-button value="right">Phải</el-radio-button>
          </el-radio-group>
          <el-select v-model="state.region[i]" size="small" style="width: 150px">
            <el-option v-for="(r, ri) in state.result.emptyRegions" :key="ri" :label="regionLabel(r, ri)" :value="ri" />
          </el-select>
          <el-button type="primary" size="small" :loading="state.adding === i" @click="add(i)">Thêm vào trang</el-button>
        </div>
        <details v-if="opt.translationVi" class="tx-trans"><summary>Nghĩa tiếng Việt</summary>{{ opt.translationVi }}</details>
      </div>
      <p class="tx-meta">Model: {{ state.result.model }} · lần gọi #{{ state.result.jobId }}</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElRadioGroup, ElRadioButton, ElCheckbox, ElSelect, ElOption } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useWidgetStore, useCanvasStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import type { TSuggestResult, TSuggestOption, TRegion } from '@/api/tinix-ai'
import { capturePage } from '@/utils/tinix/capture'
import { buildTextWidgets, PART_ORDER, PART_LABEL, TPartKey } from '@/utils/tinix/place-text'
import { loadLibraryFonts, LibraryFont } from '@/utils/tinix/psd-font-map'
import { ensureFont } from '@/utils/tinix/psd-fit'

const widgetStore = useWidgetStore()
const { dPage } = storeToRefs(useCanvasStore())
const fonts = ref<LibraryFont[]>([])

const state = reactive({
  lang: 'vi',
  loading: false,
  adding: -1,
  result: null as TSuggestResult | null,
  picks: [] as Record<string, boolean>[],
  fontPick: [] as Record<string, string>[],
  align: [] as string[],
  region: [] as number[],
})

onMounted(async () => {
  fonts.value = await loadLibraryFonts()
})

async function suggest() {
  state.loading = true
  try {
    const image = await capturePage({ hideText: true })
    const res = await tinixAi.suggestText({ image, width: dPage.value.width, height: dPage.value.height, lang: state.lang })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Gợi ý không thành công')
    const r = res as TSuggestResult
    state.result = r
    state.picks = r.options.map((o) => Object.fromEntries(PART_ORDER.filter((k) => o.parts[k]).map((k) => [k, true])))
    state.fontPick = r.options.map((o) => Object.fromEntries(PART_ORDER.filter((k) => o.parts[k]).map((k) => [k, o.parts[k]!.fontClass?.value || o.parts[k]!.fontFamily])))
    state.align = r.options.map((o) => o.align)
    state.region = r.options.map((o) => o.regionIndex)
    // preview fonts in the cards
    for (const o of r.options) for (const k of PART_ORDER) { const fc = o.parts[k]?.fontClass; if (fc) ensureFont(fc.value, fc.url) }
  } catch (e: any) {
    ElMessage.error(e?.message || 'Lỗi khi gọi AI')
  } finally {
    state.loading = false
  }
}

function partText(opt: TSuggestOption, key: TPartKey) {
  const p = opt.parts[key]!
  return p.uppercase ? p.text.toUpperCase() : p.text
}
function partStyle(opt: TSuggestOption, key: TPartKey) {
  const p = opt.parts[key]!
  return { fontFamily: `'${p.fontClass?.value || p.fontFamily}'`, fontWeight: String(p.weight || 400), fontStyle: p.italic ? 'italic' : 'normal' }
}
function regionLabel(r: TRegion, i: number) {
  const v = r.y < 0.33 ? 'trên' : r.y > 0.6 ? 'dưới' : 'giữa'
  const h = r.x + r.w / 2 < 0.4 ? 'trái' : r.x + r.w / 2 > 0.6 ? 'phải' : 'giữa'
  return `Vùng ${i + 1}: ${v} – ${h}${r.tone === 'light' ? ' (nền sáng)' : ' (nền tối)'}`
}

function changeFont(i: number, key: TPartKey, value: string) {
  const f = fonts.value.find((x) => x.value === value)
  const part = state.result?.options[i].parts[key]
  if (!f || !part) return
  part.fontClass = { id: f.id, alias: f.alias, value: f.value, url: f.url }
  part.fontFamily = f.value
  ensureFont(f.value, f.url)
}

async function add(i: number) {
  if (!state.result) return
  state.adding = i
  try {
    const option = state.result.options[i]
    const parts = PART_ORDER.filter((k) => state.picks[i][k])
    if (!parts.length) return ElMessage.warning('Chọn ít nhất một dòng chữ')
    const region = state.result.emptyRegions[state.region[i]] || state.result.emptyRegions[0]
    const widgets = await buildTextWidgets({ option, region, parts, align: state.align[i] as any, page: { width: dPage.value.width, height: dPage.value.height } })
    widgets.forEach((w) => widgetStore.addWidget(w))
    ElMessage.success(`Đã thêm ${widgets.length} lớp chữ — kéo, đổi cỡ, đổi màu thoải mái`)
  } finally {
    state.adding = -1
  }
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
