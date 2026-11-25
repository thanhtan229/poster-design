<!-- [TINIX] Surface finished-page overflow after a canvas resize. -->
<template>
  <Teleport :to="toolbar">
    <div v-if="pending || warnings.length" class="resize-trim-warning" role="status" aria-live="polite">
      <span v-if="pending">{{ $t('tinix.ui.trimReview.resizeChecking') }}</span>
      <template v-else>
        <ul>
          <li v-for="row in warnings" :key="row.id" :class="{ overflow: row.status === 'overflow' }">
            {{ row.name }} · {{ details(row) }}
            <button v-if="row.status === 'overflow'" type="button" data-photo-history :disabled="previewBusy" @click="prepareMove(row)">{{ $t('tinix.ui.trimReview.moveInside') }}</button>
          </li>
        </ul>
        <label v-if="warnings.some(row => row.status === 'overflow')" class="move-clearance">
          {{ $t('tinix.ui.trimReview.moveClearance') }}
          <input v-model.number="clearanceMm" type="number" min="0" max="100" step="0.1" data-photo-history /> mm
        </label>
        <div v-if="preview" class="move-preview">
          {{ $t('tinix.ui.trimReview.moveAmount', { x: mm(preview.dx), y: mm(preview.dy) }) }}
          <button type="button" data-photo-history @click="applyMove">{{ $t('tinix.ui.trimReview.moveApply') }}</button>
          <button type="button" data-photo-history @click="preview = undefined">{{ $t('tinix.ui.trimReview.moveCancel') }}</button>
        </div>
        <span v-if="previewBusy">{{ $t('tinix.ui.trimReview.resizeChecking') }}</span>
        <span v-if="previewError">{{ $t('tinix.ui.trimReview.moveFailed') }}</span>
        <button type="button" @click="dismiss">{{ $t('tinix.ui.trimReview.resizeDismiss') }}</button>
      </template>
    </div>
  </Teleport>
  <div v-if="marked.length" class="resize-trim-guide" aria-hidden="true" data-html2canvas-ignore="true">
    <span v-for="edge in marked" :key="edge" :class="edge" />
  </div>
  <div v-if="preview" class="move-preview-box" data-html2canvas-ignore="true" :style="{left: preview.x + preview.dx + 'px', top: preview.y + preview.dy + 'px', width: preview.width + 'px', height: preview.height + 'px'}" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCanvasStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history'
import { historyPatches } from '@/utils/widgets/diffLayouts'
import { printUnits } from '@/utils/tinix/collage-print'
import config from '@/config'
import { hasTrimCandidates, inspectPrintTrim, printTrimCache, type TrimRow } from '@/utils/tinix/print-trim-review'
import { COLLAGE_REVIEW_EVENT, type CollageReviewReport } from '@/utils/tinix/collage-review'

defineProps<{ toolbar: HTMLElement }>()
const canvas = useCanvasStore()
const widgets = useWidgetStore()
const { t } = useI18n()
const pending = ref(false)
const warnings = ref<TrimRow[]>([])
const preview = ref<{ ids: string[]; dx: number; dy: number; x: number; y: number; width: number; height: number; baseline: string }>()
const previewBusy = ref(false)
const previewError = ref(false)
const clearanceMm = ref(0)
let previewRun = 0
watch(clearanceMm, () => {
  previewRun++
  preview.value = undefined
  previewError.value = false
  previewBusy.value = false
})
const marked = computed(() => [...new Set(warnings.value.filter(row => row.status === 'overflow').flatMap(row => row.edges))])
const enabled = computed(() => !!(canvas.dPage as { collage?: unknown }).collage)
let targets = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
let lastWarmup = -Infinity

watch([enabled, () => widgets.dActiveElement?.uuid], ([isCollage]) => {
  if (!isCollage || performance.now() - lastWarmup < 30_000) return
  lastWarmup = performance.now()
  // [TINIX] Start Chrome while the user opens the draft or selects a piece.
  void fetch(config.SCREEN_URL + '/api/tinix/trim-renderer/warmup', {
    method: 'POST', signal: AbortSignal.timeout(5000),
  }).catch(() => undefined)
}, { immediate: true })

const snapshot = computed(() => ({
  page: canvas.dPage, index: canvas.dCurrentPage, enabled: enabled.value, width: canvas.dPage.width,
  height: canvas.dPage.height, dpi: canvas.dPage.dpi,
  layers: new Map(widgets.dWidgets.map(w => [w.uuid, {
    width: w.width, height: w.height, parent: w.parent,
    geometry: [w.left, w.top, w.rotate, w.transform, w.parent, w.hidden,
      (w as { mask?: string }).mask, w.imgUrl, w.opacity, w.effects?.shadow],
  }])),
}))

type Layers = typeof snapshot.value.layers

function relatedLayers(layers: Layers, resized: ReadonlySet<string>) {
  const related = new Set<string>()
  for (const [id, layer] of layers) {
    const family = new Set([id])
    for (let parent = layer.parent; parent && !family.has(parent); parent = layers.get(parent)?.parent) family.add(parent)
    if ([...family].some(member => resized.has(member))) family.forEach(member => related.add(member))
  }
  return related
}

function stop() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  controller?.abort()
  controller = undefined
  pending.value = false
}
function dismiss() {
  previewRun++
  preview.value = undefined
  previewError.value = false
  previewBusy.value = false
  stop()
  targets = new Set()
  warnings.value = []
}

watch(snapshot, (next, before) => {
  previewRun++
  preview.value = undefined
  previewError.value = false
  previewBusy.value = false
  if (!next.enabled || next.index !== before.index ||
    next.width !== before.width || next.height !== before.height || next.dpi !== before.dpi) {
    dismiss()
    return
  }
  const changed = new Set<string>()
  for (const [id, geometry] of next.layers) {
    const old = before.layers.get(id)
    if (old && (old.width !== geometry.width || old.height !== geometry.height)) changed.add(id)
  }
  if (changed.size) {
    // Include earlier members of the same resize while a group is settling.
    if (pending.value) targets.forEach(id => changed.add(id))
    targets = changed
  } else {
    if (!targets.size) return
    const related = new Set([...relatedLayers(next.layers, targets), ...relatedLayers(before.layers, targets)])
    const needsCheck = next.page !== before.page || [...related].some(id => {
      const current = next.layers.get(id)
      const old = before.layers.get(id)
      return !current || !old || current.geometry.some((value, index) => value !== old.geometry[index])
    })
    if (!needsCheck) return
  }
  stop()
  warnings.value = []
  if (!hasTrimCandidates(canvas.dPage, widgets.dWidgets, targets)) return
  pending.value = true
  timer = setTimeout(() => { void validate() }, 80)
})

function mm(value: number) {
  return (value * 25.4 / (canvas.dPage.dpi || 300)).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function prepareMove(row: TrimRow) {
  const unit = printUnits(widgets.dWidgets).find(item => item.ids.includes(row.id))
  if (!unit) return
  const run = ++previewRun
  const baseline = JSON.stringify(widgets.dWidgets)
  const page = canvas.dPage
  const layers = JSON.parse(baseline)
  const ids = new Set(unit.ids)
  preview.value = undefined
  previewError.value = false
  previewBusy.value = true
  try {
    const clearance = Number(clearanceMm.value)
    if (!Number.isFinite(clearance) || clearance < 0 || clearance > 100) throw new Error('Invalid clearance')
    const inset = Math.ceil(clearance * (page.dpi || 300) / 25.4)
    const signal = AbortSignal.timeout(60000)
    const original = await inspectPrintTrim(page, layers, signal, () => {}, printTrimCache, ids)
    if (original.rows.some(item => item.status === 'unknown')) throw new Error('Unmeasured layer')
    const max = (edge: 'left' | 'right' | 'top' | 'bottom') => Math.max(0, ...original.rows.map(item => item.extent[edge]))
    const left = max('left')
    const right = max('right')
    const top = max('top')
    const bottom = max('bottom')
    if ((left && right) || (top && bottom)) throw new Error('Piece exceeds page')
    const dx = left ? left + inset : right ? -right - inset : 0
    const dy = top ? top + inset : bottom ? -bottom - inset : 0
    if (!dx && !dy) throw new Error('No overflow')
    for (const layer of layers) if (ids.has(layer.uuid)) { layer.left += dx; layer.top += dy }
    const moved = await inspectPrintTrim(page, layers, signal, () => {}, printTrimCache, ids)
    if (moved.rows.some(item => item.status === 'unknown' || item.status === 'overflow')) throw new Error('Piece cannot fit')
    // Check the requested distance from every edge that originally overflowed.
    if (inset) {
      const insetLeft = left ? inset : 0
      const insetTop = top ? inset : 0
      const checkPage = { ...page, width: page.width - insetLeft - (right ? inset : 0), height: page.height - insetTop - (bottom ? inset : 0) }
      if (checkPage.width <= 0 || checkPage.height <= 0) throw new Error('Invalid clearance')
      const checkLayers = layers.map((layer: { left: number; top: number }) => ({ ...layer, left: layer.left - insetLeft, top: layer.top - insetTop }))
      const checked = await inspectPrintTrim(checkPage, checkLayers, signal, () => {}, printTrimCache, ids)
      if (checked.rows.some(item => item.status === 'unknown' || item.status === 'overflow')) throw new Error('Clearance not achieved')
    }
    if (run !== previewRun || JSON.stringify(widgets.dWidgets) !== baseline || canvas.dPage !== page) return
    preview.value = { ids: unit.ids, dx, dy, ...unit.bounds, baseline }
  } catch {
    if (run === previewRun) previewError.value = true
  } finally {
    if (run === previewRun) previewBusy.value = false
  }
}

function applyMove() {
  const move = preview.value
  if (!move || JSON.stringify(widgets.dWidgets) !== move.baseline) return
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  const ids = new Set(move.ids)
  for (const layer of widgets.dWidgets) if (ids.has(layer.uuid)) { layer.left += move.dx; layer.top += move.dy }
  const change = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (change.patches.length) useHistoryStore().changeHistory(change)
  preview.value = undefined
  canvas.reChangeCanvas()
}

async function validate() {
  const current = new AbortController()
  controller = current
  try {
    const { rows } = await inspectPrintTrim(canvas.dPage, widgets.dWidgets, current.signal, () => {}, printTrimCache, targets)
    if (!current.signal.aborted) {
      warnings.value = rows.filter(row => row.status !== 'inside')
      window.dispatchEvent(new CustomEvent<CollageReviewReport>(COLLAGE_REVIEW_EVENT, {
        detail: { page: canvas.dPage, trim: rows },
      }))
    }
  } catch {
    // A later resize or page change supersedes this run.
  } finally {
    if (controller === current) {
      controller = undefined
      pending.value = false
    }
  }
}
function details(row: TrimRow) {
  const edges = row.edges.map(edge => {
    const value = row.extent[edge]
    const label = t('tinix.ui.pieceReview.' + edge)
    const mm = (value*25.4/(canvas.dPage.dpi||300)).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:2})
    return value ? label + ' · ' + mm + ' mm' : label
  }).join(', ')
  return t('tinix.ui.trimReview.' + row.status) + (edges ? ' · ' + edges : '')
}
onBeforeUnmount(stop)
</script>

<style scoped>
.resize-trim-warning { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 7px 10px; background: #fff4dc; color: #69410c; font-size: 13px; }
.resize-trim-warning ul { list-style: none; padding: 0; margin: 0; }
.resize-trim-warning .overflow { color: #9b241a; font-weight: 600; }
.resize-trim-warning button { border: 1px solid #d4bc95; border-radius: 4px; background: #fff; padding: 3px 8px; }
.resize-trim-guide { position: absolute; inset: 0; z-index: 10003; pointer-events: none; }
.resize-trim-guide span { position: absolute; background: #e34b3d; }
.resize-trim-guide .left, .resize-trim-guide .right { top: 0; bottom: 0; width: 5px; }
.resize-trim-guide .top, .resize-trim-guide .bottom { left: 0; right: 0; height: 5px; }
.resize-trim-guide .left { left: 0; }.resize-trim-guide .right { right: 0; }
.resize-trim-guide .top { top: 0; }.resize-trim-guide .bottom { bottom: 0; }
.move-preview { display: flex; align-items: center; gap: 6px; }
.move-clearance { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.move-clearance input { width: 65px; }
.move-preview-box { position: absolute; z-index: 10004; border: 4px dashed #1769c2; background: #1769c222; pointer-events: none; }
</style>
