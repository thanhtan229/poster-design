// [TINIX] Start editor (Vite) + API service together. Works on Windows, macOS, Linux.
// Usage: npm run tinix:dev        (Ctrl+C stops both)
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const procs = [
  { name: 'editor ', color: '\x1b[36m', cwd: root },
  { name: 'service', color: '\x1b[35m', cwd: path.join(root, 'service') },
].map(({ name, color, cwd }) => {
  // one command string + shell: npm is a .cmd on Windows, and Node 24 warns on args arrays with shell
  const child = spawn(`${npm} run dev`, { cwd, shell: true, env: process.env })
  const prefix = `${color}[${name}]\x1b[0m `
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n')
    })
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    console.log(`${prefix}đã dừng (mã ${code})`)
    shutdown(code ?? 0)
  })
  return child
})

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const p of procs) {
    if (p.exitCode !== null) continue
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'])
    else p.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('\nTinixPoster: mở http://127.0.0.1:5173  (API: http://127.0.0.1:7001)\n')
