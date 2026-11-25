<!-- [TINIX] Review and preview repairs without saving a design or rendering all print sheets. -->
<template>
  <svg v-if="marked && showOverlay" class="page-cut-overlay" data-html2canvas-ignore="true" aria-hidden="true">
    <g :transform="`translate(${marked.left} ${marked.top}) scale(${1 / marked.scale})`">
      <path v-for="(points,i) in marked.row.paths" :key="i" :d="polygon(points)" vector-effect="non-scaling-stroke" />
    </g>
  </svg>
  <Teleport :to="toolbar">
    <div v-if="enabled && selectedUnit" class="cut-review-bar">
      <button type="button" @click="open(selectedUnit.id)">{{ label('title') }}</button>
      <button v-if="marked" type="button" :aria-pressed="showOverlay" @click="showOverlay = !showOverlay">{{ label('overlay') }}</button>
    </div>
  </Teleport>
  <el-dialog v-model="visible" append-to-body :z-index="22000" width="840px" :title="label('title')" :close-on-click-modal="false" @closed="closed">
    <div class="cut-tools">
      <strong>{{ unit?.name }}</strong>
      <label>{{ label('limit') }} <input v-model.number="limit" type="number" min="1" max="10" step=".1" /> mm</label>
      <el-button :loading="busy" :disabled="!validLimit || !unit || !!pending" @click="recheck">{{ label('check') }}</el-button>
      <el-button v-if="marked" @click="showCanvas">{{ label('showCanvas') }}</el-button>
    </div>
    <p v-if="error" role="alert">{{ label(error) }}</p>
    <template v-if="result">
      <p role="status">{{ label('result', { parts: result.row.parts.length, holes: result.row.smallHoles.length, joins: result.row.narrowJoins.length }) }}
        <span v-if="result.row.box"> · {{ mm(result.row.box.width) }} × {{ mm(result.row.box.height) }} mm</span>
      </p>
      <p v-if="result.outside.length" role="alert">{{ label('bleed', { edges: result.outside.map(edge => label(edge)).join(', ') }) }}</p>
      <p v-else-if="result.boxOutside">{{ label('padding') }}</p>
      <p v-if="result.boxMiss" role="alert">{{ label('boxMiss') }}</p>
      <p v-if="!result.row.parts.length" role="alert">{{ label('missing') }}</p>
      <div class="cut-stage">
        <svg ref="stage" :viewBox="`0 0 ${result.width * result.scale} ${result.height * result.scale}`" :aria-label="label('overlay')" :class="{ picking }" @click="pickPoint">
          <image :href="result.preview" :width="result.width * result.scale" :height="result.height * result.scale" />
          <rect :x="-result.left * result.scale" :y="-result.top * result.scale" :width="canvas.dPage.width * result.scale"
            :height="canvas.dPage.height * result.scale" class="trim-guide" vector-effect="non-scaling-stroke" />
          <path v-for="(points,i) in result.row.paths" :key="i" :d="polygon(points)" class="cut-path" vector-effect="non-scaling-stroke" />
          <circle v-for="(point,i) in result.row.narrowJoins" :key="'join'+i" :cx="point.x" :cy="point.y" :r="1.3" class="join-mark">
            <title>{{ label('joinMark') }}</title>
          </circle>
          <path v-for="(hole,i) in result.row.smallHoles" :key="'hole'+i" :d="polygon(hole.points)" class="hole-mark" vector-effect="non-scaling-stroke"><title>{{ mm(hole.openingMm) }} mm</title></path>
          <circle v-if="firstPoint" :cx="firstPoint[0]" :cy="firstPoint[1]" :r="1" class="join-mark" />
        </svg>
      </div>
      <template v-if="!pending">
        <div class="cut-tools">
          <label>{{ label('paper') }} <input v-model="paper" type="color" :disabled="busy" /></label>
          <el-button v-for="(hole,i) in result.row.smallHoles" :key="i" :disabled="busy || !editable" @click="fillHole(hole.points)">{{ label('fill', { n: i + 1, mm: mm(hole.openingMm) }) }}</el-button>
          <el-button v-if="result.row.parts.length > 1 || result.row.narrowJoins.length" :disabled="busy || !editable" @click="picking = !picking; firstPoint = undefined">{{ label(picking ? 'cancel' : 'bridge') }}</el-button>
          <el-button v-if="result.boxMiss && fitGroup" :disabled="busy || !editable" @click="fit">{{ label('fit') }}</el-button>
        </div>
        <p v-if="picking">{{ label('pickHelp') }}</p>
      </template>
      <div v-else class="cut-tools">
        <strong>{{ label('preview') }}</strong>
        <el-button @click="cancelPatch">{{ label('cancel') }}</el-button>
        <el-button type="primary" data-photo-history :disabled="busy || !editable" @click="apply">{{ label('apply') }}</el-button>
      </div>
      <p>{{ label('hint') }}</p>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCanvasStore, useControlStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history'
import { historyPatches } from '@/utils/widgets/diffLayouts'
import type { TdWidgetData } from '@/store/design/widget'
import type { Pt } from '../../../../service/src/tinix/cutPaths'
import { CUT_REVIEW_EVENT, checkCutPiece, paperPatch, pieceSignature, reviewPieceLayers, type PieceReview } from '@/utils/tinix/cut-piece-review'
import { printUnits } from '@/utils/tinix/collage-print'
import { DEFAULT_CUT_LIMIT_MM } from '@/utils/tinix/cut-readiness'

defineProps<{ toolbar: HTMLElement }>()
const { t: translate } = useI18n()
const label = (key: string, params: Record<string, string | number> = {}) => translate('tinix.ui.pieceReview.' + key, params)
const canvas = useCanvasStore()
const control = useControlStore()
const widgets = useWidgetStore()
const id = ref('')
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const result = shallowRef<PieceReview>()
const committed = shallowRef<PieceReview>()
const pending = shallowRef<TdWidgetData[]>()
const showOverlay = ref(false)
const picking = ref(false)
const firstPoint = ref<Pt>()
const stage = ref<SVGSVGElement>()
const paper = ref('#fffdf8')
const limit = ref(DEFAULT_CUT_LIMIT_MM)
let controller: AbortController | undefined
let patchBaseline = ''
const enabled = computed(() => !!(canvas.dPage as any).collage)
const validLimit = computed(() => Number.isFinite(limit.value) && limit.value >= 1 && limit.value <= 10)
const piece = computed(() => reviewPieceLayers(widgets.dWidgets, id.value))
const unit = computed(() => piece.value.unit)
const selectedUnit = computed(() => printUnits(widgets.dWidgets).find(u => u.raised && u.ids.includes(widgets.dActiveElement?.uuid || '')))
const editable = computed(() => piece.value.layers.length > 0 && !piece.value.layers.some(w => w.lock))
const signature = computed(() => pieceSignature(canvas.dPage, widgets.dWidgets, id.value))
const marked = computed(() => pending.value ? undefined : committed.value)
const roots = computed(() => piece.value.layers.filter(w => !piece.value.layers.some(layer => layer.uuid === w.parent)))
const focusLayer = computed(() => roots.value.find(w => w.uuid === id.value || w.isContainer) || roots.value.at(-1))
const fitGroup = computed(() => roots.value.length === 1 && roots.value[0].isContainer && !parseFloat(String(roots.value[0].rotate || 0)) ? roots.value[0] : undefined)
const mm = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const polygon = (points: Pt[]) => 'M' + points.map(p => p.join(' ')).join('L') + 'Z'

watch([signature, limit, () => canvas.dCurrentPage], () => {
  controller?.abort()
  pending.value = result.value = committed.value = undefined
  picking.value = false
  firstPoint.value = undefined
  busy.value = false
}, { flush: 'sync' })

async function run(layers?: TdWidgetData[]) {
  if (!unit.value || !validLimit.value) return false
  controller?.abort()
  const current = new AbortController()
  controller = current
  busy.value = true
  error.value = ''
  try {
    const review = await checkCutPiece(canvas.dPage, layers || widgets.dWidgets, id.value, limit.value, current.signal)
    if (current.signal.aborted) return false
    result.value = review
    if (!layers) committed.value = review
    return true
  } catch {
    if (!current.signal.aborted) error.value = 'error'
    return false
  } finally {
    if (controller === current) busy.value = false
  }
}
function recheck() { void run() }
function select() {
  const root = focusLayer.value
  if (root) widgets.selectWidget({ uuid: root.uuid })
}
function open(unitId: string) {
  id.value = unitId
  control.setShowMoveable(false)
  visible.value = true
  void run()
}
function showCanvas() {
  const crop = committed.value
  if (crop) {
    const board = document.getElementById('main')
    const maxZoom = board ? Math.min(board.clientWidth * 70 / crop.width, board.clientHeight * 70 / crop.height) : 100
    canvas.updateZoom(Math.max(canvas.dZoom, Math.min(120, Math.round(maxZoom))))
  }
  select()
  showOverlay.value = true
  visible.value = false
  requestAnimationFrame(() => {
    const root = focusLayer.value
    if (root) document.getElementById(root.uuid)?.scrollIntoView({ block: 'center', inline: 'center' })
  })
}
function onRequest(event: Event) {
  const detail = (event as CustomEvent<{ id: string; limit: number }>).detail
  if (!enabled.value || !detail?.id) return
  if (detail.limit >= 1 && detail.limit <= 10) limit.value = detail.limit
  open(detail.id)
}
onMounted(() => window.addEventListener(CUT_REVIEW_EVENT, onRequest))
onBeforeUnmount(() => {
  window.removeEventListener(CUT_REVIEW_EVENT, onRequest)
  controller?.abort()
})
function closed() {
  if (visible.value) return
  controller?.abort()
  cancelPatch()
}
function cancelPatch() {
  pending.value = undefined
  result.value = committed.value
  picking.value = false
  firstPoint.value = undefined
}
async function stagePatch(layers: TdWidgetData[]) {
  patchBaseline = JSON.stringify(widgets.dWidgets)
  pending.value = layers
  if (!await run(layers) && pending.value === layers) cancelPatch()
}
function patch(shape: Parameters<typeof paperPatch>[4]) {
  if (!result.value || !editable.value || !unit.value || !/^#[a-f\d]{6}$/i.test(paper.value)) return
  const layer = paperPatch(result.value, id.value, canvas.dPage.uuid, label('patchLayer'), shape, paper.value, limit.value)
  Object.assign(layer, { printName: unit.value.name })
  const layers = widgets.dWidgets.slice()
  const first = layers.findIndex(w => unit.value!.ids.includes(w.uuid))
  layers.splice(first, 0, layer)
  void stagePatch(layers)
}
function fillHole(points: Pt[]) { patch({ type: 'hole', points }) }
function pickPoint(event: MouseEvent) {
  const matrix = stage.value?.getScreenCTM()
  if (!picking.value || !matrix || !result.value) return
  const p = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
  const context = document.createElement('canvas').getContext('2d')
  if (!context?.isPointInPath(new Path2D(result.value.row.paths.map(polygon).join('')), p.x, p.y, 'evenodd')) {
    error.value = 'pickInside'
    return
  }
  error.value = ''
  const point: Pt = [p.x,p.y]
  if (!firstPoint.value) {
    firstPoint.value = point
    return
  }
  const start = firstPoint.value
  picking.value = false
  firstPoint.value = undefined
  if (Math.hypot(start[0]-p.x,start[1]-p.y) >= .2) patch({ type: 'bridge', points: [start,point] })
}
function fit() {
  const group = fitGroup.value
  const box = result.value?.visible
  if (!group || !box || !Number.isFinite(box.x)) return
  const width = box.right - box.x
  const height = box.bottom - box.y
  void stagePatch(widgets.dWidgets.map(w => w === group ? {
    ...w, left: box.x, top: box.y, width, height, record: { ...w.record, width, height },
  } : w))
}
async function apply() {
  if (!pending.value || busy.value || !editable.value) return
  if (JSON.stringify(widgets.dWidgets) !== patchBaseline) {
    cancelPatch()
    error.value = 'changed'
    return
  }
  const layers = pending.value
  const review = result.value
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  // A selected group interprets a changed width against its old record as a user resize.
  widgets.selectWidget({ uuid: '-1' })
  widgets.setDWidgets(layers)
  const change = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (change.patches.length) useHistoryStore().changeHistory(change)
  canvas.reChangeCanvas()
  await nextTick()
  pending.value = undefined
  result.value = committed.value = review
}
</script>

<style scoped>
.cut-review-bar, .cut-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.cut-review-bar { padding: 5px 10px; background: #f7f8fb; }
.cut-review-bar button { border: 1px solid #ccd2dc; border-radius: 4px; background: white; padding: 3px 7px; }
.cut-tools label { display: inline-flex; gap: 6px; align-items: center; }
.cut-tools input[type=number] { width: 66px; }
.cut-stage { background: #29313d; display: flex; justify-content: center; margin: 12px 0; }
.cut-stage svg { width: 100%; height: 44vh; }
.cut-stage svg.picking { cursor: crosshair; }
.page-cut-overlay { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10002; pointer-events: none; }
.cut-path, .page-cut-overlay path { stroke: #1bece5; stroke-width: 1.6px; fill: none; }
.trim-guide { fill: none; stroke: #fff; stroke-dasharray: 4 3; }
.hole-mark { stroke: #ffce46; stroke-width: 2px; fill: #ffce4670; }
.join-mark { fill: #ffce46; stroke: #372e1b; stroke-width: .25; }
</style>
