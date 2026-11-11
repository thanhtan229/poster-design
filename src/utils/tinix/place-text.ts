/**
 * [TINIX] Turn an AI "Gợi ý chữ" option into text widgets placed inside the chosen empty region.
 *
 * Region is a 0..1 ratio of the page → px. Parts are stacked top-down (title largest);
 * the whole block shrinks until every line fits the region width and the block fits its height.
 */
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import { ensureFont, measureLines } from './psd-fit'
import type { TSuggestOption, TRegion, TSuggestPart } from '@/api/tinix-ai'

export const PART_ORDER = ['subtitle', 'title', 'body', 'hashtag', 'signature'] as const
export type TPartKey = (typeof PART_ORDER)[number]
export const PART_LABEL: Record<TPartKey, string> = { title: 'Tiêu đề', subtitle: 'Tiêu đề phụ', body: 'Nội dung', hashtag: 'Hashtag', signature: 'Chữ ký' }

/** font size relative to the title */
const SIZE_RATIO: Record<TPartKey, number> = { title: 1, subtitle: 0.34, body: 0.24, hashtag: 0.2, signature: 0.3 }
const LINE_HEIGHT: Record<TPartKey, number> = { title: 1.1, subtitle: 1.3, body: 1.5, hashtag: 1.3, signature: 1.2 }
const GAP = 0.35 // gap between parts, × that part's font size

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Keep the AI colour unless it is clearly unreadable on the region tone. */
export function readableColor(color: string, tone: 'dark' | 'light'): string {
  try {
    const L = luminance(color)
    if (tone === 'dark' && L < 0.35) return '#ffffff'
    if (tone === 'light' && L > 0.6) return '#222222'
  } catch (e) {
    /* invalid colour */
  }
  return color
}

const textOf = (p: TSuggestPart) => (p.uppercase ? p.text.toUpperCase() : p.text)

export async function buildTextWidgets(opts: {
  option: TSuggestOption
  region: TRegion
  parts: TPartKey[] // which parts the user ticked
  align: 'left' | 'center' | 'right'
  page: { width: number; height: number }
}) {
  const { option, region, align, page } = opts
  const keys = PART_ORDER.filter((k) => opts.parts.includes(k) && option.parts[k])
  if (!keys.length) return []
  for (const k of keys) {
    const fc = option.parts[k]!.fontClass
    if (fc) await ensureFont(fc.value, fc.url)
  }

  const rx = region.x * page.width, ry = region.y * page.height
  const rw = Math.max(80, region.w * page.width), rh = Math.max(60, region.h * page.height)

  const lines = (k: TPartKey) => textOf(option.parts[k]!).split(/\r\n|\r|\n/).length
  const blockHeight = (title: number) => keys.reduce((sum, k, i) => sum + title * SIZE_RATIO[k] * (LINE_HEIGHT[k] * lines(k) + (i < keys.length - 1 ? GAP : 0)), 0)
  const spacingOf = (k: TPartKey) => (option.parts[k]!.uppercase || k === 'hashtag' || k === 'subtitle' ? 12 : 0)

  // largest title size that fits both height and width (min 12px)
  let title = Math.min(rh / (blockHeight(1) || 1), page.height * 0.2)
  for (let guard = 0; guard < 40 && title > 12; guard++) {
    const tooWide = keys.some((k) => {
      const p = option.parts[k]!
      const w = measureLines(textOf(p), { family: p.fontClass?.value || p.fontFamily, size: title * SIZE_RATIO[k], weight: String(p.weight || 400), style: p.italic ? 'italic' : 'normal', letterSpacing: spacingOf(k) })
      return w > rw * 0.98
    })
    if (!tooWide && blockHeight(title) <= rh) break
    title *= 0.92
  }

  const total = blockHeight(title)
  let top = ry + Math.max(0, (rh - total) / 2) // vertically centred in the region
  const widgets: any[] = []
  keys.forEach((k, i) => {
    const p = option.parts[k]!
    const size = Math.max(10, Math.round(title * SIZE_RATIO[k] * 10) / 10)
    const height = Math.ceil(size * LINE_HEIGHT[k] * lines(k))
    const w = JSON.parse(JSON.stringify(wTextSetting))
    w.name = `AI · ${PART_LABEL[k]}`
    w.text = textOf(p)
    if (p.fontClass) w.fontClass = p.fontClass
    w.fontFamily = p.fontClass?.value || p.fontFamily
    w.fontSize = size
    w.lineHeight = LINE_HEIGHT[k]
    w.letterSpacing = spacingOf(k)
    w.fontWeight = String(p.weight || 400)
    w.fontStyle = p.italic ? 'italic' : ''
    w.textAlign = align
    w.color = readableColor(k === 'title' || k === 'signature' ? option.palette.primary : option.palette.secondary, region.tone)
    w.left = Math.round(rx)
    w.top = Math.round(top)
    w.width = Math.round(rw)
    w.height = height
    w.record = { ...(w.record || {}), width: Math.round(rw), height, minWidth: size, minHeight: size * LINE_HEIGHT[k] }
    widgets.push(w)
    top += height + (i < keys.length - 1 ? size * GAP : 0)
  })
  return widgets
}
