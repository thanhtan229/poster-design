import { useCanvasStore, useControlStore, useHistoryStore, useWidgetStore } from '@/store'
import { flushHistory } from '@/common/hooks/history'
import { historyPatches } from '@/utils/widgets/diffLayouts'
import { clampDpi, MAX_SIDE_PX } from '@/utils/tinix/units'

/** Commit page and composition together so either entry point has one undo step. */
export function resizeCanvas(size: { width: number; height: number; dpi?: number }, adaptive = true) {
  const { width, height } = size
  if (![width, height].every(n => Number.isFinite(n) && n > 0) || width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height > 80000000) {
    throw new Error('Kích thước vượt giới hạn canvas (12.000 px mỗi cạnh, tối đa 80 triệu pixel).')
  }
  const canvas = useCanvasStore(), widgets = useWidgetStore()
  flushHistory()
  const before = JSON.parse(JSON.stringify(widgets.dLayouts))
  const previous = { ...canvas.dPage }
  useControlStore().setShowMoveable(false)
  widgets.setdActiveElement(canvas.dPage)
  Object.assign(canvas.dPage, { width, height, dpi: clampDpi(size.dpi || canvas.dPage.dpi) })
  if (adaptive) widgets.autoResizeAll(previous)
  const changes = historyPatches(before, JSON.parse(JSON.stringify(widgets.dLayouts)))
  if (changes.patches.length) useHistoryStore().changeHistory(changes)
}
