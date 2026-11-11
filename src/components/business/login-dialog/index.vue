<!--
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
-->
<template>
  <el-dialog v-model="visible" :title="$t('tinix.login.title')" width="360px" :append-to-body="true" @closed="reset">
    <el-tabs v-model="mode">
      <el-tab-pane :label="$t('tinix.login.tabLogin')" name="login" />
      <el-tab-pane :label="$t('tinix.login.tabRegister')" name="register" />
    </el-tabs>
    <el-form @submit.prevent>
      <el-form-item>
        <el-input v-model="form.account" :placeholder="$t('tinix.login.account')" @keyup.enter="submit" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.password" type="password" :placeholder="$t('tinix.login.password')" show-password @keyup.enter="submit" />
      </el-form-item>
      <el-button type="primary" style="width: 100%" :loading="loading" @click="submit">
        {{ mode === 'login' ? $t('tinix.login.submitLogin') : $t('tinix.login.submitRegister') }}
      </el-button>
    </el-form>
  </el-dialog>
</template>

<script lang="ts" setup>
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { reactive, ref } from 'vue'
// ElDialog / ElInput / ElButton 已全局注册（见 elementConfig.ts），此处仅需补未注册的
import { ElMessage, ElTabs, ElTabPane, ElForm, ElFormItem } from 'element-plus'
import { LocalStorageKey } from '@/config'
import * as adminApi from '@/api/admin'
import { useI18n } from 'vue-i18n' // [TINIX]
import { viServerMsg } from '@/utils/tinix/server-msg' // [TINIX]

const { t } = useI18n() // [TINIX]

export type LoginResult = { account: string; role: number }

const visible = ref(false)
const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const form = reactive({ account: '', password: '' })
let resolveFn: ((value: LoginResult | null) => void) | null = null

/** 打开弹窗，成功登录后 resolve 用户信息，取消返回 null */
function open(initMode: 'login' | 'register' = 'login'): Promise<LoginResult | null> {
  mode.value = initMode
  visible.value = true
  return new Promise((resolve) => {
    resolveFn = resolve
  })
}

function reset() {
  form.account = ''
  form.password = ''
  resolveFn?.(null)
  resolveFn = null
}

function settle(result: LoginResult) {
  // token 已在 submit 中写入，这里补写用户信息
  localStorage.setItem('xp_user', JSON.stringify({ account: result.account, role: result.role }))
  visible.value = false
  resolveFn?.(result)
  resolveFn = null
}

async function submit() {
  if (!form.account || !form.password) {
    ElMessage.warning(t('tinix.login.missing'))
    return
  }
  loading.value = true
  try {
    const api = mode.value === 'login' ? adminApi.login : adminApi.register
    // axios 拦截器对 code===200 的响应只返回 result 本体，错误返回完整对象
    const res: any = await api({ account: form.account.trim(), password: form.password })
    if (res?.token) {
      localStorage.setItem(LocalStorageKey.tokenKey, res.token)
      settle({ account: res.account, role: res.role })
    } else {
      ElMessage.error(viServerMsg(res?.msg) || t('tinix.login.failed'))
    }
  } catch (e: any) {
    ElMessage.error(viServerMsg(e?.message) || t('tinix.networkError'))
  } finally {
    loading.value = false
  }
}

defineExpose({ open })
</script>
