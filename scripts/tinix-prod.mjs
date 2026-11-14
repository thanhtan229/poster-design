// [TINIX] Chạy TinixPoster ở chế độ production MỘT CỔNG: service tự phục vụ bản build frontend (dist/) tại http://127.0.0.1:7001.
// Không cần Vite dev server: khởi động nhanh hơn, ít tài nguyên hơn, ổn định hơn.
//
//   npm run tinix:prod                → build frontend nếu chưa có dist/ (hoặc code mới hơn dist/), rồi chạy
//   npm run tinix:prod -- --build     → ép build lại
//   npm run tinix:prod -- --no-build  → không build, dùng dist/ hiện có
// Ctrl+C dừng app. Dữ liệu dùng chung với chế độ dev (service/data, service/static).
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist', 'index.html')
const args = process.argv.slice(2)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const port = process.env.PORT || '7001'

/** mtime mới nhất trong src/ và các file cấu hình build */
function newestSource() {
  let newest = 0
  const walk = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, n.name)
      if (n.isDirectory()) walk(f)
      else newest = Math.max(newest, fs.statSync(f).mtimeMs)
    }
  }
  walk(path.join(root, 'src'))
  for (const f of ['package.json', 'vite.config.ts', 'index.html']) if (fs.existsSync(path.join(root, f))) newest = Math.max(newest, fs.statSync(path.join(root, f)).mtimeMs)
  return newest
}

const hasDist = fs.existsSync(dist)
const stale = hasDist && newestSource() > fs.statSync(dist).mtimeMs
const needBuild = !args.includes('--no-build') && (args.includes('--build') || !hasDist || stale)
if (needBuild) {
  console.log(hasDist ? (stale ? 'Mã nguồn mới hơn bản build → build lại frontend…' : 'Build lại frontend…') : 'Chưa có bản build → build frontend (lần đầu ~15 giây)…')
  const r = spawnSync(`${npx} vite build`, { cwd: root, shell: true, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('[X] Build frontend lỗi. Dùng "npm run tinix:dev" để xem lỗi chi tiết.')
    process.exit(r.status || 1)
  }
}

const env = {
  ...process.env,
  NODE_ENV: 'development', // service dùng thư mục static theo cwd + Chrome của Puppeteer (xem service/src/configs.ts)
  TINIX_SERVE_DIST: '1',
  TINIX_DRAW_URL: `http://127.0.0.1:${port}/draw`, // trang vẽ để Puppeteer xuất ảnh
  TS_NODE_TRANSPILE_ONLY: 'true',
}
const child = spawn(`${npx} ts-node src/main.ts`, { cwd: path.join(root, 'service'), shell: true, env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
const stop = () => {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGTERM')
  setTimeout(() => process.exit(0), 500)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

console.log(`\nTinixPoster (production): mở http://127.0.0.1:${port}\n`)
