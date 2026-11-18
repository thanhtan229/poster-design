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
}

export type TExtractedText = {
  key: string
  title: string
  /** 组件数据：组合子元素在前、组合本体在最后 */
  widgets: any[]
  width: number
  height: number
  textPreview: string
}

/** photoRects：用户照片占位（slot / 已链接照片）的位置，用来判断哪些形状是相框 */
export type TExtractResult = { materials: TExtractedMaterial[]; texts: TExtractedText[]; photoRects: TRect[] }

/** 文字签名需要参与比较的字段，前后端必须保持一致（见 service/src/db/assetDedupe.ts） */
export const TEXT_SIGNATURE_FIELDS = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'lineHeight', 'writingMode', 'textAlign'] as const

export function textSignature(group: any, children: any[]): string {
  const parts = children
    .filter((w) => w?.type === 'w-text')
    .map((w) => TEXT_SIGNATURE_FIELDS.map((k) => String(w[k] ?? '')).join('|'))
  return `${Math.round(Number(group?.width) || 0)}x${Math.round(Number(group?.height) || 0)}#${parts.join('~')}`
}

/** 兼容历史数据格式，统一返回「每页的扁平元素数组」 */
export function normalizePages(data: any): any[][] {
  let parsed = data
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch (_e) {
      return []
    }
  }
  if (parsed && typeof parsed.data === 'string' && !Array.isArray(parsed)) return normalizePages(parsed.data)
  if (Array.isArray(parsed)) {
    if (parsed.length && parsed.every((p) => p && Array.isArray(p.layers))) return parsed.map((p) => p.layers)
    return [parsed] // type=1 组件：直接是元素数组
  }
  if (parsed && Array.isArray(parsed.widgets)) return [parsed.widgets]
  if (parsed && Array.isArray(parsed.layers)) return [parsed.layers]
  return []
}

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

export type TExtractLabels = { image: string; svg: string; mask: string; group: string }
const DEFAULT_LABELS: TExtractLabels = { image: '图片', svg: '矢量', mask: '相框', group: '文字组合' }

export function extractAssets(data: any, titlePrefix = '', labels: TExtractLabels = DEFAULT_LABELS): TExtractResult {
  const materials = new Map<string, TExtractedMaterial>()
  const texts = new Map<string, TExtractedText>()
  const photoRects: TRect[] = []

  normalizePages(data).forEach((widgets, page) => {
    if (!Array.isArray(widgets)) return
    const childrenOf = (uuid: string) => widgets.filter((w) => w && String(w.parent) === String(uuid))
    const descendants = (uuid: string): any[] => childrenOf(uuid).flatMap((c) => [c, ...(c.type === 'w-group' ? descendants(c.uuid) : [])])

    const rectOf = (w: any): TRect => ({ page, left: Number(w.left) || 0, top: Number(w.top) || 0, width: Number(w.width) || 0, height: Number(w.height) || 0 })
    const addMaterial = (key: string, type: TExtractedMaterial['type'], url: string, label: string, w: any) => {
      const existing = materials.get(key)
      if (existing) {
        existing.rects.push(rectOf(w))
        return
      }
      materials.set(key, { key, type, url: url.trim(), title: `${titlePrefix}${label} ${materials.size + 1}`, width: w.width, height: w.height, rects: [rectOf(w)] })
    }

    widgets.forEach((w) => {
      if (!w) return
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
          addMaterial(`image:${normalizeUrl(w.imgUrl)}`, 'image', w.imgUrl, labels.image, w)
        }
      } else if (w.type === 'w-svg' && isRemoteUrl(w.svgUrl)) {
        addMaterial(`svg:${normalizeUrl(w.svgUrl)}`, 'svg', w.svgUrl, labels.svg, w)
      } else if (w.type === 'w-group') {
        const children = descendants(w.uuid)
        if (!children.some((c) => c.type === 'w-text')) return
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
        })
      }
    })

    // 独立文字（不在任何组合里）：自动包一层组合，才能作为「文字」tab 的组件
    widgets.forEach((w) => {
      if (w?.type !== 'w-text') return
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
      texts.set(signature, { key: signature, title: `${titlePrefix}${textPreview || labels.group}`, widgets: [child, group], width, height, textPreview })
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
