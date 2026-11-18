<template>
<section data-photo-history class="sticker-border">
 <strong>{{ $t('tinix.ui.stickerBorder.title') }}</strong>
 <p class="hint">{{ $t('tinix.ui.stickerBorder.hint') }}</p>
 <label class="row"><span>{{ $t('tinix.ui.stickerBorder.mm') }} <small>{{ mm }} mm</small></span>
  <input v-model.number="mm" type="range" min="0" max="8" step="0.5" :disabled="busy" :aria-label="$t('tinix.ui.stickerBorder.mm')" @change="apply">
 </label>
 <p v-if="busy" class="hint" role="status">{{ $t('tinix.ui.stickerBorder.busy') }}</p>
 <p v-if="error" class="err" role="alert">{{ error }}</p>
</section>
</template>
<script setup lang="ts">
// [TINIX] Thanh "Viền trắng hình dán (mm)" trong bảng thuộc tính ảnh. Viền là điểm ảnh thật (xem utils/tinix/sticker-apply.ts).
import { ref, watch } from 'vue'
import { useCanvasStore, useWidgetStore, useHistoryStore } from '@/store'
import { applyStickerBorder } from '@/utils/tinix/sticker-apply'

const props = defineProps<{ image: any }>()
const ws = useWidgetStore()
const cs = useCanvasStore()
const mm = ref<number>(0)
const busy = ref(false)
const error = ref('')
watch(() => props.image?.stickerBorder?.mm, (v) => { mm.value = v || 0 }, { immediate: true })

async function apply() {
  if (busy.value) return
  const image = props.image
  const page = cs.dCurrentPage
  const before = JSON.stringify(ws.dWidgets)
  busy.value = true
  error.value = ''
  try {
    await applyStickerBorder(image, mm.value, Number(cs.dPage.dpi) || 300)
    if (page !== cs.dCurrentPage) return
    ws.updateDWidgets()
    const after = JSON.stringify(ws.dWidgets)
    if (before !== after) {
      useHistoryStore().changeHistory({
        patches: [{ op: 'replace', path: [page, 'layers'], value: JSON.parse(after) }],
        inversePatches: [{ op: 'replace', path: [page, 'layers'], value: JSON.parse(before) }],
      })
    }
  } catch (e: any) {
    error.value = e?.message || String(e)
    mm.value = image?.stickerBorder?.mm || 0
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.sticker-border{display:flex;flex-direction:column;gap:6px;margin:12px 0;padding:10px 12px;background:#f4f7fa;border-radius:8px;font-size:13px}
.row{display:flex;flex-direction:column;gap:4px}
.hint{margin:0;color:#8a8f99;font-size:12px;line-height:1.4}
.err{margin:0;color:#c0392b;font-size:12px}
</style>
