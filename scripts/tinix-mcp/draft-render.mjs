// [TINIX] Use the local TinixPoster renderer for a draft without writing to the library.
export function materialRenderService() {
  const url = new URL(process.env.TINIX_APP_URL || 'http://127.0.0.1:7001')
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('TinixPoster cần một địa chỉ HTTP trên 127.0.0.1 để render bản nháp.')
  }
  return url.origin
}

export async function renderMaterialLayout(layout, signal, cropPreview = false) {
  const { referenceGuide, ...global } = layout.global
  const response = await fetch(materialRenderService() + '/api/tinix/export-render', {
    method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ layout: { ...layout, global }, format: 'png', ...(cropPreview && { cropPreview }) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(100000)]),
  })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) {
    await response.body?.cancel()
    throw new Error('TinixPoster chưa render được bản nháp.')
  }
  return Buffer.from(await response.arrayBuffer())
}
