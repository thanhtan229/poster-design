// [TINIX] Compare a loose piece with the colored details embedded in frame artwork.
import type { ArchiveRegion } from './material-archive-check'

type Raster = { width: number; height: number; hue: Uint8Array; chroma: Float32Array; light: Float32Array }
type Pattern = { raster: Raster; ink: Float32Array; mass: number }
type Sample = { x: number; y: number; ink: number; light: number }
type Pose = { score: number; x: number; y: number; scale: number; angle: number }

const scales = [.60, .70, .80, .90, 1, 1.12, 1.25, 1.40]
const angles = [-24, -16, -8, 0, 8, 16, 24]

function rasterize(image: ImageData, { left, top, right, bottom }: ArchiveRegion['bounds'], ratio: number): Raster {
  const width = Math.max(1, Math.round((right - left) * ratio))
  const height = Math.max(1, Math.round((bottom - top) * ratio))
  const hue = new Uint8Array(width * height)
  const chroma = new Float32Array(hue.length)
  const light = new Float32Array(hue.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Average each source cell so the comparison is less sensitive to PNG texture and resolution.
      const startX = left + Math.floor(x * (right - left) / width)
      const endX = left + Math.ceil((x + 1) * (right - left) / width)
      const startY = top + Math.floor(y * (bottom - top) / height)
      const endY = top + Math.ceil((y + 1) * (bottom - top) / height)
      let red = 0; let green = 0; let blue = 0; let coverage = 0
      for (let yy = startY; yy < endY; yy++) {
        for (let xx = startX; xx < endX; xx++) {
          const index = (yy * image.width + xx) * 4
          const alpha = image.data[index + 3] / 255
          if (alpha < .5) continue
          red += image.data[index] * alpha
          green += image.data[index + 1] * alpha
          blue += image.data[index + 2] * alpha
          coverage += alpha
        }
      }
      if (coverage < (endX - startX) * (endY - startY) * .5) continue
      const index = y * width + x
      const max = Math.max(red, green, blue)
      const delta = max - Math.min(red, green, blue)
      light[index] = (red * .21 + green * .72 + blue * .07) / (255 * coverage)
      if (!delta) continue
      const sector = max === red ? (green - blue) / delta : max === green ? 2 + (blue - red) / delta : 4 + (red - green) / delta
      hue[index] = (Math.round(sector * 30) + 180) % 180
      chroma[index] = delta / max
    }
  }
  return { width, height, hue, chroma, light }
}

function palette(raster: Raster) {
  const histogram = new Float32Array(180)
  raster.hue.forEach((hue, index) => {
    if (raster.chroma[index] >= .23 && raster.light[index] <= .94) histogram[hue]++
  })
  let center = 0; let peak = 0
  for (let hue = 0; hue < histogram.length; hue++) {
    let count = 0
    for (let delta = -5; delta <= 5; delta++) count += histogram[(hue + delta + histogram.length) % histogram.length]
    if (count > peak) { center = hue; peak = count }
  }
  return peak >= Math.max(12, raster.hue.length * .12) ? center : undefined
}

function pattern(raster: Raster, center: number): Pattern {
  const { width, height } = raster
  const entries = raster.chroma.map((chroma, index) => {
    const hueDistance = Math.abs(raster.hue[index] - center)
    const hue = Math.min(hueDistance, 180 - hueDistance)
    return Math.max(0, Math.min(1, (11 - hue) / 5)) * Math.max(0, Math.min(1, (chroma - .15) / .14))
  })
  let mass = 0
  const ink = entries.map((entry, index) => {
    const x = index % width; const y = Math.floor(index / width)
    let sum = entry * 4
    if (x > 0) sum += entries[index - 1]
    if (x + 1 < width) sum += entries[index + 1]
    if (y > 0) sum += entries[index - width]
    if (y + 1 < height) sum += entries[index + width]
    mass += sum / 8
    return sum / 8
  })
  return { raster, ink, mass }
}

function offsets(template: Pattern, scale: number, angle: number) {
  const { width, height, light } = template.raster
  const radians = angle * Math.PI / 180
  const cos = Math.cos(radians) * scale; const sin = Math.sin(radians) * scale
  const step = Math.max(2, Math.round(Math.max(width, height) / 13))
  const points: Sample[] = []
  const margin = Math.max(step, Math.round(Math.min(width, height) * .20))
  for (let y = Math.floor(step / 2) - margin; y < height + margin; y += step) {
    for (let x = Math.floor(step / 2) - margin; x < width + margin; x += step) {
      const dx = x - width / 2; const dy = y - height / 2
      const index = y * width + x
      const inside = x >= 0 && x < width && y >= 0 && y < height
      points.push({ x: Math.round(dx * cos - dy * sin), y: Math.round(dx * sin + dy * cos),
        ink: inside ? template.ink[index] : 0, light: inside ? light[index] : 0 })
    }
  }
  return points
}

function fitScore(target: Pattern, points: Sample[], x: number, y: number, energy: number) {
  const { width, height, light } = target.raster
  let overlap = 0; let targetEnergy = 0; let toneLoss = 0
  for (const p of points) {
    const xx = x + p.x; const yy = y + p.y
    if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue
    const index = yy * width + xx
    const value = target.ink[index]
    const common = value * p.ink
    overlap += common
    targetEnergy += value * value
    toneLoss += common * Math.abs(light[index] - p.light)
  }
  if (overlap <= 0) return 0
  // Overlap checks the silhouette and distribution of colored marks; tone checks the pattern within it.
  return (2 * overlap / (energy + targetEnergy)) * (1 - toneLoss / overlap)
}

function strongestMatch(template: Pattern, target: Pattern) {
  let best: Pose = { score: 0, x: 0, y: 0, scale: 1, angle: 0 }
  if (target.mass < template.mass * .21) return best
  const { width, height } = target.raster
  function scan(scale: number, angle: number, area: [number, number, number, number], step: number) {
    const points = offsets(template, scale, angle)
    const energy = points.reduce((sum, point) => sum + point.ink * point.ink, 0)
    if (energy < 4) return
    // Prefer similar orientation when a tilted fragment of a different motif also overlaps.
    const orientationWeight = 1 - Math.abs(angle) / 180
    const [left, top, right, bottom] = area
    for (let y = top; y < bottom; y += step) {
      for (let x = left; x < right; x += step) {
        if (target.ink[y * width + x] < .12) continue
        const score = fitScore(target, points, x, y, energy) * orientationWeight
        if (score > best.score) best = { score, x, y, scale, angle }
      }
    }
  }
  for (const scale of scales) for (const angle of angles) scan(scale, angle, [0, 0, width, height], 2)
  if (!best.score) return best
  const { x, y, scale, angle } = best
  const area: [number, number, number, number] = [Math.max(0, x - 3), Math.max(0, y - 3), Math.min(width, x + 4), Math.min(height, y + 4)]
  for (const size of [Math.max(.60, scale - .05), scale, scale + .05]) {
    for (const rotation of [angle - 4, angle, angle + 4]) scan(size, rotation, area, 1)
  }
  return best
}

export function rankDuplicateFrames(image: ImageData, region: ArchiveRegion, frames: ArchiveRegion[]) {
  if (!frames.length) return []
  const longest = Math.max(...frames.map(({ bounds }) => Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top)))
  const ratio = Math.min(.6, 130 / longest)
  const raster = rasterize(image, region.bounds, ratio)
  const hue = palette(raster)
  if (hue === undefined) return []
  const reference = pattern(raster, hue)
  return frames.map(frame => {
    const target = pattern(rasterize(image, frame.bounds, ratio), hue)
    return { code: frame.id, ...strongestMatch(reference, target) }
  }).sort((a, b) => b.score - a.score)
}

export function suggestDuplicateFrame(image: ImageData, region: ArchiveRegion, frames: ArchiveRegion[]) {
  const [best, second] = rankDuplicateFrames(image, region, frames)
  return best && best.score >= .70 && best.score - (second?.score ?? 0) >= .08 ? best.code : undefined
}
