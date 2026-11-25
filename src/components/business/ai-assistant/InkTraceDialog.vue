<!-- [TINIX] Local workspace for tracing lettering from a cropped reference. -->
<template>
  <el-dialog v-model="open" :title="$t('tinix.ui.cutoutTools.inkTitle')" width="850px" append-to-body :z-index="22000" @closed="reset">
    <p>{{ $t('tinix.ui.cutoutTools.inkHint') }}</p>
    <div class="controls">
      <label>{{ $t('tinix.ui.cutoutTools.inkSource') }} <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="reading" @change="load($event, false)" /></label>
      <label>{{ $t('tinix.ui.cutoutTools.inkGuard') }} <input type="file" accept="image/png" :disabled="!source || reading" @change="load($event, true)" /></label>
      <el-button v-if="guard" size="small" :disabled="reading" @click="guard = undefined; result = undefined">{{ $t('tinix.ui.cutoutTools.inkClearGuard') }}</el-button>
    </div>
    <div class="controls">
      <label>{{ $t('tinix.ui.cutoutTools.inkColor') }} <input v-model="ink" type="color" @input="result = undefined" /></label>
      <label>{{ $t('tinix.ui.cutoutTools.inkPaper') }} <input v-model="paper" type="color" @input="result = undefined" /></label>
      <label>{{ $t('tinix.ui.cutoutTools.inkCoverage') }} <input v-model.number="threshold" type="range" min="25" max="75" @input="result = undefined" /> {{ threshold }}%</label>
      <label>{{ $t('tinix.ui.cutoutTools.inkMinArea') }} <input v-model.number="minArea" type="number" min="0.5" max="20" step="0.5" @input="result = undefined" /></label>
      <el-button type="primary" :disabled="!source || reading" @click="trace">{{ $t('tinix.ui.cutoutTools.inkTrace') }}</el-button>
    </div>
    <p v-if="error" role="alert">{{ $t('tinix.ui.cutoutTools.' + error) }}</p>
    <p v-if="result" role="status">{{ $t('tinix.ui.cutoutTools.inkContours', { count: result.contours }) }}</p>
    <div v-if="source" class="previews">
      <section>
        <strong>{{ $t('tinix.ui.cutoutTools.original') }}</strong>
        <div class="controls sampling">
          <el-button size="small" :type="sampleFor === 'ink' ? 'primary' : 'default'" @click="sampleFor = 'ink'">{{ $t('tinix.ui.cutoutTools.inkSample') }}</el-button>
          <el-button size="small" :type="sampleFor === 'paper' ? 'primary' : 'default'" @click="sampleFor = 'paper'">{{ $t('tinix.ui.cutoutTools.inkSamplePaper') }}</el-button>
        </div>
        <img :src="source.preview" :alt="$t('tinix.ui.cutoutTools.original')" :class="{ 'sampling-image': sampleFor }" @click="sample($event)" />
      </section>
      <section v-if="result">
        <strong>SVG</strong>
        <img :src="'data:image/svg+xml,' + encodeURIComponent(result.svg)" alt="SVG" />
      </section>
    </div>
    <template #footer>
      <el-button :disabled="!result || reading" @click="download">{{ $t('tinix.ui.cutoutTools.inkDownload') }}</el-button>
      <el-button type="primary" :disabled="!result || reading" @click="insert">{{ $t('tinix.ui.cutoutTools.inkInsert') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCanvasStore, useWidgetStore } from '@/store'
import { wSvgSetting } from '@/components/modules/widgets/wSvg/wSvgSetting'
import downloadBlob from '@/common/methods/download/downloadBlob'
import { cutoutCanvas, readCutoutFile, readCutoutImage } from '@/utils/tinix/cutout-workspace'
import { INK_TRACE_LIMIT, traceInk } from '@/utils/tinix/ink-to-svg'

const { t } = useI18n()
const canvasStore = useCanvasStore()
const widgets = useWidgetStore()
const open = defineModel<boolean>({ required: true })
const source = shallowRef<{ image: ImageData; preview: string }>()
const guard = shallowRef<Uint8ClampedArray>()
const result = shallowRef<ReturnType<typeof traceInk>>()
const ink = ref('#87181d')
const paper = ref('#fff0d1')
const threshold = ref(47)
const minArea = ref(2)
const error = ref('')
const reading = ref(false)
const sampleFor = ref<'ink' | 'paper'>()
let generation = 0
let regionResult: ((svg: string, paperColor: string, width: number, height: number) => void) | undefined

function reset() {
  ++generation
  source.value = guard.value = result.value = undefined
  reading.value = false
  error.value = ''
  sampleFor.value = undefined
  regionResult = undefined
}

async function load(event: Event, useGuard: boolean) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try { await loadSource(await readCutoutFile(file), useGuard) }
  catch { error.value = 'readError' }
  finally { input.value = '' }
}

async function loadSource(preview: string, useGuard: boolean) {
  const current = ++generation
  reading.value = true
  error.value = ''
  result.value = undefined
  try {
    const decoded = await readCutoutImage(preview)
    if (current !== generation || !open.value) return
    const { naturalWidth: width, naturalHeight: height } = decoded
    if (width * height > INK_TRACE_LIMIT) {
      error.value = 'inkTooLarge'
      return
    }
    if (useGuard && (width !== source.value?.image.width || height !== source.value?.image.height)) {
      error.value = 'pairSize'
      return
    }
    const { context } = cutoutCanvas(width, height)
    context.drawImage(decoded, 0, 0)
    const image = context.getImageData(0, 0, width, height)
    if (useGuard) {
      const hasInk = image.data.some((value, i) => i % 4 === 3 && value > 80)
      const hasGap = image.data.some((value, i) => i % 4 === 3 && value <= 80)
      if (!hasInk || !hasGap) {
        error.value = 'inkMaskInvalid'
        return
      }
      guard.value = image.data
    } else {
      source.value = { image, preview }
      guard.value = undefined
    }
  } catch {
    if (current === generation) error.value = 'readError'
  } finally {
    if (current === generation) reading.value = false
  }
}

// [TINIX] Reuse the same tracing and preview with the already aligned reference crop.
function openRegion(preview: string, done: NonNullable<typeof regionResult>) {
  reset()
  regionResult = done
  open.value = true
  return loadSource(preview, false)
}
defineExpose({ openRegion })

function trace() {
  if (!source.value) return
  error.value = ''
  try {
    result.value = traceInk(source.value.image, { ink: ink.value, paper: paper.value, threshold: threshold.value / 100, minArea: minArea.value, guard: guard.value })
    if (!result.value) error.value = 'inkEmpty'
  } catch {
    result.value = undefined
    error.value = 'inkInvalid'
  }
}

function sample(event: MouseEvent) {
  if (!source.value || !sampleFor.value) return
  const { data, width, height } = source.value.image
  const rect = (event.currentTarget as HTMLImageElement).getBoundingClientRect()
  const x = Math.min(width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * width / rect.width)))
  const y = Math.min(height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * height / rect.height)))
  const i = (y * width + x) * 4
  if (data[i + 3] < 128) return
  const hex = '#' + Array.from(data.slice(i, i + 3), v => v.toString(16).padStart(2, '0')).join('')
  const target = sampleFor.value === 'ink' ? ink : paper
  target.value = hex
  sampleFor.value = undefined
  result.value = undefined
}

function download() {
  if (result.value) downloadBlob(new Blob([result.value.svg], { type: 'image/svg+xml' }), 'net-chu.svg')
}

function insert() {
  if (!source.value || !result.value) return
  const { width, height } = source.value.image
  if (regionResult) {
    regionResult(result.value.svg, paper.value, width, height)
    open.value = false
    return
  }
  const page = canvasStore.dPage
  const scale = Math.min(1, page.width / width, page.height / height)
  const w = Math.round(width * scale); const h = Math.round(height * scale)
  widgets.addWidget({
    ...JSON.parse(JSON.stringify(wSvgSetting)),
    name: t('tinix.ui.cutoutTools.inkTitle'), width: w, height: h, parent: page.uuid,
    left: Math.round((page.width - w) / 2), top: Math.round((page.height - h) / 2),
    record: { width: w, height: h, minWidth: 1, minHeight: 1 },
    svgUrl: result.value.svg.replace(`fill="${ink.value}"`, 'fill="{{colors[0]}}"'), colors: [ink.value],
  })
  open.value = false
}
</script>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 12px; }
.controls label { display: flex; gap: 6px; align-items: center; }
.controls input[type=number] { width: 62px; }
.previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.previews section { min-width: 0; }
.previews img { display: block; max-width: 100%; max-height: 42vh; object-fit: contain; background: #fff3de; margin-top: 4px; }
.previews .sampling { margin-top: 4px; gap: 6px; }
.previews .sampling-image { cursor: crosshair; }
</style>
