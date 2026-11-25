// [TINIX] Read the standard material package without changing file names or coordinates.
import { unzip } from './unzip'
import { materialPixels } from './material-sheet'
import { readCutoutFile, readCutoutImage } from './cutout-workspace'
import { loadReferenceGuide } from './reference-guide'
import { parseMaterialLayout } from './material-layout'
import { missingMaterialFields } from './material-archive-check'

export const materialArchiveLimit = 96 * 1024 ** 2
export async function readMaterialArchive(file: File) {
  const imageLimit = 24 * 1024 ** 2
  if (file.size > materialArchiveLimit) throw new Error('Material ZIP exceeds size limit')
  const entries = await unzip(file)
  const find = (name: string) => entries.filter(entry => entry.name.split('/').at(-1) === name)
  async function read(name: string, type: string, limit = imageLimit) {
    const matches = find(name)
    if (matches.length !== 1) throw new Error('Missing or duplicate material file')
    return new File([await matches[0].blob(limit)], name, { type })
  }
  const [reference, background, diagram, sheet, layout] = await Promise.all([
    read('01_anh_mau.png', 'image/png'), read('02_nen_sach.png', 'image/png'),
    read('03_so_do_bo_cuc.png', 'image/png'), read('04_tam_manh_RGBA.png', 'image/png'),
    read('layout.json', 'application/json', 64 * 1024),
  ])
  return { reference, background, diagram, sheet, layout }
}

// [TINIX] Decode and validate the same package in the editor and headless importer.
export async function openMaterialArchive(file: File) {
  const { layout, ...bundle } = await readMaterialArchive(file)
  const layoutText = await layout.text()
  const fields = missingMaterialFields(layoutText)
  if (fields.length) return { kind: 'missing' as const, bundle, fields }
  const [image, original, guide, background, diagram] = await Promise.all([
    materialPixels(bundle.sheet),
    readCutoutFile(bundle.reference).then(readCutoutImage),
    loadReferenceGuide(bundle.reference),
    loadReferenceGuide(bundle.background),
    loadReferenceGuide(bundle.diagram),
  ])
  if (!image.data.some((alpha, index) => index % 4 === 3 && alpha < 16) ||
      background.width !== guide.width || background.height !== guide.height ||
      diagram.width !== guide.width || diagram.height !== guide.height) throw new Error('Invalid material images')
  const size = { width: original.naturalWidth, height: original.naturalHeight }
  const manifest = parseMaterialLayout(layoutText, { file: bundle.sheet.name, width: image.width, height: image.height },
    { file: bundle.reference.name, ...size })
  return { kind: 'ready' as const, bundle, layout, image, guide, background: background.image, size, manifest }
}
