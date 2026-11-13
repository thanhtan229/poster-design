// [TINIX] Chạy một file kiểm thử .ts trên DB tạm: node scripts/tinix-selftest/run-ts.cjs <tên-file.ts> [tên-thư-mục-tạm]
// initDB() tạo ./data/poster.db trong thư mục tạm → không bao giờ đụng service/data.
const path = require('path')
const fs = require('fs')
const root = path.resolve(__dirname, '../..')
const file = process.argv[2]
if (!file) { console.error('Thiếu tên file kiểm thử'); process.exit(2) }
const dir = path.join(root, '.runtime', process.argv[3] || 'selftest-' + path.basename(file, '.ts'))
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
process.chdir(dir)
require(path.join(root, 'service/node_modules/ts-node')).register({ transpileOnly: true, compilerOptions: { module: 'commonjs', esModuleInterop: true } })
require(path.join(__dirname, file))
