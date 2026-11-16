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
 * @Date: 2021-09-30 14:47:22
 * @Description: 下载图片（多标签页版本，不建议在低配置服务器中使用）
 * @LastEditors: ShawnPhang <site: m.palxp.cn>
 * @LastEditTime: 2023-07-17 18:05:31
 */
const isDev = process.env.NODE_ENV === 'development'
const puppeteer = require('puppeteer')
const sharp = require('sharp')
const { executablePath, releaseTime } = require('../configs.ts')
const forceTimeOut = 60 // 强制超时时间，单位：秒
let browser: typeof puppeteer = null
let release: any = null

export const saveScreenshot = async (url: string, { path, width, height, thumbPath, size = 0, quality = 0, prevent, ua, devices, scale, wait }: any) => {
  return new Promise(async (resolve: Function) => {
    // 启动浏览器
    if (!browser) {
      browser = await puppeteer.launch({
        headless: !isDev,
        executablePath: isDev ? null : executablePath,
        acceptInsecureCerts: true, // [TINIX] Puppeteer mới: thay cho ignoreHTTPSErrors; tham số dùng '--' chuẩn (trước là dấu gạch ngang dài)
        args: ['--no-first-run', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', `--window-size=${width},${height}`], // 优化配置
        defaultViewport: null,
      })
    }

    // 打开页面
    const page = await browser.newPage()
    // 设置浏览器视窗
    page.setViewport({
      width: Number(width),
      height: Number(height),
      deviceScaleFactor: !isNaN(scale) ? (+scale > 4 ? 4 : +scale) : 1,
    })
    ua && page.setUserAgent(ua)
    if (devices) {
      devices = puppeteer.devices[devices]
      devices && (await page.emulate(devices))
    }
    // 自动模式下页面加载完毕立即截图
    if (!prevent) {
      page.on('load', async () => {
        clearTimeout(regulators)
        await autoScroll(page)
        await sleep(wait)
        // await waitTillHTMLRendered(page)
        await page.screenshot({ path, fullPage: true })
        await page.close()
        thumbPath && compress()
        resolve()
      })
    } else {
      // 主动模式下注入全局方法
      await page.exposeFunction('loadFinishToInject', async () => {
        clearTimeout(regulators)
        await page.screenshot({ path, omitBackground: true })
        await page.close()
        thumbPath && compress()
        resolve()
      })
    }

    // 地址栏输入网页地址
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // 截图: https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagescreenshotoptions
    const regulators = setTimeout(() => {
      page.close()
      console.log('任务超时，已失败')
      resolve()
    }, forceTimeOut * 1000)
    
    clearTimeout(release)
    release = setTimeout(() => {
      browser && browser.close()
      browser = null
    }, releaseTime * 1000);

    function compress() {
      // 压缩图片
      try {
          thumbPath &&
            sharp(path)
              .resize(+size || 300)
              .jpeg({ quality: +quality || 70 })
              .toFile(thumbPath)
              .catch((err: Error) => console.log(err))
      } catch (err) {
        console.log(err)
      }
    }
  })
}

function sleep(timeout: number = 1) {
  return new Promise((resolve: any) => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

async function autoScroll(page: any) {
  await page.evaluate(async () => {
    await new Promise((resolve: any, reject: any) => {
      try {
        const maxScroll = Number.MAX_SAFE_INTEGER
        let lastScroll = 0
        const interval = setInterval(() => {
          window.scrollBy(0, 100)
          const scrollTop = document.documentElement.scrollTop || window.scrollY
          if (scrollTop === maxScroll || scrollTop === lastScroll) {
            clearInterval(interval)
            resolve()
          } else {
            lastScroll = scrollTop
          }
        }, 60)
      } catch (err) {
        console.log(err)
        reject(err)
      }
    })
  })
}

export default { saveScreenshot }
