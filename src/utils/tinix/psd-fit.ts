/**
 * [TINIX] Resize imported PSD point-text boxes to fit the substitute font.
 *
 * Point text never wraps in Photoshop, but the importer keeps the PSD bounding
 * box. When the library font is wider than the original one, the widget wraps
 * ("FAMIL / Y"). We measure each line with the real font + letter spacing and
 * widen the box around its anchor (center / left / right alignment).
 */
type TextCloud = {
  left: number
  width: number
  text: string
  fontSize: number
  letterSpacing: number // % of fontSize
  fontWeight?: string
  fontStyle?: string
  textAlign?: string
}

let ctx: CanvasRenderingContext2D | null = null

const registered = new Set<string>()

/** Make sure the library font is usable by canvas before measuring (widgets register it later). */
export async function ensureFont(family: string, url: string) {
  if (!url || registered.has(family)) return
  registered.add(family)
  try {
    const face = new FontFace(family, `url(${JSON.stringify(url)})`)
    await face.load()
    document.fonts.add(face)
  } catch (e) {
    console.warn('[tinix:psd-fit] cannot load font', family, e)
  }
}

export async function fitPointText(x: TextCloud, fontClass: { value: string; url: string }, pageWidth: number): Promise<void> {
  const family = fontClass.value
  await ensureFont(family, fontClass.url)
  const weight = x.fontWeight || '400'
  const style = x.fontStyle || 'normal'
  const font = `${style} ${weight} ${x.fontSize}px "${family}"`
  try {
    await document.fonts.load(font, x.text.slice(0, 50))
  } catch (e) {
    /* measure with fallback font */
  }
  ctx = ctx || document.createElement('canvas').getContext('2d')
  if (!ctx) return
  ctx.font = font
  const spacing = (x.fontSize * (x.letterSpacing || 0)) / 100
  const lines = String(x.text).split(/\r\n|\r|\n/)
  const widest = Math.max(...lines.map((l) => ctx!.measureText(l).width + spacing * [...l].length))
  const needed = Math.ceil(widest + x.fontSize * 0.1) // small safety margin for glyph overhang
  if (needed <= x.width) return

  const extra = needed - x.width
  const align = x.textAlign || 'left'
  if (align === 'center' || align === 'justify') x.left -= extra / 2
  else if (align === 'right') x.left -= extra
  x.width = needed
  // keep inside the page when possible
  if (x.left < 0) x.left = 0
  if (pageWidth > 0 && x.left + x.width > pageWidth && x.width <= pageWidth) x.left = pageWidth - x.width
}


/** Width in px of the widest line, with letter spacing (% of font size) — font must be loaded. */
export function measureLines(text: string, font: { family: string; size: number; weight?: string; style?: string; letterSpacing?: number }): number {
  ctx = ctx || document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  ctx.font = `${font.style || 'normal'} ${font.weight || '400'} ${font.size}px "${font.family}"`
  const spacing = (font.size * (font.letterSpacing || 0)) / 100
  return Math.max(0, ...String(text).split(/\r\n|\r|\n/).map((l) => ctx!.measureText(l).width + spacing * [...l].length))
}
