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

/**
 * 依据 16×16 缩略图给出「素材类型」建议（仅是建议，最终由管理员在弹窗里确认）：
 * - photo：整幅不透明且细节多（照片 / 背景图），或颜色丰富（抠图人像等）
 * - mask：颜色单一、偏浅、带透明边缘的纯色形状（圆、圆角矩形、云朵等，适合作容器 / 相框）
 * - image：其余（贴纸 / 装饰元素）
 */
export function suggestKind(fp: TFingerprint | null): 'photo' | 'mask' | 'image' {
  if (!fp || !fp.pixels) return 'image'
  const px = fp.pixels
  const bins = new Set<number>()
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 16) bins.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4))
  const d = dominantShare(px)
  if (!d.opaque) return 'image'
  const transparentRatio = d.transparent / (px.length / 4)
  if (bins.size >= 40 || (transparentRatio < 0.03 && bins.size >= 20)) return 'photo'
  if (d.share >= FLAT_SHARE && d.lum >= 205 && transparentRatio >= 0.08) return 'mask'
  return 'image'
}

/** 不透明像素里「最主要那种颜色（含相邻色，容纳抗锯齿）」占的比例；颜色单一的形状接近 1 */
function dominantShare(px: Buffer): { opaque: number; transparent: number; share: number; lum: number } {
  const counts = new Map<number, number>()
  let opaque = 0
  let transparent = 0
  let lum = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) { transparent++; continue }
    opaque++
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    counts.set(key, (counts.get(key) || 0) + 1)
    lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  }
  if (!opaque) return { opaque, transparent, share: 0, lum: 0 }
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0]
  const [tr, tg, tb] = [top >> 8, (top >> 4) & 15, top & 15]
  let near = 0
  counts.forEach((n, key) => {
    if (Math.abs((key >> 8) - tr) <= 1 && Math.abs(((key >> 4) & 15) - tg) <= 1 && Math.abs((key & 15) - tb) <= 1) near += n
  })
  return { opaque, transparent, share: near / opaque, lum: lum / opaque }
}

const FLAT_SHARE = 0.85

/** 是否「纯色形状」：颜色基本单一且带透明边缘（不论颜色深浅）——可作为相框的候选，具体是否相框还要看上下文 */
export function isFlatShape(fp: TFingerprint | null): boolean {
  if (!fp || !fp.pixels) return false
  const d = dominantShare(fp.pixels)
  return d.opaque > 0 && d.share >= FLAT_SHARE && d.transparent / (fp.pixels.length / 4) >= 0.08
}

// ---- 从管理员的选择中学习：确认入库时记住「这张图被归为什么类型」，之后相似的图优先按此建议 ----
let hintTableReady = false
function ensureHintTable() {
  if (hintTableReady) return
  getDB().exec('CREATE TABLE IF NOT EXISTS asset_kind_hints (exact TEXT PRIMARY KEY, aspect REAL NOT NULL DEFAULT 0, pixels BLOB, kind TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\', \'localtime\')))')
  hintTableReady = true
}

/** 记录一次分类选择（同一张图再次选择会覆盖） */
export function recordKindHint(fp: TFingerprint, kind: 'image' | 'mask' | 'photo') {
  ensureHintTable()
  getDB().prepare('INSERT OR REPLACE INTO asset_kind_hints (exact, aspect, pixels, kind) VALUES (?, ?, ?, ?)').run(fp.exact, fp.aspect, fp.pixels, kind)
}

/** 查找已学到的类型：先找字节完全相同的，再在相似图里按多数票决定；没有则返回 null */
export function learnedKind(fp: TFingerprint | null, hints?: { exact: string; aspect: number; pixels: Buffer | null; kind: string }[]): 'image' | 'mask' | 'photo' | null {
  if (!fp) return null
  ensureHintTable()
  const all = hints || (getDB().prepare('SELECT exact, aspect, pixels, kind FROM asset_kind_hints').all() as any[])
  const exactHit = all.find((h) => h.exact === fp.exact)
  if (exactHit) return exactHit.kind
  const votes: Record<string, number> = {}
  all.forEach((h) => {
    if (similar(fp, { exact: h.exact, aspect: h.aspect, pixels: h.pixels ? Buffer.from(h.pixels) : null })) votes[h.kind] = (votes[h.kind] || 0) + 1
  })
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
  return best ? (best[0] as 'image' | 'mask' | 'photo') : null
}

export function loadKindHints(): { exact: string; aspect: number; pixels: Buffer | null; kind: string }[] {
  ensureHintTable()
  return getDB().prepare('SELECT exact, aspect, pixels, kind FROM asset_kind_hints').all() as any[]
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

/** 库内全部素材 / 照片（url + 类型），用于内容比对 */
export function listLibraryAssets(): { url: string; kind: 'image' | 'svg' | 'mask' | 'photo' }[] {
  const out: { url: string; kind: 'image' | 'svg' | 'mask' | 'photo' }[] = []
  ;(['materials', 'photos'] as const).forEach((table) => {
    const rows: { list: string }[] = getDB().prepare(`SELECT list FROM ${table}`).all()
    rows.forEach((row) => {
      try {
        const list = JSON.parse(row.list)
        if (!Array.isArray(list)) return
        list.forEach((item) => {
          if (!item?.url) return
          const kind = table === 'photos' ? 'photo' : item.type === 'svg' ? 'svg' : item.type === 'mask' ? 'mask' : 'image'
          out.push({ url: item.url, kind })
        })
      } catch (e) {}
    })
  })
  return out
}
