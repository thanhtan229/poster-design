/**
 * [TINIX] Keep the local service alive when a background promise fails.
 *
 * Why: when a screenshot export times out, utils/download-single.ts closes the
 * Puppeteer browser while page.screenshot()/exposeFunction() are still pending.
 * Those calls then reject with nobody listening, and Node (>= 15) terminates the
 * process on an unhandled rejection — the whole API went down after one slow export.
 * The request itself is already answered with code 500 by service/screenshots.ts,
 * so logging and continuing is the right behaviour for this single-user app.
 */
process.on('unhandledRejection', (reason: any) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.warn(`[tinix:guard] Bỏ qua lỗi nền (unhandled rejection): ${msg}`)
})

export {}
