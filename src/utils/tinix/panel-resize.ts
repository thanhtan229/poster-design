/**
 * [TINIX] Kéo chỉnh độ rộng panel (trái: danh sách mẫu/chất liệu…, phải: thiết lập/layer).
 * - Kéo thanh ở mép panel; nhấp đúp để về độ rộng mặc định; độ rộng được nhớ trong localStorage.
 * - Giới hạn min/max, và không vượt quá 40% chiều rộng cửa sổ (khỏi ép mất canvas).
 * - Thả chuột xong mới phát sự kiện `resize` để canvas tự vừa lại (zoomControl lắng nghe resize, đang ở chế độ "vừa khít" thì tính lại zoom).
 */
import { onBeforeUnmount, ref } from 'vue'

type Options = {
  /** khóa lưu trữ, vd 'left' | 'right' */
  key: string
  /** độ rộng mặc định (px) */
  def: number
  min: number
  max: number
  /** panel nằm bên nào của canvas: kéo sang phải làm panel trái rộng ra, panel phải hẹp lại */
  side: 'left' | 'right'
}

const STORAGE = 'tinix.panelWidth.'

export function usePanelResize(opts: Options) {
  const maxAllowed = () => Math.max(opts.min, Math.min(opts.max, Math.floor(window.innerWidth * 0.4)))
  const clamp = (w: number) => Math.round(Math.min(maxAllowed(), Math.max(opts.min, Number(w) || opts.def)))
  const read = (): number => {
    try {
      const v = Number(localStorage.getItem(STORAGE + opts.key))
      return v > 0 ? v : opts.def
    } catch (e) {
      return opts.def
    }
  }
  const save = () => {
    try {
      localStorage.setItem(STORAGE + opts.key, String(width.value))
    } catch (e) {
      // không lưu được thì thôi
    }
  }
  const refit = () => window.dispatchEvent(new Event('resize'))

  const width = ref(clamp(read()))
  const dragging = ref(false)
  let startX = 0
  let startW = 0

  function onMove(e: MouseEvent) {
    const dx = e.clientX - startX
    width.value = clamp(opts.side === 'left' ? startW + dx : startW - dx)
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    dragging.value = false
    save()
    refit()
  }
  function onDown(e: MouseEvent) {
    e.preventDefault()
    startX = e.clientX
    startW = width.value
    dragging.value = true
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  function reset() {
    width.value = clamp(opts.def)
    save()
    refit()
  }

  // cửa sổ thu nhỏ: giữ panel trong giới hạn 40%
  const onWindowResize = () => {
    const w = clamp(width.value)
    if (w !== width.value) width.value = w
  }
  window.addEventListener('resize', onWindowResize)
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResize)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  })

  return { width, dragging, onDown, reset }
}
