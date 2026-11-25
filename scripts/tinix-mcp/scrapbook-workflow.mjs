// [TINIX] Persist demo approval and run the existing TinixPoster tools as a resumable workflow.
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { compareApprovedDemo } from './approved-demo.mjs'
import { cropTools, runCropTool } from './crop-review.mjs'
import { fillMaterialDraft } from './fill-draft.mjs'
import { readMaterialJob, runSubjectEditTool, subjectEditTools } from './subject-edit.mjs'
import { cutoutSubject } from './subject-preview.mjs'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const runFile = promisify(execFile)
const exporter = fileURLToPath(new URL('./workflow_compositions.py', import.meta.url))
const generator = fileURLToPath(new URL('./generate_compositions.py', import.meta.url)) // [TINIX]
const studioSha256 = 'be9d6da6777fd4789319abe351d1213ee560ebba2c1c27f24a376516e4f0a0fc'
const id = { type: 'string', pattern: '^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' }
const demos = ['A', 'B', 'C']
const templateDemos = ['A', 'B', 'C', 'D', 'E', 'F'] // [TINIX]
const frames = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06']
const checks = ['design', 'subject', 'crop']
const policyKeys = ['layer_position', 'subject_mask', 'crop']
const stateFile = 'workflow.json'
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const digest = data => createHash('sha256').update(data).digest('hex')

export function workflowTools(attachment) {
  const schema = (required, properties) => ({ type: 'object', additionalProperties: false, required, properties })
  const editOps = subjectEditTools[1].inputSchema.properties.operations
  return [{
    name: 'prepare_scrapbook_workflow', title: 'Chuẩn bị ba demo scrapbook',
    description: 'Send layered Studio v1.2.13 compositions and source assets in a ZIP. Default customer mode needs six photos and original SUBJECT. In template mode send 2–6 compositions named A.json onwards, each referencing six illustration images and a transparent SUBJECT asset inside the ZIP. Inspect the blank and checkerboard evidence with review_scrapbook_template_sources, then show only candidates that passed. Reuse request_id when retrying.', // [TINIX]
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { 'openai/fileParams': ['compositions', 'photos', 'subject'] },
    inputSchema: schema(['request_id', 'compositions'], { // [TINIX] Runtime requires the photo fields in customer mode.
      request_id: id, compositions: attachment, photos: { type: 'array', minItems: 6, maxItems: 6, items: attachment }, subject: attachment,
      mode: { enum: ['customer', 'template'], default: 'customer' },
      brief: { type: 'string', minLength: 1, maxLength: 3000 },
      demo_count: { type: 'integer', minimum: 2, maximum: 6, default: 3 },
      aspect_ratio: { type: 'string', pattern: '^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$' },
    }),
  }, { // [TINIX] Explicit opt-in keeps the existing preparation contract unchanged.
    name: 'prepare_generated_scrapbook_workflow', title: 'Tạo nhiều demo scrapbook từ brief và tài nguyên sạch',
    description: 'Generate 2–6 layered template demos and their validated TinixPoster ZIPs before approval. Supply the approved Studio v1.2.13 source fingerprint and optionally seven illustration-only attachments in F01–F06, SUBJECT order. Without attachments, uses procedural sample illustrations. No model calls. Review blank/checker evidence before selection.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { 'openai/fileParams': ['illustrations'] },
    inputSchema: schema(['request_id', 'brief', 'skill_version', 'skill_source_sha256'], {
      request_id: id, brief: { type: 'string', minLength: 1, maxLength: 3000 },
      skill_version: { type: 'string', const: '1.2.13' },
      skill_source_sha256: { type: 'string', const: studioSha256 },
      demo_count: { type: 'integer', minimum: 2, maximum: 6, default: 3 },
      aspect_ratio: { type: 'string', pattern: '^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$', default: '1:1' },
      title: { type: 'string', minLength: 1, maxLength: 70 },
      theme: { enum: ['pastel', 'vintage', 'coastal'] },
      illustrations: { type: 'array', minItems: 7, maxItems: 7, items: attachment },
    }),
  }, {
    name: 'review_scrapbook_template_sources', title: 'Kiểm lớp mẫu trước khi đưa demo ra chọn',
    description: 'Inspect the blank and checkerboard previews from prepare for every template demo before offering any demo to the user. Record per-demo pass, fail or uncertain with observed evidence. Fail if any original illustration survives in static layers. Only passed candidates can be approved.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: schema(['workflow_id', 'reviews'], { workflow_id: id,
      reviews: { type: 'array', minItems: 2, maxItems: 6, items: schema(['demo_id', 'status', 'notes'], {
        demo_id: { enum: templateDemos }, status: { enum: ['pass', 'fail', 'uncertain'] },
        notes: { type: 'string', minLength: 1, maxLength: 2000 },
      }) },
    }),
  }, {
    name: 'advance_scrapbook_workflow', title: 'Chạy hoặc tiếp tục sản xuất scrapbook',
    description: 'After the user chooses one of the prepared demos, lock that demo and agreed policy once. On awaiting_layout_qa inspect the comparison and send layout_review. Template mode delivers placeholders after this gate. In customer mode, inspect saved render, original SUBJECT and crop rows on awaiting_visual_qa and send visual_review. Supply only authorized targeted repairs with evidence.', // [TINIX]
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: schema(['workflow_id'], {
      workflow_id: id, approved_demo_id: { type: 'string', enum: templateDemos }, // [TINIX]
      policy: schema([], Object.fromEntries(policyKeys.map(key => [key, { type: 'boolean' }]))),
      layout_review: schema(['job_id', 'status', 'notes'], {
        job_id: id, status: { enum: ['pass', 'uncertain', 'fail'] }, notes: { type: 'string', minLength: 1, maxLength: 2000 },
      }),
      visual_review: schema(['job_id', ...checks, 'notes'], {
        job_id: id, ...Object.fromEntries(checks.map(key => [key, { enum: ['pass', 'uncertain', 'fail'] }])),
        notes: { type: 'string', minLength: 1, maxLength: 2000 },
      }),
      layer_repairs: { type: 'array', minItems: 1, maxItems: 4, items: schema(['code', 'dx', 'dy'], {
        code: { type: 'string', pattern: '^(F0[1-6]|D[0-9]{2})$' },
        dx: { type: 'number', minimum: -12, maximum: 12 }, dy: { type: 'number', minimum: -12, maximum: 12 },
      }) },
      subject_operations: editOps,
      crop_frame_codes: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: { enum: frames } },
    }),
  }, {
    name: 'get_scrapbook_workflow', title: 'Đọc trạng thái và sản phẩm scrapbook',
    description: 'Read the saved workflow status and QA. After delivery, request final_render, materials_zip, comparison or qa_report for the actual artifact.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: schema(['workflow_id'], { workflow_id: id, artifact: { enum: ['final_render', 'materials_zip', 'comparison', 'qa_report'] } }),
  }]
}

function uuid(value) {
  if (typeof value !== 'string' || value.length !== 36 || !new RegExp(id.pattern).test(value)) throw new Error('Mã workflow không hợp lệ.')
  return value
}

async function save(file, value) {
  const temp = file + '.' + randomUUID()
  await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx' })
  try { await rename(temp, file) } finally { await rm(temp, { force: true }) }
}

async function withLock(directory, callback) {
  const lock = directory + '.lock'
  try { await mkdir(lock) } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Workflow đang chạy hoặc khóa còn tồn tại sau khi tiến trình bị dừng.')
    throw error
  }
  try { return await callback() } finally { await rmdir(lock) }
}

const image = (data, mimeType = 'image/png') => ({ type: 'image', mimeType, data: data.toString('base64') })
const message = text => ({ type: 'text', text })
function response(state, content = []) {
  return { structuredContent: state, content: [message(JSON.stringify(state)), ...content] }
}
const resultDir = (root, jobId) => path.join(root, jobId, 'result')
const packageDir = directory => path.join(directory, 'compositions')
const material = (directory, variant) => path.join(packageDir(directory), variant, 'material.zip')
const demoFile = (directory, demo, template = false) => path.join(packageDir(directory), demo,
  ...(template ? ['demo.png'] : ['material', '01_anh_mau.png'])) // [TINIX]
const sourceFiles = (directory, demo) => ['blank.png', 'checker.png'].map(name =>
  path.join(packageDir(directory), demo, name))
const sourceEvidence = (directory, demo) => Promise.all(sourceFiles(directory, demo).map(async file => digest(await readFile(file))))

async function sourceLock(directory, demo, template = false, generated = false) { // [TINIX]
  const root = packageDir(directory)
  const source = path.join(root, demo + '.source.json')
  const manifest = await json(source)
  const assets = [...new Set([...(template ? [] : ['../photo-subject']), manifest.background, manifest.subject.asset, ...manifest.frames.flatMap(layer => [layer.asset, layer.photo]),
    ...(manifest.decorations ?? []).map(layer => layer.asset)])].sort()
  const inputs = await Promise.all(assets.map(async asset => [asset, digest(await readFile(path.resolve(root, asset)))]))
  return { demoSha256: digest(await readFile(demoFile(directory, demo, template))), manifestSha256: digest(await readFile(source)),
    ...((!template || generated) && { materialSha256: digest(await readFile(material(directory, demo))) }), inputs }
}

async function python(args, signal, script = exporter) { // [TINIX]
  await runFile(process.env.TINIX_STUDIO_PYTHON || 'python', ['-B', script, ...args], {
    windowsHide: true, signal, timeout: 230000, maxBuffer: 512000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }).catch(error => { throw new Error('Exporter Studio: ' + (error.stderr?.trim().split(/\r?\n/).at(-1) || error.code || 'không hoàn tất')) })
}

async function previews(directory, state) {
  const panels = await Promise.all(state.demos.map(async ({ demoId: demo }) => {
    const preview = file => sharp(file).resize(700, 900, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()
    const original = state.mode === 'template' ? await preview(demoFile(directory, demo, true))
      : await readFile(path.join(packageDir(directory), demo, 'qa', 'preview.jpg'))
    const content = [message('Demo ' + demo), image(original, 'image/jpeg')]
    if (state.sourceQaRequired) {
      const [blank, checker] = await Promise.all(sourceFiles(directory, demo).map(preview))
      content.push(message(demo + ' · tắt cả bảy ảnh minh họa'), image(blank, 'image/jpeg'),
        message(demo + ' · thay bảy ảnh bằng ô caro'), image(checker, 'image/jpeg'))
    }
    return content
  }))
  return response(state, panels.flat())
}

async function reviewTemplateSources(directory, state, reviews) { // [TINIX]
  if (!state.sourceQaRequired || state.approvedDemoId) throw new Error('Chỉ kiểm nguồn trước khi duyệt demo của workflow mới.')
  if (!Array.isArray(reviews) || reviews.length !== state.demos.length ||
      new Set(reviews.map(review => review?.demo_id)).size !== state.demos.length ||
      reviews.some(review => !state.demos.some(demo => demo.demoId === review?.demo_id) ||
        !['pass', 'fail', 'uncertain'].includes(review.status) ||
        typeof review.notes !== 'string' || !review.notes.trim() || review.notes.length > 2000)) {
    throw new Error('Cần kết quả kiểm và ghi chú cho từng demo.')
  }
  const locks = await json(path.join(directory, 'locks.json'))
  state.sourceReviews = await Promise.all(reviews.map(async ({ demo_id, status, notes }) => {
    const { demoId, ...expected } = locks.find(lock => lock.demoId === demo_id)
    if (JSON.stringify(await sourceLock(directory, demoId, true, state.generated === true)) !== JSON.stringify(expected)) throw new Error('Nguồn demo đã thay đổi.')
    return { demoId, status, notes: notes.trim(), evidence: await sourceEvidence(directory, demoId) }
  }))
  state.stepStatus.sourceQa = 'done'
  state.qaStatus = reviews.some(review => review.status === 'pass') ? 'awaiting_demo' : 'source_qa_failed'
  await save(path.join(directory, stateFile), state)
  return response(state)
}

// [TINIX] Store each proposed kit once and keep it tied to exactly one request and source.
async function prepareGenerated(directory, workflowId, args, dependencies, signal) {
  const { brief, title, theme, demo_count: count = 3, aspect_ratio: aspect = '1:1',
    skill_version: skillVersion, skill_source_sha256: skillSourceSha256, illustrations } = args
  if (skillVersion !== '1.2.13' || skillSourceSha256 !== studioSha256) {
    throw new Error('SKILL_SOURCE_MISMATCH: Cần đúng gói Scrapbook Story Studio v1.2.13 đã duyệt.')
  }
  const nonempty = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
  if (!nonempty(brief, 3000) || (title !== undefined && !nonempty(title, 70)) ||
      (theme !== undefined && !['pastel', 'vintage', 'coastal'].includes(theme)) ||
      !Number.isInteger(count) || count < 2 || count > 6 || typeof aspect !== 'string' ||
      !/^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$/.test(aspect)) throw new Error('Brief, số demo, tỷ lệ, tiêu đề hoặc chủ đề không hợp lệ.')
  const [w, h] = aspect.split(':').map(Number)
  if (Math.max(w, h) > 3 * Math.min(w, h)) throw new Error('Tỷ lệ được hỗ trợ từ 1:3 đến 3:1.')
  if (illustrations !== undefined && (!Array.isArray(illustrations) || illustrations.length !== 7 ||
      illustrations.some(file => !nonempty(file?.file_id, 512)) ||
      new Set(illustrations.map(file => file.file_id)).size !== 7)) throw new Error('Cần đúng bảy ảnh minh họa riêng theo thứ tự F01–F06, SUBJECT.')
  const config = { brief: brief.trim(), title: title?.trim(), theme, demoCount: count, aspectRatio: aspect, skillVersion, skillSourceSha256 }
  const requestSha256 = digest(JSON.stringify([config, illustrations?.map(file => file.file_id)]))
  const existing = await json(path.join(directory, stateFile)).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new Error('Mã yêu cầu đã gắn với đầu vào khác.')
    return previews(directory, existing)
  }
  const stage = await mkdtemp(directory + '-prepare-')
  try {
    const names = illustrations?.map((_, index) => 'illustration-' + index)
    if (names) {
      const downloaded = await Promise.allSettled(illustrations.map((file, index) =>
        dependencies.download(file, path.join(stage, names[index]), signal, 'image')))
      const failure = downloaded.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
    const settings = path.join(stage, 'generation.json')
    await save(settings, { ...config, illustrations: names })
    await python([packageDir(stage), settings], signal, generator)
    const batch = await json(path.join(packageDir(stage), 'batch.json'))
    const locks = await Promise.all(templateDemos.slice(0, count).map(async demoId =>
      ({ demoId, ...await sourceLock(stage, demoId, true, true) })))
    if (locks.some((lock, index) => lock.materialSha256 !== batch.kits[index].kitSha256)) throw new Error('SHA-256 của ZIP không khớp.')
    const state = {
      workflowId, mode: 'template', generated: true, requestSha256, brief: config.brief, aspectRatio: aspect,
      skillVersion, skillSourceSha256, batch, approvedDemoId: null, currentJobId: null, parentJobId: null,
      qaStatus: 'awaiting_source_qa', sourceQaRequired: true, retryCount: 0, artifacts: {},
      stepStatus: { prepare: 'done', sourceQa: 'waiting', approval: 'waiting' },
      demos: locks.map(({ demoId, demoSha256, manifestSha256, materialSha256 }) =>
        ({ demoId, demoSha256, manifestSha256, materialSha256 })),
    }
    await save(path.join(stage, 'locks.json'), locks)
    await save(path.join(stage, stateFile), state)
    await rename(stage, directory)
    return previews(directory, state)
  } finally { await rm(stage, { recursive: true, force: true }) }
}

async function prepare(directory, workflowId, args, dependencies, signal) {
  const { compositions, photos, subject, mode = 'customer', brief, demo_count: count = 3, aspect_ratio: aspect } = args
  if (!['customer', 'template'].includes(mode)) throw new Error('Chế độ workflow không hợp lệ.')
  const template = mode === 'template'
  if (template && (photos !== undefined || subject !== undefined || !Number.isInteger(count) || count < 2 || count > 6 ||
      (aspect !== undefined && (typeof aspect !== 'string' || !/^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$/.test(aspect))) ||
      (brief !== undefined && (typeof brief !== 'string' || !brief.trim() || brief.length > 3000)))) {
    throw new Error('Chế độ template nhận 2–6 demo phân lớp, không nhận ảnh khách. Kiểm brief và tỷ lệ nếu có.')
  }
  if (!template && (!Array.isArray(photos) || photos.length !== 6)) throw new Error('Cần đúng sáu ảnh khung và một SUBJECT gốc.')
  const files = template ? [compositions] : [compositions, ...photos, subject]
  const inputs = files.map(file => file?.file_id)
  if (inputs.some(value => typeof value !== 'string' || !value) || (!template && new Set(inputs.slice(1)).size !== 7)) {
    throw new Error('Cần bảy ảnh nguồn riêng biệt, đúng thứ tự F01–F06 và SUBJECT.')
  }
  const existing = await json(path.join(directory, stateFile)).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (existing) {
    if (JSON.stringify(existing.inputFileIds) !== JSON.stringify(inputs)) throw new Error('Mã yêu cầu đã gắn với bộ tệp khác.')
    if ((existing.mode ?? 'customer') !== mode || (template &&
        (existing.demos.length !== count || existing.brief !== brief || existing.aspectRatio !== aspect))) {
      throw new Error('Mã yêu cầu đã gắn với thiết lập demo khác.')
    }
    return previews(directory, existing)
  }
  const stage = await mkdtemp(directory + '-prepare-')
  try {
    const names = ['source.zip', ...frames.map((_, index) => 'photo-' + (index + 1)), 'photo-subject']
    const outcomes = await Promise.allSettled(files.map((file, i) =>
      dependencies.download(file, path.join(stage, names[i]), signal, i === 0 ? 'zip' : 'image')))
    const error = outcomes.find(item => item.status === 'rejected')
    if (error) throw error.reason
    for (const name of names.slice(1, files.length)) { // [TINIX] Template uploads only the composition archive.
      const meta = await sharp(path.join(stage, name), { limitInputPixels: 32000000 }).metadata()
      if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages ?? 1) !== 1 ||
          meta.width * meta.height > 32000000) throw new Error('Ảnh đầu vào phải là JPEG, PNG hoặc WebP tĩnh trong giới hạn 32 triệu pixel.')
    }
    if (template) {
      await python(['prepare-template', path.join(stage, 'source.zip'), packageDir(stage), String(count), ...(aspect ? [aspect] : [])], signal)
    } else {
      const cutout = await cutoutSubject(path.join(stage, 'photo-subject'), signal)
      await writeFile(path.join(stage, 'subject.png'), cutout.png, { flag: 'wx' })
      await python(['prepare', path.join(stage, 'source.zip'), packageDir(stage)], signal)
    }
    const candidates = template ? templateDemos.slice(0, count) : demos
    const demoEntries = await Promise.all(candidates.map(async demoId => ({ demoId, ...await sourceLock(stage, demoId, template) })))
    if (new Set(demoEntries.map(item => item.demoSha256)).size !== candidates.length) throw new Error('Các demo phải khác nhau.')
    const state = { workflowId, approvedDemoId: null, currentJobId: null, parentJobId: null,
      stepStatus: { prepare: 'done', approval: 'waiting' }, qaStatus: 'awaiting_demo', retryCount: 0,
      artifacts: {}, demos: demoEntries.map(({ demoId, demoSha256 }) => ({ demoId, demoSha256 })), inputFileIds: inputs,
      ...(template && { mode, brief, aspectRatio: aspect, sourceQaRequired: true, qaStatus: 'awaiting_source_qa',
        stepStatus: { prepare: 'done', sourceQa: 'waiting', approval: 'waiting' } }) }
    await save(path.join(stage, 'locks.json'), demoEntries)
    await save(path.join(stage, stateFile), state)
    await rename(stage, directory)
    return previews(directory, state)
  } finally { await rm(stage, { recursive: true, force: true }) }
}

async function publish(root, jobId, work) {
  const destination = resultDir(root, jobId)
  const prior = await json(path.join(destination, 'report.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (prior?.status === 'rendered') return prior
  const stage = await mkdtemp(path.join(root, 'workflow-job-'))
  try {
    const candidate = path.join(stage, 'result')
    const report = await work(candidate, stage)
    if (report.status !== 'rendered') throw new Error('Dựng bản nháp không thành công: ' + (report.reason ?? report.status))
    const full = { ...report, jobId }
    await save(path.join(candidate, 'report.json'), full)
    await mkdir(path.dirname(destination), { recursive: true })
    await rename(candidate, destination)
    return full
  } finally { await rm(stage, { recursive: true, force: true }) }
}

async function evidence(root, directory, state) {
  const current = await runSubjectEditTool(root, subjectEditTools[0].name,
    { job_id: state.currentJobId, include_subject_source: true })
  const content = current.content.slice(1)
  content.push(message('Đối chiếu demo đã khóa và bản nhập ZIP'), image(await readFile(path.join(directory, 'comparison.png'))))
  return response(state, content)
}

function resetVisualStages(state) {
  for (const name of ['cropReview', 'delivery']) delete state.stepStatus[name]
  delete state.reviewId
  delete state.cropRows
  state.qaStatus = 'awaiting_visual_qa'
}

async function advance(root, directory, state, args, dependencies, signal) {
  const commit = () => save(path.join(directory, stateFile), state)
  const template = state.mode === 'template' // [TINIX]
  if (state.generated && (args.layer_repairs !== undefined || args.policy?.layer_position)) { // [TINIX]
    throw new Error('Workflow P1 chỉ dùng ZIP đã khóa. Sửa nguồn cần một workflow mới.')
  }
  const changes = [
    ['layer_position', args.layer_repairs], ['subject_mask', args.subject_operations], ['crop', args.crop_frame_codes],
  ].filter(([, edit]) => edit !== undefined)
  if (template && (args.policy?.crop || args.policy?.subject_mask || args.crop_frame_codes || args.subject_operations || args.visual_review)) {
    throw new Error('Workflow mẫu dùng layout_review và chỉ sửa vị trí lớp; không xử lý ảnh khách.')
  }
  if (changes.length > 1) throw new Error('Gửi một nhóm sửa mỗi lượt để kiểm lại tác động.')
  if (!state.approvedDemoId) {
    if (!state.demos.some(({ demoId }) => demoId === args.approved_demo_id)) throw new Error('Cần chọn đúng một demo có trong workflow.') // [TINIX]
    if (state.sourceQaRequired) {
      const review = state.sourceReviews?.find(item => item.demoId === args.approved_demo_id)
      if (review?.status !== 'pass') throw new Error('Demo chưa qua kiểm nguồn với bản trống và ô caro.')
      if (JSON.stringify(await sourceEvidence(directory, review.demoId)) !== JSON.stringify(review.evidence)) {
        throw new Error('Ảnh kiểm nguồn đã thay đổi sau QA.')
      }
    }
    state.approvedDemoId = args.approved_demo_id
    state.policy = Object.fromEntries(policyKeys.map(key => [key, args.policy?.[key] === true]))
    state.stepStatus.approval = 'done'
    state.approved = (await json(path.join(directory, 'locks.json'))).find(item => item.demoId === state.approvedDemoId)
    if (state.generated) { // [TINIX] Select the exact previously validated artifact.
      state.exportSha256 = state.approved.materialSha256
      state.stepStatus.export = 'done'
    }
    state.variant = state.approvedDemoId
    state.importJobId = randomUUID()
    if (!template) state.fillJobId = randomUUID()
    state.repairCount = 0
    await commit()
  } else if ((args.approved_demo_id && args.approved_demo_id !== state.approvedDemoId) ||
      (args.policy && policyKeys.some(key => (args.policy[key] === true) !== state.policy[key]))) {
    throw new Error('Demo và quyền sửa đã khóa. Tạo workflow mới nếu cần thay đổi.')
  }
  if (changes.some(([action]) => !state.policy[action])) throw new Error('Quyền sửa này chưa được cấp khi duyệt demo.')
  const lock = await sourceLock(directory, state.approvedDemoId, template, state.generated === true)
  const { demoId, ...approvedLock } = state.approved
  if (JSON.stringify(lock) !== JSON.stringify(approvedLock)) throw new Error('Nguồn demo đã khóa bị thay đổi.')
  if (state.qaStatus === 'passed') return response(state)
  const actionKey = changes.length ? digest(JSON.stringify(changes)) : undefined
  if (actionKey && state.lastAction !== actionKey && !state.pendingRepair) {
    if (!state.currentJobId) throw new Error('Cần xem chứng cứ QA trước khi sửa.')
    const [kind] = changes[0]
    if ((kind === 'layer_position') === (state.stepStatus.fill === 'done')) throw new Error('Thao tác sửa không đúng giai đoạn workflow.')
  }
  if (actionKey && state.pendingRepair && actionKey !== state.pendingRepair.key) {
    throw new Error('Đang có thao tác sửa chờ hoàn tất. Tiếp tục workflow trước khi gửi thao tác khác.')
  }
  let failureStep = 'build'
  try {
    if (state.lastError) { delete state.lastError; await commit() }
    // [TINIX] Only the approved composition gets a production ZIP.
    if (template && state.stepStatus.export !== 'done') {
      failureStep = 'export'
      await python(['export-template', packageDir(directory), state.approvedDemoId], signal)
      state.exportSha256 = digest(await readFile(material(directory, state.approvedDemoId)))
      state.stepStatus.export = 'done'
      await commit()
    }
    if (template && state.exportSha256 !== digest(await readFile(material(directory, state.approvedDemoId)))) {
      throw new Error('ZIP của demo đã duyệt bị thay đổi.')
    }
    if (actionKey && state.lastAction !== actionKey && !state.pendingRepair && state.currentJobId) {
      if (state.repairCount >= 3) throw new Error('Đã đạt giới hạn ba vòng sửa.')
      const [kind, operations] = changes[0]
      const verdict = kind === 'layer_position' ? args.layout_review : args.visual_review
      if (!verdict || verdict.job_id !== state.currentJobId || !verdict.notes?.trim()) {
        throw new Error('Cần căn cứ QA trên đúng job hiện tại cho vùng sửa.')
      }
      if (kind === 'layer_position' && verdict.status !== 'fail' ||
          kind === 'subject_mask' && args.visual_review.subject !== 'fail' ||
          kind === 'crop' && args.visual_review.crop !== 'fail') throw new Error('QA chưa xác định lỗi phù hợp với thao tác sửa.')
      if (kind === 'crop') {
        const allowed = state.cropRows?.filter(row => row.status === 'safe' && row.exposedPercent <= 5)
        if (!Array.isArray(operations) || !operations.length || new Set(operations).size !== operations.length ||
            operations.some(code => !allowed?.some(row => row.code === code))) throw new Error('Crop không qua điều kiện an toàn.')
      }
      state.pendingRepair = { kind, operations, key: actionKey, parent: state.currentJobId, output: randomUUID() }
      await commit()
    }
    if (state.pendingRepair?.kind === 'layer_position') {
      failureStep = 'layerRepair'
      const repair = state.pendingRepair
      const variant = 'revision-' + repair.output
      const repairJson = path.join(directory, 'repair.json')
      await save(repairJson, repair.operations)
      const variantZip = material(directory, variant)
      const exported = await readFile(variantZip).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (!exported) {
        await rm(path.join(packageDir(directory), variant + '.source.json'), { force: true })
        await python(['revise', packageDir(directory), state.variant, variant, repairJson, ...(template ? ['template'] : [])], signal)
      }
      state.variant = variant
      state.parentJobId = repair.parent
      state.importJobId = repair.output
      if (!template) state.fillJobId = randomUUID()
      for (const step of ['build', 'compare', 'layoutQa', 'fill', 'cropReview']) delete state.stepStatus[step]
      state.lastAction = repair.key
      state.repairCount++
      delete state.pendingRepair
      resetVisualStages(state)
      await commit()
    }
    failureStep = 'build'
    const base = await publish(root, state.importJobId, async candidate => ({
      ...await dependencies.build(material(directory, state.variant), candidate, signal),
      ...(state.generated && { sourceKitSha256: state.exportSha256 }), // [TINIX] Report which locked ZIP was imported.
      ...(state.variant !== state.approvedDemoId && { parentJobId: state.parentJobId }),
    }))
    state.stepStatus.build = 'done'
    failureStep = 'compare'
    if (state.stepStatus.compare !== 'done') {
      const compared = await compareApprovedDemo(root, state.importJobId, demoFile(directory, state.approvedDemoId, template), signal)
      if (compared.structuredContent.approvedDemoSha256 !== state.approved.demoSha256) throw new Error('Sai ảnh demo đã khóa.')
      await save(path.join(directory, 'comparison.json'), compared.structuredContent)
      await writeFile(path.join(directory, 'comparison.png'), Buffer.from(compared.content.find(block => block.type === 'image').data, 'base64'))
      state.stepStatus.compare = 'done'
      state.artifacts.comparison = true
      await commit()
    }
    if (state.stepStatus.layoutQa !== 'done') {
      failureStep = 'layoutQa'
      state.currentJobId = state.importJobId
      const layoutReview = args.layout_review
      if (layoutReview?.job_id === state.currentJobId) {
        if (!['pass', 'fail', 'uncertain'].includes(layoutReview.status) || !layoutReview.notes?.trim() || layoutReview.notes.length > 2000) {
          throw new Error('QA bố cục cần trạng thái và căn cứ cụ thể.')
        }
        state.layoutReview = layoutReview
      }
      if (state.layoutReview?.job_id !== state.currentJobId || state.layoutReview.status !== 'pass') {
        state.stepStatus.layoutQa = 'waiting'
        state.qaStatus = state.layoutReview?.job_id === state.currentJobId ? 'exception' : 'awaiting_layout_qa'
        await commit()
        return response(state, [message('Đối chiếu render nhập ZIP với demo đã khóa'),
          image(await readFile(path.join(directory, 'comparison.png')))])
      }
      state.stepStatus.layoutQa = 'done'
      await commit()
    }
    if (template) {
      failureStep = 'delivery'
      const { report, layout, subject, png } = await readMaterialJob(root, state.importJobId)
      const size = await sharp(png).metadata()
      const technical = await json(path.join(packageDir(directory), state.variant, 'qa', 'tinixposter_qa.json'))
      const failures = []
      if (report.photoSlots?.length !== 6 || frames.some(code => !report.photoSlots.some(slot =>
        slot.code === code && layout.layers.some(layer => layer.uuid === slot.id && layer.mask && layer.slot && layer.templateRole === 'photo'))) ||
        !subject || subject.cutoutEdit) failures.push('placeholder_slots')
      if (size.width !== layout.global.width || size.height !== layout.global.height) failures.push('render_dimensions')
      if (!technical.render_pixel_identical_from_json || technical.min_bounding_box_gap_px < 12 ||
          Object.keys(technical.enclosed_windows_alpha_zero ?? {}).length !== 6) failures.push('material_qa')
      const qa = { pass: !failures.length, failures, warnings: [],
        confidence: { technical: failures.length ? 'failed' : 'verified', visual: 'agent-reviewed' },
        recommendedFixes: failures.map(item => ({ item, action: 'Verify the locked composition, export and stored placeholder render.' })),
        approvedDemoSha256: state.approved.demoSha256, finalJobId: state.importJobId, layoutReview: state.layoutReview,
        material: technical, comparison: await json(path.join(directory, 'comparison.json')) }
      await save(path.join(directory, 'qa.json'), qa)
      state.artifacts.qa_report = true
      state.currentJobId = state.importJobId
      state.qaStatus = qa.pass ? 'passed' : 'exception'
      state.stepStatus.delivery = qa.pass ? 'done' : 'blocked'
      if (qa.pass) state.artifacts = { final_render: state.currentJobId, materials_zip: state.variant, comparison: true, qa_report: true }
      await commit()
      return response({ ...state, qa }, (await runSubjectEditTool(root, subjectEditTools[0].name,
        { job_id: state.currentJobId })).content.slice(1))
    }
    failureStep = 'fill'
    if (state.stepStatus.fill !== 'done') {
      await publish(root, state.fillJobId, async (candidate, stage) => {
        await mkdir(candidate)
        const photos = frames.map((code, index) => ({ id: base.photoSlots.find(slot => slot.code === code).id,
          file: path.join(directory, 'photo-' + (index + 1)) }))
        const { idMap, ...report } = await fillMaterialDraft(resultDir(root, state.importJobId), candidate, photos,
          { source: path.join(directory, 'photo-subject'), cutout: path.resolve(stage, 'subject.png') }, signal)
        return { ...report, sourceJobId: state.importJobId, ...(state.parentJobId && { parentJobId: state.parentJobId }),
          photoSlots: frames.map((code, index) => ({ code, id: idMap[photos[index].id] })) }
      })
      state.parentJobId ??= state.importJobId
      state.currentJobId = state.fillJobId
      state.stepStatus.fill = 'done'
      await commit()
    }
    if (state.pendingRepair) {
      const repair = state.pendingRepair
      failureStep = repair.kind === 'crop' ? 'applyCrop' : 'subjectRepair'
      await publish(root, repair.output, async candidate => {
        const copy = { id: repair.output, output: candidate }
        if (repair.kind === 'crop') {
          const applied = await runCropTool(root, cropTools[1].name, { job_id: repair.parent,
            review_id: state.reviewId, frame_codes: repair.operations }, signal, copy)
          return applied.report
        }
        const edited = await runSubjectEditTool(root, subjectEditTools[1].name,
          { job_id: repair.parent, operations: repair.operations }, signal, copy)
        return edited.structuredContent
      })
      state.currentJobId = repair.output
      state.parentJobId = repair.parent
      state.lastAction = repair.key
      state.repairCount++
      state.stepStatus[failureStep] = 'done'
      delete state.pendingRepair
      resetVisualStages(state)
      await commit()
    }
    failureStep = 'cropReview'
    if (state.stepStatus.cropReview !== 'done') {
      const { report } = await runCropTool(root, cropTools[0].name, { job_id: state.currentJobId }, signal)
      state.reviewId = report.reviewId
      state.cropRows = report.rows
      state.stepStatus.cropReview = 'done'
      state.qaStatus = 'awaiting_visual_qa'
      await commit()
    }
    if (args.visual_review?.job_id !== state.currentJobId) return await evidence(root, directory, state)
    failureStep = 'delivery'
    const visual = args.visual_review
    if (checks.some(key => !['pass', 'uncertain', 'fail'].includes(visual[key])) || !visual.notes?.trim() || visual.notes.length > 2000) {
      throw new Error('QA thị giác cần trạng thái và căn cứ cụ thể.')
    }
    const { report: final, layout, png, subject } = await readMaterialJob(root, state.currentJobId)
    const dimensions = await sharp(png).metadata()
    const photoSlots = final.photoSlots ?? []
    const failures = checks.filter(key => visual[key] === 'fail')
    if (final.photos !== 6 || photoSlots.length !== 6 || new Set(photoSlots.map(slot => slot.id)).size !== 6 ||
        frames.some(code => !photoSlots.some(slot => slot.code === code && layout.layers.some(layer =>
          layer.uuid === slot.id && layer.templateRole === 'photo' && layer.slot && layer.mask && !layer.linkedPhotoId))) ||
        !subject?.cutoutEdit || final.subjectCutout?.engine !== 'BiRefNet') failures.push('photoBinding')
    if (dimensions.width !== layout.global.width || dimensions.height !== layout.global.height) failures.push('renderDimensions')
    const warnings = checks.filter(key => visual[key] === 'uncertain')
    for (const row of state.cropRows) {
      if (row.status === 'unavailable' || row.status === 'manual' || row.status === 'safe') warnings.push('crop:' + row.code + ':' + row.status)
    }
    const blockingCrop = state.cropRows.some(row => ['manual', 'unavailable'].includes(row.status))
    const guidance = {
      design: 'Compare the locked demo with the imported render; correct only the offending composition layer.',
      subject: 'Compare the original SUBJECT with the alpha; inspect the pose, supports and cutline.',
      crop: 'Review the saved crop against the original photo and any occluding layer.',
      photoBinding: 'Verify the six source-to-slot assignments and the separate BiRefNet SUBJECT.',
      renderDimensions: 'Verify the declared print dimensions and rerender before delivery.',
    }
    const qa = { pass: !failures.length && !checks.some(key => visual[key] === 'uncertain') && !blockingCrop,
      warnings, failures, confidence: { technical: failures.includes('photoBinding') || failures.includes('renderDimensions') ? 'failed' : 'verified',
        visual: checks.some(key => visual[key] === 'uncertain') ? 'uncertain' : 'agent-reviewed' },
      recommendedFixes: failures.concat(warnings).map(item => ({ item, action: guidance[item.split(':')[0]] })),
      visual, approvedDemoSha256: state.approved.demoSha256, cropRows: state.cropRows, finalJobId: state.currentJobId,
      finalRenderPx: [dimensions.width, dimensions.height],
      material: await json(path.join(packageDir(directory), state.variant, 'qa', 'tinixposter_qa.json')),
      comparison: await json(path.join(directory, 'comparison.json')) }
    await save(path.join(directory, 'qa.json'), qa)
    state.artifacts.qa_report = true
    state.qaStatus = qa.pass ? 'passed' : 'exception'
    state.stepStatus.delivery = qa.pass ? 'done' : 'blocked'
    if (qa.pass) state.artifacts = { final_render: state.currentJobId, materials_zip: state.variant, comparison: true, qa_report: true }
    await commit()
    return response({ ...state, qa: { pass: qa.pass, warnings, failures, confidence: qa.confidence } },
      (await runSubjectEditTool(root, subjectEditTools[0].name, { job_id: state.currentJobId })).content.slice(1))
  } catch (error) {
    signal.throwIfAborted()
    state.retryCount++
    state.stepStatus[failureStep] = 'error'
    state.lastError = { step: failureStep, message: error.message }
    state.qaStatus = 'retryable_error'
    await commit()
    return response(state)
  }
}

export async function runScrapbookWorkflow(root, name, args, signal, dependencies) {
  const generated = name === 'prepare_generated_scrapbook_workflow' // [TINIX]
  const staging = generated || name === 'prepare_scrapbook_workflow'
  const workflowId = uuid(staging ? args?.request_id : args?.workflow_id)
  const workflows = path.resolve(root, '.workflows')
  const directory = path.join(workflows, workflowId)
  if (staging) {
    await mkdir(workflows, { recursive: true })
    return withLock(directory, () => (generated ? prepareGenerated : prepare)(directory, workflowId, args, dependencies, signal))
  }
  root = path.resolve(root)
  const load = () => json(path.join(directory, stateFile))
  if (name === 'review_scrapbook_template_sources') return withLock(directory, async () =>
    reviewTemplateSources(directory, await load(), args.reviews))
  if (name === 'advance_scrapbook_workflow') return withLock(directory, async () =>
    advance(root, directory, await load(), args, dependencies, signal))
  const state = await load()
  const artifact = args.artifact
  if (!artifact) return response(state)
  if (!Object.hasOwn(state.artifacts, artifact)) throw new Error('Tệp bàn giao chưa có cho workflow này.')
  const [file, mimeType] = {
    final_render: [path.join(resultDir(root, state.currentJobId), 'render.png'), 'image/png'],
    materials_zip: [material(directory, state.variant), 'application/zip'],
    comparison: [path.join(directory, 'comparison.png'), 'image/png'],
    qa_report: [path.join(directory, 'qa.json'), 'application/json'],
  }[artifact]
  const bytes = await readFile(file)
  return response({ workflowId, artifact, fileName: path.basename(file), bytes: bytes.length, sha256: digest(bytes) }, [{
    type: 'resource', resource: { uri: 'tinixposter://workflow/' + workflowId + '/' + artifact, mimeType, blob: bytes.toString('base64') },
  }])
}
