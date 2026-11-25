// [TINIX] Production-pixel coverage relative to the finished page.
export const trimEdges = ['left', 'top', 'right', 'bottom'] as const
export type TrimEdge = typeof trimEdges[number]
export type TrimStatus = 'inside' | 'touching' | 'overflow' | 'unknown'

// [TINIX] One recent measurement per layer, bounded to a single preview session.
export function createTrimCache<T extends { status: TrimStatus }>(capacity = 256) {
  const entries = new Map<string, { key: string; result: T }>()
  return {
    get(id: string, key: string) {
      const entry = entries.get(id)
      if (entry?.key !== key) return
      entries.delete(id)
      entries.set(id, entry)
      return entry.result
    },
    set(id: string, key: string, result: T) {
      if (result.status === 'unknown') return
      entries.delete(id)
      entries.set(id, { key, result })
      if (entries.size > capacity) {
        const oldest = entries.keys().next()
        if (!oldest.done) entries.delete(oldest.value)
      }
    },
  }
}

export function measureTrimAlpha(alpha: Uint8Array, width: number, height: number, left: number, top: number,
  pageWidth: number, pageHeight: number) {
  const extent = { left: 0, top: 0, right: 0, bottom: 0 }
  const distance = { left: Infinity, top: Infinity, right: Infinity, bottom: Infinity }
  let count = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 128) continue
    count++
    const pageX = x + left
    const pageY = y + top
    distance.left = Math.min(distance.left, pageX)
    distance.top = Math.min(distance.top, pageY)
    distance.right = Math.min(distance.right, pageWidth - pageX - 1)
    distance.bottom = Math.min(distance.bottom, pageHeight - pageY - 1)
  }
  if (!count) return { status: 'unknown' as TrimStatus, edges: [] as TrimEdge[], extent }
  for (const edge of trimEdges) extent[edge] = Math.max(0, -distance[edge])
  const overflow = trimEdges.filter(edge => extent[edge] > 0)
  const touching = trimEdges.filter(edge => distance[edge] <= 1)
  return {
    status: (overflow.length ? 'overflow' : touching.length ? 'touching' : 'inside') as TrimStatus,
    edges: overflow.length ? overflow : touching, extent,
  }
}
