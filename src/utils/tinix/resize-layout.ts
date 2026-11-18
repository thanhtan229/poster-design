type Size = { width: number; height: number }

function scalePixels(target: Record<string, any> | undefined, keys: string[], ratio: number) {
  if (!target) return
  for (const key of keys) {
    if (typeof target[key] === 'number' && Number.isFinite(target[key])) target[key] *= ratio
  }
}

/** Fit the old page into the new page, preserving its composition and aspect ratio.
 * All layers (including group children) use absolute document coordinates.
 * Crop percentages, zoom, rotation, line height and letter spacing are relative values.
 */
export function resizeLayoutToFit(layers: Record<string, any>[], previous: Size, next: Size) {
  if (![previous.width, previous.height, next.width, next.height].every(n => Number.isFinite(n) && n > 0)) return
  if (previous.width === next.width && previous.height === next.height) return
  const ratio = Math.min(next.width / previous.width, next.height / previous.height)
  const offsetX = (next.width - previous.width * ratio) / 2
  const offsetY = (next.height - previous.height * ratio) / 2
  for (const layer of layers) {
    layer.left = (layer.left || 0) * ratio + offsetX
    layer.top = (layer.top || 0) * ratio + offsetY
    scalePixels(layer, ['width', 'height', 'fontSize', 'radius'], ratio)
    scalePixels(layer.record, ['width', 'height', 'minWidth', 'minHeight'], ratio)
    scalePixels(layer.effects, ['blur', 'border', 'shadow'], ratio)
    // Legacy image crops persist their pan in CSS pixels rather than percentages.
    if (typeof layer.transform === 'string') {
      layer.transform = layer.transform.replace(/translate(?:X|Y)?\(([^)]+)\)/g, (match: string, values: string) => {
        const scaled = values.split(/,\s*|\s+/).map(value => {
          const pixel = value.match(/^(-?(?:\d+\.?\d*|\.\d+))(px)?$/)
          return pixel ? `${Number(pixel[1]) * ratio}${pixel[2] || ''}` : value
        })
        return match.slice(0, match.indexOf('(') + 1) + scaled.join(', ') + ')'
      })
    }
    for (const effect of layer.textEffects || []) {
      scalePixels(effect.stroke, ['width'], ratio)
      scalePixels(effect.shadow, ['offsetX', 'offsetY', 'blur'], ratio)
      scalePixels(effect.offset, ['x', 'y'], ratio)
    }
  }
}
