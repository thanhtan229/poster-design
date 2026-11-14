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
import fs from 'fs' // [TINIX]
import { serviceLink, staticLink, filePath } from '../configs'
import { send, isNumber } from '../utils/tools'
import { listAllTemplates, softDeleteTemplate, deleteTemplate as deleteTemplateRow, deleteUserImage, listCategories, listAssets, addAsset as addAssetRow, saveAsset, moveAsset, deleteAsset as deleteAssetRow, deleteCategory, addCategory, renameCategory } from '../db/admin'
import { listUserImages } from '../db/userImages'
import * as fontsRepo from '../db/fonts'
import { cleanCategory, cleanTags } from '../tinix/fontMeta' // [TINIX]
import * as templatesRepo from '../db/templates'
import * as usersRepo from '../db/users'
import * as templateCategoriesRepo from '../db/templateCategories'
import * as designsRepo from '../db/designs'
import * as groups from '../tinix/templateGroups' // [TINIX] nhóm mẫu (nhiều nhóm / mẫu)

function pageResult<T>(list: T[], pageValue: any, pageSizeValue: any) {
  const page = Math.max(1, Math.floor(Number(pageValue) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSizeValue) || 20)))
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize }
}

// [TINIX] làm sạch nhóm/tag font nhận từ form quản trị: xem service/src/tinix/fontMeta.ts

export default {
  // 模板列表（含已下架）
  async getTemplates(req: any, res: Response) {
    send.success(res, pageResult(listAllTemplates(), req.query?.page, req.query?.pageSize))
  },

  // 软删除模板（state 置 0）
  async deleteTemplate(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, 'Tham số không hợp lệ')
      return
    }
    softDeleteTemplate(id) ? send.success(res, undefined) : send.error(res, 'Bản ghi không tồn tại')
  },

  async removeTemplate(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, 'Tham số không hợp lệ')
    if (!deleteTemplateRow(id)) return send.error(res, 'Mẫu không tồn tại')
    // [TINIX] xóa luôn ảnh bìa/ảnh chụp của mẫu (không còn dòng nào dùng tới), tránh file mồ côi trong static
    for (const name of [`${id}-cover.jpg`, `${id}-screenshot.png`]) {
      try { fs.unlinkSync(filePath + name) } catch (e) { /* không có file thì thôi */ }
    }
    send.success(res, undefined)
  },

  // 管理员保存模板（PSD 导入创建模板/组合），与原 /design/edit 等价但强制 admin 鉴权
  async saveTemplate(req: any, res: Response) {
    const { id, title, data, width, height, type } = req.body
    // 写入防御：参数校验（NaN 会被 JSON.stringify 偷换为 null，需显式拦截）
    const w = Number(width)
    const h = Number(height)
    if (typeof data !== 'string' || !data || !(w > 0) || !(h > 0)) {
      return send.error(res, 'Tham số thiếu hoặc không hợp lệ')
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
      return send.error(res, 'Mẫu không tồn tại')
    }
    isAdd && params.cate && groups.attachByName(savedId, params.type, params.cate) // [TINIX] mẫu mới kèm cate → gắn vào nhóm

    // 生成封面：调用截图服务，成功后回填 cover（失败不阻塞主流程）
    try {
      const size = w > h ? 640 : 320
      await axios.get(
        `${serviceLink}/api/screenshots?tempid=${savedId}&tempType=${params.type}&width=${w}&height=${h}&type=cover&size=${size}&quality=75`,
        { responseType: 'arraybuffer' }
      )
      const cover = params.type === 1 ? `${staticLink}${savedId}-screenshot.png` : `${staticLink}${savedId}-cover.jpg`
      templatesRepo.setCover(savedId, isAdd ? cover : `${cover}?v=${Date.now()}`) // [TINIX] sửa mẫu có sẵn → chống bộ nhớ đệm ảnh bìa cũ
    } catch (error) {
      console.warn('[admin] 封面生成失败:', error)
    }

    send.success(res, { id: savedId })
  },

  async updateTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    const type = req.body?.type == 1 ? 1 : 0
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    if (!Number.isInteger(id) || id <= 0) return send.error(res, 'Tham số không hợp lệ')
    if (cate && !templateCategoriesRepo.listCategories(type).some((item) => item.name === cate)) return send.error(res, 'Danh mục không tồn tại')
    if (!templatesRepo.updateTemplateCategory(id, type, cate)) return send.error(res, 'Mẫu không tồn tại')
    // [TINIX] đồng bộ bảng liên kết: chọn một danh mục = mẫu chỉ thuộc nhóm đó; bỏ chọn = chưa phân nhóm
    const target = cate ? templateCategoriesRepo.listCategories(type).find((item) => item.name === cate) : undefined
    groups.setTemplateGroups(id, target ? [target.id] : [])
    send.success(res, undefined)
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
    if (!Number.isInteger(id) || id <= 0) return send.error(res, 'Tham số không hợp lệ')
    designsRepo.deleteDesignByAdmin(id) ? send.success(res, undefined) : send.error(res, 'Thiết kế không tồn tại')
  },

  // 仅允许删除普通用户，管理员账号不可通过该接口删除
  async deleteUser(req: any, res: Response) {
    const id = Number(req.body?.id)
    const currentUserId = Number(req.user?.id)
    if (!Number.isInteger(id) || id <= 0 || id === currentUserId) {
      send.error(res, 'Tham số không hợp lệ hoặc không thể xóa tài khoản hiện tại')
      return
    }
    usersRepo.deleteUser(id) ? send.success(res, undefined) : send.error(res, 'Người dùng không tồn tại hoặc tài khoản quản trị không thể bị xóa')
  },

  // 删除用户图片记录
  async deleteUserImage(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, 'Tham số không hợp lệ')
      return
    }
    deleteUserImage(id) ? send.success(res, undefined) : send.error(res, 'Bản ghi không tồn tại')
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
    if (!cate || !asset || typeof asset.url !== 'string' || !asset.url.trim() || (table === 'materials' && !['image', 'svg', 'mask'].includes(asset.type))) return send.error(res, 'Tham số không hợp lệ')
    addAssetRow(table, cate, asset) ? send.success(res, undefined) : send.error(res, 'Danh mục không tồn tại')
  },

  async updateAsset(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const fromCate = typeof req.body?.fromCate === 'string' ? req.body.fromCate.trim() : cate
    const index = Number(req.body?.index)
    const asset = req.body?.asset && { ...req.body.asset, type: req.body.asset.type === 'png' ? 'image' : req.body.asset.type, ...(req.body.asset.type === 'mask' ? { isContainer: true } : {}) }
    if (!cate || !Number.isInteger(index) || !asset || typeof asset.url !== 'string' || !asset.url.trim() || (table === 'materials' && !['image', 'svg', 'mask'].includes(asset.type))) return send.error(res, 'Tham số không hợp lệ')
    const updated = fromCate !== cate ? moveAsset(table, fromCate, cate, index, asset) : saveAsset(table, cate, index, asset)
    if (updated) send.success(res, undefined)
    else send.error(res, 'Tư liệu không tồn tại')
  },

  async deleteAsset(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const index = Number(req.body?.index)
    if (!cate || !Number.isInteger(index) || index < 0) return send.error(res, 'Tham số không hợp lệ')
    deleteAssetRow(table, cate, index) ? send.success(res, undefined) : send.error(res, 'Tài nguyên không tồn tại')
  },

  async getTemplateCategories(req: any, res: Response) {
    // [TINIX] kèm số mẫu mỗi nhóm (count)
    send.success(res, pageResult(groups.listGroupsWithCount(req.query?.type == 1 ? 1 : 0).list, req.query?.page, req.query?.pageSize))
  },

  // [TINIX] gán lại toàn bộ nhóm của một mẫu: { id, groupIds[] }
  async setTemplateGroups(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, 'Tham số không hợp lệ')
    const ids = groups.setTemplateGroups(id, req.body?.groupIds)
    ids ? send.success(res, { groupIds: ids }) : send.error(res, 'Mẫu không tồn tại')
  },

  // [TINIX] gán/gỡ nhóm cho nhiều mẫu: { ids[], add[], remove[] }
  async bulkTemplateGroups(req: any, res: Response) {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000) return send.error(res, 'Tham số không hợp lệ')
    send.success(res, { changed: groups.bulkAssign(ids, req.body?.add, req.body?.remove) })
  },

  // [TINIX] sắp xếp lại nhóm: { type, ids[] }
  async reorderTemplateCategories(req: any, res: Response) {
    const ids = req.body?.ids
    if (!Array.isArray(ids)) return send.error(res, 'Tham số không hợp lệ')
    groups.reorderGroups(req.body?.type == 1 ? 1 : 0, ids)
    send.success(res, undefined)
  },

  // [TINIX] gợi ý nhóm theo tên cho các mẫu chưa phân nhóm; xem trước, chưa ghi gì
  async suggestTemplateGroups(req: any, res: Response) {
    send.success(res, groups.suggestForUngrouped())
  },

  // [TINIX] áp dụng gợi ý cho các mẫu đã duyệt: { ids[] } (tính lại theo tên mẫu ở server, chỉ thêm nhóm)
  async applyTemplateGroupSuggestions(req: any, res: Response) {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000) return send.error(res, 'Tham số không hợp lệ')
    send.success(res, groups.applySuggestions(ids))
  },

  async addTemplateCategory(req: any, res: Response) {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const type = req.body?.type == 1 ? 1 : 0
    const sort = Number(req.body?.sort)
    if (!name) return send.error(res, 'Tên danh mục không được để trống')
    if (groups.nameTaken(type, name)) return send.error(res, 'Tên danh mục đã tồn tại') // [TINIX] không phân biệt hoa thường/dấu
    try {
      const id = templateCategoriesRepo.addCategory(name, type, Number.isFinite(sort) ? sort : 0)
      send.success(res, { id })
    } catch (error) {
      send.error(res, error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Tên danh mục đã tồn tại' : 'Tạo danh mục thất bại')
    }
  },

  async deleteTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id) || id <= 0) return send.error(res, 'Tham số không hợp lệ')
    // [TINIX] nhóm còn mẫu: không có force → từ chối (kèm số mẫu); có force → gỡ nhóm khỏi các mẫu rồi xóa nhóm (mẫu không bị xóa)
    const used = groups.groupUsage(id)
    if (used > 0 && !req.body?.force) return send.error(res, `Nhóm này đang được ${used} mẫu sử dụng. Hãy xác nhận gỡ nhóm khỏi các mẫu để xóa.`)
    const affected = groups.deleteGroupDetach(id)
    affected >= 0 ? send.success(res, { affected }) : send.error(res, 'Danh mục không tồn tại')
  },

  async renameTemplateCategory(req: any, res: Response) {
    const id = Number(req.body?.id)
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!Number.isInteger(id) || id <= 0 || !name) return send.error(res, 'Tham số không hợp lệ')
    const current = templateCategoriesRepo.getCategoryById(id, 0) || templateCategoriesRepo.getCategoryById(id, 1)
    if (current && groups.nameTaken(current.type === 1 ? 1 : 0, name, id)) return send.error(res, 'Tên danh mục đã tồn tại') // [TINIX]
    try {
      templateCategoriesRepo.renameCategory(id, name) ? send.success(res, undefined) : send.error(res, 'Danh mục không tồn tại')
    } catch (error) {
      send.error(res, 'Tên danh mục đã tồn tại')
    }
  },

  // 删除素材 / 照片分类
  async deleteCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = req.body?.cate
    if (typeof cate !== 'string' || !cate) {
      send.error(res, 'Tham số không hợp lệ')
      return
    }
    deleteCategory(table, cate) ? send.success(res, undefined) : send.error(res, 'Danh mục không tồn tại')
  },

  async addCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return send.error(res, 'Tên danh mục không được để trống')
    try {
      addCategory(table, name) ? send.success(res, undefined) : send.error(res, 'Tạo danh mục thất bại')
    } catch (error) {
      send.error(res, 'Danh mục đã tồn tại')
    }
  },

  async renameCategory(req: any, res: Response) {
    const table = req.body?.type === 'photos' ? 'photos' : 'materials'
    const cate = typeof req.body?.cate === 'string' ? req.body.cate.trim() : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!cate || !name) return send.error(res, 'Tên danh mục không được để trống')
    try {
      renameCategory(table, cate, name) ? send.success(res, undefined) : send.error(res, 'Danh mục không tồn tại')
    } catch (error) {
      send.error(res, 'Danh mục đã tồn tại')
    }
  },

  // 字体列表（含完整字段，便于后台管理）
  async getFonts(req: any, res: Response) {
    const page = Number(req.query?.page) || 1
    const pageSize = Number(req.query?.pageSize) || 20
    const search = typeof req.query?.search === 'string' ? req.query.search : ''
    const q = req.query || {}
    const str = (v: any) => (typeof v === 'string' ? v : '')
    send.success(res, fontsRepo.listFonts(page, pageSize, search, { lang: str(q.lang), vn: str(q.vn), category: str(q.category) })) // [TINIX] bộ lọc
  },

  // 新增字体
  async addFont(req: any, res: Response) {
    const { alias, value, woff, lang, preview, ttf, font_family, size, woff_size, supports_vietnamese } = req.body || {}
    // 必填：alias（显示名）、value（CSS family slug）、woff（字体 woff 链接）
    if (typeof alias !== 'string' || !alias.trim()) return send.error(res, 'Tên font không được để trống')
    if (typeof value !== 'string' || !value.trim()) return send.error(res, 'Giá trị value của font không được để trống')
    if (typeof woff !== 'string' || !woff.trim()) return send.error(res, 'Liên kết woff không được để trống')
    // lang 兜底为 'zh'，非字符串则视为 'zh'
    const langValue = lang === 'en' || lang === 'ko' ? lang : 'zh' // [TINIX] thêm ko (tiếng Hàn)
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
      supports_vietnamese: supports_vietnamese === true || supports_vietnamese === 1 || supports_vietnamese === '1', // [TINIX]
      category: cleanCategory(req.body && req.body.category),
      tags: cleanTags(req.body && req.body.tags),
    })
    send.success(res, { id })
  },

  // 编辑字体基础信息，不修改文件大小统计
  async updateFont(req: any, res: Response) {
    const { id, alias, value, woff, lang, preview, ttf, font_family, supports_vietnamese } = req.body || {}
    if (!isNumber(Number(id)) || Number(id) <= 0) return send.error(res, 'Tham số không hợp lệ')
    if (typeof alias !== 'string' || !alias.trim()) return send.error(res, 'Tên font không được để trống')
    if (typeof value !== 'string' || !value.trim()) return send.error(res, 'Giá trị value của font không được để trống')
    if (typeof woff !== 'string' || !woff.trim()) return send.error(res, 'Liên kết woff không được để trống')
    const updated = fontsRepo.updateFont(Number(id), {
      alias: alias.trim(), value: value.trim(), woff: woff.trim(),
      preview: typeof preview === 'string' ? preview : '',
      ttf: typeof ttf === 'string' ? ttf : '', lang: lang === 'en' || lang === 'ko' ? lang : 'zh', // [TINIX] ko
      font_family: typeof font_family === 'string' ? font_family : '',
      supports_vietnamese: supports_vietnamese === true || supports_vietnamese === 1 || supports_vietnamese === '1', // [TINIX]
      category: cleanCategory(req.body && req.body.category),
      tags: cleanTags(req.body && req.body.tags),
    } as any)
    updated ? send.success(res, undefined) : send.error(res, 'Bản ghi không tồn tại')
  },

  // 删除字体
  async deleteFont(req: any, res: Response) {
    const id = Number(req.body?.id)
    if (!isNumber(id) || id <= 0) {
      send.error(res, 'Tham số không hợp lệ')
      return
    }
    fontsRepo.deleteFont(id) ? send.success(res, undefined) : send.error(res, 'Bản ghi không tồn tại')
  },
}
