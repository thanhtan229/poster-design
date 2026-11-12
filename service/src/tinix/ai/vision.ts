/**
 * [TINIX] Every TinixPoster AI call goes through here (see CLAUDE.md).
 *
 * - images are resized server-side (long edge 1024px, JPEG 80) → cheaper & faster
 * - OpenAI-compatible /chat/completions with image_url content parts
 * - the answer must be JSON: we extract it (code fences / leading text tolerated),
 *   validate with a small hand-written validator (zod does not compile under the
 *   service's TypeScript 3.9), retry once, then fail with a clear message
 * - every call is logged in ai_jobs (tokens + estimated cost)
 */
import axios from '../../utils/http'
import { getAiSettings } from '../../db/settings'
import { getTinixAiSettings } from './settings'
import { logJob, assertWithinMonthlyLimit, AiJobKind } from './cost-log'
const sharp = require('sharp')

export class AiUserError extends Error {}

export type Validator<T> = (value: any) => T // throws Error with a readable message when invalid

/** Accepts a data URL or bare base64; returns a JPEG data URL with the long edge ≤ maxEdge. */
export async function prepareImage(input: string, maxEdge = 1024): Promise<string> {
  const base64 = String(input || '').replace(/^data:[^;]+;base64,/, '')
  if (!base64) throw new AiUserError('Thiếu ảnh gửi lên')
  const buf = Buffer.from(base64, 'base64')
  if (buf.length > 25 * 1024 * 1024) throw new AiUserError('Ảnh quá lớn (tối đa 25 MB)')
  const out: Buffer = await sharp(buf).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}

/** [TINIX] Pixel size of a data URL image (used to turn pixel boxes the model sometimes returns into 0..1 ratios). */
export async function imageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  try {
    const base64 = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '')
    const meta = await sharp(Buffer.from(base64, 'base64')).metadata()
    return meta.width && meta.height ? { w: meta.width, h: meta.height } : null
  } catch (e) {
    return null
  }
}

/** Pull the first JSON object/array out of a model answer. */
export function extractJson(text: string): any {
  const s = String(text || '').trim()
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : s
  const start = body.search(/[{[]/)
  if (start < 0) throw new Error('AI không trả về JSON')
  const open = body[start]
  const close = open === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error('JSON trả về bị cắt cụt')
  return JSON.parse(body.slice(start, end + 1))
}

function apiError(e: any): string {
  let data = e && e.response && e.response.data
  if (Array.isArray(data)) data = data[0] // Gemini's OpenAI endpoint returns errors as [{ error: {...} }]
  const status = e && e.response && e.response.status
  const detail = (data && ((data.error && data.error.message) || data.message || data.msg)) || ''
  const msg = String(detail || (e && e.message) || 'Lỗi không xác định').slice(0, 300)
  // [TINIX] 429 = hết hạn mức (gói miễn phí hay gặp): nói rõ để người dùng biết chờ hoặc đổi gói
  // 429 có thể là hết hạn mức HOẶC dịch vụ đang quá tải (gói miễn phí hay gặp): không đoán, chỉ gợi ý cách kiểm tra
  if (status === 429) return msg + ' — (lỗi 429: có thể đã vượt hạn mức hoặc dịch vụ đang quá tải. Chờ vài phút rồi thử lại; nếu vẫn lỗi, kiểm tra hạn mức trong trang quản lý của nhà cung cấp.)'
  return msg
}

// ───────── [TINIX] Tự thử lại khi nhà cung cấp quá tải + gợi ý khi model bị ngừng ─────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const TRANSIENT_STATUS = [429, 500, 502, 503, 504]
const NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE']
/** Hết hạn mức / hết tiền: thử lại vô ích */
const QUOTA_RE = /insufficient_quota|exceeded your current quota|check your plan|billing|out of credit|balance/i
/** Model bị ngừng / sai tên */
const MODEL_RE = /model_not_found|(model.{0,60}(deprecated|no longer available|does not exist|not found|unknown|not supported|unsupported))|((deprecated|no longer available|does not exist|not found|unknown|not supported|unsupported).{0,60}model)/i

/** Chờ bao lâu (ms) trước lần thử lại thứ `retry` (0, 1…); null = không thử lại. Có thể ép bằng TINIX_AI_RETRY_DELAYS_MS="20,20" (dùng khi tự kiểm tra). */
function retryDelayMs(e: any, retry: number): number | null {
  const status = e && e.response && e.response.status
  const transient = (status && TRANSIENT_STATUS.indexOf(status) >= 0) || (!(e && e.response) && e && e.code && NETWORK_CODES.indexOf(e.code) >= 0)
  if (!transient) return null
  if (status === 429 && QUOTA_RE.test(apiError(e))) return null
  const forced = process.env.TINIX_AI_RETRY_DELAYS_MS
  if (forced) return Number(forced.split(',')[retry]) || 10
  const ra = Number(e.response && e.response.headers && e.response.headers['retry-after'])
  return Math.min(20000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : [3000, 8000][retry])
}

/** Gọi một request, tự thử lại tối đa 2 lần với lỗi tạm thời (429 quá tải, 5xx, mạng). Gắn `__retries` vào lỗi cuối. */
export async function postWithRetry(doPost: () => Promise<any>): Promise<any> {
  for (let retry = 0; ; retry++) {
    try {
      return await doPost()
    } catch (e) {
      const wait = retry < 2 ? retryDelayMs(e, retry) : null
      if (wait === null) {
        if (e && typeof e === 'object') (e as any).__retries = retry
        throw e
      }
      console.warn(`[tinix:ai] lỗi tạm thời (${(e as any).response ? (e as any).response.status : (e as any).code}), thử lại sau ${wait}ms (lần ${retry + 1})`)
      await sleep(wait)
    }
  }
}

/** Gợi ý khi lỗi nhà cung cấp cho thấy model bị ngừng hoặc sai tên; rỗng nếu không phải. */
export function modelErrorHint(msg: string, model: string, where: string): string {
  if (!MODEL_RE.test(String(msg || ''))) return ''
  return ` → Model "${model}" có thể đã bị ngừng hoặc sai tên. Hãy đổi ${where} sang tên model hiện hành (xem trang model của nhà cung cấp).`
}

export type VisionCall<T> = {
  kind: AiJobKind
  system: string
  text: string
  images?: string[] // data URLs (already prepared) — empty for text-only calls
  validate: Validator<T>
  inputSummary?: any
  temperature?: number
  useTextModel?: boolean // text-only tasks (e.g. tag fonts) can use the cheaper text model
  timeoutMs?: number
}

export async function callVisionJSON<T>(call: VisionCall<T>): Promise<{ data: T; jobId: number; model: string }> {
  const base = getAiSettings()
  if (!base.enabled) throw new AiUserError('AI đang tắt. Bật AI trong trang Quản trị → cấu hình AI.')
  if (!base.api_key) throw new AiUserError('Chưa có API key. Nhập API key trong trang Quản trị → cấu hình AI.')
  assertWithinMonthlyLimit()
  const tinix = getTinixAiSettings()
  const model = call.useTextModel || !(call.images && call.images.length) ? base.text_model : tinix.vision_model

  const userContent: any[] = [{ type: 'text', text: call.text }]
  for (const url of call.images || []) userContent.push({ type: 'image_url', image_url: { url } })

  let tokensIn = 0, tokensOut = 0, lastErr = '', lastRaw = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: any[] = [
      { role: 'system', content: call.system },
      { role: 'user', content: userContent },
    ]
    if (attempt > 0) messages.push({ role: 'user', content: `Câu trả lời trước không hợp lệ (${lastErr}). Chỉ trả về đúng MỘT đối tượng JSON theo yêu cầu, không thêm chữ nào khác.` })
    try {
      // [TINIX] một số model (vd gpt-6-luna) chỉ nhận temperature mặc định: nếu bị từ chối thì gọi lại không gửi temperature
      const send = (withTemp: boolean) =>
        axios.post(
          `${base.base_url}/chat/completions`,
          withTemp ? { model, temperature: call.temperature ?? 0.8, messages } : { model, messages },
          { headers: { Authorization: `Bearer ${base.api_key}` }, timeout: call.timeoutMs || 90000 },
        )
      let body: any
      try {
        body = await postWithRetry(() => send(true))
      } catch (err) {
        if (err && err.response && /temperature/i.test(apiError(err)) && /default|only|unsupported/i.test(apiError(err))) body = await postWithRetry(() => send(false))
        else throw err
      }
      tokensIn += Number(body?.usage?.prompt_tokens) || 0
      tokensOut += Number(body?.usage?.completion_tokens) || 0
      lastRaw = String(body?.choices?.[0]?.message?.content ?? '')
      const data = call.validate(extractJson(lastRaw))
      const jobId = logJob({ kind: call.kind, input: call.inputSummary, output: data, model, tokensIn, tokensOut, status: 'ok' })
      return { data, jobId, model }
    } catch (e) {
      if (e && e.response) {
        // HTTP error from the provider: no point retrying with the same request
        const msg = apiError(e)
        const retried = e.__retries ? ` (đã tự thử lại ${e.__retries} lần)` : ''
        const isVision = !!(call.images && call.images.length) && !call.useTextModel
        const hint = modelErrorHint(msg, model, isVision ? 'Model nhìn ảnh (Trợ lý AI → Cài đặt)' : 'Model chữ (Quản trị → Thiết lập AI)')
        logJob({ kind: call.kind, input: call.inputSummary, model, tokensIn, tokensOut, status: 'error', error: msg + retried })
        throw new AiUserError(`Nhà cung cấp AI báo lỗi: ${msg}${retried}${hint}`)
      }
      if (e && e.code === 'ECONNABORTED') {
        logJob({ kind: call.kind, input: call.inputSummary, model, tokensIn, tokensOut, status: 'error', error: 'timeout' })
        throw new AiUserError('AI phản hồi quá lâu, hãy thử lại.')
      }
      lastErr = (e && e.message) || String(e)
    }
  }
  logJob({ kind: call.kind, input: call.inputSummary, output: { raw: lastRaw.slice(0, 4000) }, model, tokensIn, tokensOut, status: 'error', error: lastErr })
  throw new AiUserError(`AI trả về dữ liệu không đúng định dạng (${lastErr}). Thử lại, hoặc đổi model nhìn ảnh trong Cài đặt AI.`)
}
