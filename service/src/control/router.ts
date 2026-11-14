/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
/*
 * @Author: ShawnPhang
 * @Date: 2020-07-22 20:13:14
 * @Description: 路由
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 13:40:13
 */
import rExpress from 'express'
import screenshots from '../service/screenshots'
import fileService from '../service/files'
import userService from '../service/user'
import { startPreviews, getPreviewStatus } from '../tinix/fontPreviews' // [TINIX]
import { send } from '../utils/tools' // [TINIX]
import designService from '../service/design'
import authService from '../service/auth'
import adminService from '../service/admin'
import aiService from '../service/ai'
import api from './api'
import { requireAdmin } from '../utils/auth'
const rRouter = rExpress.Router()

rRouter.get(api.SCREENGHOT, screenshots.screenshots)
rRouter.get(api.PRINTSCREEN, screenshots.printscreen)
rRouter.post(api.UPLOAD, fileService.upload)
rRouter.get(api.USER_IMAGES, userService.getUserImages)
rRouter.post(api.USER_IMAGE_DELETE, userService.deleteUserImage)
rRouter.get(api.GET_TEMPLATE_LIST, designService.getTemplates)
rRouter.get(api.GET_TEMPLATE_CATEGORIES, designService.getTemplateCategories)
rRouter.get(api.GET_TEMPLATE, designService.getDetail)
rRouter.get(api.GET_MATERIAL, designService.getMaterial)
rRouter.get(api.GET_PHOTOS, designService.getPhotos)
rRouter.get(api.GET_ASSET_CATEGORIES, designService.getAssetCategories)
rRouter.get(api.GET_FONTS, designService.getFonts)
rRouter.post(api.UPDATE_TEMPLATE, requireAdmin, designService.saveTemplate)
rRouter.post(api.SAVE_DESIGN, userService.saveDesign)
rRouter.get(api.MY_DESIGNS, userService.getMyDesigns)
rRouter.get(api.DESIGN_DETAIL, userService.getDesign)
rRouter.post(api.DELETE_DESIGN, userService.deleteDesign)
rRouter.post(api.REGISTER, authService.register)
rRouter.post(api.LOGIN, authService.login)
rRouter.post(api.CHANGE_PASSWORD, authService.changePassword)
// AI 能力（登录用户可用，鉴权在 service 内完成）
rRouter.post(api.AI_TEXT, aiService.textGenerate)
rRouter.post(api.AI_IMAGE, aiService.imageGenerate)
rRouter.post(api.AI_COLOR, aiService.colorSuggest)
// 后台 AI 配置（仅管理员）
rRouter.get(api.ADMIN_AI_SETTINGS, requireAdmin, aiService.getSettings)
rRouter.post(api.ADMIN_AI_SETTINGS, requireAdmin, aiService.updateSettings)
rRouter.post(api.ADMIN_AI_TEST, requireAdmin, aiService.testConnection)
rRouter.get(api.ADMIN_TEMPLATES, requireAdmin, adminService.getTemplates)
rRouter.post(api.ADMIN_TEMPLATE_DELETE, requireAdmin, adminService.deleteTemplate)
rRouter.post(api.ADMIN_TEMPLATE_REMOVE, requireAdmin, adminService.removeTemplate)
rRouter.post(api.ADMIN_TEMPLATE_SAVE, requireAdmin, adminService.saveTemplate)
rRouter.post(api.ADMIN_TEMPLATE_CATEGORY_UPDATE, requireAdmin, adminService.updateTemplateCategory)
rRouter.get(api.ADMIN_USER_IMAGES, requireAdmin, adminService.getUserImages)
rRouter.get(api.ADMIN_USERS, requireAdmin, adminService.getUsers)
// 管理员用户作品管理
rRouter.get(api.ADMIN_DESIGNS, requireAdmin, adminService.getDesigns)
rRouter.post(api.ADMIN_DESIGN_DELETE, requireAdmin, adminService.deleteDesign)
rRouter.post(api.ADMIN_USER_DELETE, requireAdmin, adminService.deleteUser)
rRouter.post(api.ADMIN_USER_IMAGE_DELETE, requireAdmin, adminService.deleteUserImage)
rRouter.get(api.ADMIN_CATEGORIES, requireAdmin, adminService.getCategories)
rRouter.get(api.ADMIN_ASSETS, requireAdmin, adminService.getAssets)
rRouter.post(api.ADMIN_ASSET_ADD, requireAdmin, adminService.addAsset)
rRouter.post(api.ADMIN_ASSET_UPDATE, requireAdmin, adminService.updateAsset)
rRouter.post(api.ADMIN_ASSET_DELETE, requireAdmin, adminService.deleteAsset)
rRouter.get(api.ADMIN_TEMPLATE_CATEGORIES, requireAdmin, adminService.getTemplateCategories)
rRouter.post(api.ADMIN_TEMPLATE_CATEGORY_ADD, requireAdmin, adminService.addTemplateCategory)
rRouter.post(api.ADMIN_TEMPLATE_CATEGORY_DELETE, requireAdmin, adminService.deleteTemplateCategory)
rRouter.post(api.ADMIN_TEMPLATE_CATEGORY_RENAME, requireAdmin, adminService.renameTemplateCategory)
rRouter.post(api.ADMIN_TEMPLATE_CATEGORY_REORDER, requireAdmin, adminService.reorderTemplateCategories) // [TINIX] nhóm mẫu
rRouter.post(api.ADMIN_TEMPLATE_GROUPS_SET, requireAdmin, adminService.setTemplateGroups)
rRouter.post(api.ADMIN_TEMPLATE_GROUPS_BULK, requireAdmin, adminService.bulkTemplateGroups)
rRouter.post(api.ADMIN_CATEGORY_DELETE, requireAdmin, adminService.deleteCategory)
rRouter.post(api.ADMIN_CATEGORY_ADD, requireAdmin, adminService.addCategory)
rRouter.post(api.ADMIN_CATEGORY_RENAME, requireAdmin, adminService.renameCategory)
rRouter.get(api.ADMIN_FONTS, requireAdmin, adminService.getFonts)
rRouter.post(api.ADMIN_FONT_ADD, requireAdmin, adminService.addFont)
rRouter.post(api.ADMIN_FONT_UPDATE, requireAdmin, adminService.updateFont)
rRouter.post(api.ADMIN_FONT_DELETE, requireAdmin, adminService.deleteFont)
// [TINIX] tạo ảnh xem trước còn thiếu (POST bắt đầu, GET xem tiến độ)
rRouter.post(api.ADMIN_FONT_PREVIEWS, requireAdmin, (req: any, res: any) => { if (startPreviews()) send.success(res, getPreviewStatus(), 'Đã bắt đầu'); else send.error(res, 'Đang chạy, chờ xong') })
rRouter.get(api.ADMIN_FONT_PREVIEWS, requireAdmin, (req: any, res: any) => { send.success(res, getPreviewStatus()) })

export default rRouter
