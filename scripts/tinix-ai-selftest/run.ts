// [TINIX] Offline self-test of the AI pipeline with a faked provider — runs on a TEMP database in .runtime/ai-selftest (never your real data).
// Run: npm run tinix:test-ai
import http from '../../service/src/utils/http'
import * as settings from '../../service/src/db/settings'
import { initDB, getDB } from '../../service/src/db'
import { suggestText, rewriteText, findFont, tagFonts, tagFontsFromPreview } from '../../service/src/tinix/ai/tasks'
import { monthUsage } from '../../service/src/tinix/ai/cost-log'
import { saveTinixAiSettings } from '../../service/src/tinix/ai/settings'

initDB()
const db = getDB()
for (const [v, cat, tags] of [['Great Vibes', 'script', '["lãng mạn","thư pháp"]'], ['Playfair Display', 'serif', '["sang trọng","tạp chí"]'], ['Montserrat', 'sans', '["hiện đại"]'], ['Allura', 'script', '["chữ ký"]'], ['Be Vietnam Pro', 'sans', '["nội dung"]'], ['ZCOOL', '', '[]']]) {
  db.prepare("INSERT INTO fonts (alias, value, woff, category, tags, supports_vietnamese, lang) VALUES (?,?,?,?,?,?, 'en')").run(v, v, `/static/fonts/${v}.ttf`, cat, tags, v === 'ZCOOL' ? 0 : 1)
}
saveTinixAiSettings({ price_in_per_1m: 2000, price_out_per_1m: 8000, studio_name: 'Tinix Studio' })
;(settings as any).getAiSettings = () => ({ api_key: 'test-key', base_url: 'https://fake.local/v1', text_model: 'fake-text', image_model: 'x', image_size_mode: 'openai', enabled: true })

let answers: string[] = []
let lastRequest: any = null
;(http as any).post = async (url: string, body: any) => {
  lastRequest = { url, body }
  return { choices: [{ message: { content: answers.shift() || '' } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } }
}
const img = 'data:image/png;base64,' + Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYGAAqCQX/2nHkXwAAAABJRU5ErkJggg==', 'base64').toString('base64')

async function main() {
  // 1) suggest: first answer is broken (prose), second is fenced JSON → retry must succeed
  answers = ['Xin chào, đây là gợi ý của tôi!', '```json\n' + JSON.stringify({
    scene: 'Cô dâu chú rể dưới ánh hoàng hôn',
    emptyRegions: [{ x: 0.1, y: 0.05, w: 0.8, h: 0.25, tone: 'dark' }],
    options: [
      { styleName: 'Tạp chí', regionIndex: 0, align: 'center', palette: { primary: '#ffffff', secondary: 'nope' }, parts: { title: { text: 'Mãi mãi', fontFamily: 'Playfair Display', weight: 700 }, signature: { text: 'Tinix Studio', fontFamily: 'Unknown Font' } }, translationVi: 'Forever' },
      { styleName: 'Lãng mạn', regionIndex: 9, align: 'weird', parts: { title: { text: 'Love', fontFamily: 'great vibes' } } },
    ],
  }) + '\n```']
  const s = await suggestText({ image: img, width: 3000, height: 4000, lang: 'vi' })
  console.log('suggest ok:', s.options.length, 'options; title font =', s.options[0].parts.title.fontClass?.value, '; unknown signature font →', s.options[0].parts.signature.fontClass?.value, '; bad colour →', s.options[0].palette.secondary, '; region clamp →', s.options[1].regionIndex, '; align →', s.options[1].align, '; "great vibes" →', s.options[1].parts.title.fontClass?.value)
  console.log('request model =', lastRequest.body.model, '; content parts =', lastRequest.body.messages[1].content.map((c: any) => c.type).join(','), '; image bytes ≈', Math.round(lastRequest.body.messages[1].content[1].image_url.url.length * 0.75 / 1024) + 'KB', '; retry msg sent =', lastRequest.body.messages.length === 3)

  // 2) rewrite: one replacement with an unknown uuid must be dropped
  answers = [JSON.stringify({ options: [{ styleName: 'A', replacements: [{ uuid: 'u1', text: 'Mới' }, { uuid: 'zzz', text: 'x' }] }] })]
  const r = await rewriteText({ image: img, layers: [{ uuid: 'u1', text: 'Cũ\nhai dòng' }], lang: 'keep' })
  console.log('rewrite ok:', JSON.stringify(r.options[0].replacements))

  // 3) find font: ranking
  answers = [JSON.stringify({ items: [{ text: 'Love', category: 'script', traits: ['lãng mạn', 'nối nét'], suspected: ['Great Vibes', 'Alex Brush'] }] })]
  const f = await findFont({ image: img })
  console.log('find font ok: top =', f.items[0].candidates.map((c) => `${c.value}(${c.score})`).join(', '), '; not in library =', f.items[0].notInLibrary.join(', '))

  // 3b) rebuild from a reference: two images, z-order, invalid type → shape, font role fallback
  answers = [JSON.stringify({ background: '#f4ece1', regions: [
    { type: 'text', bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 }, role: 'title', text: 'Mùa yêu', fontFamily: 'Playfair Display', fontSize: 0.07, z: 5 },
    { type: 'photo', bbox: { x: 0.1, y: 0.25, w: 0.8, h: 0.5 }, z: 1 },
    { type: 'weird', bbox: { x: 0.05, y: 0.05, w: 0.9, h: 0.002 }, color: '#aa8855', z: 0 },
    { type: 'text', bbox: { x: 0.1, y: 0.8, w: 0.8, h: 0.05 }, role: 'signature', text: 'Tinix Studio', fontFamily: 'Nope', fontSize: 0.03, z: 6 },
  ] })]
  const rb: any = await (require('../../service/src/tinix/ai/tasks') as any).rebuildFromReference({ reference: img, photo: img, lang: 'vi' })
  console.log('rebuild ok:', rb.regions.map((r: any) => `${r.type}${r.fontClass ? '/' + r.fontClass.value : ''}`).join(' → '), '; images sent =', lastRequest.body.messages[1].content.filter((c: any) => c.type === 'image_url').length, '; bg =', rb.background)

  // 4) tag fonts (text model): only the untagged font
  answers = [JSON.stringify({ fonts: [{ family: 'ZCOOL', category: 'display', tags: ['vui tươi'] }] })]
  const t = await tagFonts({})
  console.log('tag fonts ok: updated =', t.updated, '; model =', lastRequest.body.model, '; row =', JSON.stringify(db.prepare("SELECT category, tags FROM fonts WHERE value='ZCOOL'").get()))

  // 4b) tag fonts bằng ẢNH xem trước: 2 font 'name' + 1 font 'manual' (không được đụng) + 1 font thiếu ảnh
  const sharpLib = require('../../service/node_modules/sharp')
  const png = await sharpLib({ create: { width: 560, height: 72, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer()
  require('fs').mkdirSync('static/font-previews', { recursive: true })
  const idOf = (v: string) => db.prepare('SELECT id FROM fonts WHERE value = ?').get(v).id
  for (const v of ['Great Vibes', 'Montserrat', 'Allura']) { db.prepare("UPDATE fonts SET tag_source = ? WHERE value = ?").run(v === 'Allura' ? 'manual' : 'name', v); require('fs').writeFileSync(`static/font-previews/${idOf(v)}.png`, png) }
  db.prepare("UPDATE fonts SET tag_source = 'name' WHERE value = 'Playfair Display'").run() // không có ảnh → bị bỏ qua
  answers = [JSON.stringify({ fonts: [{ family: 'Great Vibes', category: 'script', tags: ['lãng mạn', 'thư pháp', 'chữ ký'] }, { family: 'Montserrat', category: 'sans', tags: ['hiện đại', 'hình học'] }] })]
  const tv = await tagFontsFromPreview({})
  const manualRow = db.prepare("SELECT category, tags, tag_source FROM fonts WHERE value = 'Allura'").get()
  const gv = db.prepare("SELECT category, tags, tag_source FROM fonts WHERE value = 'Great Vibes'").get()
  const sentImgs = lastRequest.body.messages[1].content.filter((c: any) => c.type === 'image_url').length
  console.log('tag fonts (vision) ok: updated =', tv.updated, '; images sent =', sentImgs, '; skipped no preview =', tv.skippedNoPreview, '; remaining =', tv.remaining, '; manual untouched =', manualRow.tag_source === 'manual' && manualRow.category === 'script', '; Great Vibes →', gv.tag_source, gv.tags)
  if (tv.updated !== 2 || sentImgs !== 2 || tv.skippedNoPreview < 1 || gv.tag_source !== 'vision') throw new Error('tagFontsFromPreview sai kết quả')

  // 5) provider error → readable message + logged
  ;(http as any).post = async () => { const e: any = new Error('Request failed'); e.response = { data: { error: { message: 'invalid api key' } } }; throw e }
  try { await findFont({ image: img }) } catch (e) { console.log('provider error ok:', (e as any).message) }

  // 6) Phase 4: lỗi tạm thời (503) hai lần rồi thành công → tự thử lại, tổng 3 lần gọi
  process.env.TINIX_AI_RETRY_DELAYS_MS = '5,5'
  const okFont = JSON.stringify({ items: [{ text: 'Love', category: 'script', traits: ['nối nét'], suspected: ['Great Vibes'] }] })
  const httpErr = (status: number, message: string, headers: any = {}) => { const e: any = new Error('Request failed'); e.response = { status, data: { error: { message } }, headers }; return e }
  let calls = 0
  ;(http as any).post = async () => { calls++; if (calls <= 2) throw httpErr(503, 'The service may be temporarily overloaded'); return { choices: [{ message: { content: okFont } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }
  const rf = await findFont({ image: img })
  console.log('retry ok: calls =', calls, '; result items =', rf.items.length)

  // 7) 429 hết hạn mức (quota) → KHÔNG thử lại
  calls = 0
  ;(http as any).post = async () => { calls++; throw httpErr(429, 'You exceeded your current quota, please check your plan and billing details.') }
  try { await findFont({ image: img }) } catch (e) { console.log('quota no-retry ok: calls =', calls, '; msg has 429 hint =', /429/.test((e as any).message)) }

  // 8) 503 mãi mãi → thử lại 2 lần rồi báo, ghi "đã tự thử lại 2 lần"
  calls = 0
  ;(http as any).post = async () => { calls++; throw httpErr(503, 'overloaded') }
  try { await findFont({ image: img }) } catch (e) { console.log('retry exhausted ok: calls =', calls, '; says retried =', /đã tự thử lại 2 lần/.test((e as any).message)) }

  // 9) model bị ngừng → gợi ý đổi tên model
  ;(http as any).post = async () => { throw httpErr(404, 'The model `gpt-4.1-nano` has been deprecated, learn more here') }
  try { await findFont({ image: img }) } catch (e) { console.log('model hint ok:', /Model nhìn ảnh/.test((e as any).message) && /ngừng hoặc sai tên/.test((e as any).message)) }

  // 10) Dựng theo mẫu: AI tách chữ từng ký tự → bị từ chối, lần gọi lại hợp lệ → thành công (2 request)
  const chars = ['早', '安', '平', '安', '喜', '乐'].map((c, i) => ({ type: 'text', bbox: { x: 0.1 + i * 0.1, y: 0.1, w: 0.08, h: 0.08 }, role: 'title', text: c, fontFamily: 'ZCOOL', fontSize: 0.07, z: i }))
  const good = [{ type: 'text', bbox: { x: 0.2, y: 0.05, w: 0.4, h: 0.1 }, role: 'title', text: '早安', fontFamily: 'ZCOOL', fontSize: 0.08, z: 5 }, { type: 'text', bbox: { x: 0.3, y: 0.15, w: 0.5, h: 0.1 }, role: 'title', text: '平安喜乐', fontFamily: 'ZCOOL', fontSize: 0.08, z: 6 }, { type: 'text', bbox: { x: 0.3, y: 0.15, w: 0.5, h: 0.1 }, role: 'title', text: '平安喜乐', fontFamily: 'ZCOOL', fontSize: 0.08, z: 7 }]
  const queue = [JSON.stringify({ background: '#fff', regions: chars }), JSON.stringify({ background: '#fff', regions: good })]
  let reqs = 0
  ;(http as any).post = async () => { reqs++; return { choices: [{ message: { content: queue.shift() || '' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }
  const rb2: any = await (require('../../service/src/tinix/ai/tasks') as any).rebuildFromReference({ reference: img, lang: 'vi', mode: 'faithful' })
  console.log('split-chars guard ok: requests =', reqs, '; texts =', rb2.regions.filter((r: any) => r.type === 'text').map((r: any) => r.text).join(' | '), '(trùng lặp đã bỏ)')
  delete process.env.TINIX_AI_RETRY_DELAYS_MS

  const u = monthUsage()
  console.log('usage:', u.jobs, 'jobs,', u.cost_vnd, 'đ;', JSON.stringify(db.prepare('SELECT kind, status FROM ai_jobs').all()))
}
main().catch((e) => { console.error('TEST FAILED', e); process.exit(1) })
