/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Component } from 'vue'

/** 侧边栏导航项；key 必须与 Admin.vue 里各 pane 的激活键一一对应 */
export interface TNavItem {
  key: string
  label: string
  icon: Component
}

/** 侧边栏导航分组 */
export interface TNavGroup {
  title: string
  items: TNavItem[]
}

/** 总览页统计项 */
export interface TOverviewStat {
  /** 列表 key，需唯一 */
  key: string
  /** 点击后跳转的侧边栏面板键 */
  tab: string
  label: string
  value: number
  icon: Component
  /** 数字下方的一行说明，为空时不渲染 */
  hint?: string
  /** 目标面板内的子视图（模板与组件页的模板/组件切换） */
  templateType?: string
}

/** 分类管理页内的子分类切换 */
export type TCategoryTab = 'template-categories' | 'materials' | 'photos'
