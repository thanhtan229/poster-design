// [TINIX] Suggest roles from filenames and small image previews. Leave close matches for the user.
import { cutoutCanvas } from './cutout-workspace'
import type { MaterialFileKind } from './material-session'

type MaterialPreview = { name: string; type: string; ratio: number; transparent: number; detail: number }
const plainName = (name: string) => name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ')
const guideName = /\b(so do|layout|guide|anh duyet|so sanh|proof|preview|comparison)\b/
type RequiredRole = Exclude<MaterialFileKind, 'diagram'>
const roleNames: Record<RequiredRole, RegExp> = {
  reference: /\b(anh mau|hoan chinh|reference)\b/,
  background: /\b(nen|background|paper bg)\b/,
  sheet: /\b(tam manh|cac manh|chi tiet roi|cut sheet|atlas|stickers|alpha sach|modular sheet)\b/,
}

export function suggestMaterialRoles<T extends MaterialPreview>(previews: T[]): Partial<Record<RequiredRole, T>> {
  const candidates = previews.filter(file => !guideName.test(plainName(file.name)))
  const opaque = candidates.filter(file => file.transparent < .01)
  const sheets = candidates.filter(file => file.type === 'image/png' && file.transparent >= .08 && file.transparent <= .95)
  const named = (kind: RequiredRole, list: T[]) => {
    const matches = list.filter(file => roleNames[kind].test(plainName(file.name)))
    return matches.length === 1 ? matches[0] : undefined
  }
  const sheet = named('sheet', sheets) ?? (sheets.length === 1 ? sheets[0] : undefined)
  const samePage = (a: T, b: T) => a !== b && Math.abs(Math.log(a.ratio / b.ratio)) < .035
  const backgroundName = named('background', opaque)
  const referenceName = named('reference', opaque)
  const background = backgroundName === referenceName ? undefined : backgroundName
  const reference = backgroundName === referenceName ? undefined : referenceName
  if (background && reference) return { background, reference, sheet }
  const anchor = background ?? reference
  const pair = opaque.filter(file => anchor
    ? samePage(file, anchor)
    : opaque.some(other => samePage(file, other)))
    .sort((a, b) => a.detail - b.detail)
  const low = pair[0]
  const nextLow = pair[1]
  const high = pair[pair.length - 1]
  const nextHigh = pair[pair.length - 2]
  // Clean paper usually has much less local contrast than a composed reference or a layout guide.
  const distinct = (more: number, less: number) => more > less * 1.35 + 1.5
  const higher = nextLow ?? reference
  const lower = nextHigh ?? background
  const foundBackground = background ?? (low && higher && distinct(higher.detail, low.detail) ? low : undefined)
  const foundReference = reference ?? (foundBackground && high && samePage(high, foundBackground) &&
    lower && distinct(high.detail, lower.detail) ? high : undefined)
  return { sheet, background: foundBackground, reference: foundReference }
}

async function inspectFile(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(128 / Math.max(bitmap.width, bitmap.height), 1)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const { context } = cutoutCanvas(width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    let transparent = 0
    let variation = 0
    let samples = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 128) transparent++
      if (!x || !y) continue
      for (let channel = 0; channel < 3; channel++) {
        const at = i + channel
        variation += Math.abs(data[at] - data[at - 4]) + Math.abs(data[at] - data[at - width * 4])
      }
      samples += 6
    }
    return { file, name: file.name, type: file.type, ratio: bitmap.width / bitmap.height,
      transparent: transparent / (width * height), detail: variation / Math.max(1, samples) }
  } finally {
    bitmap.close()
  }
}

export async function suggestMaterialFolder(files: File[]) {
  const previews: Awaited<ReturnType<typeof inspectFile>>[] = []
  for (const file of files) {
    try {
      previews.push(await inspectFile(file))
    } catch {
      // An unreadable file remains available for manual selection.
    }
  }
  const roles = suggestMaterialRoles(previews)
  const remaining = previews.filter(file => file !== roles.reference && file !== roles.background && file !== roles.sheet &&
    file.transparent < .01 && roles.reference && Math.abs(Math.log(file.ratio / roles.reference.ratio)) < .035)
  const namedDiagrams = remaining.filter(file => /\b(so do|layout guide|diagram)\b/.test(plainName(file.name)))
  const diagram = namedDiagrams.length === 1 ? namedDiagrams[0]
    : !namedDiagrams.length && roles.background && roles.sheet && remaining.length === 1 ? remaining[0] : undefined
  return { ...roles, diagram }
}
