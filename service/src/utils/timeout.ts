/*
 * @Author: ShawnPhang
 * @Date: 2021-12-24 17:51:15
 * @Description: 超时中间件
 * @LastEditors: ShawnPhang <site: m.palxp.cn>
 * @LastEditTime: 2023-07-05 20:17:00
 */

export default async (req: any, res: any, next: any) => {
  const { queueList } = require('../utils/node-queue.ts')
  const time = req.path.startsWith('/api/tinix/ai/') ? 240000 : req.path === '/api/screenshots' ? 75000 : 30000
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
