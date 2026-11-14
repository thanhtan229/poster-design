/**
 * [TINIX] Đặt ảnh vào trang cho thiết kế album.
 *
 * - placePhotos(values, auto): thêm một lượt nhiều ảnh. Tắt "Tự áp dụng mẫu": xếp lưới gọn trên trang hiện tại (1 ảnh: như cũ, đặt giữa).
 *   Bật: chọn NGẪU NHIÊN một mẫu trong nhóm đã chọn có đúng số khung ảnh, áp dụng vào một TRANG MỚI; không có mẫu phù hợp thì xếp lưới.
 * - Mẫu có khung ảnh (lớp ảnh đánh dấu `slot`): ảnh vào khung theo hướng ngang/dọc gần nhất, `fit: cover` (không méo, cắt phần dư).
 * - Mẫu chưa đánh dấu khung = mẫu 1 ảnh: ảnh phủ kín trang (không méo, có thể thò ra một cạnh), kéo di chuyển được nhưng luôn phủ kín trang
 *   (`keepCover`), nằm dưới mọi lớp chữ/trang trí và ngay trên lớp ảnh nền phủ kín trang (nếu có).
 * - Canvas dùng ảnh nhẹ, ảnh gốc nhớ trong `origin` cho lúc xuất (xem photo-source.ts).
 */
import { customAlphabet } from 'nanoid/non-secure'
import { ElMessage } from 'element-plus'
import api from '@/api'
import i18n from '@/languages'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import setImageData from '@/common/methods/DesignFeatures/setImage'
import { useCanvasStore, useControlStore, useForceStore, useWidgetStore } from '@/store'
import { applyImageSource } from './photo-source'
import { photoState } from './photo-strip'

const nanoid = customAlphabet('1234567890abcdef', 12)
const t = (k: string, p?: any) => i18n.global.t(k, p) as string

/** Ảnh đưa vào trang: url = ảnh nhẹ (canvas), hq = ảnh gốc (xuất) */
export type PhotoValue = { id?: number; url: string; hq?: string; width: number; height: number }

type Rect = { left: number; top: number; width: number; height: number }

// ───────────────────────── Hình học ─────────────────────────
/** Phủ kín trang, giữ tỉ lệ, căn giữa (một cạnh có thể thò ra ngoài trang) */
export function coverRect(imgW: number, imgH: number, pageW: number, pageH: number): Rect {
  const s = Math.max(pageW / imgW, pageH / imgH)
  const width = imgW * s
  const height = imgH * s
  return { left: (pageW - width) / 2, top: (pageH - height) / 2, width, height }
}

/** Xếp N ảnh thành lưới trong trang: chọn số cột cho ảnh to nhất; mỗi ảnh vừa khít ô (giữ tỉ lệ), căn giữa ô */
export function gridRects(sizes: Array<{ width: number; height: number }>, pageW: number, pageH: number): Rect[] {
  const n = sizes.length
  const margin = Math.round(Math.min(pageW, pageH) * 0.02)
  let best: { score: number; cols: number } | null = null
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const cw = (pageW - margin * (cols + 1)) / cols
    const ch = (pageH - margin * (rows + 1)) / rows
    if (cw <= 0 || ch <= 0) continue
    let score = 0
    for (const s of sizes) score += Math.min(cw / s.width, ch / s.height)
    if (!best || score > best.score) best = { score, cols }
  }
  const cols = best ? best.cols : 1
  const rows = Math.ceil(n / cols)
  const cw = (pageW - margin * (cols + 1)) / cols
  const ch = (pageH - margin * (rows + 1)) / rows
  return sizes.map((s, i) => {
    const sc = Math.min(cw / s.width, ch / s.height)
    const w = Math.round(s.width * sc)
    const h = Math.round(s.height * sc)
    const c = i % cols
    const r = Math.floor(i / cols)
    return { left: Math.round(margin + c * (cw + margin) + (cw - w) / 2), top: Math.round(margin + r * (ch + margin) + (ch - h) / 2), width: w, height: h }
  })
}

/**
 * Ghép ảnh với khung theo hướng/tỉ lệ gần nhất. Trả về mảng: khung i ← ảnh result[i].
 * N ≤ 7: thử mọi hoán vị (tối ưu); lớn hơn: sắp theo tỉ lệ rồi ghép tuần tự.
 */
export function assignPhotosToSlots(slotAspects: number[], photoAspects: number[]): number[] {
  const n = slotAspects.length
  const cost = (si: number, pi: number) => Math.abs(Math.log(slotAspects[si] / photoAspects[pi]))
  if (n <= 7) {
    let best: number[] = []
    let bestCost = Infinity
    const used = new Array(n).fill(false)
    const cur: number[] = []
    const rec = (i: number, acc: number) => {
      if (acc >= bestCost) return
      if (i === n) {
        bestCost = acc
        best = cur.slice()
        return
      }
      for (let p = 0; p < n; p++) {
        if (used[p]) continue
        used[p] = true
        cur[i] = p
        rec(i + 1, acc + cost(i, p))
        used[p] = false
      }
    }
    rec(0, 0)
    return best
  }
  const sOrder = slotAspects.map((a, i) => i).sort((x, y) => slotAspects[x] - slotAspects[y])
  const pOrder = photoAspects.map((a, i) => i).sort((x, y) => photoAspects[x] - photoAspects[y])
  const out = new Array(n)
  sOrder.forEach((si, k) => (out[si] = pOrder[k]))
  return out
}

// ───────────────────────── Trang / lớp ─────────────────────────
function newImageWidget(v: PhotoValue, r: Rect): any {
  const w = JSON.parse(JSON.stringify(wImageSetting))
  Object.assign(w, { left: r.left, top: r.top, width: r.width, height: r.height })
  applyImageSource(w, { url: v.url, hq: v.hq })
  return w
}

/** Lớp ảnh phủ kín trang (≥ 90% diện tích) — thường là lớp ảnh nền của mẫu PSD */
const isFullPageImage = (w: any, pw: number, ph: number) => w && w.type === 'w-image' && !w.hidden && w.width * w.height >= 0.9 * pw * ph

/** Gán uuid mới cho mọi lớp (và cập nhật `parent` của lớp con), giải mã chữ như setTemplate */
function reuuid(widgets: any[]): any[] {
  const map = new Map<string, string>()
  for (const w of widgets) map.set(String(w.uuid), nanoid())
  return widgets.map((w) => {
    const c = JSON.parse(JSON.stringify(w))
    c.uuid = map.get(String(w.uuid))
    if (c.parent !== undefined && map.has(String(c.parent))) c.parent = map.get(String(c.parent))
    if (c.text) {
      try {
        c.text = decodeURIComponent(c.text)
      } catch (e) {
        // chữ không mã hóa: giữ nguyên
      }
    }
    return c
  })
}

function switchToPage(index: number) {
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  const controlStore = useControlStore()
  controlStore.setShowMoveable(false)
  canvasStore.dCurrentPage = index
  widgetStore.setDWidgets(widgetStore.getWidgets())
  canvasStore.setDPage(widgetStore.dLayouts[index].global)
  widgetStore.selectWidget({ uuid: '-1' })
}

/** Thêm một trang trống ở cuối (như nút + ở thanh trang) và chuyển tới đó. Trả về chỉ số trang. */
export function addBlankPage(): number {
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  const controlStore = useControlStore()
  controlStore.setShowMoveable(false)
  const init = JSON.parse(JSON.stringify(canvasStore.dPage))
  Object.assign(init, { backgroundColor: '#ffffffff', backgroundGradient: '', backgroundImage: '' })
  widgetStore.dLayouts.push({ global: init, layers: [] })
  canvasStore.dCurrentPage = widgetStore.dLayouts.length - 1
  widgetStore.setDWidgets(widgetStore.getWidgets())
  canvasStore.setDPage(JSON.parse(JSON.stringify(init)))
  canvasStore.updateDPage()
  widgetStore.selectWidget({ uuid: '-1' })
  return canvasStore.dCurrentPage
}

// ───────────────────────── Đặt ảnh thủ công ─────────────────────────
/** Một ảnh: đặt giữa trang như trước đây */
export async function placeSingle(v: PhotoValue) {
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  useControlStore().setShowMoveable(false)
  const img = await setImageData({ width: v.width, height: v.height, url: v.url })
  const { width: pW, height: pH } = canvasStore.dPage
  widgetStore.addWidget(newImageWidget(v, { left: pW / 2 - img.width / 2, top: pH / 2 - img.height / 2, width: img.width, height: img.height }))
}

/** Nhiều ảnh: xếp lưới gọn trên trang hiện tại */
export function placeGrid(values: PhotoValue[]) {
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  useControlStore().setShowMoveable(false)
  const { width: pW, height: pH } = canvasStore.dPage
  const rects = gridRects(values, pW, pH)
  values.forEach((v, i) => widgetStore.addWidget(newImageWidget(v, rects[i])))
}

// ───────────────────────── Tự áp dụng mẫu ─────────────────────────
const recent = new Map<string, number[]>() // các mẫu vừa chọn theo (nhóm, số ảnh) để tránh lặp lại liền kề

async function listCandidates(cate: string, n: number): Promise<Array<{ id: number; title: string }>> {
  const all: Array<{ id: number; title: string }> = []
  const pageSize = 100 // API giới hạn mỗi trang 100 mẫu
  for (let page = 1; ; page++) {
    const res: any = await api.home.getTempList({ search: '', page, pageSize, cate: cate || '', photos: String(n) } as any)
    if (!Array.isArray(res?.list)) throw new Error('Không tải được danh sách mẫu')
    all.push(...res.list)
    if (res.list.length < pageSize || all.length >= Number(res.total)) break
  }
  return all
}

function pickRandom(list: Array<{ id: number; title: string }>, key: string, avoid: number[] = []): { id: number; title: string } | null {
  if (!list.length) return null
  const seen = recent.get(key) || []
  let pool = list.filter((x) => avoid.indexOf(x.id) < 0 && seen.indexOf(x.id) < 0)
  if (!pool.length) pool = list.filter((x) => avoid.indexOf(x.id) < 0) // hết mẫu mới: cho phép lặp lại mẫu đã chọn trước
  if (!pool.length) pool = list
  const pick = pool[Math.floor(Math.random() * pool.length)]
  recent.set(key, [pick.id].concat(seen).slice(0, Math.max(1, Math.min(5, list.length - 1))))
  return pick
}

/** Áp dụng mẫu `tpl` (đã tải chi tiết) cho trang `pageIndex` với danh sách ảnh. false nếu số khung ảnh không khớp. */
async function applyTemplateToPage(pageIndex: number, tpl: { id: number; title: string; data: string }, photos: PhotoValue[]): Promise<boolean> {
  const widgetStore = useWidgetStore()
  const canvasStore = useCanvasStore()
  const n = photos.length
  let parsed: any
  try {
    parsed = JSON.parse(tpl.data)
  } catch (e) {
    return false
  }
  const rawPage = Array.isArray(parsed) ? parsed[0]?.global : parsed?.page
  const rawLayers = Array.isArray(parsed) ? parsed[0]?.layers : parsed?.widgets
  if (!rawPage || !Array.isArray(rawLayers) || !(Number(rawPage.width) > 0) || !(Number(rawPage.height) > 0)) return false
  const page = JSON.parse(JSON.stringify(rawPage))
  const list = reuuid(rawLayers)
  const pw = Number(page.width)
  const ph = Number(page.height)

  const slotIdx: number[] = []
  list.forEach((w, i) => w.type === 'w-image' && w.slot === true && !w.hidden && slotIdx.push(i))
  if (slotIdx.length === n && n >= 1) {
    // mẫu có khung ảnh: ghép theo hướng ảnh gần nhất, ảnh phủ kín khung (không méo)
    const slotAspects = slotIdx.map((i) => Number(list[i].width) / (Number(list[i].height) || 1))
    const photoAspects = photos.map((p) => p.width / (p.height || 1))
    const pairing = assignPhotosToSlots(slotAspects, photoAspects)
    slotIdx.forEach((li, k) => {
      const p = photos[pairing[k]]
      applyImageSource(list[li], { url: p.url, hq: p.hq })
      list[li].fit = 'cover'
    })
  } else if (n === 1 && slotIdx.length === 0) {
    // mẫu chưa đánh dấu khung = mẫu 1 ảnh: ảnh phủ kín trang, dưới lớp chữ, trên lớp ảnh nền phủ kín trang
    const p = photos[0]
    const w = newImageWidget(p, coverRect(p.width, p.height, pw, ph))
    w.uuid = nanoid()
    w.keepCover = true // kéo di chuyển nhưng luôn phủ kín trang
    w.name = t('tinix.ui.photoAuto.ten_lop_anh')
    let idx = 0
    while (idx < list.length && isFullPageImage(list[idx], pw, ph)) idx++
    list.splice(idx, 0, w)
  } else {
    return false
  }

  switchToPage(pageIndex)
  page.tinixAuto = tpl.id // đánh dấu trang được tự áp dụng từ mẫu này (cho "Đổi mẫu khác")
  canvasStore.setDPage(page)
  widgetStore.setDWidgets(list)
  widgetStore.selectWidget({ uuid: '-1' })
  canvasStore.reChangeCanvas()
  setTimeout(() => useForceStore().setZoomScreenChange(), 300)
  return true
}

async function loadTemplate(id: number): Promise<{ id: number; title: string; data: string } | null> {
  const res: any = await api.home.getTempDetail({ id } as any)
  return res && res.data ? { id, title: res.title || '', data: res.data } : null
}

/**
 * Tự áp dụng mẫu cho một lượt ảnh. Trả về true nếu đã áp dụng (vào trang mới).
 * false: không có mẫu phù hợp (người gọi sẽ xếp lưới).
 */
export async function autoApplyTemplate(photos: PhotoValue[]): Promise<boolean> {
  const n = photos.length
  const cate = photoState.autoCate
  const cands = await listCandidates(cate, n)
  const pick = pickRandom(cands, `${cate}|${n}`)
  if (!pick) return false
  const tpl = await loadTemplate(pick.id)
  if (!tpl) return false
  const pageIndex = addBlankPage()
  let ok = false
  try {
    ok = await applyTemplateToPage(pageIndex, tpl, photos)
  } catch (e) {
    // Dữ liệu mẫu lỗi không được để lại trang trống khi chuyển sang xếp lưới.
  }
  if (!ok) {
    useWidgetStore().dLayouts.splice(pageIndex, 1) // không áp dụng được: bỏ trang vừa thêm
    switchToPage(Math.max(0, pageIndex - 1))
    return false
  }
  photoState.lastAuto = { pageIndex, templateId: tpl.id, title: pick.title || tpl.title, photos, cate }
  return true
}

/** "Đổi mẫu khác": chọn mẫu ngẫu nhiên khác với cùng bộ ảnh và thay nội dung trang đã tự áp dụng */
export async function rerollAutoTemplate(): Promise<boolean> {
  const last = photoState.lastAuto
  const widgetStore = useWidgetStore()
  if (!last) return false
  const layout = widgetStore.dLayouts[last.pageIndex]
  if (!layout || layout.global.tinixAuto !== last.templateId) {
    photoState.lastAuto = null // trang đã bị xóa/đổi
    return false
  }
  const cands = await listCandidates(last.cate, last.photos.length)
  const pick = pickRandom(cands, `${last.cate}|${last.photos.length}`, [last.templateId])
  if (!pick || pick.id === last.templateId) return false
  const tpl = await loadTemplate(pick.id)
  if (!tpl) return false
  const ok = await applyTemplateToPage(last.pageIndex, tpl, last.photos)
  if (ok) photoState.lastAuto = { ...last, templateId: tpl.id, title: pick.title || tpl.title }
  return ok
}

/** Điểm vào chung: thêm một lượt ảnh vào trang (kéo thả hoặc menu "Thêm N ảnh vào trang") */
export async function placePhotos(values: PhotoValue[], auto: boolean) {
  if (!values.length) return
  if (auto) {
    try {
      if (await autoApplyTemplate(values)) return
    } catch (e) {
      // lỗi tải mẫu: xuống nhánh xếp lưới bên dưới
    }
    ElMessage.warning(t('tinix.ui.photoAuto.khong_co_mau', { n: values.length }))
  }
  if (values.length === 1) await placeSingle(values[0])
  else placeGrid(values)
}
