/**
 * [TINIX] Correct text metrics when importing a PSD text layer.
 * Pure functions — runs inside the PSD web worker (no DOM).
 *
 * Photoshop stores a "raw" FontSize and a separate transform matrix: when you
 * scale a text layer, FontSize stays the same and the matrix grows. The displayed
 * size is FontSize × scale. The original importer ignored the scale (tiny/huge
 * text), Tracking (letter spacing), FontCaps (All Caps) and Leading (line height).
 */

export type PsdStyleSheet = {
  FontSize?: number
  Tracking?: number // 1/1000 em
  FontCaps?: number // 0 normal, 1 small caps, 2 all caps
  Leading?: number // in raw (unscaled) points
  AutoLeading?: boolean
  FauxBold?: boolean
  FauxItalic?: boolean
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Displayed font size in px (raw FontSize × layer scale). */
export function psdFontSize(rawSize: number | undefined, scale: number, fallback: number): number {
  const size = Number(rawSize) > 0 ? Number(rawSize) : 0
  const s = Number(scale) > 0 ? Number(scale) : 1
  return size ? round1(size * s) : fallback
}

/** Widget letterSpacing is a percentage of fontSize; Tracking is 1/1000 em → divide by 10. */
export function psdLetterSpacing(tracking: number | undefined): number {
  const t = Number(tracking)
  return Number.isFinite(t) ? round1(t / 10) : 0
}

/**
 * Widget lineHeight is a multiple of fontSize. Leading and FontSize are both raw
 * (same unscaled unit), so their ratio is scale-independent.
 * Single-line text keeps 1.2 so the box is not clipped by a tiny leading value.
 */
export function psdLineHeight(sheet: PsdStyleSheet, text: string): number {
  const multiline = /[\r\n]/.test(text)
  if (!multiline || sheet.AutoLeading !== false || !(Number(sheet.Leading) > 0) || !(Number(sheet.FontSize) > 0)) return 1.2
  const ratio = Number(sheet.Leading) / Number(sheet.FontSize)
  return round1(Math.min(3, Math.max(0.8, ratio)))
}

export type PsdTransform = { xx: number; xy: number; yx: number; yy: number; tx: number; ty: number }
export type PsdGeometry = {
  scaleX: number
  scaleY: number
  /** degrees, CSS rotate() convention (negative = counter-clockwise) */
  angle: number
  /** unrotated widget rect for paragraph text (from BoxBounds), null for point text */
  rect: { left: number; top: number; width: number; height: number } | null
}

/**
 * Decompose the text transform. Photoshop maps a local point (x, y) to
 * (xx·x + yx·y + tx, xy·x + yy·y + ty). For paragraph text, BoxBounds is the
 * text box in local units [left, top, right, bottom]: its transformed centre +
 * scaled size give an unrotated rect that CSS rotate() (around the centre) puts
 * back in place.
 */
export function psdTextGeometry(tf: PsdTransform, boxBounds?: number[] | null): PsdGeometry {
  const xx = Number(tf?.xx) || 1, xy = Number(tf?.xy) || 0, yx = Number(tf?.yx) || 0, yy = Number(tf?.yy) || 1
  const tx = Number(tf?.tx) || 0, ty = Number(tf?.ty) || 0
  const scaleX = Math.hypot(xx, xy) || 1
  const scaleY = Math.hypot(yx, yy) || 1
  const angle = Math.round(((Math.atan2(xy, xx) * 180) / Math.PI) * 100) / 100
  let rect: PsdGeometry['rect'] = null
  if (Array.isArray(boxBounds) && boxBounds.length === 4 && boxBounds[2] > boxBounds[0] && boxBounds[3] > boxBounds[1]) {
    const [l, t, r, b] = boxBounds.map(Number)
    const cxL = (l + r) / 2, cyL = (t + b) / 2
    const cx = xx * cxL + yx * cyL + tx
    const cy = xy * cxL + yy * cyL + ty
    const width = (r - l) * scaleX
    const height = (b - t) * scaleY
    rect = { left: Math.round(cx - width / 2), top: Math.round(cy - height / 2), width: Math.round(width), height: Math.round(height) }
  }
  return { scaleX, scaleY, angle, rect }
}

/** All Caps in Photoshop is a style, the stored text stays lowercase. */
export function psdApplyCaps(text: string, sheet: PsdStyleSheet): string {
  return sheet.FontCaps === 2 ? text.toUpperCase() : text
}
