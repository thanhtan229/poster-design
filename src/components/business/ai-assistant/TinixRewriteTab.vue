<!-- [TINIX] Trợ lý AI → Sửa chữ: viết lại nội dung các lớp chữ của mẫu cho hợp ảnh, giữ bố cục. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <span class="tx-label">{{ $t('tinix.ui.rewriteTab.ngon_ngu') }}</span>
      <el-radio-group v-model="state.lang" size="small">
        <el-radio-button value="keep">{{ $t('tinix.ui.rewriteTab.giu_nhu_mau') }}</el-radio-button>
        <el-radio-button value="vi">{{ $t('tinix.ui.rewriteTab.tieng_viet') }}</el-radio-button>
        <el-radio-button value="en">English</el-radio-button>
      </el-radio-group>
      <el-button type="primary" size="small" :loading="state.loading" :disabled="!textLayers.length" @click="rewrite">{{ state.loading ? $t('tinix.ui.rewriteTab.ai_dang_viet') : $t('tinix.ui.rewriteTab.goi_y_noi_dung_moi') }}</el-button>
    </div>
    <p class="tx-hint" v-html="$t('tinix.ui.rewriteTab.hint', { n: textLayers.length })"></p>

    <div v-if="state.result" class="tx-result">
      <div v-for="(opt, i) in state.result.options" :key="i" class="tx-card">
        <div class="tx-card-head"><b>{{ i + 1 }}. {{ opt.styleName }}</b></div>
        <div v-for="r in opt.replacements" :key="r.uuid" class="tx-part">
          <span class="tx-label" style="min-width: 90px; text-decoration: line-through">{{ short(oldText(r.uuid)) }}</span>
          <span class="tx-part-text" style="font-size: 14px">{{ r.text }}</span>
        </div>
        <div class="tx-row">
          <el-button type="primary" size="small" @click="apply(i)">{{ $t('tinix.ui.rewriteTab.ap_dung') }}</el-button>
        </div>
        <details v-if="opt.translationVi" class="tx-trans"><summary>{{ $t('tinix.ui.rewriteTab.nghia_tieng_viet') }}</summary>{{ opt.translationVi }}</details>
      </div>
      <p class="tx-meta">{{ $t('tinix.ui.rewriteTab.meta', { model: state.result.model, job: state.result.jobId }) }}</p>
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
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

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
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.rewriteTab.goi_y_khong_thanh_cong'))
    state.result = res as TRewriteResult
  } catch (e: any) {
    ElMessage.error(e?.message || i18t('tinix.ui.rewriteTab.loi_khi_goi_ai'))
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
  ElMessage.success(i18t('tinix.ui.rewriteTab.replaced', { n: changed }))
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
