/**
 * [TINIX] AI routes, mounted in main.ts. All require a logged-in user (single-user app: the admin).
 *
 *   POST /api/tinix/ai/suggest-text   { image, width, height, lang }
 *   POST /api/tinix/ai/rewrite-text   { image, layers: [{uuid, text}], lang }
 *   POST /api/tinix/ai/find-font      { image }
 *   POST /api/tinix/ai/tag-fonts      { all? }
 *   GET  /api/tinix/ai/jobs?limit=&kind=
 *   GET  /api/tinix/ai/usage?month=YYYY-MM
 *   GET  /api/tinix/ai/settings       → tinix settings + status of the base AI config
 *   POST /api/tinix/ai/settings       { vision_model, studio_name, price_in_per_1m, price_out_per_1m, monthly_limit_vnd }
 */
import express from 'express'
import { send } from '../../utils/tools'
import { getRequestUser } from '../../utils/auth'
import { getAiSettings } from '../../db/settings'
import { getTinixAiSettings, saveTinixAiSettings } from './settings'
import { listJobs, monthUsage } from './cost-log'
import { suggestText, rewriteText, findFont, tagFonts } from './tasks'

const router = express.Router()
const PREFIX = '/api/tinix/ai'

function requireLogin(req: any, res: any, next: () => void) {
  if (!getRequestUser(req)) return res.json({ code: 401, msg: '请先登录' })
  next()
}

/** Wrap an async handler: answer { code: 200, result } or { code: 500, msg } (never crash the service). */
const handle = (fn: (body: any, req: any) => Promise<any>) => async (req: any, res: any) => {
  try {
    send.success(res, await fn(req.body || {}, req))
  } catch (e) {
    const msg = (e && (e as any).message) || String(e)
    console.warn('[tinix:ai]', req.path, msg)
    send.error(res, msg)
  }
}

router.post(`${PREFIX}/suggest-text`, requireLogin, handle((b) => suggestText({ image: b.image, width: Number(b.width) || 0, height: Number(b.height) || 0, lang: b.lang })))
router.post(`${PREFIX}/rewrite-text`, requireLogin, handle((b) => rewriteText({ image: b.image, layers: Array.isArray(b.layers) ? b.layers : [], lang: b.lang })))
router.post(`${PREFIX}/find-font`, requireLogin, handle((b) => findFont({ image: b.image })))
router.post(`${PREFIX}/tag-fonts`, requireLogin, handle((b) => tagFonts({ all: !!b.all })))
router.get(`${PREFIX}/jobs`, requireLogin, handle(async (_b, req) => ({ list: listJobs(Number(req.query.limit) || 30, req.query.kind ? String(req.query.kind) : undefined) })))
router.get(`${PREFIX}/usage`, requireLogin, handle(async (_b, req) => ({ ...monthUsage(req.query.month ? String(req.query.month) : undefined), limit_vnd: getTinixAiSettings().monthly_limit_vnd })))
router.get(
  `${PREFIX}/settings`,
  requireLogin,
  handle(async () => {
    const base = getAiSettings()
    return { ...getTinixAiSettings(), base: { enabled: base.enabled, has_key: !!base.api_key, base_url: base.base_url, text_model: base.text_model } }
  }),
)
router.post(`${PREFIX}/settings`, requireLogin, handle(async (b) => saveTinixAiSettings(b)))

export default router
