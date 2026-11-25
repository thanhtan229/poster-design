// [TINIX] Run the shared browser PNG/Canvas importer without opening the user's editor.
import { createRequire } from 'node:module'
import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../', import.meta.url))

export async function prepareMaterialDraft(input) {
  const file = await stat(input)
  if (!file.isFile()) throw new Error('Expected a material ZIP file')
  if (file.size > 96 * 1024 ** 2) {
    return { report: { version: 1, archive: path.basename(input), status: 'blocked',
      reason: 'invalid-archive', message: 'Material ZIP exceeds size limit' } }
  }
  const zip = await readFile(input)
  const { build } = await import('vite')
  const output = await build({
    root, configFile: false, publicDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      write: false, minify: false,
      lib: { entry: path.join(root, 'src/utils/tinix/material-archive-draft.ts'), name: 'TinixMaterialArchive', formats: ['iife'] },
    },
  })
  const chunk = (Array.isArray(output) ? output[0] : output).output.find(entry => entry.type === 'chunk' && entry.isEntry)
  if (!chunk) throw new Error('Could not bundle material ZIP importer')

  const puppeteer = require('../../service/node_modules/puppeteer')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-first-run', '--no-sandbox'], protocolTimeout: 180000 })
  try {
    const page = await browser.newPage()
    // Serve both resources from memory. Chromium cannot reach the live editor or any external origin.
    const origin = 'http://127.0.0.1'
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = request.url()
      if (request.method() !== 'GET') return request.abort()
      if (url === origin + '/') return request.respond({ contentType: 'text/html', body: '<!doctype html><title>Tinix ZIP importer</title>' })
      if (url === origin + '/bundle.zip') return request.respond({ contentType: 'application/zip', body: zip })
      return request.abort()
    })
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' })
    let startupError
    page.on('pageerror', error => { startupError ??= error })
    await page.addScriptTag({ content: chunk.code })
    if (!await page.evaluate(() => typeof globalThis.TinixMaterialArchive?.runMaterialArchive === 'function')) {
      throw startupError ?? new Error('Material ZIP importer did not initialize')
    }
    return await page.evaluate(async name => {
      try {
        const response = await fetch('/bundle.zip')
        return await globalThis.TinixMaterialArchive.runMaterialArchive(new File([await response.blob()], name, { type: 'application/zip' }))
      } catch (error) {
        return { report: { version: 1, archive: name, status: 'blocked', reason: 'invalid-archive', message: String(error.message ?? error) } }
      }
    }, path.basename(input))
  } finally {
    await browser.close()
  }
}
