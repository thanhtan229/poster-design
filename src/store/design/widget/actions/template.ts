/*
 * @Author: Jeremy Yu
 * @Date: 2024-03-28 21:00:00
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 09:29:35
 */


import { customAlphabet } from 'nanoid/non-secure'
import { TWidgetStore, TdWidgetData } from '..'
import { useCanvasStore, useWidgetStore } from '@/store'
import { constrainGroupToCanvas } from './widget'
const nanoid = customAlphabet('1234567890abcdef', 12)

// TODO: 选择模板
export function setTemplate(store: TWidgetStore, allWidgets: TdWidgetData[]) {
  // const historyStore = useHistoryStore()
  const canvasStore = useCanvasStore()
  const widgetStore = useWidgetStore()
  // [TINIX] No constrainGroupToCanvas here: setTemplate loads a WHOLE-PAGE template whose
  // layers are already in that page's coordinates. Shrinking the whole template whenever one
  // layer bleeds off the page (common for PSD imports) — and against the *previous* page size,
  // since callers set dPage afterwards — scaled every layer down (e.g. 937px text → 204px).
  // Inserting a component group still goes through addGroup(), which keeps the constraint.
  void constrainGroupToCanvas
  void canvasStore.dPage

  allWidgets.forEach((item) => {
    Number(item.uuid) < 0 && (item.uuid = nanoid()) // 重设id
    item.text && (item.text = decodeURIComponent(item.text))
    store.dWidgets.push(item)
  })
  widgetStore.updateDWidgets()
  canvasStore.reChangeCanvas()
}
