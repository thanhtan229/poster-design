// [TINIX] Chạy toàn bộ kiểm thử offline: npm run tinix:test
// 1) selftest AI (nhà cung cấp giả)  2) selftest font  3) kiểm tra khóa i18n
// Thoát với mã khác 0 nếu có phần nào lỗi. Mọi thứ chạy trên DB tạm trong .runtime/, không cần app/API key.
const { spawnSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname, '..')
const node = process.execPath

const suites = [
  { name: 'AI (nhà cung cấp giả)', args: [path.join(root, 'scripts/tinix-ai-selftest/index.cjs')], cwd: root },
  { name: 'Font', args: [path.join(root, 'scripts/tinix-selftest/run-ts.cjs'), 'fonts.ts'], cwd: root },
  { name: 'Đơn vị cm/DPI + PNG DPI', args: [path.join(root, 'scripts/tinix-selftest/run-ts.cjs'), 'units.ts'], cwd: root },
  { name: 'Nhóm mẫu thiết kế', args: [path.join(root, 'scripts/tinix-selftest/run-ts.cjs'), 'groups.ts'], cwd: root },
  { name: 'Ảnh tải lên (ảnh nhẹ, xóa an toàn, yêu thích)', args: [path.join(root, 'scripts/tinix-selftest/run-ts.cjs'), 'photos.ts'], cwd: root },
  {
    name: 'Khóa i18n',
    args: ['-e', "require('./service/node_modules/ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', esModuleInterop: true } }); require('./scripts/check-i18n-keys.ts')"],
    cwd: root,
  },
]

let failed = 0
for (const s of suites) {
  console.log(`\n=== ${s.name} ===`)
  const r = spawnSync(node, s.args, { cwd: s.cwd, stdio: 'inherit' })
  if (r.status !== 0) { failed++; console.log(`✗ ${s.name} lỗi (mã ${r.status})`) }
}
console.log(failed ? `\n✗ ${failed}/${suites.length} nhóm kiểm thử lỗi` : `\n✓ ${suites.length}/${suites.length} nhóm kiểm thử đạt`)
process.exit(failed ? 1 : 0)
