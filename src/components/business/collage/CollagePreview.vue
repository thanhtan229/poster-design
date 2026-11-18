<template>
  <div ref="box" class="collage-preview" :style="{ aspectRatio: `${pageW} / ${pageH}`, background: pageBg }">
    <div class="world" :style="{ width: pageW + 'px', height: pageH + 'px', transform: `scale(${scale})` }">
      <CollagePreviewNode v-for="n in roots" :key="n.uuid" :node="n" :px="0" :py="0" />
    </div>
  </div>
</template>
<script setup lang="ts">
// [TINIX] Ảnh xem trước mẫu cắt dán, dựng bằng DOM từ dữ liệu mẫu (không cần server render).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CollagePreviewNode from './CollagePreviewNode.vue'

const props = defineProps<{ layout: any }>()
const box = ref<HTMLElement>()
const scale = ref(0.1)
const pageW = computed(() => Number(props.layout?.global?.width) || 1000)
const pageH = computed(() => Number(props.layout?.global?.height) || 1000)
const pageBg = computed(() => props.layout?.global?.backgroundColor || '#fff')
const roots = computed(() => {
  const layers: any[] = (props.layout?.layers || []).filter((w: any) => !w.hidden)
  const byParent = new Map<string, any[]>()
  for (const w of layers) {
    const p = w.parent && w.parent !== '-1' ? String(w.parent) : '-1'
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p)!.push(w)
  }
  const build = (w: any): any => ({ ...w, kids: (byParent.get(String(w.uuid)) || []).map(build) })
  return (byParent.get('-1') || []).map(build)
})
let ro: ResizeObserver | null = null
function measure() {
  if (box.value) scale.value = box.value.clientWidth / pageW.value
}
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (box.value) ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>
<style scoped>
.collage-preview {
  position: relative;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
}
.world {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
}
</style>
