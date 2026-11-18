// [TINIX] ZIP không nén, dùng cho ảnh đã nén PNG/JPEG; tên tệp UTF-8.
export async function zipImages(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []; const central: BlobPart[] = []
  let offset = 0; let centralSize = 0
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  for (const file of files) {
    const name = encoder.encode(file.name); const data = new Uint8Array(await file.blob.arrayBuffer())
    if (data.length > 0xffffffff || offset + data.length > 0xffffffff) throw new Error('ZIP exceeds 4 GB')
    let crc = 0xffffffff
    for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8)
    crc = (crc ^ 0xffffffff) >>> 0
    const local = new Uint8Array(30); const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true)
    const head = new Uint8Array(46); const cv = new DataView(head.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true)
    parts.push(local, name, data); central.push(head, name)
    offset += local.length + name.length + data.length; centralSize += head.length + name.length
  }
  if (files.length > 65535 || offset + centralSize > 0xffffffff) throw new Error('ZIP limit exceeded')
  const end = new Uint8Array(22); const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}
