/*
 * @Author: ShawnPhang
 * @Date: 2021-08-19 18:43:22
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-16 15:37:54
 */
import fetch from '@/utils/axios'
import _config from '@/config'

function serialize(obj: any) {
  return Object.keys(obj).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`).join('&');
}

// const screenshot_url = window.location.protocol + '//' + window.location.host + '/draw'
export const download = (params: Type.Object = {}) => `${_config.SCREEN_URL}/api/screenshots?${serialize(params)}`

type IGetTempListParam = {
  search: string
  page: number
  pageSize: number
  cate: number | string
  photos?: string // [TINIX] lọc theo số khung ảnh: '1'..'9' (đúng N; 1 gồm mẫu chưa đánh dấu) | '5+'
}
export type IGetTempListData = {
  cover: string
  height: number
  id: number
  state: number
  title: string
  width: number
  isDelect: boolean
  fail: boolean
  top: number
  left: number
  data?: string
  groups?: number[] // [TINIX] id các nhóm của mẫu
  photo_slots?: number // [TINIX] số khung ảnh đã đánh dấu (0 = chưa đánh dấu → mẫu 1 ảnh)
  listWidth?: number
  gap?: number
  thumb?: string
  url: string
  model?: string
  color?: string
}
type IGetTempListResult = TPageRequestResult<IGetTempListData[]>

// 获取模板列表
export const getTempList = (params: IGetTempListParam) => fetch<IGetTempListResult>('design/list', params, 'get')
// [TINIX] số mẫu theo số ảnh (1, 2, 3, 4, 5+) trong nhóm đang chọn
export const getTemplatePhotoCounts = (cate: number | string = '') => fetch<{ counts: Record<string, number> }>('design/template/photo-counts', { cate }, 'get')
export type TTemplateGroup = { id: number; name: string; sort?: number; count?: number }
// [TINIX] kèm count (số mẫu mỗi nhóm), uncategorized (chưa phân nhóm), total
export const getTemplateCategories = (type: 0 | 1 = 0) => fetch<{ list: TTemplateGroup[]; uncategorized?: number; total?: number }>('design/template/categories', { type }, 'get')

export type TGetTempDetail = {
  id: number
  type?: number
}

export type TTempDetail = {
  /** 分类 */
  category: number
  /** 封面 */
  cover: string
  /** 创建时间 */
  created_time: string
  /** Template内容 */
  data: string
  /** 高度 */
  height: number
  id: number
  /** 来源 */
  original: string
  resource: string
  state: string
  tag: string | null
  title: string
  updated_time: string
  width: number
}

export const getTempDetail = (params: TGetTempDetail) => fetch<TTempDetail>('design/temp', params, 'get')

type TGetCategoriesParams = {
  type?: number
}

// 保存模板
export const saveTemp = (params: Type.Object = {}) => fetch('design/edit', params, 'post')
// export const delTemp = (params: Type.Object = {}) => fetch('/api/template/temp_del', params)

type TGetCompListParam = {
  search?: string
  page?: number
  type?: number
  pageSize?: number
  cate?: number | string
}

/** 获取组件返回类型 */
export type TGetCompListResult = {
  cover: string
  height: number
  id: number
  state: number
  title: string
  width: number
  name?: string
  cate?: string
}

type getCompListReturn = TPageRequestResult<TGetCompListResult[]>

// 组件相关接口
export const getCompList = (params: TGetCompListParam) => fetch<getCompListReturn>('design/list', params, 'get')

type TSaveWorksParams = {
  title: string
  temp_id?: string
  width: number
  height: number
  data: string
  cover?: string
  id?: string | number
}

export type TSaveWorksResult = {
  id: number | string,
  stat?: number,
  msg: string
}

// 保存作品
export const saveWorks = (params: TSaveWorksParams) => fetch<TSaveWorksResult>('design/save', params, 'post')

// 获取作品
export const getWorks = (params: TGetTempDetail, token?: string) => fetch<TTempDetail>('design/poster', params, 'get', token ? { Authorization: token } : {})

type TGetMyDesignParams = {
  page: number
  pageSize: number
}

type TGetMyDesignResult = TPageRequestResult<IGetTempListData[]>

// 作品列表
export const getMyDesign = (params: TGetMyDesignParams) => fetch<TGetMyDesignResult>('design/my', params, 'get')
