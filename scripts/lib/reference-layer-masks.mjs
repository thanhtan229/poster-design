// [TINIX] Read exact layer silhouettes from the existing Tinix draw page, without writing a design to the library.
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('../../service/node_modules/sharp')

export async function renderLayerMasks(base, draft, ref, signal) {
  const { width, height } = draft.global
  if (width > 12000 || height > 12000 || width * height > 100000000) throw new Error('Page exceeds render limits')
  const widthRef = ref.width, heightRef = ref.height
  const layersById = new Map(draft.layers.map(layer => [String(layer.uuid), layer]))
  const puppeteer = require('../../service/node_modules/puppeteer')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-first-run', '--no-sandbox'] })
  const cancel = () => { void browser.close().catch(() => undefined) } // [TINIX]
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    signal?.throwIfAborted()
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    const token = randomUUID()
    const route = '/api/tinix/collage-print/' + token + '/data'
    let suppliedDraft = false
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname === route && request.method() === 'GET' && url.origin === base) {
        suppliedDraft = true
        return request.respond({ contentType: 'application/json', body: JSON.stringify({ data: JSON.stringify([draft]), width, height }) })
      }
      // The draft and its assets belong to the local app. Do not load remote URLs embedded in a draft.
      return url.origin === base || url.protocol === 'data:' || url.protocol === 'blob:' ? request.continue() : request.abort()
    })
    let renderReady
    await page.exposeFunction('loadFinishToInject', result => {
      renderReady = result
    })
    await page.goto(base + '/draw?hq=1&exportJob=' + token, { waitUntil: 'domcontentloaded' })
    const timeout = Date.now() + 60000
    while (renderReady === undefined && Date.now() < timeout) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (!suppliedDraft || renderReady !== 'done') throw new Error(renderReady?.error || 'Tinix draw did not finish loading the draft')

    const { clip, ids } = await page.evaluate(() => {
      const canvas = document.querySelector('#page-design-canvas')
      const { x, y, width, height } = canvas.getBoundingClientRect()
      const leaves = [...canvas.querySelectorAll('[data-uuid][data-type]')].filter(node => {
        return node.dataset.type !== 'w-group' && node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible'
      })
      window.referenceComparisonLeaves = new Map(leaves.map(node => [node.dataset.uuid, node]))
      return { clip: { x, y, width, height }, ids: [...window.referenceComparisonLeaves.keys()] }
    })
    if (clip.width !== width || clip.height !== height) throw new Error('Tinix draw returned unexpected canvas dimensions')
    const capture = () => page.screenshot({ type: 'png', clip, omitBackground: true })
    const render = await capture()
    await page.evaluate(() => {
      const canvas = document.querySelector('#page-design-canvas')
      for (let node = canvas; node; node = node.parentElement) {
        node.style.setProperty('background', 'transparent', 'important')
        node.style.setProperty('box-shadow', 'none', 'important')
      }
      for (const node of window.referenceComparisonLeaves.values()) node.style.setProperty('visibility', 'hidden', 'important')
    })
    const visible = []
    const owners = new Uint16Array(widthRef * heightRef)
    const excluded = new Uint8Array(owners.length)
    const remaining = new Uint8Array(owners.length).fill(255)
    for (const id of ids.reverse()) {
      signal?.throwIfAborted()
      const layer = layersById.get(id)
      if (!layer) throw new Error('Tinix draw returned a layer missing from the draft: ' + id)
      const placeholder = layer.type === 'w-image' && (layer.slot === true || layer.templateRole === 'photo' || layer.templateRole === 'subject')
      visible.push({ id, name: layer.layerName || layer.name || id, type: layer.type, placeholder })
      await page.evaluate(id => window.referenceComparisonLeaves.get(id).style.removeProperty('visibility'), id)
      const png = await capture()
      const rgba = await sharp(png).resize(widthRef, heightRef, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer()
      await page.evaluate(id => window.referenceComparisonLeaves.get(id).style.setProperty('visibility', 'hidden', 'important'), id)
      for (let i = 0; i < owners.length; i++) {
        const weight = Math.round(rgba[i * 4 + 3] * remaining[i] / 255)
        remaining[i] -= weight
        // Keep opaque stickers over photos, and ignore only contributing placeholder pixels.
        if (placeholder && weight >= 16) excluded[i] = 1
        if (!placeholder && weight >= 128) owners[i] = visible.length
      }
    }
    return { render, owners, excluded, layers: visible }
  } finally {
    signal?.removeEventListener('abort', cancel)
    await browser.close().catch(() => undefined)
  }
}
