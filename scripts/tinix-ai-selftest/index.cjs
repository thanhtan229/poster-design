// [TINIX] Runner for the AI self-test: fresh temp DB in .runtime/ai-selftest, then run.ts via ts-node.
// Usage: npm run tinix:test-ai
const path = require('path')
const fs = require('fs')
const root = path.resolve(__dirname, '../..')
const dir = path.join(root, '.runtime', 'ai-selftest')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
process.chdir(dir)
process.env.NODE_ENV = process.env.NODE_ENV || 'development' // service dùng thư mục static theo cwd (thư mục tạm) khi ở chế độ development // initDB() creates ./data/poster.db here — never touches service/data
require(path.join(root, 'service/node_modules/ts-node')).register({ transpileOnly: true, compilerOptions: { module: 'commonjs', esModuleInterop: true } })
require(path.join(__dirname, 'run.ts'))
