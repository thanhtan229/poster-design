<!--
 * @Author: ShawnPhang
 * @Date: 2021-08-01 11:12:17
 * @Description: 前端出图 - 用于封面
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @Date: 2024-03-04 18:50:00
-->
<template>
  <div id="cover-wrap"></div>
</template>

<script lang="ts" setup>
import html2canvas from 'html2canvas'
import api from '@/api'
// import { useSetupMapGetters } from '@/common/hooks/mapGetters'
import { storeToRefs } from 'pinia'
import { useCanvasStore, useWidgetStore } from '@/store'
import FontFaceObserver from 'fontfaceobserver'
import { useOriginalImages } from '@/utils/tinix/hq-images' // [TINIX]
import { ElMessage } from 'element-plus' // [TINIX]
import i18n from '@/languages' // [TINIX]

// const { dZoom } = useSetupMapGetters(['dZoom'])

const canvasStore = useCanvasStore()
const widgetStore = useWidgetStore()
const { dZoom } = storeToRefs(canvasStore)

// props: ['modelValue'],
// emits: ['update:modelValue'],

async function createCover(cb: any) {
  const nowZoom = dZoom.value
  // 取消选中元素
  widgetStore.selectWidget({
    uuid: '-1',
  })
  // store.dispatch('selectWidget', {
  //   uuid: '-1',
  // })

  canvasStore.updateZoom(100)
  // store.dispatch('updateZoom', 100)

  const opts = {
    useCORS: true, // 跨域图片
    scale: 0.2,
  }
  setTimeout(async () => {
    const clonePage = document.getElementById('page-design-canvas')?.cloneNode(true) as HTMLElement
    if (!clonePage) return
    clonePage.setAttribute('id', 'clone-page')
    document.body.appendChild(clonePage)
    html2canvas(clonePage, opts).then((canvas) => {
      canvas.toBlob(
        async (blobObj) => {
          if (blobObj) {
            // 上传封面到自建后端，回调返回完整 url
            const file = new File([blobObj], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' })
            const result = await api.material.upload({ file, folder: 'cover/user' }, () => {})
            cb(result)
          }
        },
        'image/jpeg',
        0.15,
      )
      canvasStore.updateZoom(nowZoom)
      // store.dispatch('updateZoom', nowZoom)
      clonePage.remove()
    })
  }, 10)
}

async function createPoster() {
  await checkFonts() // 等待字体加载完成
  const fonts = document.fonts
  const opts = {
    backgroundColor: null, // 关闭背景以支持透明图片生成
    useCORS: true,
    scale: 100 / dZoom.value, // * window.devicePixelRatio
    onclone: (document: any) => fonts.forEach((font) => document.fonts.add(font)),
  }
  // const style = document.createElement('style')
  // document.head.appendChild(style)
  // style.sheet?.insertRule('body > img { display: initial; }')
  const clonePage = document.getElementById('page-design-canvas')?.cloneNode(true) as HTMLElement
  if (!clonePage) throw new Error('Canvas unavailable')
  clonePage.setAttribute('id', 'clone-page')
  document.body.appendChild(clonePage)
  try {
    await useOriginalImages(clonePage, widgetStore.dWidgets) // [TINIX] xuất thành phẩm: dùng ảnh gốc thay cho ảnh nhẹ trên canvas
    let canvas = await html2canvas(clonePage, opts)
    // [TINIX] Kích thước DOM ở mức zoom có thể bị làm tròn; PNG phải đúng khổ trang gốc.
    const width = Math.round(Number(canvasStore.dPage.width))
    const height = Math.round(Number(canvasStore.dPage.height))
    if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
      const exact = document.createElement('canvas')
      exact.width = width
      exact.height = height
      const context = exact.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(canvas, 0, 0, width, height)
      canvas = exact
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG encoding failed')
    return { blob }
  } finally {
    clonePage.remove()
  }
}

// 检查字体是否加载完成
async function checkFonts() {
  const widgets = widgetStore.getWidgets()
  const fontLoaders: Promise<void>[] = []
  widgets.forEach((item: any) => {
    if (item.fontClass && item.fontClass.value) {
      const loader = new FontFaceObserver(item.fontClass.value)
      fontLoaders.push(loader.load(null, 5000)) // [TINIX] không chờ vô hạn khi font đã bị xóa
    }
  })
  const results = await Promise.allSettled(fontLoaders)
  if (results.some((r) => r.status === 'rejected')) ElMessage.warning(i18n.global.t('tinix.ui.photoAuto.font_du_phong'))
}

defineExpose({
  createCover,
  createPoster,
})
</script>

<style lang="less">
#clone-page {
  position: absolute;
  z-index: 99999;
  left: -99999px;
}
</style>
