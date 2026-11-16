/**
 * [TINIX] Logo mặc định của studio: dựng widget ảnh đặt ở góc trang theo cài đặt (Trợ lý AI → Cài đặt).
 */
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { getImage } from '@/common/methods/getImgDetail'
import * as tinixAi from '@/api/tinix-ai'
import i18n from '@/languages'

export const LOGO_LAYER_NAME = 'Logo'
export const LOGO_CORNERS = ['tl', 'tr', 'bl', 'br', 'bc'] as const

/** Tạo widget logo: rộng ~16% cạnh ngắn của trang, cách mép ~4%. Trả về null nếu chưa cấu hình/không tải được ảnh. */
export async function buildLogoWidget(page: { width: number; height: number }, s: { logo_url: string; logo_corner: string }): Promise<any | null> {
  if (!s.logo_url) return null
  const img = await getImage(s.logo_url)
  if (!img.naturalWidth || !img.naturalHeight) return null
  const short = Math.min(page.width, page.height)
  const width = Math.round(short * 0.16)
  const height = Math.round((width * img.naturalHeight) / img.naturalWidth)
  const m = Math.round(short * 0.04)
  const left = s.logo_corner === 'tl' || s.logo_corner === 'bl' ? m : s.logo_corner === 'bc' ? Math.round((page.width - width) / 2) : page.width - width - m
  const top = s.logo_corner === 'tl' || s.logo_corner === 'tr' ? m : page.height - height - m
  const w = JSON.parse(JSON.stringify(wImageSetting))
  Object.assign(w, { name: LOGO_LAYER_NAME, layerName: LOGO_LAYER_NAME, imgUrl: s.logo_url, left, top, width, height })
  w.record = { ...(w.record || {}), width, height }
  return w
}

/**
 * Chèn logo studio vào trang hiện tại. `onlyIfAuto`: chỉ khi cài đặt bật "tự chèn".
 * Không chèn lần hai nếu trang đã có lớp logo. Trả về 'added' | 'exists' | 'none' (chưa có logo/không bật).
 */
export async function insertStudioLogo(widgetStore: any, page: { width: number; height: number }, onlyIfAuto = false): Promise<'added' | 'exists' | 'none'> {
  const s: any = await tinixAi.getSettings()
  if (tinixAi.isErr(s) || !s.logo_url || (onlyIfAuto && !s.logo_auto)) return 'none'
  if ((widgetStore.dWidgets || []).some((x: any) => x.layerName === LOGO_LAYER_NAME)) return 'exists'
  const w = await buildLogoWidget(page, s)
  if (!w) return 'none'
  widgetStore.addWidget(w)
  return 'added'
}

export const logoText = (k: string, p?: any): string => i18n.global.t('tinix.ui.logo.' + k, p) as string
