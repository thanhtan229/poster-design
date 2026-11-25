<!-- [TINIX] Check visible photo slots together and apply only fully checked suggestions. -->
<template>
  <Teleport :to="toolbar">
    <section v-if="frames.length" class="batch-crop" data-batch-photo-crop data-photo-history>
      <button type="button" :aria-expanded="open" @click="open = !open">{{ label('title', { count: frames.length }) }}</button>
      <div v-if="open" class="batch-crop-panel">
        <div class="batch-crop-actions">
          <button type="button" :disabled="busy" @click="run">{{ label('check') }}</button>
          <button v-if="busy" type="button" @click="reset">{{ label('stop') }}</button>
          <button v-if="safeCount" type="button" :disabled="busy || needsDetailReview" @click="apply">{{ label('apply', { count: safeCount }) }}</button>
          <button v-if="safeCount > 1" type="button" class="batch-crop-apply-selected" :disabled="!canSelectCrops || needsDetailReview || !selection.length" @click="applySubset(selection)">
            {{ label('applySelected', { count: selection.length }) }}
          </button>
        </div>
        <p v-if="validatingSubset" role="status">{{ label('checkingDependencies') }}</p>
        <p v-else-if="busy && !previewing" role="status">{{ label('progress', { done: rows.length, count: frames.length }) }}</p>
        <p v-else-if="message" role="status">{{ message }}</p>
        <p v-else-if="rows.length" role="status">{{ label('summary', { manual: manualCount, none: noneCount }) }}</p>
        <ul v-if="rows.length">
          <li v-for="row in orderedRows" :key="row.id" :data-crop-id="row.id" :data-crop-status="row.status">
            <span>
              <input v-if="row.status === 'safe' && safeCount > 1" v-model="selectedIds" type="checkbox" :value="row.id"
                :disabled="!canSelectCrops" :aria-label="t('tinix.ui.batchPhotoCrop.selectFrame', { name: row.name })" />
              {{ row.name }}
            </span>
            <span>{{ label(row.status === 'safe' && !row.faces ? 'safeDetailOnly' : row.status, { count: row.faces ?? 0 }) }}</span>
            <button v-if="row.status === 'safe'" type="button" :disabled="needsDetailReview || !canSelectCrops" @click="applySubset([row])">
              {{ label('applyOne') }}
            </button>
            <button v-else-if="row.status === 'manual' || row.status === 'unavailable'" type="button" :disabled="busy" @click="openFrame(row.id)">
              {{ label('openFrame') }}
            </button>
            <div v-if="row.preview" class="batch-crop-preview">
              <img v-if="row.preview.url" :src="row.preview.url" :alt="label('preview') + ' ' + row.name" />
              <div>
                <span>{{ label('scale', { percent: row.preview.scale }) }}</span>
                <span v-if="row.preview.exposed !== undefined">{{ label('exposed', { percent: row.preview.exposed }) }}</span>
                <span v-if="!row.preview.url && previewing" class="batch-crop-preview-pending">{{ label('previewPending') }}</span>
                <span v-else-if="!row.preview.url && !busy">{{ label('previewUnavailable') }}</span>
              </div>
            </div>
            <details v-if="row.safeArea" class="batch-crop-safe-area">
              <summary>{{ label('safeArea') }}</summary>
              <CropDetailSelector :image="row.safeArea" :alt="label('safeArea') + ' ' + row.name" :region="row.region"
                :disabled="busy" @change="setRegion(row, $event)" />
              <span>{{ label('safeAreaLegend') }}</span>
            </details>
            <p v-if="row.detail" role="status" class="batch-crop-detail-result" :class="{ warning: row.detail.clipped || row.detail.covered }">
              <template v-if="row.detail.clipped || row.detail.covered">
                {{ [row.detail.clipped ? detailPercent('detailClipped', row.detail.clipped) : '',
                  row.detail.covered ? detailPercent('detailCovered', row.detail.covered) : ''].filter(Boolean).join(' · ') }}
              </template>
              <template v-else>{{ label('detailVisible') }}</template>
            </p>
            <p v-if="row.detailBefore && row.detail" class="batch-crop-detail-result" data-crop-detail-change>
              {{ t('tinix.ui.batchPhotoCrop.detailImproved', {
                before: formatPercent(detailLoss(row.detailBefore)),
                after: formatPercent(detailLoss(row.detail)),
              }) }}
            </p>
            <button v-if="row.detailNeedsReview" type="button" :disabled="busy" @click="suggestDetail(row)">{{ label('suggestDetail') }}</button>
          </li>
        </ul>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCanvasStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history' // [TINIX]
import type { Patch } from 'immer'
import type { TdWidgetData } from '@/store/design/widget'
import { checkFrameFaces, faceCropHandoff, type CropDetailRegion, type FaceCropCheck } from '@/utils/tinix/face-crop' // [TINIX]
import { planFaceCropOcclusion } from '@/utils/tinix/face-crop-occlusion' // [TINIX]
import { canEditPhoto, enterPhotoEdit, exitPhotoEdit } from '@/utils/tinix/photo-frame'
import { photoRole } from '@/utils/tinix/template-photo'
import { regionPreviewLayout, renderedLayerBounds, renderedPreviewBitmap, type RenderRegion } from '@/utils/tinix/cut-piece-review' // [TINIX]
import CropDetailSelector from './CropDetailRegion.vue' // [TINIX]

defineProps<{ toolbar: HTMLElement }>()
type Crop = { fit: 'cover' | 'contain'; cropX: number; cropY: number; zoom: number }
type DetailResult = ReturnType<FaceCropCheck['detailVisibility']>
type Row = { id: string; name: string; status: 'clear' | 'safe' | 'manual' | 'none' | 'unavailable'; faces?: number; crop?: Crop
  region?: CropDetailRegion; detail?: DetailResult; detailBefore?: DetailResult; detailNeedsReview?: boolean
  safeArea?: string; preview?: { scale: number; exposed?: number; url?: string } }
const { t } = useI18n()
const label = (key: string, values: Record<string, number> = {}) => t('tinix.ui.batchPhotoCrop.' + key, values)
const detailLoss = (result: DetailResult) => result.clipped + result.covered
const formatPercent = (fraction: number) =>
  fraction > 0 && fraction < 0.01 ? '<1%' : fraction > 0.99 && fraction < 1 ? '>99%' : `${Math.round(fraction * 100)}%`
const detailPercent = (key: string, fraction: number) => t('tinix.ui.batchPhotoCrop.' + key, { percent: formatPercent(fraction) })
const canvas = useCanvasStore()
const widgets = useWidgetStore()
const open = ref(false)
const reviewing = ref(false)
const validatingSubset = ref(false)
const busy = computed(() => reviewing.value || validatingSubset.value)
// [TINIX] The crop metrics are readable while the thumbnail renders.
const previewing = ref(false)
const canSelectCrops = computed(() => !validatingSubset.value && (!reviewing.value || previewing.value))
const rows = ref<Row[]>([])
const selectedIds = ref<string[]>([])
const message = ref('')
let controller: AbortController | undefined
let subsetController: AbortController | undefined
let previewController: AbortController | undefined
let subsetDone: Promise<void> | undefined
let stopFocus: (() => void) | undefined
let snapshot = ''
let guidesSnapshot = ''
type FrameCheck = NonNullable<Awaited<ReturnType<typeof checkFrameFaces>>>
const guides = new Map<string, FrameCheck>()
type ReviewPage = { global: typeof canvas.dPage; layers: TdWidgetData[] }
let reviewPage: ReviewPage | undefined
// [TINIX] Cache each thumbnail by the layers that can affect its region.
const batchPreviews = new Map<string, { key: string; url: string }>()
const details = new Map<string, {
  source: string; check: FrameCheck
  frame: TdWidgetData; image: HTMLImageElement; faceCrop?: Crop
}>()
// [TINIX] Keep one completed check per frame for the next review on this page.
type CachedFrame = { source: string; key: string; maskKey: string; check: FrameCheck; faceCrop?: Crop
  overlay?: { key: number; url: string } }
type ValidatedMask = { key: string; mask: FrameCheck['mask'] }
let frameChecks = new Map<string, CachedFrame>()
const markedRegions = new Map<string, { source: string; region: CropDetailRegion }>()

const frames = computed(() => {
  const byId = new Map(widgets.dWidgets.map(layer => [layer.uuid, layer]))
  return widgets.dWidgets.filter(layer => {
    if (photoRole(layer) !== 'main' || !canEditPhoto(layer)) return false
    const seen = new Set<string>()
    for (let item: TdWidgetData | undefined = layer; item; item = byId.get(item.parent ?? '')) {
      if (item.hidden || item.opacity === 0 || seen.has(item.uuid)) return false
      seen.add(item.uuid)
    }
    return true
  })
})
const orderedRows = computed(() => {
  const byId = new Map(rows.value.map(row => [row.id, row]))
  return frames.value.flatMap(frame => byId.get(frame.uuid) ?? [])
})
const safeCount = computed(() => rows.value.filter(row => row.status === 'safe').length)
const selection = computed(() => rows.value.filter(row => row.status === 'safe' && selectedIds.value.includes(row.id)))
const manualCount = computed(() => rows.value.filter(row => row.status === 'manual' || row.status === 'unavailable').length)
const noneCount = computed(() => rows.value.filter(row => row.status === 'none').length)
const needsDetailReview = computed(() => rows.value.some(row => row.detailNeedsReview))
// [TINIX] Canvas selection updates records, and the legacy image widget adds an identity scale.
// [TINIX] Version layer values and large immutable resources without copying image bytes into cache keys.
const resourceVersions = new Map<string, number>()
let nextResourceVersion = 0
function versionOf(value: string) {
  let version = resourceVersions.get(value)
  if (version === undefined) {
    version = ++nextResourceVersion
    resourceVersions.set(value, version)
  }
  return version
}

function compactSignature(value: unknown) {
  return JSON.stringify(value, (_key, part: unknown) => {
    if (typeof part !== 'string') return part
    if (part.length < 256) return part.startsWith('~') ? '~' + part : part
    return '~' + versionOf(part)
  })
}

function layerVersion({ record: _record, ...layer }: TdWidgetData) {
  const transform = layer.transform?.trim()
  return versionOf(compactSignature({ ...layer, transform: transform === 'scale(1)' ? '' : transform }))
}

const pageSignature = ({ global, layers }: ReviewPage) => compactSignature({
  global,
  layers: layers.map(layerVersion),
})
const capture = () => pageSignature({ global: canvas.dPage, layers: widgets.dWidgets })

// [TINIX] Detach JSON layout containers while sharing immutable image strings.
function copyReviewData<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(copyReviewData) as T
  return Object.fromEntries(Object.entries(raw).map(([key, child]) => [key, copyReviewData(child)])) as T
}

function reset() {
  controller?.abort()
  controller = undefined
  subsetController?.abort()
  subsetController = undefined
  subsetDone = undefined
  stopFocus?.()
  stopFocus = undefined
  reviewing.value = false
  validatingSubset.value = false
  previewing.value = false
  rows.value = []
  selectedIds.value = []
  snapshot = ''
  guidesSnapshot = ''
  guides.clear()
  details.clear()
  reviewPage = undefined
  message.value = ''
}
watch([() => canvas.dPage, () => canvas.dCurrentPage], () => {
  reset()
  frameChecks.clear()
  batchPreviews.clear()
  resourceVersions.clear()
  markedRegions.clear()
  open.value = false
})
onBeforeUnmount(reset)

function setRegion(row: Row, region?: CropDetailRegion) {
  if (busy.value || !canApply()) return
  const detail = details.get(row.id)
  if (!detail) return
  if (region) markedRegions.set(row.id, { source: detail.source, region })
  else markedRegions.delete(row.id)
  row.region = region
  row.detail = region ? detail.check.detailVisibility(detail.frame, region) : undefined
  row.detailNeedsReview = !!(row.detailBefore || row.detail?.clipped || row.detail?.covered)
  row.detailBefore = undefined
}

function applyCrop(frame: TdWidgetData, crop: Crop) {
  Object.assign(frame, { fit: crop.fit, cropX: crop.cropX, cropY: crop.cropY, zoom: crop.zoom, transform: `scale(${crop.zoom})` })
}

function previewRegion(page: ReviewPage, id: string): RenderRegion | undefined {
  const layer = page.layers.find(item => item.uuid === id)
  if (!layer) return
  const bounds = renderedLayerBounds(page.layers, [layer])
  const x = Math.max(0, Math.floor(bounds.x) - 3)
  const y = Math.max(0, Math.floor(bounds.y) - 3)
  const width = Math.min(Math.round(page.global.width), Math.ceil(bounds.right) + 3) - x
  const height = Math.min(Math.round(page.global.height), Math.ceil(bounds.bottom) + 3) - y
  if (width > 0 && height > 0) return { x, y, width, height }
}

function previewThumbnail(source: HTMLCanvasElement, { x, y, width, height }: RenderRegion, thumbnail = document.createElement('canvas')) {
  const scale = Math.min(1, 260 / Math.max(width, height))
  thumbnail.width = Math.max(1, Math.round(width * scale))
  thumbnail.height = Math.max(1, Math.round(height * scale))
  thumbnail.getContext('2d')!.drawImage(source, x, y, width, height, 0, 0, thumbnail.width, thumbnail.height)
  return thumbnail.toDataURL('image/png')
}

function previewSurface(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return canvas
}

const previewLayout = (page: ReviewPage) => ({ ...page, global: { ...page.global, referenceGuide: undefined } })

// [TINIX] Share a cold render, then refresh only the regions whose drawing inputs changed.
async function renderPreviews(page: ReviewPage, signal: AbortSignal, afterApply: boolean) {
  const pending = rows.value.filter(row => row.preview)
  if (!pending.length) return
  const layout = previewLayout(page)
  for (const id of batchPreviews.keys()) {
    if (!page.layers.some(layer => layer.uuid === id)) batchPreviews.delete(id)
  }
  const refresh = pending.flatMap(row => {
    const region = previewRegion(page, row.id)
    if (!region) return []
    const croppedLayout = regionPreviewLayout(layout, region)
    const key = JSON.stringify([region, pageSignature(croppedLayout)])
    const saved = batchPreviews.get(row.id)
    if (saved?.key === key) {
      row.preview!.url = saved.url
      return []
    }
    return [{ row, region, croppedLayout, key }]
  })
  if (!refresh.length) return
  // [TINIX] The first preview may have been canceled to make room for crop validation.
  if (afterApply || batchPreviews.size || refresh.length === 1) {
    for (let offset = 0; offset < refresh.length; offset += 2) {
      const results = await Promise.allSettled(refresh.slice(offset, offset + 2).map(async ({ row, region, croppedLayout, key }) => {
        const url = await renderRegionPreview(croppedLayout, region, signal)
        signal.throwIfAborted()
        return { row, key, url }
      }))
      signal.throwIfAborted()
      results.forEach(result => {
        if (result.status !== 'fulfilled') return
        const { row, key, url } = result.value
        row.preview!.url = url
        batchPreviews.set(row.id, { key, url })
      })
    }
    return
  }
  const width = Math.round(page.global.width)
  const height = Math.round(page.global.height)
  if (width <= 0 || height <= 0 || width * height > 12_000_000 || Math.max(width, height) > 6000) return
  const rendered = await renderedPreviewBitmap(layout, signal)
  try {
    signal.throwIfAborted()
    const canvas = previewSurface(rendered)
    const thumbnail = document.createElement('canvas')
    for (const { row, region, key } of refresh) {
      const url = previewThumbnail(canvas, region, thumbnail)
      row.preview!.url = url
      batchPreviews.set(row.id, { key, url })
    }
  } finally {
    rendered.close()
  }
}

async function renderRegionPreview(layout: ReviewPage, region: RenderRegion, signal: AbortSignal) {
  const { width, height } = region
  const rendered = await renderedPreviewBitmap(layout, signal, region)
  try {
    signal.throwIfAborted()
    // [TINIX] Older services can return a full page for a region request.
    const source = rendered.width === width && rendered.height === height ? { x: 0, y: 0, width, height } : region
    return previewThumbnail(previewSurface(rendered), source)
  } finally {
    rendered.close()
  }
}

// [TINIX] Capture only the pixels needed by the changed row's thumbnail.
async function renderFramePreview(page: ReviewPage, row: Row, signal: AbortSignal) {
  const region = previewRegion(page, row.id)
  if (!region || !row.preview) return
  const layout = regionPreviewLayout(previewLayout(page), region)
  const url = await renderRegionPreview(layout, region, signal)
  row.preview.url = url
  batchPreviews.set(row.id, { key: JSON.stringify([region, pageSignature(layout)]), url })
}

// [TINIX] Pause only the current crop preview. On rejection, resume it for the unchanged proposal.
async function renderCropPreview(render: (signal: AbortSignal) => Promise<void>, signal: AbortSignal) {
  while (!signal.aborted) {
    if (subsetDone) await subsetDone
    if (signal.aborted) return
    const attempt = new AbortController()
    previewController = attempt
    try {
      await render(AbortSignal.any([signal, attempt.signal, AbortSignal.timeout(45000)]))
      return
    } catch (error) {
      if (!attempt.signal.aborted) throw error
    } finally {
      if (previewController === attempt) previewController = undefined
    }
  }
}

// [TINIX] A different crop in an overlapping slot can change another row's mask.
function overlappingFrames(layers: TdWidgetData[], selected: Set<string>) {
  const areas = frames.value.map(frame => ({
    id: frame.uuid,
    area: renderedLayerBounds(layers, [frame]),
    padding: 2 + 3 * Math.max(0, frame.effects?.shadow ?? 0, frame.effects?.blur ?? 0, frame.effects?.border ?? 0),
  }))
  return areas.some(({ id, area, padding }) => selected.has(id) && areas.some(other => {
    if (selected.has(other.id)) return false
    const gap = Math.max(padding, other.padding)
    return area.x < other.area.right + gap && area.right > other.area.x - gap &&
      area.y < other.area.bottom + gap && area.bottom > other.area.y - gap
  }))
}

// [TINIX] Reuse the completed review's photo, face detections and rendered layer alpha.
async function suggestDetail(row: Row) {
  if (busy.value) return
  if (!canApply()) {
    await run()
    return
  }
  const cached = details.get(row.id)
  const page = reviewPage
  const original = frames.value.find(frame => frame.uuid === row.id)
  if (!cached || !page || !original || overlappingFrames(page.layers, new Set([row.id]))) {
    await run()
    return
  }
  const { check, frame, image, faceCrop } = cached
  const clear = check.isClear(original)
  const fallback = clear ? undefined : faceCrop
  const baseline = fallback ? { ...original, ...fallback } : original
  const detailCrop = row.region ? check.suggestForDetail(baseline, row.region) : undefined
  const crop = detailCrop ?? fallback
  const { fit, cropX, cropY, zoom, transform } = original as TdWidgetData & Partial<Crop>
  Object.assign(frame, { fit, cropX, cropY, zoom, transform })
  if (crop) applyCrop(frame, crop)
  row.crop = crop
  row.status = crop ? 'safe' : !check.count ? 'none' : clear ? 'clear' : 'manual'
  row.detailBefore = detailCrop && row.region ? check.detailVisibility(original, row.region) : undefined
  row.detail = row.region ? check.detailVisibility(frame, row.region) : undefined
  row.detailNeedsReview = false
  try { row.safeArea = check.safeAreaPreview(frame, image, 520) }
  catch { /* Retain the crop result if the source photo cannot be read from a canvas. */ row.safeArea = undefined }
  if (crop) guides.set(row.id, check)
  row.preview = crop ? { scale: Math.round(crop.zoom * 100), exposed: check.exposedPercent(frame) } : undefined
  if (!crop) return
  const request = new AbortController()
  controller = request
  reviewing.value = true
  previewing.value = true
  try {
    await renderCropPreview(signal => renderFramePreview(page, row, signal), request.signal)
    if (!request.signal.aborted) canApply()
  } catch { /* Percentage and source overlay remain available without the rendered thumbnail. */ }
  finally {
    if (controller === request) {
      controller = undefined
      reviewing.value = false
      previewing.value = false
    }
  }
}

async function run() {
  await reviewCrops()
}

async function reviewCrops(validatedMasks?: ReadonlyMap<string, ValidatedMask>) {
  reset()
  // Invalidate old cache keys between reviews, never partway through a snapshot comparison.
  if (resourceVersions.size > 1024) {
    resourceVersions.clear()
    frameChecks.clear()
    batchPreviews.clear()
  }
  exitPhotoEdit()
  const run = new AbortController()
  controller = run
  reviewing.value = true
  const targets = new Map(frames.value.map(frame => [frame.uuid, frame.name]))
  const documentOrder = Array.from(document.querySelectorAll<HTMLElement>('.canvas-content-clip [id]'))
    .map(element => element.id).filter(id => targets.has(id))
  const ordered = [...new Set([...documentOrder.reverse(), ...targets.keys()])]
  const start = capture()
  const page: ReviewPage = copyReviewData({
    global: canvas.dPage, layers: widgets.dWidgets,
  })
  const layers = new Map(page.layers.map(layer => [layer.uuid, layer]))
  const completed = new Map<string, CachedFrame>()
  try {
    for (const id of ordered) {
      run.signal.throwIfAborted()
      const frame = layers.get(id)!
      const name = targets.get(id) || id
      const image = document.getElementById(id)?.querySelector<HTMLImageElement>('img.target')
      try {
        if (!image) throw new Error('Photo preview missing')
        const signal = AbortSignal.any([run.signal, AbortSignal.timeout(65000)])
        await image.decode()
        signal.throwIfAborted()
        const source = image.currentSrc || image.src
        const sourceKey = compactSignature([source, image.naturalWidth, image.naturalHeight])
        const original = { ...frame }
        const occlusion = planFaceCropOcclusion(page.global, page.layers, original, true)
        const maskKey = occlusion.signature(compactSignature)
        const key = String(layerVersion(original))
        const cached = frameChecks.get(id)
        const sameSource = cached?.source === sourceKey ? cached : undefined
        const validated = validatedMasks?.get(id)
        const sameMask = cached?.maskKey === maskKey ? cached.check.mask
          : validated?.key === maskKey ? validated.mask : undefined
        const unchanged = sameSource?.key === key && cached?.maskKey === maskKey ? sameSource : undefined
        const check = unchanged?.check ?? await checkFrameFaces(page.global, page.layers, original, image, signal, undefined, true,
          { faces: sameSource?.check.faces, plan: occlusion, mask: sameMask })
        if (run.signal.aborted) return
        if (!check) {
          rows.value.push({ id, name, status: 'none' })
          continue
        }
        const status = !check.count ? 'none' : check.isClear(frame) ? 'clear' : 'manual'
        const suggestion = !unchanged && status === 'manual' ? await check.suggest(signal) : undefined
        run.signal.throwIfAborted()
        const faceCrop = unchanged?.faceCrop ?? (suggestion && check.isClear({ ...frame, ...suggestion }) ? suggestion : undefined)
        const previous = markedRegions.get(id)
        const region = previous?.source === source ? previous.region : undefined
        if (previous && !region) markedRegions.delete(id)
        const baseline = faceCrop ? { ...frame, ...faceCrop } : frame
        const detailCrop = region && (status !== 'manual' || faceCrop) ? check.suggestForDetail(baseline, region) : undefined
        const detailBefore = detailCrop && region ? check.detailVisibility(frame, region) : undefined
        const crop = detailCrop ?? faceCrop
        if (status === 'manual' || detailCrop) guides.set(id, check)
        // [TINIX] Check the proposed crop when available, otherwise show the current crop even without faces.
        if (crop) applyCrop(frame, crop)
        const overlayKey = layerVersion(frame)
        const savedOverlay = sameMask && sameSource?.overlay?.key === overlayKey ? sameSource.overlay : undefined
        let safeArea = savedOverlay?.url
        try { safeArea ??= await check.encodeSafeArea(frame, image, 520) }
        catch { /* Some external image URLs cannot be read from the canvas. */ }
        run.signal.throwIfAborted()
        completed.set(id, { source: sourceKey, key, maskKey, check, faceCrop,
          overlay: safeArea ? { key: overlayKey, url: safeArea } : undefined })
        // [TINIX] Reuse the rendered masks when marking details or rerunning the check.
        if (safeArea) details.set(id, { source, check, frame, image, faceCrop })
        const detail = region && safeArea ? check.detailVisibility(frame, region) : undefined
        if (crop) {
          rows.value.push({ id, name, status: 'safe', faces: check.count, crop, safeArea, region, detail, detailBefore,
            preview: { scale: Math.round(crop.zoom * 100), exposed: check.exposedPercent(frame) } })
        } else {
          rows.value.push({ id, name, status, faces: check.count, safeArea, region, detail })
        }
      } catch (_) {
        if (run.signal.aborted) return
        rows.value.push({ id, name, status: 'unavailable' })
      }
    }
    run.signal.throwIfAborted()
    if (capture() !== start) {
      rows.value = []
      guides.clear()
      message.value = label('changed')
      return
    }
    // [TINIX] Publish the verified snapshot before waiting for the image renderer.
    frameChecks = completed
    snapshot = start
    reviewPage = page
    guidesSnapshot = safeCount.value ? '' : start
    if (safeCount.value) {
      previewing.value = true
      await renderCropPreview(signal => renderPreviews(page, signal, validatedMasks !== undefined), run.signal).catch(() => undefined)
      if (!run.signal.aborted) canApply()
    }
  } catch (_) {
    if (!run.signal.aborted) message.value = label('interrupted')
  } finally {
    if (controller === run) {
      controller = undefined
      reviewing.value = false
      previewing.value = false
    }
  }
}

function canApply() {
  if (!snapshot || capture() !== snapshot) {
    reset()
    message.value = label('changed')
    return false
  }
  return true
}

function applyRows(selected: Row[]) {
  flushHistory()
  const page = canvas.dCurrentPage
  const patches: Patch[] = []
  const inversePatches: Patch[] = []
  for (const row of selected) {
    if (row.status !== 'safe' || !row.crop) continue
    const index = widgets.dWidgets.findIndex(layer => layer.uuid === row.id)
    const frame = widgets.dWidgets[index] as TdWidgetData & Partial<Crop>
    const before = { fit: frame.fit, cropX: frame.cropX, cropY: frame.cropY, zoom: frame.zoom, transform: frame.transform }
    applyCrop(frame, row.crop)
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (before[key] === frame[key]) continue
      const path = [page, 'layers', index, key]
      patches.push({ op: before[key] === undefined ? 'add' : 'replace', path, value: frame[key] })
      inversePatches.push(before[key] === undefined ? { op: 'remove', path } : { op: 'replace', path, value: before[key] })
    }
    row.status = row.faces ? 'clear' : 'none'
    row.crop = undefined
    row.detailBefore = undefined
  }
  if (patches.length) {
    widgets.updateDWidgets()
    useHistoryStore().changeHistory({ patches, inversePatches })
  }
  const applied = new Set(selected.map(row => row.id))
  selectedIds.value = selectedIds.value.filter(id => !applied.has(id))
}

function apply() {
  if (needsDetailReview.value || !canApply()) return
  const applied = new Set(rows.value.filter(row => row.crop).map(row => row.id))
  applyRows(rows.value)
  snapshot = guidesSnapshot = capture()
  if (overlappingFrames(widgets.dWidgets, applied)) reviewPage = undefined
}

// [TINIX] Only overlapping slots can depend on other proposed crops.
async function applySubset(selected: Row[]) {
  if (!canSelectCrops.value || needsDetailReview.value || !selected.length || !canApply()) return
  const ids = new Set(selected.map(row => row.id))
  const overlaps = overlappingFrames(widgets.dWidgets, ids)
  const partial = selected.length < safeCount.value
  let refresh = partial && overlaps
  const validatedMasks = new Map<string, ValidatedMask>()
  if (partial) {
    const request = new AbortController()
    let resumePreview: (() => void) | undefined
    try {
      // [TINIX] Compare the actual occluders with those in the verified batch proposal.
      const { global, layers } = copyReviewData({ global: canvas.dPage, layers: widgets.dWidgets })
      const byId = new Map(layers.map(layer => [layer.uuid, layer]))
      for (const row of selected) applyCrop(byId.get(row.id)!, row.crop!)
      const checks = selected.flatMap(row => {
        const frame = byId.get(row.id)!
        const plan = planFaceCropOcclusion(global, layers, frame, true)
        const key = plan.signature(compactSignature)
        return frameChecks.get(row.id)?.maskKey === key ? [] : [{ row, frame, plan, key }]
      })
      if (checks.length) {
        refresh = true
        subsetController = request
        validatingSubset.value = true
        subsetDone = new Promise(resolve => { resumePreview = resolve })
        previewController?.abort()
        // [TINIX] Validate two masks at a time on the same proposed layout before any crop is applied.
        for (let offset = 0; offset < checks.length; offset += 2) {
          const results = await Promise.all(checks.slice(offset, offset + 2).map(async ({ row, frame, plan, key }) => {
            const check = await guides.get(row.id)?.rebuild(canvas.dPage, layers, frame,
              AbortSignal.any([request.signal, AbortSignal.timeout(45000)]), plan)
            if (!check?.isClear(frame)) return
            if (row.detailBefore && row.region && row.detail &&
              detailLoss(check.detailVisibility(frame, row.region)) > detailLoss(row.detail) + 0.001) return
            return { id: row.id, key, mask: check.mask }
          }))
          if (request.signal.aborted || !canApply()) return
          if (results.some(result => !result)) {
            message.value = label('dependent')
            return
          }
          results.forEach(result => {
            if (result) validatedMasks.set(result.id, { key: result.key, mask: result.mask })
          })
        }
      }
    } catch (_) {
      if (!request.signal.aborted) {
        request.abort()
        message.value = label('interrupted')
      }
      return
    } finally {
      if (resumePreview) {
        if (subsetController === request) subsetDone = undefined
        resumePreview()
      }
      if (subsetController === request) {
        subsetController = undefined
        validatingSubset.value = false
      }
    }
  }
  message.value = ''
  applyRows(selected)
  snapshot = capture()
  guidesSnapshot = safeCount.value ? '' : snapshot
  if (refresh) await reviewCrops(validatedMasks)
  else if (overlaps) reviewPage = undefined
}

async function openFrame(id: string) {
  stopFocus?.()
  const frame = frames.value.find(frame => frame.uuid === id)
  if (!frame) return
  const current = capture()
  if (snapshot && current !== snapshot) {
    reset()
    message.value = label('changed')
    return
  }
  const cached = guides.get(id)
  let check: FaceCropCheck | undefined
  if (cached && guidesSnapshot === current) check = cached
  else if (cached) {
    const request = new AbortController()
    controller = request
    reviewing.value = true
    try {
      check = await cached.rebuild(canvas.dPage, widgets.dWidgets, frame, AbortSignal.any([request.signal, AbortSignal.timeout(45000)]))
    } catch (_) {
      if (!request.signal.aborted) message.value = label('interrupted')
    } finally {
      if (controller === request) {
        controller = undefined
        reviewing.value = false
      }
    }
    if (request.signal.aborted || !check || capture() !== current) return
  }
  open.value = false
  function enter() {
    if (check) faceCropHandoff.value = { id, check }
    enterPhotoEdit(id)
    void nextTick(() => { if (faceCropHandoff.value?.id === id) faceCropHandoff.value = undefined })
  }
  if (widgets.dActiveElement?.uuid === id) {
    enter()
    return
  }
  stopFocus = watch(() => widgets.dActiveElement?.uuid, current => {
    if (current !== id) return
    stopFocus?.()
    stopFocus = undefined
    enter()
  })
  widgets.selectWidget({ uuid: id })
}
</script>

<style scoped>
.batch-crop { color: #263345; font-size: 13px; }
.batch-crop button { padding: 4px 9px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: inherit; cursor: pointer; }
.batch-crop button:disabled { opacity: .5; cursor: default; }
.batch-crop-panel { width: min(520px, 100%); padding: 8px; border: 1px solid #dbe3eb; background: #fff; }
.batch-crop-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.batch-crop-panel p { margin: 7px 0 3px; }
.batch-crop-panel ul { list-style: none; padding: 0; margin: 4px 0 0; }
.batch-crop-panel li { display: grid; grid-template-columns: minmax(105px, 1fr) 1.6fr auto; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid #edf2f7; }
.batch-crop-panel li[data-crop-status="manual"], .batch-crop-panel li[data-crop-status="unavailable"] { color: #9a3412; }
.batch-crop-preview { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.batch-crop-preview img { display: block; width: 130px; height: auto; border-radius: 4px; border: 1px solid #dbe3eb; }
.batch-crop-preview span { display: block; }
.batch-crop-safe-area { grid-column: 1 / -1; }
.batch-crop-safe-area summary { cursor: pointer; width: fit-content; }
.batch-crop-detail-result { grid-column: 1 / -1; color: #166534; }
.batch-crop-detail-result.warning { color: #9a3412; font-weight: 600; }
</style>
