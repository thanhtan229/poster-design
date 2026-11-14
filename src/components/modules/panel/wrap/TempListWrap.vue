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
 * @Date: 2021-08-27 15:16:07
 * @Description: 模板列表
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @Date: 2024-03-06 21:16:00
-->
<template>
  <div class="wrap">
    <search-header v-model="state.searchKeyword" type="none" @change="cateChange" /><!-- [TINIX] type="none": bỏ menu nhóm ẩn, dùng thanh nhóm bên dưới -->
    <tinix-group-bar ref="groupBarRef" v-model="groupId" :is-admin="isAdmin" :select-mode="selectMode" @change="onGroupChange" @changed="load(true, pageOptions.state)" @toggle-select="toggleSelect" @suggest="openSuggest" />

    <!-- [TINIX] chế độ chọn nhiều: thanh thao tác -->
    <div v-if="selectMode" class="tinix-select-bar">
      <span>{{ $t('tinix.ui.templateGroups.da_chon', { n: selected.length }) }}</span>
      <el-button size="small" link @click="selectAllVisible">{{ $t('tinix.ui.templateGroups.chon_het') }}</el-button>
      <el-button size="small" link :disabled="!selected.length" @click="selected = []">{{ $t('tinix.ui.templateGroups.bo_chon') }}</el-button>
      <el-button size="small" type="primary" :disabled="!selected.length" @click="openBulkDialog">{{ $t('tinix.ui.templateGroups.gan_nhom') }}</el-button>
    </div>

    <el-divider v-show="state.title" style="margin-top: 1.7rem" content-position="left">
      <span style="font-weight: 600">{{ state.title }}</span>
    </el-divider>

    <ul ref="listRef" v-infinite-scroll="load" class="infinite-list" :infinite-scroll-distance="150" style="overflow: auto">
      <img-water-fall :listData="state.list" :admin-edit="isAdmin" :select-mode="selectMode" :selected="selected" @select="selectItem" @edit="editTemplate" @remove="removeTemplate" @groups="openGroupDialog" @toggle="toggleItem" /><!-- [TINIX] admin: nút Sửa mẫu -->
      <div v-show="state.loading" class="loading"><i class="el-icon-loading"></i> {{ $t('common.loadingMore') }}</div>
      <div v-show="state.loadDone" class="loading">Đã tải hết</div>
    </ul>

    <!-- [TINIX] Hộp chọn nhóm: một mẫu (hộp tick) hoặc nhiều mẫu (thêm vào / gỡ khỏi) -->
    <el-dialog v-model="groupDialog.visible" :title="groupDialog.mode === 'bulk' ? $t('tinix.ui.templateGroups.gan_nhom_nhieu', { n: selected.length }) : $t('tinix.ui.templateGroups.nhom_tieu_de')" width="340px" append-to-body>
      <div v-if="!allGroups.length" class="tinix-empty">{{ $t('tinix.ui.templateGroups.chua_co_nhom') }}</div>
      <template v-else-if="groupDialog.mode === 'single'">
        <el-checkbox-group v-model="groupDialog.ids" class="tinix-check-list">
          <el-checkbox v-for="g in allGroups" :key="g.id" :value="g.id">{{ g.name }}</el-checkbox>
        </el-checkbox-group>
      </template>
      <template v-else>
        <div class="tinix-sub">{{ $t('tinix.ui.templateGroups.them_vao_nhom') }}</div>
        <el-checkbox-group v-model="groupDialog.add" class="tinix-check-list">
          <el-checkbox v-for="g in allGroups" :key="'a' + g.id" :value="g.id">{{ g.name }}</el-checkbox>
        </el-checkbox-group>
        <div class="tinix-sub">{{ $t('tinix.ui.templateGroups.go_khoi_nhom') }}</div>
        <el-checkbox-group v-model="groupDialog.remove" class="tinix-check-list">
          <el-checkbox v-for="g in allGroups" :key="'r' + g.id" :value="g.id">{{ g.name }}</el-checkbox>
        </el-checkbox-group>
      </template>
      <template #footer>
        <el-button @click="groupDialog.visible = false">{{ $t('tinix.ui.templateGroups.huy') }}</el-button>
        <el-button type="primary" :loading="groupDialog.saving" :disabled="!allGroups.length" @click="saveGroupDialog">{{ $t('tinix.ui.templateGroups.luu') }}</el-button>
      </template>
    </el-dialog>

    <!-- [TINIX] Gợi ý nhóm theo tên mẫu (xem lại rồi mới áp dụng) -->
    <el-dialog v-model="suggest.visible" :title="$t('tinix.ui.templateGroups.goi_y_tieu_de')" width="460px" append-to-body>
      <div v-loading="suggest.loading" class="tinix-suggest">
        <template v-if="!suggest.loading && !suggest.items.length">
          <div class="tinix-empty">{{ $t('tinix.ui.templateGroups.goi_y_khong_co') }}</div>
        </template>
        <template v-else-if="!suggest.loading">
          <div class="tinix-note">{{ $t('tinix.ui.templateGroups.goi_y_tom_tat', { n: suggest.items.length, unmatched: suggest.unmatched }) }}</div>
          <div v-if="suggest.toCreate.length" class="tinix-note">{{ $t('tinix.ui.templateGroups.goi_y_se_tao', { list: suggest.toCreate.join(', ') }) }}</div>
          <div class="tinix-note dim">{{ $t('tinix.ui.templateGroups.goi_y_ghi_chu') }}</div>
          <div class="tinix-suggest-list">
            <label v-for="it in suggest.items" :key="it.id" class="tinix-suggest-row">
              <el-checkbox :model-value="suggest.checked.includes(it.id)" @change="toggleSuggest(it.id)" />
              <img :src="it.cover" alt="" />
              <span class="title">{{ it.title }}</span>
              <el-tag v-for="g in it.groups" :key="g" size="small" effect="plain">{{ g }}</el-tag>
            </label>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="suggest.visible = false">{{ $t('tinix.ui.templateGroups.huy') }}</el-button>
        <el-button type="primary" :loading="suggest.applying" :disabled="!suggest.checked.length" @click="applySuggest">{{ $t('tinix.ui.templateGroups.goi_y_ap_dung', { n: suggest.checked.length }) }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import i18n from '@/languages'
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import api from '@/api'

import { LocationQueryValue, useRoute, useRouter } from 'vue-router'
// import chooseType from './components/chooseType.vue'
// import editModel from './components/editModel.vue'
import searchHeader from './components/searchHeader.vue'
import useConfirm from '@/common/methods/confirm'
// import { useSetupMapGetters } from '@/common/hooks/mapGetters'
import imgWaterFall from './components/imgWaterFall.vue'
import { IGetTempListData } from '@/api/home'
import { useControlStore, useCanvasStore, useUserStore, useHistoryStore, useWidgetStore, useForceStore } from '@/store'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox, ElDialog, ElCheckbox, ElCheckboxGroup, ElButton, ElTag } from 'element-plus' // [TINIX]
import * as adminApi from '@/api/admin' // [TINIX]
import TinixGroupBar from './components/TinixGroupBar.vue' // [TINIX]
import { apiFailed, apiMessage } from '@/utils/tinix/api-result' // [TINIX]

type TState = {
  loading: boolean
  loadDone: boolean
  list: IGetTempListData[]
  title: string
  searchKeyword: string
}

type TPageOptions = {
  page: number
  pageSize: number
  cate: number | string
  state?: string
}

const listRef = ref<HTMLElement | null>(null)
const route = useRoute()
const router = useRouter()

const controlStore = useControlStore()

const userStore = useUserStore()
const pageStore = useCanvasStore()
const widgetStore = useWidgetStore()
const forceStore = useForceStore()
const state = reactive<TState>({
  loading: false,
  loadDone: false,
  list: [],
  title: 'Mẫu thiết kế', // [TINIX] 示例模板
  searchKeyword: '',
})

// const { tempEditing } = useSetupMapGetters(['tempEditing'])
const { dHistoryParams } = storeToRefs(useHistoryStore())

const pageOptions: TPageOptions = { page: 0, pageSize: 20, cate: '' }
const { cate, edit } = route.query
cate && (pageOptions.cate = (cate as LocationQueryValue) ?? 1)
// 模板编辑为管理员能力，仅管理员角色可进入编辑态（数据侧由后端 requireAdmin 兜底）
const isAdmin = (() => {
  try {
    return JSON.parse(localStorage.getItem('xp_user') || 'null')?.role === 1
  } catch {
    return false
  }
})()
edit && isAdmin && userStore.managerEdit(true)

// [TINIX] Sửa mẫu ngay từ thẻ Mẫu thiết kế: mở tab mới ở chế độ sửa (giống nút "Sửa" ở trang quản trị); không đụng thiết kế đang mở
// [TINIX] Xóa vĩnh viễn một mẫu (có xác nhận). Thiết kế đã tạo từ mẫu này không bị ảnh hưởng (là bản sao).
async function removeTemplate(item: IGetTempListData) {
  try {
    await ElMessageBox.confirm(i18n.global.t('tinix.ui.templateCard.xac_nhan_xoa', { name: item.title || item.id }), i18n.global.t('tinix.ui.templateCard.xoa_mau_tieu_de'), {
      type: 'warning',
      confirmButtonText: i18n.global.t('tinix.ui.templateCard.xoa_mau'),
      cancelButtonText: i18n.global.t('common.cancel'),
    })
  } catch (e) {
    return // bấm Hủy
  }
  try {
    const res: any = await adminApi.removeTemplate(Number(item.id))
    if (apiFailed(res)) return ElMessage.error(apiMessage(res, i18n.global.t('tinix.ui.templateCard.xoa_that_bai'))) // lỗi nghiệp vụ không ném lỗi
    ElMessage.success(i18n.global.t('tinix.ui.templateCard.da_xoa'))
    window.dispatchEvent(new Event('tinix:templates-changed')) // làm mới danh sách + số đếm nhóm
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || i18n.global.t('tinix.ui.templateCard.xoa_that_bai'))
  }
}

// ── [TINIX] Nhóm mẫu (một mẫu thuộc nhiều nhóm) ──
const groupBarRef = ref<any>(null)
const groupId = ref<number | 'none'>(0)
const selectMode = ref(false)
const selected = ref<number[]>([])
const allGroups = computed<Array<{ id: number; name: string }>>(() => (groupBarRef.value && groupBarRef.value.groups) || [])
const groupDialog = reactive({ visible: false, mode: 'single' as 'single' | 'bulk', saving: false, item: null as IGetTempListData | null, ids: [] as number[], add: [] as number[], remove: [] as number[] })
const suggest = reactive({ visible: false, loading: false, applying: false, items: [] as adminApi.TGroupSuggestion[], unmatched: 0, toCreate: [] as string[], checked: [] as number[] })
const tt = (k: string, p?: any) => i18n.global.t(k, p) as string

function onGroupChange(g: { id: number | 'none'; name: string }) {
  state.title = g.name || 'Mẫu thiết kế'
  pageOptions.cate = g.id === 0 ? '' : g.id
  selected.value = []
  load(true, pageOptions.state)
}
function toggleSelect() {
  selectMode.value = !selectMode.value
  selected.value = []
}
function toggleItem(item: IGetTempListData) {
  selected.value = selected.value.includes(item.id) ? selected.value.filter((x) => x !== item.id) : selected.value.concat(item.id)
}
function selectAllVisible() {
  selected.value = state.list.map((x) => x.id)
}
function openGroupDialog(item: IGetTempListData) {
  Object.assign(groupDialog, { visible: true, mode: 'single', item, ids: [...(item.groups || [])], saving: false })
  groupBarRef.value && groupBarRef.value.reload()
}
function openBulkDialog() {
  Object.assign(groupDialog, { visible: true, mode: 'bulk', item: null, add: [], remove: [], saving: false })
  groupBarRef.value && groupBarRef.value.reload()
}
async function saveGroupDialog() {
  groupDialog.saving = true
  try {
    const res: any =
      groupDialog.mode === 'single' && groupDialog.item
        ? await adminApi.setTemplateGroups(Number(groupDialog.item.id), groupDialog.ids)
        : await adminApi.bulkTemplateGroups(selected.value, groupDialog.add, groupDialog.remove)
    if (apiFailed(res)) return ElMessage.error(apiMessage(res, tt('tinix.ui.templateGroups.that_bai')))
    ElMessage.success(tt('tinix.ui.templateGroups.da_luu'))
    groupDialog.visible = false
    if (groupDialog.mode === 'bulk') selected.value = []
    window.dispatchEvent(new Event('tinix:templates-changed')) // làm mới danh sách + số đếm nhóm
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || tt('tinix.ui.templateGroups.that_bai'))
  } finally {
    groupDialog.saving = false
  }
}
async function openSuggest() {
  Object.assign(suggest, { visible: true, loading: true, items: [], unmatched: 0, toCreate: [], checked: [] })
  try {
    const res: any = await adminApi.suggestTemplateGroups()
    if (apiFailed(res)) throw new Error(apiMessage(res, tt('tinix.ui.templateGroups.that_bai')))
    Object.assign(suggest, { items: res.items || [], unmatched: res.unmatched || 0, toCreate: res.toCreate || [], checked: (res.items || []).map((i: any) => i.id) })
  } catch (e: any) {
    ElMessage.error(e?.message || tt('tinix.ui.templateGroups.that_bai'))
    suggest.visible = false
  } finally {
    suggest.loading = false
  }
}
function toggleSuggest(id: number) {
  suggest.checked = suggest.checked.includes(id) ? suggest.checked.filter((x) => x !== id) : suggest.checked.concat(id)
}
async function applySuggest() {
  suggest.applying = true
  try {
    const res: any = await adminApi.applyTemplateGroupSuggestions(suggest.checked)
    if (apiFailed(res)) return ElMessage.error(apiMessage(res, tt('tinix.ui.templateGroups.that_bai')))
    suggest.visible = false
    ElMessage.success(res.created && res.created.length ? tt('tinix.ui.templateGroups.goi_y_ket_qua', { assigned: res.assigned, created: res.created.join(', ') }) : tt('tinix.ui.templateGroups.goi_y_ket_qua_khong_tao', { assigned: res.assigned }))
    window.dispatchEvent(new Event('tinix:templates-changed'))
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || tt('tinix.ui.templateGroups.that_bai'))
  } finally {
    suggest.applying = false
  }
}

function editTemplate(item: IGetTempListData) {
  const href = router.resolve({ path: '/home', query: { tempid: String(item.id), tempType: '0', edit: '1' } }).href
  window.open(href, '_blank')
}

// onMounted(async () => {})

// [TINIX] "Tệp → Lưu thành mẫu" phát sự kiện này: tải lại danh sách để thấy mẫu mới ngay
const onTemplatesChanged = () => load(true, pageOptions.state)
onMounted(() => window.addEventListener('tinix:templates-changed', onTemplatesChanged))
onBeforeUnmount(() => window.removeEventListener('tinix:templates-changed', onTemplatesChanged))

let reloadPending = false // [TINIX] có yêu cầu làm mới khi đang tải dở
const load = async (init: boolean = false, stat?: string) => {
  stat && (pageOptions.state = stat)
  if (init && state.loading) {
    // [TINIX] hai lần làm mới liên tiếp (vd lưu nhóm + sự kiện tinix:templates-changed) từng làm danh sách trống: lần sau bị bỏ qua sau khi đã xóa danh sách
    reloadPending = true
    return
  }

  if (init && listRef.value) {
    listRef.value.scrollTop = 0
    state.list = []
    pageOptions.page = 0
    state.loadDone = false
  }
  if (state.loadDone || state.loading) {
    return
  }

  state.loading = true
  pageOptions.page += 1

  const res = await api.home.getTempList({ search: state.searchKeyword, ...pageOptions })
  res.list.length <= 0 && (state.loadDone = true)
  state.list = state.list.concat(res.list)
  setTimeout(() => {
    state.loading = false
    if (reloadPending) {
      reloadPending = false
      load(true, pageOptions.state)
      return
    }
    checkHeight()
  }, 100)
}

// 当首屏内容不足以填满容器时，继续加载下一页，避免出现空白区域
function checkHeight() {
  if (!listRef.value || state.loadDone) return
  const content = listRef.value.firstElementChild as HTMLElement | null
  if (content && listRef.value.offsetHeight > content.offsetHeight) load()
}

function cateChange(type: any) {
  state.title = type.name
  const init = pageOptions.cate != type.id
  pageOptions.cate = type.id
  load(init, pageOptions.state)
}

let hideReplacePrompt: any = localStorage.getItem('hide_replace_prompt')
async function selectItem(item: IGetTempListData) {
  controlStore.setShowMoveable(false) // 清理掉上一次的选择框
  if (!hideReplacePrompt && dHistoryParams.value.length > 0) {
    const doNotPrompt = await useConfirm('Dùng mẫu', 'Nội dung mẫu sẽ thay thế trang hiện tại', 'warning', { confirmButtonText: 'Đã hiểu', cancelButtonText: 'Không nhắc lại' }) // [TINIX]
    if (!doNotPrompt) {
      localStorage.setItem('hide_replace_prompt', '1')
      hideReplacePrompt = true
    }
  }
  userStore.managerEdit(false)
  widgetStore.setDWidgets([])
  setTempId(item.id)

  let result = null
  if (!item.data) {
    const res = await api.home.getTempDetail({ id: item.id })
    result = JSON.parse(res.data)
  } else {
    result = JSON.parse(item.data)
  }
  if (Array.isArray(result)) {
    const { global, layers } = result[0]
    pageStore.setDPage(global)
    widgetStore.setTemplate(layers)
  } else {
    const { page, widgets } = result
    pageStore.setDPage(page)
    widgetStore.setTemplate(widgets)
  }
  setTimeout(() => {
    forceStore.setZoomScreenChange()
  }, 300)
  widgetStore.selectWidget({
    uuid: '-1',
  })
}

function setTempId(tempId: number | string) {
  // 选择新模板时清除旧作品 id，避免下载/截图接口按 id 优先加载旧作品。
  router.push({ path: '/home', query: { tempid: tempId }, replace: true })
}

defineExpose({
  load,
  cateChange,
  listRef,
})
</script>

<style lang="less" scoped>
.wrap {
  width: 100%;
  height: 100%;
}

.tinix-select-bar {
  display: flex;
  flex-wrap: wrap; /* panel hẹp: các nút xuống dòng thay vì tràn ra ngoài */
  align-items: center;
  gap: 4px 10px;
  span {
    white-space: nowrap;
  }
  margin: 10px 1rem 0 14px;
  padding: 6px 10px;
  font-size: 12px;
  color: #3f6af7;
  background: #eef2ff;
  border-radius: 6px;
}
.tinix-sub {
  margin: 8px 0 4px;
  font-size: 12px;
  color: #999;
}
.tinix-check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
}
.tinix-empty {
  font-size: 13px;
  color: #999;
  line-height: 1.5;
}
.tinix-note {
  font-size: 12px;
  color: #444;
  line-height: 1.5;
  margin-bottom: 6px;
  &.dim {
    color: #999;
  }
}
.tinix-suggest {
  min-height: 80px;
}
.tinix-suggest-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 4px 8px;
}
.tinix-suggest-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  img {
    width: 34px;
    height: 34px;
    object-fit: cover;
    border-radius: 3px;
    background: #f1f2f4;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.infinite-list {
  height: 100%;
  margin-top: 1rem;
  padding-bottom: 150px;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}
.infinite-list::-webkit-scrollbar {
  display: none; /* Chrome Safari */
}
// .list {
//   width: 100%;
//   padding: 4px 0 0 10px;
//   &__img {
//     cursor: pointer;
//     width: 128px;
//     height: auto;
//     position: relative;
//     &-mask {
//       opacity: 0;
//       width: 100%;
//       height: 100%;
//       background: rgba(0, 0, 0, 0.12);
//       position: absolute;
//       z-index: 1;
//       top: 0;
//       left: 0;
//     }
//   }
//   &__img:hover {
//     background: rgba(0, 0, 0, 0.04);
//   }
//   &__img:hover > &__img-mask {
//     opacity: 1;
//   }
// }

.loading {
  padding-top: 1rem;
  text-align: center;
  font-size: 14px;
  color: #999;
}
</style>
