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
  }
}

export function saveTinixAiSettings(input: Partial<TinixAiSettings>): TinixAiSettings {
  if (typeof input.vision_model === 'string') setSetting('tinix_vision_model', input.vision_model.trim().slice(0, 100))
  if (typeof input.studio_name === 'string') setSetting('tinix_studio_name', input.studio_name.trim().slice(0, 80))
  if (input.price_in_per_1m !== undefined) setSetting('tinix_price_in_per_1m', String(num(input.price_in_per_1m)))
  if (input.price_out_per_1m !== undefined) setSetting('tinix_price_out_per_1m', String(num(input.price_out_per_1m)))
  if (input.monthly_limit_vnd !== undefined) setSetting('tinix_monthly_limit_vnd', String(num(input.monthly_limit_vnd)))
  return getTinixAiSettings()
}
