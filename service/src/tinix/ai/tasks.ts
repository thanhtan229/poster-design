/**
 * [TINIX] AI features: suggest text, rewrite text, find font, tag fonts.
 * Coordinates returned to the editor are ratios 0..1 (CLAUDE.md); the frontend converts to px.
 */
import { callVisionJSON, prepareImage } from './vision'
import * as P from './prompts'
import { obj, arr, str, num01, oneOf, color, bool } from './validate'
import { libraryFonts, fontListForPrompt, resolveFont, rankFonts, LibFont } from './fonts'
import { getTinixAiSettings } from './settings'
import { getDB } from '../../db'

const CATEGORIES = ['serif', 'sans', 'script', 'display', 'handwriting'] as const
const PART_KEYS = ['title', 'subtitle', 'body', 'hashtag', 'signature'] as const
type PartKey = typeof PART_KEYS[number]

/** Fallback font per role when the model picks a name that is not in the library. */
const ROLE_FALLBACK: Record<PartKey, string[]> = {
  title: ['Playfair Display', 'Great Vibes', 'Montserrat'],
  subtitle: ['Cormorant Garamond', 'Josefin Sans', 'Montserrat'],
  body: ['Be Vietnam Pro', 'Lora', 'Montserrat'],
  hashtag: ['Josefin Sans', 'Montserrat'],
  signature: ['Allura', 'Great Vibes', 'Corinthia'],
}

const fontClass = (f: LibFont) => ({ id: f.id, alias: f.alias, value: f.value, url: f.woff })

function pickFont(name: string, role: PartKey, fonts: LibFont[]): LibFont | null {
  return resolveFont(name, fonts) || ROLE_FALLBACK[role].map((n) => resolveFont(n, fonts)).find(Boolean) || fonts[0] || null
}

// ───────────────────────── Gợi ý chữ ─────────────────────────
export async function suggestText(input: { image: string; width: number; height: number; lang?: string }) {
  const lang = input.lang === 'en' ? 'en' : 'vi'
  const fonts = libraryFonts(lang === 'vi')
  if (!fonts.length) throw new Error('Kho font trống — chạy "npm run tinix:fonts" trước.')
  const image = await prepareImage(input.image)
  const studio = getTinixAiSettings().studio_name

  const { data, jobId, model } = await callVisionJSON({
    kind: 'suggest_text',
    system: P.SUGGEST_TEXT_SYSTEM,
    text: P.suggestTextUser({ lang, studio, width: input.width, height: input.height, fonts: fontListForPrompt(fonts) }),
    images: [image],
    inputSummary: { lang, width: input.width, height: input.height, studio },
    validate: (v) => {
      const o = obj(v, 'root')
      const regions = arr(o.emptyRegions || [], 'emptyRegions', 0, 6).map((r: any, i: number) => {
        const x = num01(r.x, `emptyRegions[${i}].x`), y = num01(r.y, `emptyRegions[${i}].y`)
        return { x, y, w: Math.min(1 - x, num01(r.w, `emptyRegions[${i}].w`)), h: Math.min(1 - y, num01(r.h, `emptyRegions[${i}].h`)), tone: oneOf(r.tone, ['dark', 'light'] as const, 'dark') }
      })
      if (!regions.length) regions.push({ x: 0.08, y: 0.06, w: 0.84, h: 0.28, tone: 'dark' })
      const options = arr(o.options, 'options', 1, 3).map((opt: any, i: number) => {
        const p = obj(opt.parts, `options[${i}].parts`)
        obj(p.title, `options[${i}].parts.title`)
        const parts: Record<string, any> = {}
        for (const key of PART_KEYS) {
          const part = p[key]
          if (!part || !part.text) continue
          parts[key] = {
            text: str(part.text, `options[${i}].parts.${key}.text`, { max: 400 }),
            fontFamily: str(part.fontFamily, `options[${i}].parts.${key}.fontFamily`, { optional: true, max: 80 }),
            weight: Math.min(900, Math.max(100, Math.round((Number(part.weight) || 400) / 100) * 100)),
            italic: bool(part.italic),
            uppercase: bool(part.uppercase),
          }
        }
        return {
          styleName: str(opt.styleName, `options[${i}].styleName`, { optional: true, max: 80 }) || `Phương án ${i + 1}`,
          regionIndex: Math.min(regions.length - 1, Math.max(0, Math.floor(Number(opt.regionIndex) || 0))),
          align: oneOf(opt.align, ['left', 'center', 'right'] as const, 'center'),
          palette: { primary: color(opt.palette && opt.palette.primary, '#ffffff'), secondary: color(opt.palette && opt.palette.secondary, '#f2e6d0') },
          parts,
          translationVi: str(opt.translationVi, `options[${i}].translationVi`, { optional: true, max: 1200 }),
        }
      })
      return { scene: str(o.scene, 'scene', { optional: true, max: 500 }), emptyRegions: regions, options }
    },
  })

  // resolve fonts to library entries (the editor needs id/value/url)
  for (const opt of data.options) {
    for (const key of PART_KEYS) {
      const part = opt.parts[key]
      if (!part) continue
      const f = pickFont(part.fontFamily, key, fonts)
      part.fontClass = f ? fontClass(f) : null
      part.fontFamily = f ? f.value : part.fontFamily
    }
  }
  return { ...data, jobId, model }
}

// ───────────────────────── Sửa chữ ─────────────────────────
export async function rewriteText(input: { image: string; layers: Array<{ uuid: string; text: string }>; lang?: string }) {
  const layers = (input.layers || [])
    .filter((l) => l && l.uuid && typeof l.text === 'string' && l.text.trim())
    .slice(0, 30)
    .map((l) => ({ uuid: String(l.uuid), text: l.text, lines: l.text.split(/\r\n|\r|\n/).length, chars: l.text.length }))
  if (!layers.length) throw new Error('Thiết kế chưa có lớp chữ nào để sửa.')
  const lang = ['vi', 'en'].includes(String(input.lang)) ? String(input.lang) : 'keep'
  const image = await prepareImage(input.image)
  const ids = new Set(layers.map((l) => l.uuid))

  const { data, jobId, model } = await callVisionJSON({
    kind: 'rewrite_text',
    system: P.REWRITE_TEXT_SYSTEM,
    text: P.rewriteTextUser({ lang, layers }),
    images: [image],
    inputSummary: { lang, layers },
    validate: (v) => {
      const o = obj(v, 'root')
      const options = arr(o.options, 'options', 1, 3).map((opt: any, i: number) => {
        const reps = arr(opt.replacements, `options[${i}].replacements`, 1, 40)
          .filter((r: any) => r && ids.has(String(r.uuid)))
          .map((r: any) => ({ uuid: String(r.uuid), text: str(r.text, `options[${i}].replacements.text`, { max: 2000 }) }))
        if (!reps.length) throw new Error(`options[${i}].replacements: không có uuid hợp lệ`)
        return { styleName: str(opt.styleName, 'styleName', { optional: true, max: 80 }) || `Phương án ${i + 1}`, replacements: reps, translationVi: str(opt.translationVi, 'translationVi', { optional: true, max: 1500 }) }
      })
      return { options }
    },
  })
  return { ...data, jobId, model }
}

// ───────────────────────── Tìm font ─────────────────────────
export async function findFont(input: { image: string }) {
  const image = await prepareImage(input.image, 1280)
  const fonts = libraryFonts(false)
  const { data, jobId, model } = await callVisionJSON({
    kind: 'find_font',
    system: P.FIND_FONT_SYSTEM,
    text: P.findFontUser({ categories: CATEGORIES.join(', ') }),
    images: [image],
    temperature: 0.2,
    inputSummary: {},
    validate: (v) => {
      const o = obj(v, 'root')
      const items = arr(o.items, 'items', 1, 5).map((it: any, i: number) => ({
        text: str(it.text, `items[${i}].text`, { optional: true, max: 120 }),
        bbox: it.bbox ? { x: num01(it.bbox.x, 'bbox.x', 0), y: num01(it.bbox.y, 'bbox.y', 0), w: num01(it.bbox.w, 'bbox.w', 1), h: num01(it.bbox.h, 'bbox.h', 1) } : null,
        category: oneOf(it.category, CATEGORIES, 'sans'),
        traits: arr(it.traits || [], 'traits', 0, 12).map((t: any) => String(t).slice(0, 60)),
        suspected: arr(it.suspected || [], 'suspected', 0, 6).map((t: any) => String(t).slice(0, 60)),
      }))
      return { items }
    },
  })
  const items = data.items.map((it) => {
    const candidates = rankFonts(it, fonts, 5).map((f) => ({ ...fontClass(f), category: f.category, tags: f.tags, score: f.score, supports_vietnamese: f.supports_vietnamese }))
    const libNames = new Set(fonts.map((f) => f.value.toLowerCase()))
    const notInLibrary = it.suspected.filter((s) => !libNames.has(s.toLowerCase()) && !resolveFont(s, fonts))
    return { ...it, candidates, notInLibrary }
  })
  return { items, jobId, model }
}

// ───────────────────────── Dựng theo mẫu ─────────────────────────
const ROLES = ['title', 'subtitle', 'body', 'date', 'hashtag', 'signature', 'other'] as const
const ROLE_TO_PART: Record<string, PartKey> = { title: 'title', subtitle: 'subtitle', body: 'body', date: 'subtitle', hashtag: 'hashtag', signature: 'signature', other: 'body' }

export async function rebuildFromReference(input: { reference: string; photo?: string; lang?: string }) {
  const lang = input.lang === 'en' ? 'en' : 'vi'
  const fonts = libraryFonts(lang === 'vi')
  if (!fonts.length) throw new Error('Kho font trống — chạy "npm run tinix:fonts" trước.')
  const reference = await prepareImage(input.reference, 1280)
  const photo = input.photo ? await prepareImage(input.photo, 768) : ''
  const images = photo ? [reference, photo] : [reference]
  const studio = getTinixAiSettings().studio_name

  const bbox = (b: any, path: string) => {
    const o = obj(b, path)
    const x = num01(o.x, `${path}.x`), y = num01(o.y, `${path}.y`)
    return { x, y, w: Math.max(0.005, Math.min(1 - x, num01(o.w, `${path}.w`))), h: Math.max(0.005, Math.min(1 - y, num01(o.h, `${path}.h`))) }
  }

  const { data, jobId, model } = await callVisionJSON({
    kind: 'rebuild',
    system: P.REBUILD_SYSTEM,
    text: P.rebuildUser({ lang, hasPhoto: !!photo, studio, fonts: fontListForPrompt(fonts) }),
    images,
    temperature: 0.6,
    timeoutMs: 150000,
    inputSummary: { lang, hasPhoto: !!photo },
    validate: (v) => {
      const o = obj(v, 'root')
      const regions = arr(o.regions, 'regions', 1, 25).map((r: any, i: number) => {
        const p = `regions[${i}]`
        const type = oneOf(r.type, ['text', 'photo', 'shape'] as const, 'shape')
        const base = { type, bbox: bbox(r.bbox, `${p}.bbox`), z: Number.isFinite(Number(r.z)) ? Number(r.z) : i }
        if (type === 'text') {
          return {
            ...base,
            role: oneOf(r.role, ROLES, 'other'),
            text: str(r.text, `${p}.text`, { max: 600 }),
            fontFamily: str(r.fontFamily, `${p}.fontFamily`, { optional: true, max: 80 }),
            fontSize: Math.min(0.4, Math.max(0.006, Number(r.fontSize) || 0.03)),
            weight: Math.min(900, Math.max(100, Math.round((Number(r.weight) || 400) / 100) * 100)),
            italic: bool(r.italic),
            uppercase: bool(r.uppercase),
            letterSpacing: Math.min(200, Math.max(-20, Number(r.letterSpacing) || 0)),
            lineHeight: Math.min(3, Math.max(0.8, Number(r.lineHeight) || 1.2)),
            align: oneOf(r.align, ['left', 'center', 'right'] as const, 'center'),
            color: color(r.color, '#222222'),
          }
        }
        if (type === 'shape') return { ...base, shape: oneOf(r.shape, ['rect', 'rounded', 'ellipse', 'line'] as const, 'rect'), color: color(r.color, '#dddddd'), opacity: Math.min(1, Math.max(0.05, Number(r.opacity) || 1)) }
        return base
      })
      if (!regions.some((r: any) => r.type === 'text')) throw new Error('regions: không có khối chữ nào')
      return { background: color(o.background, '#ffffff'), regions, notes: str(o.notes, 'notes', { optional: true, max: 400 }) }
    },
  })

  for (const r of data.regions as any[]) {
    if (r.type !== 'text') continue
    const f = pickFont(r.fontFamily, ROLE_TO_PART[r.role] || 'body', fonts)
    r.fontClass = f ? fontClass(f) : null
    r.fontFamily = f ? f.value : r.fontFamily
  }
  data.regions.sort((a: any, b: any) => a.z - b.z)
  return { ...data, jobId, model }
}

// ───────────────────────── AI gắn tag font ─────────────────────────
export async function tagFonts(input: { all?: boolean }) {
  const fonts = libraryFonts(false).filter((f) => input.all || !f.tags.length || !f.category)
  if (!fonts.length) return { updated: 0, fonts: [] }
  const names = fonts.slice(0, 60).map((f) => f.value)
  const { data, jobId, model } = await callVisionJSON({
    kind: 'tag_fonts',
    system: P.TAG_FONTS_SYSTEM,
    text: P.tagFontsUser(names),
    useTextModel: true,
    temperature: 0.3,
    inputSummary: { names },
    validate: (v) => {
      const o = obj(v, 'root')
      return arr(o.fonts, 'fonts', 1, 60).map((f: any, i: number) => ({
        family: str(f.family, `fonts[${i}].family`, { max: 80 }),
        category: oneOf(f.category, CATEGORIES, 'sans'),
        tags: arr(f.tags || [], `fonts[${i}].tags`, 0, 8).map((t: any) => String(t).slice(0, 30)),
      }))
    },
  })
  const update = getDB().prepare('UPDATE fonts SET category = @category, tags = @tags WHERE value = @value')
  let updated = 0
  for (const f of data) {
    const target = resolveFont(f.family, fonts)
    if (!target) continue
    updated += update.run({ category: f.category, tags: JSON.stringify(f.tags), value: target.value }).changes
  }
  return { updated, fonts: data, jobId, model }
}
