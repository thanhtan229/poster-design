<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
-->
<template>
  <el-table class="admin-table" :data="rows" size="small" stripe v-loading="loading">
    <el-table-column prop="id" label="ID" width="70" />
    <el-table-column label="封面" width="90">
      <template #default="{ row }">
        <el-image v-if="row.cover" :src="row.cover" :preview-src-list="[row.cover]" fit="cover" style="width: 64px; height: 36px" preview-teleported />
        <span v-else class="empty-cover">暂无</span>
      </template>
    </el-table-column>
    <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
    <el-table-column label="尺寸" width="110"><template #default="{ row }">{{ row.width }} × {{ row.height }}</template></el-table-column>
    <el-table-column label="分类" width="160" show-overflow-tooltip><template #default="{ row }"><span>{{ row.cate || '未分类' }}</span><el-button type="primary" size="small" link @click="$emit('category', row)">修改</el-button></template></el-table-column>
    <el-table-column label="状态" width="80"><template #default="{ row }"><el-tag :type="row.state === 1 ? 'success' : 'info'" size="small">{{ row.state === 1 ? '正常' : '已下架' }}</el-tag></template></el-table-column>
    <el-table-column label="操作" width="230" fixed="right"><template #default="{ row }"><el-button type="primary" size="small" link @click="$emit('edit', row)">编辑</el-button><el-button v-if="row.state === 1" type="success" size="small" link @click="$emit('extract', row)">提取元素</el-button><el-button v-if="row.state === 1" type="warning" size="small" link @click="$emit('delete', row)">下架</el-button><el-button type="danger" size="small" link @click="$emit('remove', row)">删除</el-button></template></el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
import { ElTable, ElTableColumn, ElImage, ElTag, ElButton } from 'element-plus'
withDefaults(defineProps<{ rows: any[]; loading?: boolean }>(), { loading: false })
defineEmits<{ delete: [row: any]; remove: [row: any]; edit: [row: any]; extract: [row: any]; category: [row: any] }>()
</script>

<style lang="less" scoped>
.empty-cover {
  display: inline-flex;
  width: 64px;
  height: 36px;
  align-items: center;
  justify-content: center;
  color: @color-ink-hint;
  background: @color-canvas-page;
  font-size: 12px;
}
</style>
