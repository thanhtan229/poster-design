/**
 * 从模板 / 画布数据中提取可入库的元素：
 * - 图片 / SVG / 容器（相框 mask）→ 「素材」tab（materials 表）
 * - 含文字的组合 → 「文字」tab（type=1 的组件模板）
 * 提取时按稳定 key 在本次范围内去重；与库内已有数据的去重由后端完成。
 */

/** 元素在某一页上的位置（画布绝对坐标） */
export type TRect = { page: number; left: number; top: number; width: number; height: number }

export type TExtractedMaterial = {
  key: string
  type: 'image' | 'svg' | 'mask'
  url: string
  title: string
  width?: number
  height?: number
  /** 该素材在模板中出现的所有位置 */
  rects: TRect[]
  /** 背景线索：page = 页面背景图（backgroundImage）；layer = 铺满页面且在最底层的图片 */
  bg?: 'page' | 'layer'
}

export type TExtractedText = {
  key: string
  title: string
  /** 组件数据：组合子元素在前、组合本体在最后 */
  widgets: any[]
  width: number
  height: number
  textPreview: string
  /** group = nhóm có sẵn trong mẫu; onShape = chữ nằm trên một hình (tự gộp theo vị trí, là gợi ý); single = chữ rời */
  source?: 'group' | 'onShape' | 'single'
}

/** photoRects：用户照片占位（slot / 已链接照片）的位置，用来判断哪些形状是相框 */
export type TExtractResult = { materials: TExtractedMaterial[]; texts: TExtractedText[]; photoRects: TRect[] }

/** 一页的数据：元素 + 页面尺寸与背景图（组件等没有页面信息时为 0 / 空） */
export type TPageDoc = { layers: any[]; width: number; height: number; backgroundImage: string }

/** 文字签名需要参与比较的字段，前后端必须保持一致（见 service/src/db/assetDedupe.ts） */
export const TEXT_SIGNATURE_FIELDS = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'lineHeight', 'writingMode', 'textAlign'] as const

export function textSignature(group: any, children: any[]): string {
  const parts = children
    .filter((w) => w?.type === 'w-text')
    .map((w) => TEXT_SIGNATURE_FIELDS.map((k) => String(w[k] ?? '')).join('|'))
  return `${Math.round(Number(group?.width) || 0)}x${Math.round(Number(group?.height) || 0)}#${parts.join('~')}`
}

/** 兼容历史数据格式，统一返回每一页的元素与页面信息 */
export function normalizeDocs(data: any): TPageDoc[] {
  let parsed = data
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch (_e) {
      return []
    }
  }
  const doc = (layers: any[], page: any): TPageDoc => ({
    layers,
    width: Number(page?.width) || 0,
    height: Number(page?.height) || 0,
    backgroundImage: typeof page?.backgroundImage === 'string' ? page.backgroundImage : '',
  })
  if (parsed && typeof parsed.data === 'string' && !Array.isArray(parsed)) return normalizeDocs(parsed.data)
  if (Array.isArray(parsed)) {
    if (parsed.length && parsed.every((p) => p && Array.isArray(p.layers))) return parsed.map((p) => doc(p.layers, p.global))
    return [doc(parsed, null)] // type=1 组件：直接是元素数组
  }
  if (parsed && Array.isArray(parsed.widgets)) return [doc(parsed.widgets, parsed.page)]
  if (parsed && Array.isArray(parsed.layers)) return [doc(parsed.layers, parsed.global)]
  return []
}

/** 兼容旧调用：只要每页的扁平元素数组 */
export function normalizePages(data: any): any[][] {
  return normalizeDocs(data).map((d) => d.layers)
}

/** 铺满页面的阈值：图片面积覆盖页面 ≥ 90% */
const FULL_PAGE_RATIO = 0.9
/** Chữ trên khung (không gộp nhóm): ≥ 85% diện tích chữ nằm trong hình, hình không lớn hơn 8 lần tổng diện tích chữ */
const TEXT_ON_SHAPE_INSIDE = 0.85
const TEXT_ON_SHAPE_MAX_RATIO = 8

/** 文字内容转纯文本：<br> 视为空格，去掉其余标签 */
function plainText(html: any): string {
  return String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function isRemoteUrl(url: any): url is string {
  return typeof url === 'string' && url.trim() !== '' && !/^(data|blob):/i.test(url.trim())
}

/** URL 规范化：去掉 query/hash 与首尾空白，作为去重 key */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/[?#].*$/, '')
}

export type TExtractLabels = { image: string; svg: string; mask: string; group: string; background?: string }
const DEFAULT_LABELS: TExtractLabels = { image: '图片', svg: '矢量', mask: '相框', group: '文字组合', background: '背景' }

export function extractAssets(data: any, titlePrefix = '', labels: TExtractLabels = DEFAULT_LABELS): TExtractResult {
  const materials = new Map<string, TExtractedMaterial>()
  const texts = new Map<string, TExtractedText>()
  const photoRects: TRect[] = []

  normalizeDocs(data).forEach((doc, page) => {
    const widgets = doc.layers
    if (!Array.isArray(widgets)) return
    const pageArea = doc.width * doc.height
    /** 图片是否铺满页面（相交面积 / 页面面积） */
    const coversPage = (w: any) => {
      if (!pageArea) return false
      const iw = Math.min((Number(w.left) || 0) + (Number(w.width) || 0), doc.width) - Math.max(Number(w.left) || 0, 0)
      const ih = Math.min((Number(w.top) || 0) + (Number(w.height) || 0), doc.height) - Math.max(Number(w.top) || 0, 0)
      return iw > 0 && ih > 0 && (iw * ih) / pageArea >= FULL_PAGE_RATIO
    }
    /** 目前为止下面只有「铺满页面的图」——用于判断是否在最底层 */
    let onlyBackdropsBelow = true
    const childrenOf = (uuid: string) => widgets.filter((w) => w && String(w.parent) === String(uuid))
    const descendants = (uuid: string): any[] => childrenOf(uuid).flatMap((c) => [c, ...(c.type === 'w-group' ? descendants(c.uuid) : [])])

    const rectOf = (w: any): TRect => ({ page, left: Number(w.left) || 0, top: Number(w.top) || 0, width: Number(w.width) || 0, height: Number(w.height) || 0 })
    const addMaterial = (key: string, type: TExtractedMaterial['type'], url: string, label: string, w: any, bg?: 'page' | 'layer') => {
      const existing = materials.get(key)
      if (existing) {
        existing.rects.push(rectOf(w))
        if (bg === 'page' || (bg && !existing.bg)) existing.bg = bg // page 线索最强
        return
      }
      materials.set(key, { key, type, url: url.trim(), title: `${titlePrefix}${label} ${materials.size + 1}`, width: w.width, height: w.height, rects: [rectOf(w)], ...(bg ? { bg } : {}) })
    }

    // ── Nhóm chữ: chữ có khung đi cùng nhau thành MỘT mục ở tab Chữ, khung không bị tách riêng sang Hình ảnh ──
    const byUuid = new Map<string, any>(widgets.filter(Boolean).map((w) => [String(w.uuid), w]))
    const groupOf = (w: any) => {
      const p = byUuid.get(String(w?.parent))
      return p && p.type === 'w-group' ? p : null
    }
    const isUserPhoto = (w: any) => w?.type === 'w-image' && (w.slot === true || !!w.linkedPhotoId)
    // nhóm chữ: có chữ, không chứa ảnh người dùng (cụm ảnh + chú thích vẫn xử lý từng lớp như cũ)
    const isTextGroup = (g: any) => {
      const d = descendants(g.uuid)
      return d.some((c) => c.type === 'w-text') && !d.some(isUserPhoto)
    }
    const insideTextGroup = (w: any) => {
      for (let p = groupOf(w); p; p = groupOf(p)) if (isTextGroup(p)) return true
      return false
    }
    // chỉ lấy nhóm chữ ngoài cùng: nhóm con nằm trong nhóm chữ khác thuộc về nhóm ngoài
    const textGroups = new Set<string>(widgets.filter((w) => w?.type === 'w-group' && isTextGroup(w) && !insideTextGroup(w)).map((w) => String(w.uuid)))
    /** lớp đã thuộc một mục Chữ → không liệt kê riêng */
    const consumed = new Set<string>()
    textGroups.forEach((id) => descendants(id).forEach((c) => consumed.add(String(c.uuid))))

    // Chữ rời nằm trên một hình rời ngay bên dưới (mẫu tự thiết kế tay hay không gộp nhóm) → tự gộp chữ + hình
    const area = (w: any) => Math.max(0, Number(w.width) || 0) * Math.max(0, Number(w.height) || 0)
    const insideRatio = (inner: any, outer: any) => {
      const iw = Math.min((Number(inner.left) || 0) + (Number(inner.width) || 0), (Number(outer.left) || 0) + (Number(outer.width) || 0)) - Math.max(Number(inner.left) || 0, Number(outer.left) || 0)
      const ih = Math.min((Number(inner.top) || 0) + (Number(inner.height) || 0), (Number(outer.top) || 0) + (Number(outer.height) || 0)) - Math.max(Number(inner.top) || 0, Number(outer.top) || 0)
      return iw > 0 && ih > 0 && area(inner) > 0 ? (iw * ih) / area(inner) : 0
    }
    const isShapeCandidate = (w: any) =>
      !!w && !w.hidden && !groupOf(w) && !consumed.has(String(w.uuid)) && !isUserPhoto(w) && !coversPage(w) &&
      ((w.type === 'w-image' && !isRemoteUrl(w.mask) && isRemoteUrl(w.imgUrl)) || (w.type === 'w-svg' && isRemoteUrl(w.svgUrl)))
    const onShape = new Map<string, any[]>() // uuid hình → các chữ nằm trên nó
    widgets.forEach((t, ti) => {
      if (t?.type !== 'w-text' || t.hidden || groupOf(t) || consumed.has(String(t.uuid))) return
      let best: any = null
      for (let si = 0; si < ti; si++) {
        const sh = widgets[si] // chỉ xét hình nằm DƯỚI chữ (thứ tự lớp)
        if (!isShapeCandidate(sh) || insideRatio(t, sh) < TEXT_ON_SHAPE_INSIDE) continue
        if (!best || area(sh) < area(best)) best = sh // hình nhỏ nhất ôm chữ = khung của chữ
      }
      if (best) onShape.set(String(best.uuid), [...(onShape.get(String(best.uuid)) || []), t])
    })
    onShape.forEach((list, sid) => {
      const sh = byUuid.get(sid)
      const textArea = list.reduce((sum, t) => sum + area(t), 0)
      if (!sh || area(sh) > textArea * TEXT_ON_SHAPE_MAX_RATIO) {
        onShape.delete(sid) // hình quá lớn so với chữ (ảnh nền, sticker lớn có chữ nhỏ đè lên): không gộp
        return
      }
      consumed.add(sid)
      list.forEach((t) => consumed.add(String(t.uuid)))
    })

    // 页面背景图（backgroundImage）：一定是背景
    if (isRemoteUrl(doc.backgroundImage)) {
      addMaterial(`image:${normalizeUrl(doc.backgroundImage)}`, 'image', doc.backgroundImage, labels.background || labels.image, { left: 0, top: 0, width: doc.width, height: doc.height }, 'page')
    }

    widgets.forEach((w) => {
      if (!w) return
      // 在最底层且铺满页面的图片 → 背景；任何其他可见元素（组合本体除外）出现后，后面的图就不在最底层了
      const backdropHere = w.type === 'w-image' && !w.hidden && onlyBackdropsBelow && coversPage(w)
      if (!w.hidden && w.type !== 'w-group' && !(w.type === 'w-image' && coversPage(w))) onlyBackdropsBelow = false
      if (consumed.has(String(w.uuid))) return // đã đi cùng một mục Chữ
      if (w.type === 'w-image') {
        // 用户照片占位（slot / 已链接照片）属于用户内容，不入库
        if (w.slot === true || w.linkedPhotoId) {
          photoRects.push(rectOf(w))
          return
        }
        // 相框：mask 非空 → 容器素材；imgUrl 是用户放进相框里的图，不能入库
        if (isRemoteUrl(w.mask)) {
          addMaterial(`mask:${normalizeUrl(w.mask)}`, 'mask', w.mask, labels.mask, w)
        } else if (isRemoteUrl(w.imgUrl)) {
          // 铺满页面且下面没有其他元素 → 背景图（图层形式）
          const backdrop = backdropHere
          addMaterial(`image:${normalizeUrl(w.imgUrl)}`, 'image', w.imgUrl, backdrop ? labels.background || labels.image : labels.image, w, backdrop ? 'layer' : undefined)
        }
      } else if (w.type === 'w-svg' && isRemoteUrl(w.svgUrl)) {
        addMaterial(`svg:${normalizeUrl(w.svgUrl)}`, 'svg', w.svgUrl, labels.svg, w)
      } else if (w.type === 'w-group') {
        if (!textGroups.has(String(w.uuid))) return
        const children = descendants(w.uuid)
        const signature = textSignature(w, children)
        if (texts.has(signature)) return
        // 组件格式：子元素在前、组合本体放最后（与「保存模板」逻辑一致）
        const group = JSON.parse(JSON.stringify(w))
        const copies = JSON.parse(JSON.stringify(children))
        // 画布里是绝对坐标，组件需要以组合左上角为原点（插入时会整体居中）
        const originX = Number(w.left) || 0
        const originY = Number(w.top) || 0
        copies.forEach((c: any) => {
          c.left = (Number(c.left) || 0) - originX
          c.top = (Number(c.top) || 0) - originY
        })
        group.left = 0
        group.top = 0
        group.parent = '-1'
        if (group.record) {
          group.record.width = 0
          group.record.height = 0
        }
        const textPreview = copies.filter((c: any) => c.type === 'w-text').map((c: any) => plainText(c.text)).join(' ').slice(0, 30)
        texts.set(signature, {
          key: signature,
          title: `${titlePrefix}${textPreview || labels.group}`,
          widgets: [...copies, group],
          width: Number(w.width) || 0,
          height: Number(w.height) || 0,
          textPreview,
          source: 'group',
        })
      }
    })

    // Chữ trên khung (tự gộp): hộp nhóm = hình ∪ chữ, tọa độ con tính từ góc trên trái của hộp
    onShape.forEach((list, sid) => {
      const sh = byUuid.get(sid)
      const members = [sh, ...list]
      const x0 = Math.min(...members.map((m) => Number(m.left) || 0))
      const y0 = Math.min(...members.map((m) => Number(m.top) || 0))
      const x1 = Math.max(...members.map((m) => (Number(m.left) || 0) + (Number(m.width) || 0)))
      const y1 = Math.max(...members.map((m) => (Number(m.top) || 0) + (Number(m.height) || 0)))
      const width = Math.round(x1 - x0)
      const height = Math.round(y1 - y0)
      const groupUuid = `grp-${sid}`
      const group = { name: '组合', type: 'w-group', uuid: groupUuid, width, height, left: 0, top: 0, transform: '', opacity: 1, parent: '-1', isContainer: true, record: { width: 0, height: 0, minWidth: 0, minHeight: 0, dir: 'none' } }
      const copies = JSON.parse(JSON.stringify(members)).map((c: any) => ({ ...c, left: (Number(c.left) || 0) - x0, top: (Number(c.top) || 0) - y0, parent: groupUuid }))
      const signature = textSignature(group, copies)
      if (texts.has(signature)) return
      const textPreview = list.map((t) => plainText(t.text)).join(' ').slice(0, 30)
      texts.set(signature, { key: signature, title: `${titlePrefix}${textPreview || labels.group}`, widgets: [...copies, group], width, height, textPreview, source: 'onShape' })
    })

    // 独立文字（不在任何组合里）：自动包一层组合，才能作为「文字」tab 的组件
    widgets.forEach((w) => {
      if (w?.type !== 'w-text' || consumed.has(String(w.uuid))) return
      const parentExists = w.parent && String(w.parent) !== '-1' && widgets.some((g) => g && String(g.uuid) === String(w.parent))
      if (parentExists) return
      const width = Math.round(Number(w.width) || Number(w.record?.width) || (Number(w.fontSize) || 24) * 4)
      const height = Math.round(Number(w.height) || Number(w.record?.height) || (Number(w.fontSize) || 24) * (Number(w.lineHeight) || 1.5))
      const groupUuid = `grp-${w.uuid}`
      const group = { name: '组合', type: 'w-group', uuid: groupUuid, width, height, left: 0, top: 0, transform: '', opacity: 1, parent: '-1', isContainer: true, record: { width: 0, height: 0, minWidth: 0, minHeight: 0, dir: 'none' } }
      const child = JSON.parse(JSON.stringify(w))
      child.left = 0
      child.top = 0
      child.parent = groupUuid
      const signature = textSignature(group, [child])
      if (texts.has(signature)) return
      const textPreview = plainText(child.text).slice(0, 30)
      texts.set(signature, { key: signature, title: `${titlePrefix}${textPreview || labels.group}`, widgets: [child, group], width, height, textPreview, source: 'single' })
    })
  })

  return { materials: [...materials.values()], texts: [...texts.values()], photoRects }
}

/** 两个矩形是否「一个大致落在另一个里面」：相交面积 ≥ 较小者面积的 ratio（同一页） */
export function overlapsMostly(a: TRect, b: TRect, ratio = 0.6): boolean {
  if (a.page !== b.page) return false
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  if (w <= 0 || h <= 0) return false
  const smaller = Math.min(a.width * a.height, b.width * b.height)
  return smaller > 0 && (w * h) / smaller >= ratio
}
