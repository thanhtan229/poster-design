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
 * @Date: 2022-01-08 09:43:37
 * @Description: 字体处理 - 由后台接口动态拉取，去除旧版 localStorage 与硬编码模拟数据
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2026-08-31
 */
// import { isSupportFontFamily, blob2Base64 } from './utils'
import { TGetFontItemData, getFonts } from '@/api/material'

/** 字体item类型 */
export type TFontItemData = { url: string } & Omit<TGetFontItemData, 'woff'>

const fontList: TFontItemData[] = []
export const useFontStore = {
  list: fontList,
  async init() {
    this.list = []
    const res: any = await getFonts({ pageSize: 400 })
    const list = Array.isArray(res?.list) ? res.list : []
    this.list.push(
      ...list.map((x: any) => {
        // 写入防御：上游可能返回缺字段的对象，缺一不可一律按空值降级，避免后续 .url 报错
        const id = typeof x?.id === 'number' ? x.id : 0
        const value = typeof x?.value === 'string' ? x.value : ''
        const url = typeof x?.woff === 'string' ? x.woff : ''
        const alias = typeof x?.alias === 'string' ? x.alias : ''
        const preview = typeof x?.preview === 'string' ? x.preview : ''
        const lang = x?.lang === 'en' || x?.lang === 'ko' ? x.lang : 'zh' // [TINIX] ko
        return { id, oid: 0, value, preview, alias, url, lang }
      }),
    )
  },
}
