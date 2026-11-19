<template>
  <!-- [TINIX] Xem trước một mục Chữ (nhóm chữ + khung) trong hộp tách phần tử: vẽ lại các lớp theo đúng vị trí, thu nhỏ vừa ô -->
  <div class="tgp" :style="{ width: boxW + 'px', height: boxH + 'px' }">
    <div class="tgp__stage" :style="stageStyle">
      <template v-for="(w, i) in layers" :key="(w.uuid || '') + i">
        <img v-if="w.type === 'w-image'" class="tgp__layer" :src="w.imgUrl" alt="" :style="layerStyle(w)" draggable="false" />
        <img v-else-if="w.type === 'w-svg'" class="tgp__layer" :src="svgSrc(w)" alt="" :style="layerStyle(w)" draggable="false" />
        <div v-else-if="w.type === 'w-text'" class="tgp__layer tgp__text" :style="textStyle(w)">{{ plain(w.text) }}</div>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = withDefaults(defineProps<{ widgets: any[]; width: number; height: number; boxW?: number; boxH?: number }>(), { boxW: 96, boxH: 72 })

/** Bỏ lớp nhóm (chỉ là khung chứa) và lớp ẩn; giữ thứ tự lớp (lớp sau nằm trên) */
const layers = computed(() => (props.widgets || []).filter((w) => w && w.type !== 'w-group' && !w.hidden))
const scale = computed(() => {
  const w = Number(props.width) || 1
  const h = Number(props.height) || 1
  return Math.min(props.boxW / w, props.boxH / h)
})
const stageStyle = computed(() => {
  const s = scale.value
  const w = (Number(props.width) || 0) * s
  const h = (Number(props.height) || 0) * s
  return { width: (Number(props.width) || 0) + 'px', height: (Number(props.height) || 0) + 'px', transform: `scale(${s})`, left: (props.boxW - w) / 2 + 'px', top: (props.boxH - h) / 2 + 'px' }
})

const rotate = (w: any) => {
  const r = parseFloat(String(w.rotate || 0)) || 0
  return r ? `rotate(${r}deg)` : ''
}
function layerStyle(w: any) {
  return { left: (Number(w.left) || 0) + 'px', top: (Number(w.top) || 0) + 'px', width: (Number(w.width) || 0) + 'px', height: (Number(w.height) || 0) + 'px', opacity: w.opacity ?? 1, transform: rotate(w) }
}
function textStyle(w: any) {
  return {
    ...layerStyle(w),
    height: 'auto',
    minHeight: (Number(w.height) || 0) + 'px',
    fontSize: (Number(w.fontSize) || 24) + 'px',
    fontFamily: `'${w.fontClass?.value || w.fontFamily || 'sans-serif'}', sans-serif`,
    fontWeight: w.fontWeight || 'normal',
    fontStyle: w.fontStyle || 'normal',
    color: w.color || '#333',
    textAlign: w.textAlign || 'left',
    lineHeight: String(w.lineHeight || 1.2),
    letterSpacing: (Number(w.letterSpacing) || 0) + 'px',
    writingMode: w.writingMode || 'horizontal-tb',
    background: w.backgroundColor || 'transparent',
  }
}
/** Chữ thuần (không dùng v-html): <br> thành xuống dòng, bỏ thẻ khác */
function plain(html: any): string {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
}
/** SVG của bộ dựng có chỗ đặt màu {{colors[i]}}: thay bằng màu thật rồi vẽ như ảnh */
function svgSrc(w: any): string {
  let markup = String(w.svgUrl || '')
  if (/^data:image\/svg\+xml/i.test(markup)) return markup
  ;(w.colors || []).forEach((c: string, i: number) => {
    markup = markup.split(`{{colors[${i}]}}`).join(c)
  })
  return 'data:image/svg+xml,' + encodeURIComponent(markup)
}
</script>

<style lang="less" scoped>
.tgp {
  position: relative;
  overflow: hidden;
  background: #f4f5f7;
  border-radius: 4px;
}
.tgp__stage {
  position: absolute;
  transform-origin: 0 0;
}
.tgp__layer {
  position: absolute;
  transform-origin: center;
}
.tgp__text {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
