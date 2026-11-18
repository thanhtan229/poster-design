// [TINIX] Xuất một trang bằng Chromium của service từ dữ liệu đang mở (không cần lưu thiết kế vào CSDL).
import config from '@/config'
import { useWidgetStore } from '@/store'
import { exportTimeoutMs } from './units'

export async function renderPageOnServer(pageIndex: number, format: 'png' | 'jpg'): Promise<Blob> {
  const layout = useWidgetStore().dLayouts[pageIndex]
  if (!layout) throw new Error('Page unavailable')
  const { width, height } = layout.global as any
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(120000, exportTimeoutMs(width, height)))
  try {
    const response = await fetch(`${config.SCREEN_URL}/api/tinix/export-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout, format }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body: any = await response.json().catch(() => ({}))
      throw new Error(body.message || 'HTTP ' + response.status)
    }
    return await response.blob()
  } finally {
    clearTimeout(timer)
  }
}
