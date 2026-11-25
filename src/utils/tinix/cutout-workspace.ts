// [TINIX] Full-resolution canvas operations for the cutout workspace.
export type Point = { x: number; y: number }
export type CurveNode = Point & { handle?: Point }
export type CurveMode = 'restore' | 'erase' | 'clone'
export type CurveEdit = { mode: CurveMode; nodes: CurveNode[]; donor?: Point; target?: Point }
export type CutoutRepair = {
  base: string
  source?: string
  edits: CurveEdit[]
  resultHash: string
  privateAsset?: boolean
}

export async function cutoutHash(url: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function readCutoutFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function readCutoutImage(url: string) {
  const image = new Image()
  if (/^https?:/i.test(url) && new URL(url).origin !== location.origin) image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  return image
}

export function cutoutCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas unavailable')
  return { canvas, context }
}

export function curvePath(nodes: CurveNode[], closed: boolean) {
  if (!nodes.length) return ''
  let path = `M ${nodes[0].x} ${nodes[0].y}`
  for (let i = 1; i < nodes.length + Number(closed); i++) {
    const a = nodes[i - 1]; const b = nodes[i % nodes.length]
    path += ` C ${a.x + (a.handle?.x ?? 0)} ${a.y + (a.handle?.y ?? 0)} ${b.x - (b.handle?.x ?? 0)} ${b.y - (b.handle?.y ?? 0)} ${b.x} ${b.y}`
  }
  return path + (closed ? ' Z' : '')
}

export function applyCurve(context: CanvasRenderingContext2D, raw: CanvasImageSource, nodes: CurveNode[], mode: CurveMode, offset?: Point) {
  const path = new Path2D(curvePath(nodes, true))
  const { width, height } = context.canvas
  if (mode === 'clone') {
    if (!offset) return
    // Snapshot the donor before painting so overlapping samples never feed back.
    const donor = cutoutCanvas(width, height)
    donor.context.drawImage(context.canvas, 0, 0)
    context.save()
    context.clip(path)
    context.drawImage(donor.canvas, offset.x, offset.y)
    context.restore()
    return
  }
  context.save()
  context.clip(path)
  context.clearRect(0, 0, width, height)
  if (mode === 'restore') context.drawImage(raw, 0, 0, width, height)
  context.restore()
}

export function inspectAlpha(image: ImageData) {
  const { width, height, data } = image
  const pixels = width * height
  const visited = new Uint8Array(pixels)
  let nearEdge = false; let visible = 0; let transparent = false
  for (let i = 0; i < pixels; i++) {
    const alpha = data[i * 4 + 3]
    if (alpha < 255) transparent = true
    if (alpha <= 8) continue
    visible++
    const x = i % width; const y = Math.floor(i / width)
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) nearEdge = true
    if (alpha > 128) visited[i] = 1
  }
  const small = Math.max(4, Math.min(40, Math.floor(visible * 0.002)))
  const queue = new Int32Array(pixels)
  let specks = 0; let components = 0
  for (let i = 0; i < pixels; i++) {
    if (!visited[i]) continue
    components++
    visited[i] = 0
    queue[0] = i
    let end = 1
    for (let j = 0; j < end; j++) {
      const p = queue[j]; const x = p % width; const y = Math.floor(p / width)
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const q = p + dy * width + dx
          if (x + dx < 0 || x + dx >= width || !visited[q]) continue
          visited[q] = 0
          queue[end++] = q
        }
      }
    }
    if (end <= small) specks++
  }
  return { transparent, nearEdge: transparent && nearEdge, empty: !visible, specks: components > 1 ? specks : 0 }
}
