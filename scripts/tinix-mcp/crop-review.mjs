// [TINIX] Review a rendered draft and apply server-generated crops to a new copy.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJson } from '../tinix-drafts.mjs'
import { cropPreviewLayout } from './crop-preview.mjs' // [TINIX]
import { materialRenderService as cropService, renderMaterialLayout as render } from './draft-render.mjs' // [TINIX]

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const { detectFaces } = require('../lib/photo-faces.cjs')
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const codes = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06']
const idField = { type: 'string', pattern: uuid.source }
export const cropTools = [
  {
    name: 'review_material_photo_crops',
    title: 'Kiểm crop sáu khung ảnh',
    description: 'Review the six photos on a rendered TinixPoster draft. Returns per-frame suggestions, exposed percentages, a page preview and a reviewId. Use safe_area_frame_codes to include original-photo overlays for specific frames. Ask which suggested frame codes to apply.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['job_id'], properties: { job_id: idField,
      safe_area_frame_codes: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: { type: 'string', enum: codes } } } },
  },
  {
    name: 'apply_material_photo_crops',
    title: 'Áp dụng crop đã chọn vào bản sao',
    description: 'Apply only explicitly selected safe frame codes from a crop review. Use the same jobId and the reviewId returned by review_material_photo_crops. Returns a new rendered draft. SUBJECT stays independent.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['job_id', 'review_id', 'frame_codes'],
      properties: { job_id: idField, review_id: idField,
        frame_codes: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: { type: 'string', enum: codes } } } },
  },
]

let bundle
async function bundleReview() {
  const { build } = await import('vite')
  const result = await build({
    root, configFile: false, publicDir: false, logLevel: 'silent',
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, lib: { entry: path.join(root, 'src/utils/tinix/material-crop-review.ts'), name: 'TinixCropReview', formats: ['iife'] } },
  })
  const chunk = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry)
  if (!chunk) throw new Error('Chưa nạp được công cụ kiểm crop.')
  return chunk.code
}

async function inspect(layout, slots, verifyOnly, signal, previewCodes = []) {
  const service = cropService()
  bundle ??= bundleReview().catch(error => { bundle = undefined; throw error })
  const script = await bundle
  signal.throwIfAborted()
  const browser = await require('../../service/node_modules/puppeteer').launch({ headless: true, protocolTimeout: 450000 })
  const close = () => { void browser.close().catch(() => undefined) }
  signal.addEventListener('abort', close, { once: true })
  try {
    signal.throwIfAborted()
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', async request => {
      const url = new URL(request.url())
      if (url.href === service + '/mcp-crop-worker') return request.respond({ contentType: 'text/html', body: '<!doctype html><title>Tinix crop review</title>' })
      if (url.origin === service && request.method() === 'POST' && url.pathname === '/api/tinix/photo-faces') {
        try {
          const { image } = JSON.parse(await request.fetchPostData())
          const { status, faces } = await detectFaces(image)
          return await request.respond({ status, contentType: 'application/json', body: JSON.stringify({ faces }) })
        } catch {
          if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => undefined)
          return
        }
      }
      if (url.origin === service && ((request.method() === 'GET' && url.pathname.startsWith('/static/')) ||
          (request.method() === 'POST' && url.pathname === '/api/tinix/export-render'))) return request.continue()
      return request.abort()
    })
    await page.goto(service + '/mcp-crop-worker', { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({ content: script })
    return await page.evaluate((draft, frames, only, previews) =>
      globalThis.TinixCropReview.inspectMaterialCrops(draft, frames, only, previews), layout, slots, verifyOnly, previewCodes)
  } finally {
    signal.removeEventListener('abort', close)
    await browser.close().catch(() => undefined)
  }
}

function applyRows(layout, slots, selected) {
  for (const row of selected) {
    const frame = layout.layers.find(layer => layer.uuid === slots.find(slot => slot.code === row.code).id)
    Object.assign(frame, row.crop, { transform: `scale(${row.crop.zoom})` })
  }
}

export async function runCropTool(root, name, args, signal, copy = {}) { // [TINIX] Workflow can stage the reserved output.
  const { job_id: sourceJobId, review_id: reviewId, frame_codes: selection } = args ?? {}
  const reviewing = name === cropTools[0].name
  if (typeof sourceJobId !== 'string' || sourceJobId.length !== 36 || !uuid.test(sourceJobId) ||
      (!reviewing && (typeof reviewId !== 'string' || reviewId.length !== 36 || !uuid.test(reviewId)))) {
    throw new Error('Mã bản nháp hoặc mã lượt kiểm không hợp lệ.')
  }
  const job = path.join(root, sourceJobId)
  const source = path.join(job, 'result')
  const [reportText, sourceDraft] = await Promise.all(['report.json', 'draft.json'].map(file =>
    readFile(path.join(source, file), 'utf8').catch(() => { throw new Error('Không tìm thấy bản nháp TinixPoster.') })))
  const report = JSON.parse(reportText)
  const layout = JSON.parse(sourceDraft)
  const slots = report.photoSlots
  if (report.status !== 'rendered' || !report.sourceJobId || !Array.isArray(slots) || slots.length !== 6 ||
      new Set(slots.map(slot => slot.id)).size !== 6 || !codes.every(code => slots.some(slot => slot.code === code &&
        layout.layers.some(layer => layer.uuid === slot.id && layer.slot && layer.templateRole === 'photo')))) {
    throw new Error('Cần bản nháp đã thay đủ sáu ảnh và có mã F01–F06.')
  }
  const digest = createHash('sha256').update(sourceDraft).digest('hex')
  if (reviewing) {
    const previewCodes = args.safe_area_frame_codes ?? []
    if (!Array.isArray(previewCodes) || previewCodes.some(code => !codes.includes(code)) ||
        new Set(previewCodes).size !== previewCodes.length) throw new Error('Mã khung xem vùng an toàn phải khác nhau và nằm trong F01–F06.')
    const { rows, safeAreas } = await inspect(layout, slots, false, signal, previewCodes)
    if (rows.every(row => row.status === 'unavailable')) throw new Error('Chưa kiểm được ảnh. Kiểm tra dịch vụ dò mặt và trình render TinixPoster.')
    const candidates = rows.filter(row => row.status === 'safe')
    let image
    if (candidates.length) applyRows(layout, slots, candidates)
    // [TINIX] The review image is disposable. The checks above and the applied draft use original photos.
    if (candidates.length || safeAreas.length) image = await render(await cropPreviewLayout(layout, slots, signal), signal, true)
    const id = randomUUID()
    const folder = path.join(job, 'crop-reviews')
    await mkdir(folder, { recursive: true })
    await createJson(path.join(folder, id + '.json'), { digest, rows })
    return { report: { jobId: sourceJobId, reviewId: id, rows,
      ...(previewCodes.length && { safeAreaFrames: safeAreas.map(area => area.code), unavailableSafeAreaFrames:
        previewCodes.filter(code => !safeAreas.some(area => area.code === code)) }) }, image, safeAreas }
  }
  if (!Array.isArray(selection) || !selection.length || selection.some(code => !codes.includes(code)) ||
      new Set(selection).size !== selection.length) throw new Error('Hãy chọn các mã khung khác nhau từ F01 đến F06.')
  const review = JSON.parse(await readFile(path.join(job, 'crop-reviews', reviewId + '.json'), 'utf8')
    .catch(() => { throw new Error('Không tìm thấy lượt kiểm của bản nháp này.') }))
  if (review.digest !== digest) throw new Error('Bản nháp đã đổi. Hãy kiểm crop lại.')
  const selected = review.rows.filter(row => row.status === 'safe' && selection.includes(row.code))
  if (selected.length !== selection.length) throw new Error('Chỉ áp dụng được các khung có gợi ý đã kiểm.')
  applyRows(layout, slots, selected)
  if (selected.length !== review.rows.filter(row => row.status === 'safe').length) {
    const { rows: verified } = await inspect(layout, slots.filter(slot => selection.includes(slot.code)), true, signal)
    if (verified.some(row => row.status !== 'clear')) throw new Error('Một khung không đạt khi áp dụng riêng. Hãy kiểm lại hoặc chọn các khung phụ thuộc cùng lượt.')
  }
  const image = await render(layout, signal)
  const jobId = copy.id ?? randomUUID() // [TINIX]
  const output = copy.output ?? path.join(root, jobId, 'result') // [TINIX]
  const result = { status: 'rendered', sourceJobId, jobId, reviewId, applied: selection, photos: 6,
    subject: report.subject, borderMm: report.borderMm, photoSlots: slots,
    ...(report.subjectCutout && { subjectCutout: report.subjectCutout }) } // [TINIX]
  await mkdir(output, { recursive: true })
  await createJson(path.join(output, 'draft.json'), layout)
  await writeFile(path.join(output, 'render.png'), image, { flag: 'wx' })
  await createJson(path.join(output, 'report.json'), result)
  return { report: result, image }
}
