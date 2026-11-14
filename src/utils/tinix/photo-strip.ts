/**
 * [TINIX] Trạng thái dùng chung của dải ảnh phía dưới editor: danh sách ảnh đã tải, bộ sưu tập yêu thích, bộ lọc/sắp xếp, tải lên nhiều ảnh.
 * UI: src/components/business/photo-strip/PhotoStrip.vue. Server: service/src/tinix/photos/.
 */
import { reactive } from 'vue'
import * as photosApi from '@/api/tinix-photos'
import { apiFailed, apiMessage } from '@/utils/tinix/api-result'

export type TPhoto = photosApi.TPhoto
/** Một ô trong dải ảnh (từ ảnh đã tải hoặc từ bộ sưu tập) */
export type StripItem = {
  key: string
  /** id trong user_images (ảnh đã tải); 0 với mục bộ sưu tập */
  id: number
  fromCollection: boolean
  thumb: string
  /** ảnh nhẹ dùng trên canvas */
  web: string
  /** ảnh gốc dùng khi xuất ('' nếu ảnh cũ chưa có bản nhẹ) */
  hq: string
  width: number
  height: number
  hash: string
  name: string
  taken: string
  order: number
}

export type FilterKey = 'all' | 'unused' | 'used'
export type SortKey = 'taken' | 'name' | 'new'

export const photoState = reactive({
  photos: [] as TPhoto[],
  favorites: [] as photosApi.TLibraryFavorite[], // ảnh đã ★ vào thư viện "Ảnh" (hash, url nhẹ, url gốc, nhóm)
  loading: false,
  loaded: false,
  unauthorized: false,
  filter: 'all' as FilterKey,
  sort: 'taken' as SortKey,
  // tự áp dụng mẫu cho lượt ảnh thêm vào trang (nhớ lại cho lần sau)
  autoApply: localStorage.getItem('tinix.photoDock.auto') === '1',
  autoCate: localStorage.getItem('tinix.photoDock.autoCate') || '', // id nhóm mẫu ('' = mọi nhóm)
  lastAuto: null as null | { pageIndex: number; templateId: number; title: string; photos: any[]; cate: string },
  up: { active: false, total: 0, done: 0, failed: 0, dup: 0, errors: [] as string[] },
})

export function setAutoApply(v: boolean) {
  photoState.autoApply = v
  localStorage.setItem('tinix.photoDock.auto', v ? '1' : '0')
}
export function setAutoCate(c: string) {
  photoState.autoCate = c
  localStorage.setItem('tinix.photoDock.autoCate', c)
}

export async function reloadPhotos() {
  photoState.loading = true
  try {
    const res: any = await photosApi.listPhotos()
    if (apiFailed(res)) {
      photoState.unauthorized = res.code === 401
      return
    }
    photoState.unauthorized = false
    photoState.photos = res.list || []
    photoState.favorites = res.favorites || []
    photoState.loaded = true
  } catch (e) {
    // mất kết nối: giữ danh sách cũ
  } finally {
    photoState.loading = false
  }
}

export function toStripItems(): StripItem[] {
  return photoState.photos.map((p) => ({
    key: 'p' + p.id,
    id: p.id,
    fromCollection: false,
    thumb: p.thumb_url || p.web_url || p.url,
    web: p.web_url || p.url,
    hq: p.web_url && p.web_url !== p.url ? p.url : '',
    width: p.width,
    height: p.height,
    hash: p.hash || '',
    name: p.name || '',
    taken: p.taken_at || '',
    order: p.id,
  }))
}

export function sortItems(items: StripItem[], sort: SortKey): StripItem[] {
  const byName = (a: StripItem, b: StripItem) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  const list = items.slice()
  if (sort === 'name') return list.sort(byName)
  if (sort === 'new') return list.sort((a, b) => b.order - a.order)
  // theo thời gian chụp/chỉnh sửa (tăng dần); chưa có thời gian thì xếp cuối theo tên
  return list.sort((a, b) => (a.taken && b.taken ? (a.taken < b.taken ? -1 : a.taken > b.taken ? 1 : byName(a, b)) : a.taken ? -1 : b.taken ? 1 : byName(a, b)))
}

/** Giá trị đưa cho canvas khi thêm/kéo ảnh: url = ảnh nhẹ, hq = ảnh gốc dùng lúc xuất */
export function placeValue(it: StripItem) {
  return { id: it.id, url: it.web, hq: it.hq || undefined, width: it.width, height: it.height, thumb: it.thumb }
}

/** Tải nhiều ảnh (tối đa 3 ảnh cùng lúc). Trả về thống kê để báo kết quả. */
export async function uploadFiles(files: File[]) {
  const isImage = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|tiff?|avif)$/i.test(f.name)
  const imgs = files.filter(isImage)
  const skipped = files.length - imgs.length
  if (!imgs.length) return { total: 0, done: 0, failed: 0, dup: 0, skipped, errors: [] as string[] }
  Object.assign(photoState.up, { active: true, total: imgs.length, done: 0, failed: 0, dup: 0, errors: [] })
  let next = 0
  const worker = async () => {
    while (next < imgs.length) {
      const f = imgs[next++]
      try {
        const res: any = await photosApi.uploadPhoto(f)
        if (apiFailed(res)) throw new Error(apiMessage(res, 'Lỗi không rõ'))
        if (res.duplicate) photoState.up.dup++
        else photoState.photos.unshift(res.photo)
      } catch (e: any) {
        photoState.up.failed++
        photoState.up.errors.push(`${f.name}: ${(e && (e.message || e.msg)) || e}`)
      }
      photoState.up.done++
    }
  }
  await Promise.all([worker(), worker(), worker()])
  photoState.up.active = false
  return { ...photoState.up, skipped }
}
