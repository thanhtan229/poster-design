/**
 * [TINIX] Tạo ảnh xem trước còn thiếu cho font, chạy từ trang admin.
 * Gọi lại đúng script có sẵn scripts/tinix-font-previews.mjs (chỉ làm font chưa có ảnh).
 * Chỉ chạy một tiến trình tại một thời điểm; trạng thái giữ trong bộ nhớ.
 */
import { spawn } from 'child_process'
import path from 'path'

type PreviewState = {
  running: boolean
  startedAt: number | null
  finishedAt: number | null
  exitCode: number | null
  log: string
}

const MAX_LOG = 4000
const state: PreviewState = { running: false, startedAt: null, finishedAt: null, exitCode: null, log: '' }

function appendLog(chunk: string) {
  state.log = (state.log + chunk).slice(-MAX_LOG)
}

/** Thư mục gốc repo: service được chạy với cwd = thư mục service/ */
function scriptPath(): string {
  return path.resolve(process.cwd(), '..', 'scripts', 'tinix-font-previews.mjs')
}

export function getPreviewStatus(): PreviewState {
  return { ...state }
}

/** Bắt đầu tạo ảnh còn thiếu. Trả về false nếu đang chạy sẵn. */
export function startPreviews(): boolean {
  if (state.running) return false
  state.running = true
  state.startedAt = Date.now()
  state.finishedAt = null
  state.exitCode = null
  state.log = ''
  const child = spawn(process.execPath, [scriptPath()], { cwd: path.resolve(process.cwd(), '..'), windowsHide: true })
  child.stdout.on('data', (d) => appendLog(String(d)))
  child.stderr.on('data', (d) => appendLog(String(d)))
  child.on('error', (e) => {
    appendLog(`\n[lỗi khởi động] ${e.message}`)
    state.running = false
    state.finishedAt = Date.now()
    state.exitCode = -1
  })
  child.on('close', (code) => {
    state.running = false
    state.finishedAt = Date.now()
    state.exitCode = code
  })
  return true
}
