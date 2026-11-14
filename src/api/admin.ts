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
 * 后台管理 api 接口
 */
import fetch from '@/utils/axios'
import _config from '@/config'
const prefix = _config.API_URL + '/'
const API = {
  register: prefix + 'api/user/register',
  login: prefix + 'api/user/login',
  changePassword: prefix + 'api/user/changePassword',
  templates: prefix + 'api/admin/templates',
  deleteTemplate: prefix + 'api/admin/template/delete',
  removeTemplate: prefix + 'api/admin/template/remove',
  saveTemplate: prefix + 'api/admin/template/save',
  updateTemplateCategory: prefix + 'api/admin/template/category/update',
  userImages: prefix + 'api/admin/user/images',
  users: prefix + 'api/admin/users',
  deleteUser: prefix + 'api/admin/user/delete',
  deleteUserImage: prefix + 'api/admin/user/image/delete',
  designs: prefix + 'api/admin/designs',
  deleteDesign: prefix + 'api/admin/design/delete',
  categories: prefix + 'api/admin/categories',
  assets: prefix + 'api/admin/assets',
  assetAdd: prefix + 'api/admin/asset/add',
  assetUpdate: prefix + 'api/admin/asset/update',
  assetDelete: prefix + 'api/admin/asset/delete',
  deleteCategory: prefix + 'api/admin/category/delete',
  addCategory: prefix + 'api/admin/category/add',
  renameCategory: prefix + 'api/admin/category/rename',
  templateCategories: prefix + 'api/admin/template/categories',
  addTemplateCategory: prefix + 'api/admin/template/category/add',
  deleteTemplateCategory: prefix + 'api/admin/template/category/delete',
  renameTemplateCategory: prefix + 'api/admin/template/category/rename',
  reorderTemplateCategories: prefix + 'api/admin/template/category/reorder', // [TINIX] nhóm mẫu
  setTemplateGroups: prefix + 'api/admin/template/groups/set',
  bulkTemplateGroups: prefix + 'api/admin/template/groups/bulk',
  fonts: prefix + 'api/admin/fonts',
  addFont: prefix + 'api/admin/font/add',
  updateFont: prefix + 'api/admin/font/update',
  deleteFont: prefix + 'api/admin/font/delete',
  fontPreviews: prefix + 'api/admin/fonts/previews', // [TINIX]
  aiSettings: prefix + 'api/admin/ai/settings',
  aiTest: prefix + 'api/admin/ai/test',
}

export const register = (data: { account: string; password: string }) => fetch<{ token: string }>(API.register, data, 'post')

export const login = (data: { account: string; password: string }) => fetch<{ token: string }>(API.login, data, 'post')

/** 修改密码：需登录，校验原密码后更新 */
export const changePassword = (data: { oldPassword: string; newPassword: string }) => fetch(API.changePassword, data, 'post')

export const getTemplates = (params: Type.Object = {}) => fetch<{ list: any[]; total: number }>(API.templates, params)

export const deleteTemplate = (id: number) => fetch(API.deleteTemplate, { id }, 'post')
export const removeTemplate = (id: number) => fetch(API.removeTemplate, { id }, 'post')
export const updateTemplateCategory = (data: { id: number; type: 0 | 1; cate: string }) => fetch(API.updateTemplateCategory, data, 'post')

/** 管理员保存模板（PSD 导入等场景），与原 design/edit 等价但强制鉴权 */
export const saveTemplate = (params: {
  id?: number | string
  title: string
  data: string
  width: number
  height: number
  type?: number | string
  cate?: string
}) => fetch<{ id: number }>(API.saveTemplate, params, 'post')

export const getUserImages = (params: Type.Object = {}) => fetch<{ list: any[]; total: number }>(API.userImages, params)

export const deleteUserImage = (id: number) => fetch(API.deleteUserImage, { id }, 'post')

export type TAdminUserItem = {
  id: number
  account: string
  role: number
  created_at: string
}

export const getUsers = (params: Type.Object = {}) => fetch<{ list: TAdminUserItem[]; total: number }>(API.users, params)

export const deleteUser = (id: number) => fetch(API.deleteUser, { id }, 'post')
export type TAdminDesignItem = { id: number; user_id: number; account: string; title: string; cover: string; width: number; height: number; created_at: string; updated_at: string }
export const getDesigns = (params: Type.Object = {}) => fetch<{ list: TAdminDesignItem[]; total: number }>(API.designs, params)
export const deleteDesign = (id: number) => fetch(API.deleteDesign, { id }, 'post')

export const getCategories = (type: 'materials' | 'photos', params: Type.Object = {}) => fetch<{ list: any[]; total: number }>(API.categories, { type, ...params })
export const getAssets = (type: 'materials' | 'photos', params: { cate?: string; search?: string; page?: number; pageSize?: number } = {}) => fetch<{ list: any[]; total: number }>(API.assets, { type, ...params })
export const addAsset = (type: 'materials' | 'photos', cate: string, asset: any) => fetch(API.assetAdd, { type, cate, asset }, 'post')
export const updateAsset = (type: 'materials' | 'photos', cate: string, index: number, asset: any, fromCate = cate) => fetch(API.assetUpdate, { type, cate, fromCate, index, asset }, 'post')
export const deleteAsset = (type: 'materials' | 'photos', cate: string, index: number) => fetch(API.assetDelete, { type, cate, index }, 'post')

export const deleteCategory = (type: 'materials' | 'photos', cate: string) => fetch(API.deleteCategory, { type, cate }, 'post')
export const addCategory = (type: 'materials' | 'photos', name: string) => fetch(API.addCategory, { type, name }, 'post')
export const renameCategory = (type: 'materials' | 'photos', cate: string, name: string) => fetch(API.renameCategory, { type, cate, name }, 'post')
export const getTemplateCategories = (type: 0 | 1 = 0, params: Type.Object = {}) => fetch<{ list: any[]; total: number }>(API.templateCategories, { type, ...params })
export const addTemplateCategory = (data: { name: string; type: 0 | 1 }) => fetch(API.addTemplateCategory, data, 'post')
export const deleteTemplateCategory = (id: number, force = false) => fetch(API.deleteTemplateCategory, { id, force }, 'post') // [TINIX] force: gỡ nhóm khỏi các mẫu rồi xóa
export const renameTemplateCategory = (data: { id: number; name: string }) => fetch(API.renameTemplateCategory, data, 'post')

// [TINIX] Nhóm mẫu thiết kế (một mẫu thuộc nhiều nhóm)
export const reorderTemplateCategories = (ids: number[], type: 0 | 1 = 0) => fetch(API.reorderTemplateCategories, { type, ids }, 'post')
export const setTemplateGroups = (id: number, groupIds: number[]) => fetch(API.setTemplateGroups, { id, groupIds }, 'post')
export const bulkTemplateGroups = (ids: number[], add: number[], remove: number[]) => fetch(API.bulkTemplateGroups, { ids, add, remove }, 'post')

/** 后台字体项：包含完整管理字段（lang/font_family/size/woff_size 等） */
export type TAdminFontItem = {
  id: number
  alias: string
  value: string
  preview: string
  woff: string
  ttf: string
  lang: string
  font_family: string
  size: number
  woff_size: number
  supports_vietnamese?: number // [TINIX]
  category?: string // [TINIX]
  tags?: string // [TINIX] JSON mảng
  license?: string // [TINIX]
  created_at: string
}

/** 字体新增/编辑表单字段（id 仅编辑时使用） */
export type TFontForm = {
  id?: number
  alias: string
  value: string
  preview?: string
  woff: string
  ttf?: string
  lang: 'zh' | 'en' | 'ko' // [TINIX]
  font_family?: string
  size?: number
  woff_size?: number
  supports_vietnamese?: boolean // [TINIX]
  category?: string // [TINIX]
  tags?: string[] // [TINIX]
}

export const getFonts = (params: { page?: number; pageSize?: number; search?: string; lang?: string; vn?: string; category?: string } = {}) => fetch<{ list: TAdminFontItem[]; total: number }>(API.fonts, params)

export const addFont = (data: Omit<TFontForm, 'id'>) => fetch<{ id: number }>(API.addFont, data, 'post')
export const updateFont = (data: TFontForm & { id: number }) => fetch(API.updateFont, data, 'post')

export const deleteFont = (id: number) => fetch(API.deleteFont, { id }, 'post')
// [TINIX] tạo ảnh xem trước còn thiếu; status trả về running/log
export const startFontPreviews = () => fetch<{ running: boolean; log: string; exitCode: number | null }>(API.fontPreviews, {}, 'post')
export const getFontPreviewStatus = () => fetch<{ running: boolean; log: string; exitCode: number | null }>(API.fontPreviews, {})

/** 后台 AI 配置：兼容任意 OpenAI 格式端点 */
export type TAiSettings = {
  api_key: string
  has_key: boolean
  text_model: string
  image_model: string
  base_url: string
  image_size_mode: 'zhipu' | 'openai' | '1024'
  enabled: boolean
}

export const getAiSettings = () => fetch<TAiSettings>(API.aiSettings, {})

export const updateAiSettings = (data: { api_key?: string; text_model?: string; image_model?: string; base_url?: string; image_size_mode?: string; enabled?: boolean }) =>
  fetch(API.aiSettings, data, 'post')

export const testAiConnection = () => fetch<{ content: string }>(API.aiTest, {}, 'post')
