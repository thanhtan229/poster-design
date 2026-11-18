/** Shared by the editor and headless CLI. Keep self-contained for page.evaluate. */
export function renderSubjectCanvas(source, mm, documentScale, dpi = 300, box = { width: 620 * 3543 / 1800, height: 660 * 2362 / 1200 }) {
  if (!Number.isFinite(mm) || mm < 0 || mm > 5) throw new Error('Viền phải từ 0 đến 5 mm')
  if (!Number.isFinite(dpi) || dpi < 36 || dpi > 1200) throw new Error('DPI phải từ 36 đến 1200')
  const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data
  let left = source.width, top = source.height, right = -1, bottom = -1
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (pixels[(y * source.width + x) * 4 + 3] > 0) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  if (right < left) throw new Error('Chủ thể đã bị xóa hết. Hãy hoàn tác hoặc đặt lại.')
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 }
  const reserved = 5 * dpi / 25.4
  const scale = documentScale === undefined ? Math.min((box.width - 2 * reserved) / bounds.width, (box.height - 2 * reserved) / bounds.height) : documentScale
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Khung ảnh quá nhỏ cho viền này')
  const pad = Math.ceil(reserved / scale), width = bounds.width + 2 * pad, height = bounds.height + 2 * pad
  if (width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 32000000) throw new Error('Ảnh viền vượt giới hạn kích thước')
  function canvas() { const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d', { willReadFrequently: true }); return c }
  const image = canvas(), rim = canvas(), ctx = rim.getContext('2d')
  image.getContext('2d').drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, pad, pad, bounds.width, bounds.height)
  if (mm > 0) {
    const radius = mm * dpi / 25.4 / scale
    ctx.drawImage(image, 0, 0)
    for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI / 32, r = radius * ring / 4
      ctx.drawImage(image, Math.cos(angle) * r, Math.sin(angle) * r)
    }
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height)
  }
  return { image, rim, scale, frame: { left: bounds.left - pad, top: bounds.top - pad, width, height } }
}
