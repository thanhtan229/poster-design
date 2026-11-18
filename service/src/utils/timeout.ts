/*
 * @Author: ShawnPhang
 * @Date: 2021-12-24 17:51:15
 * @Description: 超时中间件
 * @LastEditors: ShawnPhang <site: m.palxp.cn>
 * @LastEditTime: 2023-07-05 20:17:00
 */

import { exportTimeoutSec } from './export-limits'

export default async (req: any, res: any, next: any) => {
  const { queueList } = require('../utils/node-queue.ts')
  const time = /^\/api\/tinix\/(cutout|collage-print)\//.test(req.path) || req.path === '/api/tinix/export-render' ? 200000 : req.path.startsWith('/api/tinix/ai/') ? 240000 : req.path === '/api/screenshots' ? Math.max(75000, (exportTimeoutSec(req.query && req.query.width, req.query && req.query.height) + 15) * 1000) : 30000
  res.setTimeout(time, () => {
    const statusCode = 408
    const index = req._queueSign ? queueList.findIndex((x: any) => x.sign === req._queueSign) : -1
    if (index !== -1) {
      queueList.splice(index, 1)
    }
    if (!res.headersSent) {
      res.status(statusCode).json({
        statusCode,
        message: 'Quá thời gian phản hồi, vui lòng thử lại',
      })
    }
  })
  next()
}
