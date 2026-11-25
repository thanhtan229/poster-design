// [TINIX] Call TinixPoster's local BiRefNet service and return a transparent preview.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const cutoutUrl = 'http://127.0.0.1:7001/api/tinix/cutout/birefnet'
const pixelLimit = 32000000

export async function cutoutSubject(input, signal) {
  const photo = await readFile(input)
  const original = await sharp(photo, { limitInputPixels: pixelLimit }).metadata().catch(() => undefined)
  if (!original || !['jpeg', 'png', 'webp'].includes(original.format) ||
      original.width * original.height > pixelLimit || (original.pages ?? 1) > 1) {
    throw new Error('Chọn một ảnh gốc JPEG, PNG hoặc WebP tối đa 32 triệu pixel.')
  }
  const body = new FormData()
  const type = 'image/' + original.format
  body.append('file', new Blob([photo], { type }), 'subject.' + original.format)
  const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(195000)])
  const response = await fetch(cutoutUrl, { method: 'POST', body, redirect: 'error', signal: timedSignal })
    .catch(() => {
      signal.throwIfAborted()
      throw new Error('Không kết nối được BiRefNet hoặc đã hết thời gian. Kiểm tra TinixPoster ở cổng 7001.')
    })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) {
    await response.body?.cancel()
    if (response.status === 409) throw new Error('BiRefNet đang bận. Hãy thử lại sau.')
    throw new Error('BiRefNet chưa trả PNG. Kiểm tra model, GPU và log TinixPoster.')
  }
  const png = Buffer.from(await response.arrayBuffer())
  const image = sharp(png, { limitInputPixels: pixelLimit })
  const { width, height, format, hasAlpha } = await image.metadata()
  if (format !== 'png' || !hasAlpha) throw new Error('BiRefNet trả ảnh thiếu kênh alpha.')
  const rotated = [5, 6, 7, 8].includes(original.orientation)
  if (width !== (rotated ? original.height : original.width) || height !== (rotated ? original.width : original.height)) {
    throw new Error('Kích thước PNG BiRefNet không khớp ảnh nguồn.')
  }
  signal.throwIfAborted()
  return { png, width, height }
}

export async function previewSubject(input, signal) {
  const { png, width, height } = await cutoutSubject(input, signal)
  const image = sharp(png, { limitInputPixels: pixelLimit })
  const { data, info } = await image.resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
    .png().toBuffer({ resolveWithObject: true })
  signal.throwIfAborted()
  const report = { status: 'preview', engine: 'BiRefNet', width, height,
    previewWidth: info.width, previewHeight: info.height }
  return {
    structuredContent: report,
    content: [{ type: 'text', text: JSON.stringify(report) },
      { type: 'image', mimeType: 'image/png', data: data.toString('base64') }],
  }
}
