// [TINIX] Đọc tệp ZIP (kiểu lưu không nén của zip.ts, có hỗ trợ deflate để người dùng nén lại bằng công cụ khác).
export type ZipEntry = { name: string; blob: () => Promise<Blob> }

function readU32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

export async function unzip(file: Blob): Promise<ZipEntry[]> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  // Tìm bản ghi kết thúc (EOCD) từ cuối tệp.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Không phải tệp ZIP hợp lệ')
  const count = view.getUint16(eocd + 10, true)
  let pointer = readU32(view, eocd + 16)
  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (readU32(view, pointer) !== 0x02014b50) throw new Error('ZIP bị hỏng (danh mục)')
    const flags = view.getUint16(pointer + 8, true)
    const method = view.getUint16(pointer + 10, true)
    const compressed = readU32(view, pointer + 20)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = readU32(view, pointer + 42)
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))
    pointer += 46 + nameLength + extraLength + commentLength
    if (flags & 1) throw new Error('ZIP có mã hóa, không đọc được')
    if (name.endsWith('/')) continue
    entries.push({
      name,
      blob: async () => {
        if (readU32(view, localOffset) !== 0x04034b50) throw new Error('ZIP bị hỏng (tệp ' + name + ')')
        const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
        const data = bytes.subarray(start, start + compressed)
        if (method === 0) return new Blob([data])
        if (method !== 8) throw new Error('ZIP dùng kiểu nén không hỗ trợ')
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Response(stream).blob()
      },
    })
  }
  return entries
}
