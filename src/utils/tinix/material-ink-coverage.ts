// [TINIX] Measure coverage using the same transforms as the material preview.
import { cutoutCanvas, readCutoutImage } from './cutout-workspace'
import type { MaterialSearchArea } from './material-placement'

type PositionedMaterial = { id: number; url: string; x: number; y: number; width: number; height: number; angle: number }

function materialRaster(width: number, height: number, maxSide = 480) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const { context } = cutoutCanvas(Math.ceil(width * scale), Math.ceil(height * scale))
  const size = context.canvas
  async function raster(piece: PositionedMaterial) {
    const image = await readCutoutImage(piece.url)
    context.clearRect(0, 0, size.width, size.height)
    context.save()
    context.scale(scale, scale)
    context.translate(piece.x, piece.y)
    context.rotate(piece.angle * Math.PI / 180)
    context.drawImage(image, -piece.width / 2, -piece.height / 2, piece.width, piece.height)
    context.restore()
    return context.getImageData(0, 0, size.width, size.height).data
  }
  return { raster, size, context }
}

// [TINIX] In a tight junction crop, the foreground piece keeps a visible edge.
// A cut edge of a piece underneath can be hidden even where both silhouettes nearly meet.
export async function inferInterruptedEdge(width: number, height: number, reference: string,
  target: PositionedMaterial, other: PositionedMaterial, region: MaterialSearchArea) {
  const { raster, size, context } = materialRaster(width, height, 760)
  const w = size.width
  const h = size.height
  const ref = await readCutoutImage(reference)
  context.drawImage(ref, 0, 0, w, h)
  const observed = context.getImageData(0, 0, w, h).data
  // [TINIX] Try the drawn region first, then widen it in two bounded steps.
  const regions = [0, .012, .024].map(fraction => {
    const padding = fraction * Math.min(width, height)
    const x = Math.max(0, region.x - padding / width)
    const y = Math.max(0, region.y - padding / height)
    return { x, y, width: Math.min(1, region.x + region.width + padding / width) - x,
      height: Math.min(1, region.y + region.height + padding / height) - y }
  })
  const bounds = regions.map(area => ({
    left: Math.max(4, Math.floor(area.x * w)), top: Math.max(4, Math.floor(area.y * h)),
    right: Math.min(w - 4, Math.ceil((area.x + area.width) * w)),
    bottom: Math.min(h - 4, Math.ceil((area.y + area.height) * h)),
  }))
  const largest = bounds[bounds.length - 1]
  const difference = (a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number) =>
    (Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2])) / 3
  const index = (x: number, y: number) => (y * w + x) * 4
  async function edgeSamples(piece: PositionedMaterial) {
    return Promise.all([.85, 1, 1.15, 1.3].map(async zoom => {
      const pixels = await raster({ ...piece, width: piece.width * zoom, height: piece.height * zoom })
      const edge: Array<{ x: number; y: number; inside: number; dx: number; dy: number }> = []
      for (let y = Math.max(4, largest.top - 30); y < Math.min(h - 4, largest.bottom + 30); y++) {
        for (let x = Math.max(4, largest.left - 30); x < Math.min(w - 4, largest.right + 30); x++) {
          if (pixels[index(x, y) + 3] < 218) continue
          const dx = Math.sign(pixels[index(x - 1, y) + 3] - pixels[index(x + 1, y) + 3])
          const dy = Math.sign(pixels[index(x, y - 1) + 3] - pixels[index(x, y + 1) + 3])
          if ((!dx && !dy) || pixels[index(x + dx * 2, y + dy * 2) + 3] >= 90) continue
          const inside = index(x - dx * 3, y - dy * 3)
          if (pixels[inside + 3] > 220) edge.push({ x, y, inside, dx, dy })
        }
      }
      return { zoom, pixels, edge }
    }))
  }

  function edgeSupport(variants: Awaited<ReturnType<typeof edgeSamples>>, { left, top, right, bottom }: typeof largest) {
    type Contact = { x: number; y: number; dx: number; dy: number }
    let best = { score: 0, contacts: [] as Contact[] }
    for (const { zoom, pixels, edge } of variants) {
      for (let sy = -30; sy <= 30; sy += 2) {
        for (let sx = -30; sx <= 30; sx += 2) {
          let samples = 0
          const contacts: Contact[] = []
          for (const p of edge) {
            const x = p.x + sx
            const y = p.y + sy
            if (x < left || x >= right || y < top || y >= bottom) continue
            const inside = index(x - 3 * p.dx, y - 3 * p.dy)
            const outside = index(x + 3 * p.dx, y + 3 * p.dy)
            const insideError = difference(pixels, p.inside, observed, inside)
            const edgeContrast = difference(observed, inside, observed, outside)
            if (insideError < 28 && edgeContrast > 20 &&
                difference(pixels, p.inside, observed, outside) - insideError > 13) contacts.push({ x, y, dx: p.dx, dy: p.dy })
            samples++
          }
          if (samples < 14) continue
          const votes = contacts.length
          const score = votes * (votes / samples) - Math.hypot(sx, sy) * .12 - Math.abs(zoom - 1) * 5
          if (score > best.score) best = { score, contacts }
        }
      }
    }
    return best
  }
  // [TINIX] Confirm the same edge with the second PNG. One coherent placement
  // must cover the seam and reproduce the observed color on its exposed side.
  function sharedContacts(edge: ReturnType<typeof edgeSupport>, backing: Awaited<ReturnType<typeof edgeSamples>>) {
    if (edge.contacts.length < 14 || edge.score < 8) return 0
    let best = 0
    for (const { pixels } of backing) {
      for (let sy = -27; sy <= 27; sy += 3) {
        for (let sx = -27; sx <= 27; sx += 3) {
          let matched = 0
          for (const p of edge.contacts) {
            const x = p.x - sx
            const y = p.y - sy
            if (x < 7 || x >= w - 7 || y < 7 || y >= h - 7) continue
            const under = index(x - 2 * p.dx, y - 2 * p.dy)
            const exposed = index(x + 3 * p.dx, y + 3 * p.dy)
            if (pixels[under + 3] < 210 || pixels[exposed + 3] < 218) continue
            const outside = index(p.x + 3 * p.dx, p.y + 3 * p.dy)
            const inside = index(p.x - 3 * p.dx, p.y - 3 * p.dy)
            const error = difference(pixels, exposed, observed, outside)
            if (error < 30 && difference(pixels, exposed, observed, inside) - error > 10) matched++
          }
          best = Math.max(best, matched)
        }
      }
    }
    return best
  }
  // [TINIX] A repeated colored band supplies evidence when a nearby white rim
  // matches the wrong silhouette. Look for alternating tones along the band.
  function repeatingBand(data: Uint8ClampedArray, lines: number[][], minPeriod: number, maxPeriod: number) {
    const matches: Array<{ period: number; redGreen: number; greenBlue: number }> = []
    for (const line of lines) {
      if (line.length < minPeriod * 3) continue
      const values = line.map(pixel => (data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3)
      const ordered = [...values].sort((a, b) => a - b)
      const low = ordered[Math.floor(ordered.length * .25)]
      const high = ordered[Math.floor(ordered.length * .75)]
      if (high - low < 17) continue
      const middle = (high + low) / 2
      const runs: number[] = []
      let start = 0
      for (let i = 1; i < values.length; i++) {
        if ((values[i] < middle) === (values[start] < middle)) continue
        runs.push(i - start)
        start = i
      }
      const widths = runs.slice(1)
      if (widths.length < 5) continue
      const sorted = [...widths].sort((a, b) => a - b)
      const half = sorted[Math.floor(sorted.length / 2)]
      const period = half * 2
      if (period < minPeriod || period > maxPeriod ||
          widths.filter(value => Math.abs(value - half) <= Math.max(1, half * .45)).length < widths.length * .7) continue
      let redGreen = 0
      let greenBlue = 0
      let colored = 0
      for (const [i, pixel] of line.entries()) {
        if (values[i] >= middle) continue
        redGreen += data[pixel] - data[pixel + 1]
        greenBlue += data[pixel + 1] - data[pixel + 2]
        colored++
      }
      if (colored) matches.push({ period, redGreen: redGreen / colored, greenBlue: greenBlue / colored })
    }
    return matches
  }

  async function bandSignature(piece: PositionedMaterial) {
    const source = await readCutoutImage(piece.url)
    const { naturalWidth: sw, naturalHeight: sh } = source
    if (sw < 3 * sh) return []
    const { context: src } = cutoutCanvas(sw, sh)
    src.drawImage(source, 0, 0)
    const data = src.getImageData(0, 0, sw, sh).data
    const lines = []
    for (let y = Math.ceil(sh * .25); y < sh * .75; y += Math.max(1, Math.floor(sh / 12))) {
      const line = []
      for (let x = Math.ceil(sw * .12); x < sw * .88; x++) line.push((y * sw + x) * 4)
      if (line.every(pixel => data[pixel + 3] >= 64)) lines.push(line)
    }
    return repeatingBand(data, lines, sw / 32, sw / 4).map(match => ({
      ...match, period: match.period * piece.width * w / (sw * width),
    }))
  }

  function matchesBand(signature: Awaited<ReturnType<typeof bandSignature>>, edge: ReturnType<typeof edgeSupport>,
    piece: PositionedMaterial, box: typeof largest) {
    if (!signature.length) return false
    const lines: number[][] = []
    const rows = new Set(edge.contacts.map(point => point.y - 4 * point.dy))
    for (const delta of [-12, 0, 12]) {
      const slope = Math.tan((piece.angle + delta) * Math.PI / 180)
      if (Math.abs(slope) > .65) continue
      const center = (box.left + box.right) / 2
      for (const row of rows) {
        const line = []
        for (let x = box.left; x < box.right; x++) {
          const y = Math.round(row + (x - center) * slope)
          if (y >= box.top && y < box.bottom) line.push(index(x, y))
        }
        lines.push(line)
      }
    }
    const patterns = repeatingBand(observed, lines, 3, 35)
    return patterns.filter(candidate => signature.some(expected => {
      const length = Math.hypot(candidate.redGreen, candidate.greenBlue) * Math.hypot(expected.redGreen, expected.greenBlue)
      const agreement = candidate.redGreen * expected.redGreen + candidate.greenBlue * expected.greenBlue
      return length >= 150 && agreement >= .8 * length &&
        candidate.period >= expected.period * .6 && candidate.period <= expected.period * 2.5
    })).length >= 3
  }

  const [targetEdges, otherEdges] = await Promise.all([edgeSamples(target), edgeSamples(other)])
  let signatures: Awaited<ReturnType<typeof bandSignature>>[] | undefined
  for (const [step, box] of bounds.entries()) {
    const a = edgeSupport(targetEdges, box)
    const b = edgeSupport(otherEdges, box)
    const aContacts = sharedContacts(a, otherEdges)
    const bContacts = sharedContacts(b, targetEdges)
    const winner = a.score >= b.score ? a : b
    const reverse = winner === a ? b : a
    const samples = winner === a ? aContacts : bContacts
    const reverseContacts = winner === a ? bContacts : aContacts
    const hasSharedEdge = (edge: typeof winner, contacts: number) =>
      edge.contacts.length >= 14 && edge.score >= 8 && contacts >= Math.max(12, edge.contacts.length * .17)
    // [TINIX] When both orders explain the same junction, require stronger separation.
    const margin = hasSharedEdge(reverse, reverseContacts) ? 1.8 : 1.45
    if (hasSharedEdge(winner, samples) && winner.score >= margin * reverse.score) {
      return { items: [{ id: other.id, above: winner === b, samples }], region: regions[step], step }
    }
    if (!hasSharedEdge(winner, samples) && hasSharedEdge(reverse, reverseContacts)) {
      signatures ??= await Promise.all([bandSignature(target), bandSignature(other)])
      const above = reverse === b
      if (matchesBand(signatures[Number(above)], reverse, above ? other : target, box)) {
        return { items: [{ id: other.id, above, samples: reverseContacts }], region: regions[step], step }
      }
    }
  }
  return { items: [], region: regions[regions.length - 1], step: regions.length - 1 }
}

export async function findMaterialObstructions(width: number, height: number, target: PositionedMaterial,
  foreground: PositionedMaterial[], mode: 'ink' | 'piece') {
  const { raster } = materialRaster(width, height)
  const targetPixels = await raster(target)
  const sample = []
  for (let i = 0; i < targetPixels.length; i += 4) {
    if (targetPixels[i + 3] < 220) continue
    const dark = .2126 * targetPixels[i] + .7152 * targetPixels[i + 1] + .0722 * targetPixels[i + 2] < 115
    if (mode === 'piece' || dark) sample.push(i + 3)
  }
  if (!sample.length) return []
  const suggestions: Array<{ id: number; percent: number }> = []
  for (const piece of foreground) {
    const pixels = await raster(piece)
    let covered = 0
    for (const i of sample) if (pixels[i] >= 128) covered++
    if (covered >= Math.max(12, sample.length * .01)) {
      suggestions.push({ id: piece.id, percent: Math.max(1, Math.round(100 * covered / sample.length)) })
    }
  }
  return suggestions.sort((a, b) => b.percent - a.percent)
}

// [TINIX] Locally align the original PNGs, then compare the two possible top pixels.
// The alignment is diagnostic only. It never changes the position of a canvas layer.
export async function inferMaterialStack(width: number, height: number, reference: string,
  target: PositionedMaterial, neighbors: PositionedMaterial[]) {
  const { raster, size, context } = materialRaster(width, height)
  const image = await readCutoutImage(reference)
  const w = size.width
  const h = size.height
  context.drawImage(image, 0, 0, w, h)
  const observed = context.getImageData(0, 0, w, h).data
  function error(pixels: Uint8ClampedArray, source: number, dest: number) {
    return (Math.abs(pixels[source] - observed[dest]) + Math.abs(pixels[source + 1] - observed[dest + 1]) +
      Math.abs(pixels[source + 2] - observed[dest + 2])) / 3
  }
  async function align(piece: PositionedMaterial) {
    let best = { pixels: new Uint8ClampedArray(), x: 0, y: 0, score: Infinity }
    for (const zoom of [1, .85, 1.15, 1.3]) {
      const pixels = await raster({ ...piece, width: piece.width * zoom, height: piece.height * zoom })
      const points: number[] = []
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const i = (y * w + x) * 4
          if (pixels[i + 3] >= 230) points.push(i / 4)
        }
      }
      if (!points.length) continue
      for (let y = -16; y <= 16; y += 4) {
        for (let x = -16; x <= 16; x += 4) {
          let score = 0
          for (const point of points) {
            const col = point % w + x
            const row = Math.floor(point / w) + y
            score += col < 0 || col >= w || row < 0 || row >= h ? 70 : Math.min(70, error(pixels, point * 4, (row * w + col) * 4))
          }
          score = score / points.length + Math.hypot(x, y) * .12 + Math.abs(zoom - 1) * 6
          if (score < best.score) best = { pixels, x, y, score }
        }
      }
    }
    return best
  }
  const a = await align(target)
  const suggestions: Array<{ id: number; above: boolean; samples: number }> = []
  for (const other of neighbors) {
    const reach = (piece: PositionedMaterial) => .65 * Math.hypot(piece.width, piece.height)
    if (Math.hypot(target.x - other.x, target.y - other.y) > reach(target) + reach(other) + 32 * height / h) continue
    const b = await align(other)
    let votesA = 0
    let votesB = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const ax = x - a.x
        const ay = y - a.y
        const bx = x - b.x
        const by = y - b.y
        if (ax < 0 || ax >= w || ay < 0 || ay >= h || bx < 0 || bx >= w || by < 0 || by >= h) continue
        const ai = (ay * w + ax) * 4
        const bi = (by * w + bx) * 4
        if (a.pixels[ai + 3] < 225 || b.pixels[bi + 3] < 225) continue
        const dest = (y * w + x) * 4
        const ea = error(a.pixels, ai, dest)
        const eb = error(b.pixels, bi, dest)
        if (Math.min(ea, eb) > 39 || Math.abs(ea - eb) < 15) continue
        if (ea < eb) votesA++
        else votesB++
      }
    }
    const samples = votesA + votesB
    if (samples >= 18 && Math.max(votesA, votesB) >= .66 * samples) suggestions.push({ id: other.id, above: votesB > votesA, samples })
  }
  return suggestions.sort((a, b) => b.samples - a.samples)
}
