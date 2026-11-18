/**
 * 从模板 / 画布数据中提取可入库的元素：
 * - 图片 / SVG / 容器（相框 mask）→ 「素材」tab（materials 表）
 * - 含文字的组合 → 「文字」tab（type=1 的组件模板）
 * 提取时按稳定 key 在本次范围内去重；与库内已有数据的去重由后端完成。
 */

export type TExtractedMaterial = {
  key: string
  type: 'image' | 'svg' | 'mask'
  url: string
  title: string
  width?: number
  height?: number
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

export type TExtractResult = { materials: TExtractedMaterial[]; texts: TExtractedText[] }

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

  normalizePages(data).forEach((widgets) => {
    if (!Array.isArray(widgets)) return
    const childrenOf = (uuid: string) => widgets.filter((w) => w && String(w.parent) === String(uuid))
    const descendants = (uuid: string): any[] => childrenOf(uuid).flatMap((c) => [c, ...(c.type === 'w-group' ? descendants(c.uuid) : [])])

    widgets.forEach((w) => {
      if (!w) return
      if (w.type === 'w-image') {
        // 用户照片占位（slot / 已链接照片）属于用户内容，不入库
        if (w.slot === true || w.linkedPhotoId) return
        // 相框：mask 非空 → 容器素材；imgUrl 是用户放进相框里的图，不能入库
        if (isRemoteUrl(w.mask)) {
          const key = `mask:${normalizeUrl(w.mask)}`
          if (!materials.has(key)) materials.set(key, { key, type: 'mask', url: w.mask.trim(), title: `${titlePrefix}${labels.mask} ${materials.size + 1}`, width: w.width, height: w.height })
        } else if (isRemoteUrl(w.imgUrl)) {
          const key = `image:${normalizeUrl(w.imgUrl)}`
          if (!materials.has(key)) materials.set(key, { key, type: 'image', url: w.imgUrl.trim(), title: `${titlePrefix}${labels.image} ${materials.size + 1}`, width: w.width, height: w.height })
        }
      } else if (w.type === 'w-svg' && isRemoteUrl(w.svgUrl)) {
        const key = `svg:${normalizeUrl(w.svgUrl)}`
        if (!materials.has(key)) materials.set(key, { key, type: 'svg', url: w.svgUrl.trim(), title: `${titlePrefix}${labels.svg} ${materials.size + 1}`, width: w.width, height: w.height })
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

  return { materials: [...materials.values()], texts: [...texts.values()] }
}
