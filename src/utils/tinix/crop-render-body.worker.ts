// [TINIX] Prepare crop render input and read back mask pixels away from the canvas UI thread.
export type CropRenderJob = { payload: object } | { image: Blob; width: number; height: number; resize?: boolean }

self.onmessage = async ({ data: { id, job } }: MessageEvent<{ id: number; job: CropRenderJob }>) => {
  try {
    if ('payload' in job) {
      self.postMessage({ id, value: new Blob([JSON.stringify(job.payload)], { type: 'application/json' }) })
      return
    }
    const bitmap = await createImageBitmap(job.image)
    try {
      const canvas = new OffscreenCanvas(job.width, job.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      if (job.resize) ctx.drawImage(bitmap, 0, 0, job.width, job.height)
      else ctx.drawImage(bitmap, 0, 0)
      const pixels = ctx.getImageData(0, 0, job.width, job.height).data
      self.postMessage({ id, value: pixels }, { transfer: [pixels.buffer] })
    } finally {
      bitmap.close()
    }
  } catch {
    self.postMessage({ id })
  }
}
