import { nextTick, onBeforeUnmount } from 'vue'
import Selecto from 'selecto'
import Moveable, { getElementInfo } from 'moveable'
import { useCanvasStore, useControlStore, useWidgetStore } from '@/store'

/** Capture Ctrl gestures before the canvas and Moveable start moving a layer. */
export default function useCtrlMarquee(moveable: Moveable) {
  const container = document.getElementById('page-design')
  if (!container) return
  const gestureContainer = document.getElementById('main') || container
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  const controlStore = useControlStore()
  let startEvent: MouseEvent | null = null
  let initialSelection: HTMLElement[] = []
  let clickedLayer: HTMLElement | undefined

  const selectable = () => Array.from(container.querySelectorAll<HTMLElement>('.layer:not(.layer-lock):not([child])'))
    .filter(el => {
      const widget = widgetStore.dWidgets.find(item => item.uuid === el.dataset.uuid)
      return widget && !widget.lock && !widget.hidden && widget.parent === '-1'
    })
  const currentSelection = () => {
    const widgets = widgetStore.dSelectWidgets.length
      ? widgetStore.dSelectWidgets
      : [widgetStore.dActiveElement]
    const ids = new Set(widgets.filter(Boolean).map(widget => widget!.uuid))
    return selectable().filter(el => ids.has(el.dataset.uuid!))
  }
  const paintSelection = (elements: Element[]) => {
    container.querySelectorAll('.widget-selected').forEach(el => el.classList.remove('widget-selected'))
    elements.forEach(el => el.classList.add('widget-selected'))
  }
  const commitSelection = async (elements: Element[]) => {
    const ids = new Set(elements.map(el => el.getAttribute('data-uuid')))
    const widgets = widgetStore.dWidgets.filter(widget => ids.has(widget.uuid))
    widgetStore.setMouseEvent(null)
    widgetStore.dSelectWidgets = widgets.length > 1 ? widgets : []
    widgetStore.dActiveElement = widgets.length === 1 ? widgets[0] : canvasStore.dPage
    await nextTick()
    paintSelection(elements)
    moveable.rotatable = widgets.length === 1
    if (widgets.length !== 1) moveable.renderDirections = []
    moveable.target = elements.length > 1
      ? elements as HTMLElement[]
      : elements[0] as HTMLElement || document.getElementById('empty')
    moveable.updateRect()
  }

  // Started manually from capture, so ordinary drag/click selection keeps its existing behavior.
  const marquee = new Selecto({
    container,
    dragContainer: [],
    selectableTargets: [selectable],
    selectByClick: false,
    selectFromInside: true,
    hitRate: 100,
    getElementRect: getElementInfo,
    continueSelectWithoutDeselect: true,
  })
  marquee.on('select', e => paintSelection(e.selected))
  marquee.on('selectEnd', e => {
    const down = startEvent
    startEvent = null
    if (!down) return
    if (Math.abs(e.rect.width) < 4 && Math.abs(e.rect.height) < 4) {
      // A stationary Ctrl click still toggles a layer, including a group as a whole.
      const layer = clickedLayer
      const selected = layer
        ? initialSelection.includes(layer)
          ? initialSelection.filter(el => el !== layer)
          : [...initialSelection, layer]
        : initialSelection
      void commitSelection(selected)
    } else {
      void commitSelection(e.selected)
    }
  })

  const onMouseDown = (event: MouseEvent) => {
    if (!event.ctrlKey || event.button !== 0 || controlStore.dSpaceDown) return
    const target = event.target as HTMLElement
    if (!container.contains(target) && !target.closest('.moveable-control-box')) return
    if (target.closest('input, textarea, button, select, [contenteditable="true"]')) return
    startEvent = event
    initialSelection = currentSelection()
    const layers = selectable()
    clickedLayer = document.elementsFromPoint(event.clientX, event.clientY)
      .map(hit => layers.find(el => el === hit || el.contains(hit)))
      .find(Boolean)
    marquee.continueSelect = event.shiftKey
    marquee.setSelectedTargets(event.shiftKey ? initialSelection : [])
    widgetStore.setMouseEvent(null)
    event.preventDefault()
    event.stopImmediatePropagation()
    marquee.triggerDragStart(event)
  }
  gestureContainer.addEventListener('mousedown', onMouseDown, true)
  onBeforeUnmount(() => {
    gestureContainer.removeEventListener('mousedown', onMouseDown, true)
    marquee.destroy()
  })
}
