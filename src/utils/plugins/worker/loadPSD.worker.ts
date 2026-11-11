/*
 * @Author: ShawnPhang
 * @Date: 2023-09-14 11:33:44
 * @Description: 加载PSD解析
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-17 18:57:15
 */
// import Psd from '@webtoon/psd'

// onmessage = async (e) => {
//   const result = await e.data.arrayBuffer()
//   const rawPsdFile = Psd.parse(result)
//   console.log(111, rawPsdFile)

//   const { width, height } = rawPsdFile
//   const psdFile = { width, height }

//   const compositeBuffer = await rawPsdFile.composite()

//   self.postMessage({ psdFile, compositeBuffer })
// }

import { processPSD2Page } from '@/utils/plugins/psd'
import { processPsdWithAg } from '@/utils/tinix/psd-ag' // [TINIX]

const errText = (err: any) => (typeof err === 'string' ? err : err?.message || String(err))

onmessage = async (e) => {
  // [TINIX] ag-psd first (reads recent Photoshop files); psd.js as fallback; always answer
  try {
    const data = await processPsdWithAg(e.data)
    self.postMessage({ data, parser: 'ag-psd' })
  } catch (agErr: any) {
    console.warn('[tinix:psd] ag-psd failed, trying psd.js:', errText(agErr))
    try {
      const data = await processPSD2Page(e.data)
      self.postMessage({ data, parser: 'psd.js' })
    } catch (err: any) {
      self.postMessage({ error: `ag-psd: ${errText(agErr)} | psd.js: ${errText(err)}` })
    }
  }
}