// [TINIX] Lưu mẫu từ menu Tệp: "Lưu đè mẫu" (khi trang mở từ một mẫu) và "Lưu thành mẫu mới".
// Nhớ trang trên canvas được mở từ mẫu nào (mẫu thường hay mẫu cắt dán) để lưu đè đúng chỗ.
// Mẫu chỉ lưu bố cục: ảnh tải lên (ảnh khách, tách nền, viền sticker) thành khung trống — xem template-sanitize.ts.
// Tên mẫu mới do service tự đặt theo mã số ("Mẫu 64"); lưu đè dùng tên ở ô tên thanh trên (rỗng = giữ tên cũ).
import { ref } from 'vue'
import i18n from '@/languages'
import config from '@/config'
import * as adminApi from '@/api/admin'
import { useCanvasStore, useWidgetStore } from '@/store'
import useNotification from '@/common/methods/notification'
import { describeReport, sanitizeLayoutsForTemplate, type SanitizeReport } from './template-sanitize'

export type TemplateSource = { kind: 'collage' | 'normal'; id: number; name: string; version?: number }

/** Mẫu đang mở trên canvas; null khi trang không đến từ mẫu nào (dự án mới, mở tệp). */
export const templateSource = ref<TemplateSource | null>(null)

const t = (k: string, p?: any): string => i18n.global.t(k, p) as string

export function setTemplateSource(src: TemplateSource | null) {
  templateSource.value = src
}

/** Khóa localStorage để các tab khác (thư viện ở tab chính) biết mẫu vừa đổi và tải lại danh sách. */
export const TEMPLATES_CHANGED_KEY = 'tinix.templatesChangedAt'

function changed() {
  window.dispatchEvent(new Event('tinix:templates-changed')) // làm mới danh sách mẫu ở cả hai thư viện (tab này)
  try {
    localStorage.setItem(TEMPLATES_CHANGED_KEY, String(Date.now())) // sự kiện 'storage' báo cho tab khác
  } catch (_) {
    /* bỏ qua */
  }
}

/** Dữ liệu sẽ lưu thành mẫu (đã làm sạch ảnh tải lên). Mẫu cắt dán = trang đang mở; mẫu thường = mọi trang. */
function templateData(kind: 'collage' | 'normal'): { body: any; report: SanitizeReport } {
  const canvas = useCanvasStore()
  const widgets = useWidgetStore()
  if (kind === 'collage') {
    const { layouts, report } = sanitizeLayoutsForTemplate([{ global: canvas.dPage, layers: widgets.dWidgets }])
    return { body: layouts[0], report }
  }
  const { layouts, report } = sanitizeLayoutsForTemplate(widgets.dLayouts)
  return { body: layouts, report }
}

async function postCollage(body: Record<string, any>): Promise<{ id: number; version: number; name: string }> {
  const r = await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.message)
  return data
}

/** Loại mẫu khi lưu mới: theo mẫu đang mở, nếu không có thì theo trang (trang cắt dán có page.collage). */
function newKind(): 'collage' | 'normal' {
  if (templateSource.value) return templateSource.value.kind
  return (useCanvasStore().dPage as any).collage ? 'collage' : 'normal'
}

function pageSize() {
  const page = useCanvasStore().dPage
  return { width: Number(page.width), height: Number(page.height) }
}

export async function saveAsNewTemplate(): Promise<boolean> {
  try {
    const kind = newKind()
    const { body, report } = templateData(kind)
    let src: TemplateSource
    if (kind === 'collage') {
      const r = await postCollage({ layout: body })
      src = { kind, id: r.id, name: r.name, version: r.version }
    } else {
      const { id } = await adminApi.saveTemplate({ title: '', type: 0, data: JSON.stringify(body), ...pageSize() })
      src = { kind, id: Number(id), name: t('tinix.ui.templateSave.auto_name', { id }) }
    }
    templateSource.value = src // các lần "Lưu đè" sau ghi vào mẫu vừa tạo
    // đánh dấu "vừa dùng" để mẫu mới nằm đầu thư viện (danh sách xếp theo lần dùng gần nhất)
    await fetch(`${config.SCREEN_URL}/api/tinix/template-used`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id: src.id }) }).catch(() => undefined)
    changed()
    useNotification(t('tinix.ui.templateSave.saved_new', { name: src.name }), [describeReport(report), t('tinix.ui.templateSave.saved_new_body')].filter(Boolean).join(' '))
    return true
  } catch (e: any) {
    useNotification(t('tinix.ui.templateSave.failed'), e?.msg || e?.message || '', { type: 'error' })
    return false
  }
}

/** Lưu đè mẫu mà trang được mở từ đó. `name`: ô tên ở thanh trên (rỗng = giữ tên cũ). */
export async function overwriteTemplate(name: string): Promise<boolean> {
  const src = templateSource.value
  if (!src) return false
  try {
    const { body, report } = templateData(src.kind)
    const finalName = name.trim() || src.name
    if (src.kind === 'collage') {
      const r = await postCollage({ id: src.id, version: src.version, name: finalName, layout: body })
      templateSource.value = { ...src, name: r.name, version: r.version }
    } else {
      await adminApi.saveTemplate({ id: src.id, title: finalName, type: 0, data: JSON.stringify(body), ...pageSize() })
      templateSource.value = { ...src, name: finalName }
    }
    changed()
    useNotification(t('tinix.ui.templateSave.saved_over', { name: templateSource.value.name }), describeReport(report))
    return true
  } catch (e: any) {
    useNotification(t('tinix.ui.templateSave.failed'), e?.msg || e?.message || '', { type: 'error' })
    return false
  }
}
