<template>
  <section data-photo-history class="recolor">
    <strong>{{ $t('tinix.ui.recolor.title') }}</strong>
    <p class="hint">{{ $t('tinix.ui.recolor.hint') }}</p>
    <div v-if="palette.length" class="row">
      <span>{{ $t('tinix.ui.recolor.source') }}</span>
      <div class="swatches" role="radiogroup" :aria-label="$t('tinix.ui.recolor.source')">
        <button
          v-for="c in palette"
          :key="c.hex"
          type="button"
          role="radio"
          :aria-checked="from === c.hex"
          :title="c.hex + ' · ' + Math.round(c.share * 100) + '%'"
          :class="['swatch', { on: from === c.hex }]"
          :style="{ background: c.hex }"
          :disabled="busy"
          @click="() => pickSource(c.hex)"
        />
      </div>
    </div>
    <p v-else-if="loading" class="hint" role="status">{{ $t('tinix.ui.recolor.reading') }}</p>
    <p v-else class="hint">{{ $t('tinix.ui.recolor.noColors') }}</p>
    <template v-if="palette.length">
      <label class="row inline">
        <span>{{ $t('tinix.ui.recolor.target') }}</span>
        <input v-model="to" type="color" :disabled="busy" :aria-label="$t('tinix.ui.recolor.target')" />
      </label>
      <label class="row">
        <span>{{ $t('tinix.ui.recolor.tolerance') }} <small>{{ tolerance }}</small></span>
        <input v-model.number="tolerance" type="range" min="0" max="100" step="5" :disabled="busy" :aria-label="$t('tinix.ui.recolor.tolerance')" />
      </label>
      <div class="actions">
        <button type="button" class="primary" :disabled="busy || !from" @click="() => run(false)">{{ $t('tinix.ui.recolor.apply') }}</button>
        <button v-if="image.recolor" type="button" :disabled="busy" @click="() => run(true)">{{ $t('tinix.ui.recolor.reset') }}</button>
      </div>
    </template>
    <p v-if="busy" class="hint" role="status">{{ $t('tinix.ui.recolor.busy') }}</p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
// [TINIX] "Đổi màu chính" cho ảnh PNG phẳng (sticker, nhãn, hình giấy) trong bảng thuộc tính ảnh. Xử lý điểm ảnh: utils/tinix/image-recolor.ts
import { ref, onMounted } from 'vue'
import { useCanvasStore, useWidgetStore, useHistoryStore } from '@/store'
import { extractPalette, type PaletteColor } from '@/utils/tinix/image-recolor'
import { applyRecolor, recolorSource } from '@/utils/tinix/recolor-apply'
import i18n from '@/languages'

const props = defineProps<{ image: any }>()
const ws = useWidgetStore()
const cs = useCanvasStore()
const palette = ref<PaletteColor[]>([])
const from = ref('')
const to = ref('#3060d0')
const tolerance = ref<number>(40)
const loading = ref(false)
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  const meta = props.image?.recolor
  if (meta) {
    to.value = meta.to
    tolerance.value = meta.tolerance
  }
  loading.value = true
  try {
    palette.value = await extractPalette(recolorSource(props.image))
    from.value = meta?.from && palette.value.some((c) => c.hex === meta.from) ? meta.from : palette.value[0]?.hex || ''
    if (!meta && from.value) to.value = from.value
  } catch {
    palette.value = [] // ảnh từ máy chủ khác không cho đọc điểm ảnh: ẩn công cụ, không báo lỗi
  } finally {
    loading.value = false
  }
})

function pickSource(hex: string) {
  from.value = hex
}

async function run(reset: boolean) {
  if (busy.value) return
  const page = cs.dCurrentPage
  const before = JSON.stringify(ws.dWidgets)
  busy.value = true
  error.value = ''
  try {
    await applyRecolor(props.image, reset ? null : { from: from.value, to: to.value, tolerance: tolerance.value }, Number(cs.dPage.dpi) || 300)
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
    error.value = e?.message || (i18n.global.t('tinix.ui.recolor.failed') as string)
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.recolor{display:flex;flex-direction:column;gap:8px;margin:12px 0;padding:10px 12px;background:#f4f7fa;border-radius:8px;font-size:13px}
.row{display:flex;flex-direction:column;gap:4px}
.row.inline{flex-direction:row;align-items:center;justify-content:space-between}
.swatches{display:flex;flex-wrap:wrap;gap:6px}
.swatch{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer;padding:0}
.swatch.on{box-shadow:0 0 0 2px #2563eb}
.actions{display:flex;gap:6px}
.actions button{padding:6px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font:inherit;cursor:pointer}
.actions .primary{background:#2563eb;border-color:#2563eb;color:#fff}
.actions button:disabled{opacity:.6;cursor:default}
.hint{margin:0;color:#8a8f99;font-size:12px;line-height:1.4}
.err{margin:0;color:#c0392b;font-size:12px}
</style>
