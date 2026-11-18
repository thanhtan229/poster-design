/**
 * 按「内容」识别重复素材：URL 不同但图像相同（重复上传、复制出的多份）也能识别。
 * - SVG：取文本后比较规范化内容
 * - 位图 / mask：先比字节 SHA-256（完全相同），再比 16×16 缩略图（重新编码 / 缩放后的同图）
 * 任何一张图读取失败（跨域、404）则该项不参与去重，不影响其他项。
 */

export type TContentItem = { key: string; url: string; kind: 'image' | 'svg' | 'mask' }

const GRID = 16
/** 缩略图每通道平均差异阈值（0~255）。颜色不同的同形状素材差异远大于此值。 */
const PIXEL_THRESHOLD = 10
const ASPECT_TOLERANCE = 0.03

type TSig = { exact: string; aspect: number; pixels: Uint8ClampedArray | null }

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function rasterSignature(blob: Blob): Promise<Pick<TSig, 'aspect' | 'pixels'>> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = GRID
    canvas.height = GRID
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { aspect: bitmap.width / bitmap.height, pixels: null }
    ctx.clearRect(0, 0, GRID, GRID)
    ctx.drawImage(bitmap, 0, 0, GRID, GRID)
    return { aspect: bitmap.width / bitmap.height, pixels: ctx.getImageData(0, 0, GRID, GRID).data }
  } finally {
    bitmap.close()
  }
}

async function signatureOf(item: TContentItem): Promise<TSig | null> {
  try {
    const res = await fetch(item.url, { mode: 'cors', cache: 'force-cache' })
    if (!res.ok) return null
    if (item.kind === 'svg') {
      const text = (await res.text()).replace(/\s+/g, ' ').trim()
      return { exact: await sha256(new TextEncoder().encode(text).buffer as ArrayBuffer), aspect: 0, pixels: null }
    }
    const blob = await res.blob()
    const exact = await sha256(await blob.arrayBuffer())
    try {
      return { exact, ...(await rasterSignature(blob)) }
    } catch (e) {
      return { exact, aspect: 0, pixels: null } // 无法解码（如 SVG 作 mask）则只做字节比对
    }
  } catch (e) {
    return null
  }
}

function similar(a: TSig, b: TSig): boolean {
  if (a.exact === b.exact) return true
  if (!a.pixels || !b.pixels || !a.aspect || !b.aspect) return false
  if (Math.abs(a.aspect - b.aspect) / Math.max(a.aspect, b.aspect) > ASPECT_TOLERANCE) return false
  let diff = 0
  for (let i = 0; i < a.pixels.length; i++) diff += Math.abs(a.pixels[i] - b.pixels[i])
  return diff / a.pixels.length <= PIXEL_THRESHOLD
}

/** 返回 Map<重复项 key, 先出现的保留项 key>；同 kind 内比较，保留列表中靠前的一项 */
export async function findContentDuplicates(items: TContentItem[], concurrency = 6): Promise<Map<string, string>> {
  const sigs = new Map<string, TSig>()
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]
        const sig = await signatureOf(item)
        if (sig) sigs.set(item.key, sig)
      }
    }),
  )

  const duplicates = new Map<string, string>()
  const kept: TContentItem[] = []
  items.forEach((item) => {
    const sig = sigs.get(item.key)
    if (!sig) return
    const original = kept.find((k) => k.kind === item.kind && similar(sigs.get(k.key) as TSig, sig))
    if (original) duplicates.set(item.key, original.key)
    else kept.push(item)
  })
  return duplicates
}
