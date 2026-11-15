const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('../../../service/node_modules/puppeteer')
const { createEditor } = require('./editor.cjs')

const groups = {
  selection: { marquee: './marquee.cjs', shortcuts: './shortcuts.cjs', selection: './selection.cjs' },
  menu: { menu: './menu.cjs', keyboard: './menu-keyboard.cjs' },
  arrangement: { arrangement: './arrangement.cjs' },
  undo: { removals: '../history-removals.cjs', deletion: './undo-delete.cjs', feedback: './undo-feedback.cjs' },
}

function parse(args) {
  if (args.includes('--help')) return null
  const filters = args.filter(arg => arg.startsWith('--case=')).map(arg => arg.slice(7))
  const names = args.filter(arg => !arg.startsWith('--'))
  const selected = names.length ? names : Object.keys(groups)
  for (const name of selected) if (!groups[name]) throw new Error(`Unknown suite "${name}". Choose: ${Object.keys(groups).join(', ')}`)
  for (const arg of args.filter(arg => arg.startsWith('--') && !arg.startsWith('--case='))) throw new Error(`Unknown option: ${arg}`)
  const cases = selected.flatMap(group => Object.entries(groups[group]).filter(([name]) => !filters.length || filters.includes(name))
    .map(([name, file]) => ({ group, name, file })))
  if (!cases.length) throw new Error('No matching test cases. Use --help to list available suites and cases.')
  for (const filter of filters) if (!cases.some(item => item.name === filter)) throw new Error(`Unknown case for selected suites: ${filter}`)
  return cases
}

async function run(args = []) {
  const cases = parse(args)
  if (!cases) {
    console.log('Usage: npm run tinix:test-ui -- [selection|menu|arrangement|undo ...] [--case=NAME]\n' +
      Object.entries(groups).map(([group, entries]) => `  ${group}: ${Object.keys(entries).join(', ')}`).join('\n'))
    return []
  }
  const artifactDir = path.resolve('.runtime/ui-tests')
  fs.mkdirSync(artifactDir, { recursive: true })
  const results = []
  let browser
  try {
    for (const test of cases) {
      const started = Date.now()
      const label = `${test.group}/${test.name}`
      let context, timer, isolation
      console.log(`RUN ${label}`)
      try {
        if (test.name === 'removals') {
          delete require.cache[require.resolve(test.file)]
          require(test.file)
        } else {
          browser ||= await puppeteer.launch({ headless: true })
          isolation = await browser.createBrowserContext()
          await Promise.race([
            (async () => {
              context = await createEditor(isolation)
              await require(test.file)(context)
              assert.deepEqual(context.errors, [], `${label}: uncaught browser errors`)
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded 180 seconds`)), 180000) }),
          ])
        }
        const durationMs = Date.now() - started
        results.push({ suite: test.group, case: test.name, status: 'passed', durationMs })
        console.log(`PASS ${label} (${(durationMs / 1000).toFixed(1)}s)`)
      } catch (error) {
        results.push({ suite: test.group, case: test.name, status: 'failed', durationMs: Date.now() - started, error: error.stack || String(error) })
        if (context && !context.page.isClosed()) {
          const basename = path.join(artifactDir, `${test.group}-${test.name}`)
          await context.page.screenshot({ path: `${basename}.png` }).catch(() => {})
          await context.page.content().then(html => fs.writeFileSync(`${basename}.html`, html)).catch(() => {})
          fs.writeFileSync(`${basename}.network.json`, JSON.stringify(context.networkErrors, null, 2) + '\n')
        }
        throw new Error(`FAIL ${label}: ${error.message}`, { cause: error })
      } finally {
        clearTimeout(timer)
        if (isolation) await isolation.close()
      }
    }
  } finally {
    fs.writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify(results, null, 2) + '\n')
    if (browser) await browser.close()
  }
  console.log(`PASS ${results.length} cases, ${(results.reduce((total, item) => total + item.durationMs, 0) / 1000).toFixed(1)}s; report: .runtime/ui-tests/results.json`)
  return results
}

function main(args = process.argv.slice(2)) {
  return run(args).catch(error => { console.error(error); process.exitCode = 1 })
}
module.exports = { groups, parse, run, main }
if (require.main === module) main()
