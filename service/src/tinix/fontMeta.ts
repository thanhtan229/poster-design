/**
 * [TINIX] Làm sạch nhóm/tag font nhận từ form quản trị (tách riêng để kiểm thử được mà không phải nạp cả service admin).
 */
import { CATEGORIES } from '../db/fonts'

export function cleanCategory(v: any): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return CATEGORIES.indexOf(s) >= 0 ? s : ''
}

/** Nhận mảng hoặc chuỗi phân tách bằng dấu phẩy; tối đa 10 tag, mỗi tag tối đa 30 ký tự, bỏ trùng. Trả về chuỗi JSON. */
export function cleanTags(v: any): string {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const out: string[] = []
  for (const t of arr) {
    const s = String(t).trim().slice(0, 30)
    if (s && out.indexOf(s) < 0) out.push(s)
    if (out.length >= 10) break
  }
  return JSON.stringify(out)
}
