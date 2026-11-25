import { createRequire } from 'node:module'
import { writeFile, access, unlink } from 'node:fs/promises'
import { renderSubjectCanvas } from '../shared/cutout-render.mjs'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')

/** Pixel coordinates always refer to the full-resolution source, not a preview. */
export async function editMask(sourceFile, cutoutFile, operations, output) {
  if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw new Error('Expected 1..1000 mask operations')
  const source = await sharp(sourceFile, { limitInputPixels: 32000000 }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const cutout = await sharp(cutoutFile, { limitInputPixels: 32000000 }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = source.info
  if (width !== cutout.info.width || height !== cutout.info.height) throw new Error('Source and cutout dimensions must match')
  if (width * height > 32000000) throw new Error('Mask editing is limited to 32 million pixels')
  const result = Buffer.from(source.data)
  for (let i = 3; i < result.length; i += 4) result[i] = cutout.data[i]
  const paint = (x, y, op) => {
    const index = (y * width + x) * 4 + 3
    result[index] = op.mode === 'erase' ? 0 : source.data[index]
  }
  for (const op of operations) {
    if (!op || !['erase', 'restore'].includes(op.mode)) throw new Error('Mask mode must be erase or restore')
    if (op.shape === 'rect') {
      if (![op.x, op.y, op.width, op.height].every(Number.isFinite) || op.width <= 0 || op.height <= 0) throw new Error('Invalid mask rectangle')
      for (let y = Math.max(0, Math.floor(op.y)); y < Math.min(height, Math.ceil(op.y + op.height)); y++)
        for (let x = Math.max(0, Math.floor(op.x)); x < Math.min(width, Math.ceil(op.x + op.width)); x++) paint(x, y, op)
    } else if (op.shape === 'brush') {
      if (!Number.isFinite(op.radius) || op.radius <= 0 || op.radius > 1000 || !Array.isArray(op.points) || !op.points.length || op.points.length > 10000 || op.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0 || p[0] >= width || p[1] < 0 || p[1] >= height)) throw new Error('Invalid brush stroke')
      function stamp(cx, cy) {
        for (let y = Math.max(0, Math.floor(cy - op.radius)); y <= Math.min(height - 1, Math.ceil(cy + op.radius)); y++)
          for (let x = Math.max(0, Math.floor(cx - op.radius)); x <= Math.min(width - 1, Math.ceil(cx + op.radius)); x++)
            if ((x - cx) ** 2 + (y - cy) ** 2 <= op.radius ** 2) paint(x, y, op)
      }
      stamp(...op.points[0])
      for (let i = 1; i < op.points.length; i++) {
        const [a, b] = [op.points[i - 1], op.points[i]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.5, op.radius / 2)))
        for (let step = 1; step <= steps; step++) stamp(a[0] + (b[0] - a[0]) * step / steps, a[1] + (b[1] - a[1]) * step / steps)
      }
    } else if (op.shape === 'polygon') {
      // [TINIX] Antialias a closed outline before applying its coverage to the alpha.
      if (!Array.isArray(op.points) || op.points.length < 3 || op.points.length > 512 ||
          op.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) ||
            p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height)) throw new Error('Invalid mask polygon')
      const left = Math.floor(Math.min(...op.points.map(([x]) => x)))
      const top = Math.floor(Math.min(...op.points.map(([, y]) => y)))
      const boxWidth = Math.ceil(Math.max(...op.points.map(([x]) => x))) - left
      const boxHeight = Math.ceil(Math.max(...op.points.map(([, y]) => y))) - top
      if (!boxWidth || !boxHeight) throw new Error('Invalid mask polygon')
      const points = op.points.map(([x, y]) => `${x - left},${y - top}`).join(' ')
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${boxHeight}"><polygon points="${points}" fill="white"/></svg>`)
      const coverage = await sharp(svg, { limitInputPixels: 32000000 }).extractChannel('alpha').raw().toBuffer()
      for (let y = 0; y < boxHeight; y++) {
        for (let x = 0; x < boxWidth; x++) {
          const fraction = coverage[y * boxWidth + x] / 255
          const index = ((top + y) * width + left + x) * 4 + 3
          const alpha = result[index]
          result[index] = Math.round(op.mode === 'erase'
            ? alpha * (1 - fraction) : Math.max(alpha, source.data[index] * fraction))
        }
      }
    } else throw new Error('Mask shape must be rect, brush or polygon') // [TINIX]
  }
  let visible = 0
  for (let i = 3; i < result.length; i += 4) if (result[i]) visible++
  if (!visible) throw new Error('Mask is empty; output was not saved')
  const bytes = await sharp(result, { raw: { width, height, channels: 4 } }).png().toBuffer()
  await writeFile(output, bytes, { flag: 'wx' })
  return { width, height, visiblePixels: visible, operations: operations.length }
}

/** CLI uses the exact Canvas renderer imported by the editor. */
export async function renderCutout(input, options) {
  if (!Number.isFinite(options.mm) || options.mm < 0 || options.mm > 5 || !Number.isFinite(options.dpi) || options.dpi < 36 || options.dpi > 1200 || (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0))) throw new Error('Viền phải từ 0 đến 5 mm, DPI 36..1200 và tỉ lệ phải dương')
  const meta = await sharp(input, { limitInputPixels: 32000000 }).metadata()
  if (meta.width > 12000 || meta.height > 12000) throw new Error('Ảnh vượt giới hạn 12000 px mỗi cạnh')
  const png = await sharp(input, { limitInputPixels: 32000000 }).rotate().png().toBuffer()
  const puppeteer = createRequire(import.meta.url)('../service/node_modules/puppeteer')
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.evaluate('window.renderSubjectCanvas = ' + renderSubjectCanvas.toString())
    return await page.evaluate(async ({ data, options }) => {
      const image = new Image(); image.src = data; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0)
      const result = window.renderSubjectCanvas(canvas, options.mm, options.scale, options.dpi, options.box)
      return { image: result.image.toDataURL('image/png'), border: result.rim.toDataURL('image/png'), scale: result.scale, frame: result.frame, sourceWidth: image.width, sourceHeight: image.height, geometry: 'editor-concentric-stamps-v1' }
    }, { data: 'data:image/png;base64,' + png.toString('base64'), options })
  } finally { await browser.close() }
}
export async function borderMask(input, output, options) {
  const result = await renderCutout(input, options)
  if (options.imageOutput) {
    if (options.imageOutput === output) throw new Error('Image and border outputs must differ')
    for (const file of [output, options.imageOutput]) { try { await access(file); throw new Error('Output exists: ' + file) } catch (error) { if (error.code !== 'ENOENT') throw error } }
    await writeFile(options.imageOutput, Buffer.from(result.image.split(',')[1], 'base64'), { flag: 'wx' })
  }
  try {
    await writeFile(output, Buffer.from(result.border.split(',')[1], 'base64'), { flag: 'wx' })
  } catch (error) { if (options.imageOutput) await unlink(options.imageOutput); throw error }
  const { image, border, ...geometry } = result
  return { ...geometry, width: result.frame.width, height: result.frame.height, documentWidth: result.frame.width * result.scale, documentHeight: result.frame.height * result.scale, placement: 'Use the companion image with the same frame. To preserve source origin (x,y), place this frame at (x+frame.left*scale,y+frame.top*scale).' }
}

export async function placeCutout(layout, id, sourceFile, cutoutFile, mm) {
  const next = structuredClone(layout), layer = next.layers.find(w => String(w.uuid) === String(id))
  if (!layer || layer.type !== 'w-image' || layer.linkedPhotoId) throw new Error('Target must be an independent image layer')
  if (layer.templateAnchor && !['bottom', 'center'].includes(layer.templateAnchor)) throw new Error('Unsupported subject anchor')
  const source = await sharp(sourceFile, { limitInputPixels: 32000000 }).rotate().png().toBuffer()
  const metadata = await sharp(source).metadata(), raw = await sharp(cutoutFile, { limitInputPixels: 32000000 }).rotate().png().toBuffer(), cutMeta = await sharp(raw).metadata()
  if (metadata.width !== cutMeta.width || metadata.height !== cutMeta.height) throw new Error('Source and cutout dimensions must match')
  const rendered = await renderCutout(raw, { mm, dpi: next.global.dpi || 300, box: { width: layer.width, height: layer.height } })
  const width = rendered.frame.width * rendered.scale, height = rendered.frame.height * rendered.scale
  layer.left += (layer.width - width) / 2
  layer.top += (layer.height - height) * (layer.templateAnchor === 'center' ? 0.5 : 1)
  Object.assign(layer, { width, height, imgUrl: rendered.image, cutoutBorderUrl: rendered.border, cutoutEdit: { sourceUrl: 'data:image/png;base64,' + source.toString('base64'), cutoutUrl: 'data:image/png;base64,' + raw.toString('base64'), mm, frame: rendered.frame }, slot: true, templateRole: 'subject', printRole: 'raised', zoom: 1, transform: '', fit: undefined, cropX: undefined, cropY: undefined })
  delete layer.origin
  for (const linked of next.layers.filter(w => String(w.linkedPhotoId) === String(layer.uuid))) { linked.imgUrl = layer.imgUrl; delete linked.origin; linked.slot = false }
  return { layout: next, geometry: { scale: rendered.scale, frame: rendered.frame, width, height, left: layer.left, top: layer.top } }
}
