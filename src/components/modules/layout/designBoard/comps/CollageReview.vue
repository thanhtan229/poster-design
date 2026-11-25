<!-- [TINIX] Review reference notes and measured print issues from the canvas. -->
<template>
  <Teleport :to="toolbar">
    <section v-if="enabled" class="collage-review">
      <button type="button" :aria-expanded="open" @click="open = !open">{{ label('title') }} ({{ entries.length }})</button>
      <div v-if="open" class="review-body">
        <form @submit.prevent="addNote">
          <input v-model="note" :placeholder="label('note')" :aria-label="label('note')" maxlength="180" />
          <select v-if="guide?.regions.length" v-model="regionId" :aria-label="label('region')">
            <option value="">{{ label('selected') }}</option>
            <option v-for="(region, index) in guide.regions" :key="region.id" :value="region.id">{{ label('region') }} {{ index + 1 }}</option>
          </select>
          <button type="submit" :disabled="!note.trim()">{{ label('add') }}</button>
        </form>
        <p v-if="!entries.length">{{ label('empty') }}</p>
        <ul>
          <li v-for="item in entries" :key="item.key">
            <button type="button" :aria-pressed="active?.key === item.key" @click="focus(item)">{{ item.title }}</button>
            <span>{{ label(item.kind) }}</span>
          </li>
        </ul>
        <div v-if="active" class="review-details">
          <img v-if="referencePreview" :src="referencePreview" :alt="label('region')" />
          <button v-if="active.kind === 'reference'" type="button" @click="resolveActive">{{ label('verified') }}</button>
          <button v-else type="button" :disabled="busy || !active.target" @click="recheck">{{ label('recheck') }}</button>
          <button v-if="active.kind === 'cut' && active.target" type="button" @click="openCut">{{ label('openCut') }}</button>
        </div>
        <p v-if="message" role="status">{{ message }}</p>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useCanvasStore, useWidgetStore } from '@/store'
import { COLLAGE_REVIEW_EVENT, cutNeedsReview, type CollageReviewReport } from '@/utils/tinix/collage-review'
import { checkCutPiece, CUT_REVIEW_EVENT } from '@/utils/tinix/cut-piece-review'
import { printUnits } from '@/utils/tinix/collage-print'
import { inspectPrintTrim, printTrimCache } from '@/utils/tinix/print-trim-review'
import { cropReferenceGuide } from '@/utils/tinix/reference-guide'

type Entry = { key: string; kind: 'reference' | 'trim' | 'cut'; title: string; target?: string; region?: string; limit?: number }

defineProps<{ toolbar: HTMLElement }>()
const { t } = useI18n()
const label = (key: string) => t('tinix.ui.collageReview.' + key)
const route = useRoute()
const canvas = useCanvasStore()
const widgets = useWidgetStore()
const guide = computed(() => canvas.dPage.referenceGuide)
const enabled = computed(() => Boolean(guide.value || (canvas.dPage as { collage?: unknown }).collage))
const entries = ref<Entry[]>([])
const active = ref<Entry>()
const open = ref(false)
const busy = ref(false)
const note = ref('')
const regionId = ref('')
const message = ref('')
const referencePreview = ref('')
let controller: AbortController | undefined
let focusVersion = 0

function clearSelection() {
  focusVersion++
  controller?.abort()
  busy.value = false
  active.value = undefined
  message.value = ''
  if (referencePreview.value) URL.revokeObjectURL(referencePreview.value)
  referencePreview.value = ''
}

watch([() => route.fullPath, () => canvas.dCurrentPage], () => {
  clearSelection()
  entries.value = []
  note.value = ''
  regionId.value = ''
  open.value = false
})

function addNote() {
  const title = note.value.trim()
  if (!title) return
  const region = guide.value?.regions.find(item => item.id === regionId.value)
  const selected = widgets.dActiveElement?.uuid
  entries.value.push({ key: crypto.randomUUID(), kind: 'reference', title,
    target: region ? region.layerId : selected, region: region?.id })
  note.value = ''
}

function receive(event: Event) {
  const { page, trim, cut, full } = (event as CustomEvent<CollageReviewReport>).detail
  if (page !== canvas.dPage) return
  const found: Entry[] = []
  if (trim) {
    const measured = new Set(trim.map(row => row.id))
    entries.value = entries.value.filter(item => item.kind !== 'trim' || (!full && !measured.has(item.target || '')))
    found.push(...trim.filter(row => ['overflow', 'unknown'].includes(row.status)).map((row): Entry => ({
      key: 'trim:' + row.id, kind: 'trim', target: row.id, title: row.name + ' · ' + t('tinix.ui.trimReview.' + row.status),
    })))
  }
  if (cut) {
    entries.value = entries.value.filter(item => item.kind !== 'cut')
    found.push(...cut.rows.filter(cutNeedsReview).map((row): Entry => ({
      key: 'cut:' + row.id + ':' + row.sheet, kind: 'cut', target: row.id, limit: cut.limit,
      title: row.name || t('tinix.ui.cutReadiness.unassigned'),
    })))
  }
  entries.value.push(...found)
}

async function focus(item: Entry) {
  clearSelection()
  active.value = item
  const version = focusVersion
  const unit = item.kind === 'cut' && printUnits(widgets.dWidgets).find(entry => entry.id === item.target)
  const id = unit ? unit.ids[0] : item.target
  const reference = guide.value
  const region = reference?.regions.find(entry => entry.id === item.region || (id && entry.layerId === id))
  const layerId = region?.layerId || id
  if (widgets.dWidgets.some(layer => layer.uuid === layerId)) widgets.selectWidget({ uuid: layerId! })
  if (!reference || !region) return
  try {
    const crop = await cropReferenceGuide(reference, region)
    if (version === focusVersion) referencePreview.value = URL.createObjectURL(crop)
  } catch {
    if (version === focusVersion) message.value = label('cropFailed')
  }
}

function resolveActive() {
  entries.value = entries.value.filter(item => item.key !== active.value?.key)
  clearSelection()
}

function openCut() {
  const item = active.value
  if (item?.target) window.dispatchEvent(new CustomEvent(CUT_REVIEW_EVENT, { detail: { id: item.target, limit: item.limit } }))
}

async function recheck() {
  const item = active.value
  if (!item?.target || busy.value) return
  const run = new AbortController()
  controller = run
  busy.value = true
  message.value = ''
  const page = canvas.dPage
  const snapshot = JSON.stringify(widgets.dWidgets)
  try {
    const layers = JSON.parse(snapshot)
    const signal = AbortSignal.any([run.signal, AbortSignal.timeout(60000)])
    let stillHasIssue
    if (item.kind === 'cut') {
      const result = await checkCutPiece(page, layers, item.target, item.limit || 2, signal)
      stillHasIssue = result.boxMiss || !result.row || cutNeedsReview(result.row)
    } else {
      stillHasIssue = (await inspectPrintTrim(page, layers, signal, () => {}, printTrimCache, new Set([item.target])))
        .rows.some(row => row.status === 'overflow' || row.status === 'unknown')
    }
    if (run.signal.aborted) return
    if (page !== canvas.dPage || snapshot !== JSON.stringify(widgets.dWidgets)) {
      message.value = label('changed')
      return
    }
    if (stillHasIssue) message.value = label('still')
    else {
      resolveActive()
      message.value = label('cleared')
    }
  } catch {
    if (!run.signal.aborted) message.value = label('failed')
  } finally {
    if (controller === run) busy.value = false
  }
}

onMounted(() => window.addEventListener(COLLAGE_REVIEW_EVENT, receive))
onBeforeUnmount(() => {
  clearSelection()
  window.removeEventListener(COLLAGE_REVIEW_EVENT, receive)
})
</script>

<style scoped>
.collage-review { padding: 5px 10px; background: #f6f8fc; }
.collage-review button { border: 1px solid #ccd2dc; border-radius: 4px; background: white; padding: 3px 7px; }
.review-body { display: grid; gap: 8px; padding-top: 5px; }
.review-body form, .review-details, .review-body li { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.review-body input, .review-body select { border: 1px solid #ccd2dc; border-radius: 4px; padding: 4px; }
.review-body ul { list-style: none; padding: 0; margin: 0; max-height: 130px; overflow: auto; }
.review-body li { padding: 2px 0; }
.review-details img { max-width: min(180px, 100%); max-height: 110px; object-fit: contain; }
</style>
