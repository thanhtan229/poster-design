/*
 * @Author: ShawnPhang
 * @Date: 2021-12-24 18:09:35
 * @Description: 异步队列
 * @LastEditors: ShawnPhang <site: m.palxp.cn>
 * @LastEditTime: 2023-07-06 10:19:40
 */
interface Queue {
  Fn: Function
  sign?: string | number
  reject: (error: Error) => void // [TINIX] Settle the caller when a waiting task is removed.
}

import { maxNum } from '../configs'
const queueList: Queue[] = [] // [TINIX] Store the settlement callback with each queued task.
let curNum = 0 // 当前执行的任务数

function queueRun(business: Function, ...arg: any) {
  return new Promise((resolve, reject) => {
    const Fn = async () => {
      try { resolve(await business(...arg)) } catch (error) { reject(error) }
    }
    const sign = { ...arg }[2]
    if (curNum >= maxNum) {
      queueList.push({ sign, Fn, reject }) // [TINIX]
    } else {
      run(Fn)
    }
  })
}

// [TINIX] Cancel waiting work only. Active renders own their own cleanup and limits.
function cancelQueuedRender(sign: Queue['sign']) {
  if (sign === undefined) return
  const index = queueList.findIndex(task => task.sign === sign)
  if (index === -1) return
  const [task] = queueList.splice(index, 1)
  task.reject(new Error('Quá thời gian phản hồi, vui lòng thử lại'))
}

function run(Fn: Function) {
  curNum++
  Promise.resolve().then(() => Fn()).finally(() => {
    curNum--
    const task = queueList.shift() // [TINIX] Start the next waiting task, if any.
    if (task) run(task.Fn)
  })
}

export { queueRun, queueList, cancelQueuedRender } // [TINIX]
