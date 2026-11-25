// [TINIX] Portable state for a material session inside a local project page.
import type { MaterialPose, MaterialSearchArea, MaterialSearchCenter } from './material-placement'
import type { MaterialPrintSize, MaterialSubject } from './material-layout' // [TINIX]
import { validPieceOpening, type PieceOpening, type PieceRole } from './material-sheet'

export type MaterialFileKind = 'reference' | 'background' | 'sheet' | 'diagram'
export type MaterialScanState = {
  pieces: Array<{ id: number; role: PieceRole; runs: number[]; opening?: PieceOpening; automaticOpening?: boolean; frameCode?: string }> // [TINIX]
  review: number[]
  poses: Array<[number, MaterialPose]>
  accepted: number[]
  areas: Array<[number, MaterialSearchArea]>
  centers: Array<[number, MaterialSearchCenter]>
  moves: Array<{ piece: number; anchor: number; above: boolean }>
}
export type MaterialSession = {
  id: string
  version: 1
  files: Partial<Record<MaterialFileKind, { name: string; data: string }>>
  threshold: number
  cleanAlpha: boolean
  referenceWidth?: number
  subjectZ?: number // [TINIX]
  subject?: MaterialSubject // [TINIX]
  printSize?: MaterialPrintSize // [TINIX]
  scan: MaterialScanState
  recent: Array<[string, MaterialScanState]>
}

export function encodeMaterialPixels(pixels: number[]) {
  const sorted = [...pixels].sort((a, b) => a - b)
  const runs: number[] = []
  for (const pixel of sorted) {
    const last = runs.length - 2
    if (last >= 0 && pixel < runs[last] + runs[last + 1]) continue
    if (last >= 0 && pixel === runs[last] + runs[last + 1]) runs[last + 1]++
    else runs.push(pixel, 1)
  }
  return runs
}

export function decodeMaterialScan(scan: MaterialScanState, pixelLimit: number) {
  let total = 0
  const ids = new Set<number>()
  if (!Array.isArray(scan.pieces)) throw new Error('Invalid material session')
  return scan.pieces.map(({ id, role, runs, opening, automaticOpening, frameCode }) => {
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id) || !['sticker', 'frame', 'hero'].includes(role) ||
        !Array.isArray(runs) || runs.length % 2) throw new Error('Invalid material piece')
    ids.add(id)
    const pixels: number[] = []
    let last = 0
    for (let i = 0; i < runs.length; i += 2) {
      const start = runs[i]
      const length = runs[i + 1]
      if (!Number.isSafeInteger(start) || start < last || !Number.isSafeInteger(length) || length <= 0 ||
          start + length > pixelLimit || total + length > pixelLimit) throw new Error('Invalid material pixels')
      last = start + length
      total += length
      for (let pixel = start; pixel < last; pixel++) pixels.push(pixel)
    }
    if (!pixels.length) throw new Error('Empty material piece')
    return { id, role, pixels, frameCode: typeof frameCode === 'string' && /^F0[1-9]$/.test(frameCode) ? frameCode : undefined,
      ...(opening && validPieceOpening(opening) ? { opening, automaticOpening: automaticOpening === true || undefined } : {}) }
  })
}

export function restoreMaterialFile(entry: { name: string; data: string }) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(entry.data)
  if (!match || entry.data.length > 34 * 1024 ** 2) throw new Error('Invalid material file')
  const bytes = Uint8Array.from(atob(entry.data.slice(match[0].length)), char => char.charCodeAt(0))
  return new File([bytes], entry.name, { type: match[1] })
}
