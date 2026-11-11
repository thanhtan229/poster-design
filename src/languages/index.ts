/*
 * @Author: ShawnPhang
 * @Date: 2024-05-19 04:14:02
 * @Description: i18n 示例
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-05-19 05:19:57
 */
import { createI18n } from 'vue-i18n'

import zh from './modules/zh'
import en from './modules/en'
import vi from './modules/vi' // [TINIX]

const i18n = createI18n({
  // Use Composition API, Set to false
  allowComposition: true,
  legacy: false,
  locale: getBrowserLang(),
  fallbackLocale: 'vi', // [TINIX]
  messages: {
    zh,
    en,
    vi, // [TINIX]
  },
})

/**
 * @description 获取浏览器默认语言
 * @returns {String}
 */
export function getBrowserLang() {
  // [TINIX] TinixPoster luôn dùng tiếng Việt (bỏ dòng này để quay lại tự nhận theo trình duyệt)
  if (true) return 'vi'
  let browserLang = navigator.language ? navigator.language : navigator.browserLanguage
  let defaultBrowserLang = ''
  if (['cn', 'zh', 'zh-cn'].includes(browserLang.toLowerCase())) {
    defaultBrowserLang = 'zh'
  } else {
    defaultBrowserLang = 'en'
  }
  return defaultBrowserLang
}

export default i18n
