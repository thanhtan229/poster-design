/**
 * [TINIX] Font library helpers for AI prompts and font matching.
 */
import { getDB } from '../../db'

export type LibFont = { id: number; alias: string; value: string; woff: string; category: string; tags: string[]; supports_vietnamese: boolean }

export function libraryFonts(onlyVietnamese = false): LibFont[] {
  const rows: any[] = getDB()
    .prepare(`SELECT id, alias, value, woff, category, tags, supports_vietnamese FROM fonts ${onlyVietnamese ? 'WHERE supports_vietnamese = 1' : ''} ORDER BY id`)
    .all()
  return rows.map((r) => ({
    id: r.id,
    alias: r.alias,
    value: r.value,
    woff: r.woff,
    category: r.category || '',
    tags: parseTags(r.tags),
    supports_vietnamese: Number(r.supports_vietnamese) === 1,
  }))
}

function parseTags(s: any): string[] {
  try {
    const v = JSON.parse(s || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch (e) {
    return []
  }
}

/** Compact one-line-per-font list for prompts: "Great Vibes | script | lãng mạn, thư pháp". */
export function fontListForPrompt(fonts: LibFont[]): string {
  return fonts.map((f) => `${f.value} | ${f.category || '?'} | ${f.tags.join(', ')}`).join('\n')
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Resolve a model-chosen family name to a library font (exact → normalized → prefix). */
export function resolveFont(name: string, fonts: LibFont[]): LibFont | null {
  if (!name) return null
  const n = norm(name)
  return fonts.find((f) => f.value === name) || fonts.find((f) => norm(f.value) === n) || fonts.find((f) => n.length >= 4 && (norm(f.value).startsWith(n) || n.startsWith(norm(f.value)))) || null
}

/** Score library fonts against a described font (category + mood words + suspected name). */
export function rankFonts(desc: { category?: string; traits?: string[]; suspected?: string[] }, fonts: LibFont[], top = 5): Array<LibFont & { score: number }> {
  const traits = (desc.traits || []).map((t) => t.toLowerCase())
  const suspected = (desc.suspected || []).map(norm).filter(Boolean)
  return fonts
    .map((f) => {
      let score = 0
      if (desc.category && f.category === desc.category) score += 5
      for (const t of f.tags) if (traits.some((x) => x.includes(t.toLowerCase()) || t.toLowerCase().includes(x))) score += 2
      const fv = norm(f.value)
      if (suspected.some((s) => s === fv)) score += 20
      else if (suspected.some((s) => s.length >= 4 && (fv.startsWith(s) || s.startsWith(fv)))) score += 8
      return { ...f, score }
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
}
