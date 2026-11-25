<!-- [TINIX] Mark a rectangle on the original photo preview without changing the crop. -->
<template>
  <span>{{ label('detailHelp') }}</span>
  <div class="detail-photo" data-crop-detail-photo
    @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel">
    <img :src="image" :alt="alt" draggable="false" />
    <div v-if="display" class="detail-box" aria-hidden="true" :style="{
      left: pct(display.left), top: pct(display.top), width: pct(display.right - display.left), height: pct(display.bottom - display.top),
    }" />
  </div>
  <button v-if="region" type="button" :disabled="disabled" @click="emit('change', undefined)">{{ label('clearDetail') }}</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CropDetailRegion } from '@/utils/tinix/face-crop'

const props = defineProps<{ image: string; alt: string; region?: CropDetailRegion; disabled: boolean }>()
const emit = defineEmits<{ (event: 'change', region: CropDetailRegion | undefined): void }>()
const { t } = useI18n()
const label = (key: string) => t('tinix.ui.batchPhotoCrop.' + key)
const pct = (fraction: number) => `${100 * fraction}%`
let origin: { x: number; y: number } | undefined
let pointer: number | undefined
const dragging = ref<CropDetailRegion>()
const display = computed(() => dragging.value ?? props.region)

function point(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) }
}

function start(event: PointerEvent) {
  if (props.disabled || pointer !== undefined || event.button !== 0) return
  origin = point(event)
  pointer = event.pointerId
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(pointer)
}

function move(event: PointerEvent) {
  if (!origin || event.pointerId !== pointer) return
  const current = point(event)
  dragging.value = {
    left: Math.min(origin.x, current.x), top: Math.min(origin.y, current.y),
    right: Math.max(origin.x, current.x), bottom: Math.max(origin.y, current.y),
  }
}

function finish(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  move(event)
  const region = dragging.value
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!props.disabled && region && (region.right - region.left) * bounds.width >= 3 && (region.bottom - region.top) * bounds.height >= 3) {
    emit('change', region)
  }
  cancel(event)
}

function cancel(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  pointer = undefined
  origin = undefined
  dragging.value = undefined
}
</script>

<style scoped>
.detail-photo { position: relative; width: min(360px, 100%); margin: 4px 0; cursor: crosshair; touch-action: none; user-select: none; }
.detail-photo img { display: block; width: 100%; height: auto; border-radius: 4px; pointer-events: none; }
.detail-box { position: absolute; box-sizing: border-box; border: 2px solid #facc15; outline: 1px solid #263345; pointer-events: none; }
</style>
