/**
 * [TINIX] Map a Photoshop font (PostScript name, e.g. "MicrosoftYaHeiLight",
 * "PlayfairDisplay-BoldItalic") to the closest font in the TinixPoster library.
 *
 * Order: exact family match → prefix match → category guess from the name →
 * default sans. Weight / italic are read from the style suffix.
 */
import { useFontStore } from '@/common/methods/fonts'

export type LibraryFont = { id: number; alias: string; value: string; url: string; lang?: string }
export type FontClass = { id: number; alias: string; value: string; url: string }
export type PsdFontMatch = { fontClass: FontClass; fontWeight: string; fontStyle: string; exact: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const WEIGHTS: Array<[RegExp, string]> = [
  [/(hairline|thin)/i, '100'],
  [/(extralight|ultralight)/i, '200'],
  [/light/i, '300'],
  [/medium/i, '500'],
  [/(semibold|demibold|demi)/i, '600'],
  [/(extrabold|ultrabold|heavy)/i, '800'],
  [/black/i, '900'],
  [/bold/i, '700'],
]
const STYLE_SUFFIX = /(hairline|thin|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|demi|extrabold|ultrabold|heavy|black|bold|italic|oblique|roman|std|pro|mt|ps|psmt)+$/i

/** Preferred library family per guessed category (must exist in scripts/tinix-fonts.json). */
const CATEGORY_RULES: Array<[RegExp, string[]]> = [
  // rounded / cute display fonts (common in kids & wedding magazine templates)
  [/(round|kodomo|maru|bubble|comic|cute|kids|mano|blaxtendida|nunito|quicksand|varela)/i, ['Nunito', 'Quicksand']],
  [/(script|brush|vibes|signature|calligraph|allura|alex|pinyon|parisienne|sacramento|hand(?!el)|shelley|edwardian|kunstler|vivaldi)/i, ['Great Vibes', 'Allura', 'Alex Brush']],
  [/(impact|bebas|anton|oswald|league|condensed|compressed|knockout|druk|haettenschweiler)/i, ['Oswald', 'Anton']],
  [/(didot|bodoni|playfair|vogue|display|fashion)/i, ['Playfair Display', 'Noto Serif Display']],
  [/(song|sung|ming|serif|times|garamond|georgia|baskerville|caslon|minion|cormorant|roman|book|newspaper|trajan|cinzel)/i, ['Cormorant Garamond', 'EB Garamond', 'Lora']],
  [/(hei|sans|yahei|arial|helvetica|gothic|roboto|futura|avenir|gotham|montserrat|segoe|tahoma|verdana|proxima|inter|lato|opensans|grotesk|din)/i, ['Montserrat', 'Be Vietnam Pro', 'Inter']],
]
const DEFAULT_FAMILIES = ['Montserrat', 'Be Vietnam Pro', 'Inter']

function weightOf(psName: string): string {
  const style = psName.includes('-') ? psName.split('-').slice(1).join('-') : psName
  for (const [re, w] of WEIGHTS) if (re.test(style)) return w
  return ''
}

function toClass(f: LibraryFont): FontClass {
  return { id: f.id, alias: f.alias, value: f.value, url: f.url }
}

export async function loadLibraryFonts(): Promise<LibraryFont[]> {
  if (!useFontStore.list.length) await useFontStore.init()
  return useFontStore.list as unknown as LibraryFont[]
}

export function matchPsdFont(psName: string, library: LibraryFont[]): PsdFontMatch | null {
  if (!library.length) return null
  const raw = String(psName || '')
  const family = raw.split('-')[0]
  const base = norm(family).replace(STYLE_SUFFIX, '') || norm(family)
  const fontWeight = weightOf(raw)
  const fontStyle = /(italic|oblique)/i.test(raw) ? 'italic' : ''
  const byValue = (name: string) => library.find((f) => norm(f.value) === norm(name))

  // 1. exact / 2. prefix match on the family name (ignore very short names)
  let hit = library.find((f) => norm(f.value) === base)
  if (!hit && base.length >= 4) hit = library.find((f) => norm(f.value).startsWith(base) || base.startsWith(norm(f.value)))
  if (hit) return { fontClass: toClass(hit), fontWeight, fontStyle, exact: true }

  // 3. category guess from the name / 4. default sans
  const rule = CATEGORY_RULES.find(([re]) => re.test(raw))
  for (const name of rule ? rule[1] : DEFAULT_FAMILIES) {
    const f = byValue(name)
    if (f) return { fontClass: toClass(f), fontWeight, fontStyle, exact: false }
  }
  return null
}
