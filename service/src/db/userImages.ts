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
 * 用户上传图片记录
 */
import { getDB } from './index'
import { UserImageRow } from './types'

export function addUserImage(userId: number, url: string, width: number, height: number): void {
  getDB().prepare('INSERT INTO user_images (user_id, url, width, height) VALUES (?, ?, ?, ?)').run(userId, url, width, height)
}

export function listUserImages(userId?: number): UserImageRow[] {
  return getDB().prepare('SELECT id, url, width, height, created_at FROM user_images ORDER BY id DESC').all()
}

/** 删除当前用户自己的上传记录，返回是否删除成功 */
export function deleteUserImage(id: number, userId: number): boolean {
  if (!(id > 0) || !(userId > 0)) return false
  return getDB().prepare('DELETE FROM user_images WHERE id = ?').run(id).changes > 0
}
