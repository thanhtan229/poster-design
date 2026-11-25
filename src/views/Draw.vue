<template>
  <div ref="pageDesignIndex">
    <div class="page-design-index-wrap">
      <design-board class="page-design-wrap fixed-canvas" pageDesignCanvasId="page-design-canvas" :padding="0"></design-board>
    </div>
    <!-- 缩放控制 -->
    <zoom-control />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, nextTick } from 'vue'
import api from '@/api'
import config from '@/config'
import {loadLibraryFont} from '@/utils/tinix/font-loader'
import Preload from '@/utils/plugins/preload'
import { swapToOriginalInData } from '@/utils/tinix/photo-source' // [TINIX]
import FontFaceObserver from 'fontfaceobserver'
import { fontMinWithDraw, font2style } from '@/utils/widgets/loadFontRule'
import designBoard from '@/components/modules/layout/designBoard/index.vue'
import zoomControl from '@/components/modules/layout/zoomControl/index.vue'
import { useRoute } from 'vue-router'
// import { wGroupSetting } from '@/components/modules/widgets/wGroup/groupSetting'
import { storeToRefs } from 'pinia'
import { useCanvasStore, useWidgetStore } from '@/store'

const route = useRoute()
const pageStore = useCanvasStore()
const widgetStore = useWidgetStore()
const { dPage } = storeToRefs(pageStore)

onMounted(() => {
  nextTick(() => {
    load().catch((error) => {
      const callback = (window as any).loadFinishToInject
      if (callback) callback({ error: 'Không thể render: ' + String(error?.message || error), issues: error?.issues })
    })
  })
})

async function load() {
  let backgroundImage = ''
  let loadFlag = false
  const { id, tempid, exportJob, tempType: type = 0, index = 0  }: any = route.query
  if (id || tempid || exportJob) {
    const postData = {
      id: id || tempid,
      type: Number(type)
    }
    const renderToken = typeof route.query.token === 'string' ? route.query.token : undefined
    const { data, width, height } = exportJob
      ? await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${encodeURIComponent(exportJob)}/data`).then(r=>{if(!r.ok)throw new Error('Bộ xuất không hợp lệ');return r.json()})
      : id
      ? await api.home.getWorks(postData, renderToken)
      : await api.home.getTempDetail(postData)
    let content = JSON.parse(data)
    const isGroupTemplate = Number(type) == 1

    if (Array.isArray(content) && !isGroupTemplate) {
      const { global, layers } = content[index]
      content = {page: global, widgets: layers}
    }
    const widgets = isGroupTemplate ? content : content.widgets
    // [TINIX] xuất thành phẩm (hq=1): lớp ảnh dùng ảnh gốc thay cho ảnh nhẹ; bìa/xem trước thì giữ ảnh nhẹ cho nhanh
    if (route.query.hq === '1') swapToOriginalInData(widgets)
    
    if (isGroupTemplate) {
      dPage.value.width = width
      dPage.value.height = height
      dPage.value.backgroundColor = '#ffffff00'
      widgetStore.addGroup(content)
    } else {
      pageStore.setDPage(content.page)
      // 移除背景图，作为独立事件
      backgroundImage = content.page?.backgroundImage
      backgroundImage && delete content.page.backgroundImage
      pageStore.setDPage(content.page)
      if (id || exportJob) {
        widgetStore.setDWidgets(widgets)
      } else {
        widgetStore.setTemplate(widgets)
      }
    }

    await Promise.all(widgets.filter((w:any)=>w.type==='w-text'&&w.fontClass?.url).map(async(w:any)=>{
      try { await loadLibraryFont(w.fontClass) }
      catch(error){ throw Object.assign(new Error('Không tải được font yêu cầu: '+String(error)), {issues:[{code:'FONT_LOAD_FAILED',layerId:String(w.uuid),url:w.fontClass.url}]}) }
    }))
    await nextTick()

    const imgsData: HTMLImageElement[] = []
    const svgsData: HTMLImageElement[] = []
    const fontLoaders: Promise<void>[] = []
    const fontContent: Record<string, string> = {}
    let fontData: string[] = []
    widgets.forEach((item: any) => {
      if (item.fontClass && item.fontClass.value) {
        const loader = new FontFaceObserver(item.fontClass.value)
        fontData.push(item.fontClass)
        // Library faces have explicit loading above; system faces are already
        // available and may have identical metrics to FontFaceObserver fallbacks.
        if (item.fontClass.url) fontLoaders.push(loader.load(null, 30000))
        // 按字体来收集所有文字
        if (fontContent[item.fontClass.value]) {
          fontContent[item.fontClass.value] += item.text
        } else {
          fontContent[item.fontClass.value] = item.text
        }
      }
      // 收集图片元素、svg元素
      try {
        if(item.cutoutBorderUrl){const border=document.getElementById(item.uuid)?.querySelector('img');if(border)imgsData.push(border)}
        if (item.svgUrl && item.type === 'w-svg') {
          const cNodes: any = (window as any).document.getElementById(item.uuid).childNodes
          svgsData.push(cNodes)
        } else if (item.imgUrl && !item.isNinePatch) {
          const cNodes: any = (window as any).document.getElementById(item.uuid).childNodes
          for (const el of cNodes) {
            if (el.className && el.className.includes('img__box')) {
              const image = (el as Element).querySelector('img')
              if (image) imgsData.push(image)
            }
          }
        }
      } catch {}
    })
    // 背景图无法检测是否加载完毕，所以单独做判断
    if (backgroundImage) {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => reject(Object.assign(new Error('Không tải được ảnh nền: ' + backgroundImage), {issues:[{code:'BACKGROUND_LOAD_FAILED',layerId:'-1',url:backgroundImage}]}))
        img.src = backgroundImage
      })
      pageStore.setDPage({...content.page, ...{backgroundImage}})
      // store.commit('setDPage', {...content.page, ...{backgroundImage}})
    }
    fontMinWithDraw && (await font2style(fontContent, fontData))
    // console.log('1. base64 yes')
    const preload = new Preload(imgsData)
    await preload.doms()
    const failedImage = imgsData.find((image) => image.getClientRects().length && !image.naturalWidth)
    if (failedImage) throw Object.assign(new Error('Không tải được ảnh: ' + (failedImage.closest('.w-image')?.id || failedImage.currentSrc || failedImage.src)), {issues:[{code:'IMAGE_LOAD_FAILED',layerId:failedImage.closest('.w-image')?.id,url:failedImage.currentSrc||failedImage.src}]})
    // console.log('2. image yes')
    const preload2 = new Preload(svgsData)
    await preload2.svgs()
    // console.log('3. svg yes')
    try {
      await Promise.all(fontLoaders)
      // console.log('4. font yes')
    } catch {
      // console.log(e)
    }
    // [TINIX] 'load' chỉ báo ảnh đã tải, chưa chắc đã giải mã/vẽ: ảnh rất lớn (vd 8268×11220) giải mã mất vài giây nên ảnh chụp ra trong suốt
    // (bìa mẫu thành màu đen). Chờ giải mã xong cả ảnh các lớp lẫn ảnh nền (nền là CSS nên nạp trước một bản để dùng chung cache) rồi chờ 2 khung vẽ.
    try {
      const decodes: Promise<unknown>[] = imgsData.map((el: any) => (el && el.decode ? el.decode() : Promise.resolve()))
      if (backgroundImage) {
        const bg = new Image()
        bg.src = backgroundImage
        decodes.push(bg.decode())
      }
      await Promise.all(decodes.map((p) => p.catch(() => undefined)))
      await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)) })
    } catch {
      // không giải mã được: vẫn chụp như cũ
    }
    loadFlag = true
    console.log('--> now u can start screenshot!')
    setTimeout(() => {
      try {
        ;(window as any).loadFinishToInject('done')
      } catch {}
    }, route.query.trimAlpha === '1' ? 0 : 100) // [TINIX] The trim render has already waited for image decode and paint.
  }
  // 超时
  setTimeout(() => {
    !loadFlag && (window as any).loadFinishToInject('done')
  }, 60000)
}
</script>

<style lang="less" scoped>
@import url('@/assets/styles/design.less');
.fixed-canvas {
  min-width: 0 !important;
  width: 100% !important;
  :deep(#page-design-canvas) {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
  }
}
</style>

<style lang="less">
.layer-hover {
  outline: 0 !important;
}
</style>
