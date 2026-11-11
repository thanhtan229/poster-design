<!-- [TINIX] Trợ lý AI → Sửa chữ: viết lại nội dung các lớp chữ của mẫu cho hợp ảnh, giữ bố cục. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <span class="tx-label">Ngôn ngữ</span>
      <el-radio-group v-model="state.lang" size="small">
        <el-radio-button value="keep">Giữ như mẫu</el-radio-button>
        <el-radio-button value="vi">Tiếng Việt</el-radio-button>
        <el-radio-button value="en">English</el-radio-button>
      </el-radio-group>
      <el-button type="primary" size="small" :loading="state.loading" :disabled="!textLayers.length" @click="rewrite">{{ state.loading ? 'AI đang viết…' : '✨ Gợi ý nội dung mới' }}</el-button>
    </div>
    <p class="tx-hint">Mở một mẫu có sẵn, thay ảnh của bạn vào, rồi bấm gợi ý. AI giữ nguyên số dòng, độ dài, font và vị trí — chỉ đổi nội dung chữ. Trang hiện có <b>{{ textLayers.length }}</b> lớp chữ.</p>

    <div v-if="state.result" class="tx-result">
      <div v-for="(opt, i) in state.result.options" :key="i" class="tx-card">
        <div class="tx-card-head"><b>{{ i + 1 }}. {{ opt.styleName }}</b></div>
        <div v-for="r in opt.replacements" :key="r.uuid" class="tx-part">
          <span class="tx-label" style="min-width: 90px; text-decoration: line-through">{{ short(oldText(r.uuid)) }}</span>
          <span class="tx-part-text" style="font-size: 14px">{{ r.text }}</span>
        </div>
        <div class="tx-row">
          <el-button type="primary" size="small" @click="apply(i)">Áp dụng</el-button>
        </div>
        <details v-if="opt.translationVi" class="tx-trans"><summary>Nghĩa tiếng Việt</summary>{{ opt.translationVi }}</details>
      </div>
      <p class="tx-meta">Model: {{ state.result.model }} · lần gọi #{{ state.result.jobId }} · Hoàn tác: Ctrl+Z</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, computed } from 'vue'
import { ElMessage, ElRadioGroup, ElRadioButton } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useWidgetStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import type { TRewriteResult } from '@/api/tinix-ai'
import { capturePage } from '@/utils/tinix/capture'
import { ensureFont, measureLines } from '@/utils/tinix/psd-fit'

const widgetStore = useWidgetStore()
const { dWidgets } = storeToRefs(widgetStore)
const textLayers = computed(() => (dWidgets.value as any[]).filter((w) => w.type === 'w-text' && String(w.text || '').trim()))

const state = reactive({ lang: 'keep', loading: false, result: null as TRewriteResult | null })

const plain = (html: string) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
const oldText = (uuid: string) => plain((dWidgets.value as any[]).find((w) => w.uuid === uuid)?.text || '')
const short = (s: string) => (s.length > 40 ? s.slice(0, 38) + '…' : s)

async function rewrite() {
  state.loading = true
  try {
    const image = await capturePage()
    const layers = textLayers.value.map((w: any) => ({ uuid: w.uuid, text: plain(w.text) }))
    const res = await tinixAi.rewriteText({ image, layers, lang: state.lang })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Gợi ý không thành công')
    state.result = res as TRewriteResult
  } catch (e: any) {
    ElMessage.error(e?.message || 'Lỗi khi gọi AI')
  } finally {
    state.loading = false
  }
}

/** Replace the text; if the new text is wider than the box (single-line layers), shrink the font a little. */
async function apply(i: number) {
  const opt = state.result?.options[i]
  if (!opt) return
  let changed = 0
  for (const r of opt.replacements) {
    const w: any = (dWidgets.value as any[]).find((x) => x.uuid === r.uuid)
    if (!w) continue
    const family = w.fontClass?.value || w.fontFamily
    if (w.fontClass?.url) await ensureFont(family, w.fontClass.url)
    const font = { family, size: w.fontSize, weight: String(w.fontWeight || 400), style: w.fontStyle || 'normal', letterSpacing: w.letterSpacing || 0 }
    const before = measureLines(plain(w.text), font)
    const after = measureLines(r.text, font)
    widgetStore.updateWidgetData({ uuid: r.uuid, key: 'text', value: r.text })
    // keep the original line breaks / box: only shrink when the new text clearly overflows
    if (after > Math.max(before, w.width) * 1.02 && after > 0) {
      const size = Math.max(w.fontSize * 0.6, Math.floor(((w.fontSize * Math.max(before, w.width)) / after) * 10) / 10)
      widgetStore.updateWidgetData({ uuid: r.uuid, key: 'fontSize', value: size })
    }
    changed++
  }
  ElMessage.success(`Đã thay nội dung ${changed} lớp chữ`)
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
