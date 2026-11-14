/**
 * [TINIX] Kéo chỉnh kích thước panel: panel trái/phải (độ rộng) và dải ảnh phía dưới (chiều cao).
 * - Kéo thanh ở mép panel; nhấp đúp để về mặc định; kích thước được nhớ trong localStorage.
 * - Giới hạn min/max, và không vượt quá 40% chiều rộng (45% chiều cao) cửa sổ (khỏi ép mất canvas).
 * - Thả chuột xong mới phát sự kiện `resize` để canvas tự vừa lại (zoomControl lắng nghe resize, đang ở chế độ "vừa khít" thì tính lại zoom).
 */
import { onBeforeUnmount, ref, watch } from 'vue'

type Options = {
  /** khóa lưu trữ, vd 'left' | 'right' | 'dock' */
  key: string
  /** kích thước mặc định (px) */
  def: number
  min: number
  max: number
  /**
   * panel nằm bên nào của canvas: kéo sang phải làm panel trái rộng ra, panel phải hẹp lại;
   * 'bottom': dải phía dưới, kéo lên trên thì cao thêm
   */
  side: 'left' | 'right' | 'bottom'
}

const STORAGE = 'tinix.panelWidth.'

export function usePanelResize(opts: Options) {
  const vertical = opts.side === 'bottom'
  const maxAllowed = () => Math.max(opts.min, Math.min(opts.max, Math.floor((vertical ? window.innerHeight * 0.45 : window.innerWidth * 0.4))))
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

  /** độ rộng (trái/phải) hoặc chiều cao (bottom) hiện tại */
  const width = ref(clamp(read()))
  // biến CSS --tinix-panel-<key> (px): thành phần đặt cố định (vd nút zoom) bám theo độ rộng panel
  watch(width, (w) => document.documentElement.style.setProperty('--tinix-panel-' + opts.key, w + 'px'), { immediate: true })
  const dragging = ref(false)
  let start = 0
  let startW = 0

  function onMove(e: MouseEvent) {
    const d = (vertical ? e.clientY : e.clientX) - start
    width.value = clamp(opts.side === 'left' ? startW + d : startW - d)
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
    start = vertical ? e.clientY : e.clientX
    startW = width.value
    dragging.value = true
    document.body.style.cursor = vertical ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  function reset() {
    width.value = clamp(opts.def)
    save()
    refit()
  }

  // cửa sổ thu nhỏ: giữ panel trong giới hạn
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
