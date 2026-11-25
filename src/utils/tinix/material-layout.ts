// [TINIX] Optional pixel coordinates from the same source document as the material PNGs.
import type { MaterialPose } from './material-placement'
import type { pieceBounds } from './material-sheet'
import { cmToPx, MAX_DPI, MAX_PIXELS, MAX_SIDE_PX, MIN_DPI } from './units' // [TINIX]

type ImageSpec = { file: string; width: number; height: number }
type Box = { x: number; y: number; width: number; height: number }
type Placement = { code: string; source: Box; target: Box & { angle: number }; z?: number; cutOuterOnly?: boolean } // [TINIX]
export type MaterialSubject = Box & { angle: number; borderMm: number } // [TINIX] Geometry normalized to the reference.
export type MaterialPrintSize = { width: number; height: number; dpi: number } // [TINIX] Canvas dimensions in pixels.
type Bounds = ReturnType<typeof pieceBounds>

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid material layout object')
  return value as Record<string, unknown>
}

function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid material layout coordinate')
  return value
}

function imageSpec(value: unknown): ImageSpec {
  const { file, width, height } = record(value)
  if (typeof file !== 'string' || !file || /[/\\]/.test(file)) throw new Error('Invalid material layout filename')
  const size = { width: number(width, 1, 16_000_000), height: number(height, 1, 16_000_000) }
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) throw new Error('Invalid material layout image size')
  return { file, ...size }
}

export function isMaterialPrintSize(value: MaterialPrintSize | undefined): value is MaterialPrintSize {
  return Boolean(value && [value.width, value.height].every(side => Number.isInteger(side) && side > 0 && side <= MAX_SIDE_PX) &&
    value.width * value.height <= MAX_PIXELS && Number.isInteger(value.dpi) && value.dpi >= MIN_DPI && value.dpi <= MAX_DPI)
}

export function parseMaterialLayout(text: string, sheet: ImageSpec, reference: ImageSpec) {
  const layout = record(JSON.parse(text))
  if (layout.version !== 1 || !Array.isArray(layout.frames) || layout.frames.length < 1 || layout.frames.length > 9)
    throw new Error('Unsupported material layout')
  for (const [value, actual] of [[layout.sheet, sheet], [layout.reference, reference]] as const) {
    const declared = imageSpec(value)
    if (declared.file !== actual.file || declared.width !== actual.width || declared.height !== actual.height)
      throw new Error('Material layout image mismatch')
  }
  let printSize: MaterialPrintSize | undefined
  if (layout.print !== undefined) {
    const spec = record(layout.print)
    const dpi = number(spec.dpi, MIN_DPI, MAX_DPI)
    const width = cmToPx(number(spec.widthMm, 1, MAX_SIDE_PX * 25.4 / MIN_DPI) / 10, dpi)
    const height = cmToPx(number(spec.heightMm, 1, MAX_SIDE_PX * 25.4 / MIN_DPI) / 10, dpi)
    printSize = { width, height, dpi }
    // [TINIX] Allow pixel rounding while keeping the print and reference aspect ratios aligned.
    if (!isMaterialPrintSize(printSize) ||
        Math.abs(width * reference.height - height * reference.width) > Math.max(width + height, reference.width + reference.height))
      throw new Error('Invalid material print size or aspect ratio')
  }
  const decorations = layout.decorations ?? []
  if (!Array.isArray(decorations) || decorations.length > 200) throw new Error('Invalid material decorations')
  const codes = new Set<string>()
  const orders = new Set<number>()
  const order = (value: unknown) => {
    const z = number(value, 0, 10000)
    if (!Number.isInteger(z) || orders.has(z)) throw new Error('Invalid or duplicate material layer order')
    orders.add(z)
    return z
  }
  const subjectZ = layout.subjectZ === undefined ? undefined : order(layout.subjectZ)
  function targetBox(value: unknown) {
    const dst = record(value)
    return {
      x: number(dst.x, 0, reference.width), y: number(dst.y, 0, reference.height),
      width: number(dst.width, 1, reference.width), height: number(dst.height, 1, reference.height),
      angle: number(dst.angle, -180, 180),
    }
  }
  let subject: MaterialSubject | undefined
  if (layout.subject !== undefined) {
    if (subjectZ === undefined) throw new Error('Material subject requires a layer order')
    const spec = record(layout.subject)
    const target = targetBox(spec.target)
    subject = { x: target.x / reference.width, y: target.y / reference.height,
      width: target.width / reference.width, height: target.height / reference.height,
      angle: target.angle, borderMm: number(spec.borderMm ?? 0, 0, 15) }
  }
  function parsePlacement(value: unknown, isFrame: boolean): Placement {
    const { code, source, target, z, cutOuterOnly } = record(value)
    if (typeof code !== 'string' || !(isFrame ? /^F0[1-9]$/ : /^D[0-9]{2,3}$/).test(code) || codes.has(code))
      throw new Error('Invalid material layout code')
    codes.add(code)
    if (cutOuterOnly !== undefined && typeof cutOuterOnly !== 'boolean') throw new Error('Invalid material cut mode')
    const src = record(source)
    const x = number(src.x, 0, sheet.width - 1)
    const y = number(src.y, 0, sheet.height - 1)
    const width = number(src.width, 1, sheet.width - x)
    const height = number(src.height, 1, sheet.height - y)
    if (![x, y, width, height].every(Number.isInteger)) throw new Error('Source rectangle requires whole pixels')
    return { code, z: isFrame && z === undefined ? undefined : order(z), source: { x, y, width, height },
      target: targetBox(target), cutOuterOnly }
  }
  return { subjectZ, subject, printSize, placements: [
    ...layout.frames.map(value => parsePlacement(value, true)),
    ...decorations.map(value => parsePlacement(value, false)),
  ] }
}

// [TINIX] Use the same source-box tolerance in ZIP preflight and placement.
export const materialSourceMinOverlap = .90
export function materialSourceOverlap(box: Box, bounds: Bounds) {
  const { left, top, right, bottom } = bounds
  const common = Math.max(0, Math.min(box.x + box.width, right) - Math.max(box.x, left)) *
    Math.max(0, Math.min(box.y + box.height, bottom) - Math.max(box.y, top))
  return common / (box.width * box.height + (right - left) * (bottom - top) - common)
}

export function matchMaterialLayout(placements: Placement[], pieces: { bounds: Bounds; frame: boolean; hero?: boolean; code?: string; edited: boolean }[],
  reference: { width: number; height: number }) {
  const matches = placements.flatMap(({ code, source, target, z, cutOuterOnly }) => {
    const candidates = pieces.flatMap((piece, index) => materialSourceOverlap(source, piece.bounds) >= materialSourceMinOverlap ? [index] : [])
    if (candidates.length !== 1) return []
    const [index] = candidates
    const { bounds, frame, hero, code: existing, edited } = pieces[index]
    if (hero || frame !== code.startsWith('F') || edited || (existing && existing !== code) ||
        pieces.some((piece, i) => i !== index && piece.frame && piece.code === code))
      return []
    const scale = target.width / (bounds.right - bounds.left)
    const pose: MaterialPose = {
      x: target.x / reference.width, y: target.y / reference.height, scale,
      heightRatio: target.height / ((bounds.bottom - bounds.top) * scale),
      angle: target.angle, frameCode: frame ? code : undefined, decorationCode: frame ? undefined : code,
      layoutOrder: z, cutOuterOnly, score: 1, reliable: false, fromLayout: true,
    }
    return [{ index, code, pose }]
  })
  return matches.filter(match => matches.filter(other => other.index === match.index).length === 1)
}
