/**
 * [TINIX] Kết quả API của app: thành công có `result` → trả về result; lỗi nghiệp vụ (code ≠ 200) KHÔNG ném lỗi mà trả nguyên `{ code, msg }`.
 * Dùng hàm này sau mỗi lời gọi ghi dữ liệu để không báo "thành công" nhầm.
 */
export function apiFailed(res: any): boolean {
  return !!res && typeof res === 'object' && typeof res.code === 'number' && res.code !== 200
}

export function apiMessage(res: any, fallback: string): string {
  return (res && (res.msg || res.message)) || fallback
}
