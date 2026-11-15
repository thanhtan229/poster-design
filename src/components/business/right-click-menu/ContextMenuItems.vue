<template>
  <template v-for="item in items" :key="item.type">
    <li v-if="item.separatorBefore" class="menu-separator" role="separator" />
    <li
      class="menu-item"
      :class="{ 'disable-menu': item.disabled, 'danger-menu': item.danger }"
      role="menuitem"
      tabindex="-1"
      :data-action="item.type"
      :data-menu-branch="item.children ? 'true' : undefined"
      :aria-haspopup="item.children ? 'menu' : undefined"
      :aria-expanded="item.children ? activeType === item.type : undefined"
      :aria-disabled="!!item.disabled"
      :aria-keyshortcuts="item.shortcut?.replace('Ctrl', 'Control').replace('⌘', 'Meta').replace('Esc', 'Escape')"
      :title="item.hint"
      @mouseenter="open(item, $event)"
      @mouseleave="leave($event)"
      @keydown="navigate(item, $event)"
      @click.stop="activate(item, $event)"
    >
      <span data-menu-label>{{ item.text }}</span>
      <kbd v-if="item.shortcut" class="menu-shortcut" data-menu-shortcut>{{ item.shortcut }}</kbd>
      <span v-if="item.children" class="submenu-arrow" aria-hidden="true">›</span>
      <ul v-if="item.children" v-show="activeType === item.type" class="submenu" role="menu" :aria-label="item.text" :style="position">
        <ContextMenuItems :items="item.children" @select="emit('select', $event)" @back="closeBranch($event)" />
      </ul>
    </li>
  </template>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { TWidgetItemData } from './rcMenuData'

const props = defineProps<{ items: TWidgetItemData[] }>()
const emit = defineEmits<{ select: [type: TWidgetItemData['type']]; back: [parent: HTMLElement] }>()
const activeType = ref<string | null>(null)
const position = ref({ left: '0px', top: '0px' })
watch(() => props.items, () => { activeType.value = null })

async function open(item: TWidgetItemData, event: MouseEvent | KeyboardEvent, enter = false) {
  activeType.value = !item.disabled && item.children ? item.type : null
  if (activeType.value !== item.type) return
  const parent = event.currentTarget as HTMLElement
  await nextTick()
  const submenu = parent.querySelector<HTMLElement>(':scope > .submenu')
  if (!submenu || activeType.value !== item.type) return
  const rect = parent.getBoundingClientRect()
  const width = submenu.offsetWidth
  const left = rect.right + width > window.innerWidth - 4 ? rect.left - width + 4 : rect.right - 4
  position.value = {
    left: Math.max(4, Math.min(left, window.innerWidth - width - 4)) + 'px',
    top: Math.max(4, Math.min(rect.top, window.innerHeight - submenu.offsetHeight - 4)) + 'px',
  }
  if (enter) submenu.querySelector<HTMLElement>(':scope > [role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true })
}
function closeBranch(parent: HTMLElement) {
  activeType.value = null
  parent.focus({ preventScroll: true })
}
function leave(event: MouseEvent) {
  if (!(event.currentTarget as HTMLElement).contains(document.activeElement)) activeType.value = null
}
function navigate(item: TWidgetItemData, event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'Enter', ' ', 'Home', 'End'].includes(event.key) || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as HTMLElement
  const menu = target.parentElement!
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    activeType.value = null
    const items = Array.from(menu.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]:not([aria-disabled="true"])'))
    const index = items.indexOf(target)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus({ preventScroll: true })
  } else if (event.key === 'ArrowLeft') {
    const parent = menu.parentElement
    if (parent?.getAttribute('role') === 'menuitem') emit('back', parent)
  } else if (!item.disabled && (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ')) {
    if (event.repeat && event.key !== 'ArrowRight') return
    if (item.children) void open(item, event, true)
    else if (event.key !== 'ArrowRight') emit('select', item.type)
  }
}
function activate(item: TWidgetItemData, event: MouseEvent) {
  if (item.disabled) return
  if (item.children) void open(item, event)
  else emit('select', item.type)
}
</script>

<style lang="less" scoped>
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 32px;
  padding: 6px 12px;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  border-radius: 4px;
  &:hover { background: #ececec; }
  &:focus { outline: 2px solid #5275ed; outline-offset: -2px; background: #edf2ff; }
}
.disable-menu, .disable-menu:hover { color: #aaa; cursor: not-allowed; background: transparent; }
.danger-menu { color: #c53030; &:hover { background: #fff1f1; } }
.danger-menu.disable-menu { color: #aaa; }
.menu-separator { height: 1px; background: #e8e8e8; margin: 5px 2px; }
.submenu-arrow { color: #888; font-size: 18px; }
.menu-shortcut { margin-left: auto; font: inherit; font-size: 12px; color: #7c8390; }
.disable-menu .menu-shortcut { color: #aaa; }
.submenu {
  position: fixed;
  z-index: 1;
  width: 224px;
  max-height: calc(100vh - 8px);
  padding: 5px;
  margin: 0;
  list-style: none;
  border-radius: 6px;
  background: #fff;
  box-shadow: 1px 0 10px 3px rgba(0, 0, 0, .1);
}
</style>
