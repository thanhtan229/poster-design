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
      <el-button size="small" :disabled="photoState.up.active" @click="pickFiles">{{ $t('tinix.ui.photoDock.tai_anh') }}</el-button>
      <el-button size="small" :disabled="photoState.up.active" @click="pickFolder">{{ $t('tinix.ui.photoDock.chon_thu_muc') }}</el-button>
      <el-button size="small" type="danger" plain :disabled="photoState.up.active || !photoState.photos.length" @click="clearAllPhotos">{{ $t('tinix.ui.photoDock.xoa_tat_ca') }}</el-button>
    </div>
    <!-- [TINIX] hàng công cụ: ảnh đã chọn + tự áp dụng mẫu phù hợp cho lượt ảnh thêm vào trang -->
    <div v-show="!collapsed" class="dock-tools" :style="{ height: TOOL_H + 'px' }">
      <span v-if="selected.length" class="sel-info">{{ $t('tinix.ui.photoAuto.da_chon_n', { n: selected.length }) }} <button type="button" class="lk" @click="clearSelection">{{ $t('tinix.ui.photoAuto.bo_chon') }}</button></span>
      <span v-else class="sel-hint">{{ $t('tinix.ui.photoAuto.huong_dan') }}</span>
      <span class="spacer" />
      <label class="auto-sw" :title="$t('tinix.ui.photoAuto.tip')">
        <el-switch :model-value="photoState.autoApply" size="small" @change="(v: any) => setAutoApply(!!v)" />
        <span>{{ $t('tinix.ui.photoAuto.tu_ap_dung') }}</span>
      </label>
      <select v-if="photoState.autoApply" :value="photoState.autoCate" class="sort" :title="$t('tinix.ui.photoAuto.nhom_mau')" @change="setAutoCate(($event.target as HTMLSelectElement).value)">
        <option value="">{{ $t('tinix.ui.photoAuto.moi_nhom') }}</option>
        <option v-for="g in tplGroups" :key="g.id" :value="String(g.id)">{{ g.name }} ({{ g.count }})</option>
      </select>
      <span v-if="photoState.lastAuto" class="last-auto">
        {{ $t('tinix.ui.photoAuto.mau_dang_dung', { title: photoState.lastAuto.title || '#' + photoState.lastAuto.templateId }) }}
        <el-button size="small" type="primary" link :loading="rerolling" @click="reroll">{{ $t('tinix.ui.photoAuto.doi_mau') }}</el-button>
        <button type="button" class="lk" :title="$t('tinix.ui.photoAuto.an')" @click="photoState.lastAuto = null">×</button>
      </span>
    </div>
    <div v-if="photoState.up.active" class="up-bar"><i :style="{ width: (photoState.up.total ? (photoState.up.done / photoState.up.total) * 100 : 0) + '%' }" /></div>

    <div v-show="!collapsed" ref="rowRef" class="dock-body" @wheel="onWheel" @click.self="clearSelection">
      <div v-if="photoState.unauthorized" class="empty">
        {{ $t('tinix.ui.photoDock.can_dang_nhap') }} <el-button size="small" link type="primary" @click="reload">{{ $t('tinix.ui.photoDock.tai_lai') }}</el-button>
      </div>
      <div v-else-if="!items.length" class="empty">
        <template v-if="photoState.photos.length">{{ $t('tinix.ui.photoDock.khong_co_anh_loc') }}</template>
        <template v-else>{{ $t('tinix.ui.photoDock.chua_co_anh') }}</template>
      </div>
      <div v-else class="row" @click.self="clearSelection">
        <div v-for="it in items" :key="it.key" :class="['ph', { used: countFor(it) > 0, sel: selNo(it) > 0 }]" :style="{ width: tileW(it) + 'px', height: rowH + 'px' }" :title="tip(it)" @click="onClick($event, it)" @contextmenu.prevent="openMenu($event, it)">
          <img :src="it.thumb" alt="" draggable="false" loading="lazy" @mousedown="onDown($event, it)" />
          <span v-if="selNo(it) > 0" class="selno">{{ selNo(it) }}</span>
          <span v-if="countFor(it) > 0" class="badge">{{ $t('tinix.ui.photoDock.da_dung_n', { n: countFor(it) }) }}</span>
          <button type="button" :class="['star', { on: isFav(it) }]" :title="isFav(it) ? $t('tinix.ui.photoDock.go_yeu_thich') : $t('tinix.ui.photoDock.them_yeu_thich')" @click.stop="onStar($event, it)" @mousedown.stop>{{ isFav(it) ? '★' : '☆' }}</button>
          <button type="button" class="del" :title="$t('tinix.ui.photoDock.xoa_khoi_thu_vien')" @click.stop="removePhoto(it)" @mousedown.stop>×</button>
        </div>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" multiple style="display: none" @change="onPicked($event)" />
    <input ref="folderInput" type="file" webkitdirectory multiple style="display: none" @change="onPicked($event)" />

    <!-- menu chuột phải -->
    <div v-if="menu" class="dock-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop @contextmenu.prevent>
      <div class="mi" @click="menuDo('add')">{{ menuAddLabel }}</div>
      <div class="mi" @click="menuDo('fav')">{{ isFav(menu.item) ? $t('tinix.ui.photoDock.go_yeu_thich') : $t('tinix.ui.photoDock.them_yeu_thich') }}</div>
      <div class="mi danger" @click="menuDo('del')">{{ $t('tinix.ui.photoDock.xoa_khoi_thu_vien') }}</div>
    </div>

    <!-- chọn nhóm trong tab Ảnh khi bấm ★ -->
    <div v-if="catPick" class="dock-menu" :style="{ left: catPick.x + 'px', top: catPick.y + 'px' }" @click.stop @contextmenu.prevent>
      <div class="mh">{{ $t('tinix.ui.photoDock.chon_nhom_anh') }}</div>
      <div v-for="c in catPick.cats" :key="c.cate" class="mi" @click="favTo(catPick.item, { cate: c.cate })">{{ c.name }}</div>
      <div class="mi add" @click="favNew(catPick.item)">＋ {{ $t('tinix.ui.photoDock.nhom_moi') }}</div>
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
import { placePhotos, rerollAutoTemplate } from '@/utils/tinix/photo-place'
import { ElSwitch } from 'element-plus'
import eventBus from '@/utils/plugins/eventBus'
import { collectUsedUrls, staticPathOf } from '@/utils/tinix/photo-source'
import { usePanelResize } from '@/utils/tinix/panel-resize'
import { apiFailed, apiMessage } from '@/utils/tinix/api-result'
import { useCanvasStore, useControlStore, useWidgetStore } from '@/store'
import * as photosApi from '@/api/tinix-photos'
import { photoState, reloadPhotos, placeValue, setAutoApply, setAutoCate, sortItems, toStripItems, uploadFiles, type StripItem } from '@/utils/tinix/photo-strip'
import api from '@/api'

const HEAD_H = 38
const TOOL_H = 30 // hàng công cụ (chọn nhiều + tự áp dụng mẫu)
const t = (k: string, p?: any) => i18n.global.t(k, p) as string

const canvasStore = useCanvasStore()
const controlStore = useControlStore()
const widgetStore = useWidgetStore()
const { dLayouts, dWidgets } = storeToRefs(widgetStore)

// ── kích thước dải (kéo thanh ở mép trên) + thu gọn ──
const { width: dockH, dragging: dockDragging, onDown: onDockDown, reset: resetDock } = usePanelResize({ key: 'dock', def: 200, min: 140, max: 400, side: 'bottom' })
const collapsed = ref(localStorage.getItem('tinix.photoDock.collapsed') === '1')
const rowH = computed(() => Math.max(60, dockH.value - HEAD_H - TOOL_H - 20))
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
const favoriteByHash = computed(() => {
  const m = new Map<string, photosApi.TLibraryFavorite>()
  for (const f of photoState.favorites) if (f.hash) m.set(f.hash, f)
  return m
})
function countFor(it: StripItem): number {
  const keys = new Set<string>([staticPathOf(it.web)])
  if (it.hq) keys.add(staticPathOf(it.hq))
  const fav = it.hash ? favoriteByHash.value.get(it.hash) : undefined // ảnh đã đặt từ bản sao trong thư viện "Ảnh" vẫn tính là đã dùng
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
const isFav = (it: StripItem) => !!it.hash && favoriteByHash.value.has(it.hash)

const reload = reloadPhotos

// ── chọn nhiều ảnh (bấm = chọn, Ctrl = thêm/bớt, Shift = chọn dải); KHÔNG tự thêm vào trang ──
const selected = ref<string[]>([]) // key các ô đang chọn, theo thứ tự chọn
let anchorKey = ''
const selNo = (it: StripItem) => selected.value.indexOf(it.key) + 1
const selectedItems = () => selected.value.map((k) => items.value.find((x) => x.key === k)).filter(Boolean) as StripItem[]
const clearSelection = () => {
  selected.value = []
  anchorKey = ''
}
function select(e: MouseEvent, it: StripItem) {
  if (e.shiftKey && anchorKey) {
    const a = items.value.findIndex((x) => x.key === anchorKey)
    const b = items.value.findIndex((x) => x.key === it.key)
    if (a >= 0 && b >= 0) {
      const [from, to] = a < b ? [a, b] : [b, a]
      const range = items.value.slice(from, to + 1).map((x) => x.key)
      selected.value = (e.ctrlKey || e.metaKey ? selected.value : []).concat(range.filter((k) => !(e.ctrlKey || e.metaKey) || selected.value.indexOf(k) < 0))
      return
    }
  }
  if (e.ctrlKey || e.metaKey) {
    selected.value = selected.value.indexOf(it.key) >= 0 ? selected.value.filter((k) => k !== it.key) : selected.value.concat(it.key)
  } else {
    selected.value = selected.value.length === 1 && selected.value[0] === it.key ? [] : [it.key]
  }
  anchorKey = it.key
}

// ── thêm vào trang: kéo thả (cả nhóm ảnh đang chọn) hoặc menu chuột phải ──
const dragHelper = new DragHelper()
let downPos = { x: 0, y: 0 }
async function onDown(e: MouseEvent, it: StripItem) {
  if (e.button !== 0) return
  e.preventDefault()
  downPos = { x: e.clientX, y: e.clientY }
  const sel = selectedItems()
  // kéo ảnh đang chọn (nhiều ảnh) → mang theo cả nhóm; bật tự áp dụng mẫu → luôn đi theo luồng áp dụng mẫu
  const group = sel.some((s) => s.key === it.key) && sel.length > 1 ? sel : photoState.autoApply ? [it] : null
  const value = { ...placeValue(it), ...(group ? { group: group.map(placeValue), auto: photoState.autoApply } : {}) }
  const img = await setImageData({ width: it.width, height: it.height, url: value.url })
  dragHelper.start(e, img.canvasWidth)
  widgetStore.setSelectItem({ data: { value }, type: 'image' })
}
function onClick(e: MouseEvent, it: StripItem) {
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) return // vừa kéo, không phải bấm
  select(e, it)
}
/** Thêm một lượt ảnh vào trang (menu chuột phải): theo ô được bấm hoặc cả nhóm đang chọn */
async function addTargets(it: StripItem) {
  const sel = selectedItems()
  const targets = sel.some((s) => s.key === it.key) ? sel : [it]
  await placePhotos(targets.map(placeValue), photoState.autoApply)
}

// ── tự áp dụng mẫu ──
const tplGroups = ref<Array<{ id: number; name: string; count: number }>>([])
async function loadTplGroups() {
  try {
    const res: any = await api.home.getTemplateCategories(0)
    tplGroups.value = Array.isArray(res?.list) ? res.list.map((g: any) => ({ id: g.id, name: g.name, count: g.count || 0 })) : []
  } catch (e) {
    tplGroups.value = []
  }
}
const rerolling = ref(false)
async function reroll() {
  rerolling.value = true
  try {
    if (!(await rerollAutoTemplate())) ElMessage.warning(t('tinix.ui.photoAuto.khong_co_mau_khac'))
  } finally {
    rerolling.value = false
  }
}

// ── ★ = thêm ảnh vào thư viện "Ảnh" của app (chọn nhóm có sẵn hoặc nhóm mới); bấm lại để gỡ ──
const catPick = ref<{ x: number; y: number; item: StripItem; cats: Array<{ cate: string; name: string }> } | null>(null)
async function onStar(e: MouseEvent | null, it: StripItem, at?: { x: number; y: number }) {
  if (isFav(it)) return unfav(it)
  try {
    const res: any = await api.material.getAssetCategories('photos')
    const cats = Array.isArray(res?.list) ? res.list.map((c: any) => ({ cate: String(c.cate), name: c.name })) : []
    const x = Math.min(e ? e.clientX : at ? at.x : 200, window.innerWidth - 200)
    const y = Math.max(8, (e ? e.clientY : at ? at.y : 300) - 40 - cats.length * 32)
    catPick.value = { x, y, item: it, cats }
  } catch (err) {
    ElMessage.error(t('tinix.ui.photoDock.tai_nhom_loi'))
  }
}
async function favTo(it: StripItem, target: { cate?: string; newName?: string }) {
  catPick.value = null
  try {
    const res: any = await photosApi.favorite(it.id, target)
    if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
    if (!photoState.favorites.some((f) => f.hash === it.hash)) photoState.favorites.push({ hash: it.hash, url: res.item.url, hq: res.item.hq || '', cate: res.cate })
    ElMessage.success(t('tinix.ui.photoDock.da_them_vao_nhom', { name: res.catName }))
    eventBus.emit('tinix:photos-library-changed', undefined) // tab Ảnh tải lại danh sách
  } catch (e: any) {
    ElMessage.error((e && (e.message || e.msg)) || t('tinix.ui.photoDock.that_bai'))
  }
}
async function favNew(it: StripItem) {
  catPick.value = null
  let name = ''
  try {
    const r: any = await ElMessageBox.prompt(t('tinix.ui.photoDock.nhap_ten_nhom'), t('tinix.ui.photoDock.nhom_moi'), {
      confirmButtonText: t('tinix.ui.photoDock.them'),
      cancelButtonText: t('tinix.ui.photoDock.huy'),
      inputValidator: (v: string) => (v && v.trim() ? true : t('tinix.ui.photoDock.ten_trong')),
    })
    name = String(r.value || '').trim()
  } catch (e) {
    return
  }
  if (name) await favTo(it, { newName: name })
}
async function unfav(it: StripItem) {
  try {
    const res: any = await photosApi.unfavorite(it.hash, usedUrls.value)
    if (apiFailed(res)) return ElMessage.error(apiMessage(res, t('tinix.ui.photoDock.that_bai')))
    photoState.favorites = photoState.favorites.filter((f) => f.hash !== it.hash)
    ElMessage.success(t('tinix.ui.photoDock.da_go_yeu_thich'))
    eventBus.emit('tinix:photos-library-changed', undefined)
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
  selected.value = selected.value.filter((k) => k !== it.key)
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
  if (files.length) await doUpload(files)
}
async function doUpload(files: File[]) {
  if (!files.length) return
  if (collapsed.value) toggleCollapsed()
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
  if (!selected.value.includes(it.key)) selected.value = [it.key] // chuột phải ảnh chưa chọn → chọn riêng ảnh đó
  menu.value = { x: Math.min(e.clientX, window.innerWidth - 190), y: Math.max(8, e.clientY - 110), item: it }
}
function menuDo(act: 'add' | 'fav' | 'del') {
  const m = menu.value
  const it = m && m.item
  menu.value = null
  if (!it) return
  if (act === 'add') addTargets(it)
  else if (act === 'fav') onStar(null, it, m ? { x: m.x, y: m.y + 110 } : undefined)
  else removePhoto(it)
}
const menuAddLabel = computed(() => {
  const n = menu.value && selected.value.includes(menu.value.item.key) ? selected.value.length : 1
  if (photoState.autoApply) return t('tinix.ui.photoAuto.ap_dung_mau_n', { n })
  return n > 1 ? t('tinix.ui.photoAuto.them_n_anh', { n }) : t('tinix.ui.photoDock.them_vao_canvas')
})
const closeMenu = () => {
  menu.value = null
  catPick.value = null
}

// ── cuộn ngang bằng con lăn ──
const rowRef = ref<HTMLElement | null>(null)
function onWheel(e: WheelEvent) {
  const el = rowRef.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

const onOpen = () => collapsed.value && toggleCollapsed()
const onAuthChanged = () => {
  clearSelection()
  photoState.photos = []
  photoState.favorites = []
  photoState.lastAuto = null
  reload()
}
onMounted(() => {
  loadTplGroups()
  reload()
  window.addEventListener('click', closeMenu)
  window.addEventListener('tinix:auth-changed', onAuthChanged)
  eventBus.on('tinix:open-photo-dock', onOpen)
  nextTick(() => window.dispatchEvent(new Event('resize'))) // canvas vừa lại ngay lần đầu có dải
})
onBeforeUnmount(() => {
  document.documentElement.style.removeProperty('--tinix-dock-h')
  window.removeEventListener('click', closeMenu)
  window.removeEventListener('tinix:auth-changed', onAuthChanged)
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
  .dock-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    font-size: 12px;
    color: #666;
    white-space: nowrap;
    border-top: 1px solid #f0f1f3;
    .spacer {
      flex: 1;
    }
    .sel-hint {
      color: #aaa;
    }
    .sel-info {
      color: #3f6af7;
    }
    .lk {
      border: 0;
      background: none;
      color: #3f6af7;
      cursor: pointer;
      font-size: 12px;
      padding: 0 4px;
    }
    .auto-sw {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .sort {
      font-size: 12px;
      padding: 2px 4px;
      border: 1px solid #dcdfe6;
      border-radius: 6px;
      background: #fff;
      color: #555;
      max-width: 170px;
    }
    .last-auto {
      color: #444;
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
    &.sel {
      outline: 3px solid #3f6af7;
      outline-offset: -3px;
    }
    .selno {
      position: absolute;
      right: 4px;
      bottom: 4px;
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      padding: 0 4px;
      font-size: 11px;
      text-align: center;
      color: #fff;
      background: #3f6af7;
      border-radius: 9px;
      pointer-events: none;
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
    .mi.add {
      color: #3f6af7;
    }
    .mh {
      padding: 6px 14px 4px;
      font-size: 12px;
      color: #999;
    }
  }
}
</style>
