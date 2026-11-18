// [TINIX] Mẫu chỉ lưu BỐ CỤC: ảnh tải lên (ảnh khách, ảnh tách nền, ảnh có viền sticker) không đi vào mẫu.
// Khi lưu mẫu, mỗi lớp ảnh dùng ảnh tải lên giữ nguyên vị trí/kích thước/góc xoay/hiệu ứng nhưng đổi ảnh bên trong
// thành ảnh giữ chỗ (SVG nhúng, không tạo tệp) và được đánh dấu là khung ảnh:
//   - ảnh thường  → "khung ảnh" (ô xám có biểu tượng ảnh), templateRole 'photo'
//   - ảnh tách nền (có/không viền) → "khung tách nền" (viền nét đứt, biểu tượng người, ghi bề dày viền),
//     templateRole 'subject' + templateBorderMm để sau này biết cần tách nền và thêm viền bao nhiêu mm.
// Ảnh thư viện (Chất liệu, ảnh của mẫu/mẫu cắt dán, ảnh ★, SVG nhúng, ảnh AI) được giữ nguyên — trừ hình người
// tách nền do công cụ dòng lệnh dựng (/static/collage/…/hero-*.png), vẫn là ảnh khách.
// Chỉ đổi BẢN SAO dữ liệu dùng để lưu mẫu; trang đang mở trên canvas không bị đụng tới.
import i18n from '@/languages'

export type SanitizeReport = { photos: number; subjects: number; background: number }

const t = (k: string, p?: any): string => i18n.global.t(k, p) as string

/** Ảnh tải lên (không thuộc thư viện): dải ảnh dự án/kho chung, ảnh tải lên, ảnh tách nền, blob tạm. */
export function isUploadUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false
  if (url.startsWith('blob:')) return true
  const path = url.replace(/^https?:\/\/[^/]+/i, '')
  return /^\/static\/(photos|user|cutouts)\//.test(path)
}

/**
 * Hình người tách nền do công cụ dòng lệnh dựng mẫu cắt dán tạo (`kit.hero` trong scripts/lib/collage-kit.mjs):
 * ảnh khách đã tách nền + viền trắng gộp sẵn, lưu cùng ảnh của mẫu ở /static/collage/<mẫu>/hero-<id>.png.
 * Nằm trong thư mục ảnh mẫu nhưng vẫn là ảnh khách → cũng thành khung tách nền.
 */
export function isCliHeroUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0]
  return /^\/static\/collage\/.+\/hero-[^/]+\.(png|webp)$/i.test(path)
}

function isSubject(w: any): boolean {
  return !!(w.stickerBorder || w.cutoutEdit || w.cutoutBorderUrl || /\/static\/cutouts\//.test(String(w.imgUrl || '')) || isCliHeroUrl(w.imgUrl))
}

/** Bề dày viền trắng (mm): số đo của app nếu có; hình người dựng bằng dòng lệnh thì suy từ cutInset (= nửa viền, px trang). */
function borderMmOf(w: any, dpi: number): number {
  let mm = Number((w.stickerBorder && w.stickerBorder.mm) || (w.cutoutEdit && w.cutoutEdit.mm) || 0)
  if (!(mm > 0) && Number(w.cutInset) > 0) mm = (Number(w.cutInset) * 2 * 25.4) / (dpi > 0 ? dpi : 300)
  return Number.isFinite(mm) && mm > 0 ? Math.round(mm * 10) / 10 : 0
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Kích thước khung vẽ ảnh giữ chỗ theo đúng tỉ lệ lớp ảnh (cạnh dài 600) để không bị méo. */
function box(w: any) {
  const W = Math.max(1, Number(w.width) || 1)
  const H = Math.max(1, Number(w.height) || 1)
  const k = 600 / Math.max(W, H)
  return { w: Math.max(40, Math.round(W * k)), h: Math.max(40, Math.round(H * k)) }
}

function dataUri(svg: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** Ảnh giữ chỗ của khung ảnh thường: ô xám nhạt, biểu tượng núi + mặt trời ở giữa. */
export function photoPlaceholder(w: any): string {
  const { w: W, h: H } = box(w)
  const s = Math.min(W, H) * 0.32
  const x = (W - s) / 2
  const y = (H - s * 0.8) / 2
  const sw = Math.max(2, s * 0.06)
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
      `<rect width="${W}" height="${H}" fill="#e8ecf1"/>` +
      `<rect x="${x}" y="${y}" width="${s}" height="${s * 0.8}" rx="${s * 0.08}" fill="none" stroke="#9aa5b1" stroke-width="${sw}"/>` +
      `<circle cx="${x + s * 0.7}" cy="${y + s * 0.25}" r="${s * 0.09}" fill="#9aa5b1"/>` +
      `<path d="M${x + s * 0.08} ${y + s * 0.72} L${x + s * 0.38} ${y + s * 0.38} L${x + s * 0.58} ${y + s * 0.58} L${x + s * 0.72} ${y + s * 0.46} L${x + s * 0.92} ${y + s * 0.72} Z" fill="#9aa5b1"/>` +
      `</svg>`,
  )
}

/** Ảnh giữ chỗ của khung tách nền: viền nét đứt, biểu tượng người, chữ "Tách nền · viền n mm". */
export function subjectPlaceholder(w: any, mm: number): string {
  const { w: W, h: H } = box(w)
  const m = Math.min(W, H)
  const sw = Math.max(2, m * 0.012)
  const cx = W / 2
  const head = m * 0.09
  const top = H / 2 - m * 0.22
  const label = mm > 0 ? t('tinix.ui.templateSave.subject_label_mm', { mm }) : t('tinix.ui.templateSave.subject_label')
  const fs = Math.max(12, m * 0.06)
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
      `<rect x="${sw}" y="${sw}" width="${W - sw * 2}" height="${H - sw * 2}" rx="${m * 0.04}" fill="#f4f1fe" fill-opacity="0.85" stroke="#7c6cf0" stroke-width="${sw}" stroke-dasharray="${sw * 4} ${sw * 3}"/>` +
      `<circle cx="${cx}" cy="${top + head}" r="${head}" fill="#a99ff5"/>` +
      `<path d="M${cx - m * 0.17} ${top + head * 2 + m * 0.24} Q${cx - m * 0.17} ${top + head * 2 + m * 0.03} ${cx} ${top + head * 2 + m * 0.03} Q${cx + m * 0.17} ${top + head * 2 + m * 0.03} ${cx + m * 0.17} ${top + head * 2 + m * 0.24} Z" fill="#a99ff5"/>` +
      `<text x="${cx}" y="${top + head * 2 + m * 0.24 + fs * 1.6}" font-family="Arial, sans-serif" font-size="${fs}" fill="#5b4bd6" text-anchor="middle">${esc(label)}</text>` +
      `</svg>`,
  )
}

const DROP = ['origin', 'stickerBorder', 'cutoutEdit', 'cutoutBorderUrl', 'cutInset', 'printInset', 'imgRotate', 'cropEdit']

/** Đổi một lớp ảnh dùng ảnh tải lên thành khung trống (sửa trực tiếp trên bản sao). Trả về loại khung hoặc null. */
function blankImage(w: any, dpi: number): 'photo' | 'subject' | null {
  if (!w || w.type !== 'w-image') return null
  const urls = [w.imgUrl, w.origin && w.origin.original, w.stickerBorder && w.stickerBorder.baseUrl, w.cutoutBorderUrl]
  if (!urls.some(isUploadUrl) && !isCliHeroUrl(w.imgUrl)) return null
  const subject = isSubject(w)
  const mm = subject ? borderMmOf(w, dpi) : 0
  for (const k of DROP) delete w[k]
  w.imgUrl = subject ? subjectPlaceholder(w, mm) : photoPlaceholder(w)
  w.fit = 'cover'
  w.cropX = 50
  w.cropY = 50
  w.zoom = 1
  if (w.linkedPhotoId) return subject ? 'subject' : 'photo' // nền liên kết: theo khung chính, không thành khung riêng
  w.slot = true
  w.templateRole = subject ? 'subject' : 'photo'
  if (subject) w.templateBorderMm = mm
  else delete w.templateBorderMm
  return subject ? 'subject' : 'photo'
}

/** Làm sạch một trang { global, layers } (bản sao). */
function sanitizePage(page: any, report: SanitizeReport) {
  if (page && page.global && isUploadUrl(page.global.backgroundImage)) {
    page.global.backgroundImage = ''
    report.background++
  }
  const dpi = Number(page && page.global && page.global.dpi) || 300
  for (const w of (page && page.layers) || []) {
    const kind = blankImage(w, dpi)
    if (kind === 'photo') report.photos++
    else if (kind === 'subject') report.subjects++
  }
}

/** Làm sạch danh sách trang dùng để lưu mẫu. Không đụng tới dữ liệu gốc truyền vào. */
export function sanitizeLayoutsForTemplate(layouts: any[]): { layouts: any[]; report: SanitizeReport } {
  const copy = JSON.parse(JSON.stringify(layouts || []))
  const report: SanitizeReport = { photos: 0, subjects: 0, background: 0 }
  for (const page of copy) sanitizePage(page, report)
  return { layouts: copy, report }
}

/** Câu tóm tắt cho thông báo sau khi lưu ('' khi không có gì bị để trống). */
export function describeReport(r: SanitizeReport): string {
  const parts: string[] = []
  if (r.photos) parts.push(t('tinix.ui.templateSave.blank_photos', { n: r.photos }))
  if (r.subjects) parts.push(t('tinix.ui.templateSave.blank_subjects', { n: r.subjects }))
  if (r.background) parts.push(t('tinix.ui.templateSave.blank_background'))
  return parts.length ? t('tinix.ui.templateSave.blank_summary', { list: parts.join(', ') }) : ''
}
