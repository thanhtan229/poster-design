/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { getDB } from './index'

export type DesignRow = { id: number; user_id: number; template_id: number; title: string; data: string; cover: string; width: number; height: number; created_at: string; updated_at: string }
export function createDesign(data: Omit<DesignRow, 'id' | 'created_at' | 'updated_at'>): number {
  const result = getDB().prepare('INSERT INTO designs (user_id, template_id, title, data, cover, width, height) VALUES (@user_id, @template_id, @title, @data, @cover, @width, @height)').run(data)
  return Number(result.lastInsertRowid)
}
export function updateDesign(id: number, userId: number, data: Partial<Pick<DesignRow, 'title' | 'data' | 'cover' | 'width' | 'height'>>): boolean {
  const fields = Object.keys(data)
  if (!fields.length) return false
  const params: any = { id, user_id: userId, ...data }
  const set = fields.map((field) => `${field} = @${field}`).join(', ')
  return getDB().prepare(`UPDATE designs SET ${set}, updated_at = datetime('now', 'localtime') WHERE id = @id`).run(params).changes > 0
}
export function getDesign(id: number, userId: number): DesignRow | undefined { return getDB().prepare('SELECT * FROM designs WHERE id = ?').get(id) }
export function listDesigns(userId: number, page: number, pageSize: number) {
  const total = Number(getDB().prepare('SELECT COUNT(*) AS total FROM designs').get()?.total || 0)
  const list = getDB().prepare('SELECT id, title, cover, width, height, created_at, updated_at FROM designs ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, (page - 1) * pageSize)
  return { list, total }
}
export function deleteDesign(id: number, userId: number): boolean { return getDB().prepare('DELETE FROM designs WHERE id = ?').run(id).changes > 0 }
export function listAllDesigns() {
  return getDB().prepare('SELECT designs.id, designs.user_id, users.account, designs.title, designs.cover, designs.width, designs.height, designs.created_at, designs.updated_at FROM designs LEFT JOIN users ON users.id = designs.user_id ORDER BY designs.id DESC').all()
}
export function deleteDesignByAdmin(id: number): boolean { return getDB().prepare('DELETE FROM designs WHERE id = ?').run(id).changes > 0 }
