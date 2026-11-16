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
 * 数据库行类型定义
 */

/** 模板 / 组件（type: 0 模板，1 组件） */
export interface TemplateRow {
  id: number
  title: string
  cover: string
  width: number
  height: number
  state: number
  type: 0 | 1
  cate: string
  data: string
}

/** 模板列表项（不含 data 大字段） */
export interface TemplateListItem {
  id: number
  title: string
  cover: string
  width: number
  height: number
  state: number
  photo_slots?: number // [TINIX] số khung ảnh đã đánh dấu (0 = chưa đánh dấu → mẫu 1 ảnh mặc định)
}

/** 素材 / 照片分类（整块 JSON 存储） */
export interface CategoryRow {
  cate: string
  list: string
}

/** 用户上传图片记录 */
export interface UserImageRow {
  id: number
  url: string
  width: number
  height: number
  created_at: string
}
