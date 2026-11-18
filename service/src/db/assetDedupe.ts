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
 * 批量入库去重：已有素材 URL 集合、已有文字组件签名集合。
 * 签名算法必须与前端 src/common/methods/extractAssets.ts 保持一致。
 */
import { getDB } from './index'

const TEXT_SIGNATURE_FIELDS = ['text', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'lineHeight', 'writingMode', 'textAlign']

export function normalizeUrl(url: string): string {
  return String(url || '').trim().replace(/[?#].*$/, '')
}

export function normalizeAssetType(type: string): string {
  return type === 'png' ? 'image' : type
}

export function assetKey(type: string, url: string): string {
  return `${normalizeAssetType(type)}:${normalizeUrl(url)}`
}

export function textSignature(group: any, children: any[]): string {
  const parts = children
    .filter((w) => w?.type === 'w-text')
    .map((w) => TEXT_SIGNATURE_FIELDS.map((k) => String(w[k] ?? '')).join('|'))
  return `${Math.round(Number(group?.width) || 0)}x${Math.round(Number(group?.height) || 0)}#${parts.join('~')}`
}

/** 库内已有的素材 key 集合（所有分类） */
export function existingMaterialKeys(): Set<string> {
  const keys = new Set<string>()
  const rows: { list: string }[] = getDB().prepare('SELECT list FROM materials').all()
  rows.forEach((row) => {
    try {
      const list = JSON.parse(row.list)
      if (Array.isArray(list)) list.forEach((item) => item?.url && keys.add(assetKey(item.type, item.url)))
    } catch (e) {}
  })
  const photoRows: { list: string }[] = getDB().prepare('SELECT list FROM photos').all()
  photoRows.forEach((row) => {
    try {
      const list = JSON.parse(row.list)
      if (Array.isArray(list)) list.forEach((item) => item?.url && keys.add(assetKey('photo', item.url)))
    } catch (e) {}
  })
  return keys
}

/** 库内已有文字组件（type=1）的签名集合 */
export function existingTextSignatures(): Set<string> {
  const signatures = new Set<string>()
  const rows: { data: string }[] = getDB().prepare('SELECT data FROM templates WHERE type = 1').all()
  rows.forEach((row) => {
    try {
      let parsed = JSON.parse(row.data)
      if (parsed && typeof parsed.data === 'string') parsed = JSON.parse(parsed.data)
      if (!Array.isArray(parsed)) return
      const group = [...parsed].reverse().find((w) => w?.type === 'w-group')
      if (group) signatures.add(textSignature(group, parsed.filter((w) => w !== group)))
    } catch (e) {}
  })
  return signatures
}
