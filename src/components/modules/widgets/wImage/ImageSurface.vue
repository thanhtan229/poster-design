<template>
 <img v-if="image.cutoutBorderUrl" class="cutout-border" :src="image.cutoutBorderUrl" alt="" :style="{transform:flip}" />
 <div class="img__box" :class="{mask:!!image.mask}" :style="{transform:flip,borderRadius:(image.radius||0)+'px',WebkitMaskImage:image.mask ? `url('${image.mask}')` : 'initial'}">
  <slot>
   <div v-if="image.isNinePatch" class="target" :style="{...imageFilterStyle(image),border:`${image.height*image.sliceData.ratio/2}px solid transparent`,borderImage:`url('${src}') ${image.sliceData.left} round`}" />
   <img v-else class="target" :src="src" :style="imageStyle" draggable="false" />
  </slot>
 </div>
 <ImageAppearance :image="image" />
</template>
<script setup lang="ts">
import {computed} from 'vue'
import ImageAppearance from './ImageAppearance.vue'
import {imageFilterStyle} from '@/utils/tinix/image-effects'
const props=defineProps<{image:any;src:string}>()
const flip=computed(()=>props.image.flip?`rotate${props.image.flip}(180deg)`:undefined)
const imageStyle=computed(()=>({...imageFilterStyle(props.image),transform:props.image.transform||undefined,transformOrigin:props.image.fit==='cover'?`${props.image.cropX??50}% ${props.image.cropY??50}%`:'center',objectFit:props.image.fit||undefined,objectPosition:`${props.image.cropX??50}% ${props.image.cropY??50}%`}))
</script>
<style scoped>
.cutout-border{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.img__box{position:relative;width:100%;height:100%;overflow:hidden}
.mask{-webkit-mask-size:100% 100%;-webkit-mask-position:center}
.target{display:block;width:100%;height:100%;pointer-events:none}
</style>
