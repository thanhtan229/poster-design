/**
 * [TINIX] Tiny validators (zod does not compile under the service's TypeScript 3.9).
 * Each helper throws Error("<path>: <reason>") so the retry prompt can tell the model what was wrong.
 */
export function obj(v: any, path: string): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path}: phải là object`)
  return v
}
export function arr(v: any, path: string, min = 0, max = 100): any[] {
  if (!Array.isArray(v)) throw new Error(`${path}: phải là mảng`)
  if (v.length < min) throw new Error(`${path}: cần ít nhất ${min} phần tử`)
  return v.slice(0, max)
}
export function str(v: any, path: string, opts: { optional?: boolean; max?: number } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return ''
    throw new Error(`${path}: thiếu chuỗi`)
  }
  if (typeof v !== 'string') v = String(v)
  return opts.max ? v.slice(0, opts.max) : v
}
export function num01(v: any, path: string, def?: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) {
    if (def !== undefined) return def
    throw new Error(`${path}: phải là số 0..1`)
  }
  return Math.min(1, Math.max(0, n))
}
export function oneOf<T extends string>(v: any, values: readonly T[], def: T): T {
  return values.includes(v) ? v : def
}
export function color(v: any, def = '#ffffff'): string {
  const s = String(v || '').trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s : def
}
export function bool(v: any): boolean {
  return v === true || v === 'true' || v === 1
}
