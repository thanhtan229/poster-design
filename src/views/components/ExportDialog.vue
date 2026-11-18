<template>
  <el-dialog v-model="open" :title="$t('tinix.ui.export.title')" width="520px" append-to-body :close-on-click-modal="!running" :close-on-press-escape="!running" :show-close="!running">
    <p v-if="tempEditing" class="hint warn">{{ $t('tinix.ui.export.design_only') }}</p>
    <div class="formats" role="radiogroup" :aria-label="$t('tinix.ui.export.format')">
      <button v-for="f in formats" :key="f.id" type="button" role="radio" :aria-checked="format === f.id" :class="{ on: format === f.id }" :disabled="running" @click="format = f.id">
        <b>{{ f.label }}</b>
        <small>{{ f.hint }}</small>
      </button>
    </div>

    <section v-if="usesPages && pageCount > 1" class="block">
      <h4>{{ $t('tinix.ui.export.pages') }}</h4>
      <label><input v-model="mode" type="radio" value="current" :disabled="running" /> {{ $t('tinix.ui.export.page_current', { n: currentPage + 1 }) }}</label>
      <label><input v-model="mode" type="radio" value="select" :disabled="running" /> {{ $t('tinix.ui.export.page_select') }}</label>
      <div v-if="mode === 'select'" class="pages">
        <label v-for="(_, i) in pageList" :key="i"><input v-model="picked" type="checkbox" :value="i" :disabled="running" /> {{ $t('tinix.ui.batch.page', { n: i + 1 }) }}</label>
      </div>
    </section>

    <section v-if="usesQuality" class="block">
      <h4>{{ $t('tinix.ui.export.quality') }}</h4>
      <label><input v-model.number="scale" type="radio" :value="1" :disabled="running" /> {{ $t('tinix.ui.export.q_full', { size: fullSize }) }}</label>
      <label><input v-model.number="scale" type="radio" :value="0.5" :disabled="running" /> {{ $t('tinix.ui.export.q_light', { size: halfSize }) }}</label>
    </section>

    <p v-if="format === 'psd'" class="hint">{{ $t('tinix.ui.export.psd_hint') }}</p>
    <p v-if="format === 'bundle'" class="hint">{{ $t('tinix.ui.export.bundle_hint') }}</p>
    <p v-if="running" class="hint" role="status">{{ progress }}</p>

    <template #footer>
      <el-button :disabled="running" @click="open = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="running" :disabled="tempEditing || (usesPages && mode === 'select' && !picked.length)" @click="run">{{ format === 'bundle' ? $t('tinix.ui.export.next') : $t('tinix.ui.export.go') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// [TINIX] Hộp thoại "Xuất" duy nhất: JPG để in (mặc định) · PNG · PSD · bộ tờ in cắt dán. Nhớ lựa chọn lần trước.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import i18n from '@/languages'
import useNotification from '@/common/methods/notification'
import downloadBlob from '@/common/methods/download/downloadBlob'
import { useCanvasStore, useUserStore, useWidgetStore } from '@/store'
import { designTitle } from '@/utils/tinix/design-file'
import { renderPageOnServer } from '@/utils/tinix/server-export'
import { exportPsdBlob } from '@/utils/tinix/psd-export'
import { zipImages } from '@/utils/tinix/zip'
import { withPngDpi } from '@/utils/tinix/png-dpi'
import { clampDpi, DEFAULT_DPI } from '@/utils/tinix/units'

type Format = 'jpg' | 'png' | 'psd' | 'bundle'
const props = defineProps<{ pngCurrent: () => Promise<void> }>()
const emit = defineEmits<{ (e: 'bundle'): void }>()
const t = (k: string, p?: any): string => i18n.global.t(k, p) as string

const widgetStore = useWidgetStore()
const pageStore = useCanvasStore()
const { tempEditing } = storeToRefs(useUserStore())
const { dLayouts } = storeToRefs(widgetStore)
const { dPage, dCurrentPage } = storeToRefs(pageStore)

const KEY = 'tinix-export-prefs'
function loadPrefs(): { format?: Format; scale?: number; mode?: string } {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch (_) { return {} }
}
const saved = loadPrefs()
const open = ref(false)
const running = ref(false)
const progress = ref('')
const format = ref<Format>(['jpg', 'png', 'psd', 'bundle'].includes(String(saved.format)) ? (saved.format as Format) : 'jpg')
const scale = ref(saved.scale === 0.5 ? 0.5 : 1)
const mode = ref(saved.mode === 'select' ? 'select' : 'current')
const picked = ref<number[]>([])

const pageList = computed(() => dLayouts.value)
const pageCount = computed(() => pageList.value.length)
const currentPage = computed(() => dCurrentPage.value)
const isCollage = computed(() => !!(dPage.value as any).collage)
const usesPages = computed(() => format.value === 'jpg' || format.value === 'png')
const usesQuality = computed(() => usesPages.value)
const formats = computed(() => {
  const list: Array<{ id: Format; label: string; hint: string }> = [
    { id: 'jpg', label: 'JPG', hint: t('tinix.ui.export.jpg_hint') },
    { id: 'png', label: 'PNG', hint: t('tinix.ui.export.png_hint') },
    { id: 'psd', label: 'PSD', hint: t('tinix.ui.export.psd_short') },
  ]
  if (isCollage.value) list.push({ id: 'bundle', label: t('tinix.ui.export.bundle'), hint: t('tinix.ui.export.bundle_short') })
  return list
})
const fullSize = computed(() => `${dPage.value.width} × ${dPage.value.height} px`)
const halfSize = computed(() => `${Math.round(Number(dPage.value.width) / 2)} × ${Math.round(Number(dPage.value.height) / 2)} px`)

watch(open, (v) => {
  if (!v) return
  if (format.value === 'bundle' && !isCollage.value) format.value = 'jpg'
  picked.value = pageList.value.map((_, i) => i)
  if (pageCount.value < 2) mode.value = 'current'
})

function remember() {
  try { localStorage.setItem(KEY, JSON.stringify({ format: format.value, scale: scale.value, mode: mode.value })) } catch (_) { /* bộ nhớ trình duyệt đầy hoặc bị chặn: bỏ qua */ }
}

function fileBase() {
  return (designTitle.value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || t('editor.header.untitledWork')
}

async function convert(blob: Blob, kind: 'jpg' | 'png', factor: number, dpi: number): Promise<Blob> {
  const image = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * factor))
    canvas.height = Math.max(1, Math.round(image.height * factor))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    if (kind === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const out = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, kind === 'jpg' ? 'image/jpeg' : 'image/png', 0.95) })
    if (!out) throw new Error('Image encoding failed')
    return kind === 'png' ? withPngDpi(out, dpi) : out
  } finally { image.close() }
}

async function renderPage(index: number, kind: 'jpg' | 'png'): Promise<Blob> {
  let blob = await renderPageOnServer(index, kind) // không ghi CSDL
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const ok = kind === 'jpg' ? head[0] === 255 && head[1] === 216 && head[2] === 255 : head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71
  if (!ok) throw new Error(t('tinix.ui.export.bad_file', { kind: kind.toUpperCase() }))
  if (scale.value !== 1) blob = await convert(blob, kind, scale.value, clampDpi(dLayouts.value[index]?.global?.dpi || DEFAULT_DPI))
  return blob
}

async function exportImages(kind: 'jpg' | 'png') {
  const pages = (mode.value === 'select' && pageCount.value > 1 ? picked.value.slice() : [dCurrentPage.value]).sort((a, b) => a - b)
  if (kind === 'png' && pages.length === 1 && scale.value === 1 && pages[0] === dCurrentPage.value) {
    await props.pngCurrent() // đường nhanh có sẵn: ghi DPI vào PNG, có thanh tiến trình
    return
  }
  const files: Array<{ name: string; blob: Blob }> = []
  const failed: number[] = []
  for (let i = 0; i < pages.length; i++) {
    progress.value = t('tinix.ui.batch.progress', { n: i, total: pages.length })
    try {
      files.push({ name: pages.length === 1 ? `${fileBase()}.${kind}` : `trang-${String(pages[i] + 1).padStart(3, '0')}.${kind}`, blob: await renderPage(pages[i], kind) })
    } catch (_) { failed.push(pages[i]) }
  }
  if (!files.length) throw new Error(t('tinix.ui.batch.failed', { pages: failed.map((n) => n + 1).join(', ') }))
  if (pages.length === 1) downloadBlob(files[0].blob, files[0].name)
  else downloadBlob(await zipImages(files), `${fileBase()}-trang.zip`)
  if (failed.length) useNotification(t('tinix.ui.export.partial'), t('tinix.ui.batch.failed', { pages: failed.map((n) => n + 1).join(', ') }), { type: 'warning' })
}

async function exportPsd() {
  progress.value = t('tinix.ui.psdExport.dang_xuat', { n: 0, total: 0 })
  widgetStore.selectWidget({ uuid: '-1' }) // bỏ khung chọn để không lọt vào ảnh
  await new Promise((r) => { setTimeout(r, 50) })
  const blob = await exportPsdBlob(JSON.parse(JSON.stringify(dPage.value)), widgetStore.dWidgets as any, (d, total) => { progress.value = t('tinix.ui.psdExport.dang_xuat', { n: d, total }) })
  downloadBlob(blob, `${fileBase()}.psd`)
}

async function run() {
  if (running.value || tempEditing.value) return
  remember()
  if (format.value === 'bundle') {
    open.value = false
    emit('bundle')
    return
  }
  running.value = true
  progress.value = ''
  try {
    if (format.value === 'psd') await exportPsd()
    else await exportImages(format.value)
    open.value = false
  } catch (e: any) {
    useNotification(t('tinix.ui.photoAuto.xuat_loi'), e?.message || '', { type: 'error' })
  } finally { running.value = false }
}

defineExpose({ open: () => { open.value = true } })
</script>

<style scoped>
.formats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
.formats button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font: inherit; cursor: pointer; text-align: left; }
.formats button b { font-size: 15px; }
.formats button small { color: #64748b; font-size: 12px; line-height: 1.35; }
.formats button.on { border-color: #3b5bdb; background: #eef2ff; box-shadow: 0 0 0 1px #3b5bdb inset; }
.formats button:disabled { opacity: 0.6; cursor: default; }
.block { margin: 10px 0; }
.block h4 { margin: 0 0 4px; font-size: 13px; color: #334155; }
.block label { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.pages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 8px; padding-left: 22px; max-height: 140px; overflow: auto; }
.hint { margin: 8px 0 0; color: #64748b; font-size: 12.5px; line-height: 1.5; }
.hint.warn { color: #b45309; }
</style>
