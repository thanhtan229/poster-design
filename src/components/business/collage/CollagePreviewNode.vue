<template>
  <div :style="boxStyle">
    <template v-if="node.type === 'w-text'">
      <div :style="textStyle">{{ node.text }}</div>
    </template>
    <img v-else-if="node.type === 'w-image' && node.imgUrl" :src="node.imgUrl" alt="" :style="imgStyle" loading="lazy" />
    <CollagePreviewNode v-for="k in node.kids" :key="k.uuid" :node="k" :px="Number(node.left) || 0" :py="Number(node.top) || 0" />
  </div>
</template>
<script setup lang="ts">
// [TINIX] Một lớp của ảnh xem trước mẫu: vị trí tuyệt đối so với nhóm cha, xoay quanh tâm.
import { computed } from 'vue'

const props = defineProps<{ node: any; px: number; py: number }>()
const boxStyle = computed(() => {
  const n = props.node
  const rot = parseFloat(String(n.rotate ?? 0)) || 0
  const m = n.mask ? { WebkitMaskImage: `url("${n.mask}")`, WebkitMaskSize: '100% 100%', maskImage: `url("${n.mask}")`, maskSize: '100% 100%' } : {}
  return {
    position: 'absolute' as const,
    left: (Number(n.left) || 0) - props.px + 'px',
    top: (Number(n.top) || 0) - props.py + 'px',
    width: (Number(n.width) || 0) + 'px',
    height: (Number(n.height) || 0) + 'px',
    opacity: n.opacity ?? 1,
    transform: rot ? `rotate(${rot}deg)` : undefined,
    borderRadius: n.radius ? n.radius + 'px' : undefined,
    overflow: n.mask || n.radius ? 'hidden' : undefined,
    ...m,
  }
})
const imgStyle = computed(() => {
  const n = props.node
  const fit = n.fit === 'cover' ? 'cover' : 'fill'
  return { width: '100%', height: '100%', display: 'block', objectFit: fit, objectPosition: `${n.cropX ?? 50}% ${n.cropY ?? 50}%` } as any
})
const textStyle = computed(() => {
  const n = props.node
  return {
    width: '100%',
    height: '100%',
    fontFamily: n.fontFamily ? `"${n.fontFamily}", sans-serif` : undefined,
    fontSize: (Number(n.fontSize) || 16) + 'px',
    lineHeight: n.lineHeight || 1.2,
    letterSpacing: (Number(n.letterSpacing) || 0) / 100 + 'em',
    color: n.color,
    textAlign: n.textAlign || 'left',
    fontWeight: n.fontWeight,
    fontStyle: n.fontStyle,
    whiteSpace: 'pre-wrap',
  } as any
})
</script>
