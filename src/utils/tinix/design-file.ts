// [TINIX] Thiết kế dạng tệp trên máy (.tinix.zip: design.json + ảnh), bản nháp tự động, mở mẫu lên canvas.
// Không ghi vào CSDL: người dùng tự quản lý tệp theo tên khách trong thư mục máy tính.
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import i18n from '@/languages'
import config from '@/config'
import router from '@/router'
import { useCanvasStore, useControlStore, useHistoryStore, useWidgetStore } from '@/store'
import downloadBlob from '@/common/methods/download/downloadBlob'
import { zipImages } from './zip'
import { unzip } from './unzip'
import * as photosApi from '@/api/tinix-photos'
import { photoState, reloadPhotos } from './photo-strip'
import { adoptUsedPhotos, project, projectPhotos, resetProject, setProjectPaths, staticOf } from './project'

const t = (key: string, params?: any) => i18n.global.t(key, params) as string
const FORMAT = 'tinix-design'
const EXTENSION = '.tinix.zip'
const ASSET_PATTERN = /\/static\/(?!fonts\/)[^"\\]+?\.(?:png|jpe?g|webp|gif)/gi

/** Tên thiết kế đang mở (dùng chung với ô tên ở thanh trên). */
export const designTitle = ref('')

const savedSignature = ref('') // [TINIX] reactive để thanh trên hiện "Đã lưu / Chưa lưu"
let fileHandle: any = null

function snapshot() {
  return JSON.stringify(useWidgetStore().dLayouts)
}
// "Có thay đổi chưa lưu" dựa trên lịch sử hoàn tác (không so sánh JSON vì editor tự chuẩn hóa dữ liệu sau khi nạp).
function signature() {
  const history = useHistoryStore()
  return history.dHistoryStack.changes.length + ':' + history.dHistoryParams.stackPointer
}
/** Ghi nhận trạng thái hiện tại là "đã lưu" (mở mẫu, mở tệp, lưu về máy). */
export function markSaved() {
  savedSignature.value = signature()
}
export function isDirty() {
  return signature() !== savedSignature.value
}

function safeName(title: string) {
  return (title || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || t('tinix.ui.localFile.untitled')
}

export function collectAssetPaths(text: string): string[] {
  return Array.from(new Set(text.match(ASSET_PATTERN) || []))
}

/** Đóng gói dự án hiện tại thành ZIP: thiết kế + toàn bộ ảnh được tham chiếu + ảnh khách đã nhập vào dự án (kể cả ảnh chưa dùng). */
export async function buildPackage(): Promise<{ blob: Blob; missing: string[] }> {
  const layouts = JSON.parse(snapshot())
  adoptUsedPhotos(JSON.stringify(layouts)) // ảnh đang nằm trên canvas luôn thuộc dự án
  const photos = projectPhotos().map((p) => ({ url: p.url, web_url: p.web_url, thumb_url: p.thumb_url, width: p.width, height: p.height, hash: p.hash, size: p.size, taken_at: p.taken_at, name: p.name }))
  const text = JSON.stringify({ format: FORMAT, version: 2, title: designTitle.value, savedAt: new Date().toISOString(), layouts, project: { photos } })
  const files: Array<{ name: string; blob: Blob }> = [{ name: 'design.json', blob: new Blob([text], { type: 'application/json' }) }]
  const missing: string[] = []
  const paths = new Set(collectAssetPaths(text))
  for (const p of photos) for (const u of [p.url, p.web_url, p.thumb_url]) if (u) paths.add(staticOf(u))
  for (const path of paths) {
    try {
      const response = await fetch(config.SCREEN_URL + path)
      if (!response.ok) throw new Error('HTTP ' + response.status)
      files.push({ name: 'assets' + path, blob: await response.blob() })
    } catch (_) {
      missing.push(path)
    }
  }
  return { blob: await zipImages(files), missing }
}

/** Lưu thiết kế ra tệp trên máy. Lần đầu (hoặc saveAs) hỏi nơi lưu; các lần sau ghi đè đúng tệp đó. */
export async function saveToDisk(saveAs = false): Promise<boolean> {
  const picker = (window as any).showSaveFilePicker
  try {
    // Hộp thoại chọn nơi lưu phải mở ngay khi người dùng bấm (trước các bước tải ảnh chậm).
    if (picker && (saveAs || !fileHandle)) {
      fileHandle = await picker({
        suggestedName: (fileHandle && fileHandle.name) || safeName(designTitle.value) + EXTENSION,
        id: 'tinix-design',
        types: [{ description: 'TinixPoster', accept: { 'application/zip': ['.zip'] } }],
      })
    }
  } catch (e: any) {
    if (e && e.name === 'AbortError') return false // người dùng đóng hộp thoại chọn nơi lưu
    throw e
  }
  const { blob, missing } = await buildPackage()
  if (picker && fileHandle) {
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    if (!designTitle.value) designTitle.value = String(fileHandle.name || '').replace(/.tinix.zip$|.zip$/i, '')
  } else {
    downloadBlob(blob, safeName(designTitle.value) + EXTENSION)
  }
  markSaved()
  void clearDraft()
  if (missing.length) ElMessage.warning(t('tinix.ui.localFile.missing_assets', { n: missing.length }))
  else ElMessage.success(t('tinix.ui.localFile.saved', { name: (fileHandle && fileHandle.name) || safeName(designTitle.value) + EXTENSION }))
  return true
}

/** Đưa các trang vào editor, thay thế thiết kế đang mở. */
export function applyLayouts(layouts: any[], title: string) {
  const widgetStore = useWidgetStore()
  const pageStore = useCanvasStore()
  useControlStore().setShowMoveable(false)
  pageStore.setDCurrentPage(0)
  widgetStore.dLayouts = layouts
  widgetStore.setDWidgets(widgetStore.getWidgets())
  pageStore.setDPage(pageStore.getDPage())
  widgetStore.selectWidget({ uuid: '-1' })
  // Lịch sử hoàn tác cũ không còn khớp với thiết kế mới.
  useHistoryStore().$patch({ dHistoryStack: { changes: [], inverseChanges: [] }, dHistoryParams: { index: -1, length: 0, maxLength: 20, stackPointer: -1 } })
  designTitle.value = title
  resetProject() // dự án mới: chưa có ảnh nào (openPackage nạp lại ảnh của tệp ngay sau đó)
  // Thiết kế này không gắn với bản ghi trong CSDL nữa: bỏ id khỏi địa chỉ để không ghi đè nhầm thiết kế cũ.
  const query = { ...router.currentRoute.value.query }
  if (query.id || query.tempid) {
    delete query.id
    delete query.tempid
    void router.replace({ path: router.currentRoute.value.path, query })
  }
  markSaved()
}

/** Nếu có thay đổi chưa lưu, hỏi người dùng. Trả về false nếu họ hủy. */
export async function confirmReplace(): Promise<boolean> {
  if (!isDirty()) return true
  try {
    await ElMessageBox.confirm(t('tinix.ui.localFile.unsaved_body'), t('tinix.ui.localFile.unsaved_title'), {
      distinguishCancelAndClose: true,
      confirmButtonText: t('tinix.ui.localFile.save_then_open'),
      cancelButtonText: t('tinix.ui.localFile.discard_and_open'),
      type: 'warning',
    })
  } catch (action: any) {
    if (action === 'cancel') return true // bỏ thay đổi
    return false // đóng hộp thoại
  }
  return saveToDisk()
}

/** Mở một mẫu (bố cục {global, layers}) lên canvas để chỉnh trực tiếp. */
export async function openTemplateOnCanvas(layout: any, name: string): Promise<boolean> {
  if (!(await confirmReplace())) return false
  fileHandle = null
  applyLayouts([JSON.parse(JSON.stringify(layout))], name)
  return true
}

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++])
    }),
  )
}

/** Báo font thư viện bị thiếu (font nằm ngoài tệp .tinix.zip). */
async function warnMissingFonts(layouts: any[]) {
  const urls = new Set<string>()
  for (const layout of layouts) for (const w of layout.layers || []) if (w.type === 'w-text' && w.fontClass && w.fontClass.url) urls.add(w.fontClass.url)
  const missing: string[] = []
  await mapLimit(Array.from(urls), 6, async (url) => {
    try {
      const response = await fetch(config.SCREEN_URL + url, { method: 'HEAD' })
      if (!response.ok) missing.push(url.split('/').pop() || url)
    } catch (_) {
      missing.push(url.split('/').pop() || url)
    }
  })
  if (missing.length) ElMessage.warning({ message: t('tinix.ui.localFile.missing_fonts', { fonts: missing.join(', ') }), duration: 8000 })
}

/** Mở tệp .tinix.zip: ghi lại ảnh còn thiếu trên máy này rồi nạp thiết kế. */
export async function openPackage(file: Blob, handle?: any): Promise<boolean> {
  const entries = await unzip(file)
  const design = entries.find((e) => e.name === 'design.json')
  if (!design) throw new Error(t('tinix.ui.localFile.not_design'))
  const data = JSON.parse(await (await design.blob()).text())
  if (data.format !== FORMAT || !Array.isArray(data.layouts) || !data.layouts.length) throw new Error(t('tinix.ui.localFile.not_design'))
  if (!(await confirmReplace())) return false
  const assets = new Map<string, ZipEntryLike>()
  for (const e of entries) if (e.name.startsWith('assets/static/')) assets.set(e.name.slice('assets'.length), e)
  if (assets.size) {
    const response = await fetch(config.SCREEN_URL + '/api/tinix/local-assets/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: Array.from(assets.keys()) }),
    })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'HTTP ' + response.status)
    const { missing } = await response.json()
    await mapLimit<string>(missing as string[], 4, async (path) => {
      const entry = assets.get(path)
      if (!entry) return
      const put = await fetch(config.SCREEN_URL + '/api/tinix/local-asset?path=' + encodeURIComponent(path), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: await entry.blob() })
      if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || 'HTTP ' + put.status)
    })
  }
  fileHandle = handle || null
  applyLayouts(data.layouts, String(data.title || '') || String(handle?.name || '').replace(/\.tinix\.zip$|\.zip$/i, ''))
  void warnMissingFonts(data.layouts)
  await restoreProjectPhotos(data)
  if (handle) void rememberRecent(handle)
  return true
}
type ZipEntryLike = { blob: () => Promise<Blob> }

/** Đăng ký lại ảnh của dự án vào kho ảnh (tệp ảnh đã được ghi lại ở trên) rồi đặt danh sách ảnh dự án. */
async function restoreProjectPhotos(data: any) {
  const items: any[] = Array.isArray(data.project && data.project.photos) ? data.project.photos : []
  try {
    if (items.length) await photosApi.importPhotos(items)
  } catch (_) { /* không đăng ký được: ảnh trên canvas vẫn dùng bình thường */ }
  await reloadPhotos()
  setProjectPaths(items.map((p) => p.url))
  adoptUsedPhotos(JSON.stringify(data.layouts))
  const have = new Set(photoState.photos.map((p) => staticOf(p.url)))
  const lost = items.filter((p) => !have.has(staticOf(p.url))).length
  if (lost) ElMessage.warning(t('tinix.ui.project.photos_missing', { n: lost }))
}

// ───────────── Danh sách dự án mở gần đây (lưu handle tệp trong IndexedDB; mở lại cần người dùng cho phép lại quyền đọc) ─────────────
export type RecentFile = { id: number; name: string; openedAt: number; handle: any }
async function recentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tinix-recent', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function recentRun<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await recentDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction('files', mode).objectStore('files'))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export async function listRecent(): Promise<RecentFile[]> {
  try {
    const all = await recentRun<RecentFile[]>('readonly', (s) => s.getAll())
    return all.sort((a, b) => b.openedAt - a.openedAt).slice(0, 8)
  } catch (_) { return [] }
}
export async function rememberRecent(handle: any) {
  try {
    for (const old of await recentRun<RecentFile[]>('readonly', (s) => s.getAll())) {
      let same = false
      try { same = await old.handle.isSameEntry(handle) } catch (_) { same = false }
      if (same) await recentRun('readwrite', (s) => s.delete(old.id))
    }
    await recentRun('readwrite', (s) => s.add({ name: String(handle.name || ''), openedAt: Date.now(), handle }))
    const all = (await recentRun<RecentFile[]>('readonly', (s) => s.getAll())).sort((a, b) => a.openedAt - b.openedAt)
    for (const extra of all.slice(0, Math.max(0, all.length - 8))) await recentRun('readwrite', (s) => s.delete(extra.id))
  } catch (_) { /* không có IndexedDB hoặc handle không lưu được: bỏ qua */ }
}
/** Mở lại một dự án gần đây. Trả về false nếu bị hủy/không mở được. */
export async function openRecent(entry: RecentFile): Promise<boolean> {
  try {
    const handle = entry.handle
    if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false
    return await openPackage(await handle.getFile(), handle)
  } catch (_) {
    try { await recentRun('readwrite', (s) => s.delete(entry.id)) } catch (_e) { /* bỏ qua */ }
    ElMessage.warning(t('tinix.ui.project.recent_failed', { name: entry.name }))
    return false
  }
}

/** Hộp thoại chọn tệp: dùng File System Access khi có (để Ctrl+S ghi đè đúng tệp), nếu không dùng ô chọn tệp. */
export async function pickAndOpen(): Promise<boolean> {
  const picker = (window as any).showOpenFilePicker
  if (picker) {
    let handles: any[]
    try {
      handles = await picker({ id: 'tinix-design', multiple: false, types: [{ description: 'TinixPoster', accept: { 'application/zip': ['.zip'] } }] })
    } catch (e: any) {
      if (e && e.name === 'AbortError') return false
      throw e
    }
    return openPackage(await handles[0].getFile(), handles[0])
  }
  return new Promise<boolean>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return resolve(false)
      openPackage(file).then(resolve, reject)
    }
    input.click()
  })
}

// ───────────── Bản nháp tự động (IndexedDB, chỉ để khôi phục khi tắt trình duyệt đột ngột) ─────────────
const DB_NAME = 'tinix-drafts'
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('draft')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function dbRun<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction('draft', mode).objectStore('draft'))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
export async function clearDraft() {
  try { await dbRun('readwrite', (s) => s.delete('current')) } catch (_) { /* không có IndexedDB: bỏ qua */ }
}
async function saveDraft() {
  try { await dbRun('readwrite', (s) => s.put({ title: designTitle.value, layouts: snapshot(), paths: project.paths.slice(), savedAt: Date.now() }, 'current')) } catch (_) { /* bỏ qua */ }
}
async function readDraft(): Promise<{ title: string; layouts: string; paths?: string[]; savedAt: number } | null> {
  try { return (await dbRun<any>('readonly', (s) => s.get('current'))) || null } catch (_) { return null }
}

let timer: any = null
/** Bắt đầu tự lưu nháp mỗi 30 giây khi có thay đổi chưa lưu. */
export function startAutosave() {
  if (timer) return
  timer = setInterval(() => { if (isDirty()) void saveDraft() }, 30000)
}

/** Khi mở app: nếu còn bản nháp chưa lưu thì hỏi khôi phục. */
export async function offerDraftRestore() {
  const draft = await readDraft()
  if (!draft) return
  try {
    const layouts = JSON.parse(draft.layouts)
    if (!Array.isArray(layouts) || !layouts.length) {
      void clearDraft()
      return
    }
    const time = new Date(draft.savedAt).toLocaleString()
    await ElMessageBox.confirm(t('tinix.ui.localFile.draft_body', { time, title: draft.title || t('tinix.ui.localFile.untitled') }), t('tinix.ui.localFile.draft_title'), { confirmButtonText: t('tinix.ui.localFile.restore'), cancelButtonText: t('tinix.ui.localFile.discard'), type: 'info', distinguishCancelAndClose: true })
    fileHandle = null
    applyLayouts(layouts, draft.title)
    if (Array.isArray(draft.paths)) setProjectPaths(draft.paths)
    savedSignature.value = '?' // bản nháp chưa lưu ra tệp: vẫn coi là có thay đổi
  } catch (action: any) {
    if (action === 'cancel') void clearDraft()
  }
}
