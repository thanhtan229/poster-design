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
 * 模板 / 组件数据访问
 */
import { getDB } from './index'
import { TemplateListItem, TemplateRow } from './types'
import { photosCondition, photoCountBuckets } from '../tinix/templateSlots' // [TINIX]

const LIST_FIELDS = 'id, title, cover, width, height, state, photo_slots' // [TINIX] photo_slots: số khung ảnh đã đánh dấu

type ListOptions = { page: number; pageSize: number; cate?: string; search?: string; categoryId?: number; uncategorized?: boolean; photos?: string }

/** Điều kiện lọc dùng chung cho danh sách và bộ đếm (không gồm điều kiện số ảnh) */
function baseConditions(type: 0 | 1, options: ListOptions): { conditions: string[]; params: Record<string, any> } {
  const params: Record<string, any> = { type }
  const conditions = ['type = @type', 'state = 1']
  // [TINIX] lọc theo nhóm (liên kết theo id) hoặc "chưa phân nhóm"; lọc theo tên (cate) giữ lại cho tương thích
  if (options.uncategorized) {
    conditions.push('NOT EXISTS (SELECT 1 FROM template_group_links l WHERE l.template_id = templates.id)')
  } else if (options.categoryId) {
    conditions.push('EXISTS (SELECT 1 FROM template_group_links l WHERE l.template_id = templates.id AND l.category_id = @categoryId)')
    params.categoryId = options.categoryId
  } else if (options.cate) {
    conditions.push('cate = @cate')
    params.cate = options.cate
  }
  if (options.search) {
    conditions.push('title LIKE @search')
    params.search = `%${options.search}%`
  }
  return { conditions, params }
}

/** [TINIX] Số mẫu theo số ảnh (1, 2, 3, 4, 5+) trong phạm vi nhóm/tìm kiếm hiện tại */
export function photoCounts(type: 0 | 1, options: ListOptions): Record<string, number> {
  const { conditions, params } = baseConditions(type, options)
  return photoCountBuckets(conditions.join(' AND '), params)
}

export function listPage(type: 0 | 1, options: ListOptions): { list: TemplateListItem[]; total: number } {
  const offset = (options.page - 1) * options.pageSize
  const { conditions, params: baseParams } = baseConditions(type, options)
  const params: Record<string, any> = { ...baseParams, offset, pageSize: options.pageSize }
  const photosCond = options.photos ? photosCondition(options.photos) : null // [TINIX] lọc theo số khung ảnh
  photosCond && conditions.push(photosCond)
  const where = conditions.join(' AND ')
  const total = Number(getDB().prepare(`SELECT COUNT(*) AS total FROM templates WHERE ${where}`).get(params)?.total || 0)
  const list = getDB().prepare(`SELECT ${LIST_FIELDS} FROM templates WHERE ${where} ORDER BY id DESC LIMIT @pageSize OFFSET @offset`).all(params)
  return { list, total }
}

/** 获取模板 / 组件详情（返回前端加载所需的元数据和 data 字符串） */
export function getDetail(id: number, type: 0 | 1): any | null {
  const row: TemplateRow | undefined = getDB()
    .prepare('SELECT * FROM templates WHERE id = ? AND type = ? AND state = 1')
    .get(id, type)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.data)
    // 兼容历史导入记录：旧详情文件外层包含 id/cover/data，真正设计数据在 data 字符串中。
    const designData = parsed && typeof parsed.data === 'string' ? parsed.data : row.data
    JSON.parse(designData)
    return {
      id: row.id,
      title: row.title,
      cover: row.cover,
      width: row.width,
      height: row.height,
      state: row.state,
      type: row.type,
      data: designData,
    }
  } catch (e) {
    console.warn(`[db:templates] 模板 ${id} 的 data 解析失败，降级返回空`)
    return null
  }
}

export interface SaveTemplateParams {
  title: string
  data: string
  width: number
  height: number
  type: 0 | 1
  cate: string
}

export function createTemplate(params: SaveTemplateParams): number {
  const info = getDB()
    .prepare(`INSERT INTO templates (title, cover, width, height, state, type, cate, data)
      VALUES (@title, '', @width, @height, 1, @type, @cate, @data)`)
    .run(params)
  return Number(info.lastInsertRowid)
}

export function updateTemplate(id: number, params: SaveTemplateParams): boolean {
  const info = getDB()
    .prepare(`UPDATE templates SET title = @title, width = @width, height = @height, data = @data
      WHERE id = @id AND type = @type`)
    .run({ ...params, id })
  return info.changes > 0
}

export function updateTemplateCategory(id: number, type: 0 | 1, cate: string): boolean {
  const info = getDB().prepare('UPDATE templates SET cate = ? WHERE id = ? AND type = ?').run(cate, id, type)
  return info.changes > 0
}

/** 保存封面地址（截图服务生成后回填） */
export function setCover(id: number, cover: string): void {
  getDB().prepare('UPDATE templates SET cover = ? WHERE id = ?').run(cover, id)
}
