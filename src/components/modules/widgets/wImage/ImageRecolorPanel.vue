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
        <!-- input: đang kéo trong bảng màu → xem trước; change: đóng bảng màu → lưu -->
        <input :value="to" type="color" :disabled="busy" :aria-label="$t('tinix.ui.recolor.target')" @input="onTargetInput" @change="() => commit()" @blur="() => commit()" />
      </label>
      <label class="row">
        <span>{{ $t('tinix.ui.recolor.tolerance') }} <small>{{ tolerance }}</small></span>
        <input :value="tolerance" type="range" min="0" max="100" step="5" :disabled="busy" :aria-label="$t('tinix.ui.recolor.tolerance')" @input="onToleranceInput" @change="() => commit()" @blur="() => commit()" />
      </label>
      <div v-if="image.recolor" class="actions">
        <button type="button" :disabled="busy" @click="() => reset()">{{ $t('tinix.ui.recolor.reset') }}</button>
      </div>
    </template>
    <p v-if="busy" class="hint" role="status">{{ $t('tinix.ui.recolor.busy') }}</p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
// [TINIX] "Đổi màu chính" cho ảnh PNG phẳng (sticker, nhãn, hình giấy) trong bảng thuộc tính ảnh. Xử lý điểm ảnh: utils/tinix/image-recolor.ts
// Kéo trong bảng màu / thanh độ rộng → xem trước ngay trên canvas (ảnh thu nhỏ dạng data URL, không tải lên, không ghi lịch sử).
// Đóng bảng màu / thả thanh trượt → dựng ảnh đầy đủ, tải lên một lần, ghi một bước hoàn tác.
import { ref, watch, onBeforeUnmount } from 'vue'
import { useCanvasStore, useWidgetStore, useHistoryStore } from '@/store'
import { extractPalette, loadPreviewSource, renderPreview, type PaletteColor, type RecolorPreviewSource } from '@/utils/tinix/image-recolor'
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

// Trạng thái xem trước
let preview: { savedUrl: string } | null = null
let previewPage = -1
let previewSrc: RecolorPreviewSource | null = null
let previewSrcUrl = ''
let rendering = false
let queued = false
/** bản xem trước đang dựng (để bước lưu chờ xong rồi mới chốt) */
let renderDone: Promise<void> = Promise.resolve()

async function loadPalette(url: string) {
  const meta = props.image?.recolor
  if (meta) {
    to.value = meta.to
    tolerance.value = meta.tolerance
  }
  loading.value = true
  previewSrc = null
  try {
    palette.value = await extractPalette(url)
    from.value = meta?.from && palette.value.some((c) => c.hex === meta.from) ? meta.from : palette.value[0]?.hex || ''
    if (!meta && from.value) to.value = from.value
  } catch {
    palette.value = [] // ảnh từ máy chủ khác không cho đọc điểm ảnh: ẩn công cụ, không báo lỗi
  } finally {
    loading.value = false
  }
}

/** Ảnh gốc thật (bỏ qua data URL của bản xem trước): đổi thì đọc lại bảng màu (ví dụ sau "Thay ảnh") */
const baseUrl = () => {
  const u = recolorSource(props.image)
  return /^(blob|data):/.test(u) ? previewSrcUrl || '' : u
}
watch(baseUrl, (u, old) => {
  if (u && u !== old && !busy.value && !preview) loadPalette(u)
}, { immediate: true })

// Rời bảng (bỏ chọn lớp, đổi trang) khi đang xem trước: trả ảnh về như trước khi chọn màu
onBeforeUnmount(() => {
  if (preview && !busy.value) restorePreview()
})

function pickSource(hex: string) {
  if (preview) restorePreview()
  from.value = hex
  // chưa đổi màu thì màu mới bắt đầu bằng chính màu đó (không thay đổi gì cho tới khi chọn màu khác)
  if (!props.image?.recolor) to.value = hex
}

/**
 * Ảnh dùng để xem trước và màu "từ" tương ứng.
 * Ảnh có viền hình dán: xem trước thẳng trên ảnh có viền đang hiện (ảnh gốc chưa viền khác kích thước khung);
 * nếu ảnh đã từng đổi màu thì màu đang hiện là màu mới lần trước.
 */
function previewInput(): { url: string; fromHex: string } {
  const img = props.image
  if (img.stickerBorder) return { url: preview ? preview.savedUrl : img.imgUrl, fromHex: img.recolor && img.recolor.from === from.value ? img.recolor.to : from.value }
  return { url: recolorSource(img), fromHex: from.value }
}

function onTargetInput(e: Event) {
  to.value = (e.target as HTMLInputElement).value
  schedulePreview()
}
function onToleranceInput(e: Event) {
  tolerance.value = Number((e.target as HTMLInputElement).value)
  schedulePreview()
}

/** Mỗi lúc chỉ dựng một bản xem trước; trong lúc dựng có thay đổi mới thì dựng lại một lần nữa với giá trị mới nhất */
function schedulePreview() {
  if (busy.value || !from.value) return
  if (rendering) {
    queued = true
    return
  }
  rendering = true
  renderDone = new Promise<void>((resolve) => {
    // setTimeout thay cho requestAnimationFrame: rAF dừng hẳn khi tab bị ẩn, bản xem trước sẽ treo
    setTimeout(async () => {
      try {
        await renderOnce()
      } catch {
        /* xem trước lỗi thì bỏ qua: bước lưu vẫn báo lỗi nếu có */
      } finally {
        rendering = false
        resolve()
        if (queued) {
          queued = false
          schedulePreview()
        }
      }
    }, 16)
  })
}

async function renderOnce() {
  const img = props.image
  const { url, fromHex } = previewInput()
  if (!previewSrc || previewSrcUrl !== url) {
    previewSrc = await loadPreviewSource(url)
    previewSrcUrl = url
  }
  const dataUrl = renderPreview(previewSrc, fromHex, to.value, tolerance.value)
  if (busy.value) return
  if (!preview) {
    preview = { savedUrl: img.imgUrl }
    previewPage = cs.dCurrentPage
  }
  img.imgUrl = dataUrl
  // lớp đang chọn là bản sao: đồng bộ về danh sách lớp để canvas vẽ lại (không ghi lịch sử)
  if (cs.dCurrentPage === previewPage) ws.updateDWidgets()
}

function restorePreview() {
  if (!preview) return
  props.image.imgUrl = preview.savedUrl
  if (cs.dCurrentPage === previewPage) ws.updateDWidgets()
  preview = null
}

/** Chốt màu: trả ảnh về như trước xem trước rồi đổi màu ảnh gốc ở độ phân giải đầy đủ (một bước hoàn tác) */
async function commit() {
  if (busy.value || !from.value) return
  // chờ bản xem trước đang dựng xong để không ghi đè sau khi đã chốt
  queued = false
  await renderDone
  restorePreview()
  const meta = props.image.recolor
  const unchanged = meta ? meta.from === from.value && meta.to === to.value && meta.tolerance === tolerance.value : to.value.toLowerCase() === from.value.toLowerCase()
  if (unchanged) return
  await run({ from: from.value, to: to.value, tolerance: tolerance.value })
}

async function reset() {
  restorePreview()
  await run(null)
  if (palette.value[0]) {
    from.value = palette.value.some((c) => c.hex === from.value) ? from.value : palette.value[0].hex
    to.value = from.value
  }
}

async function run(opts: { from: string; to: string; tolerance: number } | null) {
  if (busy.value) return
  const page = cs.dCurrentPage
  const before = JSON.stringify(ws.dWidgets)
  busy.value = true
  error.value = ''
  try {
    await applyRecolor(props.image, opts, Number(cs.dPage.dpi) || 300)
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
.actions button:disabled{opacity:.6;cursor:default}
.hint{margin:0;color:#8a8f99;font-size:12px;line-height:1.4}
.err{margin:0;color:#c0392b;font-size:12px}
</style>
