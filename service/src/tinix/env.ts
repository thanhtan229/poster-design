/**
 * [TINIX] Load service/.env before any other module reads process.env.
 *
 * Must be the FIRST import in main.ts: configs.ts and db/bootstrap.ts read
 * process.env (AUTH_SECRET, PORT, DEFAULT_ADMIN_*) when they are evaluated.
 * Uses Node's built-in loader (Node >= 20.12), so no extra dependency.
 */
import fs from 'fs'
import path from 'path'

const envFile = path.join(process.cwd(), '.env')

if (fs.existsSync(envFile)) {
  const loader = (process as any).loadEnvFile as ((file: string) => void) | undefined
  if (typeof loader === 'function') {
    loader(envFile)
  } else {
    console.warn('[tinix:env] Node quá cũ để đọc .env (cần >= 20.12). Bỏ qua file .env.')
  }
}

if (!process.env.AUTH_SECRET) {
  console.warn('[tinix:env] Chưa đặt AUTH_SECRET trong service/.env — đang dùng khóa mặc định công khai. Xem service/.env.example.')
}

/** Address the API server binds to. Default: only this machine. */
export const listenHost = process.env.HOST || '127.0.0.1'
