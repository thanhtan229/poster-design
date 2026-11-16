const assert = require('node:assert/strict')
require('../../service/node_modules/ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', esModuleInterop: true } })
const History = require('../../src/utils/widgets/diffLayouts.ts').default
const { applyPatches } = require('immer')
const cases = [
  [[{ layers: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }, { layers: [{ id: 5 }] }], [{ layers: [] }, { layers: [{ id: 5 }] }]],
  [[{ layers: [1, 2, 3, 4, 5] }], [{ layers: [2, 4] }]],
  [[{ layers: [{ id: 1, children: [1, 2, 3, 4] }, { id: 2 }] }], [{ layers: [{ id: 1, children: [1] }] }]],
  [[{ layers: [1, 2, 3], guides: [1, 2, 3] }], [{ layers: [], guides: [2] }]],
  [[{ layers: [1], old: true }], [{ layers: [2, 3, 4], added: true }]],
]
for (const [before, after] of cases) {
  const history = new History()
  let entry
  history.onmessage(value => { entry = value })
  history.postMessage({ op: 'diff', data: JSON.stringify(before) })
  history.postMessage({ op: 'done', data: JSON.stringify(after) })
  assert(entry)
  assert.deepEqual(applyPatches(before, entry.patches), after, 'Redo reaches the complete final state')
  assert.deepEqual(applyPatches(after, entry.inversePatches), before, 'Undo restores the complete original state')
}
console.log('PASS: bulk and nested array removal history; redo and undo preserve complete states')
