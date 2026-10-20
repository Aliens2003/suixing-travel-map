# 随行 · 旅行地图

供个人使用的旅行规划应用，面向 iPhone 和 iPad 浏览器。用户自己安排地点、顺序和时间。

## 功能

- 互动地图、地名搜索、定位、任意位置标记。
- 自定义名称、分类、图标、颜色、标签、备注、网址与想去／已去状态。
- 长期收藏、独立旅行、按天或无日期路线。
- 手动排列路线地点，逐段选择步行、骑行、驾车或公交／地铁。
- 登录后保存、云端状态读取、修订号冲突保护、JSON 导出和恢复。
- 本机最近保存内容的离线文字查看。

## 技术

React + TypeScript，Vinext／Vite，Cloudflare Workers／D1，Zod，Drizzle，Lucide。地图使用高德 JS API 和 Web 服务，未配置时提供 Leaflet／OpenStreetMap 底图分支。

本仓库用于源码版本管理。现有网站沿用原后端架构；前端包含服务端接口和数据库依赖，不能作为静态文件直接部署到 GitHub Pages。

## 本地运行

需要 Node.js 22.13 或更高版本，以及 npm。

```sh
npm ci
npm run dev
```

以启动器输出的本地网址为准。本地开发使用项目模板提供的模拟登录，线上身份由托管平台提供。需要 D1 时，先生成构建配置，再使用 Wrangler 将 `drizzle/` 中的迁移按顺序应用到本地数据库。

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_daffy_bushwacker.sql
```

## 地图配置

`.env.example` 只列变量名：

| 变量 | 用途 |
|---|---|
| AMAP_JS_KEY | Web 端 JS API Key |
| AMAP_SECURITY_CODE | 对应 JS API 安全密钥 |
| AMAP_WEB_KEY | Web 服务 API Key |

本地 Worker 可通过未跟踪的 `.dev.vars` 配置；正式环境通过托管平台的秘密环境变量配置。JS API Key 按供应商要求绑定适用域名，安全密钥和 Web 服务 Key 保留在服务端。

源代码中的 `.openai/hosting.json` 保留数据库绑定名称，站点身份由部署者另行配置。源码快照来自提交 `cebc23c389bfff6d98e917b4729b05de3aa3126e`，公开副本不包含现有站点 ID。

## 验证范围

第一版已完成本地类型检查、生产构建、状态 API 检查，以及实际高德底图、搜索和路线页面验证。实体设备触摸交互、真实双设备同步、备份往返和断网恢复仍需继续验收。

`scripts/check-travel.mjs` 面向启动后的本地测试服务和未配置地图的检查情形，不是通用生产测试命令。

## 数据和第三方文件

仓库包含程序代码、依赖锁文件、空白配置模板及必要静态资源。个人旅行数据、密钥、开发报告、本地数据库、缓存和依赖安装目录保留在仓库外。第三方库及模板自带的许可证与声明保留在相应目录。
