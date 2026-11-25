<template>
 <div class="rc-turn" :style="{ transform: `rotate(${rotation}deg)` }">
  <img ref="el" class="target rc-img" :src="src" :style="style" draggable="false" @load="measure" />
 </div>
</template>
<script setup lang="ts">
// [TINIX] Ảnh trong khung (fit: 'cover') khi có xoay ảnh. Vẽ ảnh ở kích thước phủ khung rồi phóng quanh điểm căn,
// sau đó xoay cả lớp quanh tâm khung — ảnh bị cắt bởi khung nên phần thừa của ảnh hiện ra khi xoay (xem utils/tinix/photo-frame.ts).
import { computed, onMounted, ref } from 'vue'
import { imageFilterStyle } from '@/utils/tinix/image-effects'
import { frameRotation, frameBaseScale, isFitPhotoFrame } from '@/utils/tinix/photo-frame'

const props = defineProps<{ image: any; src: string }>()
const el = ref<HTMLImageElement>()
const natural = ref({ width: 0, height: 0 })
const rotation = computed(() => frameRotation(props.image))

function measure() {
  const img = el.value
  if (img && img.naturalWidth) natural.value = { width: img.naturalWidth, height: img.naturalHeight }
}
onMounted(() => {
  if (el.value && el.value.complete) measure()
})

const style = computed(() => {
  const image = props.image
  const w = Number(image.width)
  const h = Number(image.height)
  const { width: nw, height: nh } = natural.value
  const base: any = { ...imageFilterStyle(image), maxWidth: 'none', transform: image.transform || undefined }
  if (!nw || !nh) return { ...base, position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: isFitPhotoFrame(image) ? 'contain' : 'cover' }
  const cx = (image.cropX ?? 50) / 100
  const cy = (image.cropY ?? 50) / 100
  const factor = frameBaseScale(image, natural.value)
  const sw = nw * factor
  const sh = nh * factor
  const ox = (w - sw) * cx
  const oy = (h - sh) * cy
  return { ...base, position: 'absolute', left: ox + 'px', top: oy + 'px', width: sw + 'px', height: sh + 'px', objectFit: 'fill', transformOrigin: `${cx * w - ox}px ${cy * h - oy}px` }
})
</script>
<style scoped>
.rc-turn { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 50% 50%; }
</style>
