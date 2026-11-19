<template>
  <div v-show="showMenuBg" id="menu-bg" class="menu-bg" data-photo-history @click="closeMenu">
    <ul ref="menuList" class="menu-list" role="menu" tabindex="-1" :aria-label="$t('business.menu.contextMenu')" :style="styleObj" @keydown="menuKeydown">
      <ContextMenuItems :items="menuListData.list" @select="selectMenu" />
    </ul>
  </div>
  <ActionFeedback v-if="feedback" :key="feedback.id" :text="feedback.text" :can-undo="canUndo" @undo="undoFeedback" @close="dismissFeedback" />
</template>

<script lang="ts" setup>
import i18n from '@/languages'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { 
  widgetMenu as widget, 
  pageMenu as page,
  menuList as menu, 
  organizeMenu,
  TMenuItemData, TWidgetItemData, 
} from './rcMenuData'
import { getTarget } from '@/common/methods/target'
import { storeToRefs } from 'pinia';
import { useCanvasStore, useControlStore, useForceStore, useGroupStore, useWidgetStore } from '@/store';
import type { TdWidgetData } from '@/store/design/widget'
import type { TDistributeAxis, TUpdateAlignData } from '@/store/design/widget/actions/align'
import ContextMenuItems from './ContextMenuItems.vue'
import ActionFeedback from './ActionFeedback.vue'
import useActionFeedback from './useActionFeedback'
import { primaryModifierLabel, selectionShortcut } from '@/common/methods/selectionShortcuts'
import { libraryTarget, saveToLibrary } from '@/utils/tinix/library-save' // [TINIX]

const { feedback, canUndo, run, undo, close: dismissFeedback } = useActionFeedback()

const menuListData = ref<TMenuItemData>({...menu})
const showMenuBg = ref<boolean>(false)
const menuList = ref<HTMLUListElement | null>(null)
let previousFocus: HTMLElement | null = null
let unlockTargetId: string | null = null
let showTargetId: string | null = null
const widgetMenu = ref<TWidgetItemData[]>([...widget])
const pageMenu = ref<TWidgetItemData[]>([...page])

const widgetStore = useWidgetStore()
const groupStore = useGroupStore()

const {dActiveElement, dWidgets, dCopyElement, dSelectWidgets} = storeToRefs(widgetStore)
const selectableWidgets = computed(() => dWidgets.value.filter(item => item.parent === '-1' && !item.hidden && !item.lock))
const { dAltDown } = storeToRefs(useControlStore())

const styleObj = computed(() => {
  return {
    left: menuListData.value.left + 'px',
    top: menuListData.value.top + 'px',
  }
})

onMounted(() => {
  document.addEventListener('contextmenu', mouseRightClick)
  document.addEventListener('keydown', handleSelectionShortcut)
})
onBeforeUnmount(() => {
  document.removeEventListener('contextmenu', mouseRightClick)
  document.removeEventListener('keydown', handleSelectionShortcut)
})

function handleSelectionShortcut(event: KeyboardEvent) {
  const command = selectionShortcut(event)
  if (!command || widgetStore.dWidgets.some(item => item.editable)) return
  event.preventDefault()
  if (!event.repeat) void selectMenu(command)
}

function canvasLayerAtPoint(e: MouseEvent): HTMLElement | null {
  const target = e.target as HTMLElement
  if (!target.closest('.design-canvas, #main .moveable-control-box')) return null
  // Let the browser hit-test locked layers too, including transforms and clipping.
  // Restore immediately so ordinary clicks and drags continue to pass through them.
  const locked = Array.from(document.querySelectorAll<HTMLElement>('#page-design .layer-lock'))
  const previous = locked.map(el => [el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')])
  try {
    locked.forEach(el => el.style.setProperty('pointer-events', 'auto', 'important'))
    for (const hit of document.elementsFromPoint(e.clientX, e.clientY)) {
      const layer = hit.closest<HTMLElement>('.design-canvas .layer')
      if (layer) return layer
    }
    return null
  } finally {
    locked.forEach((el, index) => {
      const [value, priority] = previous[index]
      if (value) el.style.setProperty('pointer-events', value, priority)
      else el.style.removeProperty('pointer-events')
    })
  }
}

async function mouseRightClick(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  if (showMenuBg.value) {
    showMenuBg.value = false
    return
  }
  if (!e.target) return
  const eventTarget = e.target as HTMLElement
  const layerRow = eventTarget.closest<HTMLElement>('.widget-list [data-uuid]')
  if (!layerRow && eventTarget.closest('#style-panel .layer-wrap')) {
    void showMenu(e, useCanvasStore().dPage, false)
    return
  }
  const hiddenWidget = layerRow && dWidgets.value.find(item => item.uuid === layerRow.dataset.uuid && item.hidden)
  if (hiddenWidget) {
    void showMenu(e, hiddenWidget, false)
    return
  }
  const canvasLayer = canvasLayerAtPoint(e)
  const lockedLayer = canvasLayer?.closest<HTMLElement>('.layer-lock')
  const contextId = layerRow?.dataset.uuid || lockedLayer?.dataset.uuid
  const lockedWidget = dWidgets.value.find(item => item.uuid === contextId && item.lock)
  if (lockedWidget) {
    void showMenu(e, lockedWidget, false)
    return
  }
  if (layerRow && dSelectWidgets.value.length > 1 && dSelectWidgets.value.some(item => item.uuid === layerRow.dataset.uuid)) {
    void showMenu(e)
    return
  }
  // Moveable's overlay is outside the canvas layers. Keep the current selection.
  if (eventTarget.closest('#main .moveable-control-box') &&
    (dSelectWidgets.value.length > 1 || (dActiveElement.value && dActiveElement.value.uuid !== '-1'))) {
    void showMenu(e)
    return
  }
  let target = layerRow || await getTarget(canvasLayer || eventTarget)
  if (!target) return
  if (dSelectWidgets.value.length > 1 && dSelectWidgets.value.some(item => {
    const layer = document.getElementById(item.uuid)
    return layer === target || layer?.contains(eventTarget)
  })) {
    void showMenu(e)
    return
  }
  let type = target.getAttribute('data-type')
  if (type) {
    let uuid = target.getAttribute('data-uuid') // 设置选中元素

    if (uuid !== '-1' && !dAltDown.value) {
      let widget = dWidgets.value.find((item: any) => item.uuid === uuid)
      if (
        widget?.parent !== '-1' && 
        widget?.parent !== dActiveElement.value?.uuid &&
        widget?.parent !== dActiveElement.value?.parent
      ) {
        uuid = widget?.parent || ""
      }
    }
    const contextWidget = dWidgets.value.find(item => item.uuid === uuid) || useCanvasStore().dPage
    // Set the context immediately so a menu command cannot act on the previous selection.
    widgetStore.setMouseEvent(null)
    widgetStore.dSelectWidgets = []
    widgetStore.dActiveElement = contextWidget
    document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
    void showMenu(e, contextWidget, false)
  }
}

async function showMenu(e: MouseEvent, contextWidget: TdWidgetData | null = dActiveElement.value, multiple = dSelectWidgets.value.length > 1) {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  let isPage = !multiple && contextWidget?.uuid === '-1'
  menuListData.value.list = isPage ? pageMenu.value : widgetMenu.value
  if (multiple) {
    menuListData.value.list = [{ type: 'group', text: i18n.global.t('editor.shortcut.group') }, ...widgetMenu.value]
  }
  if (!multiple && contextWidget?.isContainer) {
    let ungroup: TWidgetItemData[] = [
      {
        type: 'ungroup',
        text: i18n.global.t('business.menu.ungroup'),
      },
    ]
    menuListData.value.list = ungroup.concat(menuListData.value.list)
  }
  unlockTargetId = !multiple && contextWidget?.lock ? contextWidget.uuid : null
  if (unlockTargetId) {
    menuListData.value.list = [{ type: 'unlock', text: i18n.global.t('business.menu.unlock') }]
  }
  showTargetId = !multiple && contextWidget?.hidden ? contextWidget.uuid : null
  if (showTargetId) {
    const showItem: TWidgetItemData = { type: 'show', text: i18n.global.t('business.menu.show') }
    menuListData.value.list = unlockTargetId ? [showItem, ...menuListData.value.list] : [showItem]
  }
  menuListData.value.list = menuListData.value.list.map(item => {
    if (item.type === 'paste') return { ...item, disabled: !dCopyElement.value.length }
    if (item.type === 'distribute') {
      const disabled = dSelectWidgets.value.filter(widget => !widget.lock && !widget.hidden).length < 3
      return { ...item, disabled, hint: disabled ? i18n.global.t('business.menu.distributeHint') : undefined }
    }
    return item
  })
  if ((e.target as HTMLElement).closest('#style-panel .layer-wrap')) {
    menuListData.value.list = [...menuListData.value.list, {
      type: 'show-all',
      text: i18n.global.t('business.menu.showAll'),
      disabled: !dWidgets.value.some(item => item.hidden),
    }, {
      type: 'unlock-all',
      text: i18n.global.t('business.menu.unlockAll'),
      disabled: !dWidgets.value.some(item => item.lock),
    }, {
      type: 'lock-all',
      text: i18n.global.t('business.menu.lockAll'),
      disabled: !dWidgets.value.some(item => !item.lock),
    }, {
      type: 'hide-all',
      text: i18n.global.t('business.menu.hideAll'),
      disabled: !dWidgets.value.some(item => !item.hidden),
    }, {
      type: 'select-all',
      text: i18n.global.t('business.menu.selectAll'),
      shortcut: `${primaryModifierLabel}+A`,
      disabled: !selectableWidgets.value.length,
    }, {
      type: 'deselect-all',
      text: i18n.global.t('business.menu.deselectAll'),
      shortcut: 'Esc',
      disabled: !dSelectWidgets.value.length && (!dActiveElement.value || dActiveElement.value.uuid === '-1'),
    }, {
      type: 'invert-selection',
      text: i18n.global.t('business.menu.invertSelection'),
      disabled: !selectableWidgets.value.length,
    }, {
      type: 'delete-all',
      text: i18n.global.t('business.menu.deleteAll'),
      disabled: !dWidgets.value.length,
    }]
  }
  // [TINIX] Thư viện: lưu đè mục gốc (đã chèn từ tab Chữ / Chất liệu) hoặc lưu thành mục mới
  if (!isPage && !multiple && !unlockTargetId && !showTargetId) {
    const target = libraryTarget()
    if (target) {
      const hasRef = !!target.ref && target.ref.kind === target.kind
      menuListData.value.list = [...menuListData.value.list,
        ...(hasRef ? [{ type: 'lib-save-over' as const, text: i18n.global.t('tinix.ui.library.saveOver') }] : []),
        { type: 'lib-save-new' as const, text: i18n.global.t(hasRef ? 'tinix.ui.library.saveNew' : 'tinix.ui.library.saveToLibrary') }]
    }
  }
  menuListData.value.list = organizeMenu(menuListData.value.list)
  showMenuBg.value = true
  menuListData.value.left = e.clientX
  menuListData.value.top = e.clientY
  await nextTick()
  const rect = menuList.value?.getBoundingClientRect()
  menuListData.value.left = Math.max(0, Math.min(e.clientX, window.innerWidth - (rect?.width || 170)))
  menuListData.value.top = Math.max(0, Math.min(e.clientY, window.innerHeight - (rect?.height || 150)))
  menuList.value?.focus({ preventScroll: true })
}

function closeMenu() {
  if (menuList.value?.contains(document.activeElement)) {
    (document.activeElement as HTMLElement)?.blur()
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
  showMenuBg.value = false
}

function menuKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') { closeMenu(); return }
  if (!menuList.value || event.target !== menuList.value || event.isComposing ||
    !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'ArrowLeft') return
  const items = Array.from(menuList.value.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]:not([aria-disabled="true"])'))
  const index = event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0
  items[index]?.focus({ preventScroll: true })
}

async function undoFeedback() {
  closeMenu()
  await undo()
}

function moveSelection(value: 1 | -1) {
  if (!dSelectWidgets.value.length) {
    widgetStore.updateLayerIndex({ uuid: dActiveElement.value?.uuid || '', value, isGroup: dActiveElement.value?.isContainer })
    return
  }
  const selected = new Set(dSelectWidgets.value.map(item => item.uuid))
  // Move front-to-back when raising layers; reverse when lowering, preserving their order.
  const items = dWidgets.value.filter(item => selected.has(item.uuid))
  if (value === 1) items.reverse()
  for (const item of items) {
    const siblings = dWidgets.value.filter(widget => widget.parent === item.parent)
    const neighbor = siblings[siblings.findIndex(widget => widget.uuid === item.uuid) + value]
    if (!neighbor || selected.has(neighbor.uuid)) continue
    widgetStore.updateLayerIndex({ uuid: item.uuid, value, isGroup: item.isContainer })
  }
}

/** 点击菜单触发事件 */
async function selectMenu(type: TWidgetItemData['type']) {
  // [TINIX] lưu về thư viện không phải thao tác trên canvas: không ghi phản hồi hoàn tác
  if (type === 'lib-save-over' || type === 'lib-save-new') {
    closeMenu()
    await saveToLibrary(type === 'lib-save-over' ? 'over' : 'new')
    return
  }
  await run(type, () => performMenuAction(type))
}

async function performMenuAction(type: TWidgetItemData['type']) {
  if (type.startsWith('distribute-')) {
    widgetStore.distributeSelection(type.slice(11) as TDistributeAxis)
    closeMenu()
    await nextTick()
    useForceStore().setUpdateRect()
    return
  }
  if (type.startsWith('align-')) {
    widgetStore.alignSelection(type.slice(6) as TUpdateAlignData['align'])
    closeMenu()
    await nextTick()
    useForceStore().setUpdateRect()
    return
  }
  switch (type) {
    case 'delete-all':
    case 'deselect-all': {
      if (type === 'delete-all') {
        if (!dWidgets.value.length) break
        dWidgets.value.splice(0, dWidgets.value.length)
        useCanvasStore().reChangeCanvas()
      }
      widgetStore.setMouseEvent(null)
      widgetStore.dSelectWidgets = []
      widgetStore.dActiveElement = useCanvasStore().dPage
      document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
      await nextTick()
      useForceStore().setUpdateRect()
      break
    }
    case 'invert-selection':
    case 'select-all': {
      const current = dSelectWidgets.value.length ? dSelectWidgets.value : [dActiveElement.value]
      const selectedIds = new Set(current.filter(Boolean).map(item => item!.uuid))
      const items = selectableWidgets.value.filter(item => type !== 'invert-selection' || !selectedIds.has(item.uuid))
      if (!items.length && type === 'select-all') break
      widgetStore.setMouseEvent(null)
      document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
      widgetStore.dSelectWidgets = items.length > 1 ? [...items] : []
      widgetStore.dActiveElement = items.length === 1 ? items[0] : useCanvasStore().dPage
      await nextTick()
      useForceStore().setUpdateRect()
      break
    }
    case 'show-all':
    case 'unlock-all': {
      const key = type === 'unlock-all' ? 'lock' : 'hidden'
      for (const item of dWidgets.value) {
        if (item[key]) widgetStore.updateWidgetData({ uuid: item.uuid, key, value: false })
      }
      await nextTick()
      useForceStore().setUpdateRect()
      break
    }
    case 'index-front':
    case 'index-back': {
      const selected = dSelectWidgets.value.length ? dSelectWidgets.value : [dActiveElement.value]
      widgetStore.moveLayersToEdge({
        uuids: selected.filter(item => item && item.uuid !== '-1').map(item => item!.uuid),
        value: type === 'index-front' ? 1 : -1,
      })
      break
    }
    case 'duplicate':
      widgetStore.duplicateWidget()
      break
    case 'show':
    case 'unlock': {
      const item = dWidgets.value.find(widget => widget.uuid === (type === 'show' ? showTargetId : unlockTargetId))
      if (!item) break
      widgetStore.updateWidgetData({ uuid: item.uuid, key: type === 'show' ? 'hidden' : 'lock', value: false })
      widgetStore.setMouseEvent(null)
      widgetStore.dSelectWidgets = []
      document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
      widgetStore.dActiveElement = item.hidden || item.lock ? useCanvasStore().dPage : item
      break
    }
    case 'hide':
    case 'hide-all':
    case 'lock-all':
    case 'lock': {
      const selected = type === 'lock-all' || type === 'hide-all' ? dWidgets.value
        : dSelectWidgets.value.length ? [...dSelectWidgets.value] : [dActiveElement.value]
      for (const item of selected) {
        if (item && item.uuid !== '-1') {
          widgetStore.updateWidgetData({ uuid: item.uuid, key: type === 'hide' || type === 'hide-all' ? 'hidden' : 'lock', value: true })
        }
      }
      widgetStore.setMouseEvent(null)
      widgetStore.dSelectWidgets = []
      widgetStore.dActiveElement = useCanvasStore().dPage
      document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
      break
    }
    case 'group':
      if (dSelectWidgets.value.length < 2) break
      groupStore.realCombined()
      document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
      break
    case 'copy':
      widgetStore.copyWidget()
      break
    case 'paste':
      if (dCopyElement.value.length === 0) {
        return
      }
      widgetStore.pasteWidget()
      break
    case 'index-up':
      moveSelection(1)
      break
    case 'index-down':
      moveSelection(-1)
      break
    case 'del':
      widgetStore.deleteWidget()
      break
    case 'ungroup':
      widgetStore.ungroup(dActiveElement.value?.uuid || "")
      break
  }
  closeMenu()
}

</script>

<style lang="less" scoped>
.menu-bg {
  position: fixed;
  inset: 0;
  z-index: 99999;
  .menu-list {
    background-color: @color-white;
    box-shadow: 1px 0px 10px 3px rgba(0, 0, 0, 0.1);
    padding: 5px;
    position: absolute;
    width: 220px;
    margin: 0;
    border-radius: 6px;
    list-style: none;
  }
}
</style>
