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
export type TCollectionItem = { id: number; url: string; thumb: string; hq: string; width: number; height: number; hash: string; name?: string }

export const listPhotos = () => fetch<{ list: TPhoto[]; favorites: string[]; total: number }>(base, {}, 'get')
export const deletePhoto = (id: number, inUse: string[]) => fetch<{ removed: boolean; filesDeleted: boolean }>(`${base}/delete`, { id, inUse }, 'post')
export const clearPreview = (inUse: string[]) => fetch<{ total: number; deletable: number; kept: number }>(`${base}/clear-preview`, { inUse }, 'post')
export const clearAll = (inUse: string[]) => fetch<{ removed: number; filesDeleted: number; kept: number }>(`${base}/clear`, { inUse }, 'post')
export const favorite = (id: number) => fetch<{ item: TCollectionItem; created: boolean }>(`${base}/favorite`, { id }, 'post')
export const unfavorite = (hash: string, inUse: string[]) => fetch<{ removed: boolean; filesDeleted: boolean }>(`${base}/unfavorite`, { hash, inUse }, 'post')

/** Tải một ảnh lên (multipart). Server tạo ảnh nhẹ + ảnh thu nhỏ, bỏ qua ảnh trùng. */
export const uploadPhoto = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  form.append('name', file.name)
  form.append('lastModified', String(file.lastModified || 0))
  return fetch<{ duplicate: boolean; photo: TPhoto }>(`${base}/upload`, form, 'post')
}
