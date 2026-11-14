/**
 * [TINIX] Ghi độ phân giải (DPI) vào file PNG bằng chunk `pHYs` — không giải mã/nén lại ảnh nên nhanh kể cả ảnh lớn.
 * Không có chunk này, Photoshop/tiệm in mở ảnh ở 72 DPI và hiện sai khổ (3543 px thành 125 cm thay vì 30 cm).
 * Bản tương tự cho server: service/src/tinix/pngDpi.ts.
 */
let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Trả về bản PNG đã có pHYs = dpi; dữ liệu không phải PNG thì giữ nguyên. */
export function setPngDpi(data: Uint8Array, dpi: number): Uint8Array {
  if (data.length < 33 || SIG.some((b, i) => data[i] !== b)) return data
  const ppm = Math.round(dpi / 0.0254) // pixel mỗi mét
  const chunk = new Uint8Array(21)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // 'pHYs'
  dv.setUint32(8, ppm)
  dv.setUint32(12, ppm)
  chunk[16] = 1 // đơn vị: mét
  dv.setUint32(17, crc32(chunk.subarray(4, 17)))
  // bỏ pHYs cũ (nếu có) rồi chèn ngay sau IHDR (8 + 25 byte)
  const parts: Uint8Array[] = [data.subarray(0, 33), chunk]
  let pos = 33
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  while (pos + 12 <= data.length) {
    const len = view.getUint32(pos)
    const end = pos + 12 + len
    const isPhys = data[pos + 4] === 0x70 && data[pos + 5] === 0x48 && data[pos + 6] === 0x59 && data[pos + 7] === 0x73
    if (!isPhys) parts.push(data.subarray(pos, Math.min(end, data.length)))
    pos = end
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export async function withPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const out = setPngDpi(bytes, dpi)
    return out === bytes ? blob : new Blob([out as BlobPart], { type: 'image/png' })
  } catch (e) {
    return blob // không ghi được DPI thì vẫn xuất ảnh bình thường
  }
}
