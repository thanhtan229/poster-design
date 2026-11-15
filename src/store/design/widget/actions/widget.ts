import { syncLinkedImages } from '@/utils/tinix/image-effects'
/*
 * @Author: Jeremy Yu
 * @Date: 2024-03-28 21:00:00
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 09:30:53
 */

import { useCanvasStore, useHistoryStore } from '@/store'
import { TWidgetStore, TdWidgetData } from '..'
import { customAlphabet } from 'nanoid/non-secure'
const nanoid = customAlphabet('1234567890abcdef', 12)

/**
 * 将元素尺寸限制在画布最大尺寸内，并按缩放比例重新居中。
 * 仅在元素超出画布时才生效，保持宽高比。
 * @param setting 待添加的元素设置
 * @param dPageWidth 画布宽度
 * @param dPageHeight 画布高度
 */
export function constrainToCanvas(setting: TdWidgetData, dPageWidth: number, dPageHeight: number): void {
  const w = Number(setting.width)
  const h = Number(setting.height)
  if (!w || !h || !(w > dPageWidth || h > dPageHeight)) return

  const ratio = Math.min(dPageWidth / w, dPageHeight / h)
  const newWidth = Math.round(w * ratio)
  const newHeight = Math.round(h * ratio)
  setting.width = newWidth
  setting.height = newHeight
  setting.left = dPageWidth / 2 - newWidth / 2
  setting.top = dPageHeight / 2 - newHeight / 2
}

/**
 * 将组合(多元素)整体限制在画布最大尺寸内，按比例缩放并重新居中。
 * 以所有元素的边界框计算组合尺寸，仅超出画布时生效。
 * @param group 待添加的元素数组
 * @param dPageWidth 画布宽度
 * @param dPageHeight 画布高度
 */
export function constrainGroupToCanvas(group: TdWidgetData[], dPageWidth: number, dPageHeight: number): void {
  if (!group || group.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const item of group) {
    const l = Number(item.left) || 0
    const t = Number(item.top) || 0
    const w = Number(item.width) || 0
    const h = Number(item.height) || 0
    if (l < minX) minX = l
    if (t < minY) minY = t
    if (l + w > maxX) maxX = l + w
    if (t + h > maxY) maxY = t + h
  }
  if (!isFinite(minX)) return

  const groupWidth = maxX - minX
  const groupHeight = maxY - minY
  if (!groupWidth || !groupHeight || !(groupWidth > dPageWidth || groupHeight > dPageHeight)) return

  const ratio = Math.min(dPageWidth / groupWidth, dPageHeight / groupHeight)
  const oldCenterX = minX + groupWidth / 2
  const oldCenterY = minY + groupHeight / 2
  const newCenterX = dPageWidth / 2
  const newCenterY = dPageHeight / 2

  for (const item of group) {
    const l = Number(item.left) || 0
    const t = Number(item.top) || 0
    const w = Number(item.width) || 0
    const h = Number(item.height) || 0

    item.width = w ? Math.round(w * ratio) : w
    item.height = h ? Math.round(h * ratio) : h
    item.left = Math.round(newCenterX + (l - oldCenterX) * ratio)
    item.top = Math.round(newCenterY + (t - oldCenterY) * ratio)
    if (typeof item.fontSize === 'number') {
      item.fontSize = Math.round(item.fontSize * ratio)
    }
  }
}

type TUpdateWidgetKey = keyof TdWidgetData

export type TUpdateWidgetPayload = {
  uuid: string
  key: TUpdateWidgetKey
  value: number | string | boolean | Record<string, any>
}

/** 更新组件数据 */
export function updateWidgetData(store: TWidgetStore, { uuid, key, value }: TUpdateWidgetPayload) {
  const widget = store.dWidgets.find((item) => item.uuid === uuid)
  if (widget && widget[key] !== value) {
    switch (key) {
      case 'width':
        // const minWidth = widget.record.minWidth
        // const maxWidth = store.state.dPage.width - widget.left
        // value = Math.max(minWidth, Math.min(maxWidth, value))
        break
      case 'height':
        // const minHeight = widget.record.minHeight
        // const maxHeight = store.state.dPage.height - widget.top
        // value = Math.max(minHeight, Math.min(maxHeight, value))
        break
      case 'left':
      case 'top':
        if (widget.isContainer) {
          let dLeft = widget.left - Number(value)
          let dTop = widget.top - Number(value)
          if (key === 'left') {
            dTop = 0
          }
          if (key === 'top') {
            dLeft = 0
          }
          const len = store.dWidgets.length
          for (let i = 0; i < len; ++i) {
            const child = store.dWidgets[i]
            if (child.parent === widget.uuid) {
              child.left -= dLeft
              child.top -= dTop
            }
          }
        }
        break
    }
    ;(widget[key] as TUpdateWidgetPayload['value']) = value
    if (key === 'imgUrl' || key === 'origin') syncLinkedImages(store.dWidgets)
  }
}

export type TUpdateWidgetMultiplePayload = {
  uuid: string
  data: {
    key: TUpdateWidgetKey
    value: number
  }[]
}

/** 一次更新多个widget */
export function updateWidgetMultiple(store: TWidgetStore, { uuid, data }: TUpdateWidgetMultiplePayload) {
  for (const item of data) {
    const { key, value } = item
    const widget = store.dWidgets.find((item) => item.uuid === uuid)
    if (widget && widget[key] !== value) {
      switch (key) {
        case 'left':
        case 'top':
          if (widget.isContainer) {
            let dLeft = widget.left - value
            let dTop = widget.top - value
            if (key === 'left') {
              dTop = 0
            }
            if (key === 'top') {
              dLeft = 0
            }
            const len = store.dWidgets.length
            for (let i = 0; i < len; ++i) {
              const child = store.dWidgets[i]
              if (child.parent === widget.uuid) {
                child.left -= dLeft
                child.top -= dTop
              }
            }
          }
          break
      }
      ;(widget[key] as number | string) = value
    }
  }
}

/** 添加 Widget */
export function addWidget(store: TWidgetStore, setting: TdWidgetData) {
  const historyStore = useHistoryStore()
  const canvasStore = useCanvasStore()
  setting.uuid = nanoid()

  const { width: dPageWidth, height: dPageHeight } = canvasStore.dPage
  constrainToCanvas(setting, dPageWidth, dPageHeight)

  store.dWidgets.push(setting)
  const len = store.dWidgets.length
  // store.state.dActiveElement = store.state.dWidgets[len - 1]

  store.selectWidget({
    uuid: store.dWidgets[len - 1].uuid,
  })
  canvasStore.reChangeCanvas()
}

/** 删除组件 */
export function deleteWidget(store: TWidgetStore) {
  const historyStore = useHistoryStore()
  const canvasStore = useCanvasStore()
  const widgets = store.dWidgets
  const selectWidgets = store.dSelectWidgets
  const activeElement = store.dActiveElement
  if (!activeElement) return

  let count = 0 // 记录容器里的组件数量
  if (selectWidgets.length !== 0) {
    const ids = new Set(selectWidgets.map(item => item.uuid))
    // Include children of selected groups without leaving orphan layers behind.
    let previousSize = -1
    while (previousSize !== ids.size) {
      previousSize = ids.size
      widgets.forEach(item => { if (item.parent && ids.has(item.parent)) ids.add(item.uuid) })
    }
    for (let i = widgets.length - 1; i >= 0; --i) {
      if (ids.has(widgets[i].uuid)) widgets.splice(i, 1)
    }
    store.dSelectWidgets = []
    store.selectWidget({
      uuid: '-1',
    })
  } else {
    if (activeElement.type === 'page') {
      return
    }

    const uuid = activeElement.uuid
    const index = widgets.findIndex((item) => item.uuid === uuid)

    // 先删除组件
    widgets.splice(index, 1)

    // 如果删除的是容器，须将内部组件一并删除
    if (activeElement.isContainer) {
      for (let i = widgets.length - 1; i >= 0; --i) {
        if (widgets[i].parent === uuid) {
          widgets.splice(i, 1)
        }
      }
    } else if (activeElement.parent !== '-1') {
      for (let i = widgets.length - 1; i >= 0; --i) {
        if (widgets[i].parent === activeElement.parent) {
          count++
          if (count > 1) {
            break
          }
        }
      }
      if (count <= 1) {
        const index = widgets.findIndex((item) => item.uuid === activeElement.parent)
        widgets.splice(index, 1)
        if (count === 1) {
          const widget = widgets.find((item) => item.parent === activeElement.parent)
          widget && (widget.parent = '-1')
        }
        count = 0
      }
    }
  }

  // A linked backdrop belongs to its photo; deleting that photo removes the backdrop too.
  for (let i = widgets.length - 1; i >= 0; i--) {
    if (widgets[i].linkedPhotoId && !widgets.some(w => w.uuid === widgets[i].linkedPhotoId)) widgets.splice(i, 1)
  }

  if (count === 0) {
    // 重置 activeElement
    const pageStore = useCanvasStore()
    store.dActiveElement = pageStore.dPage
  } else {
    const tmp = widgets.find((item) => item.uuid === activeElement.parent)
    tmp && (store.dActiveElement = tmp)
  }

  if (store.dActiveElement && store.dActiveElement.uuid !== '-1') {
    store.updateGroupSize(store.dActiveElement.uuid)
    // store.dispatch('updateGroupSize', store.dActiveElement.uuid)
  }
  canvasStore.reChangeCanvas()
}

export type TsetWidgetStyleData = {
  uuid: string
  key: keyof TdWidgetData
  value: any
}

export function setWidgetStyle(state: TWidgetStore, { uuid, key, value }: TsetWidgetStyleData) {
  const widget = state.dWidgets.find((item) => item.uuid === uuid)
  if (!widget) return
  ;(widget[key] as Record<string, any>) = value
}

export function setDWidgets(state: TWidgetStore, e: TdWidgetData[]) {
  state.dWidgets = e
  updateDWidgets(state)
}

export function setDLayouts(state: TWidgetStore, data: any[]) {
  state.dLayouts = data
  state.dWidgets = state.getWidgets()
  const pageStore = useCanvasStore()
  pageStore.setDPage(data[pageStore.dCurrentPage].global)
  setTimeout(() => {
    state.dActiveElement = pageStore.dPage
  }, 150)
}

export function updateDWidgets(state: TWidgetStore) {
  syncLinkedImages(state.dWidgets)
  const pageStore = useCanvasStore()
  const { dCurrentPage } = pageStore
  state.dLayouts[dCurrentPage].layers = state.dWidgets
  state.dWidgets = state.getWidgets()
}

// 锁定所有图层 / 再次调用时还原图层
let lastLocks: boolean[] | null = null
export function lockWidgets(state: TWidgetStore) {
  if (lastLocks && lastLocks.length > 0) {
    for (let i = 0; i < lastLocks.length; i++) {
      state.dWidgets[i].lock = lastLocks[i]
    }
    lastLocks = []
  } else {
    lastLocks = []
    for (const widget of state.dWidgets) {
      lastLocks.push(widget?.lock || false)
    }
    state.dWidgets.forEach((widget: any) => {
      widget.lock = true
    })
  }
}
