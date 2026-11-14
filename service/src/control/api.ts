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
 * @Description: 接口名称
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 13:39:59
 */
let path = '/api'

export default {
  SCREENGHOT: path + '/screenshots',
  PRINTSCREEN: path + '/printscreen',
  // 后端示例
  UPLOAD: path + '/file/upload',
  USER_IMAGES: '/design/user/image',
  USER_IMAGE_DELETE: '/design/user/image/del',
  GET_TEMPLATE_LIST: '/design/list',
  GET_TEMPLATE_CATEGORIES: '/design/template/categories',
  GET_TEMPLATE: '/design/temp',
  GET_MATERIAL: '/design/material',
  GET_PHOTOS: '/design/imgs',
  GET_ASSET_CATEGORIES: '/design/asset/categories',
  GET_FONTS: '/design/fonts',
  UPDATE_TEMPLATE: '/design/edit',
  SAVE_DESIGN: '/design/save',
  MY_DESIGNS: '/design/my',
  DESIGN_DETAIL: '/design/poster',
  DELETE_DESIGN: '/design/poster/del',
  // AI 能力（需登录）
  AI_TEXT: path + '/ai/text',
  AI_IMAGE: path + '/ai/image',
  AI_COLOR: path + '/ai/color',
  // 后台 AI 配置
  ADMIN_AI_SETTINGS: path + '/admin/ai/settings',
  ADMIN_AI_TEST: path + '/admin/ai/test',
  // 用户系统
  REGISTER: path + '/user/register',
  LOGIN: path + '/user/login',
  CHANGE_PASSWORD: path + '/user/changePassword',
  // 后台管理
  ADMIN_TEMPLATES: path + '/admin/templates',
  ADMIN_TEMPLATE_DELETE: path + '/admin/template/delete',
  ADMIN_TEMPLATE_REMOVE: path + '/admin/template/remove',
  ADMIN_TEMPLATE_SAVE: path + '/admin/template/save',
  ADMIN_TEMPLATE_CATEGORY_UPDATE: path + '/admin/template/category/update',
  ADMIN_USER_IMAGES: path + '/admin/user/images',
  ADMIN_USERS: path + '/admin/users',
  ADMIN_USER_DELETE: path + '/admin/user/delete',
  ADMIN_DESIGNS: path + '/admin/designs',
  ADMIN_DESIGN_DELETE: path + '/admin/design/delete',
  ADMIN_USER_IMAGE_DELETE: path + '/admin/user/image/delete',
  ADMIN_CATEGORIES: path + '/admin/categories',
  ADMIN_ASSETS: path + '/admin/assets',
  ADMIN_ASSET_ADD: path + '/admin/asset/add',
  ADMIN_ASSET_UPDATE: path + '/admin/asset/update',
  ADMIN_ASSET_DELETE: path + '/admin/asset/delete',
  ADMIN_TEMPLATE_CATEGORIES: path + '/admin/template/categories',
  ADMIN_TEMPLATE_CATEGORY_ADD: path + '/admin/template/category/add',
  ADMIN_TEMPLATE_CATEGORY_DELETE: path + '/admin/template/category/delete',
  ADMIN_TEMPLATE_CATEGORY_RENAME: path + '/admin/template/category/rename',
  ADMIN_TEMPLATE_CATEGORY_REORDER: path + '/admin/template/category/reorder', // [TINIX] nhóm mẫu
  ADMIN_TEMPLATE_GROUPS_SET: path + '/admin/template/groups/set',
  ADMIN_TEMPLATE_GROUPS_BULK: path + '/admin/template/groups/bulk',
  ADMIN_TEMPLATE_GROUPS_SUGGEST: path + '/admin/template/groups/suggest',
  ADMIN_TEMPLATE_GROUPS_APPLY: path + '/admin/template/groups/apply',
  ADMIN_CATEGORY_DELETE: path + '/admin/category/delete',
  ADMIN_CATEGORY_ADD: path + '/admin/category/add',
  ADMIN_CATEGORY_RENAME: path + '/admin/category/rename',
  ADMIN_FONTS: path + '/admin/fonts',
  ADMIN_FONT_ADD: path + '/admin/font/add',
  ADMIN_FONT_UPDATE: path + '/admin/font/update',
  ADMIN_FONT_DELETE: path + '/admin/font/delete',
  ADMIN_FONT_PREVIEWS: path + '/admin/fonts/previews', // [TINIX] tạo ảnh xem trước còn thiếu
}
