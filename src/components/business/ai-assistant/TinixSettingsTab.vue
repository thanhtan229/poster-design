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
    <!-- [TINIX] logo mặc định của studio -->
    <div class="tx-form">
      <span>{{ $t('tinix.ui.logo.logo_studio') }}</span>
      <div class="tx-row">
        <img v-if="form.logo_url" :src="form.logo_url" style="height: 40px; max-width: 120px; object-fit: contain; background: #f2f2f2; border-radius: 4px" />
        <el-upload action="" accept="image/*" :http-request="uploadLogo" :show-file-list="false">
          <el-button size="small" :loading="state.uploadingLogo">{{ form.logo_url ? $t('tinix.ui.logo.doi_logo') : $t('tinix.ui.logo.tai_logo_len') }}</el-button>
        </el-upload>
        <el-button v-if="form.logo_url" size="small" @click="form.logo_url = ''">{{ $t('tinix.ui.logo.xoa_logo') }}</el-button>
      </div>
      <span>{{ $t('tinix.ui.logo.vi_tri') }}</span>
      <el-select v-model="form.logo_corner" size="small">
        <el-option v-for="c in LOGO_CORNERS" :key="c" :label="$t('tinix.ui.logo.corner_' + c)" :value="c" />
      </el-select>
      <span>{{ $t('tinix.ui.logo.tu_chen') }}</span>
      <el-switch v-model="form.logo_auto" />
    </div>
    <p class="tx-hint">{{ $t('tinix.ui.logo.goi_y') }}</p>
    <p class="tx-hint">{{ $t('tinix.ui.settingsTab.don_gia_lay_theo_bang') }}</p>
    <div class="tx-row">
      <el-button type="primary" size="small" :loading="state.saving" @click="save">{{ $t('tinix.ui.settingsTab.luu_cai_dat') }}</el-button>
      <el-button size="small" :disabled="!form.logo_url" @click="insertLogo">{{ $t('tinix.ui.logo.chen_logo_ngay') }}</el-button>
      <el-button size="small" :loading="state.tagging" @click="tag">{{ $t('tinix.ui.settingsTab.ai_gan_tag_cho_font') }}</el-button>
      <el-button size="small" :loading="state.taggingVision" @click="tagVision">{{ state.taggingVision ? $t('tinix.ui.settingsTab.dang_gan_tag_theo_anh', { n: state.visionDone }) : $t('tinix.ui.settingsTab.ai_gan_tag_theo_anh') }}</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElInputNumber, ElUpload, ElSwitch, ElSelect, ElOption } from 'element-plus' // [TINIX] ElUpload/ElSwitch/ElSelect cho phần logo
import * as tinixAi from '@/api/tinix-ai'
import type { TAiSettings } from '@/api/tinix-ai'
import i18n from '@/languages'
import api from '@/api'
import { useWidgetStore, useCanvasStore } from '@/store'
import { insertStudioLogo, LOGO_CORNERS } from '@/utils/tinix/logo' // [TINIX]
const i18t = (k: string, p?: any): string => i18n.global.t(k, p) as string // [TINIX]

const form = reactive({ vision_model: '', studio_name: '', price_in_per_1m: 0, price_out_per_1m: 0, monthly_limit_vnd: 0, price_per_image_vnd: 0, logo_url: '', logo_corner: 'br', logo_auto: false })
const base = ref<TAiSettings['base'] | null>(null)
const state = reactive({ uploadingLogo: false, saving: false, tagging: false, taggingVision: false, visionDone: 0 })

async function load() {
  const res = await tinixAi.getSettings()
  if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.khong_doc_duoc_cai_dat'))
  const s = res as TAiSettings
  Object.assign(form, { vision_model: s.vision_model, studio_name: s.studio_name, price_in_per_1m: s.price_in_per_1m, price_out_per_1m: s.price_out_per_1m, monthly_limit_vnd: s.monthly_limit_vnd, price_per_image_vnd: s.price_per_image_vnd || 0, logo_url: s.logo_url || '', logo_corner: s.logo_corner || 'br', logo_auto: !!s.logo_auto })
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
// [TINIX] logo studio: tải ảnh lên server rồi lưu cùng cài đặt
async function uploadLogo({ file }: any) {
  state.uploadingLogo = true
  try {
    const res: any = await api.material.upload({ file, folder: 'logo' }, () => {})
    const url = res?.url || res?.result?.url
    if (!url) return ElMessage.error(i18t('tinix.ui.logo.tai_len_khong_duoc'))
    form.logo_url = url
  } catch (e) {
    ElMessage.error(i18t('tinix.ui.logo.tai_len_khong_duoc'))
  } finally {
    state.uploadingLogo = false
  }
}
async function insertLogo() {
  const res = await tinixAi.saveSettings({ ...form }) // dùng đúng logo đang hiển thị, kể cả chưa bấm Lưu
  if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.luu_khong_thanh_cong'))
  const r = await insertStudioLogo(useWidgetStore(), useCanvasStore().dPage)
  ElMessage[r === 'added' ? 'success' : 'info'](i18t(r === 'added' ? 'tinix.ui.logo.da_chen' : 'tinix.ui.logo.da_co_logo'))
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
// [TINIX] Gắn tag bằng cách nhìn ảnh xem trước: gọi lặp (mỗi lần tối đa 24 font) đến khi hết font cần làm
async function tagVision() {
  state.taggingVision = true
  state.visionDone = 0
  try {
    for (let round = 0; round < 40; round++) {
      const res: any = await tinixAi.tagFonts({ mode: 'vision', limit: 24 })
      if (tinixAi.isErr(res)) return ElMessage.error(res.msg || i18t('tinix.ui.settingsTab.gan_tag_khong_thanh_cong'))
      state.visionDone += res.updated || 0
      if (!res.remaining || !res.updated) break // hết việc, hoặc AI không trả được gì thêm (tránh lặp vô hạn)
    }
    ElMessage.success(state.visionDone ? i18t('tinix.ui.settingsTab.tagged', { n: state.visionDone }) : i18t('tinix.ui.settingsTab.tat_ca_font_da_nhin_anh'))
  } finally {
    state.taggingVision = false
  }
}
onMounted(load)
</script>

<style lang="less" scoped>
@import './tinix-tab.less';
</style>
