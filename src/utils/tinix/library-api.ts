// [TINIX] Gọi API thư viện thành phần / chất liệu (service/src/tinix/library.ts) và báo cho các tab tải lại khi thư viện đổi.
import config from '@/config'

export type LibraryRef = { kind: 'comp'; id: number } | { kind: 'material'; cate: string; url: string }

/** Sự kiện toàn cục: tab Chữ / Chất liệu nghe để tải lại danh sách */
export const LIBRARY_CHANGED = 'tinix:library-changed'
export function notifyLibraryChanged(kind: 'comp' | 'material') {
  window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED, { detail: { kind } }))
}

async function call<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${config.SCREEN_URL}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* không phải JSON */
  }
  if (!res.ok) throw new Error(json?.message || `Lỗi máy chủ (${res.status})`)
  return json as T
}

export type CompInfo = { id: number; title: string; cover: string; width: number; height: number; cate: string }
export const getComp = (id: number) => call<CompInfo>(`/api/tinix/library/comp/${id}`)
export const saveComp = (body: { id?: number; title?: string; cate?: string; widgets?: any[]; width?: number; height?: number }) => call<{ id: number; coverOk: boolean }>('/api/tinix/library/comp/save', body)
export const duplicateComp = (id: number) => call<{ id: number; coverOk: boolean }>('/api/tinix/library/comp/duplicate', { id })
export const deleteComp = (id: number) => call<{ ok: boolean }>('/api/tinix/library/comp/delete', { id })

export const createMaterial = (cate: string, asset: any) => call<{ ok: boolean; asset: any }>('/api/tinix/library/material/create', { cate, asset })
export const updateMaterial = (cate: string, url: string, patch: any, toCate?: string) => call<{ ok: boolean; asset: any; cate: string }>('/api/tinix/library/material/update', { cate, url, patch, toCate })
export const deleteMaterial = (cate: string, url: string) => call<{ ok: boolean }>('/api/tinix/library/material/delete', { cate, url })
