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
 * @Date: 2022-02-11 18:48:23
 * @Description: 照片图库 Form:Unsplash无版权图片
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-14 18:50:09
-->
<template>
  <div class="wrap">
    <search-header type="none" @change="searchChange" />
    <div style="height: 0.5rem" />
    <classHeader v-show="!state.currentCategory" :types="state.types" @select="selectTypes">
      <template v-slot="{ index }">
        <photo-list :isShort="true" :listData="state.showList[index]" @load="getDataList" @drag="dragStart($event, state.showList[index])" @select="selectImg($event, state.showList[index])" />
      </template>
    </classHeader>
    <div v-if="state.currentCategory">
      <classHeader :is-back="true" @back="back">{{ state.currentCategory.name }}</classHeader>
      <br /><br /><br />
      <div style="margin: 0 1rem; height: 100vh">
        <photo-list :isDone="state.loadDone" :listData="state.recommendImgList" @load="getDataList" @drag="dragStart" @select="selectImg" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 图片列表
// const NAME = 'img-list-wrap'
import { toRefs, reactive, computed, onMounted } from 'vue'
// import wImage from '../../widgets/wImage/wImage.vue'
import wImageSetting from '../../widgets/wImage/wImageSetting'
import api from '@/api'

import setImageData from '@/common/methods/DesignFeatures/setImage'
import { applyImageSource } from '@/utils/tinix/photo-source' // [TINIX]
import eventBus from '@/utils/plugins/eventBus' // [TINIX]
import { storeToRefs } from 'pinia'
import { useControlStore, useCanvasStore, useWidgetStore } from '@/store'
import { TGetImageListResult } from '@/api/material'

type TProps = {
  active?: boolean
}

type TState = {
  recommendImgList: TGetImageListResult[]
  loadDone: boolean
  page: number
  currentCategory: TCurrentCategory | null
  types: { id?: number; cate?: string; name: string }[]
  showList: TGetImageListResult[][]
}

type TCurrentCategory = {
  name: string
  id?: number
  cate?: string
}

const props = defineProps<TProps>()

const controlStore = useControlStore()
const widgetStore = useWidgetStore()

const { dPage } = storeToRefs(useCanvasStore())
const state = reactive<TState>({
  recommendImgList: [],
  loadDone: false,
  page: 0,
  currentCategory: null,
  types: [],
  showList: [],
})
let loading = false

async function loadTypes() {
  if (state.types.length <= 0) {
    const categoryRes: any = await api.material.getAssetCategories('photos')
    state.types = Array.isArray(categoryRes?.list) ? categoryRes.list : []
    for (const iterator of state.types) {
      const { list } = await api.material.getImagesList({ cate: iterator.cate || iterator.id, pageSize: 2 })
      state.showList.push(list)
    }
  }
}
onMounted(loadTypes)
// [TINIX] dải ảnh phía dưới vừa ★ / gỡ ảnh khỏi thư viện: tải lại nhóm + ảnh để thấy ngay
eventBus.on('tinix:photos-library-changed', () => {
  Object.assign(state, { types: [], showList: [], recommendImgList: [], page: 0, loadDone: false, currentCategory: null })
  loading = false
  loadTypes()
})

const selectImg = async (index: number, list: TGetImageListResult[]) => {
  const item = list ? list[index] : state.recommendImgList[index]

  // store.commit('setShowMoveable', false) // 清理掉上一次的选择
  controlStore.setShowMoveable(false) // 清理掉上一次的选择

  let setting = JSON.parse(JSON.stringify(wImageSetting))
  const img = await setImageData(item) // await getImage(item.url)
  setting.width = img.width
  setting.height = img.height // parseInt(100 / item.value.ratio, 10)
  applyImageSource(setting, { url: item.url, hq: (item as any).hq }) // [TINIX] mục "Yêu thích": url = ảnh nhẹ, hq = ảnh gốc
  const { width: pW, height: pH } = dPage.value
  setting.left = pW / 2 - img.width / 2
  setting.top = pH / 2 - img.height / 2

  widgetStore.addWidget(setting)
  // store.dispatch('addWidget', setting)
}

const getDataList = async () => {
  if (state.loadDone || loading) {
    return
  }
  loading = true
  state.page += 1
  let { list = [], total } = await api.material.getImagesList({ cate: state.currentCategory?.cate || state.currentCategory?.id, page: state.page, pageSize: 30 })
  list.length <= 0 ? (state.loadDone = true) : (state.recommendImgList = state.recommendImgList.concat(list))
  if (list.length < 30 || (Number.isFinite(Number(total)) && state.recommendImgList.length >= Number(total))) state.loadDone = true
  setTimeout(() => {
    loading = false
  }, 100)
}

const dragStart = (index: number, list: TGetImageListResult[]) => {
  const item = list ? list[index] : state.recommendImgList[index]

  widgetStore.setSelectItem({ data: { value: item }, type: 'image' })
  // store.commit('selectItem', { data: { value: item }, type: 'image' })
}

const searchChange = (e: Event) => {
  console.log(e)
}

const selectTypes = (item: TCurrentCategory) => {
  state.currentCategory = item
  getDataList()
}

const back = () => {
  state.currentCategory = null
  state.page = 0
  state.loadDone = false
  state.recommendImgList = []
}

defineExpose({
  selectImg,
  getDataList,
  dragStart,
  searchChange,
  selectTypes,
  back,
})
</script>

<style lang="less" scoped>
.wrap {
  width: 100%;
  height: 100%;
}
</style>
