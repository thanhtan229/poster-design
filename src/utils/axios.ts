/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 palxiao https://xpai.design
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import axios, { AxiosRequestConfig, AxiosResponse, AxiosStatic } from 'axios'
import app_config, { LocalStorageKey } from '@/config'
import { useBaseStore } from '@/store/index';

axios.defaults.timeout = 30000
const baseUrl = app_config.API_URL

// 请求拦截器
axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const url = config.url ?? ""
    const values = {}
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      config.url = url.startsWith('/') ? baseUrl + url : config.url = baseUrl + '/' + url
    }

    if (config.method === 'get') {
      //  config.params = utils.extend(config.params, values)
      // Axios allows params to be omitted. Always merge into a fresh object;
      // Object.assign(undefined, ...) throws before the request is sent.
      config.params = Object.assign({}, config.params, values)
      // config.params = qs.stringify(config.params);
    } else {
      // 文件上传必须保留 FormData 实例，否则合并后会丢失 multipart 文件内容。
      if (!(typeof FormData !== 'undefined' && config.data instanceof FormData)) {
        config.data = Object.assign({}, config.data, values)
      }
      //  config.data = utils.extend(config.data, values)
      // config.data = qs.stringify(config.data);
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// 响应拦截器
axios.interceptors.response.use((res: AxiosResponse<any>) => {
    // store.dispatch('hideLoading');
    // 接口规则：只有正确code为200时返回result结果对象，错误返回整个结果对象
    if (!res.data) {
      return Promise.reject(res)
    }

    if (res.data.result && res.data.code === 200) {
      return Promise.resolve(res.data.result)
    } else if (res.data.data && res.data.stat == 1) {
      return Promise.resolve(res.data.data)
    } else {
      return Promise.resolve(res.data)
    }
  },
  (error) => {
    // if (error.response.status === 401) {
    // }
    useBaseStore().hideLoading()
    // store.dispatch('hideLoading')
    return Promise.reject(error)
  },
)

type TFetchRequestConfigParams = AxiosRequestConfig & Record<string, any>
type TFetchMethod = keyof Pick<
  AxiosStatic, 
  "get" | "post" | "put" | "getUri" | "request" | "delete" | "head" | "options" | "patch"
>

// export default axios;
const fetch = <T = any> (
  url: string,
  params: TFetchRequestConfigParams, 
  type: TFetchMethod = 'get',
  exheaders: Record<string, any> = {},
  extra: Record<string, any> = {}
): Promise<T> => {
  if (params?._noLoading) {
    delete params._noLoading
  } else {
    // store.commit('loading', '加载中..');
  }

  // Local personal workspace: no Authorization header is needed.
  const headerObject: Record<string, any> = {}
  
  if (type === 'get') {
    return axios.get(url, {
      headers: Object.assign(headerObject, exheaders),
      params,
      ...extra,
    })
  } else {
    return axios[type](url, params, {
      headers: Object.assign(headerObject, exheaders),
      ...extra,
    }) as Promise<T>
  }
}

export default fetch
