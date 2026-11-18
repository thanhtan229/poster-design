import { computed, nextTick, shallowRef, watch } from 'vue'
import i18n from '@/languages'
import { useCanvasStore, useForceStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history'
import { historyPatches } from '@/utils/widgets/diffLayouts'
import type { TdWidgetData } from '@/store/design/widget'
import type { TWidgetItemData } from './rcMenuData'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
// Render measurements can change when a layer is selected; they are not a new edit.
const content = (value: unknown) => JSON.stringify(value, (key, item) => key === 'record' ? undefined : item)
const selectionActions = new Set(['select-all', 'deselect-all', 'invert-selection'])

function changedCount(type: string, before: TdWidgetData[], after: TdWidgetData[], selected: string[], nextSelected: string[]) {
  const previous = new Map(before.map(item => [item.uuid, item]))
  const next = new Map(after.map(item => [item.uuid, item]))
  if (type === 'select-all') return nextSelected.length
  if (type === 'deselect-all') return selected.length
  if (type === 'invert-selection') {
    const oldIds = new Set(selected)
    const newIds = new Set(nextSelected)
    return [...new Set([...selected, ...nextSelected])].filter(id => oldIds.has(id) !== newIds.has(id)).length
  }
  if (type === 'group') return selected.length
  if (type === 'ungroup') return nextSelected.length
  if (type === 'del' || type === 'delete-all') return before.filter(item => !next.has(item.uuid)).length
  if (type === 'paste' || type === 'duplicate') return after.filter(item => !previous.has(item.uuid) && item.parent === '-1').length
  const flag = ['hide', 'hide-all', 'show', 'show-all'].includes(type) ? 'hidden'
    : ['lock', 'lock-all', 'unlock', 'unlock-all'].includes(type) ? 'lock' : null
  if (flag) return after.filter(item => previous.has(item.uuid) && !!previous.get(item.uuid)![flag] !== !!item[flag]).length
  if (type.startsWith('align-') || type.startsWith('distribute-')) {
    return before.filter(item => selected.includes(item.uuid) && !item.hidden && !item.lock).length
  }
  return selected.filter(id => previous.has(id) && next.has(id) &&
    (content(previous.get(id)) !== content(next.get(id)) || before.findIndex(item => item.uuid === id) !== after.findIndex(item => item.uuid === id))).length
}

function messageKey(type: string) {
  if (type.startsWith('align-')) return 'aligned'
  if (type.startsWith('distribute-')) return 'distributed'
  if (type.startsWith('index-')) return 'reordered'
  return ({ hide: 'hidden', 'hide-all': 'hidden', show: 'shown', 'show-all': 'shown',
    lock: 'locked', 'lock-all': 'locked', unlock: 'unlocked', 'unlock-all': 'unlocked',
    del: 'deleted', 'delete-all': 'deleted', duplicate: 'duplicated', paste: 'pasted',
    group: 'grouped', ungroup: 'ungrouped', 'select-all': 'selected', 'deselect-all': 'deselected',
    'invert-selection': 'inverted' } as Record<string, string>)[type]
}

export default function useActionFeedback() {
  const widgets = useWidgetStore()
  const canvas = useCanvasStore()
  const history = useHistoryStore()
  const force = useForceStore()
  let serial = 0
  const feedback = shallowRef<{ id: number; text: string } | null>(null)
  const token = shallowRef<{
    page: number; state: string; selection: string[]; expectedSelection: string;
    pointer: number; entry: unknown; persisted: boolean
  } | null>(null)
  const selection = () => (widgets.dSelectWidgets.length ? widgets.dSelectWidgets : [widgets.dActiveElement])
    .filter((item): item is TdWidgetData => !!item && item.uuid !== '-1').map(item => item.uuid)
  const selectionKey = () => JSON.stringify(selection().sort())
  const snapshot = () => {
    // Keep history and the rendered page bound to the same current layer array.
    widgets.dLayouts[canvas.dCurrentPage].layers = widgets.dWidgets
    return clone(widgets.dLayouts)
  }
  const currentContent = () => {
    const layouts = widgets.dLayouts.map((layout, index) => index === canvas.dCurrentPage ? { ...layout, layers: widgets.dWidgets } : layout)
    return content(layouts)
  }
  const canUndo = computed(() => {
    const saved = token.value
    if (!saved || saved.page !== canvas.dCurrentPage || saved.pointer !== history.dHistoryParams.stackPointer) return false
    if (saved.persisted && saved.entry !== history.dHistoryStack.changes[saved.pointer]) return false
    return saved.state === currentContent() && (saved.persisted || saved.expectedSelection === selectionKey())
  })
  const close = () => { feedback.value = null; token.value = null }
  watch(canUndo, valid => { if (!valid && token.value) close() })

  async function run(type: TWidgetItemData['type'], execute: () => Promise<void>) {
    flushHistory()
    close()
    const page = canvas.dCurrentPage
    const before = snapshot()
    const selected = selection()
    let completed = false
    try {
      await execute()
      completed = true
    } finally {
      await nextTick()
      const after = snapshot()
      const persisted = content(before) !== content(after)
      if (persisted) history.changeHistory(historyPatches(before, after))
      const nextSelected = selection()
      const selectionChanged = selectionActions.has(type) && JSON.stringify([...selected].sort()) !== JSON.stringify([...nextSelected].sort())
      const key = messageKey(type)
      const count = changedCount(type, before[page].layers, after[page].layers, selected, nextSelected)
      const bulk = type.endsWith('-all') || type === 'invert-selection' || selected.length > 1 ||
        (['paste', 'duplicate', 'ungroup'].includes(type) && count > 1)
      if (completed && key && count && bulk && (persisted || selectionChanged)) {
        const pointer = history.dHistoryParams.stackPointer
        token.value = {
          page, state: content(after), selection: selected,
          expectedSelection: selectionKey(), pointer,
          entry: persisted ? history.dHistoryStack.changes[pointer] : null, persisted,
        }
        feedback.value = { id: ++serial, text: i18n.global.t(`business.feedback.${key}`, { count }) }
      }
    }
  }

  async function undo() {
    flushHistory()
    if (!canUndo.value || !token.value) { close(); return }
    const saved = token.value
    close()
    widgets.setMouseEvent(null)
    widgets.dSelectWidgets = []
    widgets.dActiveElement = canvas.dPage
    document.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
    if (saved.persisted) history.handleHistory('undo')
    else {
      const items = saved.selection.map(id => widgets.dWidgets.find(item => item.uuid === id))
        .filter((item): item is TdWidgetData => !!item && !item.hidden && !item.lock)
      widgets.dSelectWidgets = items.length > 1 ? items : []
      widgets.dActiveElement = items.length === 1 ? items[0] : canvas.dPage
    }
    await nextTick()
    force.setUpdateRect()
    feedback.value = { id: ++serial, text: i18n.global.t('business.feedback.undone') }
  }
  return { feedback, canUndo, run, undo, close }
}
