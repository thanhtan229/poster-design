import fs from 'fs'
import imageSize from 'image-size'

/** image-size v2 accepts bytes; read only the header, as its fromFile helper does. */
export function imageSizeFile(file: string) {
  const fd = fs.openSync(file, 'r')
  try {
    const length = Math.min(fs.fstatSync(fd).size, 512 * 1024)
    if (!length) throw new Error('Empty image')
    const buffer = Buffer.allocUnsafe(length)
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0)
    return imageSize(buffer.subarray(0, bytesRead))
  } finally { fs.closeSync(fd) }
}
