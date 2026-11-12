/**
 * [TINIX] Capture the current page as a small JPEG data URL for the AI (long edge ≈ 1024px).
 * The editor renders the page at full size inside #page-design-canvas and shrinks it with
 * CSS transform: scale(z) — html2canvas renders a clone without that transform.
 */
import html2canvas from 'html2canvas'
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

export async function capturePage(opts: { maxEdge?: number; hideText?: boolean } = {}): Promise<string> {
  const el = document.getElementById('page-design-canvas') as HTMLElement | null
  if (!el) throw new Error(i18t('tinix.ui.capture.khong_tim_thay_trang_thiet'))
  const w = el.offsetWidth, h = el.offsetHeight
  const scale = Math.min(1, (opts.maxEdge || 1024) / Math.max(w, h))
  const canvas = await html2canvas(el, {
    scale,
    width: w,
    height: h,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (doc: Document) => {
      const c = doc.getElementById('page-design-canvas') as HTMLElement | null
      if (!c) return
      c.style.transform = 'none'
      // selection/hover chrome must not end up in the picture
      doc.querySelectorAll('.moveable-control-box, .shelter, .shelter-bg, .line-guides').forEach((n) => ((n as HTMLElement).style.display = 'none'))
      if (opts.hideText) c.querySelectorAll('.w-text').forEach((n) => ((n as HTMLElement).style.visibility = 'hidden'))
    },
  })
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Read a user-picked image file as a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
