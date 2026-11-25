<template>
  <div v-if="frame && natural && rect" ref="rootRef" class="pe-root" data-photo-edit :style="rootStyle">
    <div class="pe-image" :style="imageStyle" @mousedown.stop.prevent="startPan">
      <img v-if="showOutside" class="pe-ghost" :src="src" :style="ghostStyle" draggable="false" alt="" />
      <div class="pe-outline" :style="{ borderWidth: px(1.5) }" />
      <i v-for="c in corners" :key="c" :class="['pe-handle', c]" :style="handleStyle" :title="$t('tinix.ui.photoFrame.corner_hint')" @mousedown.stop.prevent="(e) => startScale(c, e)" />
    </div>
    <div v-if="!frame.mask" class="pe-frame" :style="{ borderWidth: px(2) }" />
    <!-- [TINIX] Draw only the overlap with the actual alpha of the layers above the face. -->
    <svg v-if="faceGuide?.highlight" class="pe-face-highlight" :viewBox="`0 0 ${faceGuideResolution} ${faceGuideResolution}`" preserveAspectRatio="none">
      <path :d="faceGuide.highlight" role="button" tabindex="0" :aria-label="$t('tinix.ui.photoFrame.face_select_layer')"
        @mousedown.stop.prevent @click.stop="pickCover" @keydown.enter.space.stop.prevent="pickCover">
        <title>{{ $t('tinix.ui.photoFrame.face_select_layer') }}</title>
      </path>
    </svg>
    <span v-if="faceArrow" class="pe-face-arrow" :style="faceArrow.style" aria-hidden="true">➜</span>
    <div class="pe-stem" :style="stemStyle" />
    <i class="pe-rotate" :style="rotateStyle" :title="$t('tinix.ui.photoFrame.rotate_hint')" @mousedown.stop.prevent="startRotate">⟳</i>
    <div class="pe-bar" :style="barStyle" @mousedown.stop>
      <!-- [TINIX] The canvas below shows the actual mask and stacking while the crop updates. -->
      <template v-if="frame.slot && frame.templateRole !== 'subject'">
        <button type="button" :aria-pressed="frame.fit === 'cover'" @click="changeFit('cover')">{{ $t('tinix.ui.photoFrame.fill_photo') }}</button>
        <button type="button" :aria-pressed="frame.fit === 'contain'" @click="changeFit('contain')">{{ $t('tinix.ui.photoFrame.fit_photo') }}</button>
        <button type="button" :disabled="detectingFaces" @click="suggestFaces">{{ $t('tinix.ui.photoFrame.face_crop') }}</button>
      </template>
      <button v-if="frame.mask" type="button" :aria-pressed="showOutside" @click="showOutside = !showOutside">{{ $t('tinix.ui.photoFrame.show_outside') }}</button>
      <span>{{ Number(frame.zoom || 1).toFixed(2) }}× · {{ Number(frame.imgRotate || 0).toFixed(1) }}°</span>
      <button type="button" @click="() => exitPhotoEdit()">{{ $t('tinix.ui.photoFrame.done') }}</button>
      <div v-if="faceStatus" class="pe-face-status">
        <span role="status">{{ faceStatus }}</span>
        <button v-if="faceArrow && !detectingFaces && !pickingLayer" type="button" class="pe-apply-drag" @click="applyFaceDrag">
          {{ $t('tinix.ui.photoFrame.face_apply_drag') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// [TINIX] Chế độ "Chỉnh ảnh trong khung": hiện cả tấm ảnh (mờ phần ngoài khung) với tay nắm riêng của ảnh.
// Kéo ảnh = di chuyển ảnh, kéo góc = phóng/thu, kéo nút tròn = xoay quanh tâm khung (Shift: bước 15°).
// Mỗi lần kéo là một bước hoàn tác. Nhấp ra ngoài khung / Enter / Esc / "Xong" để thoát.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useCanvasStore, useWidgetStore } from '@/store'
import { imageFilterStyle, resolveLinkedImage } from '@/utils/tinix/image-effects'
import { checkFrameFaces, faceCropHandoff, faceGuideResolution, type FaceCropCheck } from '@/utils/tinix/face-crop' // [TINIX]
import { renderedLayerTransform } from '@/utils/tinix/cut-piece-review' // [TINIX]
import {
  photoEdit, exitPhotoEdit, canEditPhoto, imageRect, cropForTopLeft, coversFrame,
  setFrameRotation, setPhotoFit, createFrameHistory, frameRotation, MAX_FRAME_ZOOM, minFrameZoom,
} from '@/utils/tinix/photo-frame'

type Pt = { x: number; y: number }
type Corner = 'nw' | 'ne' | 'se' | 'sw'
const corners: Corner[] = ['nw', 'ne', 'se', 'sw']

const widgetStore = useWidgetStore()
const { t } = useI18n()
const { dZoom, dCurrentPage, dPage } = storeToRefs(useCanvasStore())
const { dActiveElement, dWidgets } = storeToRefs(widgetStore)
const rootRef = ref<HTMLElement>()
const natural = ref<{ width: number; height: number } | null>(null)
const detectingFaces = ref(false)
const faceMessage = ref('')
const faceCheck = shallowRef<FaceCropCheck>()
let faceRequest: AbortController | undefined
const pickingLayer = ref(false)
const pickError = ref(false)
let pickRequest: AbortController | undefined

const frame = computed<any>(() => {
  const id = photoEdit.uuid
  if (!id) return null
  return dWidgets.value.find((w: any) => w.uuid === id) || null
})
const src = computed(() => (frame.value ? resolveLinkedImage(frame.value, dWidgets.value).imgUrl : ''))
const scale = computed(() => (Number(dZoom.value) || 100) / 100)
const px = (n: number) => n / scale.value + 'px'
const frameMatrix = computed(() => frame.value
  ? renderedLayerTransform(new Map(dWidgets.value.map(layer => [layer.uuid, layer])), frame.value) : new DOMMatrix())
const frameDeg = computed(() => Math.atan2(frameMatrix.value.b, frameMatrix.value.a) * 180 / Math.PI)
const rect = computed(() => (frame.value && natural.value ? imageRect(frame.value, natural.value) : null))
const faceGuide = computed(() => frame.value && faceCheck.value?.guide(frame.value))
const faceArrow = computed(() => {
  const guide = faceGuide.value
  if (!guide?.delta) return
  const angle = Math.atan2(guide.delta.y, guide.delta.x) * 180 / Math.PI
  const distance = scale.value * Math.hypot(guide.delta.x, guide.delta.y)
  const offset = 22 / distance
  const direction = ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right']
    [(Math.round((angle + frameDeg.value) / 45) + 8) % 8]
  return {
    direction,
    distance: Math.max(1, Math.round(distance)),
    style: {
      left: guide.anchor.x + guide.delta.x * offset + 'px',
      top: guide.anchor.y + guide.delta.y * offset + 'px',
      transform: `translate(-50%, -50%) rotate(${angle}deg) scale(${1 / scale.value})`,
    },
  }
})
const faceStatus = computed(() => {
  if (pickingLayer.value) return t('tinix.ui.photoFrame.face_finding_layer')
  if (pickError.value) return t('tinix.ui.photoFrame.face_layer_unavailable')
  if (detectingFaces.value || !faceGuide.value) return faceMessage.value
  return faceArrow.value ? t('tinix.ui.photoFrame.face_drag_steps', {
    direction: t('tinix.ui.photoFrame.face_drag_' + faceArrow.value.direction),
    distance: faceArrow.value.distance,
  }) : t('tinix.ui.photoFrame.face_no_drag')
})

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
  const { a, b, c, d, e, f: y } = frameMatrix.value
  return { left: e + 'px', top: y + 'px', width: f.width + 'px', height: f.height + 'px', transform: `matrix(${a},${b},${c},${d},0,0)` }
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
const showOutside = ref(false)
watch(() => photoEdit.uuid, () => { showOutside.value = !frame.value?.mask })
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
const barStyle = computed(() => ({ left: '50%', top: 0,
  transform: `translate(-50%, calc(-100% - 10px)) rotate(${-frameDeg.value}deg) scale(${1 / scale.value})`, transformOrigin: '50% 100%' }))

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
  const v = rot({ x: (p.x - f.width / 2) * (f.flip === 'Y' ? -1 : 1),
    y: (p.y - f.height / 2) * (f.flip === 'X' ? -1 : 1) }, -frameRotation(f))
  return { x: f.width / 2 + v.x, y: f.height / 2 + v.y }
}
function applyZoom(f: any, zoom: number) {
  f.zoom = zoom
  f.transform = `scale(${zoom})`
}

// ---- Kéo (mỗi lần kéo = một bước hoàn tác) ----
const history = createFrameHistory()
// [TINIX] Apply the evaluated crop coordinates as one editor undo transaction.
function applyFaceDrag() {
  const current = frame.value
  const target = faceGuide.value?.targetCrop
  if (!current || !target || moving || detectingFaces.value || pickingLayer.value) return
  pickError.value = false
  clearTimeout(nudgeTimer)
  nudgeHistory.commit()
  history.begin()
  Object.assign(current, target)
  history.commit()
  faceMessage.value = t('tinix.ui.photoFrame.face_drag_clear')
}

watch([() => photoEdit.uuid, src], () => {
  faceRequest?.abort()
  pickRequest?.abort()
  faceRequest = undefined
  pickRequest = undefined
  pickingLayer.value = false
  pickError.value = false
  faceCheck.value = undefined
  faceMessage.value = ''
  detectingFaces.value = false
  const handoff = faceCropHandoff.value
  if (handoff?.id === photoEdit.uuid) {
    faceCheck.value = handoff.check
    faceCropHandoff.value = undefined
  }
})

// [TINIX] The red path uses the same sampling grid as the alpha lookup.
async function pickCover(event: Event) {
  const current = frame.value
  const check = faceCheck.value
  const guide = faceGuide.value
  if (!current || !check || !guide?.pickPoint || pickingLayer.value || detectingFaces.value) return
  let point = guide.pickPoint
  const svg = (event?.currentTarget as SVGPathElement | undefined)?.ownerSVGElement
  const transform = svg?.getScreenCTM()
  if (event instanceof MouseEvent && transform) {
    const pixel = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    point = {
      x: (Math.floor(pixel.x) + 0.5) / faceGuideResolution * current.width,
      y: (Math.floor(pixel.y) + 0.5) / faceGuideResolution * current.height,
    }
  }
  const request = new AbortController()
  pickRequest = request
  pickingLayer.value = true
  pickError.value = false
  try {
    const id = await check.pickLayer(point.x, point.y, request.signal)
    if (request.signal.aborted || frame.value !== current || faceCheck.value !== check) return
    if (!id || !dWidgets.value.some(layer => layer.uuid === id && !layer.hidden)) {
      pickError.value = true
      return
    }
    exitPhotoEdit()
    widgetStore.selectWidget({ uuid: id })
  } catch (_) {
    if (!request.signal.aborted) pickError.value = true
  } finally {
    if (pickRequest === request) {
      pickRequest = undefined
      pickingLayer.value = false
    }
  }
}

// [TINIX] Apply the on-demand suggestion as one undoable preview on the real canvas.
async function suggestFaces() {
  const current = frame.value
  const size = natural.value
  const image = document.getElementById(current.uuid)?.querySelector<HTMLImageElement>('img.target')
  if (!size || !image?.naturalWidth) return
  const request = new AbortController()
  faceRequest = request
  pickRequest?.abort()
  pickError.value = false
  faceCheck.value = undefined
  detectingFaces.value = true
  faceMessage.value = t('tinix.ui.photoFrame.face_searching')
  const state = () => [current.fit, current.cropX, current.cropY, current.zoom, current.width, current.height,
    current.left, current.top, current.rotate, current.imgRotate, current.flip, current.mask]
  const before = state()
  let checkingLayers = false
  try {
    const check = await checkFrameFaces(dPage.value, dWidgets.value, current, image, request.signal, () => {
      checkingLayers = true
      faceMessage.value = t('tinix.ui.photoFrame.face_checking_layers')
    })
    if (!check) {
      faceMessage.value = t('tinix.ui.photoFrame.face_none')
      return
    }
    const suggestion = await check.suggest(request.signal)
    if (request.signal.aborted || frame.value !== current) return
    const after = state()
    if (before.some((value, index) => value !== after[index])) {
      faceMessage.value = t('tinix.ui.photoFrame.face_changed')
      return
    }
    if (!suggestion) throw new Error('No crop suggestion')
    history.begin()
    Object.assign(current, { fit: suggestion.fit, cropX: suggestion.cropX, cropY: suggestion.cropY })
    applyZoom(current, suggestion.zoom)
    history.commit()
    faceCheck.value = check
    const status = suggestion.avoidedPaper ? 'face_paper_fit'
      : suggestion.visible < suggestion.total ? 'face_review' : suggestion.fit === 'contain' ? 'face_fit' : 'face_fill'
    faceMessage.value = t('tinix.ui.photoFrame.' + status, { count: suggestion.total })
  } catch (_) {
    if (!request.signal.aborted) faceMessage.value = t(checkingLayers
      ? 'tinix.ui.photoFrame.face_layers_unavailable' : 'tinix.ui.photoFrame.face_unavailable')
  } finally {
    if (faceRequest === request) {
      detectingFaces.value = false
      faceRequest = undefined
    }
  }
}

function changeFit(fit: 'cover' | 'contain') {
  pickRequest?.abort()
  pickError.value = false
  faceMessage.value = ''
  history.begin()
  setPhotoFit(frame.value, fit)
  history.commit()
}
let moving: ((e: MouseEvent) => void) | null = null
function drag(e: MouseEvent, onMove: (e: MouseEvent) => void) {
  if (e.button !== 0) return
  pickRequest?.abort()
  pickError.value = false
  faceMessage.value = ''
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
  const zoom = Math.max(minFrameZoom(f), Number(f.zoom) || 1)
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
  const z0 = Math.max(minFrameZoom(f), Number(f.zoom) || 1)
  const east = corner === 'ne' || corner === 'se'
  const south = corner === 'se' || corner === 'sw'
  const anchor = { x: east ? r0.x : r0.x + r0.width, y: south ? r0.y : r0.y + r0.height }
  const d0 = { x: (east ? 1 : -1) * r0.width, y: (south ? 1 : -1) * r0.height }
  const len = d0.x * d0.x + d0.y * d0.y
  drag(e, (ev) => {
    const p = toImage(toFrame(ev))
    const k = ((p.x - anchor.x) * d0.x + (p.y - anchor.y) * d0.y) / len
    const zoom = Math.max(minFrameZoom(f), Math.min(MAX_FRAME_ZOOM, z0 * k))
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
  if (e.key === 'Enter' && t?.matches('button,[role="button"]') && rootRef.value?.contains(t)) return
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
  pickRequest?.abort()
  pickError.value = false
  faceMessage.value = ''
  const frameDelta = rot(delta, -frameDeg.value)
  const current = frame.value
  const v = rot({ x: frameDelta.x * (current.flip === 'Y' ? -1 : 1), y: frameDelta.y * (current.flip === 'X' ? -1 : 1) }, -frameRotation(current))
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
  faceRequest?.abort()
  pickRequest?.abort()
  document.removeEventListener('mousedown', onDocDown, true)
  document.removeEventListener('keydown', onKey, true)
  onDocUp()
  exitPhotoEdit()
})
</script>

<style scoped>
.pe-root { position: absolute; z-index: 20000; transform-origin: 0 0; }
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
.pe-bar button[aria-pressed="false"] { background: #374151; }
.pe-bar button:disabled { opacity: 0.55; cursor: wait; }
.pe-face-status { position: absolute; inset: 100% 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 5px 8px; background: #1f2937; border-radius: 4px; white-space: normal; pointer-events: none; }
.pe-face-status button { pointer-events: auto; }
.pe-face-highlight { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: multiply; }
.pe-face-highlight path { fill: #ff3b44; fill-opacity: 0.73; pointer-events: visiblePainted; cursor: pointer; }
.pe-face-highlight path:focus-visible { stroke: #fff; stroke-width: 1; outline: none; }
.pe-face-arrow { position: absolute; z-index: 1; padding: 1px 7px; color: #fff; background: #991b1b; border: 1px solid #fff; border-radius: 20px; font-size: 24px; line-height: 26px; pointer-events: none; }
</style>
