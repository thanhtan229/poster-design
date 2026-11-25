// [TINIX] Read the stored render and edit a copy of the independent SUBJECT layer.
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createJson, validate } from '../tinix-drafts.mjs'
import { editMask, placeCutout } from '../tinix-mask.mjs'
import { renderMaterialLayout } from './draft-render.mjs'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const idField = { type: 'string', pattern: '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$' }
const pointField = { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', minimum: 0 } }
const operationsField = { type: 'array', minItems: 1, maxItems: 24, items: {
  type: 'object', additionalProperties: false, required: ['mode', 'points'],
  properties: { mode: { type: 'string', enum: ['restore', 'erase'] },
    points: { type: 'array', minItems: 3, maxItems: 128, items: pointField } },
} }

export const subjectEditTools = [
  {
    name: 'get_material_draft_render',
    title: 'Xem ảnh render đã lưu của bản nháp',
    description: 'Return the actual stored render for this job, without rerendering or simulating crop suggestions. May downscale for display. Set include_subject_source to see the original and current transparent cutout for mask editing; the response gives their source pixel dimensions.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['job_id'],
      properties: { job_id: idField, include_subject_source: { type: 'boolean' } } },
  },
  {
    name: 'edit_material_subject_mask',
    title: 'Sửa mặt nạ SUBJECT trên bản sao',
    description: 'After user approval, restore or erase closed polygon regions on the independent SUBJECT and render a new draft copy. Use polygon coordinates [x,y] in pixels of the full-size original SUBJECT, starting at the top-left. Use get_material_draft_render with include_subject_source to see the photo and dimensions; scale any preview coordinates to original pixels. Restores original photo pixels. Returns the before and after renders and leaves the source job and frame crops intact.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['job_id', 'operations'],
      properties: { job_id: idField, operations: operationsField } },
  },
]

function asPng(source) {
  const header = 'data:image/png;base64,'
  if (!source?.startsWith(header)) throw new Error('Bản nháp cần có ảnh PNG nguồn và mặt nạ SUBJECT đã lưu.')
  return Buffer.from(source.slice(header.length), 'base64')
}

export async function readMaterialJob(root, jobId) { // [TINIX] Shared by the stored-render comparison tool.
  if (typeof jobId !== 'string' || jobId.length !== 36 || !new RegExp(idField.pattern).test(jobId)) throw new Error('Mã bản nháp không hợp lệ.')
  const folder = path.join(root, jobId, 'result')
  const [reportText, layoutText, png] = await Promise.all(['report.json', 'draft.json', 'render.png'].map(name =>
    readFile(path.join(folder, name)).catch(() => { throw new Error('Không tìm thấy ảnh render đã lưu của bản nháp.') })))
  const report = JSON.parse(reportText)
  if (report.status !== 'rendered' || (report.jobId && report.jobId !== jobId)) throw new Error('Bản nháp chưa render thành công.')
  const layout = JSON.parse(layoutText)
  const subjects = layout.layers.filter(layer => layer.type === 'w-image' && layer.slot &&
    layer.templateRole === 'subject' && !layer.linkedPhotoId)
  return { report, layout, png, subject: subjects.length === 1 ? subjects[0] : undefined }
}

async function imageBlocks(image, label, maxEdge) {
  const parsed = sharp(image)
  const { width, height } = await parsed.metadata()
  const downscaled = Math.max(width, height) > maxEdge
  const bytes = downscaled
    ? await parsed.resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() : image
  const info = downscaled ? await sharp(bytes).metadata() : { width, height }
  return { dimensions: { width, height, previewWidth: info.width, previewHeight: info.height },
    blocks: [{ type: 'text', text: label }, { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] }
}

function toolResult(report, images) {
  return { structuredContent: report, content: [{ type: 'text', text: JSON.stringify(report) }, ...images.flatMap(item => item.blocks)] }
}

function maskOperations(operations, width, height) {
  if (!Array.isArray(operations) || !operations.length || operations.length > operationsField.maxItems) {
    throw new Error('Cần từ 1 đến 24 vùng khôi phục hoặc xóa.')
  }
  let area = 0
  return operations.map(operation => {
    const { mode, points } = operation ?? {}
    if (!['restore', 'erase'].includes(mode) || !Array.isArray(points) || points.length < 3 || points.length > 128 ||
        points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) ||
          p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height)) {
      throw new Error('Đường khoanh không hợp lệ. Dùng 3–128 điểm theo pixel ảnh SUBJECT gốc.')
    }
    const x = points.map(point => point[0]), y = points.map(point => point[1])
    area += (Math.ceil(Math.max(...x)) - Math.floor(Math.min(...x))) * (Math.ceil(Math.max(...y)) - Math.floor(Math.min(...y)))
    if (area > Math.max(width * height, 16000000)) throw new Error('Tổng diện tích vùng khoanh quá lớn. Hãy khoanh sát vùng cần sửa.')
    return { mode, points, shape: 'polygon' }
  })
}

async function editSubjectCopy(root, jobId, entry, operations, signal, copy = {}) { // [TINIX] Workflow can stage the reserved output.
  const { report, layout, png, subject } = entry
  if (!subject?.cutoutEdit) throw new Error('Bản nháp chưa có SUBJECT với ảnh nguồn và mặt nạ có thể sửa.')
  const slots = report.photoSlots
  if (!Array.isArray(slots) || slots.length !== 6 ||
      !['F01', 'F02', 'F03', 'F04', 'F05', 'F06'].every(code => slots.some(slot => slot.code === code &&
        layout.layers.some(layer => layer.slot && layer.templateRole === 'photo' && layer.uuid === slot.id)))) {
    throw new Error('Bản nháp cần đủ sáu khung F01–F06.')
  }
  const sourcePng = asPng(subject.cutoutEdit.sourceUrl)
  const oldMask = asPng(subject.cutoutEdit.cutoutUrl)
  const { width, height } = await sharp(sourcePng).metadata()
  const edits = maskOperations(operations, width, height)
  const temporary = await mkdtemp(path.join(root, 'subject-edit-'))
  const [sourceFile, maskFile, editedFile] = ['source.png', 'mask.png', 'edited.png'].map(name => path.resolve(temporary, name))
  try {
    await writeFile(sourceFile, sourcePng)
    await writeFile(maskFile, oldMask)
    await editMask(sourceFile, maskFile, edits, editedFile)
    const alpha = image => sharp(image).extractChannel('alpha').raw().toBuffer()
    const [oldAlpha, editedAlpha] = await Promise.all([alpha(oldMask), alpha(editedFile)])
    if (oldAlpha.equals(editedAlpha)) throw new Error('Vùng khoanh chưa làm thay đổi mặt nạ SUBJECT.')
    signal.throwIfAborted()
    const { layout: revised } = await placeCutout(layout, subject.uuid, sourceFile, editedFile, subject.cutoutEdit.mm)
    if (validate(revised).some(issue => issue.severity === 'error')) throw new Error('Bản nháp có lỗi sau khi sửa mặt nạ SUBJECT.')
    const result = await renderMaterialLayout(revised, signal)
    const images = await Promise.all([imageBlocks(png, 'Trước · render đã lưu', 960), imageBlocks(result, 'Sau · render bản sao đã sửa SUBJECT', 960)])
    signal.throwIfAborted()
    const copyId = copy.id ?? randomUUID()
    const output = copy.output ?? path.join(root, copyId, 'result')
    const newReport = { ...report, jobId: copyId, sourceJobId: jobId, cropsUnchanged: true,
      subjectEdit: { operations: edits.length, sourceWidth: width, sourceHeight: height } }
    await mkdir(output, { recursive: true })
    await createJson(path.join(output, 'draft.json'), revised)
    await writeFile(path.join(output, 'render.png'), result, { flag: 'wx' })
    await createJson(path.join(output, 'report.json'), newReport)
    return toolResult(newReport, images)
  } finally {
    await Promise.all([sourceFile, maskFile, editedFile].map(file => rm(file, { force: true })))
    await rmdir(temporary)
  }
}

export async function runSubjectEditTool(root, name, args, signal, copy) { // [TINIX]
  const { job_id: jobId, include_subject_source: includeSource, operations } = args ?? {}
  const entry = await readMaterialJob(root, jobId)
  if (name === subjectEditTools[1].name) return editSubjectCopy(root, jobId, entry, operations, signal, copy)
  const { report, png, subject } = entry
  const render = await imageBlocks(png, 'Ảnh render đã lưu · crop thực tế của bản nháp', 960)
  const images = [render]
  const details = { jobId, status: 'rendered', renderKind: 'stored', render: render.dimensions,
    photoSlots: report.photoSlots, subjectIndependent: !!subject, ...(report.applied && { applied: report.applied }) }
  if (includeSource) {
    if (!subject?.cutoutEdit) throw new Error('Bản nháp chưa có SUBJECT với ảnh nguồn và mặt nạ có thể sửa.')
    const [source, cutout] = await Promise.all([
      imageBlocks(asPng(subject.cutoutEdit.sourceUrl), 'SUBJECT · ảnh nguồn dùng để khoanh vùng', 1280),
      imageBlocks(asPng(subject.cutoutEdit.cutoutUrl), 'SUBJECT · mặt nạ hiện tại trên cùng hệ tọa độ', 1280),
    ])
    details.subjectSource = source.dimensions
    images.push(source, cutout)
  }
  return toolResult(details, images)
}
