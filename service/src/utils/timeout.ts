/*
 * @Author: ShawnPhang
 * @Date: 2021-12-24 17:51:15
 * @Description: 超时中间件
 * @LastEditors: ShawnPhang <site: m.palxp.cn>
 * @LastEditTime: 2023-07-05 20:17:00
 */

import { exportTimeoutSec } from './export-limits'
import { cancelQueuedRender } from './node-queue' // [TINIX]

export default async (req: any, res: any, next: any) => {
  const time = /^\/api\/tinix\/(cutout|collage-print)\//.test(req.path) || req.path === '/api/tinix/export-render' ? 200000 : req.path.startsWith('/api/tinix/ai/') ? 240000 : req.path === '/api/screenshots' ? Math.max(75000, (exportTimeoutSec(req.query && req.query.width, req.query && req.query.height) + 15) * 1000) : 30000
  res.setTimeout(time, () => {
    const statusCode = 408
    cancelQueuedRender(req._queueSign) // [TINIX] Release callers waiting on the removed render.
    if (!res.headersSent) {
      res.status(statusCode).json({
        statusCode,
        message: 'Quá thời gian phản hồi, vui lòng thử lại',
      })
    }
  })
  next()
}
