/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * 字体数据访问
 */
import { getDB } from './index'

export interface FontRow {
  id: number
  alias: string
  value: string
  preview: string
  woff: string
  ttf: string
  lang: string
  font_family: string
  size: number
  woff_size: number
  supports_vietnamese: number // [TINIX] 1 = có chữ tiếng Việt
  created_at: string
}

const LIST_FIELDS = 'id, alias, value, preview, woff, ttf, lang, font_family, size, woff_size, supports_vietnamese, created_at'

/** 分页查询字体；搜索名称、value 和 font-family。 */
export function listFonts(page = 1, pageSize = 20, search = ''): { list: FontRow[]; total: number } {
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)))
  const keyword = String(search || '').trim()
  const where = keyword ? 'WHERE alias LIKE @keyword OR value LIKE @keyword OR font_family LIKE @keyword' : ''
  const params: any = keyword ? { keyword: `%${keyword}%` } : {}
  const total = Number(getDB().prepare(`SELECT COUNT(*) AS n FROM fonts ${where}`).get(params).n || 0)
  const list = getDB().prepare(`SELECT ${LIST_FIELDS} FROM fonts ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`).all({
    ...params,
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
  }) as FontRow[]
  return { list, total }
}

/** 全部字体（用于编辑器加载，公开接口保持一次返回） */
export function listAllFonts(): FontRow[] {
  return getDB().prepare(`SELECT ${LIST_FIELDS} FROM fonts ORDER BY id DESC`).all() as FontRow[]
}

/** 查单条字体（用于校验存在性），不存在返回 undefined */
export function getFontById(id: number): FontRow | undefined {
  return getDB().prepare(`SELECT ${LIST_FIELDS} FROM fonts WHERE id = ?`).get(id) as FontRow | undefined
}

export interface AddFontParams {
  alias: string
  value: string
  preview: string
  woff: string
  ttf: string
  lang: string
  font_family: string
  size: number
  woff_size: number
  supports_vietnamese?: boolean | number // [TINIX]
}

/** 新增字体，返回自增 id */
export function addFont(params: AddFontParams): number {
  const info = getDB()
    .prepare(`INSERT INTO fonts (alias, value, preview, woff, ttf, lang, font_family, size, woff_size, supports_vietnamese)
      VALUES (@alias, @value, @preview, @woff, @ttf, @lang, @font_family, @size, @woff_size, @supports_vietnamese)`)
    .run({ ...params, supports_vietnamese: params.supports_vietnamese ? 1 : 0 })
  return Number(info.lastInsertRowid)
}

/** 更新字体基础信息；文件大小字段由上传/新增时记录，编辑不改动。 */
export function updateFont(id: number, params: Omit<AddFontParams, 'size' | 'woff_size'>): boolean {
  const info = getDB().prepare(`UPDATE fonts SET alias = @alias, value = @value, preview = @preview,
    woff = @woff, ttf = @ttf, lang = @lang, font_family = @font_family, supports_vietnamese = @supports_vietnamese WHERE id = @id`).run({ id, ...params, supports_vietnamese: params.supports_vietnamese ? 1 : 0 })
  return info.changes > 0
}

/** 删除字体（物理删除），返回是否命中 */
export function deleteFont(id: number): boolean {
  const info = getDB().prepare('DELETE FROM fonts WHERE id = ?').run(id)
  return info.changes > 0
}

/** 统计字体数量（用于种子判断） */
export function countFonts(): number {
  return getDB().prepare('SELECT COUNT(*) AS n FROM fonts').get().n as number
}
