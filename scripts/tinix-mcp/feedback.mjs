// [TINIX] Link web observations and local Codex results to an immutable render job.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const jobIdField = { type: 'string', pattern: uuid.source }
const textField = { type: 'string', minLength: 1, maxLength: 4000 }
const issueFields = {
  layer: { type: 'string', minLength: 1, maxLength: 80, description: 'F01–F06, SUBJECT, or the affected layer name' },
  observed: textField,
  expected: textField,
}

export const feedbackTools = [
  {
    name: 'submit_material_feedback',
    title: 'Gửi phản hồi bản render cho Codex',
    description: 'Record observations for the exact rendered jobId. Returns a feedbackId for reading the result. Send text only, without customer details or attachment URLs.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['job_id', 'summary'],
      properties: {
        job_id: jobIdField, summary: textField,
        issues: { type: 'array', maxItems: 12, items: {
          type: 'object', additionalProperties: false, required: Object.keys(issueFields), properties: issueFields,
        } },
      },
    },
  },
  {
    name: 'get_material_feedback_result',
    title: 'Đọc kết quả kiểm tra của Codex',
    description: 'Read one review by its exact rendered job ID and feedback ID. Pending means Codex has not posted a result yet.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['job_id', 'feedback_id'],
      properties: { job_id: jobIdField, feedback_id: jobIdField },
    },
  },
]

function validatedId(value) {
  if (typeof value !== 'string' || value.length !== 36 || !uuid.test(value)) throw new Error('Mã phiên dựng hoặc mã phản hồi không hợp lệ.')
  return value
}

function validatedText(value, maxLength = textField.maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error('Nội dung phản hồi thiếu hoặc vượt giới hạn.')
  return value.trim()
}

async function readJson(file, missingMessage) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(missingMessage, { cause: error })
    throw new Error('Không đọc được dữ liệu phản hồi.')
  }
}

function feedbackFolder(root, jobId, feedbackId) {
  return path.join(root, validatedId(jobId), 'feedback', validatedId(feedbackId))
}

async function writeJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' })
    await rename(temporary, file)
  } catch {
    throw new Error('Không ghi được dữ liệu phản hồi.')
  } finally {
    await rm(temporary, { force: true })
  }
}

async function submitFeedback(root, { job_id: rawJobId, summary, issues = [] }) {
  const jobId = validatedId(rawJobId)
  if (!Array.isArray(issues) || issues.length > 12) throw new Error('Mỗi báo cáo nhận tối đa 12 nhận xét.')
  const details = issues.map(({ layer, observed, expected } = {}) => ({
    layer: validatedText(layer, issueFields.layer.maxLength),
    observed: validatedText(observed),
    expected: validatedText(expected),
  }))
  const observation = validatedText(summary)
  const render = path.join(root, jobId, 'result')
  const report = await readJson(path.join(render, 'report.json'), 'Không tìm thấy phiên dựng TinixPoster.')
  const image = await stat(path.join(render, 'render.png')).catch(() => undefined)
  if (report.status !== 'rendered' || (report.jobId && report.jobId !== jobId) || !image?.isFile()) {
    throw new Error('Chỉ nhận phản hồi cho phiên có ảnh render đã xác minh.')
  }
  const feedbackId = randomUUID()
  const folder = feedbackFolder(root, jobId, feedbackId)
  const feedback = { jobId, feedbackId, createdAt: new Date().toISOString(), summary: observation, issues: details }
  await mkdir(folder, { recursive: true })
  await writeJson(path.join(folder, 'feedback.json'), feedback)
  return { jobId, feedbackId, status: 'pending' }
}

async function readFeedback(root, jobId, feedbackId) {
  const folder = feedbackFolder(root, jobId, feedbackId)
  const feedback = await readJson(path.join(folder, 'feedback.json'), 'Không tìm thấy phản hồi thuộc phiên dựng này.')
  if (feedback.jobId !== jobId || feedback.feedbackId !== feedbackId) throw new Error('Phản hồi không khớp phiên dựng.')
  return feedback
}

// [TINIX] Publishing results is local-only. The web tool cannot write a Codex result.
export async function writeFeedbackResult(root, jobId, feedbackId, summary) {
  await readFeedback(root, jobId, feedbackId)
  const result = { jobId, feedbackId, reviewedAt: new Date().toISOString(), summary: validatedText(summary) }
  await writeJson(path.join(feedbackFolder(root, jobId, feedbackId), 'result.json'), result)
  return result
}

export async function handleFeedbackTool(root, name, args = {}) {
  if (name === 'submit_material_feedback') return submitFeedback(root, args)
  const { job_id: jobId, feedback_id: feedbackId } = args
  const feedback = await readFeedback(root, jobId, feedbackId)
  const result = await readJson(path.join(feedbackFolder(root, jobId, feedbackId), 'result.json'), '').catch(error => {
    if (error.cause?.code === 'ENOENT') return null
    throw error
  })
  if (result && (result.jobId !== jobId || result.feedbackId !== feedbackId)) throw new Error('Kết quả không khớp phiên dựng.')
  return { ...feedback, status: result ? 'reviewed' : 'pending', result }
}
