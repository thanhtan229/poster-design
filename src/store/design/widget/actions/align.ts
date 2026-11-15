/*
 * @Author: Jeremy Yu
 * @Date: 2024-03-28 14:00:00
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 09:29:27
 */

import { useCanvasStore, useHistoryStore } from "@/store"
import { TWidgetStore, TdWidgetData } from ".."

export type TDistributeAxis = 'horizontal' | 'vertical'

export function distributeSelection(store: TWidgetStore, direction: TDistributeAxis) {
  const selected = new Set(store.dSelectWidgets.map(item => item.uuid))
  const position = direction === 'horizontal' ? 'left' : 'top'
  const dimension = direction === 'horizontal' ? 'width' : 'height'
  const items = store.dWidgets.filter(item => selected.has(item.uuid) && !item.lock && !item.hidden)
    .map(item => ({ item, start: Number(item[position]), size: Number(item[dimension] || item.record?.[dimension] || 0) }))
    .sort((a, b) => a.start - b.start)
  if (items.length < 3 || items.some(item => !Number.isFinite(item.start) || !Number.isFinite(item.size))) return
  const first = items[0]
  const last = items[items.length - 1]
  const gap = (last.start + last.size - first.start - items.reduce((total, item) => total + item.size, 0)) / (items.length - 1)
  let cursor = first.start + first.size + gap
  for (const { item, size } of items.slice(1, -1)) {
    store.updateWidgetData({ uuid: item.uuid, key: position, value: cursor })
    cursor += size + gap
  }
  useCanvasStore().reChangeCanvas()
}

export function alignSelection(store: TWidgetStore, align: TAlign) {
  const items = (store.dSelectWidgets.length ? store.dSelectWidgets : [store.dActiveElement])
    .filter((item): item is TdWidgetData => !!item && item.uuid !== '-1' && !item.lock && !item.hidden)
  if (!items.length) return
  let group: TdWidgetData | undefined
  if (items.length > 1) {
    const left = Math.min(...items.map(item => Number(item.left)))
    const top = Math.min(...items.map(item => Number(item.top)))
    const right = Math.max(...items.map(item => Number(item.left) + Number(item.width || item.record?.width || 0)))
    const bottom = Math.max(...items.map(item => Number(item.top) + Number(item.height || item.record?.height || 0)))
    group = { ...useCanvasStore().dPage, uuid: 'selection', left, top, width: right - left, height: bottom - top, record: {} }
  }
  items.forEach(item => updateAlign(store, { align, uuid: item.uuid, group }))
}

type TAlign = 'left' | 'ch' | 'right' | 'top' | 'cv' | 'bottom'

export type TUpdateAlignData = {
  align: TAlign
  uuid: string
  group?: TdWidgetData
}

export function updateAlign(store: TWidgetStore, { align, uuid, group }: TUpdateAlignData) {
  const pageStore = useCanvasStore()
  const historyStore = useHistoryStore()
  const canvasStore = useCanvasStore()

  const widgets = store.dWidgets
  const target = uuid ? widgets.find((item: any) => item.uuid === uuid) : store.dActiveElement
  let parent: TdWidgetData = group || pageStore.dPage

  if (!target) return

  if (!group && target.parent !== '-1') {
    const tmp = widgets.find((item: any) => item.uuid === target.parent)
    tmp && (parent = tmp)
  }

  let left = target.left
  let top = target.top
  let pw = parent.record?.width || parent.width
  let ph = parent.record?.height || parent.height

  if (parent.uuid === '-1') {
    pw = parent.width
    ph = parent.height
  }

  const targetW = Number(target.width || target.record?.width || 0)
  const targetH = Number(target.height || target.record?.height || 0)
  switch (align) {
    case 'left':
      left = parent.left
      break
    case 'ch': // 水平居中
      left = parent.left + pw / 2 - targetW / 2
      break
    case 'right':
      left = parent.left + pw - targetW
      break
    case 'top':
      top = parent.top
      break
    case 'cv': // 垂直居中
      top = parent.top + ph / 2 - targetH / 2
      break
    case 'bottom':
      top = parent.top + ph - targetH
      break
  }

  if (target.left !== left || target.top !== top) {
    if (target.isContainer) {
      const dLeft = target.left - left
      const dTop = target.top - top
      const len = widgets.length
      for (let i = 0; i < len; ++i) {
        const widget = widgets[i]
        if (widget.parent === target.uuid) {
          widget.left -= dLeft
          widget.top -= dTop
        }
      }
    }
    target.left = left
    target.top = top

    canvasStore.reChangeCanvas()
    // store.dispatch('reChangeCanvas')
  }
}
