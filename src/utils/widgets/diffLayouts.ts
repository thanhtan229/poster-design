/*
 * @Author: ShawnPhang
 * @Date: 2023-09-14 11:33:44
 * @Description: 依赖不能直接引入，所以暂时不使用WebWorker
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-04-19 03:07:18
 */
import diff from 'microdiff'
import { produce, applyPatches, enablePatches } from 'immer'
enablePatches()
const ops: any = {
  CHANGE: 'replace',
  CREATE: 'add',
  REMOVE: 'remove',
}
export function historyPatches(before: any, after: any) {
  const changes = diff(before, after)
  const ordered = changes.filter(item => item.type !== 'REMOVE')
    .concat(changes.filter(item => item.type === 'REMOVE').reverse())
    .map(item => ({ ...item, op: ops[item.type] }))
  let result: { patches: any[]; inversePatches: any[] } = { patches: [], inversePatches: [] }
  produce(before, draft => { applyPatches(draft, ordered as any) }, (patches, inversePatches) => {
    result = { patches, inversePatches }
  })
  return result
}

export default class {
  private notifi: any
  private cloneData = ''
  constructor() { }
  /**
   * onmessage
   */
  public onmessage(cb: any) {
    this.notifi = cb
  }
  public postMessage(e: any) {
    if (!e) return
    if (e.op === 'done') {
      if (!this.cloneData) return
      this.notifi(historyPatches(JSON.parse(this.cloneData), JSON.parse(e.data)))
      this.cloneData = ''
    } else this.cloneData = e.data
  }
}
