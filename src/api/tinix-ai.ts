/**
 * [TINIX] Client for the TinixPoster AI routes (service/src/tinix/ai/routes.ts).
 * The axios wrapper returns `result` on code 200, the whole body ({ code, msg }) otherwise.
 */
import fetch from '@/utils/axios'

const slow = { _noLoading: true }
const long = { timeout: 120000 }

export type TFontClass = { id: number; alias: string; value: string; url: string }
export type TSuggestPart = { text: string; fontFamily: string; fontClass: TFontClass | null; weight: number; italic: boolean; uppercase: boolean }
export type TSuggestOption = {
  styleName: string
  regionIndex: number
  align: 'left' | 'center' | 'right'
  palette: { primary: string; secondary: string }
  parts: Partial<Record<'title' | 'subtitle' | 'body' | 'hashtag' | 'signature', TSuggestPart>>
  translationVi: string
}
export type TRegion = { x: number; y: number; w: number; h: number; tone: 'dark' | 'light' }
export type TSuggestResult = { scene: string; emptyRegions: TRegion[]; options: TSuggestOption[]; jobId: number; model: string }
export type TRewriteResult = { options: Array<{ styleName: string; replacements: Array<{ uuid: string; text: string }>; translationVi: string }>; jobId: number; model: string }
export type TFontCandidate = TFontClass & { category: string; tags: string[]; score: number; supports_vietnamese: boolean }
export type TFindFontResult = {
  items: Array<{ text: string; category: string; traits: string[]; suspected: string[]; candidates: TFontCandidate[]; notInLibrary: string[] }>
  jobId: number
  model: string
}
export type TAiSettings = {
  vision_model: string
  studio_name: string
  price_in_per_1m: number
  price_out_per_1m: number
  monthly_limit_vnd: number
  price_per_image_vnd: number
  logo_url: string // [TINIX] logo studio
  logo_corner: string // tl | tr | bl | br | bc
  logo_auto: boolean
  base?: { enabled: boolean; has_key: boolean; base_url: string; text_model: string }
}

type TErr = { code?: number; msg?: string }
export const isErr = (r: any): r is TErr => !!r && typeof r === 'object' && typeof r.code === 'number' && r.code !== 200

export const suggestText = (p: { image: string; width: number; height: number; lang: string }) => fetch<TSuggestResult | TErr>('api/tinix/ai/suggest-text', { ...p, ...slow }, 'post', {}, long)
export const rewriteText = (p: { image: string; layers: Array<{ uuid: string; text: string }>; lang: string }) => fetch<TRewriteResult | TErr>('api/tinix/ai/rewrite-text', { ...p, ...slow }, 'post', {}, long)
export const findFont = (p: { image: string }) => fetch<TFindFontResult | TErr>('api/tinix/ai/find-font', { ...p, ...slow }, 'post', {}, long)
export const rebuild = (p: { reference: string; photo?: string; lang: string; mode?: 'faithful' | 'creative' }) => fetch<any>('api/tinix/ai/rebuild', { ...p, ...slow }, 'post', {}, { timeout: 180000 })
export const tagFonts = (p: { all?: boolean; mode?: 'vision'; limit?: number; ids?: number[] } = {}) => // [TINIX] mode:'vision' = nhìn ảnh xem trước
   fetch<any>('api/tinix/ai/tag-fonts', { ...p, ...slow }, 'post', {}, long)
export const getJobs = (p: { limit?: number; kind?: string } = {}) => fetch<{ list: any[] } | TErr>('api/tinix/ai/jobs', p, 'get')
export const getUsage = (p: { month?: string } = {}) => fetch<{ month: string; jobs: number; cost_vnd: number; limit_vnd: number } | TErr>('api/tinix/ai/usage', p, 'get')
/** [TINIX] Admin còn dùng mật khẩu mặc định? */
export const securityStatus = () => fetch<{ is_admin: boolean; default_password: boolean } | TErr>('api/tinix/security/status', {}, 'get')
export const getSettings = () => fetch<TAiSettings | TErr>('api/tinix/ai/settings', {}, 'get')
export const saveSettings = (p: Partial<TAiSettings>) => fetch<TAiSettings | TErr>('api/tinix/ai/settings', p, 'post')
