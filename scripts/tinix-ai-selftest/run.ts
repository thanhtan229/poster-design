// [TINIX] Offline self-test of the AI pipeline with a faked provider — runs on a TEMP database in .runtime/ai-selftest (never your real data).
// Run: npm run tinix:test-ai
import http from '../../service/src/utils/http'
import * as settings from '../../service/src/db/settings'
import { initDB, getDB } from '../../service/src/db'
import { suggestText, rewriteText, findFont, tagFonts } from '../../service/src/tinix/ai/tasks'
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

  // 5) provider error → readable message + logged
  ;(http as any).post = async () => { const e: any = new Error('Request failed'); e.response = { data: { error: { message: 'invalid api key' } } }; throw e }
  try { await findFont({ image: img }) } catch (e) { console.log('provider error ok:', (e as any).message) }

  const u = monthUsage()
  console.log('usage:', u.jobs, 'jobs,', u.cost_vnd, 'đ;', JSON.stringify(db.prepare('SELECT kind, status FROM ai_jobs').all()))
}
main().catch((e) => { console.error('TEST FAILED', e); process.exit(1) })
