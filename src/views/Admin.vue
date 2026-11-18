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
  <div class="admin-shell">
    <AdminSidebar :active="activeTab" :user="adminUser" @select="onSelectTab" @logout="onLogout" />

    <div class="admin-main">
      <AdminTopbar :title="pageMeta.title" :description="pageMeta.description" @home="jump2home" />

      <main class="admin-body">
        <!-- 总览：平台内容规模 + 常用管理入口 -->
        <section v-if="activeTab === 'overview'" class="overview-pane">
          <div v-loading="loading" class="overview-stats">
            <StatCard
              v-for="stat in overviewStats"
              :key="stat.key"
              :label="stat.label"
              :value="stat.value"
              :icon="stat.icon"
              :hint="stat.hint"
              @go="onStatGo(stat)"
            />
          </div>

          <section class="pane">
            <h3 class="pane-title">常用操作</h3>
            <div class="quick-actions">
              <QuickAction :icon="Upload" name="导入 PSD 创建模板" desc="在新窗口打开 PSD 导入页" @go="openPSDImport()" />
              <QuickAction :icon="Upload" name="导入 PSD 创建组件" desc="导入的图层将作为可复用组件" @go="openPSDImport(1)" />
              <QuickAction :icon="EditPen" name="新增字体" desc="上传 woff 文件后编辑器即可选用" @go="openFontDialog()" />
              <QuickAction :icon="MagicStick" name="配置 AI 能力" desc="开启文案生成、文生图与智能配色" @go="onSelectTab('ai-settings')" />
            </div>
          </section>
        </section>

        <!-- 模板与组件 -->
        <section v-else-if="activeTab === 'templates'" class="pane">
          <div class="pane-toolbar">
            <el-radio-group v-model="templateType" size="small">
              <el-radio-button value="templates-list">模板</el-radio-button>
              <el-radio-button value="components-list">组件</el-radio-button>
            </el-radio-group>
            <span class="toolbar-spacer"></span>
            <el-button type="primary" size="small" plain @click="openPSDImport(templateType === 'components-list' ? 1 : undefined)">
              <el-icon><Upload /></el-icon>
              {{ templateType === 'components-list' ? '导入 PSD 创建组件' : '导入 PSD 创建模板' }}
            </el-button>
            <el-button size="small" :loading="loading" @click="loadTab">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          <AdminTemplateTable
            :rows="templateType === 'components-list' ? componentRows : templateRows"
            :loading="loading"
            @delete="onDelTemplate"
            @remove="onRemoveTemplate"
            @edit="onEditTemplate"
            @extract="onExtractTemplate"
            @category="openCategoryEditor"
          />
        </section>

        <!-- 素材管理 -->
        <section v-else-if="activeTab === 'materials'" class="pane">
          <div class="pane-toolbar">
            <el-input
              v-model="assetQuery.search"
              size="small"
              clearable
              placeholder="搜索素材名称或地址"
              class="search-input"
              @keyup.enter="reloadFromPage1"
              @clear="reloadFromPage1"
            />
            <el-button size="small" @click="reloadFromPage1">搜索</el-button>
            <span class="toolbar-spacer"></span>
            <el-button type="primary" size="small" @click="openAssetDialog('materials')">
              <el-icon><Plus /></el-icon>
              新增上传
            </el-button>
          </div>
          <el-table class="admin-table" :data="materialAssets" size="small" stripe v-loading="loading">
            <el-table-column prop="category" label="分组" width="150" />
            <el-table-column prop="type" label="元素类型" width="120" />
            <el-table-column prop="title" label="名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="url" label="地址" min-width="280" show-overflow-tooltip />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" link @click="openAssetDialog('materials', row)">编辑</el-button>
                <el-button type="danger" size="small" link @click="onDeleteAsset('materials', row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 照片管理 -->
        <section v-else-if="activeTab === 'photos'" class="pane">
          <div class="pane-toolbar">
            <el-input
              v-model="assetQuery.search"
              size="small"
              clearable
              placeholder="搜索照片名称或地址"
              class="search-input"
              @keyup.enter="reloadFromPage1"
              @clear="reloadFromPage1"
            />
            <el-button size="small" @click="reloadFromPage1">搜索</el-button>
            <span class="toolbar-spacer"></span>
            <el-button type="primary" size="small" @click="openAssetDialog('photos')">
              <el-icon><Plus /></el-icon>
              新增上传
            </el-button>
          </div>
          <el-table class="admin-table" :data="photoAssets" size="small" stripe v-loading="loading">
            <el-table-column prop="categoryName" label="分类" width="150" />
            <el-table-column prop="title" label="名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="url" label="地址" min-width="280" show-overflow-tooltip />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" link @click="openAssetDialog('photos', row)">编辑</el-button>
                <el-button type="danger" size="small" link @click="onDeleteAsset('photos', row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 分类管理 -->
        <section v-else-if="activeTab === 'categories'" class="pane">
          <div class="pane-toolbar">
            <el-radio-group v-model="categoryTab" size="small" @change="reloadFromPage1">
              <el-radio-button value="template-categories">模板分类</el-radio-button>
              <el-radio-button value="materials">素材分类</el-radio-button>
              <el-radio-button value="photos">照片分类</el-radio-button>
            </el-radio-group>
          </div>

          <template v-if="categoryTab === 'template-categories'">
            <div class="pane-toolbar">
              <el-radio-group v-model="templateCategoryType" size="small" @change="reloadFromPage1">
                <el-radio-button :value="0">模板</el-radio-button>
                <el-radio-button :value="1">组件</el-radio-button>
              </el-radio-group>
              <span class="toolbar-spacer"></span>
              <el-input
                v-model="newTemplateCategory.name"
                size="small"
                placeholder="分类名称，如节日海报"
                class="name-input"
                @keyup.enter="addTemplateCategory"
              />
              <el-button type="primary" size="small" @click="addTemplateCategory">新增分类</el-button>
            </div>
            <el-table class="admin-table" :data="templateCategories" size="small" stripe v-loading="loading">
              <el-table-column prop="id" label="ID" width="80" />
              <el-table-column prop="name" label="分类名称" min-width="220" show-overflow-tooltip />
              <el-table-column prop="sort" label="排序" width="90" />
              <el-table-column label="操作" width="160" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" size="small" link @click="onRenameTemplateCategory(row)">重命名</el-button>
                  <el-button type="danger" size="small" link @click="onDelTemplateCategory(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <template v-else>
            <div class="pane-toolbar">
              <span class="toolbar-spacer"></span>
              <el-button type="primary" size="small" @click="onAddCategory(categoryTab)">
                <el-icon><Plus /></el-icon>
                新增分类
              </el-button>
            </div>
            <el-table
              class="admin-table"
              :data="categoryTab === 'materials' ? materialCates : photoCates"
              size="small"
              stripe
              v-loading="loading"
            >
              <el-table-column prop="id" label="ID" width="80" />
              <el-table-column v-if="categoryTab === 'photos'" prop="cate" label="分类键" width="160" />
              <el-table-column prop="name" label="分类名称" min-width="220" show-overflow-tooltip />
              <el-table-column prop="count" label="数量" width="100" />
              <el-table-column label="操作" width="160" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" size="small" link @click="onRenameCategory(categoryTab, row)">重命名</el-button>
                  <el-button type="danger" size="small" link @click="onDelCategory(categoryTab, row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </section>

        <!-- 字体管理 -->
        <section v-else-if="activeTab === 'fonts'" class="pane">
          <div class="pane-toolbar">
            <el-input
              v-model="fontQuery.search"
              size="small"
              clearable
              placeholder="搜索字体名称 / value"
              class="search-input"
              @keyup.enter="reloadFromPage1"
              @clear="reloadFromPage1"
            />
            <el-button size="small" @click="reloadFromPage1">搜索</el-button>
            <span class="toolbar-spacer"></span>
            <el-button type="primary" size="small" @click="openFontDialog()">
              <el-icon><Plus /></el-icon>
              新增字体
            </el-button>
          </div>
          <el-table class="admin-table" :data="fonts" size="small" stripe v-loading="loading">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="alias" label="名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="value" label="value" min-width="140" show-overflow-tooltip />
            <el-table-column label="语种" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.lang === 'en' ? 'warning' : 'success'">{{ row.lang === 'en' ? '英文' : '中文' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="woff" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <a v-if="row.woff" :href="row.woff" target="_blank" rel="noopener" class="link-primary">{{ row.woff }}</a>
                <span v-else class="muted-text">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="font_family" label="font-family" min-width="140" show-overflow-tooltip />
            <el-table-column prop="created_at" label="创建时间" width="170" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" link @click="openFontDialog(row)">编辑</el-button>
                <el-button type="danger" size="small" link @click="onDelFont(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-if="fontQuery.total > fontQuery.pageSize"
            class="admin-pagination"
            background
            layout="total, sizes, prev, pager, next"
            :total="fontQuery.total"
            :current-page="fontQuery.page"
            :page-size="fontQuery.pageSize"
            :page-sizes="[10, 20, 50]"
            @current-change="(page: number) => { fontQuery.page = page; loadTab() }"
            @size-change="(size: number) => { fontQuery.pageSize = size; fontQuery.page = 1; loadTab() }"
          />
        </section>

        <!-- 用户图片 -->
        <section v-else-if="activeTab === 'user-images'" class="pane">
          <el-table class="admin-table" :data="userImages" size="small" stripe v-loading="loading">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column label="预览" width="100">
              <template #default="{ row }">
                <el-image :src="row.url" :preview-src-list="[row.url]" fit="cover" style="width: 64px; height: 36px" preview-teleported />
              </template>
            </el-table-column>
            <el-table-column label="尺寸" width="110"><template #default="{ row }">{{ row.width }} × {{ row.height }}</template></el-table-column>
            <el-table-column prop="created_at" label="上传时间" width="180" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button type="danger" size="small" link @click="onDelUserImage(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 用户管理 -->
        <section v-else-if="activeTab === 'users'" class="pane">
          <div class="pane-toolbar">
            <span class="toolbar-spacer"></span>
            <el-button size="small" :loading="loading" @click="loadTab">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          <el-table class="admin-table" :data="users" size="small" stripe v-loading="loading">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="account" label="账号" min-width="200" show-overflow-tooltip />
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="row.role === 1 ? 'danger' : 'info'" size="small">{{ row.role === 1 ? '管理员' : '普通用户' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="注册时间" width="180" />
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.role !== 1" type="danger" size="small" link @click="onDelUser(row)">删除</el-button>
                <span v-else class="muted-text">受保护</span>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 用户作品 -->
        <section v-else-if="activeTab === 'designs'" class="pane">
          <div class="pane-toolbar">
            <span class="toolbar-spacer"></span>
            <el-button size="small" :loading="loading" @click="loadTab">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          <el-table class="admin-table" :data="designs" size="small" stripe v-loading="loading">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="account" label="用户" width="150" />
            <el-table-column label="封面" width="100">
              <template #default="{ row }">
                <el-image v-if="row.cover" :src="row.cover" :preview-src-list="[row.cover]" fit="cover" style="width: 64px; height: 36px" preview-teleported />
                <span v-else class="muted-text">暂无</span>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
            <el-table-column label="尺寸" width="110"><template #default="{ row }">{{ row.width }} × {{ row.height }}</template></el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="180" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button type="danger" size="small" link @click="onDelDesign(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- AI 设置 -->
        <section v-else-if="activeTab === 'ai-settings'" class="pane">
          <div class="pane-toolbar">
            <span class="toolbar-note">
              配置后登录用户即可在编辑器中使用文案生成、文生图与智能配色，
              默认对接智谱开放平台（<a class="link-primary" href="https://bigmodel.cn/apikey/platform" target="_blank" rel="noopener">申请 ApiKey</a>），也支持任意 OpenAI 兼容接口
            </span>
            <span class="toolbar-spacer"></span>
            <el-button size="small" :loading="aiTesting" @click="testAiConnection">
              <el-icon><Link /></el-icon>
              测试连接
            </el-button>
          </div>
          <el-form class="ai-form" label-width="110px" size="small">
            <el-form-item label="接口地址">
              <el-input v-model="aiForm.base_url" placeholder="OpenAI 兼容端点，默认智谱开放平台" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="aiForm.api_key" :placeholder="aiForm.has_key ? '已配置，输入新值可覆盖' : '服务商申请的 API Key'" show-password />
            </el-form-item>
            <el-form-item label="文案模型">
              <el-input v-model="aiForm.text_model" placeholder="默认 glm-4-flash（免费）" />
            </el-form-item>
            <el-form-item label="生图模型">
              <el-input v-model="aiForm.image_model" placeholder="默认 cogview-3-flash" />
            </el-form-item>
            <el-form-item label="生图尺寸">
              <el-select v-model="aiForm.image_size_mode" style="width: 100%">
                <el-option v-for="item in AI_SIZE_MODE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="启用 AI 功能">
              <el-switch v-model="aiForm.enabled" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="aiSaving" @click="saveAiSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </section>

        <el-pagination
          v-if="adminTotal > adminPageSize"
          class="admin-pagination"
          background
          layout="total, sizes, prev, pager, next"
          :total="adminTotal"
          :current-page="adminPage"
          :page-size="adminPageSize"
          :page-sizes="[10, 20, 50]"
          @current-change="(page: number) => { adminPage = page; loadTab() }"
          @size-change="(size: number) => { adminPageSize = size; adminPage = 1; loadTab() }"
        />
      </main>
    </div>

    <el-dialog v-model="categoryDialog.visible" title="修改分类" width="420px">
      <el-form label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="categoryDialog.cate" placeholder="请选择分类" clearable style="width: 100%">
            <el-option v-for="item in categoryOptions" :key="item.id" :label="item.name" :value="item.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="categoryDialog.submitting" @click="saveCategory">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assetDialog.visible" :title="assetDialog.index >= 0 ? '编辑资源' : '新增资源'" width="520px">
      <el-form label-width="80px">
        <el-form-item label="分组">
          <el-select v-model="assetDialog.cate" style="width: 100%">
            <el-option v-for="item in assetDialog.categories" :key="item.cate" :label="item.name" :value="item.cate" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="assetDialog.type === 'materials'" label="元素类型">
          <el-select v-model="assetDialog.assetType" style="width: 100%">
            <el-option label="Image 图片" value="image" />
            <el-option label="SVG 矢量元素" value="svg" />
            <el-option label="Mask 容器" value="mask" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="assetDialog.title" /></el-form-item>
        <el-form-item label="图片 URL"><el-input v-model="assetDialog.url" placeholder="可填写远程 URL" /></el-form-item>
        <el-form-item label="本地文件"><input type="file" accept="image/*,.svg" @change="onAssetFileChange" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assetDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="assetDialog.submitting" @click="submitAsset">保存</el-button>
      </template>
    </el-dialog>

    <!-- 从模板批量提取元素入库 -->
    <ExtractAssetsDialog v-model="extractDialog.visible" :source="extractDialog.source" :title-prefix="extractDialog.prefix" @done="loadTab" />

    <!-- 新增 / 编辑字体对话框 -->
    <el-dialog v-model="fontDialog.visible" :title="fontDialog.title" width="560px" @closed="resetFontForm">
      <el-form ref="fontFormRef" :model="fontDialog.form" :rules="fontRules" label-width="92px" size="small">
        <el-form-item label="字体名称" prop="alias">
          <el-input v-model="fontDialog.form.alias" placeholder="例：站酷快乐体" maxlength="40" show-word-limit />
        </el-form-item>
        <el-form-item label="value" prop="value">
          <el-input v-model="fontDialog.form.value" placeholder="CSS 用的 family slug，例：zcool-kuaile-regular" maxlength="60" />
        </el-form-item>
        <el-form-item label="woff 链接" prop="woff">
          <el-input v-model="fontDialog.form.woff" placeholder="https://..." />
          <input type="file" accept=".woff,.woff2" style="margin-top: 6px" @change="onFontFileChange" />
          <span class="muted-text">可直接选择 woff 文件上传，或填写远程链接</span>
        </el-form-item>
        <el-form-item label="ttf 链接">
          <el-input v-model="fontDialog.form.ttf" placeholder="可选" />
        </el-form-item>
        <el-form-item label="预览图">
          <el-input v-model="fontDialog.form.preview" placeholder="可选，预览图 URL" />
        </el-form-item>
        <el-form-item label="语种" prop="lang">
          <el-radio-group v-model="fontDialog.form.lang">
            <el-radio value="zh">中文</el-radio>
            <el-radio value="en">英文</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="font-family">
          <el-input v-model="fontDialog.form.font_family" placeholder="可选" maxlength="80" />
        </el-form-item>
        <el-form-item v-if="!fontDialog.form.id" label="文件大小">
          <el-input-number v-model="fontDialog.form.size" :min="0" :step="1" placeholder="字节，可选" />
        </el-form-item>
        <el-form-item v-if="!fontDialog.form.id" label="woff 大小">
          <el-input-number v-model="fontDialog.form.woff_size" :min="0" :step="1" placeholder="字节，可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fontDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="fontDialog.submitting" @click="submitFont">{{ fontDialog.form.id ? '确认编辑' : '确认新增' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
// ElTable / ElTabs 等未全局注册（见 elementConfig.ts），本页手动引入
import {
  ElMessage,
  ElMessageBox,
  ElTable,
  ElTableColumn,
  ElTag,
  ElButton,
  ElImage,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElIcon,
  ElRadioGroup,
  ElRadio,
  ElRadioButton,
  ElPagination,
  ElSelect,
  ElOption,
  ElSwitch,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import { Grid, Files, PictureFilled, Document, Upload, EditPen, MagicStick, Refresh, Plus, Link } from '@element-plus/icons-vue'
import { LocalStorageKey } from '@/config'
import * as adminApi from '@/api/admin'
import * as materialApi from '@/api/material'
import AdminTemplateTable from '@/views/components/AdminTemplateTable.vue'
import ExtractAssetsDialog from '@/components/business/extract-assets/ExtractAssetsDialog.vue'
import { getTempDetail } from '@/api/home'
import AdminSidebar from './admin/comps/AdminSidebar.vue'
import AdminTopbar from './admin/comps/AdminTopbar.vue'
import StatCard from './admin/comps/StatCard.vue'
import QuickAction from './admin/comps/QuickAction.vue'
import { PAGE_META, AI_SIZE_MODE_OPTIONS } from './admin/constants'
import type { TOverviewStat, TCategoryTab, TAdminUser } from './admin/types'

const router = useRouter()
const activeTab = ref('overview')
const categoryTab = ref<TCategoryTab>('template-categories')
const loading = ref(false)
const templates = ref<any[]>([])
const templateType = ref('templates-list')
const userImages = ref<any[]>([])
const users = ref<adminApi.TAdminUserItem[]>([])
const designs = ref<adminApi.TAdminDesignItem[]>([])
const materialCates = ref<any[]>([])
const photoCates = ref<any[]>([])
const materialAssets = ref<any[]>([])
const photoAssets = ref<any[]>([])
const assetQuery = reactive({ search: '' })
const templateCategories = ref<any[]>([])
const newTemplateCategory = reactive({ name: '' })
const templateCategoryType = ref<0 | 1>(0)
const fonts = ref<adminApi.TAdminFontItem[]>([])
const fontQuery = reactive({ page: 1, pageSize: 20, search: '', total: 0 })
// AI 设置
const aiForm = reactive<adminApi.TAiSettings>({
  api_key: '',
  has_key: false,
  text_model: '',
  image_model: '',
  base_url: '',
  image_size_mode: 'zhipu',
  enabled: false,
})
const aiSaving = ref(false)
const aiTesting = ref(false)
const adminPage = ref(1)
const adminPageSize = ref(20)
const adminTotal = ref(0)
// 本地登录的管理员（侧边栏底部展示）
const adminUser = reactive<TAdminUser>({ account: '', role: 0 })
// 总览页统计：pageSize 上限 100（后端 pageResult 封顶），常规管理规模下可完整计数
const overview = reactive({ templates: 0, components: 0, userImages: 0, fonts: 0 })
const templateRows = computed(() => templates.value.filter((item) => item.type === 0))
const componentRows = computed(() => templates.value.filter((item) => item.type === 1))
const categoryOptions = ref<any[]>([])
const categoryDialog = reactive({ visible: false, submitting: false, row: null as any, cate: '' })
const assetDialog = reactive({
  visible: false,
  submitting: false,
  type: 'materials' as 'materials' | 'photos',
  cate: '',
  sourceCate: '',
  assetType: 'image',
  title: '',
  url: '',
  index: -1,
  file: null as File | null,
  categories: [] as any[],
})

const pageMeta = computed(() => PAGE_META[activeTab.value] || PAGE_META.overview)

const overviewStats = computed<TOverviewStat[]>(() => [
  { key: 'templates', tab: 'templates', label: '模板', value: overview.templates, icon: Grid, hint: '可直接使用的设计', templateType: 'templates-list' },
  { key: 'components', tab: 'templates', label: '组件', value: overview.components, icon: Files, hint: '可组合到画布中', templateType: 'components-list' },
  { key: 'user-images', tab: 'user-images', label: '用户图片', value: overview.userImages, icon: PictureFilled, hint: '仅记录，不删文件' },
  { key: 'fonts', tab: 'fonts', label: '字体', value: overview.fonts, icon: Document, hint: '编辑器可选用' },
])

/** 统计卡跳转：模板/组件共用一个面板，需同时切到对应子视图 */
function onStatGo(stat: TOverviewStat) {
  if (stat.templateType) templateType.value = stat.templateType
  onSelectTab(stat.tab)
}

/** 字体新增 / 编辑对话框状态 */
const fontDialog = reactive({
  visible: false,
  title: '新增字体',
  submitting: false,
  form: {
    id: 0,
    alias: '',
    value: '',
    woff: '',
    ttf: '',
    preview: '',
    lang: 'zh' as 'zh' | 'en',
    font_family: '',
    size: 0,
    woff_size: 0,
  },
})
const fontFormRef = ref<FormInstance | null>(null)
const fontRules: FormRules = {
  alias: [{ required: true, message: '请输入字体名称', trigger: 'blur' }],
  value: [{ required: true, message: '请输入字体 value（CSS family slug）', trigger: 'blur' }],
  woff: [{ required: true, message: '请输入 woff 字体链接', trigger: 'blur' }],
  lang: [{ required: true, message: '请选择语种', trigger: 'change' }],
}

/** 重置新增字体表单 */
function resetFontForm() {
  fontDialog.form.id = 0
  fontDialog.form.alias = ''
  fontDialog.form.value = ''
  fontDialog.form.woff = ''
  fontDialog.form.ttf = ''
  fontDialog.form.preview = ''
  fontDialog.form.lang = 'zh'
  fontDialog.form.font_family = ''
  fontDialog.form.size = 0
  fontDialog.form.woff_size = 0
  fontFormRef.value?.clearValidate()
}

function openFontDialog(row?: adminApi.TAdminFontItem) {
  resetFontForm()
  if (row) {
    fontDialog.title = '编辑字体'
    fontDialog.form.id = row.id
    fontDialog.form.alias = row.alias
    fontDialog.form.value = row.value
    fontDialog.form.woff = row.woff
    fontDialog.form.ttf = row.ttf
    fontDialog.form.preview = row.preview
    fontDialog.form.lang = row.lang === 'en' ? 'en' : 'zh'
    fontDialog.form.font_family = row.font_family
  } else {
    fontDialog.title = '新增字体'
  }
  fontDialog.visible = true
}

async function openAssetDialog(type: 'materials' | 'photos', row?: any) {
  assetDialog.type = type; assetDialog.index = row?.index ?? -1; assetDialog.sourceCate = row?.category || ''; assetDialog.title = row?.title || ''; assetDialog.url = row?.url || ''; assetDialog.assetType = row?.type === 'svg' || row?.type === 'mask' ? row.type : 'image'; assetDialog.file = null
  const res: any = await adminApi.getCategories(type, { page: 1, pageSize: 100 }); assetDialog.categories = res?.list || []
  assetDialog.cate = row?.category || assetDialog.categories[0]?.cate || ''
  assetDialog.visible = true
}

function onAssetFileChange(event: Event) { assetDialog.file = (event.target as HTMLInputElement).files?.[0] || null }

async function submitAsset() {
  if (!assetDialog.cate) return ElMessage.warning('请选择分类')
  assetDialog.submitting = true
  try {
    let url = assetDialog.url.trim()
    if (assetDialog.file) {
      const res: any = await materialApi.upload({ file: assetDialog.file, folder: assetDialog.type }, () => {})
      url = res?.url || res?.data?.url || ''
    }
    if (!url) return ElMessage.warning('请填写 URL 或选择文件')
    const asset = { title: assetDialog.title.trim(), url, thumb: url, ...(assetDialog.type === 'materials' ? { type: assetDialog.assetType } : {}) }
    const res: any = assetDialog.index >= 0 ? await adminApi.updateAsset(assetDialog.type, assetDialog.cate, assetDialog.index, asset, assetDialog.sourceCate) : await adminApi.addAsset(assetDialog.type, assetDialog.cate, asset)
    if (res?.code === 200) { ElMessage.success('保存成功'); assetDialog.visible = false; await loadTab() } else ElMessage.error(res?.msg || '保存失败')
  } catch (error: any) { ElMessage.error(error?.message || '保存失败') } finally { assetDialog.submitting = false }
}

async function onDeleteAsset(type: 'materials' | 'photos', row: any) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.title || row.url || '该资源'}」？`, '提示', { type: 'warning' })
    const res: any = await adminApi.deleteAsset(type, row.category, row.index)
    if (res?.code === 200) { ElMessage.success('已删除'); await loadTab() } else ElMessage.error(res?.msg || '删除失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

async function onFontFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fontDialog.submitting = true
  try {
    const res: any = await materialApi.upload({ file, folder: 'fonts' }, () => {})
    const url = res?.url || res?.data?.url
    if (!url) throw new Error('上传响应缺少字体地址')
    fontDialog.form.woff = url
    fontDialog.form.woff_size = file.size
    ElMessage.success('字体文件上传成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '字体上传失败')
  } finally {
    fontDialog.submitting = false
    input.value = ''
  }
}

/** 无权限 / 登录失效时清掉本地凭据并回首页 */
function deny(msg: string) {
  ElMessage.warning(msg)
  localStorage.removeItem(LocalStorageKey.tokenKey)
  localStorage.removeItem('xp_user')
  setTimeout(() => (window.location.href = './'), 800)
}

/** 主动退出登录（与 Index.vue 的 logout 行为一致） */
function onLogout() {
  localStorage.removeItem('xp_user')
  localStorage.removeItem(LocalStorageKey.tokenKey)
  window.location.href = './'
}

/** 读取本地登录用户；同时刷新侧边栏展示的账号信息 */
function readLocalUser(): TAdminUser | null {
  try {
    const user = JSON.parse(localStorage.getItem('xp_user') || 'null')
    if (user && typeof user.account === 'string' && user.role === 1) return { account: user.account, role: user.role }
  } catch (e) {}
  return null
}

/** 前端仅做入口守卫（读本地用户信息），真正的权限由后端 requireAdmin 校验 */
function checkLocalRole(): boolean {
  const user = readLocalUser()
  if (!user) return false
  adminUser.account = user.account
  adminUser.role = user.role
  return true
}

onMounted(() => {
  if (!checkLocalRole()) {
    deny('请使用管理员账号登录')
    return
  }
  loadTab()
})

/** 切换导航页：重置分页后拉取该页数据 */
function onSelectTab(key: string) {
  if (activeTab.value === key) return
  activeTab.value = key
  adminPage.value = 1
  loadTab()
}

/** 搜索类操作回到第一页，避免停留在第 2 页时搜不到结果 */
function reloadFromPage1() {
  adminPage.value = 1
  loadTab()
}

/** 总览页统计：模板/组件按 type 拆分计数，其余直接取接口 total */
async function loadOverview() {
  loading.value = true
  try {
    // 接口成功时拦截器只回 result 本体，非 200 时回完整对象，故统一按 any 接收
    const [tplRes, imgRes, fontRes]: any[] = await Promise.all([
      adminApi.getTemplates({ page: 1, pageSize: 100 }),
      adminApi.getUserImages({ page: 1, pageSize: 1 }),
      adminApi.getFonts({ page: 1, pageSize: 1 }),
    ])
    const tplList: any[] = Array.isArray(tplRes?.list) ? tplRes.list : []
    overview.templates = tplList.filter((item) => Number(item.type) === 0).length
    overview.components = tplList.filter((item) => Number(item.type) === 1).length
    overview.userImages = Number(imgRes?.total) || 0
    overview.fonts = Number(fontRes?.total) || 0
    if (tplRes?.code === 401) deny(tplRes?.msg === '请先登录' ? '登录已失效，请重新登录' : '无管理员权限')
  } catch (e: any) {
    ElMessage.error('数据加载失败')
  } finally {
    loading.value = false
  }
}

/** 拉取当前导航页数据；接口返回 401（HTTP 200 + code 401）时回首页 */
async function loadTab() {
  if (!checkLocalRole()) return
  if (activeTab.value === 'overview') return loadOverview()
  loading.value = true
  try {
    let res: any
    adminTotal.value = 0
    if (activeTab.value === 'templates') {
      res = await adminApi.getTemplates({ page: adminPage.value, pageSize: adminPageSize.value })
      templates.value = res?.list || []
    } else if (activeTab.value === 'user-images') {
      res = await adminApi.getUserImages({ page: adminPage.value, pageSize: adminPageSize.value })
      userImages.value = res?.list || []
    } else if (activeTab.value === 'users') {
      res = await adminApi.getUsers({ page: adminPage.value, pageSize: adminPageSize.value })
      users.value = res?.list || []
    } else if (activeTab.value === 'designs') {
      res = await adminApi.getDesigns({ page: adminPage.value, pageSize: adminPageSize.value })
      designs.value = res?.list || []
    } else if (activeTab.value === 'categories') {
      if (categoryTab.value === 'template-categories') res = await adminApi.getTemplateCategories(templateCategoryType.value, { page: adminPage.value, pageSize: adminPageSize.value })
      else res = await adminApi.getCategories(categoryTab.value as 'materials' | 'photos', { page: adminPage.value, pageSize: adminPageSize.value })
      if (categoryTab.value === 'template-categories') templateCategories.value = res?.list || []
      else if (categoryTab.value === 'materials') materialCates.value = res?.list || []
      else photoCates.value = res?.list || []
    } else if (activeTab.value === 'materials') {
      res = await adminApi.getAssets('materials', { ...assetQuery, page: adminPage.value, pageSize: adminPageSize.value }); materialAssets.value = res?.list || []
    } else if (activeTab.value === 'photos') {
      res = await adminApi.getAssets('photos', { ...assetQuery, page: adminPage.value, pageSize: adminPageSize.value }); photoAssets.value = res?.list || []
    } else if (activeTab.value === 'fonts') {
      res = await adminApi.getFonts(fontQuery)
      fonts.value = res?.list || []
      fontQuery.total = Number(res?.total) || 0
    } else if (activeTab.value === 'ai-settings') {
      res = await adminApi.getAiSettings()
      Object.assign(aiForm, res || {})
    }
    if (activeTab.value !== 'fonts') adminTotal.value = Number(res?.total) || 0
    if (res?.code === 401) {
      deny(res?.msg === '请先登录' ? '登录已失效，请重新登录' : '无管理员权限')
    }
  } catch (e: any) {
    ElMessage.error('数据加载失败')
  } finally {
    loading.value = false
  }
}

function jump2home() {
  window.location.href = './'
}

/** 在新窗口打开 PSD 导入页；type=1 表示创建组合（组件） */
function openPSDImport(type?: number) {
  const path = type === 1 ? '/psd?type=1' : '/psd'
  window.open(router.resolve(path).href, '_blank')
}

const extractDialog = reactive({ visible: false, source: null as any, prefix: '' })

/** 读取模板详情后，打开「提取元素」弹窗（预览、去重、选分类后入库） */
async function onExtractTemplate(row: any) {
  try {
    const detail: any = await getTempDetail({ id: row.id, type: Number(row.type) === 1 ? 1 : 0 })
    if (!detail?.data) return ElMessage.error('读取模板数据失败')
    extractDialog.source = detail.data
    extractDialog.prefix = row.title ? `${row.title} · ` : ''
    extractDialog.visible = true
  } catch (error: any) {
    ElMessage.error(error?.msg || error?.message || '读取模板数据失败')
  }
}

function onEditTemplate(row: any) {
  const href = router.resolve({ path: '/home', query: { tempid: String(row.id), tempType: String(row.type || 0), edit: '1' } }).href
  window.open(href, '_blank')
}

async function openCategoryEditor(row: any) {
  const type = Number(row.type) === 1 ? 1 : 0
  const res: any = await adminApi.getTemplateCategories(type, { page: 1, pageSize: 100 })
  categoryOptions.value = Array.isArray(res?.list) ? res.list : []
  categoryDialog.row = row
  categoryDialog.cate = row.cate || ''
  categoryDialog.visible = true
}

async function saveCategory() {
  const row = categoryDialog.row
  if (!row) return
  categoryDialog.submitting = true
  try {
    const res: any = await adminApi.updateTemplateCategory({ id: row.id, type: Number(row.type) === 1 ? 1 : 0, cate: categoryDialog.cate || '' })
    // 本弹窗只用于编辑，后端成功时返回 { code: 200 }（编辑无 result）。
    // 不再借 fontDialog.form.id 区分新增/编辑——那是字体弹窗的残留状态，与本行无关。
    if (res?.code === 200 || Number(res?.id) > 0) {
      row.cate = categoryDialog.cate || ''
      categoryDialog.visible = false
      ElMessage.success('分类已更新')
    } else ElMessage.error(res?.msg || '更新失败')
  } finally { categoryDialog.submitting = false }
}

async function onDelTemplate(row: any) {
  try {
    await ElMessageBox.confirm(`确认下架「${row.title || row.id}」？`, '提示', { type: 'warning' })
    const res: any = await adminApi.deleteTemplate(row.id)
    if (res?.code === 200) { ElMessage.success('已下架'); await loadTab() } else ElMessage.error(res?.msg || '操作失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

async function onRemoveTemplate(row: any) {
  try {
    await ElMessageBox.confirm(`确认永久删除「${row.title || row.id}」？删除后不可恢复。`, '危险操作', { type: 'warning' })
    const res: any = await adminApi.removeTemplate(row.id)
    if (res?.code === 200) { ElMessage.success('已删除'); await loadTab() } else ElMessage.error(res?.msg || '删除失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

async function onDelUserImage(row: any) {
  await ElMessageBox.confirm('确认删除该图片记录？（不会删除文件本体）', '提示', { type: 'warning' })
  const res: any = await adminApi.deleteUserImage(row.id)
  if (res?.code === 200) {
    ElMessage.success('已删除')
    loadTab()
  } else {
    ElMessage.error(res?.msg || '操作失败')
  }
}

async function onDelUser(row: adminApi.TAdminUserItem) {
  await ElMessageBox.confirm(`确认删除用户「${row.account}」？该操作不可恢复。`, '危险操作', { type: 'warning' })
  const res: any = await adminApi.deleteUser(row.id)
  if (res?.code === 200) {
    ElMessage.success('用户已删除')
    loadTab()
  } else {
    ElMessage.error(res?.msg || '删除失败')
  }
}

async function onDelDesign(row: adminApi.TAdminDesignItem) {
  await ElMessageBox.confirm(`确认删除用户「${row.account}」的作品「${row.title || row.id}」？`, '危险操作', { type: 'warning' })
  const res: any = await adminApi.deleteDesign(row.id)
  if (res?.code === 200) { ElMessage.success('作品已删除'); loadTab() } else ElMessage.error(res?.msg || '删除失败')
}

async function onDelCategory(type: 'materials' | 'photos', row: any) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name || row.cate}」？`, '提示', { type: 'warning' })
    const res: any = await adminApi.deleteCategory(type, row.cate)
    if (res?.code === 200) { ElMessage.success('已删除'); await loadTab() } else ElMessage.error(res?.msg || '操作失败')
  } catch (error) {
    // 用户取消确认时，Element Plus 会 reject Promise，这不是业务错误。
  }
}

async function onAddCategory(type: 'materials' | 'photos') {
  try {
    const result = await ElMessageBox.prompt('请输入分类名称', '新增分类', { inputValidator: (value) => value.trim() ? true : '分类名称不能为空' })
    const res: any = await adminApi.addCategory(type, result.value.trim())
    if (res?.code === 200) { ElMessage.success('分类创建成功'); await loadTab() } else ElMessage.error(res?.msg || '分类创建失败')
  } catch (error) {
    // 忽略取消操作，避免触发 Vue 的 unhandled component event handler。
  }
}

async function onRenameCategory(type: 'materials' | 'photos', row: any) {
  try {
    const result = await ElMessageBox.prompt('请输入新的分类名称', '重命名分类', { inputValue: row.name || row.cate, inputValidator: (value) => value.trim() ? true : '分类名称不能为空' })
    const res: any = await adminApi.renameCategory(type, row.cate, result.value.trim())
    if (res?.code === 200) { ElMessage.success('分类已重命名'); await loadTab() } else ElMessage.error(res?.msg || '分类重命名失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

async function addTemplateCategory() {
  if (!newTemplateCategory.name.trim()) return ElMessage.warning('请填写分类名称')
  const res: any = await adminApi.addTemplateCategory({ ...newTemplateCategory, type: templateCategoryType.value })
  if (res?.id) {
    newTemplateCategory.name = ''
    ElMessage.success('分类已创建')
    loadTab()
  } else ElMessage.error(res?.msg || '创建失败')
}

async function onDelTemplateCategory(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」？已有模板不会被删除。`, '提示', { type: 'warning' })
    const res: any = await adminApi.deleteTemplateCategory(row.id)
    res?.code === 200 ? (ElMessage.success('分类已删除'), await loadTab()) : ElMessage.error(res?.msg || '删除失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

async function onRenameTemplateCategory(row: any) {
  try {
    const result = await ElMessageBox.prompt('请输入新的分类名称', '重命名分类', { inputValue: row.name, inputValidator: (value) => value.trim() ? true : '分类名称不能为空' })
    const res: any = await adminApi.renameTemplateCategory({ id: row.id, name: result.value.trim() })
    if (res?.code === 200) { ElMessage.success('分类已重命名'); await loadTab() } else ElMessage.error(res?.msg || '重命名失败')
  } catch (error) {
    // 忽略取消操作。
  }
}

/** 提交新增字体：先过前端表单校验，再调接口 */
async function submitFont() {
  if (!fontFormRef.value) return
  try {
    await fontFormRef.value.validate()
  } catch (e) {
    return
  }
  fontDialog.submitting = true
  try {
    const data = {
      alias: fontDialog.form.alias.trim(),
      value: fontDialog.form.value.trim(),
      woff: fontDialog.form.woff.trim(),
      ttf: fontDialog.form.ttf.trim(),
      preview: fontDialog.form.preview.trim(),
      lang: fontDialog.form.lang,
      font_family: fontDialog.form.font_family.trim(),
      size: Number(fontDialog.form.size) || 0,
      woff_size: Number(fontDialog.form.woff_size) || 0,
    }
    const res: any = fontDialog.form.id
      ? await adminApi.updateFont({ ...data, id: fontDialog.form.id })
      : await adminApi.addFont(data)
    // 成功响应会被请求封装解包：新增返回 { id }，编辑无 result 时返回 { code: 200 }。
    if ((fontDialog.form.id && res?.code === 200) || (!fontDialog.form.id && Number(res?.id) > 0)) {
      ElMessage.success(fontDialog.form.id ? '修改成功' : '新增成功')
      fontDialog.visible = false
      // 清掉旧 localStorage 缓存（虽然当前 font store 已不再用 localStorage，但保留兜底清理）
      localStorage.removeItem('FONTS_VERSION')
      localStorage.removeItem('FONTS')
      await loadTab()
    } else {
      ElMessage.error(res?.msg || '新增失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '新增失败')
  } finally {
    fontDialog.submitting = false
  }
}

async function onDelFont(row: adminApi.TAdminFontItem) {
  await ElMessageBox.confirm(`确认删除字体「${row.alias || row.value || row.id}」？`, '提示', { type: 'warning' })
  const res: any = await adminApi.deleteFont(row.id)
  if (res?.code === 200) {
    ElMessage.success('已删除')
    localStorage.removeItem('FONTS_VERSION')
    localStorage.removeItem('FONTS')
    loadTab()
  } else {
    ElMessage.error(res?.msg || '操作失败')
  }
}

/** 保存 AI 配置：空密钥视为保留原值不清空（仅管理员可调用） */
async function saveAiSettings() {
  aiSaving.value = true
  try {
    const res: any = await adminApi.updateAiSettings({
      base_url: aiForm.base_url.trim(),
      api_key: aiForm.api_key.trim() || undefined,
      text_model: aiForm.text_model.trim(),
      image_model: aiForm.image_model.trim(),
      image_size_mode: aiForm.image_size_mode,
      enabled: aiForm.enabled,
    })
    if (res?.code === 200) {
      ElMessage.success('AI 配置已保存')
      await loadTab()
    } else {
      ElMessage.error(res?.msg || '保存失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    aiSaving.value = false
  }
}

/** 测试智谱连接：复用后台配置实际调一次 */
async function testAiConnection() {
  aiTesting.value = true
  try {
    const res: any = await adminApi.testAiConnection()
    // 成功响应会被请求封装解包为 { content }（无 code），失败则为 { code: 400, msg }
    if (res && typeof res.content === 'string') ElMessage.success('连接成功')
    else ElMessage.error(res?.msg || '连接失败')
  } catch (e: any) {
    ElMessage.error(e?.message || '连接失败')
  } finally {
    aiTesting.value = false
  }
}
</script>

<style lang="less" scoped>
/* ── 骨架：左侧导航 + 右侧（顶栏 + 可滚动内容区）────────────────────── */
.admin-shell {
  display: flex;
  height: 100vh;
  background: @color-canvas-page;
  color: @color-ink;
  overflow: hidden;
}
.admin-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}
.admin-body {
  flex: 1;
  min-height: 0;
  padding: 24px 28px 28px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* ── 白色内容托盘 ───────────────────────────────────────────────────── */
.pane {
  padding: 20px 22px;
  background: @color-canvas;
  border: 1px solid @color-hairline;
  border-radius: @radius-md;
  box-sizing: border-box;
  + .pane {
    margin-top: 16px;
  }
}
.pane-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: @color-ink-strong;
}
.pane-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  .toolbar-spacer { flex: 1; }
  .toolbar-note {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: @color-ink-muted;
  }
  .search-input { width: 260px; }
  .name-input { width: 200px; }
}

/* ── 总览页 ─────────────────────────────────────────────────────────── */
.overview-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* ── 表格统一样式（:deep 覆盖到 AdminTemplateTable 内部的表头）───────── */
.pane :deep(th.el-table__cell) {
  padding: 11px 0;
  background: @color-canvas-page;
  color: @color-ink-muted;
  font-weight: 600;
  font-size: 13px;
}
.pane :deep(td.el-table__cell) {
  padding: 9px 0;
  font-size: 13px;
}
.pane :deep(.el-table__empty-block) {
  min-height: 120px;
}

/* ── 通用文字 ───────────────────────────────────────────────────────── */
.muted-text {
  font-size: 12px;
  color: @color-ink-hint;
}
.link-primary {
  color: @color-primary;
  text-decoration: none;
  &:hover { color: @color-primary-hover; }
}

/* ── AI 设置表单 ────────────────────────────────────────────────────── */
.ai-form {
  max-width: 560px;
  margin-top: 4px;
}

/* ── 分页 ───────────────────────────────────────────────────────────── */
.admin-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 900px) {
  .admin-body { padding: 16px; }
  .overview-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quick-actions { grid-template-columns: 1fr; }
  .pane-toolbar {
    flex-wrap: wrap;
    .toolbar-spacer { display: none; }
  }
}
</style>
