// [TINIX] Check ZIP material before it changes the canvas.
import { materialSourceMinOverlap, materialSourceOverlap, type parseMaterialLayout } from './material-layout'
import { pieceBounds, sheetPieces, type SheetPiece } from './material-sheet'

type Placement = ReturnType<typeof parseMaterialLayout>['placements'][number]
type Bounds = ReturnType<typeof pieceBounds>
type ScanPiece = SheetPiece & { bounds: Bounds }
type JsonGap = { code: string; fields: string[]; bounds?: Bounds }
export type ArchiveRegion = { id: string; bounds: Bounds }

export type MaterialArchiveCheck = {
  count: number
  frames: ArchiveRegion[]
  alpha: ArchiveRegion[]
  source: (ArchiveRegion & { overlap: number })[]
  unlisted: ArchiveRegion[]
  fields: JsonGap[]
}

export function hasMaterialArchiveWarnings(check: MaterialArchiveCheck) {
  return Boolean(check.alpha.length || check.source.length || check.unlisted.length || check.fields.length)
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function missingMaterialFields(text: string): JsonGap[] {
  const layout = object(JSON.parse(text))
  const groups = [layout.frames, layout.decorations]
  const required = ['code', 'source', 'target']
  const gaps: JsonGap[] = groups.flatMap((entries, group) => Array.isArray(entries) ? entries.flatMap((value, index) => {
    const entry = object(value)
    const fields = [...required, ...(group ? ['z'] : [])].filter(key => entry[key] === undefined)
    for (const box of ['source', 'target']) {
      if (entry[box] === undefined) continue
      const keys = ['x', 'y', 'width', 'height', ...(box === 'target' ? ['angle'] : [])]
      fields.push(...keys.filter(key => object(entry[box])[key] === undefined).map(key => `${box}.${key}`))
    }
    const code = typeof entry.code === 'string' ? entry.code : `${group ? 'decorations' : 'frames'}[${index}]`
    const bounds = readSourceBounds(entry.source)
    return fields.length ? [{ code, fields, bounds }] : []
  }) : [])
  if (layout.subject !== undefined) {
    const target = object(object(layout.subject).target)
    const fields = ['x', 'y', 'width', 'height', 'angle'].filter(key => target[key] === undefined).map(key => `subject.target.${key}`)
    if (layout.subjectZ === undefined) fields.push('subjectZ')
    if (fields.length) gaps.push({ code: 'SUBJECT', fields })
  }
  return gaps
}

function sourceBounds({ x, y, width, height }: Placement['source']) {
  return { left: x, top: y, right: x + width, bottom: y + height }
}

// [TINIX] Missing JSON fields can still be located when their source box is complete.
function readSourceBounds(value: unknown) {
  const { x, y, width, height } = object(value)
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' ||
      ![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width < 1 || height < 1) return
  return sourceBounds({ x, y, width, height })
}

function bestSourceMatch(placement: Placement, pieces: ScanPiece[]) {
  let best = { overlap: 0, bounds: sourceBounds(placement.source) }
  for (const piece of pieces) {
    const overlap = materialSourceOverlap(placement.source, piece.bounds)
    if (overlap > best.overlap) best = { overlap, bounds: piece.bounds }
  }
  return best
}

function containsPiecePixels(owners: Int32Array, id: number, width: number, source: Placement['source']) {
  const minimum = Math.ceil(source.width * source.height * .10)
  let count = 0
  for (let y = source.y; y < source.y + source.height; y++) {
    for (let x = source.x; x < source.x + source.width; x++) {
      if (owners[y * width + x] === id && ++count >= minimum) return true
    }
  }
  return false
}

export function checkMaterialArchive(image: ImageData, placements: Placement[], extraction: SheetPiece[]) {
  const scan = (pieces: SheetPiece[]) => pieces.map(piece => ({ ...piece, bounds: pieceBounds(piece, image.width) }))
  const cut = scan(extraction)
  const low = scan(sheetPieces(image, 4))
  const parent = new Int32Array(image.width * image.height)
  low.forEach((piece, index) => {
    for (const pixel of piece.pixels) parent[pixel] = index + 1
  })
  const fullMatches = low.map(piece => placements.find(placement =>
    materialSourceOverlap(placement.source, piece.bounds) >= materialSourceMinOverlap))
  const cores = scan(sheetPieces(image, 128))
  const groups = new Map<number, { codes: Set<string>; unlisted: boolean }>()
  const minimumArea = Math.max(16, Math.ceil(parent.length / 10000))
  const unlisted: MaterialArchiveCheck['unlisted'] = []
  for (const core of cores) {
    const id = parent[core.pixels[0]] - 1
    // A complete source box can contain several opaque details on one translucent piece.
    if (fullMatches[id]) continue
    const fit = placements.map(placement => ({ code: placement.code, overlap: materialSourceOverlap(placement.source, core.bounds) }))
      .sort((a, b) => b.overlap - a.overlap)
    const code = fit[0]?.overlap >= .20 ? fit[0].code : undefined
    if (!code && core.pixels.length < minimumArea) continue
    const group = groups.get(id) ?? { codes: new Set<string>(), unlisted: false }
    if (code) group.codes.add(code)
    else {
      group.unlisted = true
      const { left, top } = core.bounds
      unlisted.push({ bounds: core.bounds, id: `PNG@${left},${top}` })
    }
    groups.set(id, group)
  }
  const alphaCodes = new Set<string>()
  for (const { codes, unlisted: hasUnlisted } of groups.values()) {
    if (codes.size > 1 || hasUnlisted) codes.forEach(code => alphaCodes.add(code))
  }
  // A fully opaque bridge can also leave only one core. Look for two separate source boxes inside it.
  for (const core of cores) {
    const id = parent[core.pixels[0]] - 1
    if (fullMatches[id]) continue
    const overlapping = placements.filter(({ source }) => materialSourceOverlap(source, core.bounds) >= .20 &&
      source.x >= core.bounds.left && source.y >= core.bounds.top &&
      source.x + source.width <= core.bounds.right && source.y + source.height <= core.bounds.bottom &&
      containsPiecePixels(parent, id + 1, image.width, source))
    for (const placement of overlapping) {
      if (!overlapping.some(other => other !== placement &&
        materialSourceOverlap(placement.source, sourceBounds(other.source)) === 0)) continue
      alphaCodes.add(placement.code)
    }
  }
  // A standalone translucent component may have no opaque core at all.
  const parentsWithCore = new Set(cores.map(core => parent[core.pixels[0]] - 1))
  low.forEach((piece, index) => {
    if (fullMatches[index] || parentsWithCore.has(index) || piece.pixels.length < minimumArea) return
    if (placements.some(placement => materialSourceOverlap(placement.source, piece.bounds) >= .20)) return
    const { left, top } = piece.bounds
    unlisted.push({ bounds: piece.bounds, id: `PNG@${left},${top}` })
  })
  const alpha = placements.filter(({ code }) => alphaCodes.has(code)).map(placement => {
    const best = bestSourceMatch(placement, cores)
    return { id: placement.code, bounds: best.overlap >= .20 ? best.bounds : sourceBounds(placement.source) }
  })
  const source = placements.flatMap(placement => {
    // A low-alpha bridge corrupts the extracted box. Use the opaque core to measure location independently.
    const { overlap } = bestSourceMatch(placement, alphaCodes.has(placement.code) ? cores : cut)
    return overlap >= materialSourceMinOverlap ? [] : [{
      id: placement.code, overlap: Math.floor(overlap * 100), bounds: sourceBounds(placement.source),
    }]
  })
  // [TINIX] Search the actual frame silhouette, which can extend outside a misplaced source box.
  const frames = placements.filter(item => item.code.startsWith('F')).map(item => {
    const match = bestSourceMatch(item, cores)
    return { id: item.code, bounds: match.overlap >= .65 ? match.bounds : sourceBounds(item.source) }
  })
  return { count: placements.length, frames, alpha, source, unlisted, fields: [] } satisfies MaterialArchiveCheck
}
