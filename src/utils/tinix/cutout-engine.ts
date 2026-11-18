// [TINIX] Chọn model tách nền ảnh: BiRefNet (GPU local qua service, chất lượng cao) hoặc U²-Net (chạy trong trình duyệt, nhanh).
import config from '@/config'

export type CutoutEngine = 'birefnet' | 'u2net'
const KEY = 'tinix.cutoutEngine'

export function getCutoutEngine(): CutoutEngine {
  return localStorage.getItem(KEY) === 'u2net' ? 'u2net' : 'birefnet' // mặc định BiRefNet
}
export function setCutoutEngine(engine: CutoutEngine) {
  localStorage.setItem(KEY, engine)
}

/** Tách nền bằng BiRefNet qua service; ném lỗi (kèm thông báo) nếu service/model/GPU chưa sẵn sàng */
export async function birefnetCutout(file: File): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 200000)
  try {
    const res = await fetch(`${config.SCREEN_URL}/api/tinix/cutout/birefnet`, { method: 'POST', body: form, signal: controller.signal })
    if (!res.ok) {
      let message = 'BiRefNet chưa sẵn sàng'
      try { message = (await res.json()).message || message } catch { /* không phải JSON */ }
      throw new Error(message)
    }
    if (!(res.headers.get('content-type') || '').includes('image/png')) throw new Error('BiRefNet trả về ảnh không hợp lệ')
    return await res.blob()
  } finally {
    clearTimeout(timer)
  }
}
