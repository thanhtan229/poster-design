/**
 * [TINIX] History + cost log for every AI call (table ai_jobs, see tinix/db/migrate.ts).
 */
import { getDB } from '../../db'
import { getTinixAiSettings } from './settings'

export type AiJobKind = 'suggest_text' | 'rewrite_text' | 'find_font' | 'tag_fonts' | 'rebuild'

export function estimateCost(tokensIn: number, tokensOut: number): number {
  const s = getTinixAiSettings()
  return Math.round(((tokensIn * s.price_in_per_1m + tokensOut * s.price_out_per_1m) / 1e6) * 100) / 100
}

export function logJob(job: {
  kind: AiJobKind
  input?: any
  output?: any
  model?: string
  tokensIn?: number
  tokensOut?: number
  status: 'ok' | 'error'
  error?: string
}): number {
  const tokensIn = Number(job.tokensIn) || 0
  const tokensOut = Number(job.tokensOut) || 0
  const info = getDB()
    .prepare(
      `INSERT INTO ai_jobs (kind, input_summary, output, model, tokens_in, tokens_out, cost_vnd, status, error)
       VALUES (@kind, @input, @output, @model, @tokensIn, @tokensOut, @cost, @status, @error)`,
    )
    .run({
      kind: job.kind,
      input: JSON.stringify(job.input ?? {}).slice(0, 20000),
      output: JSON.stringify(job.output ?? {}).slice(0, 200000),
      model: job.model || '',
      tokensIn,
      tokensOut,
      cost: estimateCost(tokensIn, tokensOut),
      status: job.status,
      error: String(job.error || '').slice(0, 2000),
    })
  return Number(info.lastInsertRowid)
}

/** Spend of the current month (local time). */
export function monthUsage(month?: string): { month: string; jobs: number; cost_vnd: number; tokens_in: number; tokens_out: number } {
  // created_at is stored in local time (datetime('now','localtime')) → compare with the local month
  const now = new Date()
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : local
  const row: any = getDB()
    .prepare(`SELECT COUNT(*) AS jobs, COALESCE(SUM(cost_vnd),0) AS cost, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout
              FROM ai_jobs WHERE substr(created_at, 1, 7) = ?`)
    .get(m)
  return { month: m, jobs: Number(row.jobs) || 0, cost_vnd: Math.round((Number(row.cost) || 0) * 100) / 100, tokens_in: Number(row.tin) || 0, tokens_out: Number(row.tout) || 0 }
}

/** Throws when the monthly limit is reached (0 = unlimited). */
export function assertWithinMonthlyLimit(): void {
  const { monthly_limit_vnd } = getTinixAiSettings()
  if (!monthly_limit_vnd) return
  const { cost_vnd } = monthUsage()
  if (cost_vnd >= monthly_limit_vnd) {
    throw new Error(`Đã chạm giới hạn chi phí AI tháng này (${cost_vnd.toLocaleString('vi-VN')}đ / ${monthly_limit_vnd.toLocaleString('vi-VN')}đ). Tăng giới hạn trong Cài đặt AI.`)
  }
}

export function listJobs(limit = 30, kind?: string): any[] {
  const n = Math.min(200, Math.max(1, Math.floor(Number(limit) || 30)))
  const rows = kind
    ? getDB().prepare('SELECT * FROM ai_jobs WHERE kind = ? ORDER BY id DESC LIMIT ?').all(kind, n)
    : getDB().prepare('SELECT * FROM ai_jobs ORDER BY id DESC LIMIT ?').all(n)
  return (rows as any[]).map((r) => ({
    ...r,
    input_summary: safeParse(r.input_summary),
    output: safeParse(r.output),
  }))
}

function safeParse(s: string) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return s
  }
}
