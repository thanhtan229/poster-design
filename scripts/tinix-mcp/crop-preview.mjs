// [TINIX] Use smaller photo sources for the MCP crop preview only.
import { createRequire } from 'node:module'

const sharp = createRequire(import.meta.url)('../../service/node_modules/sharp')
const inlinePhoto = /^data:image\/(?:png|jpe?g|webp);base64,/i
const previewEdge = 1600

export async function cropPreviewLayout(layout, slots, signal) {
  const ids = new Set(slots.map(slot => slot.id))
  const sources = new Map()
  const layers = [...layout.layers]
  // Resize one source at a time to bound peak decoder memory. Linked layers resolve
  // their image from the slot, so they share the same preview source.
  for (const [index, layer] of layers.entries()) {
    if (!ids.has(layer.uuid) || layer.linkedPhotoId) continue
    const url = layer.origin?.original || layer.imgUrl
    if (!inlinePhoto.test(url)) continue
    signal.throwIfAborted()
    if (!sources.has(url)) {
      let preview = url
      try {
        const image = sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), { limitInputPixels: 32000000 })
        const { width, height, hasAlpha } = await image.metadata()
        if (Math.max(width, height) > previewEdge) {
          const resized = image.resize(previewEdge, previewEdge, { fit: 'inside', withoutEnlargement: true })
          const encoded = hasAlpha ? await resized.png().toBuffer() : await resized.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()
          preview = `data:image/${hasAlpha ? 'png' : 'jpeg'};base64,${encoded.toString('base64')}`
        }
      } catch {
        // A preview conversion failure falls back to the existing renderer input.
      }
      signal.throwIfAborted()
      sources.set(url, preview)
    }
    const preview = sources.get(url)
    if (preview !== url) {
      const { origin, ...copy } = layer
      layers[index] = { ...copy, imgUrl: preview }
    }
  }
  return { ...layout, layers }
}
