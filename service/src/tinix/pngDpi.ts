// [TINIX] Ghi DPI vào PNG bằng chunk pHYs (không giải mã lại ảnh). Bản cho client: src/utils/tinix/png-dpi.ts.
import fs from 'fs'

let table: number[] | null = null
function crc32(buf: Buffer, start: number, end: number): number {
  if (!table) {
    table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table.push(c >>> 0)
    }
  }
  let crc = 0xffffffff
  for (let i = start; i < end; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function pngWithDpi(data: Buffer, dpi: number): Buffer {
  if (data.length < 33 || SIG.some((b, i) => data[i] !== b)) return data
  const ppm = Math.round(dpi / 0.0254)
  const chunk = Buffer.alloc(21)
  chunk.writeUInt32BE(9, 0)
  chunk.write('pHYs', 4, 'ascii')
  chunk.writeUInt32BE(ppm, 8)
  chunk.writeUInt32BE(ppm, 12)
  chunk[16] = 1
  chunk.writeUInt32BE(crc32(chunk, 4, 17), 17)
  const parts: Buffer[] = [data.slice(0, 33), chunk]
  let pos = 33
  while (pos + 12 <= data.length) {
    const len = data.readUInt32BE(pos)
    const end = pos + 12 + len
    if (data.toString('ascii', pos + 4, pos + 8) !== 'pHYs') parts.push(data.slice(pos, Math.min(end, data.length)))
    pos = end
  }
  return Buffer.concat(parts)
}

/** Ghi lại file PNG tại chỗ với DPI mới; lỗi thì bỏ qua (ảnh vẫn dùng được) */
export function setPngFileDpi(file: string, dpi: number): void {
  try {
    const d = Math.round(Number(dpi))
    if (!isFinite(d) || d < 36 || d > 1200) return
    const src = fs.readFileSync(file)
    const out = pngWithDpi(src, d)
    if (out !== src) fs.writeFileSync(file, out)
  } catch (e) {
    console.warn('[tinix] không ghi được DPI vào PNG:', e && (e as Error).message)
  }
}
