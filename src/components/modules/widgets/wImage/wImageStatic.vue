<!--
 * @Author: ShawnPhang
 * @Date: 2024-04-12 17:47:19
 * @Description: 静态组件
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-16 16:25:35
-->
<template>
  <div
    ref="widgetRef"
    :style="{
      position: state.position,
      left: params.left - parent.left + 'px',
      top: params.top - parent.top + 'px',
      width: params.width + 'px',
      height: params.height + 'px',
      opacity: params.opacity,
      ...imageFrameStyle(params),
    }"
  >
    <ImageSurface :image="params" :src="source.imgUrl" />
  </div>
</template>

<script lang="ts" setup>
import ImageSurface from './ImageSurface.vue'
import { imageFrameStyle, resolveLinkedImage } from '@/utils/tinix/image-effects'

import { CSSProperties, computed, reactive, ref } from 'vue'
import { useWidgetStore } from '@/store'
import setting from "./wImageSetting"

type TProps = {
  params: typeof setting
  parent: {
    left: number
    top: number
  }
}

type TState = {
  position: 'absolute' | 'relative', // 'absolute'relative
  editBoxStyle: CSSProperties,
  cropWidgetXY: {
    x: number
    y: number
  }
  holdPosition: {
    left: number
    top: number
  }
}

const props = defineProps<TProps>()
const source = computed(() => resolveLinkedImage(props.params, useWidgetStore().dWidgets))
const state = reactive<TState>({
  position: 'absolute', // 'absolute'relative
  editBoxStyle: {
    transformOrigin: 'center',
    transform: '',
  },
  cropWidgetXY: {
    x: 0,
    y: 0,
  },
  holdPosition: {
    left: 0,
    top: 0,
  }
})

const widgetRef = ref<HTMLElement | null>(null)

</script>

<style lang="less" scoped>
.mask {
  -webkit-mask-size: 100% 100%;
  -webkit-mask-position: center;
}
.img__box {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  img {
    display: block;
  }
}
.target {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
