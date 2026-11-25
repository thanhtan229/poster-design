<!-- [TINIX] Review current page assets on light and dark backgrounds. -->
<template>
  <el-dialog v-model="show" :title="$t('tinix.ui.cutoutTools.review')" width="92%" :close-on-click-modal="!editing" @closed="clear">
    <template v-if="editing">
      <div class="review-controls">
        <el-button :disabled="repairBusy" @click="closeRepair">{{ $t('tinix.ui.cutoutTools.backToReview') }}</el-button>
        <strong>{{ editing.layer.layerName || editing.layer.name }}</strong>
        <label v-if="!editing.source">{{ $t('tinix.ui.cutoutTools.alignedSource') }}
          <input type="file" accept="image/*" :disabled="repairBusy" @change="chooseSource" />
        </label>
      </div>
      <p v-if="repairError" role="alert">{{ $t('tinix.ui.cutoutTools.' + repairError) }}</p>
      <CutoutCurveEditor :raw="editing.source" :result="editing.base" :saved-edits="editing.edits"
        :busy="repairBusy" persist @done="saveRepair" />
    </template>
    <div v-show="!editing">
    <div class="review-controls">
      <label><input v-model="onlyFlagged" type="checkbox" /> {{ $t('tinix.ui.cutoutTools.flaggedOnly') }}</label>
      <label><input v-model="fullSize" type="checkbox" /> 100%</label>
    </div>
    <p>{{ $t('tinix.ui.cutoutTools.reviewHint') }}</p>
    <p v-if="busy" role="status">{{ $t('tinix.ui.cutoutTools.scanning') }}</p>
    <p v-else-if="!visibleRows.length">{{ $t('tinix.ui.cutoutTools.noAssets') }}</p>
    <div class="results">
      <article v-for="row in visibleRows" :key="row.id">
        <header>
          <strong>{{ row.name }}</strong>
          <span v-for="flag in row.flags" :key="flag" class="flag">{{ $t('tinix.ui.cutoutTools.' + flag) }}</span>
          <el-button v-if="row.editable" size="small" :disabled="repairBusy" @click="openRepair(row)">{{ $t('tinix.ui.cutoutTools.repairLayer') }}</el-button>
        </header>
        <div v-if="row.src" class="samples">
          <div v-for="tone in ['light','dark']" :key="tone" class="sample" :class="tone">
            <img :src="row.src" :width="row.width" :height="row.height" :alt="row.name" class="asset" :class="{ fit: !fullSize }" loading="lazy" />
          </div>
        </div>
      </article>
    </div>
    <p v-if="!editing && repairError" role="alert">{{ $t('tinix.ui.cutoutTools.' + repairError) }}</p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useWidgetStore } from '@/store'
import type { TdWidgetData } from '@/store/design/widget'
import { isCliHeroUrl, isUploadUrl } from '@/utils/tinix/template-sanitize'
import { cutoutCanvas, cutoutHash, inspectAlpha, readCutoutFile, readCutoutImage, type CurveEdit, type CutoutRepair } from '@/utils/tinix/cutout-workspace'
import CutoutCurveEditor from './CutoutCurveEditor.vue'

type Layer = TdWidgetData & { svgUrl?: string; colors?: string[]; printRole?: string; templateRole?: string }
type Row = { id: string; name: string; width: number; height: number; src?: string; flags: string[]; editable?: boolean }
type RepairSession = Omit<CutoutRepair, 'resultHash'> & { layer: Layer; displayed: string }
const widgetStore = useWidgetStore()
const editing = shallowRef<RepairSession>()
const repairBusy = ref(false); const repairError = ref('')
const show = ref(false); const busy = ref(false); const onlyFlagged = ref(false); const fullSize = ref(true)
const rows = ref<Row[]>([])
let run = 0
const visibleRows = computed(() => onlyFlagged.value ? rows.value.filter(row => row.flags.length) : rows.value)

function assetUrl(layer: Layer) {
  const src = layer.type === 'w-svg' ? layer.svgUrl : layer.imgUrl
  if (!src || !/^\s*<svg\b/i.test(src)) return src
  const svg = src.replace(/\{\{colors\[(\d+)\]\}\}/g, (_, index) => {
    const color = layer.colors?.[Number(index)]
    return color && /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i.test(color) ? color : 'none'
  })
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}
function clear() {
  if (show.value) return
  run++
  busy.value = false
  rows.value = []
  closeRepair()
}

function closeRepair() {
  editing.value = undefined
  repairError.value = ''
  repairBusy.value = false
}
async function openRepair(row: Row) {
  const layer = widgetStore.dWidgets.find(w => w.uuid === row.id)
  if (!layer?.imgUrl || layer.lock || layer.slot || layer.imgUrl !== row.src) return
  const displayed = layer.imgUrl
  const current = run
  repairBusy.value = true
  repairError.value = ''
  try {
    const saved = layer.cutoutRepair
    const repair = saved && saved.resultHash === await cutoutHash(displayed) ? saved : undefined
    const url = layer.origin?.original || displayed
    const base = repair?.base || (url.startsWith('blob:') ? await readCutoutFile(await (await fetch(url)).blob()) : url)
    if (current !== run || !show.value) return
    editing.value = {
      layer, displayed, base, source: repair?.source, edits: repair?.edits || [],
      privateAsset: repair?.privateAsset || [displayed, url].some(value => isUploadUrl(value) || isCliHeroUrl(value)),
    }
  } catch {
    if (current === run) repairError.value = 'readError'
  } finally {
    if (current === run) repairBusy.value = false
  }
}

async function chooseSource(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const session = editing.value
  if (!file || !session) return
  repairBusy.value = true
  repairError.value = ''
  try {
    const source = await readCutoutFile(file)
    const [image, base] = await Promise.all([readCutoutImage(source), readCutoutImage(session.base)])
    if (editing.value !== session) return
    if (image.naturalWidth !== base.naturalWidth || image.naturalHeight !== base.naturalHeight) {
      repairError.value = 'pairSize'
      return
    }
    editing.value = { ...session, source }
  } catch {
    if (editing.value === session) repairError.value = 'readError'
  } finally {
    if (editing.value === session || editing.value?.layer === session.layer) repairBusy.value = false
    input.value = ''
  }
}

async function saveRepair(result: string, edits: CurveEdit[]) {
  const session = editing.value
  if (!session || repairBusy.value) return
  repairBusy.value = true
  repairError.value = ''
  try {
    const resultHash = await cutoutHash(result)
    if (editing.value !== session || !show.value) return
    const { layer, displayed, base, source, privateAsset } = session
    if (!widgetStore.dWidgets.includes(layer) || layer.imgUrl !== displayed || layer.lock || layer.slot) {
      repairError.value = 'layerChanged'
      return
    }
    const row = rows.value.find(item => item.id === layer.uuid)
    if (!row) return
    const preview = await inspectRow({ ...row, flags: [] }, result)
    if (editing.value !== session || !show.value || !widgetStore.dWidgets.includes(layer) || layer.imgUrl !== displayed || layer.lock || layer.slot) {
      if (editing.value === session) repairError.value = 'layerChanged'
      return
    }
    widgetStore.$patch(() => Object.assign(layer, { imgUrl: result, origin: undefined, cutoutRepair: { base, source, edits, resultHash, privateAsset } }))
    Object.assign(row, preview)
    closeRepair()
  } catch {
    if (editing.value === session) repairError.value = 'readError'
  } finally {
    if (editing.value === session) repairBusy.value = false
  }
}

async function inspectRow(row: Row, src: string) {
  const { width, height } = row
  if (!src || !Number.isFinite(width * height) || width * height > 25_000_000 || Math.max(width, height) > 12000) throw new Error('Cannot inspect asset')
  const image = await readCutoutImage(src)
  const { context, canvas } = cutoutCanvas(width, height)
  context.drawImage(image, 0, 0, width, height)
  const scan = inspectAlpha(context.getImageData(0, 0, width, height))
  canvas.width = 0
  row.src = src
  if (scan.nearEdge) row.flags.push('nearEdge')
  if (scan.specks) row.flags.push('specks')
  if (scan.empty) row.flags.push('emptyMask')
  return { ...row, transparent: scan.transparent }
}
async function open(layers: Layer[]) {
  const current = ++run
  show.value = busy.value = true
  rows.value = []
  try {
    for (const layer of layers) {
      if (current !== run || !show.value) return
      if (!['w-svg', 'w-image'].includes(layer.type) || layer.hidden || layer.opacity === 0 || layer.slot || layer.templateRole === 'photo' || layer.printRole === 'base') continue
      const width = Math.max(1, Math.round(layer.width)); const height = Math.max(1, Math.round(layer.height))
      const row: Row = { id: layer.uuid, name: layer.layerName || layer.name || layer.uuid, width, height, flags: [] }
      try {
        const src = assetUrl(layer)
        const scan = await inspectRow(row, src || '')
        if (!scan.transparent) continue
        row.editable = layer.type === 'w-image' && !layer.lock && !/^data:image\/svg\+xml|\.svg(?:[?#]|$)/i.test(src || '')
      } catch {
        row.flags.push('readError')
      }
      if (current === run && show.value) rows.value.push(row)
    }
  } finally {
    if (current === run) busy.value = false
  }
}

defineExpose({ open })
</script>

<style scoped>
.review-controls, header { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.results { max-height: 64vh; overflow: auto; }
article { border-bottom: 1px solid #dedfe3; padding: 10px 0; }
.flag { color: #884910; background: #fff1d4; border-radius: 4px; padding: 2px 7px; }
.samples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.sample { overflow: auto; max-height: 55vh; padding: 10px; }
.light { background: #f5f1e8; }
.dark { background: #22252a; }
.asset { display: block; max-width: none; object-fit: fill; }
.asset.fit { max-width: 100%; height: auto; max-height: 240px; object-fit: contain; }
</style>
