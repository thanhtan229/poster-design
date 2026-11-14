/*
 * @Author: ShawnPhang
 * @Date: 2022-02-01 13:41:59
 * @Description: 配置文件
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2024-08-12 05:13:19
 */
const isDev = process.env.NODE_ENV === 'development'

// 服务器常用修改项
const serviceComfig = {
    port: 7001, // 端口号
    website: 'http://127.0.0.1:5173/', // 编辑器项目的地址
    filePath: '/cache/' // 生成图片保存的目录
}

/**
 * 端口号
 */
export const servicePort = serviceComfig.port

/**
 * 前端绘制页地址
 */
export const drawLink = process.env.TINIX_DRAW_URL || (isDev ? 'http://127.0.0.1:5173/draw' : serviceComfig.website + '/draw') // [TINIX] TINIX_DRAW_URL: chế độ production một cổng

/**
 * 图片缓存目录位置，根据实际情况调整
 */
export const filePath = isDev ? process.cwd() + `/static/` : serviceComfig.filePath

/**
 * 本服务自访问地址（封面生成时自调用截图接口）
 */
export const serviceLink = `http://127.0.0.1:${process.env.PORT || serviceComfig.port}`

/**
 * 静态资源（上传文件 / 生成图片）外链前缀
 * 使用相对路径入库，前端与后端同源部署时开箱可用；前后端异源部署时由网关将 /static 转发到本服务
 */
export const staticLink = '/static/'

/**
 * 用户认证 token 签名密钥（生产环境建议通过环境变量 AUTH_SECRET 覆盖）
 */
export const tokenSecret = process.env.AUTH_SECRET || 'xpai-design-admin-secret'

/**
 * 配置服务器端的chrome浏览器位置
 */
export const executablePath = isDev ? null : '/opt/google/chrome-unstable/chrome'

/**
 * 截图并发数上限
 */
export const maxNum = 2

/**
 * 截图队列的阈值，超出时请求将会被熔断
 */
export const upperLimit = 20

/**
 * 多久释放浏览器驻留内存，单位：秒（多标签页版生效）
 */
export const releaseTime = 300
