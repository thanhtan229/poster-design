// [TINIX] Shared local face inference for the canvas API and the crop review worker.
const { execFile } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const sharp = require('../../service/node_modules/sharp')

const root = path.resolve(__dirname, '../..')
const model = process.env.TINIX_FACE_MODEL || path.join(root, '.runtime', 'face-crop', 'yunet.onnx')
let busy = false

async function detectFaces(image) {
  if (typeof image !== 'string' || image.length > 1400000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)) {
    return { status: 400 }
  }
  if (!existsSync(model)) return { status: 503 }
  if (busy) return { status: 429 }
  busy = true
  try {
    const jpeg = await sharp(Buffer.from(image.slice(23), 'base64'), { limitInputPixels: 1024 * 1024 })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg().toBuffer()
    const faces = await new Promise((resolve, reject) => {
      const child = execFile(process.env.TINIX_FACE_PYTHON || 'python', [
        path.join(root, 'scripts', 'tinix-detect-faces.py'), model,
      ], { timeout: 12000, maxBuffer: 65536, windowsHide: true }, (error, stdout) => {
        if (error) return reject(error)
        try { resolve(JSON.parse(stdout)) } catch (parseError) { reject(parseError) }
      })
      if (!child.stdin) return reject(new Error('Face detector input unavailable'))
      child.stdin.on('error', reject)
      child.stdin.end(jpeg)
    })
    return { status: 200, faces }
  } catch {
    return { status: 503 }
  } finally {
    busy = false
  }
}

module.exports = { detectFaces }
