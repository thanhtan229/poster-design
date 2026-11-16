/**
 * [TINIX] Extra AI settings for TinixPoster, stored in the original `ai_settings`
 * key/value table (prefix `tinix_`). The API key / base URL / text model stay in the
 * original admin page (db/settings.ts getAiSettings).
 */
import { getSetting, setSetting, getAiSettings, DEFAULT_AI_BASE_URL } from '../../db/settings'

export type TinixAiSettings = {
  vision_model: string
  studio_name: string
  price_in_per_1m: number // VND per 1M input tokens
  price_out_per_1m: number // VND per 1M output tokens
  monthly_limit_vnd: number // 0 = no limit
  price_per_image_vnd: number // VND per generated image (0 = estimate from tokens)
  logo_url: string // logo studio ('' = chưa có): đường dẫn /static/... hoặc http(s)
  logo_corner: string // tl | tr | bl | br | bc
  logo_auto: boolean // tự chèn logo khi đặt gợi ý chữ
}

const CORNERS = ['tl', 'tr', 'bl', 'br', 'bc']
const cleanLogoUrl = (v: any) => {
  const s = typeof v === 'string' ? v.trim().slice(0, 300) : ''
  return /^(\/static\/|https?:\/\/)/.test(s) ? s : ''
}

const num = (v: any, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : def
}

/** Default vision model: Zhipu's free GLM-4V when using the default endpoint, else the text model. */
export function defaultVisionModel(): string {
  const base = getAiSettings().base_url || DEFAULT_AI_BASE_URL
  return base.includes('bigmodel.cn') ? 'glm-4v-flash' : getAiSettings().text_model
}

export function getTinixAiSettings(): TinixAiSettings {
  return {
    vision_model: (getSetting('tinix_vision_model') || '').trim() || defaultVisionModel(),
    studio_name: (getSetting('tinix_studio_name') || '').trim(),
    price_in_per_1m: num(getSetting('tinix_price_in_per_1m')),
    price_out_per_1m: num(getSetting('tinix_price_out_per_1m')),
    monthly_limit_vnd: num(getSetting('tinix_monthly_limit_vnd')),
    price_per_image_vnd: num(getSetting('tinix_price_per_image_vnd')),
    logo_url: cleanLogoUrl(getSetting('tinix_logo_url')),
    logo_corner: CORNERS.indexOf(getSetting('tinix_logo_corner') || '') >= 0 ? (getSetting('tinix_logo_corner') as string) : 'br',
    logo_auto: getSetting('tinix_logo_auto') === '1',
  }
}

export function saveTinixAiSettings(input: Partial<TinixAiSettings>): TinixAiSettings {
  if (typeof input.vision_model === 'string') setSetting('tinix_vision_model', input.vision_model.trim().slice(0, 100))
  if (typeof input.studio_name === 'string') setSetting('tinix_studio_name', input.studio_name.trim().slice(0, 80))
  if (input.price_in_per_1m !== undefined) setSetting('tinix_price_in_per_1m', String(num(input.price_in_per_1m)))
  if (input.price_out_per_1m !== undefined) setSetting('tinix_price_out_per_1m', String(num(input.price_out_per_1m)))
  if (input.monthly_limit_vnd !== undefined) setSetting('tinix_monthly_limit_vnd', String(num(input.monthly_limit_vnd)))
  if (input.price_per_image_vnd !== undefined) setSetting('tinix_price_per_image_vnd', String(num(input.price_per_image_vnd)))
  if (input.logo_url !== undefined) setSetting('tinix_logo_url', cleanLogoUrl(input.logo_url))
  if (typeof input.logo_corner === 'string' && CORNERS.indexOf(input.logo_corner) >= 0) setSetting('tinix_logo_corner', input.logo_corner)
  if (input.logo_auto !== undefined) setSetting('tinix_logo_auto', input.logo_auto ? '1' : '0')
  return getTinixAiSettings()
}
