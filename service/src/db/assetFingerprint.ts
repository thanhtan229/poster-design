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
 * 素材「内容指纹」：用于批量入库时识别 URL 不同但图像相同的重复素材（与库内已有素材比对，也在本批次内互相比对）。
 * - 字节 SHA-256 完全相同 → 重复
 * - 位图 / mask：16×16 RGBA 缩略图 + 宽高比接近 → 重复（识别重新编码、缩放后的同一张图）
 * - SVG：规范化文本的哈希
 * 指纹缓存在 asset_fingerprints 表（以规范化 URL 为键），库内旧素材首次比对时惰性补算。
 * 读取失败（404、超时、无法解码）的素材没有指纹，不参与内容去重。
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { getDB } from './index'
import { normalizeUrl } from './assetDedupe'

const sharp = require('sharp')

const GRID = 16
/** 缩略图每通道平均差异阈值（0~255）。同形状不同颜色的素材差异远大于此值。 */
const PIXEL_THRESHOLD = 10
const ASPECT_TOLERANCE = 0.03
const MAX_BYTES = 30 * 1024 * 1024
const FETCH_TIMEOUT = 8000

export type TFingerprint = { exact: string; aspect: number; pixels: Buffer | null }

let tableReady = false
function ensureTable() {
  if (tableReady) return
  getDB().exec('CREATE TABLE IF NOT EXISTS asset_fingerprints (url TEXT PRIMARY KEY, exact TEXT NOT NULL, aspect REAL NOT NULL DEFAULT 0, pixels BLOB)')
  tableReady = true
}

const memory = new Map<string, TFingerprint | null>()

/** 读取素材字节：/static/ 走本地文件，http(s) 走网络（限时限大小）；其他地址无法读取 */
async function loadBytes(url: string): Promise<Buffer | null> {
  const clean = normalizeUrl(url)
  if (clean.startsWith('/static/')) {
    const root = path.resolve(process.cwd(), 'static')
    const file = path.resolve(root, decodeURIComponent(clean.slice('/static/'.length)))
    if (!file.startsWith(root + path.sep)) return null // 防路径穿越
    return fs.existsSync(file) ? fs.promises.readFile(file) : null
  }
  if (/^https?:\/\//i.test(clean)) {
    const res = await axios.get(clean, { responseType: 'arraybuffer', timeout: FETCH_TIMEOUT, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES })
    return Buffer.from(res.data)
  }
  return null
}

async function compute(url: string, kind: string): Promise<TFingerprint | null> {
  const bytes = await loadBytes(url)
  if (!bytes || !bytes.length) return null
  if (kind === 'svg') {
    const text = bytes.toString('utf8').replace(/\s+/g, ' ').trim()
    return { exact: crypto.createHash('sha256').update(text).digest('hex'), aspect: 0, pixels: null }
  }
  const exact = crypto.createHash('sha256').update(bytes).digest('hex')
  try {
    const meta = await sharp(bytes).metadata()
    const { data } = await sharp(bytes).ensureAlpha().resize(GRID, GRID, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    // 完全透明像素的 RGB 无意义，归零避免干扰比较
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 8) data[i] = data[i + 1] = data[i + 2] = 0
    return { exact, aspect: meta.width && meta.height ? meta.width / meta.height : 0, pixels: Buffer.from(data) }
  } catch (e) {
    return { exact, aspect: 0, pixels: null } // 无法解码则只做字节比对
  }
}

/** 取指纹：内存 → 数据库 → 现算（并写回）。失败返回 null */
export async function getFingerprint(url: string, kind: string): Promise<TFingerprint | null> {
  ensureTable()
  const key = `${kind === 'svg' ? 'svg' : 'img'}:${normalizeUrl(url)}`
  if (memory.has(key)) return memory.get(key) as TFingerprint | null
  const db = getDB()
  const row: any = db.prepare('SELECT exact, aspect, pixels FROM asset_fingerprints WHERE url = ?').get(key)
  if (row) {
    const fp = { exact: row.exact, aspect: row.aspect, pixels: row.pixels ? Buffer.from(row.pixels) : null }
    memory.set(key, fp)
    return fp
  }
  let fp: TFingerprint | null = null
  try {
    fp = await compute(url, kind)
  } catch (e) {
    fp = null
  }
  if (fp) db.prepare('INSERT OR REPLACE INTO asset_fingerprints (url, exact, aspect, pixels) VALUES (?, ?, ?, ?)').run(key, fp.exact, fp.aspect, fp.pixels)
  memory.set(key, fp) // 失败也缓存本进程内的结果，避免同一请求反复重试
  return fp
}

export function similar(a: TFingerprint, b: TFingerprint): boolean {
  if (a.exact === b.exact) return true
  if (!a.pixels || !b.pixels || !a.aspect || !b.aspect || a.pixels.length !== b.pixels.length) return false
  if (Math.abs(a.aspect - b.aspect) / Math.max(a.aspect, b.aspect) > ASPECT_TOLERANCE) return false
  let diff = 0
  for (let i = 0; i < a.pixels.length; i++) diff += Math.abs(a.pixels[i] - b.pixels[i])
  return diff / a.pixels.length <= PIXEL_THRESHOLD
}

/** 并发取指纹（库内旧素材首次比对时较慢，之后命中缓存） */
export async function fingerprintMany<T extends { url: string; kind: string }>(items: T[], concurrency = 8): Promise<(TFingerprint | null)[]> {
  const result: (TFingerprint | null)[] = new Array(items.length).fill(null)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        result[i] = await getFingerprint(items[i].url, items[i].kind)
      }
    }),
  )
  return result
}

/** 库内全部素材（url + 类型），用于内容比对 */
export function listLibraryAssets(): { url: string; kind: 'image' | 'svg' | 'mask' }[] {
  const rows: { list: string }[] = getDB().prepare('SELECT list FROM materials').all()
  const out: { url: string; kind: 'image' | 'svg' | 'mask' }[] = []
  rows.forEach((row) => {
    try {
      const list = JSON.parse(row.list)
      if (!Array.isArray(list)) return
      list.forEach((item) => {
        if (!item?.url) return
        const kind = item.type === 'svg' ? 'svg' : item.type === 'mask' ? 'mask' : 'image'
        out.push({ url: item.url, kind })
      })
    } catch (e) {}
  })
  return out
}
