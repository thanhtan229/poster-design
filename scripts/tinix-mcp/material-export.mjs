// [TINIX] Re-export a filled draft into the five-file material-archive format.
// The output is a QA candidate, not a claim of pixel-perfect reconstruction.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { readMaterialJob } from './subject-edit.mjs'

const require = createRequire(import.meta.url)
const sharp = require('../../service/node_modules/sharp')
const run = promisify(execFile)
const UUID = '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'

export const materialExportTool = {
  name: 'export_material_draft',
  title: 'Xuất bộ TinixPoster v1 từ bản nháp đã thay ảnh',
  description: 'Export exactly four PNG files and layout.json using a verified source material ZIP and a stored filled render. Returns a QA candidate ZIP and checksums, not a production pass until source-to-layout reconstruction and GUI import are separately verified. Legacy jobs may need source_material.',
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: { 'openai/fileParams': ['source_material'] },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['job_id'],
    properties: {
      job_id: { type: 'string', pattern: UUID },
      source_material: { type: 'object', additionalProperties: false, required: ['file_id','download_url'],
        properties: { file_id: { type: 'string' }, download_url: { type: 'string' },
          file_name: { type: 'string' }, mime_type: { type: 'string' } } },
    },
  },
}

export async function runMaterialExport(root, jobId, source, signal) {
  const entry = await readMaterialJob(root, jobId)
  if (!entry.subject?.cutoutEdit) throw new Error('SUBJECT_CUTOUT_NOT_EDITABLE')
  if (entry.report.photoSlots?.length !== 6) throw new Error('SIX_PHOTO_SLOTS_REQUIRED')
  const { width, height } = await sharp(entry.png).metadata()
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('INVALID_RENDER')
  const folder = path.join(root, jobId, 'material-export')
  await mkdir(folder, { recursive: true })
  const kit = path.join(folder, 'material.zip')
  const qa = path.join(folder, 'qa.json')
  // A source ZIP is essential. Never fabricate a four-PNG package from a flat screenshot.
  const { prepareMaterialDraft } = await import('../lib/material-archive-cli.mjs')
  const checked = await prepareMaterialDraft(source)
  if (!checked.draft || checked.report?.status !== 'ready') throw new Error('SOURCE_MATERIAL_IMPORT_QA_FAILED')
  signal?.throwIfAborted()
  const python = process.env.TINIX_STUDIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  try {
    await run(python, [path.join(import.meta.dirname, 'export_filled_material.py'),
      '--source', source, '--render', path.join(root, jobId, 'result', 'render.png'),
      '--output', kit, '--report', qa], { timeout: 180000, windowsHide: true, signal })
  } catch (error) {
    let reason = 'EXPORT_FAILED'
    try { reason = JSON.parse(error.stdout || '{}').reason || reason } catch {}
    throw new Error(reason)
  }
  signal?.throwIfAborted()
  // Verify actual compatibility with the existing TinixPoster archive importer.
  const reimport = await prepareMaterialDraft(kit)
  if (!reimport.draft || reimport.report?.status !== 'ready') throw new Error('EXPORTED_KIT_FAILED_REIMPORT')
  // Fail closed if fixed backgrounds, frame borders and decoration placement no
  // longer match the actual filled render. Mask only customer photo windows
  // and the SUBJECT box; produce evidence outside the ZIP.
  const staticQaDir = path.join(folder, 'static-qa')
  await mkdir(staticQaDir, { recursive: true })
  const staticQaFile = path.join(staticQaDir, 'reconstruction_qa.json')
  try {
    await run(python, [path.join(import.meta.dirname, 'qa_reconstruction.py'),
      '--kit', kit, '--qa-out', staticQaDir], { timeout: 180000, windowsHide: true, signal })
  } catch (error) {
    let detail = error.message
    try {
      const result = JSON.parse(await readFile(staticQaFile, 'utf8'))
      detail = 'MAE=' + result.staticMae255 + ' bad=' + result.badFractionAbove30
    } catch {}
    throw new Error('STATIC_RECONSTRUCTION_QA_FAILED: ' + String(detail).slice(0, 350))
  }
  const staticQa = JSON.parse(await readFile(staticQaFile, 'utf8'))
  if (staticQa.status !== 'pass') throw new Error('STATIC_RECONSTRUCTION_QA_FAILED')
  const [bytes, rawReport] = await Promise.all([readFile(kit), readFile(qa, 'utf8')])
  const report = JSON.parse(rawReport)
  report.jobId = jobId
  report.qa.importer = 'passed'
  report.qa.sourceReconstruction = 'static_regions_passed'
  report.qa.staticReconstruction = staticQa
  report.qa.guiImport = 'not_verified'
  report.qaStatus = 'requires_subject_crop_and_gui_validation'
  report.sha256 = createHash('sha256').update(bytes).digest('hex')
  return { structuredContent: report, content: [
    { type: 'text', text: JSON.stringify(report, null, 2) },
    { type: 'resource', resource: {
      uri: 'tinixposter://draft/' + jobId + '/material-export',
      mimeType: 'application/zip', blob: bytes.toString('base64'),
    } },
  ] }
}
