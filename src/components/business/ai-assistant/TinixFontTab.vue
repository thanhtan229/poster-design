<!-- [TINIX] Trợ lý AI → Tìm font: nhận diện font trong ảnh, gợi ý font tương tự có trong kho. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <el-button size="small" @click="pick">{{ $t('tinix.ui.fontTab.chon_anh_co_chu') }}</el-button>
      <el-button size="small" :loading="state.loading && state.source === 'page'" @click="fromPage">{{ $t('tinix.ui.fontTab.dung_anh_trang_hien_tai') }}</el-button>
      <input ref="fileRef" type="file" accept="image/*" style="display: none" @change="onFile" />
    </div>
    <p class="tx-hint">{{ $t('tinix.ui.fontTab.gui_mot_anh_co_chu') }}</p>
    <img v-if="state.preview" :src="state.preview" style="max-width: 100%; max-height: 160px; border-radius: 6px" />
    <p v-if="state.loading" class="tx-hint">{{ $t('tinix.ui.fontTab.ai_dang_nhan_dien_font') }}</p>

    <div v-if="state.result" class="tx-result">
      <div v-for="(it, i) in state.result.items" :key="i" class="tx-card">
        <div class="tx-card-head"><b>“{{ it.text || $t('tinix.ui.fontTab.khong_doc_duoc_chu') }}”</b> <span class="tx-label">· {{ it.category }}</span></div>
        <div class="tx-label">{{ it.traits.join(' · ') }}</div>
        <div v-if="it.suspected.length" class="tx-label">{{ $t('tinix.ui.fontTab.suspected', { names: it.suspected.join(', ') }) }}</div>
        <div class="tx-cands">
          <div v-for="c in it.candidates" :key="c.value" class="tx-cand">
            <span class="tx-cand-sample" :style="{ fontFamily: `'${c.value}'` }">{{ sample(it.text) }}</span>
            <span class="tx-label" style="min-width: 120px">{{ c.alias }}</span>
            <el-button size="small" type="primary" plain @click="useFont(c)">{{ $t('tinix.ui.fontTab.dung_font_nay') }}</el-button>
          </div>
          <p v-if="!it.candidates.length" class="tx-hint">{{ $t('tinix.ui.fontTab.khong_co_font_gan_giong') }}</p>
        </div>
        <p v-if="it.notInLibrary.length" class="tx-hint">{{ $t('tinix.ui.fontTab.notInLibrary', { names: it.notInLibrary.join(', ') }) }}</p>
      </div>
      <p class="tx-meta">{{ $t('tinix.ui.fontTab.meta', { model: state.result.model, job: state.result.jobId }) }}</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useWidgetStore } from '@/store'
import * as tinixAi from '@/api/tinix-ai'
import type { TFindFontResult, TFontCandidate } from '@/api/tinix-ai'
import { capturePage, fileToDataUrl } from '@/utils/tinix/capture'
import { ensureFont } from '@/utils/tinix/psd-fit'
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

const widgetStore = useWidgetStore()
const { dActiveElement } = storeToRefs(widgetStore)
const fileRef = ref<HTMLInputElement>()
const state = reactive({ loading: false, source: '', preview: '', result: null as TFindFontResult | null })

const sample = (t: string) => (t && t.length <= 30 ? t : i18t('tinix.ui.fontTab.hanh_phuc_tron_doi'))

function pick() {
  fileRef.value?.click()
}
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  state.source = 'file'
  await run(await fileToDataUrl(file))
}
async function fromPage() {
  state.source = 'page'
  await run(await capturePage({ maxEdge: 1280 }))
}

async function run(image: string) {
  state.preview = image
  state.loading = true
  state.result = null
  try {
    const res = await tinixAi.findFont({ image })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.fontTab.khong_tim_duoc_font'))
    state.result = res as TFindFontResult
    for (const it of state.result.items) for (const c of it.candidates) ensureFont(c.value, c.url)
  } catch (e: any) {
    ElMessage.error(e?.message || i18t('tinix.ui.fontTab.loi_khi_goi_ai'))
  } finally {
    state.loading = false
  }
}

function useFont(c: TFontCandidate) {
  const el: any = dActiveElement.value
  if (!el || el.type !== 'w-text') return ElMessage.warning(i18t('tinix.ui.fontTab.hay_chon_mot_lop_chu'))
  widgetStore.updateWidgetData({ uuid: el.uuid, key: 'fontClass', value: { id: c.id, alias: c.alias, value: c.value, url: c.url } })
  ElMessage.success(i18t('tinix.ui.fontTab.changed', { name: c.alias }))
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
