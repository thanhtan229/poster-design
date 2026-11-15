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
 * 认证工具：密码哈希 + HMAC token 签发/校验 + 请求鉴权中间件
 */
import { getDB } from '../db'

/** Stable internal owner for new records. Legacy ownership is kept in the database.
 * This app runs only on loopback; no token or browser account is required.
 */
export function getRequestUser(_req: any): { id: number; account: string } {
  const owner = getDB().prepare('SELECT id, account FROM users ORDER BY role DESC, id ASC LIMIT 1').get()
  if (!owner) throw new Error('Không tìm thấy chủ sở hữu dữ liệu')
  return owner
}

/** Compatibility middleware for content-management routes in the personal workspace. */
export function requireAdmin(req: any, _res: any, next: () => void) {
  req.user = getRequestUser(req)
  next()
}
