// [TINIX] Share review findings between export and the canvas.
import type { CutReadinessRow } from './cut-readiness'
import type { TrimRow } from './print-trim-review'

export const COLLAGE_REVIEW_EVENT = 'tinix:collage-review'

export function cutNeedsReview(row: CutReadinessRow) {
  return !row.id || row.parts.length !== 1 || row.smallHoles.length > 0 || row.narrowJoins.length > 0
}

export type CollageReviewReport = {
  page: object
  full?: boolean
  trim?: TrimRow[]
  cut?: { rows: CutReadinessRow[]; limit: number }
}
