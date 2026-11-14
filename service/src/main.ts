/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
/*
 * @Author: ShawnPhang
 * @Date: 2022-02-01 13:41:59
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2026-08-31 01:20:06
 */

// [TINIX] must stay the first import — loads service/.env before configs are read
import { listenHost } from './tinix/env'
import './tinix/process-guard' // [TINIX] don't crash on a timed-out export
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs'
import path from 'path' // [TINIX]
import router from './control/router'
import tinixAiRouter from './tinix/ai/routes' // [TINIX]
import { filePath, servicePort } from './configs'
import handleTimeout from './utils/timeout'
import { initDB } from './db'
import { restoreSeed } from './db/seed'

const port = process.env.PORT || servicePort
const app = express()

// 创建目录
const createFolder = (folder: string) => {
  try {
    fs.accessSync(folder)
  } catch (e) {
    fs.mkdirSync(folder)
  }
}
createFolder(filePath)
restoreSeed()
initDB()

app.all('*', (req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'X-Access-Token,Content-Type,Authorization,Content-Length,Content-Size')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Content-Type', 'application/json;charset=utf-8')
  next()
})

app.use('/static', setUploadContentType, express.static(process.cwd() + `/static/`))
if (process.env.NODE_ENV === 'development') {
}

app.use(handleTimeout)

app.use((req: any, res: any, next: any) => {
  console.log(req.path)
  next()
})

app.use(bodyParser.urlencoded({ limit: '100mb', extended: true, parameterLimit: 100000 }))
app.use(bodyParser.json({ limit: '100mb' }))
app.use(router)
app.use(tinixAiRouter) // [TINIX] /api/tinix/ai/*

// [TINIX] Chế độ production một cổng (npm run tinix:prod): service tự phục vụ bản build của frontend (../dist) + SPA fallback.
// Đặt SAU các router nên mọi route API vẫn được ưu tiên.
if (process.env.TINIX_SERVE_DIST === '1') {
  const dist = path.resolve(process.cwd(), '..', 'dist')
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    // middleware gốc gắn Content-Type: application/json cho mọi phản hồi → gỡ để static/sendFile tự đặt đúng loại (JS module cần MIME JavaScript)
    const clearType = (req: any, res: any, next: any) => {
      res.removeHeader('Content-Type')
      next()
    }
    app.use(clearType, express.static(dist))
    app.get('*', clearType, (req: any, res: any, next: any) => {
      if (/^\/(api|static|design)\//.test(req.path)) return next()
      res.sendFile(path.join(dist, 'index.html'))
    })
    console.log('[tinix] phục vụ frontend từ', dist)
  } else {
    console.warn('[tinix] TINIX_SERVE_DIST=1 nhưng chưa có dist/index.html — chạy: npm run tinix:prod -- --build')
  }
}

// [TINIX] bind to localhost only (override with HOST in service/.env)
app.listen(Number(port), listenHost, () => console.log(`Screenshot Server start on http://${listenHost}:${port}`))

const getContentType = function (path: any) {
  const extension = path.split('.').pop().toLowerCase()
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    default:
      return null
  }
}

function setUploadContentType(req: any, res: any, next: any) {
  const contentType = getContentType(req.path)
  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }
  next()
}
