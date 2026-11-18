<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * @Author: ShawnPhang
 * @Date: 2024-04-03 19:15:21
 * @Description: 文件 
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2026-08-31 13:19:45
-->
<template>
  <el-dropdown trigger="click" size="large" placement="bottom-start" @visible-change="onVisible">
    <span class="el-dropdown-link">
      <slot />
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <!-- [TINIX] Tệp = dự án: một tệp .tinix.zip chứa thiết kế + ảnh của khách -->
        <el-dropdown-item><div class="item" @click="$emit('select', 'newDesign')">{{ $t('tinix.ui.project.new_project') }}</div></el-dropdown-item>
        <el-dropdown-item @click="$emit('select', 'openFile')">{{ $t('tinix.ui.project.open') }}</el-dropdown-item>
        <el-dropdown-item divided disabled class="recent-head">{{ $t('tinix.ui.project.recent') }}</el-dropdown-item>
        <el-dropdown-item v-for="r in recent" :key="r.id" class="recent-item" @click="$emit('select', 'openRecent', r)">{{ r.name.replace(/\.tinix\.zip$|\.zip$/i, '') }}</el-dropdown-item>
        <el-dropdown-item v-if="!recent.length" disabled>{{ $t('tinix.ui.project.no_recent') }}</el-dropdown-item>
        <el-dropdown-item divided @click="$emit('select', 'save')">{{ $t('tinix.ui.project.save') }}</el-dropdown-item>
        <el-dropdown-item @click="$emit('select', 'saveAs')">{{ $t('tinix.ui.project.save_as') }}</el-dropdown-item>
        <!-- [TINIX] Lưu mẫu: "Lưu đè" chỉ có khi đang Sửa mẫu (nút Sửa trên thẻ mẫu) để khỏi ghi đè nhầm bằng ảnh khách; còn lại chỉ "Lưu thành mẫu mới" (tên tự đặt theo mã số) -->
        <el-dropdown-item v-if="tempEditing" divided @click="$emit('select', 'overwriteTemplate')">{{ $t('tinix.ui.templateSave.overwrite', { name: templateSource?.name || '' }) }}</el-dropdown-item>
        <el-dropdown-item :divided="!tempEditing" @click="$emit('select', 'saveAsTemplate')">{{ $t('tinix.ui.templateSave.save_new') }}</el-dropdown-item>
        <el-dropdown-item v-if="tempEditing" @click="$emit('select', 'exitTempEdit')">{{ $t('tinix.ui.templateSave.exit_edit') }}</el-dropdown-item>
        <el-dropdown-item divided @click="$emit('select', 'export')">{{ $t('tinix.ui.export.menu') }}<!-- [TINIX] --></el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
// import { ref, Ref } from 'vue'
import { ref } from 'vue'
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus'
import { listRecent, type RecentFile } from '@/utils/tinix/design-file' // [TINIX]
import { templateSource } from '@/utils/tinix/template-save' // [TINIX]
import { storeToRefs } from 'pinia' // [TINIX]
import { useUserStore } from '@/store' // [TINIX]

defineEmits<{ select: [action: string, payload?: any] }>()

// [TINIX] danh sách dự án mở gần đây: nạp mỗi lần mở menu
const recent = ref<RecentFile[]>([])
async function onVisible(visible: boolean) {
  if (visible) recent.value = await listRecent()
}

const { tempEditing } = storeToRefs(useUserStore()) // [TINIX] chế độ sửa mẫu (Quản trị → Sửa mẫu)

</script>

<style lang="less" scoped>
.item {
  width: 224px;
}
.recent-head {
  font-size: 12px;
  color: #94a3b8 !important;
  line-height: 22px;
}
.recent-item {
  padding-left: 28px;
}
</style>
