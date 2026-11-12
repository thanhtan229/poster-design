<!-- [TINIX] Trợ lý AI → Cài đặt: model nhìn ảnh, tên studio, đơn giá token, giới hạn chi phí, gắn tag font. -->
<template>
  <div class="tx-tab">
    <div v-if="base && (!base.enabled || !base.has_key)" class="tx-warn">
      <span v-html="$t('tinix.ui.settingsTab.warn', { reason: !base.has_key ? $t('tinix.ui.settingsTab.chua_co_api_key') : $t('tinix.ui.settingsTab.ai_dang_tat') })"></span>
    </div>
    <p v-if="base" class="tx-hint">{{ $t('tinix.ui.settingsTab.endpointInfo', { url: base.base_url, model: base.text_model }) }}</p>
    <div class="tx-form">
      <span>{{ $t('tinix.ui.settingsTab.model_nhin_anh') }}</span>
      <el-input v-model="form.vision_model" size="small" placeholder="vd: glm-4v-flash, gemini-2.5-flash, gpt-4o-mini" />
      <span>{{ $t('tinix.ui.settingsTab.ten_studio_chu_ky') }}</span>
      <el-input v-model="form.studio_name" size="small" placeholder="vd: Tinix Studio" />
      <span>{{ $t('tinix.ui.settingsTab.don_gia_vao_d_1') }}</span>
      <el-input-number v-model="form.price_in_per_1m" size="small" :min="0" :step="1000" controls-position="right" />
      <span>{{ $t('tinix.ui.settingsTab.don_gia_ra_d_1') }}</span>
      <el-input-number v-model="form.price_out_per_1m" size="small" :min="0" :step="1000" controls-position="right" />
      <span>{{ $t('tinix.ui.settingsTab.don_gia_moi_anh_tao') }}</span>
      <el-input-number v-model="form.price_per_image_vnd" size="small" :min="0" :step="500" controls-position="right" />
      <span>{{ $t('tinix.ui.settingsTab.gioi_han_chi_phi_thang') }}</span>
      <el-input-number v-model="form.monthly_limit_vnd" size="small" :min="0" :step="10000" controls-position="right" />
    </div>
    <p class="tx-hint">{{ $t('tinix.ui.settingsTab.don_gia_lay_theo_bang') }}</p>
    <div class="tx-row">
      <el-button type="primary" size="small" :loading="state.saving" @click="save">{{ $t('tinix.ui.settingsTab.luu_cai_dat') }}</el-button>
      <el-button size="small" :loading="state.tagging" @click="tag">{{ $t('tinix.ui.settingsTab.ai_gan_tag_cho_font') }}</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElInputNumber } from 'element-plus'
import * as tinixAi from '@/api/tinix-ai'
import type { TAiSettings } from '@/api/tinix-ai'
import i18n from '@/languages'
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

const form = reactive({ vision_model: '', studio_name: '', price_in_per_1m: 0, price_out_per_1m: 0, monthly_limit_vnd: 0, price_per_image_vnd: 0 })
const base = ref<TAiSettings['base'] | null>(null)
const state = reactive({ saving: false, tagging: false })

async function load() {
  const res = await tinixAi.getSettings()
  if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.khong_doc_duoc_cai_dat'))
  const s = res as TAiSettings
  Object.assign(form, { vision_model: s.vision_model, studio_name: s.studio_name, price_in_per_1m: s.price_in_per_1m, price_out_per_1m: s.price_out_per_1m, monthly_limit_vnd: s.monthly_limit_vnd, price_per_image_vnd: s.price_per_image_vnd || 0 })
  base.value = s.base || null
}
async function save() {
  state.saving = true
  try {
    const res = await tinixAi.saveSettings({ ...form })
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.luu_khong_thanh_cong'))
    ElMessage.success(i18t('tinix.ui.settingsTab.da_luu_cai_dat_ai'))
  } finally {
    state.saving = false
  }
}
async function tag() {
  state.tagging = true
  try {
    const res: any = await tinixAi.tagFonts({})
    if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.gan_tag_khong_thanh_cong'))
    ElMessage.success(res.updated ? i18t('tinix.ui.settingsTab.tagged', { n: res.updated }) : i18t('tinix.ui.settingsTab.tat_ca_font_deu_da'))
  } finally {
    state.tagging = false
  }
}
onMounted(load)
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
