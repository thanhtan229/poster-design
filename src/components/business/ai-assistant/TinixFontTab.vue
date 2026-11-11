<!-- [TINIX] Trợ lý AI → Tìm font: nhận diện font trong ảnh, gợi ý font tương tự có trong kho. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <el-button size="small" @click="pick">Chọn ảnh có chữ…</el-button>
      <el-button size="small" :loading="state.loading && state.source === 'page'" @click="fromPage">Dùng ảnh trang hiện tại</el-button>
      <input ref="fileRef" type="file" accept="image/*" style="display: none" @change="onFile" />
    </div>
    <p class="tx-hint">Gửi một ảnh có chữ đẹp (chụp màn hình Pinterest, mẫu thiệp…). AI mô tả từng kiểu chữ rồi tìm font gần giống trong kho. Bấm "Dùng font này" để áp vào lớp chữ đang chọn.</p>
    <img v-if="state.preview" :src="state.preview" style="max-width: 100%; max-height: 160px; border-radius: 6px" />
    <p v-if="state.loading" class="tx-hint">AI đang nhận diện font…</p>

    <div v-if="state.result" class="tx-result">
      <div v-for="(it, i) in state.result.items" :key="i" class="tx-card">
        <div class="tx-card-head"><b>“{{ it.text || '(không đọc được chữ)' }}”</b> <span class="tx-label">· {{ it.category }}</span></div>
        <div class="tx-label">{{ it.traits.join(' · ') }}</div>
        <div v-if="it.suspected.length" class="tx-label">AI đoán: {{ it.suspected.join(', ') }}</div>
        <div class="tx-cands">
          <div v-for="c in it.candidates" :key="c.value" class="tx-cand">
            <span class="tx-cand-sample" :style="{ fontFamily: `'${c.value}'` }">{{ sample(it.text) }}</span>
            <span class="tx-label" style="min-width: 120px">{{ c.alias }}</span>
            <el-button size="small" type="primary" plain @click="useFont(c)">Dùng font này</el-button>
          </div>
          <p v-if="!it.candidates.length" class="tx-hint">Không có font gần giống trong kho.</p>
        </div>
        <p v-if="it.notInLibrary.length" class="tx-hint">Chưa có trong kho (tự tìm & thêm nếu có giấy phép): {{ it.notInLibrary.join(', ') }}</p>
      </div>
      <p class="tx-meta">Model: {{ state.result.model }} · lần gọi #{{ state.result.jobId }}</p>
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

const widgetStore = useWidgetStore()
const { dActiveElement } = storeToRefs(widgetStore)
const fileRef = ref<HTMLInputElement>()
const state = reactive({ loading: false, source: '', preview: '', result: null as TFindFontResult | null })

const sample = (t: string) => (t && t.length <= 30 ? t : 'Hạnh phúc trọn đời')

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
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Không tìm được font')
    state.result = res as TFindFontResult
    for (const it of state.result.items) for (const c of it.candidates) ensureFont(c.value, c.url)
  } catch (e: any) {
    ElMessage.error(e?.message || 'Lỗi khi gọi AI')
  } finally {
    state.loading = false
  }
}

function useFont(c: TFontCandidate) {
  const el: any = dActiveElement.value
  if (!el || el.type !== 'w-text') return ElMessage.warning('Hãy chọn một lớp chữ trên trang trước (đóng hộp thoại, bấm vào chữ, rồi mở lại)')
  widgetStore.updateWidgetData({ uuid: el.uuid, key: 'fontClass', value: { id: c.id, alias: c.alias, value: c.value, url: c.url } })
  ElMessage.success(`Đã đổi font thành ${c.alias}`)
}
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
