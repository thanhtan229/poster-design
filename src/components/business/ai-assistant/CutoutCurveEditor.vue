<!-- [TINIX] A full-resolution Bézier mask and local clone tool. -->
<template>
  <section class="curve-editor" :inert="busy">
    <div class="controls">
      <el-select v-model="mode" :aria-label="$t('tinix.ui.cutoutTools.action')" @change="changeMode">
        <el-option v-for="option in modes" :key="option" :value="option" :label="$t('tinix.ui.cutoutTools.' + option)" />
      </el-select>
      <el-select v-model="zoom" :aria-label="$t('tinix.ui.cutoutTools.zoom')">
        <el-option :value="0" :label="$t('tinix.ui.cutoutTools.fit')" />
        <el-option v-for="value in [0.5, 1, 2, 4]" :key="value" :value="value" :label="value * 100 + '%'" />
      </el-select>
      <el-button v-if="mode === 'clone'" @click="picking = 'donor'">{{ $t('tinix.ui.cutoutTools.pickDonor') }}</el-button>
      <el-button v-if="mode === 'clone'" :disabled="!donor" @click="picking = 'target'">{{ $t('tinix.ui.cutoutTools.pickTarget') }}</el-button>
      <el-button :disabled="!nodes.length" @click="nodes.pop()">{{ $t('tinix.ui.cutoutTools.removePoint') }}</el-button>
      <el-button :disabled="!nodes.length" @click="nodes = []">{{ $t('tinix.ui.cutoutTools.clearPath') }}</el-button>
      <el-button :disabled="!canApply" @click="commit">{{ $t('tinix.ui.cutoutTools.applyPath') }}</el-button>
      <el-button :disabled="!undo" @click="undoEdit">{{ $t('tinix.ui.cutoutTools.undo') }}</el-button>
      <el-button :disabled="!ready || (persist && nodes.length > 0 && !canApply)" type="primary" @click="finish">{{ $t('business.cutout.applyEdit') }}</el-button>
    </div>
    <div v-if="persist && edits.length" class="controls saved-paths">
      <el-select :model-value="selected" :aria-label="$t('tinix.ui.cutoutTools.savedPaths')" @change="selectEdit">
        <el-option :value="-1" :label="$t('tinix.ui.cutoutTools.newPath')" />
        <el-option v-for="(edit, i) in edits" :key="i" :value="i" :label="(i + 1) + ' · ' + $t('tinix.ui.cutoutTools.' + edit.mode)" />
      </el-select>
      <el-button :disabled="selected < 0" @click="deleteEdit">{{ $t('tinix.ui.cutoutTools.deleteSavedPath') }}</el-button>
    </div>
    <p role="status">{{ $t('tinix.ui.cutoutTools.' + instruction) }}</p>
    <div class="panes">
      <section v-if="raw">
        <h4>{{ $t('tinix.ui.cutoutTools.original') }}</h4>
        <div class="viewport" @scroll="syncScroll($event, resultViewport)">
          <div class="picture" :style="pictureStyle"><img :src="raw" alt="" draggable="false" /></div>
        </div>
      </section>
      <section>
        <h4>{{ $t('tinix.ui.cutoutTools.result') }}</h4>
        <div ref="resultViewport" class="viewport" @scroll="syncSource($event)">
          <div v-if="ready" class="picture" :style="pictureStyle">
            <img :src="preview" alt="" draggable="false" />
            <svg ref="overlay" :viewBox="`0 0 ${width} ${height}`" @pointerdown="start" @pointermove="move" @pointerup="drag = undefined" @pointercancel="drag = undefined">
              <path :d="curvePath(nodes, nodes.length > 2)" fill="#2e8bff22" stroke="#1762cf" stroke-width="2" vector-effect="non-scaling-stroke" />
              <g v-for="(node, i) in nodes" :key="i">
                <template v-if="node.handle">
                  <line :x1="node.x - node.handle.x" :y1="node.y - node.handle.y" :x2="node.x + node.handle.x" :y2="node.y + node.handle.y" stroke="#1762cf" vector-effect="non-scaling-stroke" />
                  <circle :cx="node.x + node.handle.x" :cy="node.y + node.handle.y" :r="marker" fill="#1762cf" @pointerdown.stop="grab($event, i, 'handle')" />
                </template>
                <circle :cx="node.x" :cy="node.y" :r="marker" fill="white" stroke="#1762cf" vector-effect="non-scaling-stroke" @pointerdown.stop="grab($event, i, 'anchor')" />
              </g>
              <circle v-if="mode === 'clone' && donor" :cx="donor.x" :cy="donor.y" :r="marker * 1.4" fill="#23994d" stroke="white" vector-effect="non-scaling-stroke" />
              <circle v-if="mode === 'clone' && target" :cx="target.x" :cy="target.y" :r="marker * 1.4" fill="#bd6414" stroke="white" vector-effect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { ElOption, ElSelect } from 'element-plus'
import { applyCurve, curvePath, cutoutCanvas, readCutoutImage, type CurveEdit, type CurveMode, type CurveNode, type Point } from '@/utils/tinix/cutout-workspace'

const props = defineProps<{ raw?: string; result: string; persist?: boolean; savedEdits?: CurveEdit[]; busy?: boolean }>()
const emit = defineEmits<{ (e: 'done', result: string, edits: CurveEdit[]): void }>()
const sourceReady = ref(false)
const modes = computed<CurveMode[]>(() => sourceReady.value ? ['restore', 'erase', 'clone'] : ['erase', 'clone'])
const mode = ref<CurveMode>('erase')
const zoom = ref(0)
const width = ref(1); const height = ref(1)
const nodes = ref<CurveNode[]>([])
const overlay = ref<SVGSVGElement>()
const resultViewport = ref<HTMLElement>()
const preview = ref('')
const ready = ref(false); const failed = ref(false); const invalidDonor = ref(false); const empty = ref(false)
const donor = ref<Point>(); const target = ref<Point>(); const picking = ref<'donor' | 'target'>()
const edits = shallowRef<CurveEdit[]>([])
const undo = shallowRef<CurveEdit[]>()
const selected = ref(-1)
let rawImage: HTMLImageElement; let baseImage: HTMLImageElement; let context: CanvasRenderingContext2D
let drag: { index: number; part: 'anchor' | 'handle' } | undefined
const canApply = computed(() => ready.value && nodes.value.length >= 3 && (mode.value !== 'clone' || !!(donor.value && target.value)))
const marker = computed(() => 3 / (zoom.value || Math.min(1, 450 / width.value)))
const pictureStyle = computed(() => ({
  width: zoom.value ? width.value * zoom.value + 'px' : `min(100%, ${width.value}px, ${52 * width.value / height.value}vh)`,
  aspectRatio: `${width.value} / ${height.value}`,
}))
const instruction = computed(() => failed.value ? 'readError' : empty.value ? 'emptyMask' : invalidDonor.value ? 'invalidDonor' : picking.value ? picking.value === 'donor' ? 'donorHint' : 'targetHint' : 'curveHint')
function changeMode(value: CurveMode) {
  picking.value = value === 'clone' && !donor.value ? 'donor' : undefined
  invalidDonor.value = false
}

onMounted(async () => {
  try {
    const source = props.raw
    const [raw, cutout] = await Promise.all([source && readCutoutImage(source), readCutoutImage(props.result)])
    baseImage = cutout
    if (!sourceReady.value) rawImage = raw || cutout
    if (raw && props.raw === source) sourceReady.value = true
    width.value = cutout.naturalWidth
    height.value = cutout.naturalHeight
    if (width.value * height.value > 32_000_000) throw new Error('Image too large')
    context = cutoutCanvas(width.value, height.value).context
    edits.value = props.savedEdits || []
    replay()
    ready.value = true
  } catch {
    failed.value = true
  }
})

watch(() => props.raw, async (source) => {
  if (!source) return
  try {
    const image = await readCutoutImage(source)
    if (props.raw === source) {
      rawImage = image
      sourceReady.value = true
    }
  } catch {
    failed.value = true
  }
})

function refresh() { preview.value = context.canvas.toDataURL('image/png') }
function replay(limit = edits.value.length) {
  context.clearRect(0, 0, width.value, height.value)
  context.drawImage(baseImage, 0, 0)
  for (const edit of edits.value.slice(0, limit)) {
    const { donor: a, target: b } = edit
    applyCurve(context, rawImage, edit.nodes, edit.mode, a && b ? { x: b.x - a.x, y: b.y - a.y } : undefined)
  }
  refresh()
}
function selectEdit(index: number) {
  const edit = edits.value[index]
  selected.value = index
  nodes.value = edit ? edit.nodes.map(node => ({ ...node, handle: node.handle && { ...node.handle } })) : []
  donor.value = edit?.donor
  target.value = edit?.target
  if (edit) mode.value = edit.mode
  picking.value = props.persist && !edit && mode.value === 'clone' ? 'donor' : undefined
  invalidDonor.value = false
  replay(index < 0 ? edits.value.length : index + 1)
}
function position(event: PointerEvent): Point | undefined {
  const matrix = overlay.value?.getScreenCTM()
  if (!matrix) return
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: Math.min(width.value - 1, Math.max(0, p.x)), y: Math.min(height.value - 1, Math.max(0, p.y)) }
}
function start(event: PointerEvent) {
  if (event.button !== 0) return
  const p = position(event)
  if (!p) return
  if (picking.value === 'donor') {
    if (selected.value >= 0) replay(selected.value)
    invalidDonor.value = context.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data[3] < 128
    if (invalidDonor.value) return
    donor.value = p
    picking.value = 'target'
    return
  }
  if (picking.value === 'target') {
    target.value = p
    picking.value = undefined
    return
  }
  nodes.value.push(p)
  grab(event, nodes.value.length - 1, 'handle')
}
function grab(event: PointerEvent, index: number, part: 'anchor' | 'handle') {
  if (event.button !== 0) return
  if (picking.value) { start(event); return }
  drag = { index, part }
  overlay.value?.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!drag) return
  const p = position(event)
  const node = nodes.value[drag.index]
  if (!p || !node) return
  if (drag.part === 'anchor') Object.assign(node, p)
  else node.handle = { x: p.x - node.x, y: p.y - node.y }
}
function commit() {
  if (!canApply.value) return
  undo.value = edits.value
  const edit = { nodes: nodes.value, mode: mode.value, donor: donor.value, target: target.value }
  edits.value = selected.value < 0 ? [...edits.value, edit] : edits.value.map((old, i) => i === selected.value ? edit : old)
  empty.value = false
  selectEdit(-1)
  // Keep a selected clone offset between consecutive regions in the standalone editor.
  if (!props.persist) { donor.value = edit.donor; target.value = edit.target }
}
function deleteEdit() {
  undo.value = edits.value
  edits.value = edits.value.filter((_, i) => i !== selected.value)
  selectEdit(-1)
}
function undoEdit() {
  if (!undo.value) return
  edits.value = undo.value
  undo.value = undefined
  empty.value = false
  selectEdit(-1)
}
function finish() {
  if (canApply.value) commit()
  const data = context.getImageData(0, 0, width.value, height.value).data
  if (!data.some((alpha, i) => i % 4 === 3 && alpha > 8)) {
    empty.value = true
    return
  }
  emit('done', preview.value, edits.value)
}
function syncScroll(event: Event, other?: HTMLElement) {
  const here = event.currentTarget as HTMLElement
  if (other && (other.scrollLeft !== here.scrollLeft || other.scrollTop !== here.scrollTop)) other.scrollTo(here.scrollLeft, here.scrollTop)
}
function syncSource(event: Event) {
  const source = resultViewport.value?.closest('.panes')?.querySelector<HTMLElement>('.viewport')
  syncScroll(event, source || undefined)
}
</script>

<style scoped>
.curve-editor { padding: 12px 20px 20px; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.controls .el-select { width: 150px; }
.controls .el-button { margin-left: 0; }
.saved-paths { margin-top: 8px; }
.panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.panes:has(> :only-child) { grid-template-columns: minmax(0, 1fr); }
h4 { margin: 0 0 6px; }
.viewport { height: 52vh; overflow: auto; background: #e0e1e4; }
.picture { position: relative; background: repeating-conic-gradient(#dce0e6 0% 25%, #f6f7f8 0% 50%) 0 0 / 20px 20px; }
.picture img { display: block; width: 100%; height: 100%; object-fit: fill; }
.picture svg { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
</style>
