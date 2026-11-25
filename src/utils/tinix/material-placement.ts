// [TINIX] Match original material pixels to a reference at several sizes and angles.
import type { PieceOpening, SheetPiece } from './material-sheet'
import { createOpeningFitter, openingFitKind, outerPaperContour } from './material-opening-fit'

export type MaterialTargetBox = { x: number; y: number; width: number; height: number }
export type MaterialTargetFit = 'contain' | 'width' | 'height' // [TINIX] Which axis controls the proportional scale.
export type MaterialEdge = { start: { x: number; y: number }; end: { x: number; y: number } }
export type MaterialPose = { x: number; y: number; scale: number; angle: number; score: number; reliable: boolean;
  layoutOrder?: number; decorationCode?: string; // [TINIX] Placement and stacking from a material ZIP.
  cutOuterOnly?: boolean; // [TINIX] Cut mode declared for the matched piece.
  target?: MaterialTargetBox; targetFit?: MaterialTargetFit; frameCode?: string; heightRatio?: number; diagramShift?: boolean; paperFit?: boolean;
  bottomFit?: boolean; archBottom?: { x: number; y: number }; measuredEdge?: MaterialEdge; fromLayout?: boolean } // [TINIX]
type Bounds = { left: number; top: number; right: number; bottom: number }
type Sample = { x: number; y: number; r: number; g: number; b: number }
type Candidate = Omit<MaterialPose, 'reliable'>
export type MaterialSearchArea = MaterialTargetBox & { angle?: number }
export type MaterialDiagramArea = MaterialSearchArea & { frameCode?: string }
export type MaterialSearchCenter = { x: number; y: number; angle?: number }
export type MatchRequest = { reference: ImageData; originalWidth: number; source: ImageData;
  diagram?: boolean;
  diagramAreas?: MaterialDiagramArea[];
  openingReference?: ImageData;
  photoReference?: ImageData;
  pieces: Array<SheetPiece & { bounds: Bounds; searchArea?: MaterialSearchArea; searchCenter?: MaterialSearchCenter;
    roundOpening?: boolean; frameCode?: string; opening?: PieceOpening; openingSize?: { width: number; height: number };
    archBottom?: { x: number; y: number } }> }

// [TINIX] Use the rotated extents so fitting preserves the source proportions.
export function materialPoseScale(pose: MaterialPose, piece: { width: number; height: number },
  guide: { width: number; height: number }, originalWidth = guide.width) {
  const target = pose.target
  if (!target) return pose.scale * guide.width / originalWidth
  const angle = pose.angle * Math.PI / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  // [TINIX] A target seeded from a placed frame retains its independent height scale.
  const height = piece.height * (pose.heightRatio ?? 1)
  const byWidth = target.width * guide.width / (piece.width * cos + height * sin)
  const byHeight = target.height * guide.height / (piece.width * sin + height * cos)
  if (pose.targetFit === 'width') return byWidth
  if (pose.targetFit === 'height') return byHeight
  return Math.min(byWidth, byHeight)
}

// [TINIX] Register a full visible straight edge to the corresponding side of the PNG opening.
export function fitMaterialEdge(pose: MaterialPose, opening: PieceOpening, piece: { width: number; height: number },
  page: { width: number; height: number }, edge: MaterialEdge): MaterialPose | undefined {
  if (pose.target || opening.length < 4) return
  const dx = (edge.end.x - edge.start.x) * page.width
  const dy = (edge.end.y - edge.start.y) * page.height
  const length = Math.hypot(dx, dy)
  if (length < Math.min(page.width, page.height) * .045) return
  const rad = pose.angle * Math.PI / 180
  const alongX = dx * Math.cos(rad) + dy * Math.sin(rad)
  const alongY = -dx * Math.sin(rad) + dy * Math.cos(rad)
  const horizontal = Math.abs(alongX) >= Math.abs(alongY)
  const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI - (horizontal ? 0 : 90)
  const angle = rawAngle + 180 * Math.round((pose.angle - rawAngle) / 180)
  if (Math.abs(angle - pose.angle) > 18) return
  const xs = opening.map(p => (p.x - .5) * piece.width)
  const ys = opening.map(p => (p.y - .5) * piece.height)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const x = (edge.start.x + edge.end.x) / 2
  const y = (edge.start.y + edge.end.y) / 2
  const deltaX = (x - pose.x) * page.width
  const deltaY = (y - pose.y) * page.height
  const localX = deltaX * Math.cos(rad) + deltaY * Math.sin(rad)
  const localY = -deltaX * Math.sin(rad) + deltaY * Math.cos(rad)
  const oldY = pose.scale * (pose.heightRatio ?? 1)
  const measured = length / (horizontal ? right - left : bottom - top)
  const previous = horizontal ? pose.scale : oldY
  if (!Number.isFinite(measured) || measured < previous * .60 || measured > previous * 1.65) return
  // Keep the perpendicular estimate close to both the existing fit and the native opening proportions.
  const sx = horizontal ? measured : Math.sqrt(pose.scale * measured)
  const sy = horizontal ? Math.sqrt(oldY * measured) : measured
  const u = horizontal ? (left + right) / 2 : localX / pose.scale < (left + right) / 2 ? left : right
  const v = horizontal ? (localY / oldY < (top + bottom) / 2 ? top : bottom) : (top + bottom) / 2
  const theta = angle * Math.PI / 180
  return { ...pose, x: x - (u * sx * Math.cos(theta) - v * sy * Math.sin(theta)) / page.width,
    y: y - (u * sx * Math.sin(theta) + v * sy * Math.cos(theta)) / page.height,
    scale: sx, heightRatio: sy / sx, angle, reliable: false, measuredEdge: edge }
}

// [TINIX] Keep a fitted frame inside the page using the visible source pixels, not its padded box.
function keepFittedFrameInside(pose: MaterialPose, piece: MatchRequest['pieces'][number], source: ImageData,
  pageWidth: number, pageHeight: number): MaterialPose {
  const { left, right, top, bottom } = piece.bounds
  const originX = (left + right) / 2
  const originY = (top + bottom) / 2
  const angle = pose.angle * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const sy = pose.scale * (pose.heightRatio ?? 1)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const index of piece.pixels) {
    if (source.data[index * 4 + 3] < 96) continue
    const x = (index % source.width + .5 - originX) * pose.scale
    const y = (Math.floor(index / source.width) + .5 - originY) * sy
    const px = x * cos - y * sin
    const py = x * sin + y * cos
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  }
  const pad = 3
  const clamp = (value: number, min: number, max: number, size: number) => {
    if (!Number.isFinite(min) || max - min + 2 * pad > size) return value
    return Math.max(pad - min, Math.min(size - pad - max, value * size)) / size
  }
  return { ...pose, x: clamp(pose.x, minX, maxX, pageWidth), y: clamp(pose.y, minY, maxY, pageHeight) }
}

function samples(source: ImageData, piece: MatchRequest['pieces'][number]) {
  const { width, data } = source
  const { left, top, right, bottom } = piece.bounds
  const grid = new Map<number, Sample>()
  for (const p of piece.pixels) {
    if (data[p * 4 + 3] < 220) continue
    const x = p % width
    const y = Math.floor(p / width)
    const key = Math.floor((x - left) * 9 / (right - left)) + 9 * Math.floor((y - top) * 9 / (bottom - top))
    if (grid.has(key)) continue
    grid.set(key, { x: x - (left + right) / 2, y: y - (top + bottom) / 2,
      r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] })
  }
  return [...grid.values()]
}

// [TINIX] A diagram's lettering and empty paper are poor visual matches. Sample the
// tape or ornament at one end of the frame and keep the offset to the frame center.
function diagramSamples(source: ImageData, piece: MatchRequest['pieces'][number]) {
  const { left, top, right, bottom } = piece.bounds
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  const upper: Sample[] = []
  const lower: Sample[] = []
  const step = Math.max(2, Math.floor(Math.min(right - left, bottom - top) / 60))
  for (const index of piece.pixels) {
    const x = index % source.width
    const y = Math.floor(index / source.width)
    if (x % step || y % step || source.data[index * 4 + 3] < 190) continue
    const [r, g, b] = source.data.subarray(index * 4, index * 4 + 3)
    if (r - b <= 43 || r - g <= 15) continue
    const point = { x: x - centerX, y: y - centerY, r, g, b }
    if (y < top + (bottom - top) * .33) upper.push(point)
    if (y > top + (bottom - top) * .70) lower.push(point)
  }
  const accent = upper.length >= lower.length ? upper : lower
  if (accent.length < 12) return []
  return accent.filter((_, index) => index % Math.max(1, Math.ceil(accent.length / 92)) === 0)
}

function match(reference: ImageData, points: Sample[], nominal: number, area?: MaterialSearchArea, center?: MaterialSearchCenter,
  diagram = false): MaterialPose | undefined {
  if (points.length < 5) return
  const { width, height, data } = reference
  // [TINIX] A click fixes translation while size and angle are still scored against the reference.
  const left = Math.min(width - 1, Math.max(0, Math.round((center?.x ?? area?.x ?? 0) * width)))
  const top = Math.min(height - 1, Math.max(0, Math.round((center?.y ?? area?.y ?? 0) * height)))
  const right = center ? left : Math.min(width - 1, Math.round(((area?.x ?? 0) + (area?.width ?? 1)) * width))
  const bottom = center ? top : Math.min(height - 1, Math.round(((area?.y ?? 0) + (area?.height ?? 1)) * height))
  const coarseStep = Math.max(1, Math.min(6, Math.floor(Math.min(right - left, bottom - top) / 3)))
  const preferredAngle = area?.angle ?? center?.angle
  const angles = preferredAngle === undefined ? (diagram ? [-14, -7, 0, 7, 14] : [-36, -24, -12, 0, 12, 24, 36])
    : [preferredAngle - 6, preferredAngle, preferredAngle + 6]
  const candidates: Candidate[] = []
  const shortlist = (candidate: Candidate) => {
    const similar = candidates.findIndex(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < coarseStep * 2.2)
    if (similar >= 0) {
      if (candidates[similar].score <= candidate.score) return
      candidates.splice(similar, 1)
    }
    const index = candidates.findIndex(p => p.score > candidate.score)
    if (index < 0) candidates.push(candidate)
    else candidates.splice(index, 0, candidate)
    if (candidates.length > 8) candidates.pop()
  }
  function scoreAt(offsets: Sample[], x: number, y: number, limit: number) {
    let loss = 0
    for (const p of offsets) {
      const col = x + p.x
      const row = y + p.y
      if (col < 0 || col >= width || row < 0 || row >= height) loss += 72
      else {
        const k = (row * width + col) * 4
        const diff = (Math.abs(data[k] - p.r) + Math.abs(data[k + 1] - p.g) + Math.abs(data[k + 2] - p.b)) / 3
        loss += Math.min(72, diff)
      }
      if (loss > limit) break
    }
    return loss
  }
  const scaled = (angle: number, scale: number, set: Sample[]) => {
    const radians = angle * Math.PI / 180
    const a = Math.cos(radians) * scale * nominal
    const b = Math.sin(radians) * scale * nominal
    return set.map(p => ({ ...p, x: Math.round(a * p.x - b * p.y), y: Math.round(b * p.x + a * p.y) }))
  }
  const sparse = points.filter((_, i) => i % 2 === 0)
  const scales = diagram ? [.66, .78, .9, 1.02, 1.14, 1.26] : [.65, .85, 1.05, 1.25, 1.45, 1.7, 2]
  for (const scale of scales) {
    for (const angle of angles) {
      const offsets = scaled(angle, scale, sparse)
      for (let y = top; y <= bottom; y += coarseStep) {
        for (let x = left; x <= right; x += coarseStep) {
          const max = (candidates[7]?.score ?? 72) * sparse.length
          const score = scoreAt(offsets, x, y, max)
          if (score <= max) shortlist({ x, y, angle, scale, score: score / sparse.length })
        }
      }
    }
  }
  const refined = candidates.map(candidate => {
    let best = { ...candidate, score: Infinity }
    for (const deltaScale of [-0.1, 0, 0.1]) {
      for (const deltaAngle of [-6, 0, 6]) {
        const angle = candidate.angle + deltaAngle
        if (preferredAngle !== undefined && Math.abs(angle - preferredAngle) > 8) continue
        const scale = candidate.scale + deltaScale
        const offsets = scaled(angle, scale, points)
        for (let dy = -coarseStep; dy <= coarseStep; dy += 2) {
          for (let dx = -coarseStep; dx <= coarseStep; dx += 2) {
            const x = candidate.x + dx
            const y = candidate.y + dy
            if (x < left || x > right || y < top || y > bottom) continue
            const max = best.score * points.length
            const score = scoreAt(offsets, x, y, max) / points.length
            if (score < best.score) best = { x, y, angle, scale, score }
          }
        }
      }
    }
    return best
  }).sort((a, b) => a.score - b.score)
  const best = refined[0]
  if (!best) return
  const alternate = refined.find(other => Math.hypot(other.x - best.x, other.y - best.y) >= coarseStep * 4)
  return { ...best, x: center?.x ?? best.x / width, y: center?.y ?? best.y / height,
    reliable: best.score < 35 && (!alternate || alternate.score - best.score > 2.5) }
}

export function matchMaterialPoses({ reference, originalWidth, source, pieces, diagram, diagramAreas, openingReference, photoReference }: MatchRequest) {
  const scale = reference.width / originalWidth
  if (!diagram) return pieces.map(piece => match(reference, samples(source, piece), scale, piece.searchArea, piece.searchCenter))
  const codedPieces = new Map<string, number>()
  for (const piece of pieces) {
    if (piece.frameCode) codedPieces.set(piece.frameCode, (codedPieces.get(piece.frameCode) ?? 0) + 1)
  }
  const available = diagramAreas?.filter(area => !area.frameCode || !codedPieces.has(area.frameCode)) ?? []
  const tags = available.length <= 12 ? available : []
  const poses: Array<MaterialPose | undefined> = pieces.map(() => undefined)
  let fitOpening: ReturnType<typeof createOpeningFitter> | undefined
  let fitPhoto: ReturnType<typeof createOpeningFitter> | undefined
  const candidates = pieces.flatMap((piece, index) => {
    const accent = diagramSamples(source, piece)
    const points = accent.length ? accent : samples(source, piece)
    if (piece.frameCode) {
      // [TINIX] An explicit code reserves its tag. A missing or repeated code must not fall back to a different frame.
      const matches = diagramAreas?.filter(area => area.frameCode === piece.frameCode) ?? []
      if (matches.length === 1 && codedPieces.get(piece.frameCode) === 1) {
        const area = matches[0]
        const x = area.x + area.width / 2
        const y = area.y + area.height / 2
        const colorPose = match(reference, points, scale, area, undefined, true)
        // [TINIX] A matched tag bounds the search. Use the diagram gradient for arches and the visible paper edge in the reference for the other shapes.
        const kind = piece.opening && (piece.roundOpening ? 'oval' : openingFitKind(piece.opening))
        if (kind && piece.opening && piece.openingSize) {
          if (kind === 'arch' && openingReference) fitOpening ??= createOpeningFitter(openingReference, originalWidth)
          if (photoReference) fitPhoto ??= createOpeningFitter(photoReference, originalWidth)
          const center = { x, y }
          const local = kind === 'oval' ? undefined
            : (kind === 'arch' ? fitOpening : fitPhoto)?.(piece.opening, piece.openingSize, center, kind)
          const confirmed = fitPhoto?.(piece.opening, piece.openingSize, center, kind, true)
          const divergence = local && confirmed && (Math.hypot(local.x - confirmed.x, local.y - confirmed.y) > .023 ||
            Math.abs(local.scale - confirmed.scale) > .14 ||
            Math.abs(local.scale * local.heightRatio - confirmed.scale * confirmed.heightRatio) > .16)
          // [TINIX] A frame that moves relative to the diagram needs the photo's contour,
          // and a weak contour should leave the local suggestion pending review.
          // An occluding portrait can create a false bottom edge on an arch.
          const plausibleArch = kind !== 'arch' || !local || !confirmed ||
            confirmed.scale * confirmed.heightRatio >= local.scale * local.heightRatio * .92
          const checkOval = kind === 'oval' && (!colorPose || colorPose.scale < .78 || colorPose.scale > 1.20)
          const shifted = Boolean(confirmed && confirmed.score <= 22 && plausibleArch &&
            (checkOval || kind !== 'oval' && !local || divergence && (kind === 'arch' || kind === 'rounded')))
          // [TINIX] A large discrepancy on an arch is often the foreground hiding the real bottom.
          // Fit the exposed upper portions of both paper contours as one shape.
          const outer = kind === 'arch' && (divergence || piece.archBottom)
            ? outerPaperContour(piece, source, piece.bounds, piece.openingSize) : undefined
          const paper = outer && local && fitPhoto?.(piece.opening, piece.openingSize, center, kind, true,
            { outer, diagramHeight: local.scale * local.heightRatio, diagramCenterY: local.y, bottom: piece.archBottom })
          const fitted = paper ?? (shifted ? confirmed : local)
          if (fitted) {
            const suggestion = { ...fitted, frameCode: piece.frameCode, reliable: false, diagramShift: shifted,
              paperFit: Boolean(paper), bottomFit: Boolean(paper && piece.archBottom), archBottom: paper ? piece.archBottom : undefined }
            poses[index] = keepFittedFrameInside(suggestion, piece, source, originalWidth, originalWidth * reference.height / reference.width)
            return []
          }
        }
        // If the rim has weak support, retain the original color estimate.
        const pose = colorPose
        poses[index] = {
          x: pose?.x ?? x, y: pose?.y ?? y, scale: pose?.scale ?? 1,
          angle: piece.roundOpening ? 0 : pose?.angle ?? 0, score: pose?.score ?? 72,
          frameCode: piece.frameCode, reliable: false,
        }
      }
      return []
    }
    if (piece.searchArea || piece.searchCenter || !tags.length) {
      const pose = match(reference, points, scale, piece.searchArea, piece.searchCenter, true)
      if (pose) poses[index] = { ...pose, reliable: false }
      return []
    }
    return tags.flatMap((area, tag) => {
      const pose = match(reference, points, scale, area, undefined, true)
      return pose ? [{ index, tag, pose, priority: pose.score + (accent.length ? 0 : 7) }] : []
    })
  })
  // [TINIX] Optimize the frame-to-tag assignment together so a similar Polaroid
  // cannot claim the other frame's tag before its better match is considered.
  if (!tags.length) return poses
  type Assignment = { score: number; placed: typeof candidates }
  let assignments = new Map<number, Assignment>([[0, { score: 0, placed: [] }]])
  for (let index = 0; index < pieces.length; index++) {
    const next = new Map(assignments)
    const options = candidates.filter(candidate => candidate.index === index)
    for (const [used, assignment] of assignments) for (const choice of options) {
      const bit = 1 << choice.tag
      if (used & bit || choice.priority >= 40) continue
      const key = used | bit
      const score = assignment.score + choice.priority - 40
      if (score < (next.get(key)?.score ?? Infinity)) next.set(key, { score, placed: [...assignment.placed, choice] })
    }
    assignments = next
  }
  const best = [...assignments.values()].reduce((a, b) => a.score <= b.score ? a : b)
  for (const { index, pose } of best.placed) {
    // A round opening supplies no stable rotation cue; keep the source ornament upright.
    poses[index] = { ...pose, angle: pieces[index].roundOpening ? 0 : pose.angle, reliable: false }
  }
  return poses
}
