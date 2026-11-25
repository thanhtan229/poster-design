<!-- [TINIX] Trace the photo opening on the original material piece, independently of its page pose. -->
<template>
  <section class="material-opening-editor" :aria-label="t(prefix + 'traceOpening')">
    <div class="opening-toolbar">
      <span>{{ t(prefix + editorHint) }}</span>
      <!-- [TINIX] Work on the existing contour at a larger scale without changing the stored coordinates. -->
      <label>{{ t(prefix + 'openingZoom') }}
        <select v-model.number="zoom" class="material-opening-zoom" :disabled="disabled">
          <option v-for="level in [1, 2, 3, 4]" :key="level" :value="level">{{ level * 100 }}%</option>
        </select>
      </label>
      <label v-if="points.length >= 3">
        <input v-model="editingPoints" type="checkbox" :disabled="disabled" />
        {{ t(prefix + 'openingEditPoints') }}
      </label>
      <label v-if="editingPoints">
        <input v-model="dragSegment" class="material-opening-segment" type="checkbox" :disabled="disabled || selectRange" />
        {{ t(prefix + 'openingDragSegment') }}
      </label>
      <!-- [TINIX] Pick a contour range and guard artwork locally while reviewing it. -->
      <template v-if="editingPoints">
        <label><input v-model="selectRange" class="material-opening-range" type="checkbox" :disabled="disabled" />{{ t(prefix + 'openingSelectRange') }}</label>
        <label v-if="selectRange">
          <input v-model="normalDrag" class="material-opening-normal" type="checkbox" :disabled="disabled" />
          {{ t(prefix + 'openingDragNormal') }}
        </label>
        <button v-if="range.length" type="button" class="material-opening-other-side" :disabled="disabled" @click="otherSide = !otherSide">
          {{ t(prefix + 'openingOtherSide') }}
        </button>
        <!-- [TINIX] Apply only to the highlighted contour and let the user review before committing the opening. -->
        <button v-if="range.length >= 3" type="button" class="material-opening-smooth" :disabled="disabled || locking" @click="smoothRange">
          {{ t(prefix + 'openingSmoothRange') }}
        </button>
        <!-- [TINIX] The original piece supplies the color; the proposal stays temporary until applied. -->
        <template v-if="range.length >= 3">
          <button type="button" class="material-opening-paper" :aria-pressed="samplingPaper" :disabled="disabled || loadingPaper || locking"
            @click="startPaperSample">{{ t(prefix + 'openingSamplePaper') }}</button>
          <button v-if="paperPreview" type="button" class="material-opening-paper-apply" :disabled="disabled" @click="applyPaperPreview">
            {{ t(prefix + 'openingApplyPaper') }}
          </button>
          <button v-if="paperPreview" type="button" :disabled="disabled" @click="paperPreview = undefined">{{ t(prefix + 'openingCancelPaper') }}</button>
          <span v-if="paperMessage" role="status">{{ t(prefix + paperMessage) }}</span>
        </template>
        <button v-if="endpoints.length" type="button" class="material-opening-clear-range" :disabled="disabled" @click="resetRange">
          {{ t(prefix + 'openingClearRange') }}
        </button>
        <button type="button" class="material-opening-lock" :aria-pressed="locking" :disabled="disabled" @click="locking = !locking">
          {{ t(prefix + 'openingLock') }}
        </button>
        <button v-if="locks.length" type="button" :disabled="disabled" @click="locks = []">{{ t(prefix + 'openingClearLocks') }}</button>
      </template>
      <label v-if="editingPoints && dragSegment && !selectRange">{{ t(prefix + 'openingSegmentLength') }}
        <select v-model.number="segmentRadius" class="material-opening-segment-length" :disabled="disabled">
          <option v-for="radius in [4, 8, 16]" :key="radius" :value="radius">{{ radius * 2 }} px</option>
        </select>
      </label>
      <button type="button" :disabled="disabled || !(editingPoints ? pointHistory.length : points.length)" @click="undo">
        {{ t(prefix + (editingPoints ? (pointHistory[pointHistory.length - 1]?.label ?? 'openingUndoMove') : 'openingUndo')) }}
      </button>
      <button type="button" :disabled="disabled || !points.length" @click="reset">{{ t(prefix + 'openingReset') }}</button>
      <button type="button" class="material-opening-use" :disabled="disabled || !canUse" @click="emit('change', points)">
        {{ t(prefix + 'openingUse') }}
      </button>
      <button v-if="opening" type="button" :disabled="disabled" @click="emit('change', undefined)">{{ t(prefix + 'openingClear') }}</button>
      <button type="button" :disabled="disabled" @click="emit('close')">{{ t(prefix + 'finishArea') }}</button>
    </div>
    <div ref="viewport" class="material-opening-viewport" :style="{ '--opening-zoom': zoom }">
    <svg class="material-opening-map" :class="{ 'opening-edit-points': editingPoints }" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height"
      @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel">
      <defs><clipPath :id="clipId"><path :d="previewOutline" clip-rule="evenodd" /></clipPath></defs>
      <image :href="source" :width="width" :height="height" />
      <image v-if="canUse" :href="placeholder" :width="width" :height="height" :clip-path="`url(#${clipId})`" opacity=".64" />
      <path :d="outline" class="opening-outline" />
      <path v-if="range.length" :d="rangePath" class="opening-range-outline" />
      <path v-if="paperPreview" :d="paperPath" class="opening-paper-outline" />
      <rect v-for="(lock, index) in visibleLocks" :key="index" class="opening-lock-box"
        :x="lock.left * width" :y="lock.top * height" :width="(lock.right - lock.left) * width" :height="(lock.bottom - lock.top) * height" />
      <g v-if="editingPoints" class="opening-handles">
        <circle v-for="(point, index) in points" :key="index" :data-point-index="index"
          :cx="point.x * width" :cy="point.y * height" :r="2.4 / zoom"
          :class="{ 'opening-selected-point': index === selectedPoint, 'opening-selected-segment': segmentIndices.has(index) || rangeSet.has(index),
            'opening-endpoint': endpoints.includes(index), 'opening-fixed-point': lockedPoints.has(index) }" />
      </g>
      <circle v-else-if="points.length" :cx="points[0].x * width" :cy="points[0].y * height" r="2.5" class="opening-first" />
    </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pieceOpeningPath, validPieceOpening, type PieceOpening } from '@/utils/tinix/material-sheet'
import { photoPlaceholder } from '@/utils/tinix/template-sanitize'
import { openingCrossesLock, openingLockedPoints, openingNormal, openingRange, openingRangeTaper, smoothOpeningRange, type OpeningLock } from '@/utils/tinix/material-opening-range'
import { cutoutCanvas, readCutoutImage } from '@/utils/tinix/cutout-workspace'
import { paperPixel, suggestOpeningPaperEdge } from '@/utils/tinix/material-opening-paper-edge'

const props = defineProps<{ source: string; width: number; height: number; opening?: PieceOpening; disabled: boolean }>()
const emit = defineEmits<{ change: [opening: PieceOpening | undefined]; close: [] }>()
const { t } = useI18n()
const prefix = 'tinix.ui.materialSheet.'
const clipId = useId()
const points = ref<PieceOpening>([])
const zoom = ref(1)
const viewport = ref<HTMLElement>()
const editingPoints = ref(false)
const dragSegment = ref(false)
const selectRange = ref(false)
const normalDrag = ref(false) // [TINIX]
const endpoints = ref<number[]>([])
const otherSide = ref(false)
const locking = ref(false)
const locks = ref<OpeningLock[]>([])
const pendingLock = ref<OpeningLock>()
const segmentRadius = ref(8)
const selectedPoint = ref(-1)
const segmentIndices = ref(new Set<number>())
type Point = PieceOpening[number]
type PointEdit = { index: number; before: Point }
type WeightedEdit = PointEdit & { weight: number; normal?: Point }
const pointHistory = ref<Array<{ edits: PointEdit[]; label?: 'openingUndoSmooth' | 'openingUndoPaper' }>>([])
const samplingPaper = ref(false)
const loadingPaper = ref(false)
const paperPreview = shallowRef<PieceOpening>()
const paperMessage = ref('')
let paperImage: { source: string; pixels: ImageData } | undefined
const range = ref<number[]>([])
watch([() => endpoints.value.join(','), otherSide], () => {
  range.value = endpoints.value.length === 2 && points.value.length >= 3
    ? openingRange(points.value, endpoints.value[0], endpoints.value[1], props.width, props.height, otherSide.value) : []
})
const rangeSet = computed(() => new Set(range.value))
const rangePath = computed(() => range.value.map((index, offset) => {
  const point = points.value[index]
  return (offset ? 'L' : 'M') + point.x * props.width + ' ' + point.y * props.height
}).join(''))
const paperPath = computed(() => range.value.map((index, offset) => {
  const point = paperPreview.value?.[index]
  return point ? (offset ? 'L' : 'M') + point.x * props.width + ' ' + point.y * props.height : ''
}).join(''))
const lockedPoints = computed(() => openingLockedPoints(points.value, locks.value))
const visibleLocks = computed(() => pendingLock.value ? [...locks.value, pendingLock.value] : locks.value)
const editorHint = computed(() => {
  if (!editingPoints.value) return 'openingHint'
  if (samplingPaper.value) return 'openingSamplePaperHint'
  if (locking.value) return 'openingLockHint'
  if (selectRange.value) {
    if (!range.value.length) return 'openingRangePickHint'
    return normalDrag.value ? 'openingNormalHint' : 'openingRangeDragHint'
  }
  return dragSegment.value ? 'openingSegmentHint' : 'openingPointHint'
})
function resetRange() {
  endpoints.value = []
  otherSide.value = false
}
watch([range, locking, () => locks.value.length, () => props.source, () => points.value.slice()], () => {
  samplingPaper.value = false
  paperPreview.value = undefined
  paperMessage.value = ''
})
watch(selectRange, resetRange)
watch(editingPoints, enabled => {
  if (!enabled) {
    resetRange()
    selectRange.value = false
    locking.value = false
  }
})
watch(editingPoints, enabled => { if (!enabled) pointHistory.value = [] })
watch([editingPoints, dragSegment, segmentRadius], () => { segmentIndices.value = new Set() })
watch(() => props.opening, opening => {
  points.value = [...(opening ?? [])]
  editingPoints.value = Boolean(opening)
  selectedPoint.value = -1
  pointHistory.value = []
  resetRange()
  locks.value = []
}, { immediate: true })
watch(zoom, async () => {
  const scroller = viewport.value
  const svg = scroller?.querySelector('svg')
  if (!scroller || !svg) return
  const old = svg.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  const point = points.value[selectedPoint.value] ?? {
    x: (view.left + view.width / 2 - old.left) / old.width,
    y: (view.top + view.height / 2 - old.top) / old.height,
  }
  await nextTick()
  const current = svg.getBoundingClientRect()
  scroller.scrollLeft += (current.left + point.x * current.width - view.left - view.width / 2) * scroller.offsetWidth / view.width
  scroller.scrollTop += (current.top + point.y * current.height - view.top - view.height / 2) * scroller.offsetHeight / view.height
})
const canUse = computed(() => validPieceOpening(points.value))
const outline = computed(() => pieceOpeningPath(points.value, props.width, props.height))
const previewOutline = computed(() => pieceOpeningPath(paperPreview.value ?? points.value, props.width, props.height))
const placeholder = computed(() => photoPlaceholder({ width: props.width, height: props.height }))
let gesture: ({ pointer: number } & ({ kind: 'draw'; startIndex: number } | { kind: 'lock'; from: Point } |
  { kind: 'adjust'; from: Point; edits: WeightedEdit[]; before: PieceOpening; normal?: Point })) | undefined

const clamp = (value: number) => Math.max(0, Math.min(1, value))
function pointerPoint(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const transform = svg.getScreenCTM()
  if (!transform) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
  return { x: point.x / props.width, y: point.y / props.height }
}

function append(point: Point) {
  if (points.value.length >= 1024) return
  const next = { x: clamp(point.x), y: clamp(point.y) }
  const last = points.value[points.value.length - 1]
  if (!last || Math.hypot((next.x - last.x) * props.width, (next.y - last.y) * props.height) >= 1.5) points.value.push(next)
}

// [TINIX] Select adjacent points by distance along the contour, not distance across the image.
function editsAround(index: number): WeightedEdit[] {
  const contour = points.value
  const anchor = { index, before: contour[index], weight: 1 }
  if (!dragSegment.value) return [anchor]
  const edits = new Map([[index, anchor]])
  for (const direction of [-1, 1]) {
    let distance = 0
    let previous = index
    for (let offset = 1; offset < contour.length; offset++) {
      const current = (index + direction * offset + contour.length) % contour.length
      const point = contour[current]
      const last = contour[previous]
      distance += Math.hypot((point.x - last.x) * props.width, (point.y - last.y) * props.height)
      if (distance >= segmentRadius.value) break
      const ratio = distance / segmentRadius.value
      const weight = 1 - ratio * ratio * (3 - 2 * ratio)
      if (weight > (edits.get(current)?.weight ?? 0)) edits.set(current, { index: current, before: point, weight })
      previous = current
    }
  }
  return [...edits.values()]
}

function start(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || gesture) return
  const point = pointerPoint(event)
  if (!point) return
  if (samplingPaper.value) {
    event.preventDefault()
    void sampleAndSuggest(point)
    return
  }
  paperPreview.value = undefined
  const svg = event.currentTarget as SVGSVGElement
  if (editingPoints.value && locking.value) {
    gesture = { pointer: event.pointerId, kind: 'lock', from: point }
  } else if (editingPoints.value) {
    const matrix = svg.getScreenCTM()!
    let distance = 9
    let index = -1
    points.value.forEach((candidate, i) => {
      const screen = new DOMPoint(candidate.x * props.width, candidate.y * props.height).matrixTransform(matrix)
      const delta = Math.hypot(screen.x - event.clientX, screen.y - event.clientY)
      if (delta < distance) { distance = delta; index = i }
    })
    if (index < 0) return
    selectedPoint.value = index
    if (selectRange.value && endpoints.value.length < 2) {
      if (!endpoints.value.includes(index)) endpoints.value.push(index)
      return
    }
    if (selectRange.value && !rangeSet.value.has(index)) return
    const alongNormals = selectRange.value && normalDrag.value
    const taper = alongNormals ? openingRangeTaper(points.value, range.value, props.width, props.height) : undefined
    const proposals = selectRange.value
      ? range.value.map((i, order) => ({
        index: i, before: points.value[i],
        weight: taper?.[order] ?? (order === 0 || order === range.value.length - 1 ? .5 : 1),
        normal: alongNormals ? openingNormal(points.value, i, props.width, props.height) : undefined,
      }))
      : editsAround(index)
    const edits = proposals.filter(edit => edit.weight > 0 && !lockedPoints.value.has(edit.index))
    if (!edits.length) return
    segmentIndices.value = new Set(edits.map(edit => edit.index))
    gesture = { pointer: event.pointerId, kind: 'adjust', edits, from: point, before: [...points.value],
      normal: alongNormals ? openingNormal(points.value, index, props.width, props.height) : undefined }
  } else {
    gesture = { pointer: event.pointerId, kind: 'draw', startIndex: points.value.length }
    append(point)
  }
  event.preventDefault()
  svg.setPointerCapture(event.pointerId)
}

function move(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId) return
  const point = pointerPoint(event)
  if (!point) return
  if (gesture.kind === 'draw') append(point)
  else if (gesture.kind === 'lock') {
    const from = gesture.from
    pendingLock.value = { left: clamp(Math.min(from.x, point.x)), top: clamp(Math.min(from.y, point.y)),
      right: clamp(Math.max(from.x, point.x)), bottom: clamp(Math.max(from.y, point.y)) }
  } else {
    const dx = point.x - gesture.from.x
    const dy = point.y - gesture.from.y
    const moved = [...gesture.before]
    const distance = gesture.normal ? dx * props.width * gesture.normal.x + dy * props.height * gesture.normal.y : 0
    for (const { index, before, weight, normal } of gesture.edits) {
      const offsetX = normal ? distance * normal.x / props.width : dx
      const offsetY = normal ? distance * normal.y / props.height : dy
      moved[index] = { x: clamp(before.x + offsetX * weight), y: clamp(before.y + offsetY * weight) }
    }
    // Adjacent locked edges remain unchanged, and new edits cannot sweep over the protected artwork.
    if (!locks.value.length || !openingCrossesLock(gesture.before, moved, locks.value)) points.value = moved
  }
}

function finish(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId) return
  move(event)
  if (gesture.kind === 'adjust') {
    const changes = gesture.edits.filter(({ index, before }) => points.value[index].x !== before.x || points.value[index].y !== before.y)
    if (changes.length) pointHistory.value.push({ edits: changes })
  }
  if (gesture.kind === 'lock' && pendingLock.value) {
    const lock = pendingLock.value
    if ((lock.right - lock.left) * props.width >= 2 && (lock.bottom - lock.top) * props.height >= 2) {
      locks.value.push(lock)
      locking.value = false
    }
    pendingLock.value = undefined
  }
  gesture = undefined
}

function cancel(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId) return
  if (gesture.kind === 'draw') points.value.splice(gesture.startIndex)
  else if (gesture.kind === 'adjust') restorePoints(gesture.edits)
  else pendingLock.value = undefined
  gesture = undefined
}

function undo() {
  if (!editingPoints.value) { points.value.pop(); return }
  restorePoints(pointHistory.value.pop()?.edits ?? [])
}

function smoothRange() {
  if (gesture) return
  applyContour(smoothOpeningRange(points.value, range.value, props.width, props.height, locks.value), 'openingUndoSmooth')
}

function startPaperSample() {
  paperPreview.value = undefined
  paperMessage.value = ''
  samplingPaper.value = true
}

async function sampleAndSuggest(point: Point) {
  if (loadingPaper.value) return
  samplingPaper.value = false
  loadingPaper.value = true
  const source = props.source
  const before = points.value
  const selection = range.value
  const locksBefore = [...locks.value]
  try {
    if (paperImage?.source !== source) {
      const image = await readCutoutImage(source)
      const { context } = cutoutCanvas(props.width, props.height)
      context.drawImage(image, 0, 0, props.width, props.height)
      paperImage = { source, pixels: context.getImageData(0, 0, props.width, props.height) }
    }
    if (props.source !== source || before !== points.value || selection !== range.value ||
      locksBefore.length !== locks.value.length || locksBefore.some((lock, index) => lock !== locks.value[index])) return
    const pixels = paperImage.pixels
    const color = paperPixel(pixels, point.x * props.width, point.y * props.height)
    const proposal = color && suggestOpeningPaperEdge(pixels, before, selection, locksBefore, color)
    if (proposal && proposal.some((p, index) => p !== before[index]) && validPieceOpening(proposal)) paperPreview.value = proposal
    else paperMessage.value = 'openingNoPaperEdge'
  } catch {
    paperMessage.value = 'openingNoPaperEdge'
  } finally {
    loadingPaper.value = false
  }
}

function applyPaperPreview() {
  if (!paperPreview.value) return
  applyContour(paperPreview.value, 'openingUndoPaper')
  paperPreview.value = undefined
}

function applyContour(next: PieceOpening, label: 'openingUndoSmooth' | 'openingUndoPaper') {
  const before = points.value
  const edits = range.value.flatMap(index => before[index] === next[index] ? [] : [{ index, before: before[index] }])
  if (!edits.length || !validPieceOpening(next)) return
  points.value = next
  pointHistory.value.push({ edits, label })
}

function restorePoints(edits: PointEdit[]) {
  for (const { index, before } of edits) points.value[index] = before
}

function reset() {
  points.value = []
  editingPoints.value = false
  selectedPoint.value = -1
  pointHistory.value = []
  resetRange()
  locks.value = []
}
</script>

<style scoped>
.material-opening-editor { margin: 8px 0; }
.opening-toolbar { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; }
.material-opening-viewport { max-height: min(47vh, 480px); overflow: auto; margin: 8px auto; background: #eef0f3; }
.material-opening-map { display: block; height: calc(var(--opening-zoom) * min(42vh, 430px)); width: auto; margin: auto; background: #dfe3e8; touch-action: none; cursor: crosshair; }
.opening-edit-points { cursor: grab; }
.opening-handles { fill: #fff; stroke: #087351; stroke-width: .8; pointer-events: none; }
.opening-handles .opening-selected-segment { fill: #bce5d4; }
.opening-handles .opening-selected-point { fill: #ffe185; stroke: #794b00; }
.opening-handles .opening-endpoint { fill: #106757; stroke: #fff; }
.opening-handles .opening-fixed-point { fill: #f9c49d; stroke: #961f22; }
.opening-range-outline { fill: none; stroke: #0878a0; stroke-width: 3; vector-effect: non-scaling-stroke; pointer-events: none; }
.opening-paper-outline { fill: none; stroke: #aa5200; stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
.opening-lock-box { fill: #e1a36a38; stroke: #9c4a2e; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
.opening-outline { fill: none; stroke: #087351; stroke-width: 1.6; vector-effect: non-scaling-stroke; pointer-events: none; }
.opening-first { fill: #087351; stroke: white; pointer-events: none; }
</style>
