// [TINIX] Lưu mẫu từ menu Tệp: "Lưu đè mẫu đang mở" và "Lưu thành mẫu mới".
// Nhớ trang trên canvas được mở từ mẫu nào (mẫu thường hay mẫu cắt dán) để lưu đè đúng chỗ.
// Tên mẫu mới do service tự đặt theo mã số ("Mẫu 64"); đổi tên ở menu ⋯ của từng mẫu nếu cần.
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
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

function changed() {
  window.dispatchEvent(new Event('tinix:templates-changed')) // làm mới danh sách mẫu ở cả hai thư viện
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
    templateSource.value = src // các lần "Lưu đè" sau ghi vào mẫu vừa tạo
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

/** Ghi đè mẫu đang mở (hỏi lại trước). Bản cũ vẫn được service giữ ngầm vài bản để khôi phục khi lỡ tay. */
export async function overwriteTemplate(): Promise<boolean> {
  const src = templateSource.value
  if (!src) return false
  try {
    await ElMessageBox.confirm(t('tinix.ui.templateSave.confirm_body', { name: src.name }), t('tinix.ui.templateSave.confirm_title'), { type: 'warning', confirmButtonText: t('tinix.ui.templateSave.confirm_btn'), cancelButtonText: t('tinix.ui.templateSave.cancel') })
  } catch {
    return false
  }
  try {
    if (src.kind === 'collage') {
      const r = await postCollage({ id: src.id, version: src.version, layout: collageLayout() })
      templateSource.value = { ...src, version: r.version }
    } else {
      const page = useCanvasStore().dPage
      await adminApi.saveTemplate({ id: src.id, title: src.name, type: 0, data: JSON.stringify(useWidgetStore().dLayouts), width: Number(page.width), height: Number(page.height) })
    }
    changed()
    useNotification(t('tinix.ui.templateSave.saved_over', { name: src.name }), '')
    return true
  } catch (e: any) {
    useNotification(t('tinix.ui.templateSave.failed'), e?.msg || e?.message || '', { type: 'error' })
    return false
  }
}
