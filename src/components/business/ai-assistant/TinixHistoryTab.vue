<!-- [TINIX] Trợ lý AI → Lịch sử: các lần gọi AI + chi phí ước tính tháng này. -->
<template>
  <div class="tx-tab">
    <div class="tx-row">
      <b>{{ $t('tinix.ui.historyTab.month', { month: usage.month }) }}</b>
      <span>{{ $t('tinix.ui.historyTab.usage', { jobs: usage.jobs, cost: vnd(usage.cost_vnd) }) }}</span>
      <span v-if="usage.limit_vnd" class="tx-label">{{ $t('tinix.ui.historyTab.limit', { limit: vnd(usage.limit_vnd) }) }}</span>
      <el-button size="small" @click="load">{{ $t('tinix.ui.historyTab.lam_moi') }}</el-button>
    </div>
    <p v-if="!usage.cost_vnd && usage.jobs" class="tx-hint">{{ $t('tinix.ui.historyTab.chi_phi_0_vi_chua') }}</p>
    <div class="tx-result">
      <table class="tx-table">
        <thead>
          <tr><th>{{ $t('tinix.ui.historyTab.luc') }}</th><th>{{ $t('tinix.ui.historyTab.tinh_nang') }}</th><th>{{ $t('tinix.ui.historyTab.ket_qua') }}</th><th>Model</th><th>Token</th><th>{{ $t('tinix.ui.historyTab.chi_phi') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id">
            <td>{{ j.created_at }}</td>
            <td>{{ KIND[j.kind] || j.kind }}</td>
            <td><span :class="j.status === 'ok' ? 'tx-ok' : 'tx-err'">{{ j.status === 'ok' ? 'OK' : $t('tinix.ui.historyTab.loi') }}</span><div v-if="j.error" class="tx-err" style="max-width: 220px">{{ j.error }}</div></td>
            <td>{{ j.model }}</td>
            <td>{{ j.tokens_in }} / {{ j.tokens_out }}</td>
            <td>{{ vnd(j.cost_vnd) }}</td>
          </tr>
          <tr v-if="!jobs.length"><td colspan="6" class="tx-hint">{{ $t('tinix.ui.historyTab.chua_co_lan_goi_ai') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import * as tinixAi from '@/api/tinix-ai'
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

const KIND: Record<string, string> = { suggest_text: i18t('tinix.ui.historyTab.goi_y_chu'), rewrite_text: i18t('tinix.ui.historyTab.sua_chu'), find_font: i18t('tinix.ui.historyTab.tim_font'), tag_fonts: i18t('tinix.ui.historyTab.gan_tag_font'), rebuild: i18t('tinix.ui.historyTab.dung_theo_mau'), image: i18t('tinix.ui.historyTab.tao_anh') }
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
