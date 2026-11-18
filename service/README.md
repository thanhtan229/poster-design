## Node截图服务

TinixPoster hiện cần Node.js 22.12 trở lên theo phiên bản Puppeteer và better-sqlite3 đang dùng (đã kiểm tra với Node 24). Thông tin Node 16 bên dưới chỉ mô tả bản cũ. Sau khi cập nhật phụ thuộc, khởi động lại service để nạp phiên bản thư viện mới.

项目中所使用到的图片生成接口为：`api/screenshots`，在真实生产项目中可以把该服务单独部署，于内网调用，这样利于做一些鉴权之类的处理。

注：另外的 `api/printscreen` 本项目中并未使用，这个接口的作用是实现普通网页截图，可以传入一个 URL 生成该网址的预览图片，用于合成长图分享海报等场景。

### 安装依赖

`npm install`

安装依赖时可能会出现这个报错提示：

```
ERROR: Failed to set up Chromium xxx! Set "PUPPETEER_SKIP_DOWNLOAD" env variable to skip download.
```

这是因为 puppeteer 会自动下载 Chromium，国内网络多为失败。所以通常更推荐使用以下命令安装依赖：

`PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing npm install`

### 启动项目并热更新

`npm run dev`

### 打包

`npm run build`

#### 打包部署步骤

> 服务器环境需求：
> 
> - Node.js 16.18.1（早期生产版本，其它版本未测试）
> 
> - PM2（进程守护）

1. 本地执行 `npm run build` 打包
2. 打包后项目根目录 `dist/` 文件夹上传服务器，并执行 `npm install` 安装依赖
3. 运行 `pm2 start dist/server.js` 启动并守护服务

- 登录态使用 JWT，生产环境务必通过环境变量配置服务端密钥（见 `service/src/configs.ts`），不要使用默认值；
- SQLite 为 WAL 模式，备份/迁移时请将 `poster.db`、`poster.db-shm`、`poster.db-wal` 三个文件一并处理，或先停服后再拷贝。

### 配置说明

配置文件 `src/config.ts` 配置项说明：

```js
port // 端口号
website // 编辑器项目的地址
filePath // 生成图片保存的目录
```

### 僵尸进程问题

实测 puppeteer 在调用 Chromium 实例后，由于 Chrome 在运行时又会调用一些子进程，而销毁主进程时这些子进程就成了孤儿进程，最终大量堆积，它们不会占用内存，但最终可能导致 puppeteer 彻底瘫痪。建议通过 pm2 定时重启服务（如 `pm2 startOrRestart` 配合 cron），或使用任意容器/守护方案周期性释放进程。

### 环境变量

- `PORT`：服务监听端口（默认 7001）
- `AUTH_SECRET`：JWT 签名密钥，**生产环境必须设置**，不设置将使用内置默认值
- `PUPPETEER_DOWNLOAD_BASE_URL`：安装依赖时加速 Chromium 下载
