<!-- [TINIX] The reference panel edits draft-only data. The canvas overlay remains click-through outside drawing mode. -->
<template>
  <Teleport :to="toolbar">
    <div class="reference-tools">
      <button type="button" :aria-expanded="panelOpen" @click="togglePanel">{{ $t('tinix.ui.referenceGuide.title') }}</button>
      <template v-if="panelOpen">
        <!-- [TINIX] Import a material sheet into the current draft. -->
        <button type="button" @click="openMaterials">{{ t('tinix.ui.materialSheet.title') }}</button>
        <label class="reference-input">
          {{ $t(guide ? 'tinix.ui.referenceGuide.replace' : 'tinix.ui.referenceGuide.choose') }}
          <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="loading" @change="load" />
        </label>
        <template v-if="guide">
          <span class="reference-name" :title="guide.name">{{ guide.name }}</span>
          <label><input v-model="overlay" type="checkbox" /> {{ $t('tinix.ui.referenceGuide.overlay') }}</label>
          <label>{{ $t('tinix.ui.referenceGuide.opacity') }} <input v-model.number="opacity" type="range" min="0" max="100" /> {{ opacity }}%</label>
          <button type="button" class="reference-draw" :aria-pressed="drawing" @click="toggleDrawing">{{ $t(drawing ? 'tinix.ui.referenceGuide.cancelDraw' : 'tinix.ui.referenceGuide.draw') }}</button>
          <button type="button" class="reference-remove" :disabled="loading" @click="removeGuide">{{ $t('tinix.ui.referenceGuide.remove') }}</button>
        </template>
        <span v-if="error" role="alert">{{ $t('tinix.ui.referenceGuide.loadError') }}</span>
      </template>
    </div>
    <!-- [TINIX] Compact diagnostics for the most recent material ZIP on this page. -->
    <details v-if="panelOpen && visibleArchiveReport" class="material-import-report" open>
      <summary>{{ t('tinix.ui.materialSheet.importReportTitle') }}</summary>
      <div role="status">
        {{ t('tinix.ui.materialSheet.importReportSize', visibleArchiveReport.size) }}
        · {{ t('tinix.ui.materialSheet.importReportPlaced', visibleArchiveReport) }}
      </div>
      <p v-if="visibleArchiveReport.printNotice">
        {{ t('tinix.ui.materialSheet.' + visibleArchiveReport.printNotice) }}
      </p>
      <p v-if="visibleArchiveReport.subjectMissing">{{ t('tinix.ui.materialSheet.importReportSubjectMissing') }}</p>
      <div v-if="visibleArchiveReport.pending.length" class="material-import-review">
        <span>{{ t('tinix.ui.materialSheet.importReportPending', { n: visibleArchiveReport.pending.length }) }}</span>
        <button v-for="item in visibleArchiveReport.pending" :key="item.id" type="button"
          class="material-import-review-item" :data-layer-id="item.id"
          @click="widgets.selectWidget({ uuid: item.id })">{{ item.name }}</button>
      </div>
    </details>
    <div v-if="panelOpen && guide" class="reference-regions">
      <!-- [TINIX] Find missing links without changing the draft. -->
      <button v-if="!drawing && unlinkedRegions.length" type="button" class="reference-unlinked-count" @click="showUnlinked">
        {{ t('tinix.ui.referenceGuide.unlinkedCount', { n: unlinkedRegions.length }) }}
      </button>
      <span v-if="drawing" role="status">{{ $t('tinix.ui.referenceGuide.drawHint') }}</span>
      <template v-else>
        <label>{{ $t('tinix.ui.referenceGuide.region') }}
          <select :value="activeId" class="reference-region" @change="selectLinked">
            <option value="">{{ $t('tinix.ui.referenceGuide.selectRegion') }}</option>
            <option v-for="(region, index) in guide.regions" :key="region.id" :value="region.id">
              {{ $t('tinix.ui.referenceGuide.regionNumber', { n: index + 1 }) }} · {{ layerName(region.layerId) }}
            </option>
          </select>
        </label>
        <button type="button" class="reference-attach" aria-keyshortcuts="Shift+G" data-photo-history :disabled="!canAttach" @click="attachSelected">
          {{ $t('tinix.ui.referenceGuide.attach') }} <kbd>Shift+G</kbd>
        </button>
        <button v-if="active?.layerId" type="button" class="reference-unlink" @click="link(undefined)">{{ $t('tinix.ui.referenceGuide.unlink') }}</button>
        <button v-if="active" type="button" class="reference-delete" @click="deleteRegion">{{ $t('tinix.ui.referenceGuide.deleteRegion') }}</button>
        <!-- [TINIX] Suggest a layer without attaching it. -->
        <div v-if="suggestedLayers.length" class="reference-suggestions" :aria-label="t('tinix.ui.referenceGuide.suggestedLayers')">
          <span>{{ t('tinix.ui.referenceGuide.suggestedLayers') }}</span>
          <button v-for="layer in suggestedLayers" :key="layer.uuid" type="button" class="reference-suggested-layer"
            :data-layer-id="layer.uuid" :aria-pressed="selectedLayer?.uuid === layer.uuid"
            @pointerenter="hoveredSuggestion = layer.uuid" @pointerleave="hoveredSuggestion = ''"
            @focus="focusSuggestion($event, layer.uuid)" @blur="focusedSuggestion = ''"
            @click="widgets.selectWidget({ uuid: layer.uuid })">
            <span v-if="suggestionPreviews.get(layer.uuid)" class="reference-suggestion-preview" aria-hidden="true">
              <img v-if="suggestionPreviews.get(layer.uuid)?.src" :src="suggestionPreviews.get(layer.uuid)?.src"
                :style="suggestionPreviews.get(layer.uuid)?.style" alt="" />
              <span v-else :style="suggestionPreviews.get(layer.uuid)?.style">{{ layer.text }}</span>
            </span>
            {{ layer.layerName || layer.name }}
            <span v-if="suggestionTypes.get(layer.uuid)" class="reference-suggestion-type">
              {{ t('tinix.ui.referenceGuide.' + suggestionTypes.get(layer.uuid)) }}
            </span>
            <span v-if="suggestionPositions.get(layer.uuid)" class="reference-suggestion-position">
              {{ t('tinix.ui.referenceGuide.' + suggestionPositions.get(layer.uuid)) }}
            </span>
          </button>
        </div>
        <!-- [TINIX] Start a draft layer from the aligned region. -->
        <template v-if="active">
          <button type="button" class="reference-frame" data-photo-history :disabled="creating" @click="makeFrame">{{ t('tinix.ui.referenceGuide.makeFrame') }}</button>
          <button type="button" class="reference-sticker" :disabled="creating" @click="openCreation('sticker')">{{ t('tinix.ui.referenceGuide.makeSticker') }}</button>
          <button type="button" class="reference-label" :disabled="creating" @click="openCreation('label')">{{ t('tinix.ui.referenceGuide.makeLabel') }}</button>
          <span v-if="creationError" role="alert">{{ t('tinix.ui.referenceGuide.creationError') }}</span>
        </template>
      </template>
    </div>
  </Teleport>
  <MaterialSheetDialog v-if="materialPage" :open="true" :session="materialPage.materialSession"
    :persist-session="saveMaterialSession" @close="materialPage = undefined" @apply="importMaterials" />
  <InkTraceDialog ref="inkTrace" v-model="inkOpen" />
  <ImageCutout ref="cutout" />
  <svg v-if="panelOpen && guide && (overlay || drawing)" ref="surface" class="reference-overlay" :class="{ drawing }"
    :viewBox="`0 0 ${guide.width} ${guide.height}`" preserveAspectRatio="xMidYMid meet" data-html2canvas-ignore="true" :aria-hidden="drawing || !unlinkedRegions.length"
    @mousedown.stop @pointerdown.stop="start" @pointermove.stop="move" @pointerup.stop="finish" @pointercancel="cancelGesture">
    <image v-if="overlay || drawing" :href="guide.image" :width="guide.width" :height="guide.height" :opacity="drawing ? Math.max(0.65, opacity / 100) : opacity / 100" />
    <g v-if="overlay && !drawing">
      <!-- [TINIX] Only the marked regions intercept clicks in the reference overlay. -->
      <g v-for="{ region, number } in unlinkedRegions" :key="region.id" class="reference-unlinked-mark"
        role="button" tabindex="0" :data-region-id="region.id" :aria-pressed="activeId === region.id"
        :aria-label="t('tinix.ui.referenceGuide.regionNumber', { n: number }) + ' · ' + t('tinix.ui.referenceGuide.unlinked')"
        :transform="`translate(${region.x * guide.width},${region.y * guide.height})`"
        @click.stop="chooseRegion(region.id)" @keydown.enter.stop.prevent="chooseRegion(region.id)" @keydown.space.stop.prevent="chooseRegion(region.id)">
        <rect :width="region.width * guide.width" :height="region.height * guide.height" vector-effect="non-scaling-stroke" />
        <text :x="guide.width * 0.007" :y="guide.width * 0.024" :font-size="guide.width * 0.024">{{ number }}</text>
      </g>
    </g>
    <rect v-if="shownRegion" :x="shownRegion.x * guide.width" :y="shownRegion.y * guide.height"
      :width="shownRegion.width * guide.width" :height="shownRegion.height * guide.height" class="reference-outline" vector-effect="non-scaling-stroke" />
  </svg>
  <!-- [TINIX] Draw above the reference so nested layers remain visible on hover. -->
  <svg v-if="suggestionOutline" class="reference-suggestion-outline"
    :viewBox="`0 0 ${canvas.dPage.width} ${canvas.dPage.height}`" data-html2canvas-ignore="true" aria-hidden="true"
    :data-layer-id="suggestionOutline.id">
    <rect :x="suggestionOutline.x" :y="suggestionOutline.y" :width="suggestionOutline.width" :height="suggestionOutline.height"
      vector-effect="non-scaling-stroke" />
  </svg>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue' // [TINIX]
import { useI18n } from 'vue-i18n'
import { useCanvasStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history'
import { historyPatches } from '@/utils/widgets/diffLayouts'
import { cropReferenceGuide, isReferenceLabelBacking, isReferenceText, loadReferenceGuide, rankReferenceLayers, referencePageBox, type CanvasReferenceGuide, type ReferenceRegion } from '@/utils/tinix/reference-guide'
import type { TdWidgetData } from '@/store/design/widget'
import { photoPlaceholder } from '@/utils/tinix/template-sanitize' // [TINIX]
import { photoFrameLayer, renderedLayerBounds } from '@/utils/tinix/cut-piece-review'
import { buildStickerBorder } from '@/utils/tinix/sticker-border'
import { readCutoutFile, readCutoutImage } from '@/utils/tinix/cutout-workspace'
import { wSvgSetting } from '@/components/modules/widgets/wSvg/wSvgSetting'
import { wGroupSetting } from '@/components/modules/widgets/wGroup/groupSetting'
import InkTraceDialog from '@/components/business/ai-assistant/InkTraceDialog.vue'
import ImageCutout from '@/components/business/image-cutout/ImageCutout/index.vue'
import MaterialSheetDialog from './MaterialSheetDialog.vue' // [TINIX]
import type { MaterialSession } from '@/utils/tinix/material-session'
import { saveDraft } from '@/utils/tinix/design-file' // [TINIX]
import { buildMaterialLayers, buildMaterialSubject, materialSubjectPosition, type MaterialImport } from '@/utils/tinix/material-layers' // [TINIX]
import { DEFAULT_DPI } from '@/utils/tinix/units' // [TINIX]

const { t } = useI18n()
defineProps<{ toolbar: HTMLElement }>()
const canvas = useCanvasStore()
const widgets = useWidgetStore()
const panelOpen = ref(false)
const overlay = ref(false)
const drawing = ref(false)
const loading = ref(false)
const error = ref(false)
const opacity = ref(50)
const activeId = ref('')
const lastAttachedLayer = ref('')
const inkOpen = ref(false)
const inkTrace = ref<InstanceType<typeof InkTraceDialog>>()
const cutout = ref<InstanceType<typeof ImageCutout>>()
const creating = ref(false)
const creationError = ref(false)
const surface = ref<SVGSVGElement>()
const guide = computed(() => canvas.dPage.referenceGuide)
// [TINIX] Apply the background, reference and all pieces in one undoable edit.
const materialPage = ref<typeof canvas.dPage>()
const archiveReport = shallowRef<{
  page: typeof canvas.dPage; size: { width: number; height: number; dpi: number; widthMm: number; heightMm: number }; anchor: string
  frames: number; frameTotal: number; decorations: number; decorationTotal: number
  subjectMissing: boolean; printNotice?: string; pending: { id: string; name: string }[]
}>()
const visibleArchiveReport = computed(() => {
  const report = archiveReport.value
  if (!report || report.page !== canvas.dPage || !widgets.dWidgets.some(layer => layer.uuid === report.anchor)) return
  return { ...report, pending: report.pending.filter(item => widgets.dWidgets.some(layer => layer.uuid === item.id)) }
})
function openMaterials() {
  materialPage.value = canvas.dPage
}
// [TINIX] Store the working session on its own page in the local draft.
function saveMaterialSession(session: MaterialSession) {
  if (!materialPage.value || materialPage.value !== canvas.dPage) return Promise.resolve(false)
  canvas.updatePageData({ key: 'materialSession', value: session })
  return saveDraft()
}
// [TINIX] Layer geometry is shared with the CLI importer.
function importMaterials(payload: MaterialImport) {
  const page = materialPage.value
  materialPage.value = undefined
  if (!page || canvas.dPage !== page) return
  // [TINIX] Apply a print preset only to an empty page and include it in the import undo.
  const printSize = widgets.dWidgets.length === 0 ? payload.printSize : undefined
  const size = printSize ?? page
  const { layers, pending } = buildMaterialLayers(payload, size, page.uuid)
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  if (printSize) {
    canvas.updatePageData({ key: 'width', value: printSize.width })
    canvas.updatePageData({ key: 'height', value: printSize.height })
    canvas.updatePageData({ key: 'dpi', value: printSize.dpi })
  }
  canvas.updatePageData({ key: 'materialSession', value: undefined })
  canvas.updatePageData({ key: 'backgroundImage', value: payload.background })
  save(payload.guide)
  // [TINIX] Keep the user's subject if present, or create a replaceable cutout slot from the manifest.
  const subjects = widgets.dWidgets.filter(layer => layer.parent === page.uuid && !layer.isContainer &&
    'templateRole' in layer && layer.templateRole === 'subject')
  const subjectZ = payload.subjectZ
  if (subjectZ !== undefined && subjects.length < 2 && (subjects.length || payload.subject)) {
    const layerIndex = materialSubjectPosition(payload.pieces, subjectZ)
    const [existing] = subjects
    if (existing) {
      if (payload.pieces.some(piece => piece.pose?.layoutOrder !== undefined)) {
        layers.splice(layerIndex, 0, existing)
        widgets.dWidgets.splice(widgets.dWidgets.indexOf(existing), 1)
      }
    } else if (payload.subject) {
      layers.splice(layerIndex, 0, buildMaterialSubject(payload.subject, payload.guide, size, page.uuid))
    }
  }
  widgets.dWidgets.push(...layers as TdWidgetData[])
  widgets.updateDWidgets()
  const dpi = page.dpi || DEFAULT_DPI
  archiveReport.value = payload.archive && layers.length ? {
    page, anchor: layers[0].uuid,
    size: { width: page.width, height: page.height, dpi,
      widthMm: Math.round(page.width * 2540 / dpi) / 100, heightMm: Math.round(page.height * 2540 / dpi) / 100 },
    frames: payload.pieces.filter(piece => piece.role === 'frame' && piece.pose).length,
    frameTotal: payload.pieces.filter(piece => piece.role === 'frame').length,
    decorations: payload.pieces.filter(piece => piece.role === 'sticker' && piece.pose).length,
    decorationTotal: payload.pieces.filter(piece => piece.role === 'sticker').length,
    subjectMissing: !subjects.length && !payload.subject,
    printNotice: payload.printSize ? (printSize ? undefined : 'importReportPrintKept') : 'importReportPrintMissing',
    pending,
  } : undefined
  const change = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (change.patches.length) useHistoryStore().changeHistory(change)
  canvas.reChangeCanvas()
  overlay.value = false
}
const layerIds = computed(() => new Set(widgets.dWidgets.map(layer => layer.uuid)))
const unlinkedRegions = computed(() => (guide.value?.regions ?? [])
  .map((region, index) => ({ region, number: index + 1 }))
  .filter(({ region }) => !region.layerId || !layerIds.value.has(region.layerId)))
const active = computed(() => guide.value?.regions.find(r => r.id === activeId.value))
const selectedLayer = computed(() => widgets.dWidgets.find(l => l.uuid === widgets.dActiveElement?.uuid))
// [TINIX] Favor similarly sized layers that overlap the reference region.
const suggestedLayers = computed(() => {
  const region = active.value
  if (!panelOpen.value || drawing.value || !guide.value || !region || (region.layerId && layerIds.value.has(region.layerId))) return []
  const box = referencePageBox(guide.value, region, canvas.dPage)
  const regionArea = box.width * box.height
  const layers = widgets.dWidgets
  const byId = new Map(layers.map(layer => [layer.uuid, layer]))
  const candidates = layers.flatMap(layer => {
    if (layer.isContainer || layer.opacity === 0) return []
    const seen = new Set<string>()
    for (let parent: TdWidgetData | undefined = layer; parent && !seen.has(parent.uuid); parent = byId.get(parent.parent || '')) {
      if (parent.hidden || parent.opacity === 0) return []
      seen.add(parent.uuid)
    }
    const bounds = renderedLayerBounds(layers, [layer])
    const width = bounds.right - bounds.x
    const height = bounds.bottom - bounds.y
    const layerArea = width * height
    if (!Number.isFinite(layerArea) || width <= 0 || height <= 0) return []
    const sizeMatch = Math.min(regionArea, layerArea) / Math.max(regionArea, layerArea)
    if (sizeMatch < .05) return []
    const intersection = Math.max(0, Math.min(box.x + box.width, bounds.right) - Math.max(box.x, bounds.x)) *
      Math.max(0, Math.min(box.y + box.height, bounds.bottom) - Math.max(box.y, bounds.y))
    const overlap = intersection / (regionArea + layerArea - intersection)
    const distance = Math.hypot(box.x + box.width / 2 - bounds.x - width / 2, box.y + box.height / 2 - bounds.y - height / 2) /
      Math.hypot(box.width, box.height)
    if (!overlap && distance > .75) return []
    return [{ layer, coverage: intersection / regionArea, layerCoverage: intersection / layerArea,
      score: overlap + sizeMatch * .25 / (1 + distance) }]
  })
  return rankReferenceLayers(candidates).slice(0, 3)
})
// [TINIX] Annotate suggestions without changing their order.
const suggestionTypes = computed(() => {
  const layers = widgets.dWidgets
  return new Map(suggestedLayers.value.map(layer => {
    const layerIndex = layers.indexOf(layer)
    const hasTextAbove = layers.some((other, index) =>
      index > layerIndex && !other.hidden && isReferenceText(other) && isReferenceLabelBacking(layer, other))
    return [layer.uuid, isReferenceText(layer) ? 'suggestionText' : hasTextAbove ? 'suggestionPaper' : undefined]
  }))
})
// [TINIX] Use a shared scale so similar paper layers retain visible size differences.
const suggestionPreviews = computed(() => {
  const previews = new Map<string, { src?: string; style: Record<string, string> }>()
  for (const type of ['suggestionText', 'suggestionPaper']) {
    const ambiguous = suggestedLayers.value.filter(layer => suggestionTypes.value.get(layer.uuid) === type)
      .filter(layer => /^(?:giấy|chữ|paper|text|layer|lớp)(?:[\s_-]*\d+)?$/iu.test((layer.layerName || layer.name).trim()))
    if (ambiguous.length < 2) continue
    const size = Math.max(...ambiguous.map(layer => Math.hypot(layer.width, layer.height)))
    if (!Number.isFinite(size) || size <= 0) continue
    const scale = 68 / size
    const layersById = new Map(widgets.dWidgets.map(layer => [layer.uuid, layer]))
    for (const layer of ambiguous) {
      const svg = (layer as TdWidgetData & { svgUrl?: string }).svgUrl?.trim()
      const src = layer.imgUrl || (svg?.startsWith('<svg') ? 'data:image/svg+xml,' + encodeURIComponent(svg) : svg)
      let angle = parseFloat(String(layer.rotate || 0)) || 0
      const visited = new Set([layer.uuid])
      for (let parent = layersById.get(layer.parent || ''); parent && !visited.has(parent.uuid); parent = layersById.get(parent.parent || '')) {
        visited.add(parent.uuid)
        angle += parseFloat(String(parent.rotate || 0)) || 0
      }
      if (!src && !layer.text) continue
      previews.set(layer.uuid, { src, style: {
        width: layer.width * scale + 'px', height: layer.height * scale + 'px',
        transform: 'rotate(' + angle + 'deg)', fontSize: Math.max(6, (layer.fontSize || 18) * scale) + 'px',
        color: layer.color || '#1f2937', fontFamily: layer.fontFamily || 'inherit',
      } })
    }
  }
  return previews
})
// [TINIX] Use spatial order for two or three visually matching suggestions.
const suggestionPositions = computed((previous?: Map<string, string>) => {
  const positions = new Map<string, string>()
  const matches = suggestedLayers.value.filter(layer => suggestionPreviews.value.has(layer.uuid))
  if (matches.length < 2) return positions
  const first = matches[0]
  const firstPreview = suggestionPreviews.value.get(first.uuid)!
  if (!matches.every(layer => {
    const preview = suggestionPreviews.value.get(layer.uuid)!
    return suggestionTypes.value.get(first.uuid) === suggestionTypes.value.get(layer.uuid) &&
      firstPreview.src === preview.src && first.width === layer.width && first.height === layer.height &&
      firstPreview.style.transform === preview.style.transform && (firstPreview.src || first.text === layer.text)
  })) return positions
  const centers = matches.map(layer => {
    const box = renderedLayerBounds(widgets.dWidgets, [layer])
    return { id: layer.uuid, x: (box.x + box.right) / 2, y: (box.y + box.bottom) / 2 }
  })
  if (!centers.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) return positions
  const spread = (axis: 'x' | 'y') => Math.max(...centers.map(p => p[axis])) - Math.min(...centers.map(p => p[axis]))
  const horizontal = spread('x') > spread('y')
  const axis = horizontal ? 'x' : 'y'
  const minimumGap = Math.max(8, (horizontal ? first.width : first.height) * .1)
  centers.sort((a, b) => a[axis] - b[axis])
  // [TINIX] Keep the previous mode within a small band around the gap threshold.
  const priorLabels = centers.map(center => previous?.get(center.id))
  const hasSameSet = previous?.size === centers.length && priorLabels.every(Boolean)
  const wasCorners = hasSameSet && priorLabels.every(label =>
    ['suggestionTopLeft', 'suggestionTopRight', 'suggestionBottomLeft', 'suggestionBottomRight'].includes(label!))
  const wasSameAxis = hasSameSet && priorLabels.every(label => horizontal
    ? ['suggestionLeft', 'suggestionMiddle', 'suggestionRight'].includes(label!)
    : ['suggestionAbove', 'suggestionMiddle', 'suggestionBelow'].includes(label!))
  const band = Math.max(2, minimumGap * .1)
  const switchGap = wasCorners ? minimumGap + band : wasSameAxis ? minimumGap - band : minimumGap
  if (centers.some((center, index) => index > 0 && center[axis] - centers[index - 1][axis] < switchGap)) {
    if (centers.length !== 3) return positions
    // [TINIX] Use corners only when all three identify different places.
    const gapX = Math.max(8, first.width * .1)
    const gapY = Math.max(8, first.height * .1)
    if (spread('x') < gapX || spread('y') < gapY) return positions
    const centerX = Math.min(...centers.map(p => p.x)) + spread('x') / 2
    const centerY = Math.min(...centers.map(p => p.y)) + spread('y') / 2
    if (centers.some(({ x, y }) => Math.abs(x - centerX) < gapX / 2 || Math.abs(y - centerY) < gapY / 2)) return positions
    const corners = centers.map(({ x, y }) => {
      if (y < centerY) return x < centerX ? 'suggestionTopLeft' : 'suggestionTopRight'
      return x < centerX ? 'suggestionBottomLeft' : 'suggestionBottomRight'
    })
    if (new Set(corners).size === centers.length) {
      centers.forEach(({ id }, index) => positions.set(id, corners[index]))
    }
    return positions
  }
  positions.set(centers[0].id, horizontal ? 'suggestionLeft' : 'suggestionAbove')
  if (centers.length === 3) positions.set(centers[1].id, 'suggestionMiddle')
  positions.set(centers[centers.length - 1].id, horizontal ? 'suggestionRight' : 'suggestionBelow')
  return positions
})
const canAttach = computed(() => !!active.value && !!selectedLayer.value &&
  active.value.layerId !== selectedLayer.value.uuid && lastAttachedLayer.value !== selectedLayer.value.uuid)
const hoveredSuggestion = ref('')
const focusedSuggestion = ref('')
const suggestionOutline = computed(() => {
  const id = hoveredSuggestion.value || focusedSuggestion.value
  const layer = suggestedLayers.value.find(item => item.uuid === id)
  if (!layer) return undefined
  const { x, y, right, bottom } = renderedLayerBounds(widgets.dWidgets, [layer])
  return { id, x, y, width: right - x, height: bottom - y }
})
watch([activeId, panelOpen, drawing], () => {
  hoveredSuggestion.value = ''
  focusedSuggestion.value = ''
})

function focusSuggestion(event: FocusEvent, id: string) {
  if ((event.currentTarget as HTMLElement).matches(':focus-visible')) focusedSuggestion.value = id
}
type Point = { x: number; y: number }
const anchor = ref<Point>()
const end = ref<Point>()
let pointerId: number | undefined
const pending = computed<Omit<ReferenceRegion, 'id' | 'layerId'> | undefined>(() => {
  const a = anchor.value; const b = end.value
  if (!a || !b) return undefined
  return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) }
})
const shownRegion = computed(() => pending.value || (!drawing.value && active.value))

watch([() => canvas.dCurrentPage, () => guide.value?.image], () => {
  overlay.value = false
  drawing.value = false
  activeId.value = ''
  lastAttachedLayer.value = ''
  cancelGesture()
})
watch(() => selectedLayer.value?.uuid, id => {
  if (id && id !== lastAttachedLayer.value) lastAttachedLayer.value = ''
  if (!id || active.value?.layerId === id) return
  // [TINIX] Keep the pending region selected while choosing its layer.
  if (unlinkedRegions.value.some(({ region }) => region.id === activeId.value)) return
  const match = guide.value?.regions.find(r => r.layerId === id)
  if (match) activeId.value = match.id
})

function save(value?: CanvasReferenceGuide) {
  canvas.updatePageData({ key: 'referenceGuide', value })
}

function layerName(id?: string) {
  const layer = widgets.dWidgets.find(l => l.uuid === id)
  return layer ? layer.layerName || layer.name || layer.uuid : t(id ? 'tinix.ui.referenceGuide.missingLayer' : 'tinix.ui.referenceGuide.unlinked')
}

function showUnlinked() {
  const first = unlinkedRegions.value[0]
  if (!first) return
  overlay.value = true
  chooseRegion(first.region.id)
}

function chooseRegion(id: string) {
  lastAttachedLayer.value = ''
  activeId.value = id
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) return
  overlay.value = drawing.value = false
  cancelGesture()
}

async function load(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || loading.value) return
  const page = canvas.dPage
  loading.value = true
  error.value = false
  try {
    const result = await loadReferenceGuide(file)
    if (canvas.dPage === page) {
      save(result)
      // The image-change watcher resets the overlay before the new preview is shown.
      await nextTick()
      if (panelOpen.value) overlay.value = true
    }
  } catch {
    if (canvas.dPage === page) error.value = true
  } finally {
    loading.value = false
    input.value = ''
  }
}

function removeGuide() { save(undefined) }

function toggleDrawing() {
  drawing.value = !drawing.value
  if (!drawing.value) cancelGesture()
}

function cursor(event: PointerEvent, clamp: boolean): Point | undefined {
  const matrix = surface.value?.getScreenCTM()
  if (!guide.value || !matrix) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  const x = point.x / guide.value.width; const y = point.y / guide.value.height
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}

function start(event: PointerEvent) {
  if (!drawing.value || event.button !== 0 || pointerId !== undefined) return
  const point = cursor(event, false)
  if (!point) return
  surface.value?.setPointerCapture(event.pointerId)
  pointerId = event.pointerId
  anchor.value = end.value = point
}

function move(event: PointerEvent) {
  if (pointerId === event.pointerId) end.value = cursor(event, true)
}

function finish(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  end.value = cursor(event, true)
  const region = pending.value; const current = guide.value
  cancelGesture()
  if (!current || !region || region.width * current.width < 4 || region.height * current.height < 4) return
  const id = crypto.randomUUID()
  save({ ...current, regions: [...current.regions, { id, ...region }] })
  activeId.value = id
  drawing.value = false
  overlay.value = true
}

function cancelGesture() {
  anchor.value = end.value = undefined
  pointerId = undefined
}

function selectLinked(event: Event) {
  chooseRegion((event.target as HTMLSelectElement).value)
  const id = active.value?.layerId
  if (id && widgets.dWidgets.some(l => l.uuid === id)) widgets.selectWidget({ uuid: id })
}

function link(layerId?: string) {
  if (!guide.value || !active.value) return
  const id = active.value.id
  const pendingIndex = unlinkedRegions.value.findIndex(({ region }) => region.id === id)
  const next = unlinkedRegions.value[pendingIndex + 1] || unlinkedRegions.value[0]
  save({ ...guide.value, regions: guide.value.regions.map(r => r.id === id ? { ...r, layerId } : r) })
  if (layerId && pendingIndex !== -1 && next && next.region.id !== id) {
    lastAttachedLayer.value = layerId
    activeId.value = next.region.id
    // [TINIX] Require a fresh layer selection before the next attachment.
    widgets.selectWidget({ uuid: '-1' })
  }
}

// [TINIX] Both input methods use the same undoable attachment.
function attachSelected() {
  if (!panelOpen.value || drawing.value || !canAttach.value) return
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  link(selectedLayer.value?.uuid)
  const change = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (change.patches.length) useHistoryStore().changeHistory(change)
}

function onAttachShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || !event.shiftKey ||
    event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'g') return
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
  if (!panelOpen.value || drawing.value || inkOpen.value || creating.value || !canAttach.value) return
  event.preventDefault()
  attachSelected()
}

onMounted(() => window.addEventListener('keydown', onAttachShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onAttachShortcut))

function deleteRegion() {
  if (!guide.value) return
  save({ ...guide.value, regions: guide.value.regions.filter(r => r.id !== activeId.value) })
  activeId.value = ''
}

function creationTarget() {
  if (!guide.value || !active.value) return
  return { regionId: active.value.id, image: guide.value.image,
    page: canvas.dPage, pageIndex: canvas.dCurrentPage, pageWidth: canvas.dPage.width, pageHeight: canvas.dPage.height,
    box: referencePageBox(guide.value, active.value, canvas.dPage) }
}
type Target = NonNullable<ReturnType<typeof creationTarget>>
function currentTarget(target: Target) {
  return canvas.dPage === target.page && canvas.dCurrentPage === target.pageIndex && guide.value?.image === target.image &&
    canvas.dPage.width === target.pageWidth && canvas.dPage.height === target.pageHeight &&
    guide.value.regions.some(region => region.id === target.regionId)
}
function finishCreation(target: Target, layers: Array<{ uuid: string }>, id: string) {
  const current = guide.value
  if (!current || !currentTarget(target)) return
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  widgets.dWidgets.push(...layers as TdWidgetData[])
  widgets.updateDWidgets()
  save({ ...current, regions: current.regions.map(r => r.id === target.regionId ? { ...r, layerId: id } : r) })
  const change = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (change.patches.length) useHistoryStore().changeHistory(change)
  widgets.selectWidget({ uuid: id })
  canvas.reChangeCanvas()
  overlay.value = false
}
function svgLayer(target: Target, svgUrl: string, name: string, parent = target.page.uuid) {
  const { x, y, width, height } = target.box
  return { ...wSvgSetting, uuid: crypto.randomUUID(), name, svgUrl, parent, left: x, top: y, width, height,
    record: { ...wSvgSetting.record, width, height }, printRole: 'raised' }
}
function makeFrame() {
  const target = creationTarget()
  if (!target) return
  creationError.value = false
  const { x, y, width, height } = target.box
  const edge = Math.min(width / 7, height / 7, Math.max(2, (canvas.dPage.dpi || 300) / 25.4))
  const radius = Math.min(width, height) * .055
  const name = t('tinix.ui.referenceGuide.frameName')
  const id = crypto.randomUUID()
  const group = { ...wGroupSetting, uuid: id, left: x, top: y, width, height, name, parent: target.page.uuid,
    record: { ...wGroupSetting.record, width, height }, printRole: 'raised' }
  const svg = (w: number, h: number, r: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fffdf8"/></svg>`
  const backing = svgLayer(target, svg(width,height,radius), name, id)
  const area = { x: x + edge, y: y + edge, width: width - 2 * edge, height: height - 2 * edge }
  const photo = { ...photoFrameLayer(area, name, photoPlaceholder(area), id), uuid: crypto.randomUUID(), slot: true,
    templateRole: 'photo', mask: 'data:image/svg+xml,' + encodeURIComponent(svg(area.width,area.height,Math.max(0,radius-edge))) }
  finishCreation(target, [group,backing,photo], photo.uuid)
}
async function openCreation(kind: 'sticker' | 'label') {
  const target = creationTarget()
  if (!target || !guide.value || !active.value) return
  creating.value = true
  creationError.value = false
  try {
    const crop = await cropReferenceGuide(guide.value, active.value)
    if (!currentTarget(target)) return
    if (kind === 'sticker') cutout.value?.openLocal(crop, (image, border) => { void insertSticker(target, image, border) })
    else {
      const url = await readCutoutFile(crop)
      if (currentTarget(target)) await inkTrace.value?.openRegion(url, (svg, paper, w, h) => {
        const edge = Math.min(w, h) * .05
        const backed = svg.replace('><path', `><rect x="1" y="1" width="${w-2}" height="${h-2}" rx="${edge}" fill="${paper}" stroke="#fffdf8" stroke-width="2"/><path`)
        const layer = svgLayer(target, backed, t('tinix.ui.referenceGuide.labelName'))
        finishCreation(target,[layer],layer.uuid)
      })
    }
  } catch {
    if (currentTarget(target)) creationError.value = true
  } finally {
    creating.value = false
  }
}
async function insertSticker(target: Target, url: string, border: number) {
  if (!currentTarget(target)) return
  creating.value = true
  try {
    const px = (target.page.dpi || 300) * Math.max(.5, border) / 25.4
    const image = await readCutoutImage(url)
    const sx = target.box.width / image.naturalWidth
    const sy = target.box.height / image.naturalHeight
    const result = await buildStickerBorder(url, px / ((sx + sy) / 2))
    const box = { x: target.box.x + result.offX * sx, y: target.box.y + result.offY * sy, width: result.outW * sx, height: result.outH * sy }
    const layer = { ...photoFrameLayer(box, t('tinix.ui.referenceGuide.stickerName'), await readCutoutFile(result.blob), target.page.uuid),
      uuid: crypto.randomUUID(), fit: 'fill', printRole: 'raised', cutInset: px / 2, printInset: result.margin * Math.min(sx,sy) }
    finishCreation(target,[layer],layer.uuid)
  } catch {
    if (currentTarget(target)) creationError.value = true
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.reference-tools, .reference-regions { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 6px 10px; background: #f7f8fb; }
.material-import-report { padding: 6px 10px; background: #f7f8fb; }
.material-import-report summary { cursor: pointer; font-weight: 600; }
.material-import-report p { margin: 4px 0; }
.material-import-review { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; max-height: 86px; overflow: auto; }
.material-import-review-item { border: 1px solid #ccd2dc; border-radius: 4px; background: #fff; padding: 3px 7px; }
.reference-input, .reference-tools label, .reference-regions label { display: inline-flex; align-items: center; gap: 5px; }
.reference-tools button, .reference-regions button, .reference-region { border: 1px solid #ccd2dc; border-radius: 4px; background: #fff; padding: 3px 7px; }
.reference-tools button[aria-pressed=true] { color: #fff; background: #2759b9; }
.reference-tools button:disabled, .reference-regions button:disabled { color: #777; }
.reference-name, .reference-region { max-width: 225px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reference-overlay { position: absolute; inset: 0; z-index: 10001; width: 100%; height: 100%; display: block; overflow: hidden; pointer-events: none; }
.reference-overlay.drawing { pointer-events: auto; cursor: crosshair; touch-action: none; }
.reference-outline { fill: #1279ff22; stroke: #1765c6; stroke-width: 2; stroke-dasharray: 6 4; pointer-events: none; }
.reference-unlinked-count { color: #93400a; }
.reference-attach kbd { margin-inline-start: 4px; font-size: .85em; color: #505d70; }
.reference-suggestions { display: flex; width: 100%; flex-wrap: wrap; align-items: center; gap: 5px 8px; }
.reference-suggested-layer[aria-pressed=true] { border-color: #2759b9; color: #174a9d; background: #edf4ff; }
.reference-suggestion-type { margin-inline-start: 5px; padding: 1px 5px; border-radius: 4px; background: #e8edf5; color: #324157; font-size: .85em; }
.reference-suggestion-position { margin-inline-start: 5px; color: #174a9d; font-weight: 600; font-size: .85em; }
.reference-suggestion-preview { display: inline-grid; place-items: center; width: 72px; height: 72px; vertical-align: middle; overflow: hidden; background: #f6f8fc; border-radius: 4px; margin-inline-end: 6px; }
.reference-suggestion-preview img { display: block; }
.reference-suggestion-preview > span { display: grid; place-items: center; overflow: hidden; white-space: pre-line; line-height: 1.1; }
.reference-suggestion-outline { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10002; pointer-events: none; }
.reference-suggestion-outline rect { fill: #0079ff29; stroke: #005bd3; stroke-width: 2px; }
.reference-unlinked-mark { cursor: pointer; pointer-events: visiblePainted; }
.reference-unlinked-mark rect { fill: #ffbe3024; stroke: #ffbf38; stroke-width: 2; }
.reference-unlinked-mark:focus-visible rect, .reference-unlinked-mark:hover rect { stroke: #fff3a4; stroke-width: 3; }
.reference-unlinked-mark text { fill: #fff; stroke: #522600; stroke-width: 4px; paint-order: stroke; font-weight: 700; }
</style>
