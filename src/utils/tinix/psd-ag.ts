/**
 * [TINIX] PSD → page converter built on ag-psd (MIT, maintained), replacing psd.js
 * which cannot read text data saved by recent Photoshop versions.
 *
 * Runs inside the PSD web worker: uses `useImageData` (raw RGBA), no canvas/DOM.
 * Output has the same shape as utils/plugins/psd convertPSD2Page() so Psd.vue
 * keeps working: { width, height, background: { color, image }, clouds: [...] }.
 */
import { readPsd, initializeCanvas } from 'ag-psd'
import type { Layer, Psd } from 'ag-psd'

// ag-psd creates ImageData through a canvas; a web worker has no `document`, so without this
// every layer image is silently dropped. Worker globals: ImageData + OffscreenCanvas.
if (typeof document === 'undefined') {
  initializeCanvas(
    ((w: number, h: number) => {
      if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas not available')
      return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement
    }) as any,
    ((w: number, h: number) => new ImageData(w, h)) as any,
  )
}
import { psdFontSize, psdLetterSpacing, psdLineHeight, psdApplyCaps, psdTextGeometry } from './psd-text'

type Cloud = Record<string, any>

const BACKGROUND_NAMES = ['background', '背景', 'nền', 'nen']

function hexA(c: any, alpha = 1): string {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16).padStart(2, '0')
  if (!c) return '#000000ff'
  const a = c.a !== undefined ? c.a : alpha
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}${to2((a > 1 ? a / 255 : a) * 255)}`
}

function justification(j?: string): string {
  if (!j) return 'left'
  if (j.startsWith('justify')) return 'justify'
  return ['left', 'center', 'right'].includes(j) ? j : 'left'
}

function imageCloud(layer: Layer): Cloud | null {
  const img = layer.imageData
  const left = layer.left ?? 0, top = layer.top ?? 0
  const width = (layer.right ?? 0) - left, height = (layer.bottom ?? 0) - top
  if (!img || width <= 0 || height <= 0) return null
  return { type: 'image', src: img.data, width: img.width, height: img.height, top, left, opacity: layer.opacity ?? 1 }
}

function textCloud(layer: Layer): Cloud | null {
  const t = layer.text
  if (!t) return null
  const style: any = t.style || {}
  const raw = String(t.text || '')
  const tf = t.transform || [1, 0, 0, 1, 0, 0]
  const isPoint = t.shapeType !== 'box'
  const geo = psdTextGeometry({ xx: tf[0], xy: tf[1], yx: tf[2], yy: tf[3], tx: tf[4], ty: tf[5] }, isPoint ? null : (t.boxBounds as number[] | undefined))
  const sheet = { FontSize: style.fontSize, Tracking: style.tracking, FontCaps: style.fontCaps, Leading: style.leading, AutoLeading: style.autoLeading }
  const left = layer.left ?? 0, top = layer.top ?? 0
  const bw = (layer.right ?? 0) - left, bh = (layer.bottom ?? 0) - top
  const fontSize = psdFontSize(style.fontSize, geo.scaleY, bh || 24)
  const fontName = String(style.font?.name || '')

  // style runs → per-run size / colour (kept like the psd.js importer did)
  let point = 0
  const texts = (t.styleRuns || []).map((run: any) => {
    const s = run.style || {}
    const part = raw.substr(point, run.length)
    point += run.length
    return {
      text: psdApplyCaps(part, { FontCaps: s.fontCaps ?? style.fontCaps }),
      fontSize: psdFontSize(s.fontSize ?? style.fontSize, geo.scaleY, fontSize),
      color: s.fillColor ? hexA(s.fillColor) : undefined,
    }
  })

  return {
    type: 'text',
    width: geo.rect ? geo.rect.width : bw + 2,
    height: geo.rect ? geo.rect.height : bh,
    top: geo.rect ? geo.rect.top : top,
    left: geo.rect ? geo.rect.left : left,
    rotate: geo.angle ? `${geo.angle}deg` : '',
    text: psdApplyCaps(raw, sheet),
    opacity: layer.opacity ?? 1,
    textAlign: justification(t.paragraphStyle?.justification),
    fontFamily: fontName,
    psdFont: fontName,
    fontSize,
    letterSpacing: psdLetterSpacing(style.tracking),
    lineHeight: psdLineHeight(sheet, raw),
    psdPointText: isPoint,
    color: hexA(style.fillColor),
    textDecoration: style.underline ? 'underline' : '',
    writingMode: t.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
    fontWeight: style.fauxBold ? '700' : '',
    fontStyle: style.fauxItalic ? 'italic' : '',
    texts,
    strokes: [],
    shadows: [],
    angle: geo.angle,
    transform: '',
  }
}

export function convertAgPsd(psd: Psd) {
  const background = { color: '#ffffff00', image: '' as any }
  const children = [...(psd.children || [])] // ag-psd order: bottom → top

  const bottom = children[0]
  if (bottom && !bottom.children && !bottom.text && BACKGROUND_NAMES.includes(String(bottom.name || '').trim().toLowerCase())) {
    if (!bottom.hidden && bottom.imageData) background.image = bottom.imageData.data
    children.shift()
  }

  const clouds: Cloud[] = []
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.hidden) continue
      if (layer.children) {
        walk(layer.children)
        continue
      }
      const cloud = layer.text ? textCloud(layer) : imageCloud(layer)
      if (cloud) clouds.push(cloud) // bottom → top = add order (later widgets on top)
    }
  }
  walk(children)

  // [TINIX] độ phân giải của file PSD (PPI; PPCM đổi ×2,54) → dùng để hiện đúng cm; không có/không hợp lý thì bỏ
  const ri: any = psd.imageResources && psd.imageResources.resolutionInfo
  let dpi = ri && Number(ri.horizontalResolution) ? Number(ri.horizontalResolution) * (ri.horizontalResolutionUnit === 'PPCM' ? 2.54 : 1) : 0
  dpi = dpi >= 36 && dpi <= 1200 ? Math.round(dpi) : 0
  return { background, width: psd.width, height: psd.height, clouds, dpi }
}

export async function processPsdWithAg(file: File) {
  const buffer = await file.arrayBuffer()
  const psd = readPsd(buffer, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true })
  return convertAgPsd(psd)
}
