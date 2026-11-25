// [TINIX] Exercise the real print route, queue and HTTP timeout with a deterministic renderer.
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { once } from 'events'
import { filePath, maxNum } from '../../service/src/configs'
import handleTimeout from '../../service/src/utils/timeout'
import { queueList, queueRun } from '../../service/src/utils/node-queue'

const express = require('../../service/node_modules/express')
const sharp = require('../../service/node_modules/sharp')
const screenshot = require('../../service/src/utils/download-single')

async function main() {
  let renderCount = 0
  screenshot.saveScreenshot = async (_url: string, options: { path: string }) => {
    renderCount++
    await sharp({ create: { width: 32, height: 48, channels: 3, background: 'white' } })
      .png().toFile(options.path)
  }
  const printRouter = require('../../service/src/tinix/collagePrint').default
  const app = express()
  let timeOutNextImage = true
  app.use(express.json())
  app.use((req: any, res: any, next: any) => {
    if (!timeOutNextImage || !req.path.endsWith('/image/0')) return next()
    timeOutNextImage = false
    let onTimeout: (() => void) | undefined
    res.setTimeout = (_milliseconds: number, callback: () => void) => { onTimeout = callback; return res }
    next()
    assert(queueList.some(task => task.sign === req._queueSign), 'The first render must be queued')
    assert(onTimeout, 'The service timeout middleware must register a callback')
    onTimeout!()
  })
  app.use(handleTimeout, printRouter)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port

  let release = () => {}
  const busy = new Promise<void>(resolve => { release = resolve })
  const running = Array.from({ length: maxNum }, () => queueRun(() => busy))
  const request = (route: string, options?: RequestInit) =>
    fetch(base + route, { ...options, signal: AbortSignal.timeout(3000) })
  try {
    const preview = await request('/api/tinix/collage-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: { global: { width: 32, height: 48, dpi: 300 }, layers: [] } }),
    })
    assert.strictEqual(preview.status, 200)
    const { id } = await preview.json()
    const sheet = '/api/tinix/collage-print/' + id + '/image/0'
    const expired = await request(sheet)
    assert.strictEqual(expired.status, 408)
    assert.strictEqual((await expired.json()).statusCode, 408)
    assert.strictEqual(queueList.length, 0)
    assert.strictEqual(renderCount, 0)

    release()
    await Promise.all(running)
    const retried = await request(sheet)
    assert.strictEqual(retried.status, 200)
    assert.strictEqual(retried.headers.get('Content-Type'), 'image/jpeg')
    const jpeg = Buffer.from(await retried.arrayBuffer())
    const { format, width, height } = await sharp(jpeg).metadata()
    assert.deepStrictEqual({ format, width, height }, { format: 'jpeg', width: 32, height: 48 })
    assert.deepStrictEqual(jpeg, fs.readFileSync(path.join(filePath, 'print-exports', id + '-0.jpg')))
    const cached = await request(sheet)
    assert.strictEqual(cached.headers.get('X-Tinix-Print-Cache'), 'job')
    assert.deepStrictEqual(Buffer.from(await cached.arrayBuffer()), jpeg)
    assert.strictEqual(renderCount, 1)
    console.log('PASS HTTP 408 releases the queued render and the same sheet retries and caches successfully')
  } finally {
    release()
    await new Promise<void>(resolve => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
