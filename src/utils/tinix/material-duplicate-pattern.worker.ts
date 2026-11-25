// [TINIX] Keep PNG pattern matching off the dialog's main thread.
import type { ArchiveRegion } from './material-archive-check'
import { suggestDuplicateFrame } from './material-duplicate-pattern'

export type DuplicatePatternRequest = { image: ImageData; frames: ArchiveRegion[] } | { region: ArchiveRegion }
export type DuplicatePatternResult = { id: string; frame?: string }

let source: Extract<DuplicatePatternRequest, { image: ImageData }> | undefined
self.onmessage = ({ data }: MessageEvent<DuplicatePatternRequest>) => {
  if ('image' in data) {
    source = data
    return
  }
  const { region } = data
  const frame = source && suggestDuplicateFrame(source.image, region, source.frames)
  self.postMessage({ id: region.id, frame } satisfies DuplicatePatternResult)
}
