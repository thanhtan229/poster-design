// [TINIX] Local YuNet inference for the on-demand photo crop suggestion.
import { Router } from 'express'
const { detectFaces } = require('../../../scripts/lib/photo-faces.cjs')

const router = Router()
router.post('/api/tinix/photo-faces', async (req: any, res: any) => {
  const { status, faces } = await detectFaces(req.body && req.body.image)
  return status === 200 ? res.json({ faces }) : res.sendStatus(status)
})

export default router
