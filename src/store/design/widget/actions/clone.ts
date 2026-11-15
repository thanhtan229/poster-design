import { remapImageLinks } from '@/utils/tinix/image-effects'
/*
 * @Author: Jeremy Yu
 * @Date: 2024-03-28 14:00:00
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-05-22 19:32:24
 */

import { useCanvasStore, useForceStore } from "@/store"
import { TWidgetStore, TdWidgetData } from ".."
import { customAlphabet } from 'nanoid/non-secure'
const nanoid = customAlphabet('1234567890abcdef', 12)

function selectedCopies(store: TWidgetStore): TdWidgetData[] {
  const selection = store.dSelectWidgets.length ? store.dSelectWidgets : [store.dActiveElement]
  const ids = new Set(selection.filter(item => item && item.type !== 'page').map(item => item!.uuid))
  let previousSize = -1
  while (previousSize !== ids.size) {
    previousSize = ids.size
    store.dWidgets.forEach(item => { if ((item.parent && ids.has(item.parent)) || (item.linkedPhotoId && ids.has(item.linkedPhotoId))) ids.add(item.uuid) })
  }
  return JSON.parse(JSON.stringify(store.dWidgets.filter(item => ids.has(item.uuid))))
}

/** 拷贝组件 */
export function copyWidget(store: TWidgetStore) {
  const copies = selectedCopies(store)
  if (!copies.length) return
  navigator.clipboard?.writeText('').catch(() => {}) // Internal copies also work without clipboard permission.
  store.dCopyElement = copies
}

function insertCopies(store: TWidgetStore, copyElement: TdWidgetData[]) {
  if (!copyElement.length) return
  const ids = new Map(copyElement.map(item => [item.uuid, nanoid()]))
  remapImageLinks(copyElement, ids)
  for (const item of copyElement) {
    const parent = item.parent && ids.get(item.parent)
    item.uuid = ids.get(item.uuid)!
    item.parent = parent || '-1'
    item.top += 30
    item.left += 30
  }
  store.dWidgets.push(...copyElement)
  const roots = copyElement.filter(item => item.parent === '-1')
  store.dActiveElement = roots[0]
  store.dSelectWidgets = roots.length > 1 ? roots : []
  useCanvasStore().reChangeCanvas()
  if (roots.length > 1) useForceStore().setUpdateSelect()
}

/** Duplicate the selection without changing the internal or system clipboard. */
export function duplicateWidget(store: TWidgetStore) {
  insertCopies(store, selectedCopies(store))
}

/** 粘贴组件 */
export function pasteWidget(store: TWidgetStore) {
  if (!store.dCopyElement.length) return
  insertCopies(store, JSON.parse(JSON.stringify(store.dCopyElement)))
  // 复制以调整下次粘贴的位置
  store.copyWidget()
}
