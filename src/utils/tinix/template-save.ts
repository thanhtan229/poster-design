// [TINIX] Lưu mẫu từ menu Tệp: "Lưu đè mẫu" (chỉ khi đang ở chế độ Sửa mẫu) và "Lưu thành mẫu mới".
// Nhớ trang trên canvas được mở từ mẫu nào (mẫu thường hay mẫu cắt dán) để lưu đè đúng chỗ.
// Tên mẫu mới do service tự đặt theo mã số ("Mẫu 64"); đổi tên bằng ô tên ở thanh trên khi Sửa rồi Lưu đè.
import { ref } from 'vue'
import i18n from '@/languages'
import config from '@/config'
import * as adminApi from '@/api/admin'
import { useCanvasStore, useWidgetStore } from '@/store'
import useNotification from '@/common/methods/notification'

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

/** Trang hiện tại thành bố cục mẫu cắt dán { global, layers } (chỉ trang đang mở). */
function collageLayout() {
  return { global: JSON.parse(JSON.stringify(useCanvasStore().dPage)), layers: JSON.parse(JSON.stringify(useWidgetStore().dWidgets)) }
}

async function postCollage(body: Record<string, any>): Promise<{ id: number; version: number; name: string }> {
  const r = await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.message)
  return data
}

/** Tải một mẫu cắt dán để sửa (tab Sửa mẫu mở bằng ?ctemplate=<id>). */
export async function fetchCollageTemplate(id: number): Promise<{ id: number; name: string; version: number; data: any }> {
  const r = await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates/${id}`)
  const data = await r.json()
  if (!r.ok) throw new Error(data.message)
  return data
}

/** Loại mẫu khi lưu mới: theo mẫu đang mở, nếu không có thì theo trang (trang cắt dán có page.collage). */
function newKind(): 'collage' | 'normal' {
  if (templateSource.value) return templateSource.value.kind
  return (useCanvasStore().dPage as any).collage ? 'collage' : 'normal'
}

export async function saveAsNewTemplate(): Promise<boolean> {
  try {
    const kind = newKind()
    let src: TemplateSource
    if (kind === 'collage') {
      const r = await postCollage({ layout: collageLayout() })
      src = { kind, id: r.id, name: r.name, version: r.version }
    } else {
      const page = useCanvasStore().dPage
      const { id } = await adminApi.saveTemplate({ title: '', type: 0, data: JSON.stringify(useWidgetStore().dLayouts), width: Number(page.width), height: Number(page.height) })
      src = { kind, id: Number(id), name: t('tinix.ui.templateSave.auto_name', { id }) }
    }
    templateSource.value = src
    // đánh dấu "vừa dùng" để mẫu mới nằm đầu thư viện (danh sách xếp theo lần dùng gần nhất)
    await fetch(`${config.SCREEN_URL}/api/tinix/template-used`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id: src.id }) }).catch(() => undefined)
    changed()
    useNotification(t('tinix.ui.templateSave.saved_new', { name: src.name }), t('tinix.ui.templateSave.saved_new_body'))
    return true
  } catch (e: any) {
    useNotification(t('tinix.ui.templateSave.failed'), e?.msg || e?.message || '', { type: 'error' })
    return false
  }
}

/**
 * Lưu đè MẪU CẮT DÁN đang sửa (chế độ Sửa mẫu). `name` lấy từ ô tên ở thanh trên (rỗng = giữ tên cũ).
 * Mẫu thường lưu đè bằng saveTemp của HeaderOptions (tạo lại ảnh bìa). Bản cũ được service giữ ngầm vài bản.
 */
export async function overwriteCollageTemplate(name: string): Promise<boolean> {
  const src = templateSource.value
  if (!src || src.kind !== 'collage') return false
  try {
    const r = await postCollage({ id: src.id, version: src.version, name, layout: collageLayout() })
    templateSource.value = { ...src, name: r.name, version: r.version }
    changed()
    useNotification(t('tinix.ui.templateSave.saved_over', { name: r.name }), '')
    return true
  } catch (e: any) {
    useNotification(t('tinix.ui.templateSave.failed'), e?.msg || e?.message || '', { type: 'error' })
    return false
  }
}
