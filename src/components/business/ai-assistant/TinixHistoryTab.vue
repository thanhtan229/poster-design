<!-- [TINIX] Trợ lý AI → Lịch sử: các lần gọi AI + chi phí ước tính tháng này. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <b>Tháng {{ usage.month }}:</b>
      <span>{{ usage.jobs }} lần gọi · ~{{ vnd(usage.cost_vnd) }}</span>
      <span v-if="usage.limit_vnd" class="tx-label">/ giới hạn {{ vnd(usage.limit_vnd) }}</span>
      <el-button size="small" @click="load">Làm mới</el-button>
    </div>
    <p v-if="!usage.cost_vnd && usage.jobs" class="tx-hint">Chi phí = 0 vì chưa nhập đơn giá token trong tab Cài đặt AI.</p>
    <div class="tx-result">
      <table class="tx-table">
        <thead>
          <tr><th>Lúc</th><th>Tính năng</th><th>Kết quả</th><th>Model</th><th>Token</th><th>Chi phí</th></tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id">
            <td>{{ j.created_at }}</td>
            <td>{{ KIND[j.kind] || j.kind }}</td>
            <td><span :class="j.status === 'ok' ? 'tx-ok' : 'tx-err'">{{ j.status === 'ok' ? 'OK' : 'Lỗi' }}</span><div v-if="j.error" class="tx-err" style="max-width: 220px">{{ j.error }}</div></td>
            <td>{{ j.model }}</td>
            <td>{{ j.tokens_in }} / {{ j.tokens_out }}</td>
            <td>{{ vnd(j.cost_vnd) }}</td>
          </tr>
          <tr v-if="!jobs.length"><td colspan="6" class="tx-hint">Chưa có lần gọi AI nào.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import * as tinixAi from '@/api/tinix-ai'

const KIND: Record<string, string> = { suggest_text: 'Gợi ý chữ', rewrite_text: 'Sửa chữ', find_font: 'Tìm font', tag_fonts: 'Gắn tag font', rebuild: 'Dựng theo mẫu' }
const jobs = ref<any[]>([])
const usage = reactive({ month: '', jobs: 0, cost_vnd: 0, limit_vnd: 0 })
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`

async function load() {
  const [j, u]: any[] = await Promise.all([tinixAi.getJobs({ limit: 50 }), tinixAi.getUsage()])
  if (!tinixAi.isErr(j)) jobs.value = j.list || []
  if (!tinixAi.isErr(u)) Object.assign(usage, u)
}
onMounted(load)
defineExpose({ load })
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
