<!-- [TINIX] Trợ lý AI → Cài đặt: model nhìn ảnh, tên studio, đơn giá token, giới hạn chi phí, gắn tag font. -->
<template>
  <div class="tx-tab">
    <div v-if="base && (!base.enabled || !base.has_key)" class="tx-warn">
      {{ !base.has_key ? 'Chưa có API key.' : 'AI đang tắt.' }} Vào <a href="/admin" target="_blank">trang Quản trị</a> → mục cấu hình AI (Thiết lập AI) để nhập API key, endpoint và bật AI.
    </div>
    <p v-if="base" class="tx-hint">Endpoint: {{ base.base_url }} · model chữ: {{ base.text_model }} (đổi trong trang Quản trị).</p>
    <div class="tx-form">
      <span>Model nhìn ảnh</span>
      <el-input v-model="form.vision_model" size="small" placeholder="vd: glm-4v-flash, gemini-2.5-flash, gpt-4o-mini" />
      <span>Tên studio (chữ ký)</span>
      <el-input v-model="form.studio_name" size="small" placeholder="vd: Tinix Studio" />
      <span>Đơn giá vào (đ / 1 triệu token)</span>
      <el-input-number v-model="form.price_in_per_1m" size="small" :min="0" :step="1000" controls-position="right" />
      <span>Đơn giá ra (đ / 1 triệu token)</span>
      <el-input-number v-model="form.price_out_per_1m" size="small" :min="0" :step="1000" controls-position="right" />
      <span>Đơn giá mỗi ảnh tạo ra (đ)</span>
      <el-input-number v-model="form.price_per_image_vnd" size="small" :min="0" :step="500" controls-position="right" />
      <span>Giới hạn chi phí / tháng (đ)</span>
      <el-input-number v-model="form.monthly_limit_vnd" size="small" :min="0" :step="10000" controls-position="right" />
    </div>
    <p class="tx-hint">Đơn giá lấy theo bảng giá của nhà cung cấp AI (đổi sang VNĐ). Đơn giá mỗi ảnh: nhập giá một lần tạo ảnh (để 0 = tính theo token nếu nhà cung cấp trả về). Giới hạn 0 = không giới hạn; lần tạo ảnh cũng được tính vào giới hạn.</p>
    <div class="tx-row">
      <el-button type="primary" size="small" :loading="state.saving" @click="save">Lưu cài đặt</el-button>
      <el-button size="small" :loading="state.tagging" @click="tag">AI gắn tag cho font chưa có tag</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElInputNumber } from 'element-plus'
import * as tinixAi from '@/api/tinix-ai'
import type { TAiSettings } from '@/api/tinix-ai'

const form = reactive({ vision_model: '', studio_name: '', price_in_per_1m: 0, price_out_per_1m: 0, monthly_limit_vnd: 0, price_per_image_vnd: 0 })
const base = ref<TAiSettings['base'] | null>(null)
const state = reactive({ saving: false, tagging: false })

async function load() {
  const res = await tinixAi.getSettings()
  if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Không đọc được cài đặt')
  const s = res as TAiSettings
  Object.assign(form, { vision_model: s.vision_model, studio_name: s.studio_name, price_in_per_1m: s.price_in_per_1m, price_out_per_1m: s.price_out_per_1m, monthly_limit_vnd: s.monthly_limit_vnd, price_per_image_vnd: s.price_per_image_vnd || 0 })
  base.value = s.base || null
}
async function save() {
  state.saving = true
  try {
    const res = await tinixAi.saveSettings({ ...form })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Lưu không thành công')
    ElMessage.success('Đã lưu cài đặt AI')
  } finally {
    state.saving = false
  }
}
async function tag() {
  state.tagging = true
  try {
    const res: any = await tinixAi.tagFonts({})
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || 'Gắn tag không thành công')
    ElMessage.success(res.updated ? `Đã gắn tag cho ${res.updated} font` : 'Tất cả font đều đã có tag')
  } finally {
    state.tagging = false
  }
}
onMounted(load)
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
