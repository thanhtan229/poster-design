// [TINIX] Expose draft and review tools. All rendering is owned by the existing CLI.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises' // [TINIX]
import { createRequire } from 'node:module'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { cropTools, runCropTool } from './crop-review.mjs' // [TINIX]
import { feedbackTools, handleFeedbackTool } from './feedback.mjs'
import { previewSubject } from './subject-preview.mjs' // [TINIX]
import { subjectEditTools, runSubjectEditTool } from './subject-edit.mjs' // [TINIX]
import { compareApprovedDemo } from './approved-demo.mjs' // [TINIX]
import { runScrapbookWorkflow, workflowTools } from './scrapbook-workflow.mjs' // [TINIX]

const root = fileURLToPath(new URL('../../', import.meta.url))
const runFile = promisify(execFile)
const require = createRequire(import.meta.url)
const maxZipBytes = 96 * 1024 ** 2
const maxPhotoBytes = 16 * 1024 ** 2 // [TINIX]
// [TINIX] The ChatGPT web file handoff used this exact Azure storage account for a generated ZIP.
const chatGptBlobHost = 'oaisdmntprindiasocentral.blob.core.windows.net'
const photoCodes = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06']
const attachmentSchema = {
  type: 'object', additionalProperties: false, required: ['file_id', 'download_url'],
  properties: {
    file_id: { type: 'string' }, download_url: { type: 'string' },
    mime_type: { type: 'string' }, file_name: { type: 'string' },
  },
}
const tool = {
  name: 'build_material_draft',
  title: 'Kiểm ZIP và dựng bản nháp TinixPoster',
  description: 'Send the actual TinixPoster material ZIP attached to this chat. Returns diagnostics or a rendered draft with replaceable photo slots. Creates local draft files.',
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  _meta: { 'openai/fileParams': ['file'] },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['file'],
    properties: { file: attachmentSchema },
  },
}
// [TINIX] Explicit attachment fields tie each uploaded photo to its frame code.
const photoTool = {
  name: 'fill_material_draft_photos',
  title: 'Thay sáu ảnh khung và ảnh chủ đạo TinixPoster',
  description: 'Fill a copy of a rendered TinixPoster material draft. Use the jobId from build_material_draft and six attached photos in F01–F06 order. With subject_mode=birefnet, pass the original subject photo to remove its background locally and place the full-resolution cutout. Otherwise pass a transparent subject PNG. For old drafts lacking photoSlots, pass six explicit slot IDs in the same order.', // [TINIX]
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  _meta: { 'openai/fileParams': ['photos', 'subject'] },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['job_id', 'photos', 'subject'],
    properties: {
      job_id: { type: 'string' },
      photos: { type: 'array', minItems: 6, maxItems: 6, items: attachmentSchema },
      subject: attachmentSchema,
      subject_mode: { type: 'string', enum: ['transparent_png', 'birefnet'], default: 'transparent_png' }, // [TINIX]
      photo_slot_ids: { type: 'array', minItems: 6, maxItems: 6, items: { type: 'string' } },
    },
  },
}

// [TINIX] Preview only. Applying a subject still requires the separate photo fill action.
const subjectPreviewTool = {
  name: 'preview_material_subject_cutout',
  title: 'Xem trước tách nền SUBJECT bằng BiRefNet',
  description: 'Use local TinixPoster BiRefNet to remove the background of the original attached photo. Returns a transparent PNG preview. Show it to the user and wait for approval before filling any draft. This tool does not edit drafts.',
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  _meta: { 'openai/fileParams': ['file'] },
  inputSchema: { type: 'object', additionalProperties: false, required: ['file'], properties: { file: attachmentSchema } },
}

// [TINIX] Take the exact user-approved demo separately from the material ZIP.
const demoComparisonTool = {
  name: 'compare_material_draft_to_approved_demo',
  title: 'Đối chiếu bản dựng ZIP với demo đã duyệt',
  description: 'Compare the actual stored placeholder render from build_material_draft with the original approved demo attached to chat (not the ZIP reference image). Exclude visible photo openings and the SUBJECT from scoring. Return ranked layer differences, the page background and an annotated comparison. Run before filling photos.',
  annotations: { readOnlyHint: true, openWorldHint: true },
  _meta: { 'openai/fileParams': ['approved_demo'] },
  inputSchema: { type: 'object', additionalProperties: false, required: ['job_id', 'approved_demo'],
    properties: { job_id: { type: 'string' }, approved_demo: attachmentSchema } },
}

function validateFile(file, additionalHosts, kind = 'zip') {
  if (!file || typeof file.file_id !== 'string' || !file.file_id.trim() || typeof file.download_url !== 'string') {
    throw new Error('FILE_REFERENCE_MISSING: Đính kèm tệp bằng nút + hoặc Add from library. TinixPoster cần đối tượng tệp do ChatGPT chuyển.') // [TINIX]
  }
  const url = URL.parse(file.download_url)
  // [TINIX] Diagnose generated sandbox links without exposing signed URLs or accepting arbitrary hosts.
  if (url?.protocol === 'sandbox:') {
    throw new Error('SANDBOX_FILE_REFERENCE: TinixPoster nhận đường dẫn sandbox. Hãy đính kèm tệp từ Library hoặc Space để ChatGPT chuyển URL tải tệp.') // [TINIX]
  }
  if (url?.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw new Error('INVALID_FILE_URL: ChatGPT cần chuyển URL tải HTTPS hợp lệ cho tệp đính kèm.')
  }
  const host = url.hostname
  if (!(host === 'oaiusercontent.com' || host.endsWith('.oaiusercontent.com') ||
      host === chatGptBlobHost || additionalHosts.has(host))) {
    const hint = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/.test(host) ? ` (${host})` : ''
    throw new Error(`FILE_CDN_NOT_ALLOWED: Máy chủ tải tệp${hint} chưa được xác minh cho TinixPoster.`)
  }
  if (typeof file.file_name !== 'undefined' && typeof file.file_name !== 'string') throw new Error('Tên tệp không hợp lệ.')
  if (kind === 'zip' && file.file_name && !/\.zip$/i.test(file.file_name)) {
    throw new Error('Định dạng tệp cần là ZIP.')
  }
  return url
}

async function downloadAttachment(url, input, fetchFile, signal, maxBytes = maxZipBytes) {
  const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)])
  let response
  try {
    response = await fetchFile(url, { redirect: 'error', signal: timedSignal })
  } catch {
    throw new Error('Không tải được tệp. Hãy chọn lại tệp nếu liên kết đã hết hạn.')
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error('Không tải được tệp. Hãy chọn lại tệp nếu liên kết đã hết hạn.')
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel()
    throw new Error(`Tệp vượt giới hạn ${maxBytes / 1024 ** 2} MiB.`)
  }
  let length = 0
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      length += chunk.length
      if (length > maxBytes) callback(new Error(`Tệp vượt giới hạn ${maxBytes / 1024 ** 2} MiB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(input, { flags: 'wx' }), { signal: timedSignal })
}

async function draftToolResult(report, output) {
  const content = [{ type: 'text', text: JSON.stringify(report, null, 2) }]
  if (report.status === 'rendered') {
    const sharp = require('../../service/node_modules/sharp')
    const preview = await sharp(path.join(output, 'render.png')).resize(960, 960, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    content.push({ type: 'image', mimeType: 'image/png', data: preview.toString('base64') })
  }
  return { content, structuredContent: report }
}

async function fillDraftFromAttachments(args, outputRoot, additionalHosts, fetchFile, signal) {
  const { job_id: sourceId, photos, subject, photo_slot_ids: explicitIds, subject_mode: subjectMode = 'transparent_png' } = args ?? {} // [TINIX]
  if (typeof sourceId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(sourceId)) {
    throw new Error('Cần mã phiên dựng từ build_material_draft.')
  }
  if (!Array.isArray(photos) || photos.length !== 6) throw new Error('Cần đúng sáu ảnh theo thứ tự F01–F06.')
  if (!['transparent_png', 'birefnet'].includes(subjectMode)) throw new Error('Chế độ tách nền SUBJECT không hợp lệ.') // [TINIX]
  const links = [...photos, subject].map(file => validateFile(file, additionalHosts, 'image'))
  const source = path.join(outputRoot, sourceId, 'result')
  let saved
  try {
    saved = JSON.parse(await readFile(path.join(source, 'report.json'), 'utf8'))
  } catch {
    throw new Error('Không tìm thấy báo cáo của phiên dựng TinixPoster.')
  }
  if (saved.status !== 'rendered') throw new Error('Phiên dựng nguồn chưa render thành công.')
  if (saved.sourceJobId) throw new Error('Dùng mã phiên dựng ban đầu từ build_material_draft để giữ nguyên hộp SUBJECT.')
  const slotIds = Array.isArray(saved.photoSlots)
    ? photoCodes.map(code => saved.photoSlots.find(slot => slot.code === code)?.id) : explicitIds
  if (!Array.isArray(slotIds) || slotIds.length !== 6 || slotIds.some(id => typeof id !== 'string' || !id) ||
      new Set(slotIds).size !== 6) throw new Error('Bản nháp cần đủ ID của sáu khung F01–F06. Hãy dựng lại ZIP để nhận mã khung tự động.')
  const jobId = randomUUID()
  const job = path.resolve(outputRoot, jobId) // [TINIX] The layout binder resolves attachments against the result directory.
  const output = path.join(job, 'result')
  const inputs = links.map((_, index) => path.join(job, `photo-${index + 1}`))
  const subjectSource = inputs[6]
  const subjectCutout = subjectMode === 'birefnet' ? path.join(job, 'subject-cutout.png') : subjectSource // [TINIX]
  await mkdir(output, { recursive: true })
  try {
    const transfer = await Promise.allSettled(links.map((url, index) =>
      downloadAttachment(url, inputs[index], fetchFile, signal, maxPhotoBytes))) // [TINIX]
    const failure = transfer.find(item => item.status === 'rejected')
    if (failure) throw failure.reason
    const { fillMaterialDraft } = await import('./fill-draft.mjs')
    const filled = await fillMaterialDraft(source, output, slotIds.map((id, index) =>
      ({ id, file: inputs[index] })), { source: subjectSource, cutout: subjectCutout }, signal) // [TINIX]
    const { idMap, ...summary } = filled
    const report = { ...summary, sourceJobId: sourceId, jobId,
      photoSlots: photoCodes.map((code, index) => ({ code, id: idMap[slotIds[index]] })) }
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
    return await draftToolResult(report, output)
  } finally {
    await Promise.all([...new Set([...inputs, subjectCutout])].map(input => rm(input, { force: true }))) // [TINIX]
  }
}

async function runDraft(input, output, signal) {
  try {
    await runFile(process.execPath, [path.join(root, 'scripts/tinix-cli.mjs'), 'drafts', 'from-material-zip',
      '--input', input, '--directory', output, '--url', 'http://127.0.0.1:7001'],
    { cwd: root, windowsHide: true, timeout: 240000, signal })
  } catch (error) {
    // Exit 1 is expected when the CLI wrote a blocked or render-failed report.
    if (error.code !== 1) throw new Error('Lệnh TinixPoster bị gián đoạn hoặc quá thời gian.')
  }
  try {
    return JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'))
  } catch {
    throw new Error('Lệnh TinixPoster không trả báo cáo.')
  }
}

export function createTinixMcp({ fetchFile = fetch, outputRoot = path.join(root, '.runtime', 'mcp-material'),
  additionalHosts = new Set() } = {}) {
  const server = new Server({ name: 'tinixposter-material', version: '1.1.0' }, { capabilities: { tools: {} } }) // [TINIX] Adds opt-in generated kit preparation.
  let busy = false
  const attachmentTools = [tool, photoTool, subjectPreviewTool, demoComparisonTool] // [TINIX]
  const workflows = workflowTools(attachmentSchema) // [TINIX]
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...attachmentTools, ...feedbackTools, ...cropTools, ...subjectEditTools, ...workflows] })) // [TINIX]
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
    if (feedbackTools.some(({ name }) => name === params.name)) {
      try {
        const report = await handleFeedbackTool(outputRoot, params.name, params.arguments)
        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }], structuredContent: report }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] }
      }
    }
    const cropTool = cropTools.find(item => item.name === params.name)
    const subjectEditTool = subjectEditTools.find(item => item.name === params.name) // [TINIX]
    const workflow = workflows.find(item => item.name === params.name) // [TINIX]
    if (!attachmentTools.some(item => item.name === params.name) && !cropTool && !subjectEditTool && !workflow) return { isError: true, content: [{ type: 'text', text: 'Công cụ chưa được hỗ trợ.' }] } // [TINIX]
    if (busy) return { isError: true, content: [{ type: 'text', text: 'TinixPoster đang xử lý bản nháp. Hãy thử lại sau.' }] }
    busy = true
    try {
      if (workflow) return await runScrapbookWorkflow(outputRoot, params.name, params.arguments, signal, {
        build: runDraft,
        download: (file, destination, signal, kind) => downloadAttachment(validateFile(file, additionalHosts, kind),
          destination, fetchFile, signal, kind === 'zip' ? maxZipBytes : maxPhotoBytes),
      }) // [TINIX]
      if (subjectEditTool) return await runSubjectEditTool(outputRoot, params.name, params.arguments, signal) // [TINIX]
      if (cropTool) {
        const { report, image, safeAreas = [] } = await runCropTool(outputRoot, cropTool.name, params.arguments, signal)
        const content = [{ type: 'text', text: JSON.stringify(report, null, 2) }]
        if (image) {
          const sharp = require('../../service/node_modules/sharp')
          const preview = await sharp(image).resize(960, 960, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
          content.push({ type: 'image', mimeType: 'image/png', data: preview.toString('base64') })
        }
        for (const area of safeAreas) {
          content.push({ type: 'text', text: `${area.code} · Ảnh gốc: màu tối = ngoài mặt nạ, cam đỏ = lớp phía trên che, màu gốc = vùng nhìn thấy.` },
            { type: 'image', mimeType: 'image/png', data: area.image.slice('data:image/png;base64,'.length) })
        }
        return { content, structuredContent: report }
      }
      if (params.name === photoTool.name) return await fillDraftFromAttachments(params.arguments, outputRoot, additionalHosts, fetchFile, signal)
      // [TINIX] Use the existing CDN rules and discard the downloaded original after preview.
      const comparingDemo = params.name === demoComparisonTool.name // [TINIX]
      if (params.name === subjectPreviewTool.name || comparingDemo) {
        const url = validateFile(comparingDemo ? params.arguments?.approved_demo : params.arguments?.file, additionalHosts, 'image')
        await mkdir(outputRoot, { recursive: true })
        const temporary = await mkdtemp(path.join(outputRoot, 'image-review-'))
        const input = path.join(temporary, 'original')
        try {
          await downloadAttachment(url, input, fetchFile, signal, maxPhotoBytes)
          return comparingDemo
            ? await compareApprovedDemo(outputRoot, params.arguments?.job_id, input, signal)
            : await previewSubject(input, signal)
        } finally {
          await rm(input, { force: true })
          await rmdir(temporary)
        }
      }
      const file = params.arguments?.file
      const url = validateFile(file, additionalHosts)
      const jobId = randomUUID()
      const job = path.join(outputRoot, jobId)
      const input = path.join(job, 'material.zip')
      const output = path.join(job, 'result')
      await mkdir(job, { recursive: true })
      try {
        await downloadAttachment(url, input, fetchFile, signal)
        const raw = await runDraft(input, output, signal)
        // Keep tool-visible reports free of signed URLs, local paths and raw exception messages.
        const { message, archive, ...details } = raw
        const archiveName = file.file_name?.split(/[/\\]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || archive
        const report = { ...details, archive: archiveName, jobId }
        if (raw.status === 'render-failed') report.detail = 'Bản nháp đã tạo. Kiểm tra dịch vụ render của TinixPoster.'
        return await draftToolResult(report, output)
      } finally {
        await rm(input, { force: true })
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Không xử lý được gói ZIP.'
      return { isError: true, content: [{ type: 'text', text }] }
    } finally {
      busy = false
    }
  })
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Additional trusted file CDN hostnames can be configured by the server operator.
  const additionalHosts = new Set((process.env.TINIX_MCP_FILE_HOSTS ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean))
  await createTinixMcp({ additionalHosts }).connect(new StdioServerTransport())
}
