// [TINIX] Lưu ngược lớp / nhóm đang chọn về thư viện: "Lưu đè vào thư viện" (mục gốc đã chèn từ tab Chữ / Chất liệu)
// hoặc "Lưu thành mục mới". Mục gốc được nhớ trong `libraryRef` của lớp khi chèn (CompListWrap / GraphListWrap / setWidgetData).
// Nhóm (hoặc chữ) → thành phần tab Chữ; một lớp ảnh / SVG không có chữ → chất liệu.
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import i18n from '@/languages'
import { useWidgetStore } from '@/store'
import { type LibraryRef, createMaterial, getComp, notifyLibraryChanged, saveComp, updateMaterial } from './library-api'

const t = (k: string, p?: Record<string, any>) => i18n.global.t(k, p || {}) as string
const plain = (html: any) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

export type LibraryTarget = { root: any; ref?: LibraryRef; kind: 'comp' | 'material' }

/** Lớp gốc để lưu: nhóm ngoài cùng chứa lớp đang chọn (ưu tiên nhóm có libraryRef), hoặc chính lớp đó */
export function libraryTarget(): LibraryTarget | null {
  const ws = useWidgetStore()
  const el: any = ws.dActiveElement
  if (!el || el.uuid === '-1') return null
  const byId = new Map<string, any>(ws.dWidgets.map((w: any) => [String(w.uuid), w]))
  let root: any = byId.get(String(el.uuid)) || el
  let withRef: any = root.libraryRef ? root : null
  for (let p = byId.get(String(root.parent)); p; p = byId.get(String(p.parent))) {
    root = p
    if (p.libraryRef) withRef = p
  }
  const target = withRef || root
  const subtree = target.type === 'w-group' ? [target, ...descendants(ws.dWidgets, target.uuid)] : [target]
  const hasText = subtree.some((w) => w.type === 'w-text')
  if (target.type === 'w-group' || hasText) return { root: target, ref: target.libraryRef, kind: 'comp' }
  if ((target.type === 'w-image' && target.imgUrl && !target.slot && !target.linkedPhotoId) || (target.type === 'w-svg' && target.svgUrl)) return { root: target, ref: target.libraryRef, kind: 'material' }
  return null
}

function descendants(all: any[], uuid: string): any[] {
  const kids = all.filter((w) => w && String(w.parent) === String(uuid))
  return kids.flatMap((c) => [c, ...(c.type === 'w-group' ? descendants(all, c.uuid) : [])])
}

/** Dữ liệu thành phần theo đúng định dạng tab Chữ: lớp con (tọa độ tính từ góc nhóm) rồi nhóm ở cuối */
export function componentPayload(all: any[], root: any): { widgets: any[]; width: number; height: number; preview: string } {
  const strip = (w: any) => {
    const c = JSON.parse(JSON.stringify(w))
    delete c.libraryRef
    return c
  }
  if (root.type === 'w-group') {
    const ox = Number(root.left) || 0
    const oy = Number(root.top) || 0
    const kids = descendants(all, root.uuid).map((w) => ({ ...strip(w), left: (Number(w.left) || 0) - ox, top: (Number(w.top) || 0) - oy }))
    const group = { ...strip(root), left: 0, top: 0, parent: '-1', record: { ...(root.record || {}), width: 0, height: 0 } }
    return { widgets: [...kids, group], width: Number(root.width) || 0, height: Number(root.height) || 0, preview: kids.filter((k) => k.type === 'w-text').map((k) => plain(k.text)).join(' ').slice(0, 40) }
  }
  // một lớp chữ rời: bọc một nhóm
  const width = Math.round(Number(root.width) || 1)
  const height = Math.round(Number(root.height) || Number(root.record?.height) || (Number(root.fontSize) || 24) * 1.5)
  const gid = `grp-${root.uuid}`
  const group = { name: '组合', type: 'w-group', uuid: gid, width, height, left: 0, top: 0, transform: '', opacity: 1, parent: '-1', isContainer: true, record: { width: 0, height: 0, minWidth: 0, minHeight: 0, dir: 'none' } }
  return { widgets: [{ ...strip(root), left: 0, top: 0, parent: gid }, group], width, height, preview: plain(root.text).slice(0, 40) }
}

function svgThumb(w: any): string {
  let markup = String(w.svgUrl || '')
  ;(w.colors || []).forEach((c: string, i: number) => {
    markup = markup.split(`{{colors[${i}]}}`).join(c)
  })
  return 'data:image/svg+xml,' + encodeURIComponent(markup)
}

function materialAsset(w: any, title: string, type?: string) {
  if (w.type === 'w-svg') return { type: 'svg', url: w.svgUrl, thumb: svgThumb(w), title, model: JSON.stringify({ colors: w.colors || [] }), width: w.width, height: w.height }
  return { type: type || 'image', url: w.imgUrl, thumb: w.imgUrl, title, width: w.width, height: w.height }
}

async function askName(defaultName: string): Promise<string | null> {
  try {
    const r: any = await ElMessageBox.prompt(t('tinix.ui.library.askName'), t('tinix.ui.library.saveNewTitle'), { inputValue: defaultName, confirmButtonText: t('tinix.ui.library.save'), cancelButtonText: t('tinix.ui.library.cancel'), inputValidator: (v: string) => !!String(v || '').trim() || t('tinix.ui.library.nameRequired') })
    return String(r.value || '').trim()
  } catch {
    return null
  }
}

async function confirmOverwrite(name: string, cover?: string): Promise<boolean> {
  const img = cover ? `<div style="margin-top:8px"><img src="${cover}" style="max-width:220px;max-height:120px;border:1px solid #e5e6eb;border-radius:4px;background:#f4f5f7"/><div style="font-size:12px;color:#888">${t('tinix.ui.library.oldVersion')}</div></div>` : ''
  try {
    await ElMessageBox.confirm(`<div>${t('tinix.ui.library.confirmOverwrite', { name: escapeHtml(name) })}</div>${img}`, t('tinix.ui.library.overwriteTitle'), { type: 'warning', dangerouslyUseHTMLString: true, confirmButtonText: t('tinix.ui.library.overwrite'), cancelButtonText: t('tinix.ui.library.cancel') })
    return true
  } catch {
    return false
  }
}
const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const DEFAULT_MATERIAL_CATE: Record<string, string> = { image: 'png', svg: 'svg', mask: 'mask', background: 'background' }

/** mode = 'over': lưu đè mục gốc; 'new': lưu thành mục mới (cũng dùng cho lớp chưa có trong thư viện) */
export async function saveToLibrary(mode: 'over' | 'new'): Promise<void> {
  const ws = useWidgetStore()
  const target = libraryTarget()
  if (!target) {
    ElMessage.warning(t('tinix.ui.library.nothing'))
    return
  }
  const { root, kind } = target
  const ref = target.ref && target.ref.kind === kind ? target.ref : undefined
  try {
    if (kind === 'comp') {
      const payload = componentPayload(ws.dWidgets, root)
      if (mode === 'over' && ref && ref.kind === 'comp') {
        const info = await getComp(ref.id)
        if (!(await confirmOverwrite(info.title, info.cover))) return
        const r = await saveComp({ id: ref.id, widgets: payload.widgets, width: payload.width, height: payload.height })
        notifyLibraryChanged('comp')
        if (r.coverOk) ElMessage.success(t('tinix.ui.library.savedOver', { name: info.title }))
        else ElMessage.warning(t('tinix.ui.library.coverFailed'))
        return
      }
      const name = await askName(payload.preview || t('tinix.ui.library.defaultComp'))
      if (!name) return
      let cate = ''
      if (ref && ref.kind === 'comp') cate = (await getComp(ref.id).catch(() => null))?.cate || ''
      if (!cate) {
        const cats: any = await api.home.getTemplateCategories(1)
        cate = cats?.list?.[0]?.name || ''
      }
      const r = await saveComp({ title: name, cate, widgets: payload.widgets, width: payload.width, height: payload.height })
      root.libraryRef = { kind: 'comp', id: r.id } // lần sau "Lưu đè" ghi vào mục mới này
      ws.updateDWidgets()
      notifyLibraryChanged('comp')
      if (r.coverOk) ElMessage.success(t('tinix.ui.library.savedNew', { name }))
      else ElMessage.warning(t('tinix.ui.library.coverFailed'))
      return
    }

    // chất liệu
    if (mode === 'over' && ref && ref.kind === 'material') {
      const patch = root.type === 'w-svg' ? { url: root.svgUrl, model: JSON.stringify({ colors: root.colors || [] }), thumb: svgThumb(root) } : { url: root.imgUrl, thumb: root.imgUrl }
      if (root.type !== 'w-svg' && root.imgUrl === ref.url) {
        ElMessage.info(t('tinix.ui.library.noChange'))
        return
      }
      if (!(await confirmOverwrite(ref.url.startsWith('<svg') ? t('tinix.ui.library.svgItem') : ref.url.split('/').pop() || '', root.type === 'w-svg' ? undefined : ref.url))) return
      const r = await updateMaterial(ref.cate, ref.url, patch)
      root.libraryRef = { kind: 'material', cate: r.cate, url: r.asset.url }
      ws.updateDWidgets()
      notifyLibraryChanged('material')
      ElMessage.success(t('tinix.ui.library.savedOverMaterial'))
      return
    }
    const name = await askName(root.name || t('tinix.ui.library.defaultMaterial'))
    if (!name) return
    const type = root.type === 'w-svg' ? 'svg' : 'image'
    const cate = ref && ref.kind === 'material' ? ref.cate : DEFAULT_MATERIAL_CATE[type]
    const r = await createMaterial(cate, materialAsset(root, name, type))
    root.libraryRef = { kind: 'material', cate, url: r.asset.url }
    ws.updateDWidgets()
    notifyLibraryChanged('material')
    ElMessage.success(t('tinix.ui.library.savedNew', { name }))
  } catch (e: any) {
    ElMessage.error(e?.message || t('tinix.ui.library.failed'))
  }
}
