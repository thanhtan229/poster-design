/*
 * @Author: ShawnPhang
 * @Date: 2021-07-17 11:20:22
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>, Jeremy Yu <https://github.com/JeremyYu-cn>
 * @LastEditTime: 2024-03-01 20:55:51
 */

import { StyleValue } from "vue"

export type TWidgetClassifyData = {
  name: string
  icon: string
  show: boolean
  component: string
  style?: StyleValue
}

export default [
  {
    name: 'Mẫu', // [TINIX] 模板
    icon: 'icon-moban',
    show: false,
    component: 'temp-list-wrap',
  },
  {
    name: 'Chất liệu', // [TINIX] 素材
    icon: 'icon-sucai',
    show: false,
    component: 'graph-list-wrap',
  },
  {
    name: 'Chữ', // [TINIX] 文字
    icon: 'icon-wenzi',
    show: false,
    style: { fontWeight: 600 },
    component: 'text-list-wrap',
  },
  {
    name: 'Ảnh', // [TINIX] 照片
    icon: 'icon-gallery',
    show: false,
    component: 'photo-list-wrap',
  },
  // {
  //   name: '背景',
  //   icon: 'icon-beijing',
  //   show: false,
  //   component: 'bg-img-list-wrap',
  // },
  // [TINIX] Đã bỏ tab "Của tôi" (user-wrap): ảnh nằm ở dải ảnh, thiết kế lưu bằng tệp .tinix.zip (xem TINIX.md)
] as TWidgetClassifyData[]
