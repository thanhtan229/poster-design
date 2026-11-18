/** Own a single lazy CUDA worker; no external inference API. */
import express from 'express'
import multiparty from 'multiparty'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import readline from 'readline'
import { filePath } from '../configs'

const router = express.Router()
const root = path.resolve(process.cwd(), '..') // service cwd, including compiled production runs
let worker: any = null
let pending: { resolve: Function; reject: Function; timer: any } | null = null
let busy = false
let idle: any = null
function reset(error: Error) {
  if(idle) { clearTimeout(idle); idle = null }
  const old = worker; worker = null
  if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null }
  if (old) old.kill()
}
function infer(source: string, destination: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if(idle) { clearTimeout(idle); idle = null }
    if (!worker) {
      const python = process.env.TINIX_BIREFNET_PYTHON || path.join(root, '.runtime/birefnet-venv/Scripts/python.exe')
      if (!fs.existsSync(python)) return reject(new Error('Chưa cài BiRefNet. Chạy scripts/setup-birefnet.ps1.'))
      worker = spawn(python, ['-u', path.join(root, 'scripts/birefnet-worker.py')], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
      const ownWorker = worker
      readline.createInterface({ input: worker.stdout }).on('line', line => {
        let result: any
        try { result = JSON.parse(line) } catch (_) { return }
        if (worker !== ownWorker || !pending) return
        const task = pending; pending = null; clearTimeout(task.timer)
        idle = setTimeout(() => reset(new Error('BiRefNet idle')), 120000)
        idle.unref()
        result.ok ? task.resolve(result) : task.reject(new Error(result.error))
      })
      worker.stderr.on('data', (data: Buffer) => console.error('[BiRefNet]', data.toString().slice(0, 2000)))
      worker.on('error', (error: Error) => { if(worker === ownWorker) reset(error) })
      worker.on('exit', () => { if(worker === ownWorker) reset(new Error('BiRefNet đã dừng. Hãy thử lại.')) })
      worker.stdin.on('error', (error: Error) => { if(worker === ownWorker) reset(error) })
    }
    pending = { resolve, reject, timer: setTimeout(() => reset(new Error('BiRefNet quá thời gian xử lý. Hãy thử lại.')), 180000) }
    worker.stdin.write(JSON.stringify({ source, destination }) + '\n')
  })
}
process.once('exit', () => { if(worker) worker.kill() })

router.post('/api/tinix/cutout/birefnet', (req: any, res: any) => {
  if (busy) return res.status(409).json({ message: 'BiRefNet đang xử lý ảnh khác. Hãy chờ rồi thử lại.' })
  busy = true
  const form = new multiparty.Form({ maxFilesSize: 40 * 1024 * 1024 })
  form.parse(req, async (error: any, fields: any, files: any) => {
    const uploads: any[] = []
    for (const key of Object.keys(files || {})) uploads.push(...files[key])
    try {
      if(error || uploads.length !== 1 || !files.file) throw new Error('Chọn một ảnh dưới 40 MB.')
      const source = files.file[0].path
      const modelDirectory = path.join(root,'.runtime/birefnet-model')
      if(!fs.existsSync(path.join(modelDirectory,'revision.txt')) || !fs.existsSync(path.join(modelDirectory,'model.safetensors'))) throw new Error('Chưa có model local. Chạy scripts/setup-birefnet.ps1.')
      const revision = fs.readFileSync(path.join(modelDirectory,'revision.txt'),'utf8').trim()
      const hash = crypto.createHash('sha256').update(fs.readFileSync(source)).update(revision + ':1024-fp16-v1').digest('hex')
      const directory = path.join(filePath, 'cutouts'); fs.mkdirSync(directory,{ recursive:true })
      const destination = path.join(directory, hash + '.png')
      const cached = fs.existsSync(destination)
      const result = cached ? {} : await infer(source, destination)
      res.setHeader('X-Cutout-Cache', cached ? 'hit' : 'miss')
      if(result.gpu) res.setHeader('X-Cutout-GPU', result.gpu)
      if(result.seconds !== undefined) res.setHeader('X-Cutout-Seconds', String(result.seconds))
      res.type('png').sendFile(destination)
    } catch (e) {
      if(!res.headersSent) res.status(503).json({ message: 'BiRefNet: ' + (e as Error).message })
    } finally {
      for(const file of uploads) try { fs.unlinkSync(file.path) } catch (_) { /* already removed */ }
      busy = false
    }
  })
})
export default router
