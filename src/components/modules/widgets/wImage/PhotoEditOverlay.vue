<template>
  <div v-if="frame && natural && rect" ref="rootRef" class="pe-root" data-photo-edit :style="rootStyle">
    <div class="pe-image" :style="imageStyle" @mousedown.stop.prevent="startPan">
      <img class="pe-ghost" :src="src" :style="ghostStyle" draggable="false" alt="" />
      <div class="pe-outline" :style="{ borderWidth: px(1.5) }" />
      <i v-for="c in corners" :key="c" :class="['pe-handle', c]" :style="handleStyle" :title="$t('tinix.ui.photoFrame.corner_hint')" @mousedown.stop.prevent="(e) => startScale(c, e)" />
    </div>
    <div class="pe-frame" :style="{ borderWidth: px(2) }" />
    <div class="pe-stem" :style="stemStyle" />
    <i class="pe-rotate" :style="rotateStyle" :title="$t('tinix.ui.photoFrame.rotate_hint')" @mousedown.stop.prevent="startRotate">⟳</i>
    <div class="pe-bar" :style="barStyle" @mousedown.stop>
      <span>{{ Number(frame.zoom || 1).toFixed(2) }}× · {{ Number(frame.imgRotate || 0).toFixed(1) }}°</span>
      <button type="button" @click="() => exitPhotoEdit()">{{ $t('tinix.ui.photoFrame.done') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// [TINIX] Chế độ "Chỉnh ảnh trong khung": hiện cả tấm ảnh (mờ phần ngoài khung) với tay nắm riêng của ảnh.
// Kéo ảnh = di chuyển ảnh, kéo góc = phóng/thu, kéo nút tròn = xoay quanh tâm khung (Shift: bước 15°).
// Mỗi lần kéo là một bước hoàn tác. Nhấp ra ngoài khung / Enter / Esc / "Xong" để thoát.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore, useWidgetStore } from '@/store'
import { imageFilterStyle, resolveLinkedImage } from '@/utils/tinix/image-effects'
import {
  photoEdit, exitPhotoEdit, canEditPhoto, imageRect, cropForTopLeft, coversFrame,
  setFrameRotation, createFrameHistory, frameRotation, MAX_FRAME_ZOOM, MIN_FRAME_ZOOM,
} from '@/utils/tinix/photo-frame'

type Pt = { x: number; y: number }
type Corner = 'nw' | 'ne' | 'se' | 'sw'
const corners: Corner[] = ['nw', 'ne', 'se', 'sw']

const widgetStore = useWidgetStore()
const { dZoom, dCurrentPage } = storeToRefs(useCanvasStore())
const { dActiveElement, dWidgets } = storeToRefs(widgetStore)
const rootRef = ref<HTMLElement>()
const natural = ref<{ width: number; height: number } | null>(null)

const frame = computed<any>(() => {
  const id = photoEdit.uuid
  if (!id) return null
  return dWidgets.value.find((w: any) => w.uuid === id) || null
})
const src = computed(() => (frame.value ? resolveLinkedImage(frame.value, dWidgets.value).imgUrl : ''))
const scale = computed(() => (Number(dZoom.value) || 100) / 100)
const px = (n: number) => n / scale.value + 'px'
const frameDeg = computed(() => parseFloat(String(frame.value?.rotate || 0)) || 0)
const rect = computed(() => (frame.value && natural.value ? imageRect(frame.value, natural.value) : null))

function measure() {
  natural.value = null
  const url = src.value
  if (!url) return
  const img = new Image()
  img.onload = () => {
    if (url === src.value && img.naturalWidth) natural.value = { width: img.naturalWidth, height: img.naturalHeight }
  }
  img.src = url
}
watch(src, measure, { immediate: true })

// Thoát khi khung không còn hợp lệ hoặc người dùng chọn đối tượng khác / đổi trang.
watch(() => [frame.value && canEditPhoto(frame.value), dActiveElement.value?.uuid, dCurrentPage.value] as const, ([ok, active], old) => {
  if (!photoEdit.uuid) return
  if (!ok || active !== photoEdit.uuid || (old && old[2] !== dCurrentPage.value)) exitPhotoEdit()
})

const rootStyle = computed(() => {
  const f = frame.value
  return { left: f.left + 'px', top: f.top + 'px', width: f.width + 'px', height: f.height + 'px', transform: frameDeg.value ? `rotate(${frameDeg.value}deg)` : undefined }
})
const imageStyle = computed(() => {
  const r = rect.value!
  const f = frame.value
  return {
    left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px',
    transform: `rotate(${frameRotation(f)}deg)`, transformOrigin: `${f.width / 2 - r.x}px ${f.height / 2 - r.y}px`,
  }
})
const ghostStyle = computed(() => imageFilterStyle(frame.value))
const handleStyle = computed(() => ({ width: px(14), height: px(14), margin: `-${px(7)} 0 0 -${px(7)}`, borderWidth: px(2) }))
// Nút xoay quay quanh tâm khung theo góc ảnh, luôn nằm dưới khung.
const orbit = computed(() => {
  const f = frame.value
  const a = (frameRotation(f) * Math.PI) / 180
  const d = f.height / 2 + 34 / scale.value
  return { x: f.width / 2 - Math.sin(a) * d, y: f.height / 2 + Math.cos(a) * d, deg: frameRotation(f) }
})
const rotateStyle = computed(() => ({ left: orbit.value.x + 'px', top: orbit.value.y + 'px', transform: `translate(-50%, -50%) scale(${1 / scale.value})` }))
const stemStyle = computed(() => ({ left: frame.value.width / 2 + 'px', top: frame.value.height / 2 + 'px', height: frame.value.height / 2 + 34 / scale.value + 'px', width: px(1.5), transform: `rotate(${orbit.value.deg}deg)` }))
const barStyle = computed(() => ({ left: '50%', top: 0, transform: `translate(-50%, calc(-100% - 10px)) scale(${1 / scale.value})`, transformOrigin: '50% 100%' }))

// ---- Hình học: màn hình → hệ tọa độ khung → hệ tọa độ ảnh chưa xoay ----
const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }
}
function toFrame(e: MouseEvent): Pt {
  const f = frame.value
  const box = document.getElementById(f.uuid)?.getBoundingClientRect() || rootRef.value!.getBoundingClientRect()
  const v = rot({ x: (e.clientX - (box.left + box.width / 2)) / scale.value, y: (e.clientY - (box.top + box.height / 2)) / scale.value }, -frameDeg.value)
  return { x: f.width / 2 + v.x, y: f.height / 2 + v.y }
}
function toImage(p: Pt): Pt {
  const f = frame.value
  const v = rot({ x: p.x - f.width / 2, y: p.y - f.height / 2 }, -frameRotation(f))
  return { x: f.width / 2 + v.x, y: f.height / 2 + v.y }
}
function applyZoom(f: any, zoom: number) {
  f.zoom = zoom
  f.transform = `scale(${zoom})`
}

// ---- Kéo (mỗi lần kéo = một bước hoàn tác) ----
const history = createFrameHistory()
let moving: ((e: MouseEvent) => void) | null = null
function drag(e: MouseEvent, onMove: (e: MouseEvent) => void) {
  if (e.button !== 0) return
  history.begin()
  moving = onMove
  document.addEventListener('mousemove', onDocMove, true)
  document.addEventListener('mouseup', onDocUp, true)
}
function onDocMove(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  moving && moving(e)
}
function onDocUp() {
  moving = null
  document.removeEventListener('mousemove', onDocMove, true)
  document.removeEventListener('mouseup', onDocUp, true)
  history.commit()
}

function moveTo(x: number, y: number) {
  const f = frame.value
  const n = natural.value!
  const zoom = Math.max(MIN_FRAME_ZOOM, Number(f.zoom) || 1)
  const want = cropForTopLeft(f, n, zoom, x, y)
  const old = { cropX: f.cropX ?? 50, cropY: f.cropY ?? 50 }
  // Ảnh đã xoay: chỉ nhận vị trí còn phủ kín khung (thử từng chiều nếu cả hai không được).
  const next = [want, { cropX: want.cropX, cropY: old.cropY }, { cropX: old.cropX, cropY: want.cropY }].find((c) => coversFrame(f, n, c, zoom))
  if (next) {
    f.cropX = next.cropX
    f.cropY = next.cropY
  }
}
function startPan(e: MouseEvent) {
  const start = toImage(toFrame(e))
  const r0 = rect.value!
  drag(e, (ev) => {
    const p = toImage(toFrame(ev))
    moveTo(r0.x + p.x - start.x, r0.y + p.y - start.y)
  })
}

function startScale(corner: Corner, e: MouseEvent) {
  const f = frame.value
  const n = natural.value!
  const r0 = rect.value!
  const z0 = Math.max(MIN_FRAME_ZOOM, Number(f.zoom) || 1)
  const east = corner === 'ne' || corner === 'se'
  const south = corner === 'se' || corner === 'sw'
  const anchor = { x: east ? r0.x : r0.x + r0.width, y: south ? r0.y : r0.y + r0.height }
  const d0 = { x: (east ? 1 : -1) * r0.width, y: (south ? 1 : -1) * r0.height }
  const len = d0.x * d0.x + d0.y * d0.y
  drag(e, (ev) => {
    const p = toImage(toFrame(ev))
    const k = ((p.x - anchor.x) * d0.x + (p.y - anchor.y) * d0.y) / len
    const zoom = Math.max(MIN_FRAME_ZOOM, Math.min(MAX_FRAME_ZOOM, z0 * k))
    const s = zoom / z0
    const x = Math.min(anchor.x, anchor.x + d0.x * s)
    const y = Math.min(anchor.y, anchor.y + d0.y * s)
    const crop = cropForTopLeft(f, n, zoom, x, y)
    // Ảnh đã xoay: dừng ở mức cuối còn phủ kín khung thay vì để lộ nền.
    if (!coversFrame(f, n, crop, zoom)) return
    f.cropX = crop.cropX
    f.cropY = crop.cropY
    applyZoom(f, zoom)
  })
}

function startRotate(e: MouseEvent) {
  const f = frame.value
  const c = { x: f.width / 2, y: f.height / 2 }
  const angle = (p: Pt) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
  const a0 = angle(toFrame(e))
  const r0 = Number(f.imgRotate) || 0
  drag(e, (ev) => {
    let deg = r0 + angle(toFrame(ev)) - a0
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15
    else {
      const near = Math.round(deg / 90) * 90
      if (Math.abs(deg - near) < 2) deg = near
    }
    setFrameRotation(f, deg)
  })
}

// ---- Thoát chế độ / phím tắt ----
function onDocDown(e: MouseEvent) {
  if (!photoEdit.uuid) return
  const target = e.target as HTMLElement | null
  if (!target || rootRef.value?.contains(target)) return
  // Chỉ nhấp trên vùng canvas mới thoát; panel bên phải vẫn dùng được trong lúc chỉnh.
  if (target.closest('#page-design')) exitPhotoEdit()
}
let nudgeTimer: any = null
const nudgeHistory = createFrameHistory()
function onKey(e: KeyboardEvent) {
  if (!photoEdit.uuid || !frame.value || !natural.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
  if (e.key === 'Escape' || e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    exitPhotoEdit()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  const step = e.shiftKey ? 10 : 1
  const delta = ({ ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } } as Record<string, Pt>)[e.key]
  if (!delta) return
  e.preventDefault()
  e.stopPropagation()
  // Mũi tên dịch ảnh theo hướng nhìn thấy trên trang.
  const v = rot(rot(delta, -frameDeg.value), -frameRotation(frame.value))
  nudgeHistory.begin()
  moveTo(rect.value!.x + v.x, rect.value!.y + v.y)
  clearTimeout(nudgeTimer)
  nudgeTimer = setTimeout(() => nudgeHistory.commit(), 500)
}
onMounted(() => {
  document.addEventListener('mousedown', onDocDown, true)
  document.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown, true)
  document.removeEventListener('keydown', onKey, true)
  onDocUp()
  exitPhotoEdit()
})
</script>

<style scoped>
.pe-root { position: absolute; z-index: 20000; transform-origin: 50% 50%; }
.pe-image { position: absolute; cursor: move; }
.pe-ghost { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.4; pointer-events: none; user-select: none; }
.pe-outline { position: absolute; inset: 0; border: solid #f97316; pointer-events: none; }
.pe-frame { position: absolute; inset: 0; border: dashed #ffffff; outline: 1px solid rgba(0, 0, 0, 0.35); pointer-events: none; }
.pe-handle { position: absolute; box-sizing: border-box; background: #fff; border: solid #f97316; border-radius: 50%; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }
.pe-handle.nw { left: 0; top: 0; cursor: nwse-resize; }
.pe-handle.ne { left: 100%; top: 0; cursor: nesw-resize; }
.pe-handle.se { left: 100%; top: 100%; cursor: nwse-resize; }
.pe-handle.sw { left: 0; top: 100%; cursor: nesw-resize; }
.pe-stem { position: absolute; background: #f97316; transform-origin: 0 0; pointer-events: none; }
.pe-rotate { position: absolute; width: 26px; height: 26px; line-height: 24px; text-align: center; font-style: normal; font-size: 16px; color: #f97316; background: #fff; border: 2px solid #f97316; border-radius: 50%; cursor: grab; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); user-select: none; }
.pe-bar { position: absolute; display: flex; gap: 8px; align-items: center; padding: 4px 4px 4px 10px; background: #1f2937; color: #fff; border-radius: 6px; font-size: 12px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
.pe-bar button { padding: 4px 12px; border: 0; border-radius: 4px; background: #f97316; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
</style>
