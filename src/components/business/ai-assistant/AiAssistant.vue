<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * @Description: AI 助手面板：文案生成 / 文生图 / 智能配色
-->
<template>
  <el-dialog v-model="state.show" :title="$t('tinix.menu.ai')" align-center width="780" :append-to-body="true" destroy-on-close @close="handleClose">
    <el-tabs v-model="state.activeTab" class="ai-tabs">
      <!-- [TINIX] TinixPoster AI tabs -->
      <el-tab-pane label="Gợi ý chữ" name="suggest" lazy><TinixSuggestTab /></el-tab-pane>
      <el-tab-pane label="Sửa chữ" name="rewrite" lazy><TinixRewriteTab /></el-tab-pane>
      <el-tab-pane label="Tìm font" name="font" lazy><TinixFontTab /></el-tab-pane>
      <!-- 文案生成 -->
      <el-tab-pane label="Viết chữ" name="text">
        <div class="ai-row">
          <el-input v-model="state.textPrompt" type="textarea" :rows="3" placeholder="输入海报主题，如：夏季冰饮新品上市" />
        </div>
        <div class="ai-row ai-options">
          <span class="ai-label">风格</span>
          <el-select v-model="state.textStyle" size="small" style="width: 160px">
            <el-option v-for="s in styleList" :key="s" :label="s" :value="s" />
          </el-select>
          <el-button size="small" type="primary" :loading="state.textLoading" @click="generateText">{{ state.textLoading ? '生成中..' : '生成文案' }}</el-button>
        </div>
        <div v-if="state.textList.length" class="ai-result">
          <div v-for="(item, index) in state.textList" :key="'t' + index" class="ai-result-item">
            <div class="ai-result-text">{{ item }}</div>
            <el-button size="small" type="primary" plain @click="insertText(item)">插入画布</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 文生图 -->
      <el-tab-pane label="Tạo ảnh" name="image">
        <div class="ai-row">
          <el-input v-model="state.imagePrompt" type="textarea" :rows="3" placeholder="输入图片描述，如：简约风格的夏日饮品促销背景，蓝绿色调" />
        </div>
        <div class="ai-row ai-options">
          <span class="ai-label">比例</span>
          <el-select v-model="state.imageRatio" size="small" style="width: 160px">
            <el-option v-for="r in ratioList" :key="r" :label="r" :value="r" />
          </el-select>
          <el-button size="small" type="primary" :loading="state.imageLoading" @click="generateImage">{{ state.imageLoading ? '生成中(请等待约5-20s)..' : '生成图片' }}</el-button>
        </div>
        <div v-if="state.imageUrl" class="ai-result image-preview">
          <img :src="state.imageUrl" alt="AI 生成图" />
          <el-button size="small" type="primary" @click="insertImage">插入画布</el-button>
        </div>
      </el-tab-pane>

      <!-- 智能配色 -->
      <el-tab-pane label="Gợi ý màu" name="color">
        <div class="ai-row">
          <el-input v-model="state.colorPrompt" type="textarea" :rows="2" placeholder="输入配色主题，如：清爽的夏日感 / 复古国潮风" />
        </div>
        <div class="ai-row ai-options">
          <el-button size="small" type="primary" :loading="state.colorLoading" @click="generateColor">{{ state.colorLoading ? '生成中..' : '生成配色' }}</el-button>
        </div>
        <div v-if="state.colorList.length" class="ai-result">
          <div class="ai-color-list">
            <div v-for="(item, index) in state.colorList" :key="'c' + index" class="ai-color-item">
              <span class="ai-color-block" :style="{ backgroundColor: item.value }" @click="copyColor(item.value)" />
              <div class="ai-color-info">
                <div class="ai-color-name">{{ item.name }}</div>
                <div class="ai-color-value">{{ item.value }}</div>
              </div>
            </div>
          </div>
          <div class="ai-color-footer">
            <el-button size="small" plain @click="copyAllColors">复制全部色值</el-button>
            <el-button size="small" type="primary" @click="applyBackground">应用到画布背景</el-button>
          </div>
        </div>
      </el-tab-pane>
      <!-- [TINIX] -->
      <el-tab-pane label="Lịch sử" name="history" lazy><TinixHistoryTab /></el-tab-pane>
      <el-tab-pane label="Cài đặt AI" name="settings" lazy><TinixSettingsTab /></el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ElTabs, ElTabPane, ElSelect, ElOption } from 'element-plus'
import api from '@/api'
import { useWidgetStore, useCanvasStore, useUserStore, useControlStore } from '@/store'
import { storeToRefs } from 'pinia'
import { wTextSetting } from '@/components/modules/widgets/wText/wTextSetting'
import wImageSetting from '@/components/modules/widgets/wImage/wImageSetting'
import { TAiColorItem } from '@/api/ai'
// [TINIX] TinixPoster AI tabs
import TinixSuggestTab from './TinixSuggestTab.vue'
import TinixRewriteTab from './TinixRewriteTab.vue'
import TinixFontTab from './TinixFontTab.vue'
import TinixHistoryTab from './TinixHistoryTab.vue'
import TinixSettingsTab from './TinixSettingsTab.vue'

const styleList = ['营销', '简约', '文艺', '科技', '国潮']
const ratioList = ['1:1', '3:4', '4:3', '9:16', '16:9']

const state = reactive({
  show: false,
  activeTab: 'suggest', // [TINIX]
  // 文案
  textPrompt: '',
  textStyle: '营销',
  textLoading: false,
  textList: [] as string[],
  // 图片
  imagePrompt: '',
  imageRatio: '1:1',
  imageLoading: false,
  imageUrl: '',
  imageSize: { width: 0, height: 0 },
  // 配色
  colorPrompt: '',
  colorLoading: false,
  colorList: [] as TAiColorItem[],
})

const widgetStore = useWidgetStore()
const canvasStore = useCanvasStore()
const userStore = useUserStore()
const { dPage } = storeToRefs(canvasStore)

function checkLogin(): boolean {
  if (userStore.online) return true
  ElMessage.warning('请先登录后再使用 AI 功能')
  return false
}

function open() {
  // 清理选中框，避免 moveable 操作框遮挡弹窗（与其他弹窗行为一致）
  useControlStore().setShowMoveable(false)
  state.show = true
}

function handleClose() {
  state.activeTab = 'suggest' // [TINIX]
  // 关闭后恢复选中框显示
  useControlStore().setShowMoveable(true)
}

// ---------- 文案生成 ----------
async function generateText() {
  if (!checkLogin()) return
  const prompt = state.textPrompt.trim()
  if (!prompt) return ElMessage.warning('请输入海报主题')
  state.textLoading = true
  try {
    const res: any = await api.ai.textGenerate({ prompt, style: state.textStyle })
    // 接口异常（如未配置密钥）时透传真实提示
    if (res?.code !== 200) { ElMessage.warning(res?.msg || '文案生成失败'); return }
    state.textList = res?.list || []
    if (!state.textList.length) ElMessage.warning('AI 暂未生成有效文案，请换个主题试试')
  } catch (e: any) {
    ElMessage.error(e?.message || '文案生成失败')
  } finally {
    state.textLoading = false
  }
}

function insertText(text: string) {
  const setting = JSON.parse(JSON.stringify(wTextSetting))
  setting.text = text
  const { width: pW, height: pH } = dPage.value
  setting.fontSize = 48
  setting.width = setting.fontSize * text.length
  setting.left = pW / 2 - setting.width / 2
  setting.top = pH / 2 - setting.fontSize / 2
  widgetStore.addWidget(setting)
  ElMessage.success('已插入画布')
}

// ---------- 文生图 ----------
async function generateImage() {
  if (!checkLogin()) return
  const prompt = state.imagePrompt.trim()
  if (!prompt) return ElMessage.warning('请输入图片描述')
  state.imageLoading = true
  state.imageUrl = ''
  try {
    const res: any = await api.ai.imageGenerate({ prompt, ratio: state.imageRatio }, { _noLoading: true, timeout: 90000 })
    // 接口异常（如未配置密钥）时透传真实提示
    if (res?.code !== 200) { ElMessage.warning(res?.msg || '图片生成失败'); return }
    state.imageUrl = res.url
    state.imageSize = { width: Number(res.width) || 0, height: Number(res.height) || 0 }
  } catch (e: any) {
    ElMessage.error(e?.message || '图片生成失败')
  } finally {
    state.imageLoading = false
  }
}

async function insertImage() {
  if (!state.imageUrl) return
  const setting = JSON.parse(JSON.stringify(wImageSetting))
  const { width: w, height: h } = state.imageSize
  const { width: pW, height: pH } = dPage.value
  // 按画布大小等比缩放，控制插入尺寸
  const ratio = Math.min(pW / (w || 1), pH / (h || 1), 1)
  setting.width = Math.round((w || 300) * ratio)
  setting.height = Math.round((h || 300) * ratio)
  setting.imgUrl = state.imageUrl
  setting.left = pW / 2 - setting.width / 2
  setting.top = pH / 2 - setting.height / 2
  widgetStore.addWidget(setting)
  ElMessage.success('已插入画布')
}

// ---------- 智能配色 ----------
async function generateColor() {
  if (!checkLogin()) return
  const prompt = state.colorPrompt.trim()
  if (!prompt) return ElMessage.warning('请输入配色主题')
  state.colorLoading = true
  try {
    const res: any = await api.ai.colorSuggest({ prompt })
    // 接口异常（如未配置密钥）时透传真实提示
    if (res?.code !== 200) { ElMessage.warning(res?.msg || '配色生成失败'); return }
    state.colorList = res.colors || []
    if (!state.colorList.length) ElMessage.warning('AI 暂未生成有效配色，请换个主题试试')
  } catch (e: any) {
    ElMessage.error(e?.message || '配色生成失败')
  } finally {
    state.colorLoading = false
  }
}

function copyColor(value: string) {
  navigator.clipboard?.writeText(value)
  ElMessage.success(`已复制 ${value}`)
}

function copyAllColors() {
  const values = state.colorList.map((item) => item.value).join(' ')
  navigator.clipboard?.writeText(values)
  ElMessage.success('已复制全部色值')
}

function applyBackground() {
  const main = state.colorList[0]
  if (!main) return
  dPage.value.backgroundColor = main.value
  ElMessage.success(`已将主色 ${main.value} 应用到画布背景`)
}

defineExpose({ open })
</script>

<style lang="less" scoped>
.ai-row {
  margin-bottom: 0.8rem;
  &.ai-options {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}
.ai-label {
  font-size: 13px;
  color: #666;
  flex-shrink: 0;
}
.ai-result {
  margin-top: 0.5rem;
  max-height: 470px;
  overflow-y: auto;
  .ai-result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.5rem;
    border-radius: 6px;
    background: #f6f7f9;
    margin-bottom: 0.5rem;
    .ai-result-text {
      font-size: 14px;
      color: #333;
      line-height: 1.5;
    }
  }
  &.image-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    img {
      max-width: 100%;
      max-height: 320px;
      border-radius: 6px;
    }
  }
}
.ai-color-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}
.ai-color-item {
  width: calc(33.333% - 0.4rem);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  .ai-color-block {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    cursor: pointer;
    flex-shrink: 0;
  }
  .ai-color-info {
    .ai-color-name {
      font-size: 12px;
      color: #333;
    }
    .ai-color-value {
      font-size: 11px;
      color: #999;
    }
  }
}
.ai-color-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
// 让三个功能 Tab 更醒目
.ai-tabs {
  :deep(.el-tabs__nav-wrap::after) {
    height: 2px;
    background-color: #e4e7ed;
  }
  :deep(.el-tabs__item) {
    font-size: 15px;
    font-weight: 600;
    color: #909399;
    padding: 0 24px;
    height: 44px;
    line-height: 44px;
    &.is-active {
      color: @color-primary;
    }
    &:hover {
      color: @color-primary-hover;
    }
  }
  :deep(.el-tabs__active-bar) {
    height: 3px;
    background-color: @color-primary;
    border-radius: 2px;
  }
  :deep(.el-tabs__content) {
    padding-top: 14px;
  }
}
</style>
