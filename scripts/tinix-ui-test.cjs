// All four editor suites by default; optional suite/case filters run only relevant checks.
const { spawnSync } = require('node:child_process')
const { main } = require('./tinix-selftest/ui/run.cjs')
const args = process.argv.slice(2)
function imageFrame() {
  const result = spawnSync(process.execPath, ['scripts/tinix-selftest/image-frame-ui.cjs'], { stdio: 'inherit', timeout: 600000 })
  if (result.error) console.error(result.error)
  if (result.status !== 0) process.exitCode = result.status ?? 1
}
if (args[0] === 'image-frame') imageFrame()
else main(args).then(() => { if (!args.length && !process.exitCode) imageFrame() })
