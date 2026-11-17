<template><div aria-hidden="true" class="appearance" :style="{borderRadius:(image.radius||0)+'px',boxShadow:e.border?`inset 0 0 0 ${e.border}px ${e.borderColor}`:undefined}"><div v-if="e.grain" class="texture" :style="{backgroundImage:textureUrl(),opacity:e.grain/100*.65}"/><div v-if="e.paper" class="texture" :style="{backgroundImage:textureUrl(true),opacity:e.paper/100*.65}"/></div></template>
<script setup lang="ts">
import { computed } from 'vue'
import { imageEffects, textureUrl } from '@/utils/tinix/image-effects'
const props=defineProps<{image:any}>();const e=computed(()=>imageEffects(props.image))
</script>
<style scoped>.appearance,.texture{position:absolute;inset:0;pointer-events:none}.appearance{overflow:hidden} /* [TINIX] bỏ z-index:1: lớp phủ vân giấy/hạt/viền nằm trong ngữ cảnh xếp chồng chung của trang nên z-index:1 làm nó vẽ ĐÈ lên mọi lớp phía sau (chữ đen thành xám). Không z-index thì nó chỉ phủ lên ảnh của chính lớp, đúng thứ tự DOM */.texture{mix-blend-mode:multiply;background-repeat:repeat;background-size:180px 180px}</style>
