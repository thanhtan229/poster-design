// [TINIX] Sinh ảnh xem trước (một dòng chữ mẫu viết bằng chính font đó) cho từng font trong kho.
// Ảnh lưu ở service/static/font-previews/<id>.png và đường dẫn ghi vào cột fonts.preview,
// để danh sách chọn font trong editor hiện được hình dạng thật của font thay vì chỉ tên.
//
// Chạy (service phải đang chạy ở cổng 7001 vì font được nạp qua /static):
//   npm run tinix:font-previews                 → chỉ làm font chưa có ảnh
//   npm run tinix:font-previews -- --force      → làm lại tất cả
//   npm run tinix:font-previews -- --only "Jua" → chỉ một font (khớp tên/value)
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = path.join(root, 'service')
const require = createRequire(path.join(serviceDir, 'package.json'))
const Database = require('better-sqlite3')
const puppeteer = require('puppeteer')

const force = process.argv.includes('--force')
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx >= 0 ? String(process.argv[onlyIdx + 1] || '').toLowerCase() : ''
const base = process.env.TINIX_SERVICE_URL || 'http://127.0.0.1:7001'
const outDir = path.join(serviceDir, 'static', 'font-previews')
const dbPath = path.join(serviceDir, 'data', 'poster.db')

// Ảnh hiển thị ~280×36 CSS px; chụp ở độ phân giải ×2 cho nét.
const W = 280
const H = 36

function sampleFor(f) {
  if (f.lang === 'ko') return '안녕하세요 사랑해요 Aa'
  if (f.lang === 'zh') return '早安 平安喜乐 Aa'
  if (f.supports_vietnamese) return 'Trọn đời bên nhau Aa'
  return 'Wedding Day Aa 123'
}

function fontUrl(woff) {
  if (/^https?:\/\//i.test(woff)) return woff
  return base + (woff.startsWith('/') ? woff : '/' + woff)
}

async function serviceUp() {
  try {
    await fetch(base + '/', { method: 'GET' })
    return true
  } catch (e) {
    return false
  }
}

async function main() {
  if (!fs.existsSync(dbPath)) throw new Error(`Không thấy ${dbPath}`)
  if (!(await serviceUp())) throw new Error(`Service chưa chạy (${base}). Hãy mở app trước (Mo-TinixPoster.cmd) rồi chạy lại.`)
  fs.mkdirSync(outDir, { recursive: true })

  const db = new Database(dbPath)
  const rows = db.prepare('SELECT id, alias, value, woff, ttf, lang, supports_vietnamese, preview FROM fonts ORDER BY id').all()
  const todo = rows.filter((f) => {
    if (only) return f.alias.toLowerCase().includes(only) || f.value.toLowerCase().includes(only)
    return force || !f.preview || !fs.existsSync(path.join(outDir, `${f.id}.png`))
  })
  if (!todo.length) return console.log('Không có font nào cần làm (dùng --force để làm lại).')
  console.log(`Làm ảnh xem trước cho ${todo.length}/${rows.length} font…`)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const update = db.prepare('UPDATE fonts SET preview = ? WHERE id = ?')
  let ok = 0
  const failed = []
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: W + 40, height: H + 40, deviceScaleFactor: 2 })
    for (const f of todo) {
      const src = f.woff || f.ttf
      if (!src) { failed.push(`${f.alias} (không có đường dẫn font)`); continue }
      const family = `pv${f.id}`
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face { font-family: '${family}'; src: url('${fontUrl(src)}'); font-display: block; }
        html,body { margin:0; background:transparent; }
        #row { width:${W}px; height:${H}px; display:flex; align-items:center; overflow:hidden; white-space:nowrap;
               font-family:'${family}', 'Segoe UI Symbol'; font-size:24px; line-height:1.2; color:#1f2329; padding-left:2px; box-sizing:border-box; }
      </style></head><body><div id="row"></div></body></html>`
      await page.setContent(html, { waitUntil: 'load' })
      const res = await page.evaluate(
        async (family, text, w) => {
          const row = document.getElementById('row')
          const span = document.createElement('span')
          span.textContent = text
          row.replaceChildren(span)
          let loaded = false
          try {
            await document.fonts.load(`24px '${family}'`, text)
            loaded = document.fonts.check(`24px '${family}'`, text)
          } catch (e) {
            loaded = false
          }
          // thu nhỏ chữ cho vừa khung (font rất rộng như Bungee), tối thiểu 13px
          let size = 24
          while (span.getBoundingClientRect().width > w - 6 && size > 13) { size -= 1; row.style.fontSize = size + 'px' }
          return { loaded, size }
        },
        family,
        sampleFor(f),
        W,
      )
      if (!res.loaded) { failed.push(`${f.alias} (font không nạp được)`); continue }
      const el = await page.$('#row')
      const file = path.join(outDir, `${f.id}.png`)
      await el.screenshot({ path: file, omitBackground: true })
      update.run(`/static/font-previews/${f.id}.png`, f.id)
      ok++
      process.stdout.write(`  ✓ ${f.alias} (${res.size}px)\n`)
    }
  } finally {
    await browser.close()
    db.close()
  }
  console.log(`\nXong: ${ok} ảnh. Lỗi: ${failed.length}${failed.length ? '\n  - ' + failed.join('\n  - ') : ''}`)
}

main().catch((e) => {
  console.error('[tinix:font-previews] Lỗi:', e.message)
  process.exit(1)
})
