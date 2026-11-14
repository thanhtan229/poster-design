/**
 * [TINIX] API ảnh người dùng tải lên (dải ảnh phía dưới editor). Server: service/src/tinix/photos/routes.ts
 */
import fetch from '@/utils/axios'
import _config from '@/config'

const base = `${_config.SCREEN_URL}/api/tinix/photos`

export type TPhoto = {
  id: number
  url: string // ảnh gốc (chỉ dùng khi xuất)
  web_url: string // ảnh nhẹ (dùng trên canvas); rỗng với ảnh cũ chưa có bản nhẹ
  thumb_url: string
  width: number
  height: number
  hash: string
  size: number
  taken_at: string
  name: string
  created_at: string
}
/** Ảnh đã ★ vào thư viện "Ảnh" của app (xuất phát từ ảnh tải lên) */
export type TLibraryFavorite = { hash: string; url: string; hq: string; cate: string }

export const listPhotos = () => fetch<{ list: TPhoto[]; favorites: TLibraryFavorite[]; total: number }>(base, {}, 'get')
export const deletePhoto = (id: number, inUse: string[]) => fetch<{ removed: boolean; filesDeleted: boolean }>(`${base}/delete`, { id, inUse }, 'post')
export const clearPreview = (inUse: string[]) => fetch<{ total: number; deletable: number; kept: number }>(`${base}/clear-preview`, { inUse }, 'post')
export const clearAll = (inUse: string[]) => fetch<{ removed: number; filesDeleted: number; kept: number }>(`${base}/clear`, { inUse }, 'post')
/** ★: thêm ảnh vào một nhóm có sẵn (cate) hoặc nhóm mới (newName) trong tab Ảnh */
export const favorite = (id: number, target: { cate?: string; newName?: string }) => fetch<{ item: any; created: boolean; cate: string; catName: string }>(`${base}/favorite`, { id, ...target }, 'post')
export const unfavorite = (hash: string, inUse: string[]) => fetch<{ removed: boolean; filesDeleted: boolean }>(`${base}/unfavorite`, { hash, inUse }, 'post')

/** Tải một ảnh lên (multipart). Server tạo ảnh nhẹ + ảnh thu nhỏ, bỏ qua ảnh trùng. */
export const uploadPhoto = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  form.append('name', file.name)
  form.append('lastModified', String(file.lastModified || 0))
  return fetch<{ duplicate: boolean; photo: TPhoto }>(`${base}/upload`, form, 'post')
}
