<!--
 * @Author: ShawnPhang
 * @Date: 2021-12-16 16:20:16
 * @Description: 瀑布流组件
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @Date: 2024-03-06 21:16:00
-->
<template>
  <div ref="imgWaterFall" :style="{ height: state.countHeight + 'px' }" class="img-water-fall">
    <!-- backgroundImage: `url(${item.cover})` -->
    <div
      v-for="(item, i) in state.list" :key="i + 'iwf'"
      :style="{ top: item.top + 'px', left: item.left + 'px', width: state.width + 'px', height: item.height + 'px' }"
      :class="['img-box', { 'tinix-picked': selectMode && selected && selected.includes(item.id) }]" @click.stop="selectItem(item, i)"
    >
      <!-- [TINIX] chế độ chọn nhiều (admin): ô tick ở góc trên trái -->
      <span v-if="selectMode" class="tinix-check">{{ selected && selected.includes(item.id) ? '✓' : '' }}</span>
      <!-- [TINIX] admin: nút "Sửa mẫu" (mở chế độ sửa mẫu ở tab mới, lưu sẽ ghi đè mẫu và tạo lại bìa) -->
      <div v-if="adminEdit && !selectMode" class="tinix-card-actions">
        <button type="button" class="tinix-edit-btn" :title="$t('tinix.ui.templateCard.sua_mau_tip')" @click.stop="emit('edit', item)">{{ $t('tinix.ui.templateCard.sua_mau') }}</button>
        <button type="button" class="tinix-edit-btn grp" :title="$t('tinix.ui.templateGroups.nhom_tip')" @click.stop="emit('groups', item)">{{ $t('tinix.ui.templateCard.nhom') }}</button>
        <button type="button" class="tinix-edit-btn danger" :title="$t('tinix.ui.templateCard.xoa_mau_tip')" @click.stop="emit('remove', item)">{{ $t('tinix.ui.templateCard.xoa_mau') }}</button>
      </div>
      <edit-model v-if="edit" :options="props.edit" :data="{ item, i }">
        {{ item.isDelect }}
        <div v-if="item.isDelect" class="list__mask">{{ $t('common.deleted') }}</div>
        <el-image v-if="!item.fail" class="img" :src="item.cover" lazy loading="lazy" @error="loadError(item)" />
        <div v-else class="fail_img">{{ item.title }}</div>
      </edit-model>
      <el-image v-else class="img" :src="item.cover" lazy loading="lazy" @error="loadError(item)" />
    </div>
  </div>
</template>

<script lang="ts" setup>
// const NAME = 'img-water-fall'
import { IGetTempListData } from '@/api/home';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

type TProps = {
  listData: IGetTempListData[]
  edit?: Record<string, any>
  adminEdit?: boolean // [TINIX] hiện nút Sửa mẫu trên từng thẻ (chỉ admin)
  selectMode?: boolean // [TINIX] chế độ chọn nhiều thẻ
  selected?: number[] // [TINIX] id các mẫu đang chọn
}

type TState = {
  width: number
  countHeight: number
  list: IGetTempListData[]
}

type TEmits = {
  (event: 'select', data: IGetTempListData): void
  (event: 'edit', data: IGetTempListData): void // [TINIX]
  (event: 'remove', data: IGetTempListData): void // [TINIX]
  (event: 'groups', data: IGetTempListData): void // [TINIX] mở hộp chọn nhóm của mẫu
  (event: 'toggle', data: IGetTempListData): void // [TINIX] tick/bỏ tick khi đang chọn nhiều
  (event: 'load'): void
}

const props = defineProps<TProps>()
const emit = defineEmits<TEmits>()

const state = reactive<TState>({
  width: 146, // 图片的宽度
  list: [],
  countHeight: 0,
})

const columnHeights: number[] = [] // 列的高度
const columnNums = ref(2) // [TINIX] số cột: tự tính theo độ rộng panel (kéo rộng panel → nhiều cột hơn)
const gap = 7 // 图片之间的间隔
const BASE_WIDTH = 146 // [TINIX] độ rộng thẻ tối thiểu mong muốn (mặc định cũ)
const SIDE_SPACE = 28 // [TINIX] lề trái 14px + chừa phải 14px của danh sách
const imgWaterFall = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

// [TINIX] Bố cục theo số cột hiện tại; gọi lại khi danh sách hoặc số cột/độ rộng thẻ đổi
function layout() {
  const nums = columnNums.value
  columnHeights.length = 0
  const cloneList = JSON.parse(JSON.stringify(props.listData))
  for (let i = 0; i < cloneList.length; i++) {
    let index = i % nums
    const item = cloneList[i]
    item.height = (item.height / item.width) * state.width // 图片高度
    item.left = index * (state.width + gap) // 定位
    item.top = columnHeights[index] + gap || 0 // 定位
    // 找出最短边
    if (isNaN(columnHeights[index])) {
      columnHeights[index] = item.height
    } else {
      index = columnHeights.indexOf(Math.min(...columnHeights))
      item.left = index * (state.width + gap)
      item.top = columnHeights[index] + gap || 0
      columnHeights[index] = item.height + columnHeights[index] + gap
    }
  }
  state.countHeight = columnHeights.length ? Math.max(...columnHeights) : 0
  state.list = cloneList
}

watch(() => props.listData, layout)
watch([columnNums, () => state.width], layout)

// [TINIX] Panel rộng thêm thì thêm cột (thẻ giữ ~146px); panel hẹp lại thì thẻ thu nhỏ vừa 2 cột
function measure(panelWidth: number) {
  if (panelWidth < 100) return // panel đang ẩn
  const avail = panelWidth - SIDE_SPACE
  const cols = Math.max(2, Math.floor((avail + gap) / (BASE_WIDTH + gap)))
  const w = Math.max(60, Math.floor((avail - gap * (cols - 1)) / cols))
  columnNums.value = cols
  state.width = w
}

onMounted(() => {
  const host = imgWaterFall.value && imgWaterFall.value.parentElement
  if (!host) return
  measure(host.clientWidth)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver((entries) => entries[0] && measure(entries[0].contentRect.width))
    observer.observe(host)
  }
})
onBeforeUnmount(() => observer && observer.disconnect())

const load = () => {
  emit('load')
}
const selectItem = (value: IGetTempListData, index: number) => {
  if (props.selectMode) return emit('toggle', value) // [TINIX]
  emit('select', value)
}
const loadError = (item: IGetTempListData) => {
  item.fail = true
}

defineExpose({
  load,
  selectItem,
  loadError,
})
</script>

<style lang="less" scoped>
.fail_img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999999;
}
.img-water-fall {
  position: relative;
  margin-left: 14px;
  .tinix-card-actions {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    display: none;
    gap: 4px;
  }
  .img-box:hover .tinix-card-actions {
    display: flex;
  }
  .tinix-edit-btn {
    border: 0;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    color: #fff;
    background: rgba(63, 106, 247, 0.92);
    cursor: pointer;
    &.grp {
      background: rgba(103, 194, 58, 0.95);
    }
    &.danger {
      background: rgba(245, 108, 108, 0.95);
    }
  }
  .tinix-check {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 3;
    width: 18px;
    height: 18px;
    line-height: 16px;
    text-align: center;
    font-size: 12px;
    color: #fff;
    background: rgba(255, 255, 255, 0.85);
    border: 1.5px solid #3f6af7;
    border-radius: 4px;
  }
  .img-box.tinix-picked {
    outline: 2px solid #3f6af7;
    .tinix-check {
      background: #3f6af7;
    }
  }
  .img-box {
    position: absolute !important;
    cursor: pointer;
    position: relative;
    background-size: cover;
    border-radius: 5px;
    border: 1px solid #e0e5ea;
    overflow: hidden;
    .img {
      display: block;
      width: 100%;
      height: 100%;
    }
  }
  .img-box:hover::before {
    content: ' ';
    background: rgba(0, 0, 0, 0.15);
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }
}
.list {
  &__mask {
    position: absolute;
    z-index: 2;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
