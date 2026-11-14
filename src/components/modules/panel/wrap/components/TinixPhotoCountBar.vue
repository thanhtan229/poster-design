<!--
 [TINIX] Bộ lọc mẫu theo SỐ ẢNH cần cho mẫu: Tất cả · 1 · 2 · 3 · 4 · 5+ (kèm số mẫu, theo nhóm đang chọn).
 Mẫu chưa đánh dấu khung ảnh được tính là mẫu 1 ảnh (ảnh phủ kín trang). Đánh dấu khung ảnh ở chế độ sửa mẫu.
-->
<template>
  <div class="tinix-photo-count">
    <span class="lb">{{ $t('tinix.ui.photoAuto.so_anh') }}</span>
    <span :class="['chip', { on: modelValue === '' }]" @click="pick('')">{{ $t('tinix.ui.photoAuto.tat_ca') }}</span>
    <span v-for="k in KEYS" :key="k" :class="['chip', { on: modelValue === k, empty: !counts[k] }]" @click="pick(k)">{{ k }}<i>{{ counts[k] || 0 }}</i></span>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import api from '@/api'

const props = defineProps<{ modelValue: string; cate: number | string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

const KEYS = ['1', '2', '3', '4', '5+']
const counts = reactive<Record<string, number>>({ '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 })

async function reload() {
  try {
    const res: any = await api.home.getTemplatePhotoCounts(props.cate)
    Object.assign(counts, res && res.counts ? res.counts : {})
  } catch (e) {
    // không tải được: giữ số cũ
  }
}
function pick(v: string) {
  const next = props.modelValue === v ? '' : v // bấm lại để bỏ lọc
  emit('update:modelValue', next)
  emit('change', next)
}

watch(() => props.cate, reload)
const onChanged = () => reload() // mẫu được lưu/xóa/gán nhóm → cập nhật số đếm
onMounted(() => {
  reload()
  window.addEventListener('tinix:templates-changed', onChanged)
})
onBeforeUnmount(() => window.removeEventListener('tinix:templates-changed', onChanged))
</script>

<style lang="less" scoped>
.tinix-photo-count {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 1rem 0 14px;
  font-size: 12px;
  color: #666;
  .lb {
    color: #999;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
    padding: 4px 8px;
    border: 1px solid #e4e7ed;
    border-radius: 12px;
    background: #fff;
    i {
      font-style: normal;
      color: #b4b8bf;
    }
  }
  .chip:hover {
    border-color: #3f6af7;
  }
  .chip.empty {
    opacity: 0.55;
  }
  .chip.on {
    color: #fff;
    background: #3f6af7;
    border-color: #3f6af7;
    i {
      color: rgba(255, 255, 255, 0.75);
    }
  }
}
</style>
