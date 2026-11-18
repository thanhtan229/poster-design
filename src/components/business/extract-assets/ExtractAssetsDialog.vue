<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * @Description: 从模板中批量提取图片 / 矢量 / 相框 / 文字组合，预览去重后一次性入库
-->
<template>
  <el-dialog :model-value="modelValue" :title="t('admin.extractDialog.title')" width="760px" append-to-body @update:model-value="emit('update:modelValue', $event)" @open="onOpen">
    <div v-loading="state.loading" class="extract">
      <p v-if="!state.loading && !items.length" class="empty">{{ t('admin.extractDialog.empty') }}</p>

      <section v-for="group in groups" v-show="group.items.length" :key="group.kind" class="group">
        <header>
          <el-checkbox :model-value="isAllChecked(group.items)" :indeterminate="isIndeterminate(group.items)" @change="toggleAll(group.items, $event as boolean)">
            {{ group.label }} ({{ group.items.length }})
          </el-checkbox>
          <span class="spacer"></span>
          <span class="hint">{{ t('admin.extractDialog.saveTo') }}</span>
          <el-select v-model="state.cates[group.kind]" size="small" style="width: 160px" :placeholder="t('admin.extractDialog.selectCategory')">
            <template v-if="group.kind === 'text'">
              <el-option v-for="c in state.textCates" :key="c.id" :label="c.name" :value="c.name" />
            </template>
            <template v-else>
              <el-option v-for="c in state.materialCates" :key="c.cate" :label="c.name" :value="c.cate" />
            </template>
          </el-select>
        </header>
        <div class="grid">
          <label v-for="item in group.items" :key="item.key" :class="['cell', { exists: item.status !== 'new' }]">
            <el-checkbox v-model="item.checked" :disabled="item.status !== 'new'" />
            <el-image v-if="item.preview" :src="item.preview" fit="contain" class="thumb" />
            <div v-else class="thumb text-thumb">{{ item.title }}</div>
            <el-tag v-if="item.status === 'exists'" size="small" type="info">{{ t('admin.extractDialog.exists') }}</el-tag>
            <el-tag v-else-if="item.status === 'dup'" size="small" type="warning" class="dup-tag" :title="item.dupOf">{{ t('admin.extractDialog.duplicate', { name: item.dupOf }) }}</el-tag>
            <span v-else class="name">{{ item.title }}</span>
          </label>
        </div>
      </section>
    </div>
    <template #footer>
      <span class="summary">{{ state.loading ? t('admin.extractDialog.checking') : t('admin.extractDialog.summary', { added: selectedCount, exists: existsCount, dup: dupCount }) }}</span>
      <el-button @click="emit('update:modelValue', false)">{{ t('admin.extractDialog.cancel') }}</el-button>
      <el-button type="primary" :loading="state.submitting" :disabled="!selectedCount" @click="submit">{{ t('admin.extractDialog.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { reactive, computed } from 'vue'
import { ElDialog, ElButton, ElSelect, ElOption, ElCheckbox, ElImage, ElTag, ElMessage, vLoading } from 'element-plus'
import * as adminApi from '@/api/admin'
import i18n from '@/languages'
import { extractAssets } from '@/common/methods/extractAssets'

type TItem = { key: string; kind: 'image' | 'svg' | 'mask' | 'text'; title: string; preview: string; checked: boolean; status: 'new' | 'exists' | 'dup'; dupOf?: string; payload: any }

const t = (key: string, params?: Record<string, any>): string => i18n.global.t(key, params ?? {}) as string

const props = defineProps<{ modelValue: boolean; /** 模板数据：dLayouts 数组、JSON 字符串或组件元素数组 */ source: any; titlePrefix?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; done: [] }>()

const state = reactive({
  loading: false,
  submitting: false,
  materialCates: [] as any[],
  textCates: [] as any[],
  cates: { image: '', svg: '', mask: '', text: '' } as Record<string, string>,
})
const items = reactive<TItem[]>([])

const KIND_LABEL = (kind: string) => t(`admin.extractDialog.group${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)
const groups = computed(() => (['mask', 'image', 'svg', 'text'] as const).map((kind) => ({ kind, label: KIND_LABEL(kind), items: items.filter((i) => i.kind === kind) })))
const selectedCount = computed(() => items.filter((i) => i.status === 'new' && i.checked).length)
const existsCount = computed(() => items.filter((i) => i.status === 'exists').length)
const dupCount = computed(() => items.filter((i) => i.status === 'dup').length)

const isAllChecked = (list: TItem[]) => list.filter((i) => i.status === 'new').every((i) => i.checked)
const isIndeterminate = (list: TItem[]) => {
  const fresh = list.filter((i) => i.status === 'new')
  return fresh.some((i) => i.checked) && !fresh.every((i) => i.checked)
}
const toggleAll = (list: TItem[], v: boolean) => list.forEach((i) => {
    if (i.status === 'new') i.checked = v
  })

/** 素材库默认分类的 cate 与元素类型同名（png 对应 image），找不到则取第一个 */
function defaultMaterialCate(kind: string) {
  const want = kind === 'image' ? ['png', 'image'] : [kind]
  return state.materialCates.find((c) => want.includes(c.cate))?.cate || state.materialCates[0]?.cate || ''
}

const payloadOf = (kind: TItem['kind'], cate: string, item: TItem) => (kind === 'text' ? { cate, ...item.payload } : { cate, asset: item.payload })

async function onOpen() {
  state.loading = true
  items.splice(0)
  try {
    const [m, t]: any[] = await Promise.all([adminApi.getCategories('materials', { page: 1, pageSize: 100 }), adminApi.getTemplateCategories(1, { page: 1, pageSize: 100 })])
    state.materialCates = m?.list || []
    state.textCates = t?.list || []
    state.cates = { image: defaultMaterialCate('image'), svg: defaultMaterialCate('svg'), mask: defaultMaterialCate('mask'), text: state.textCates[0]?.name || '' }

    const { materials, texts } = extractAssets(props.source, props.titlePrefix || '', { image: t('admin.extractDialog.nameImage'), svg: t('admin.extractDialog.nameSvg'), mask: t('admin.extractDialog.nameMask'), group: t('admin.extractDialog.nameGroup') })
    const list: TItem[] = [
      ...materials.map(
        (x): TItem => ({
          key: x.key,
          kind: x.type,
          title: x.title,
          preview: x.url,
          checked: true,
          status: 'new',
          payload: { type: x.type, url: x.url, thumb: x.url, title: x.title, width: x.width, height: x.height, ...(x.type === 'svg' ? { model: '{}' } : {}) },
        }),
      ),
      ...texts.map((x): TItem => ({ key: x.key, kind: 'text', title: x.title, preview: '', checked: true, status: 'new', payload: { title: x.title, widgets: x.widgets, width: x.width, height: x.height } })),
    ]
    if (list.length) {
      // 预检：让服务端按库内已有数据判定哪些已存在（dryRun 不写库）
      const mats = list.filter((i) => i.kind !== 'text')
      const txts = list.filter((i) => i.kind === 'text')
      // 服务端同时按 URL 与图像内容判重：已在库 → exists；本批次内相同 → dup（dupOf 为靠前那一项的下标）
      const check = await adminApi.bulkImportAssets({
        dryRun: true,
        materials: mats.map((i) => payloadOf(i.kind, state.cates[i.kind] || 'x', i) as any),
        texts: txts.map((i) => payloadOf('text', state.cates.text, i) as any),
      })
      check?.materials?.forEach((r, idx) => {
        if (!mats[idx]) return
        if (r.status === 'exists') Object.assign(mats[idx], { status: 'exists', checked: false })
        else if (r.status === 'dup') Object.assign(mats[idx], { status: 'dup', checked: false, dupOf: mats[r.dupOf ?? -1]?.title })
      })
      check?.texts?.forEach((r, idx) => {
        if (r.status === 'exists' && txts[idx]) Object.assign(txts[idx], { status: 'exists', checked: false })
      })
    }
    items.push(...list)
  } catch (error: any) {
    ElMessage.error(error?.msg || error?.message || t('admin.extractDialog.readFail'))
  } finally {
    state.loading = false
  }
}

async function submit() {
  const chosen = items.filter((i) => i.status === 'new' && i.checked)
  const missing = chosen.find((i) => !state.cates[i.kind])
  if (missing) return ElMessage.warning(t('admin.extractDialog.pickCategory', { group: KIND_LABEL(missing.kind) }))
  state.submitting = true
  try {
    const res = await adminApi.bulkImportAssets({
      materials: chosen.filter((i) => i.kind !== 'text').map((i) => payloadOf(i.kind, state.cates[i.kind], i) as any),
      texts: chosen.filter((i) => i.kind === 'text').map((i) => payloadOf('text', state.cates.text, i) as any),
    })
    const all = [...(res?.materials || []), ...(res?.texts || [])]
    const added = all.filter((r) => r.status === 'added').length
    const skipped = all.filter((r) => r.status === 'exists' || r.status === 'dup').length
    const failed = all.length - added - skipped
    ElMessage[failed ? 'warning' : 'success'](`${t('admin.extractDialog.done', { added })}${skipped ? t('admin.extractDialog.skipped', { n: skipped }) : ''}${failed ? t('admin.extractDialog.failed', { n: failed }) : ''}`)
    emit('done')
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.msg || error?.message || t('admin.extractDialog.importFail'))
  } finally {
    state.submitting = false
  }
}
</script>

<style lang="less" scoped>
.extract {
  min-height: 120px;
  max-height: 60vh;
  overflow: auto;
}
.empty {
  color: #888;
  text-align: center;
  padding: 32px 0;
}
.group {
  margin-bottom: 16px;
}
.group header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.spacer {
  flex: 1;
}
.hint {
  color: #888;
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 110px);
  gap: 10px;
}
.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  cursor: pointer;
}
.cell.exists {
  opacity: 0.55;
}
.cell :deep(.el-checkbox) {
  position: absolute;
  top: 4px;
  left: 6px;
  z-index: 1;
}
.thumb {
  width: 96px;
  height: 72px;
  background: #f4f5f7;
  border-radius: 4px;
}
.text-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
  text-align: center;
}
.dup-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  justify-content: flex-start;
}
.name {
  font-size: 12px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary {
  float: left;
  line-height: 32px;
  color: #888;
  font-size: 12px;
}
</style>
