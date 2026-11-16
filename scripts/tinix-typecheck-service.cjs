// [TINIX] Kiểm tra kiểu cho service: npm run tinix:typecheck-service
// Service biên dịch bằng TypeScript 3.9 (xem CLAUDE.md), nhưng @types/express-serve-static-core, axios... mới hơn dùng cú pháp
// 3.9 không đọc nổi (lỗi cú pháp TS1005/TS1109...). `tsc --noEmit` khi gặp BẤT KỲ lỗi cú pháp nào sẽ BỎ QUA toàn bộ bước kiểm tra
// kiểu, và `skipLibCheck` không bỏ qua được lỗi cú pháp — nên `tsc` thường luôn báo lỗi mà không kiểm tra mã dự án.
// Script này dùng TypeScript API: lấy chẩn đoán cú pháp + ngữ nghĩa CHỈ cho file nằm ngoài node_modules.
// Thoát mã 1 nếu mã dự án có lỗi.
const path = require('path')

const service = path.resolve(__dirname, '..', 'service')
const ts = require(path.join(service, 'node_modules', 'typescript'))

const read = ts.readConfigFile(path.join(service, 'tsconfig.json'), ts.sys.readFile)
if (read.error) { console.error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n')); process.exit(1) }
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, service)
const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } })

const isLib = (f) => /[\/]node_modules[\/]/.test(f.fileName)
const own = program.getSourceFiles().filter((f) => !isLib(f))
const diagnostics = []
for (const f of own) diagnostics.push(...program.getSyntacticDiagnostics(f), ...program.getSemanticDiagnostics(f))
const libSyntax = program.getSyntacticDiagnostics().filter((d) => d.file && isLib(d.file)).length

const fmt = (d) => {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
  if (!d.file) return `error TS${d.code}: ${msg}`
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start || 0)
  return `${path.relative(service, d.file.fileName)}(${line + 1},${character + 1}): error TS${d.code}: ${msg}`
}
if (diagnostics.length) {
  console.error(diagnostics.map(fmt).join('\n'))
  console.error(`\n✗ Service: ${diagnostics.length} lỗi kiểu trong ${own.length} file mã dự án (bỏ qua ${libSyntax} lỗi cú pháp trong node_modules)`)
  process.exit(1)
}
console.log(`✓ Service: 0 lỗi kiểu trong ${own.length} file mã dự án (bỏ qua ${libSyntax} lỗi cú pháp của khai báo kiểu trong node_modules)`)
