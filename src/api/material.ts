/*
 * @Author: ShawnPhang <https://m.palxp.cn>
 * @Date: 2021-08-27 14:42:15
 * @Description: 媒体相关接口
 * @LastEditors: Jeremy Yu <https://github.com/JeremyYu-cn>
 * @LastEditTime: 2024-09-25 00:39:00
 */
import fetch from '@/utils/axios'
import _config from '@/config'
import { IGetTempListData } from './home'

export const getAssetCategories = (type: 'materials' | 'photos') => fetch<{ list: { id: number; cate: string; name: string; type: string }[] }>('design/asset/categories', { type })

type TGetListParam = {
  first_id?: number
  second_id?: string
  cate?: string | number
  pageSize?: number
}

export type TGetListData = {
  category: number
  created_time: string
  height: number
  id: number
  model: string
  original: string
  state: number
  thumb: string
  title: string
  type: string
  updated_time: string
  url: string
  width: number
  thumbUrl: string
  imgUrl: string
}

export type TGetListResult = TPageRequestResult<TGetListData[]>

// 获取素材列表：
export const getList = (params: TGetListParam) => fetch<TGetListResult>('design/material', params)

export type TGetFontParam = {
  pageSize?: number
}

/** 字体 item 数据（公开接口返回：不含 created_at 等管理字段） */
export type TGetFontItemData = {
  id: number
  alias: string
  value: string
  preview: string
  woff: string
  ttf?: string
  lang: 'zh' | 'en' | 'ko' // [TINIX] thêm ko (tiếng Hàn)
  font_family?: string
  size?: number
  woff_size?: number
}

// 获取字体（公开接口，无分页 total）
export const getFonts = (params: TGetFontParam = {}) => fetch<{ list: TGetFontItemData[] }>('design/fonts', params)

type TGetFontSubParam = {
  font_id: string | number
  id: string | number
  content: string
}

type TGetFontSubExtra = {
  responseType?: string
}

// 字体子集化（服务端暂未提供该接口，受 _config.supportSubFont 门控，默认关闭）
export const getFontSub = (params: TGetFontSubParam, extra: TGetFontSubExtra = {}) => fetch<Blob | string>('design/font_sub', params, 'get', {}, extra)

type TGetImageListParams = {
  page?: number
  pageSize?: number
  cate?: string | number
}

export type TGetImageListResult = {
  created_time: string
  height: number
  width: number
  url: string
  user_id: number
  id: string
  thumb?: string
} & Partial<IGetTempListData>

// 图库列表
export const getImagesList = (params: TGetImageListParams) => fetch<TPageRequestResult<TGetImageListResult[]>>('design/imgs', params, 'get')

type TMyPhotoParams = {
  
  page: number
  pageSize?: number
}

/** 获取我的资源管理返回 */
export type TMyPhotoResult = {
  created_time: string
  height: number
  id: number
  url: string
  user_id: number
  width: number
} & IGetTempListData

// 我的上传列表
export const getMyPhoto = (params: TMyPhotoParams) => fetch<TPageRequestResult<TMyPhotoResult[]>>('design/user/image', params)

type TDeleteMyPhotoParams = {
  id: string | number
}

export const deleteMyPhoto = (params: TDeleteMyPhotoParams) => fetch<void>('design/user/image/del', params, 'post')

type TDeleteMyWorksParams = {
  id: string | number
}

export const deleteMyWorks = (params: TDeleteMyWorksParams) => fetch<void>('design/poster/del', params, 'post')

// 上传接口（后端保存文件成功后会自动记录到"我的上传"列表，无需再单独调用添加接口）
export const upload = ({ file, folder = 'user' }: any, cb: Function) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)
  const extra = {
    responseType: 'application/json',
    onUploadProgress: (progress: any) => {
      cb(Math.floor((progress.loaded / progress.total) * 100), 0)
    },
    onDownloadProgress: (progress: any) => {
      cb(100, Math.floor((progress.loaded / progress.total) * 100))
    },
  }
  return fetch(`${_config.SCREEN_URL}/api/file/upload`, formData, 'post', {}, extra)
}
