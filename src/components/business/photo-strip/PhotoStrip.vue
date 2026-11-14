<!--
 [TINIX] Dải ảnh ngang phía dưới editor, tối ưu cho thiết kế album.
 - Ảnh chưa dùng sáng bình thường, ảnh đã dùng (trong BẤT KỲ trang nào của thiết kế đang mở) tối đi kèm số lần dùng.
 - Canvas chỉ dùng ảnh nhẹ; ảnh gốc chỉ dùng khi xuất thành phẩm (xem utils/tinix/photo-source.ts).
 - Sao ★ = sao chép vào bộ sưu tập "Yêu thích" của thư viện Ảnh (còn nguyên khi xóa tất cả).
-->
<template>
  <div :class="['tinix-photo-dock', { collapsed }]" :style="{ height: (collapsed ? HEAD_H : dockH) + 'px' }" @dragover.prevent @drop.prevent="onDropFiles">
    <div v-if="!collapsed" :class="['dock-resizer', { on: dockDragging }]" :title="$t('tinix.ui.panelResize.keo_chinh')" @mousedown="onDockDown" @dblclick="resetDock" />
    <div class="dock-head" :style="{ height: HEAD_H + 'px' }">
      <button type="button" class="fold" :title="collapsed ? $t('tinix.ui.photoDock.mo') : $t('tinix.ui.photoDock.thu_gon')" @click="toggleCollapsed">{{ collapsed ? '▴' : '▾' }}</button>
      <span class="title">{{ $t('tinix.ui.photoDock.anh') }}</span>
      <span class="count">{{ summary }}</span>

      <div class="seg" role="group">
        <button type="button" :class="{ on: photoState.source === 'uploads' }" @click="setSource('uploads')">{{ $t('tinix.ui.photoDock.da_tai') }}</button>
        <button type="button" :class="{ on: photoState.source === 'collection' }" @click="setSource('collection')">{{ $t('tinix.ui.photoDock.bo_suu_tap') }}</button>
      </div>
      <div class="seg" role="group">
        <button type="button" :class="{ on: photoState.filter === 'all' }" @click="photoState.filter = 'all'">{{ $t('tinix.ui.photoDock.tat_ca') }}</button>
        <button type="button" :class="{ on: photoState.filter === 'unused' }" @click="photoState.filter = 'unused'">{{ $t('tinix.ui.photoDock.chua_dung') }}</button>
        <button type="button" :class="{ on: photoState.filter === 'used' }" @click="photoState.filter = 'used'">{{ $t('tinix.ui.photoDock.da_dung') }}</button>
      </div>
      <select v-model="photoState.sort" class="sort" :title="$t('tinix.ui.photoDock.sap_xep')">
        <option value="taken">{{ $t('tinix.ui.photoDock.theo_thoi_gian') }}</option>
        <option value="name">{{ $t('tinix.ui.photoDock.theo_ten') }}</option>
        <option value="new">{{ $t('tinix.ui.photoDock.moi_tai') }}</option>
      </select>

      <span class="spacer" />
      <span v-if="photoState.up.active" class="progress">{{ $t('tinix.ui.photoDock.dang_tai', { done: photoState.up.done, total: photoState.up.total }) }}</span>
      <template v-if="photoState.source === 'uploads'">
        <el-button size="small" :disabled="photoState.up.active" @click="pickFiles">{{ $t('tinix.ui.photoDock.tai_anh') }}</el-button>
        <el-button size="small" :disabled="photoState.up.active" @click="pickFolder">{{ $t('tinix.ui.photoDock.chon_thu_muc') }}</el-button>
        <el-button size="small" type="danger" plain :disabled="photoState.up.active || !photoState.photos.length" @click="clearAllPhotos">{{ $t('tinix.ui.photoDock.xoa_tat_ca') }}</el-button>
      </template>
    </div>
    <div v-if="photoState.up.active" class="up-bar"><i :style="{ width: (photoState.up.total ? (photoState.up.done / photoState.up.total) * 100 : 0) + '%' }" /></div>

    <div v-show="!collapsed" ref="rowRef" class="dock-body" @wheel="onWheel">
      <div v-if="photoState.unauthorized" class="empty">
        {{ $t('tinix.ui.photoDock.can_dang_nhap') }} <el-button size="small" link type="primary" @click="reload">{{ $t('tinix.ui.photoDock.tai_lai') }}</el-button>
      </div>
      <div v-else-if="!items.length" class="empty">
        <template v-if="photoState.source === 'collection'">{{ $t('tinix.ui.photoDock.bst_trong') }}</template>
        <template v-else-if="photoState.photos.length">{{ $t('tinix.ui.photoDock.khong_co_anh_loc') }}</template>
        <template v-else>{{ $t('tinix.ui.photoDock.chua_co_anh') }}</template>
      </div>
      <div v-else class="row">
        <div v-for="it in items" :key="it.key" :class="['ph', { used: countFor(it) > 0 }]" :style="{ width: tileW(it) + 'px', height: rowH + 'px' }" :title="tip(it)" @click="onClick($event, it)" @contextmenu.prevent="openMenu($event, it)">
          <img :src="it.thumb" alt="" draggable="false" loading="lazy" @mousedown="onDown($event, it)" />
          <span v-if="countFor(it) > 0" class="badge">{{ $t('tinix.ui.photoDock.da_dung_n', { n: countFor(it) }) }}</span>
          <button type="button" :class="['star', { on: isFav(it) }]" :title="isFav(it) ? $t('tinix.ui.photoDock.go_yeu_thich') : $t('tinix.ui.photoDock.them_yeu_thich')" @click.stop="toggleFav(it)" @mousedown.stop>{{ isFav(it) ? '★' : '☆' }}</button>
          <button v-if="!it.fromCollection" type="button" class="del" :title="$t('tinix.ui.photoDock.xoa_khoi_thu_vien')" @click.stop="removePhoto(it)" @mousedown.stop>×</button>
        </div>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" multiple style="display: none" @change="onPicked($event)" />
    <input ref="folderInput" type="file" webkitdirectory multiple style="display: none" @change="onPicked($event)" />

    <!-- menu chuột phải -->
    <div v-if="menu" class="dock-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop @contextmenu.prevent>
      <div class="mi" @click="menuDo('add')">{{ $t('tinix.ui.photoDock.them_vao_canvas') }}</div>
      <div class="mi" @click="menuDo('fav')">{{ isFav(menu.item) ? $t('tinix.ui.photoDock.go_yeu_thich') : $t('tinix.ui.photoDock.them_yeu_thich') }}</div>
      <div v-if="!menu.item.fromCollection" class="mi danger" @click="menuDo('del')">{{ $t('tinix.ui.photoDock.xoa_khoi_thu_vien') }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElButton, ElMessage, ElMessageBox } from 'element-plus'
import i18n from '@/languages'
import DragHelper from '@/common/hooks/dragHelper'
import setImageData from '@/common/methods/DesignFeatures/setImage'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import eventBus from '@/utils/plugins/eventBus'
import { applyImageSource, collectUsedUrls, staticPathOf } from '@/utils/tinix/photo-source'
import { usePanelResize } from '@/utils/tinix/panel-resize'
import { apiFailed, apiMessage } from '@/utils/tinix/api-result'
import { useCanvasStore, useControlStore, useWidgetStore } from '@/store'
import * as photosApi from '@/api/tinix-photos'
import { photoState, reloadCollection, reloadPhotos, placeValue, sortItems, toStripItems, uploadFiles, type StripItem } from '@/utils/tinix/photo-strip'

const HEAD_H = 38
const t = (k: string, p?: any) => i18n.global.t(k, p) as string

const canvasStore = useCanvasStore()
const controlStore = useControlStore()
const widgetStore = useWidgetStore()
const { dLayouts, dWidgets } = storeToRefs(widgetStore)

// ── kích thước dải (kéo thanh ở mép trên) + thu gọn ──
const { width: dockH, dragging: dockDragging, onDown: onDockDown, reset: resetDock } = usePanelResize({ key: 'dock', def: 170, min: 110, max: 380, side: 'bottom' })
const collapsed = ref(localStorage.getItem('tinix.photoDock.collapsed') === '1')
const rowH = computed(() => Math.max(60, dockH.value - HEAD_H - 20))
// chiều cao thực của dải (thu gọn chỉ còn hàng tiêu đề) → biến CSS để nút zoom nằm phía trên dải
watch([collapsed, dockH], () => document.documentElement.style.setProperty('--tinix-dock-h', (collapsed.value ? HEAD_H : dockH.value) + 'px'), { immediate: true })
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  localStorage.setItem('tinix.photoDock.collapsed', collapsed.value ? '1' : '0')
  nextTick(() => window.dispatchEvent(new Event('resize'))) // canvas vừa lại theo chiều cao còn lại
}

// ── ảnh nào đã dùng: quét mọi trang (artboard) của thiết kế đang mở ──
const layouts = computed(() => dLayouts.value.map((l: any, i: number) => (i === canvasStore.dCurrentPage ? { global: l.global, layers: dWidgets.value } : l)))
const usedUrls = computed(() => collectUsedUrls(layouts.value as any))
const usedCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of layouts.value as any[]) {
    if (l.global && l.global.backgroundImage) m.set(staticPathOf(l.global.backgroundImage), (m.get(staticPathOf(l.global.backgroundImage)) || 0) + 1)
    for (const w of l.layers || []) {
      if (!w || !w.imgUrl) continue
      const k = staticPathOf(w.imgUrl)
      m.set(k, (m.get(k) || 0) + 1)
    }
  }
  return m
})
const collectionByHash = computed(() => {
  const m = new Map<string, photosApi.TCollectionItem>()
  for (const c of photoState.collection) if (c.hash) m.set(c.hash, c)
  return m
})
function countFor(it: StripItem): number {
  const keys = new Set<string>([staticPathOf(it.web)])
  if (it.hq) keys.add(staticPathOf(it.hq))
  const fav = it.hash ? collectionByHash.value.get(it.hash) : undefined // ảnh đã đặt từ bản sao trong bộ sưu tập vẫn tính là đã dùng
  if (fav) {
    keys.add(staticPathOf(fav.url))
    if (fav.hq) keys.add(staticPathOf(fav.hq))
  }
  let n = 0
  keys.forEach((k) => (n += usedCounts.value.get(k) || 0))
  return n
}

// ── danh sách hiển thị ──
const items = computed(() => {
  let list = toStripItems()
  if (photoState.filter !== 'all') list = list.filter((it) => (countFor(it) > 0) === (photoState.filter === 'used'))
  return sortItems(list, photoState.sort)
})
const summary = computed(() => {
  const all = toStripItems()
  const unused = all.filter((it) => countFor(it) === 0).length
  return t('tinix.ui.photoDock.tom_tat', { n: all.length, unused })
})
const tileW = (it: StripItem) => Math.round(rowH.value * Math.min(1.8, Math.max(0.6, it.width / (it.height || 1))))
const tip = (it: StripItem) => [it.name, it.width && it.height ? `${it.width}×${it.height}` : ''].filter(Boolean).join(' · ')
const isFav = (it: StripItem) => it.fromCollection || (!!it.hash && photoState.favorites.includes(it.hash))

function setSource(s: 'uploads' | 'collection') {
  photoState.source = s
  if (s === 'collection') reloadCollection()
}
const reload = async () => {
  await reloadPhotos()
  await reloadCollection()
}

// ── thêm vào canvas: bấm hoặc kéo thả ──
const dragHelper = new DragHelper()
let downPos = { x: 0, y: 0 }
async function onDown(e: MouseEvent, it: StripItem) {
  if (e.button !== 0) return
  e.preventDefault()
  downPos = { x: e.clientX, y: e.clientY }
  const value = placeValue(it)
  const img = await setImageData({ width: it.width, height: it.height, url: value.url })
  dragHelper.start(e, img.canvasWidth)
  widgetStore.setSelectItem({ data: { value }, type: 'image' })
}
function onClick(e: MouseEvent, it: StripItem) {
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) return // vừa kéo, không phải bấm
  addToCanvas(it)
}
async function addToCanvas(it: StripItem) {
  controlStore.setShowMoveable(false)
  const setting = JSON.parse(JSON.stringify(wImageSetting))
  const img = await setImageData({ width: it.width, height: it.height, url: it.web })
  setting.width = img.width
  setting.height = img.height
  applyImageSource(setting, { url: it.web, hq: it.hq || undefined }) // canvas dùng ảnh nhẹ, nhớ ảnh gốc cho lúc xuất
  const { width: pW, height: pH } = canvasStore.dPage
  setting.left = pW / 2 - img.width / 2
  setting.top = pH / 2 - img.height / 2
  widgetStore.addWidget(setting)
}

// ── yêu thích / xóa ──
async function toggleFav(it: StripItem) {
  try {
    if (isFav(it)) {
      const res: any = await photosApi.unfavorite(it.hash, usedUrls.value)
      if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
      photoState.favorites = photoState.favorites.filter((h) => h !== it.hash)
      photoState.collection = photoState.collection.filter((c) => c.hash !== it.hash)
      ElMessage.success(t('tinix.ui.photoDock.da_go_yeu_thich'))
    } else {
      const res: any = await photosApi.favorite(it.id)
      if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
      photoState.favorites.push(it.hash)
      await reloadCollection()
      ElMessage.success(t('tinix.ui.photoDock.da_them_yeu_thich'))
    }
  } catch (e: any) {
    ElMessage.error((e && (e.message || e.msg)) || t('tinix.ui.photoDock.that_bai'))
  }
}

async function removePhoto(it: StripItem) {
  try {
    await ElMessageBox.confirm(t('tinix.ui.photoDock.xac_nhan_xoa_mot', { name: it.name || '' }), t('tinix.ui.photoDock.xoa_khoi_thu_vien'), { type: 'warning', confirmButtonText: t('tinix.ui.photoDock.xoa'), cancelButtonText: t('tinix.ui.photoDock.huy') })
  } catch (e) {
    return
  }
  const res: any = await photosApi.deletePhoto(it.id, usedUrls.value)
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
  photoState.photos = photoState.photos.filter((p) => p.id !== it.id)
}

async function clearAllPhotos() {
  const pv: any = await photosApi.clearPreview(usedUrls.value)
  if (apiFailed(pv)) return ElMessage.error(apiMessage(pv, t('tinix.ui.photoDock.that_bai')))
  if (!pv.total) return
  try {
    await ElMessageBox.confirm(t('tinix.ui.photoDock.xac_nhan_xoa_het', { total: pv.total, deletable: pv.deletable, kept: pv.kept }), t('tinix.ui.photoDock.xoa_tat_ca'), {
      type: 'warning',
      confirmButtonText: t('tinix.ui.photoDock.xoa_tat_ca'),
      cancelButtonText: t('tinix.ui.photoDock.huy'),
      dangerouslyUseHTMLString: false,
    })
  } catch (e) {
    return
  }
  const res: any = await photosApi.clearAll(usedUrls.value)
  if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
  ElMessage.success(t('tinix.ui.photoDock.da_xoa_het', { n: res.removed }))
  await reloadPhotos()
}

// ── tải lên: chọn tệp / chọn thư mục / kéo thả tệp từ máy ──
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const pickFiles = () => fileInput.value && fileInput.value.click()
const pickFolder = () => folderInput.value && folderInput.value.click()
async function onPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = '' // cho phép chọn lại cùng thư mục
  await doUpload(files)
}
async function onDropFiles(e: DragEvent) {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
  if (files.length && photoState.source === 'uploads') await doUpload(files)
}
async function doUpload(files: File[]) {
  if (!files.length) return
  if (collapsed.value) toggleCollapsed()
  photoState.source = 'uploads'
  const r = await uploadFiles(files)
  if (!r.total) return ElMessage.warning(t('tinix.ui.photoDock.khong_co_anh_hop_le'))
  const ok = r.done - r.failed - r.dup
  ElMessage[r.failed ? 'warning' : 'success'](t('tinix.ui.photoDock.ket_qua_tai', { ok, dup: r.dup, failed: r.failed }))
  if (r.failed) {
    ElMessageBox.alert(r.errors.slice(0, 12).join('\n') + (r.errors.length > 12 ? `\n… +${r.errors.length - 12}` : ''), t('tinix.ui.photoDock.loi_tai'), { confirmButtonText: 'OK' }).catch(() => undefined)
  }
}

// ── menu chuột phải ──
const menu = ref<{ x: number; y: number; item: StripItem } | null>(null)
function openMenu(e: MouseEvent, it: StripItem) {
  menu.value = { x: Math.min(e.clientX, window.innerWidth - 190), y: Math.max(8, e.clientY - 110), item: it }
}
function menuDo(act: 'add' | 'fav' | 'del') {
  const it = menu.value && menu.value.item
  menu.value = null
  if (!it) return
  if (act === 'add') addToCanvas(it)
  else if (act === 'fav') toggleFav(it)
  else removePhoto(it)
}
const closeMenu = () => (menu.value = null)

// ── cuộn ngang bằng con lăn ──
const rowRef = ref<HTMLElement | null>(null)
function onWheel(e: WheelEvent) {
  const el = rowRef.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

const onOpen = () => collapsed.value && toggleCollapsed()
onMounted(() => {
  reload()
  window.addEventListener('click', closeMenu)
  eventBus.on('tinix:open-photo-dock', onOpen)
  nextTick(() => window.dispatchEvent(new Event('resize'))) // canvas vừa lại ngay lần đầu có dải
})
onBeforeUnmount(() => {
  document.documentElement.style.removeProperty('--tinix-dock-h')
  window.removeEventListener('click', closeMenu)
  eventBus.off('tinix:open-photo-dock', onOpen)
})
</script>

<style lang="less" scoped>
.tinix-photo-dock {
  position: relative;
  flex: none;
  width: 100%;
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  .dock-resizer {
    position: absolute;
    left: 0;
    right: 0;
    top: -3px;
    height: 6px;
    z-index: 98;
    cursor: ns-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .dock-resizer:hover,
  .dock-resizer.on {
    background: rgba(63, 106, 247, 0.35);
  }
  .dock-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    font-size: 12px;
    color: #555;
    white-space: nowrap;
    .fold {
      border: 0;
      background: none;
      cursor: pointer;
      font-size: 14px;
      color: #666;
      padding: 0 4px;
    }
    .title {
      font-weight: 600;
      color: #333;
    }
    .count {
      color: #999;
    }
    .spacer {
      flex: 1;
    }
    .progress {
      color: #3f6af7;
    }
    .seg {
      display: inline-flex;
      border: 1px solid #dcdfe6;
      border-radius: 6px;
      overflow: hidden;
      button {
        border: 0;
        background: #fff;
        color: #666;
        font-size: 12px;
        padding: 3px 10px;
        cursor: pointer;
      }
      button.on {
        background: #3f6af7;
        color: #fff;
      }
    }
    .sort {
      font-size: 12px;
      padding: 2px 4px;
      border: 1px solid #dcdfe6;
      border-radius: 6px;
      background: #fff;
      color: #555;
    }
  }
  .up-bar {
    flex: none;
    height: 2px;
    background: #eef2ff;
    i {
      display: block;
      height: 100%;
      background: #3f6af7;
      transition: width 0.2s;
    }
  }
  .dock-body {
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px 12px 10px;
    .row {
      display: flex;
      gap: 8px;
      height: 100%;
    }
    .empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 13px;
    }
  }
  .ph {
    position: relative;
    flex: none;
    border-radius: 4px;
    overflow: hidden;
    background: #f1f2f4;
    cursor: grab;
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: filter 0.15s;
      user-select: none;
    }
    &.used img {
      filter: brightness(0.42); /* ảnh đã dùng tối hơn */
    }
    &.used:hover img {
      filter: brightness(0.75);
    }
    .badge {
      position: absolute;
      left: 4px;
      bottom: 4px;
      padding: 1px 6px;
      font-size: 11px;
      color: #fff;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 8px;
      pointer-events: none;
    }
    .star,
    .del {
      position: absolute;
      top: 3px;
      width: 20px;
      height: 20px;
      line-height: 18px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      font-size: 13px;
      text-align: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .star {
      left: 3px;
    }
    .star.on {
      opacity: 1;
      color: #ffd54a;
    }
    .del {
      right: 3px;
    }
    .del:hover {
      background: #f56c6c;
    }
  }
  .ph:hover .star,
  .ph:hover .del {
    opacity: 1;
  }
  .dock-menu {
    position: fixed;
    z-index: 3000;
    min-width: 170px;
    padding: 4px 0;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    font-size: 13px;
    .mi {
      padding: 7px 14px;
      cursor: pointer;
      color: #333;
    }
    .mi:hover {
      background: #f5f7fa;
    }
    .mi.danger {
      color: #f56c6c;
    }
  }
}
</style>
