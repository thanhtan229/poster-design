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
 * 后台管理接口实现（均需登录）
 */
import { Response } from 'express'
import axios from '../utils/http'
import { serviceLink, staticLink } from '../configs'
import { send, isNumber } from '../utils/tools'
import { listAllTemplates, softDeleteTemplate, deleteTemplate as deleteTemplateRow, deleteUserImage, listCategories, listAssets, addAsset as addAssetRow, saveAsset, moveAsset, deleteAsset as deleteAssetRow, deleteCategory, addCategory, renameCategory } from '../db/admin'
import { listUserImages } from '../db/userImages'
import * as fontsRepo from '../db/fonts'
import * as templatesRepo from '../db/templates'
import * as usersRepo from '../db/users'
import * as templateCategoriesRepo from '../db/templateCategories'
import * as designsRepo from '../db/designs'
import { assetKey, normalizeAssetType, existingMaterialKeys, existingTextSignatures, textSignature } from '../db/assetDedupe'

function pageResult<T>(list: T[], pageValue: any, pageSizeValue: any) {
  const page = Math.max(1, Math.floor(Number(pageValue) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSizeValue) || 20)))
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize }
}

/** 调用截图服务生成封面并回填 cover；失败不阻塞主流程 */
async function generateCover(savedId: number, w: number, h: number, type: 0 | 1) {
  try {
    const size = w > h ? 640 : 320
    await axios.get(
      `${serviceLink}/api/screenshots?tempid=${savedId}&tempType=${type}&width=${w}&height=${h}&type=cover&size=${size}&quality=75`,
      { responseType: 'arraybuffer' }
    )
    const cover = type === 1 ? `${staticLink}${savedId}-screenshot.png` : `${staticLink}${savedId}-cover.jpg`
    templatesRepo.setCover(savedId, cover)
  } catch (error) {
    console.warn('[admin] 封面生成失败:', error)
  }
}

export default {
  // 模板列表（含已下架）
  async getTemplates(req: any, res: Response) {
    send.success(res, pageResult(listAllTemplates(), req.query?.page, req.query?.pageSize))
  },

  // 软删除模板（state 置 0）
  async deleteTemplate(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, '参数错误')
      return
    }
    softDeleteTemplate(id) ? send.success(res, undefined) : send.error(res, '记录不存在')
  },

  async removeTemplate(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, '参数错误')
    deleteTemplateRow(id) ? send.success(res, undefined) : send.error(res, '模板不存在')
  },

  // 管理员保存模板（PSD 导入创建模板/组合），与原 /design/edit 等价但强制 admin 鉴权
  async saveTemplate(req: any, res: Response) {
    const { id, title, data, width, height, type } = req.body
    // 写入防御：参数校验（NaN 会被 JSON.stringify 偷换为 null，需显式拦截）
    const w = Number(width)
    const h = Number(height)
    if (typeof data !== 'string' || !data || !(w > 0) || !(h > 0)) {
      return send.error(res, '参数不完整或无效')
    }
    const tid = Number(id)
    const isAdd = !Number.isInteger(tid) || tid <= 0
    const params = {
      title: String(title || ''),
      data,
      width: w,
      height: h,
      type: (type == 1 ? 1 : 0) as 0 | 1,
      cate: String(req.body.cate || ''),
    }

    const savedId = isAdd ? templatesRepo.createTemplate(params) : tid
    if (!isAdd && !templatesRepo.updateTemplate(tid, params)) {
      return send.error(res, '模板不存在')
    }

    await generateCover(savedId, w, h, params.type)

    send.success(res, { id: savedId })
  },

  async updateTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    const type = req.body?.type == 1 ? 1 : 0
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    if (!Number.isInteger(id) || id <= 0) return send.error(res, '参数错误')
    if (cate && !templateCategoriesRepo.listCategories(type).some((item) => item.name === cate)) return send.error(res, '分类不存在')
    templatesRepo.updateTemplateCategory(id, type, cate) ? send.success(res, undefined) : send.error(res, '模板不存在')
  },

  // 用户上传图片列表
  async getUserImages(req: any, res: Response) {
    send.success(res, pageResult(listUserImages(), req.query?.page, req.query?.pageSize))
  },

  // 用户列表（不返回密码、salt 等敏感字段）
  async getUsers(req: any, res: Response) {
    send.success(res, pageResult(usersRepo.listUsers(), req.query?.page, req.query?.pageSize))
  },

  async getDesigns(req: any, res: Response) {
    send.success(res, pageResult(designsRepo.listAllDesigns(), req.query?.page, req.query?.pageSize))
  },

  async deleteDesign(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, '参数错误')
    designsRepo.deleteDesignByAdmin(id) ? send.success(res, undefined) : send.error(res, '作品不存在')
  },

  // 仅允许删除普通用户，管理员账号不可通过该接口删除
  async deleteUser(req: any, res: Response) {
    const id = Number(req.body?.id)
    const currentUserId = Number(req.user?.id)
    if (!Number.isInteger(id) || id <= 0 || id === currentUserId) {
      send.error(res, '参数错误或不能删除当前账号')
      return
    }
    usersRepo.deleteUser(id) ? send.success(res, undefined) : send.error(res, '用户不存在或管理员账号不可删除')
  },

  // 删除用户图片记录
  async deleteUserImage(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, '参数错误')
      return
    }
    deleteUserImage(id) ? send.success(res, undefined) : send.error(res, '记录不存在')
  },

  // 素材 / 照片分类列表
  async getCategories(req: any, res: Response) {
    const table = req.query?.type === 'photos' ? 'photos' : 'materials'
    send.success(res, pageResult(listCategories(table), req.query?.page, req.query?.pageSize))
  },

  async getAssets(req: any, res: Response) {
    const table = req.query?.type === 'photos' ? 'photos' : 'materials'
    send.success(res, pageResult(listAssets(table, String(req.query?.cate || ''), String(req.query?.search || '')), req.query?.page, req.query?.pageSize))
  },

  async addAsset(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const asset = req.body?.asset && { ...req.body.asset, type: req.body.asset.type === 'png' ? 'image' : req.body.asset.type, ...(req.body.asset.type === 'mask' ? { isContainer: true } : {}) }
    if (!cate || !asset || typeof asset.url !== 'string' || !asset.url.trim() || (table === 'materials' && !['image', 'svg', 'mask'].includes(asset.type))) return send.error(res, '参数错误')
    addAssetRow(table, cate, asset) ? send.success(res, undefined) : send.error(res, '分类不存在')
  },

  // 批量入库：素材（image/svg/mask）→ materials；文字组合 → type=1 组件模板。服务端与已有数据去重，dryRun 只返回判定结果。
  async bulkImportAssets(req: any, res: Response) {
    const dryRun = !!req.body?.dryRun
    const materials: any[] = Array.isArray(req.body?.materials) ? req.body.materials.slice(0, 500) : []
    const texts: any[] = Array.isArray(req.body?.texts) ? req.body.texts.slice(0, 200) : []
    const materialKeys = existingMaterialKeys()
    const textSignatures = existingTextSignatures()
    const materialResults: { url: string; status: 'added' | 'exists' | 'invalid' | 'failed' }[] = []
    const textResults: { title: string; status: 'added' | 'exists' | 'invalid' | 'failed'; id?: number }[] = []

    for (const item of materials) {
      const asset = item?.asset
      const cate = typeof item?.cate === 'string' ? item.cate.trim() : ''
      const type = normalizeAssetType(String(asset?.type || ''))
      const url = typeof asset?.url === 'string' ? asset.url.trim() : ''
      if (!cate || !url || !['image', 'svg', 'mask'].includes(type)) { materialResults.push({ url, status: 'invalid' }); continue }
      const key = assetKey(type, url)
      if (materialKeys.has(key)) { materialResults.push({ url, status: 'exists' }); continue }
      if (dryRun) { materialKeys.add(key); materialResults.push({ url, status: 'added' }); continue }
      const saved = addAssetRow('materials', cate, { ...asset, type, url, thumb: asset.thumb || url, ...(type === 'mask' ? { isContainer: true } : {}), ...(type === 'svg' && !asset.model ? { model: '{}' } : {}) })
      if (saved) materialKeys.add(key)
      materialResults.push({ url, status: saved ? 'added' : 'failed' })
    }

    for (const item of texts) {
      const title = String(item?.title || '').slice(0, 100)
      const cate = typeof item?.cate === 'string' ? item.cate.trim() : ''
      const w = Number(item?.width)
      const h = Number(item?.height)
      const widgets = item?.widgets
      const group = Array.isArray(widgets) ? [...widgets].reverse().find((x: any) => x?.type === 'w-group') : null
      if (!group || !(w > 0) || !(h > 0)) { textResults.push({ title, status: 'invalid' }); continue }
      if (cate && !templateCategoriesRepo.listCategories(1).some((c) => c.name === cate)) { textResults.push({ title, status: 'invalid' }); continue }
      const signature = textSignature(group, widgets.filter((x: any) => x !== group))
      if (textSignatures.has(signature)) { textResults.push({ title, status: 'exists' }); continue }
      if (dryRun) { textSignatures.add(signature); textResults.push({ title, status: 'added' }); continue }
      try {
        const id = templatesRepo.createTemplate({ title: title || '文字组合', data: JSON.stringify(widgets), width: w, height: h, type: 1, cate })
        await generateCover(id, w, h, 1)
        textSignatures.add(signature)
        textResults.push({ title, status: 'added', id })
      } catch (error) {
        textResults.push({ title, status: 'failed' })
      }
    }
    send.success(res, { dryRun, materials: materialResults, texts: textResults })
  },

  async updateAsset(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const fromCate = typeof req.body?.fromCate === 'string' ? req.body.fromCate.trim() : cate
    const index = Number(req.body?.index)
    const asset = req.body?.asset && { ...req.body.asset, type: req.body.asset.type === 'png' ? 'image' : req.body.asset.type, ...(req.body.asset.type === 'mask' ? { isContainer: true } : {}) }
    if (!cate || !Number.isInteger(index) || !asset || typeof asset.url !== 'string' || !asset.url.trim() || (table === 'materials' && !['image', 'svg', 'mask'].includes(asset.type))) return send.error(res, '参数错误')
    const updated = fromCate !== cate ? moveAsset(table, fromCate, cate, index, asset) : saveAsset(table, cate, index, asset)
    if (updated) send.success(res, undefined)
    else send.error(res, '素材不存在')
  },

  async deleteAsset(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const index = Number(req.body?.index)
    if (!cate || !Number.isInteger(index) || index < 0) return send.error(res, '参数错误')
    deleteAssetRow(table, cate, index) ? send.success(res, undefined) : send.error(res, '资源不存在')
  },

  async getTemplateCategories(req: any, res: Response) {
    send.success(res, pageResult(templateCategoriesRepo.listCategories(req.query?.type == 1 ? 1 : 0), req.query?.page, req.query?.pageSize))
  },

  async addTemplateCategory(req: any, res: Response) {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const type = req.body?.type == 1 ? 1 : 0
    const sort = Number(req.body?.sort)
    if (!name) return send.error(res, '分类名称不能为空')
    try {
      const id = templateCategoriesRepo.addCategory(name, type, Number.isFinite(sort) ? sort : 0)
      send.success(res, { id })
    } catch (error) {
      send.error(res, error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? '分类名称已存在' : '分类创建失败')
    }
  },

  async deleteTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, '参数错误')
    if (templateCategoriesRepo.countTemplateUsage(id) > 0) return send.error(res, '该分类仍被模板使用，请先修改模板分类')
    templateCategoriesRepo.deleteCategory(id) ? send.success(res, undefined) : send.error(res, '分类不存在')
  },

  async renameTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!Number.isInteger(id) || id <= 0 || !name) return send.error(res, '参数错误')
    try {
      templateCategoriesRepo.renameCategory(id, name) ? send.success(res, undefined) : send.error(res, '分类不存在')
    } catch (error) {
      send.error(res, '分类名称已存在')
    }
  },

  // 删除素材 / 照片分类
  async deleteCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = req.body?.cate
    if (typeof cate !== 'string' || !cate) {
      send.error(res, '参数错误')
      return
    }
    deleteCategory(table, cate) ? send.success(res, undefined) : send.error(res, '分类不存在')
  },

  async addCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return send.error(res, '分类名不能为空')
    try {
      addCategory(table, name) ? send.success(res, undefined) : send.error(res, '分类创建失败')
    } catch (error) {
      send.error(res, '分类已存在')
    }
  },

  async renameCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!cate || !name) return send.error(res, '分类名不能为空')
    try {
      renameCategory(table, cate, name) ? send.success(res, undefined) : send.error(res, '分类不存在')
    } catch (error) {
      send.error(res, '分类已存在')
    }
  },

  // 字体列表（含完整字段，便于后台管理）
  async getFonts(req: any, res: Response) {
    const page = Number(req.query?.page) || 1
    const pageSize = Number(req.query?.pageSize) || 20
    const search = typeof req.query?.search === 'string' ? req.query.search : ''
    send.success(res, fontsRepo.listFonts(page, pageSize, search))
  },

  // 新增字体
  async addFont(req: any, res: Response) {
    const { alias, value, woff, lang, preview, ttf, font_family, size, woff_size } = req.body || {}
    // 必填：alias（显示名）、value（CSS family slug）、woff（字体 woff 链接）
    if (typeof alias !== 'string' || !alias.trim()) return send.error(res, '字体名称不能为空')
    if (typeof value !== 'string' || !value.trim()) return send.error(res, '字体 value 不能为空')
    if (typeof woff !== 'string' || !woff.trim()) return send.error(res, 'woff 链接不能为空')
    // lang 兜底为 'zh'，非字符串则视为 'zh'
    const langValue = lang === 'en' ? 'en' : 'zh'
    // 数值字段：上游可能给空串 / null，统一安全降级为 0
    const toSafeNumber = (v: any) => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    const id = fontsRepo.addFont({
      alias: alias.trim(),
      value: value.trim(),
      preview: typeof preview === 'string' ? preview : '',
      woff: woff.trim(),
      ttf: typeof ttf === 'string' ? ttf : '',
      lang: langValue,
      font_family: typeof font_family === 'string' ? font_family : '',
      size: toSafeNumber(size),
      woff_size: toSafeNumber(woff_size),
    })
    send.success(res, { id })
  },

  // 编辑字体基础信息，不修改文件大小统计
  async updateFont(req: any, res: Response) {
    const { id, alias, value, woff, lang, preview, ttf, font_family } = req.body || {}
    if (!isNumber(Number(id)) || Number(id) <= 0) return send.error(res, '参数错误')
    if (typeof alias !== 'string' || !alias.trim()) return send.error(res, '字体名称不能为空')
    if (typeof value !== 'string' || !value.trim()) return send.error(res, '字体 value 不能为空')
    if (typeof woff !== 'string' || !woff.trim()) return send.error(res, 'woff 链接不能为空')
    const updated = fontsRepo.updateFont(Number(id), {
      alias: alias.trim(), value: value.trim(), woff: woff.trim(),
      preview: typeof preview === 'string' ? preview : '',
      ttf: typeof ttf === 'string' ? ttf : '', lang: lang === 'en' ? 'en' : 'zh',
      font_family: typeof font_family === 'string' ? font_family : '',
    })
    updated ? send.success(res, undefined) : send.error(res, '记录不存在')
  },

  // 删除字体
  async deleteFont(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, '参数错误')
      return
    }
    fontsRepo.deleteFont(id) ? send.success(res, undefined) : send.error(res, '记录不存在')
  },
}
