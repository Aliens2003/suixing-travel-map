# 随行 · 国际版

[国际版](https://suixing-international.suixing-aliens2003.workers.dev/) 的网页、登录、同步和地图接口均由独立 Cloudflare Worker 提供。使用原版账号登录。国际版收藏、会话和限流存入独立表；原版与国际版收藏互不覆盖，可经 JSON 手动复制。

- Geoapify 提供底图、全球地名／地址查询、步行／骑行／驾车。公共交通暂未接入。
- 在 Worker Secret 中配置 GEOAPIFY_API_KEY。不要把 Key 写进公开仓库。
- 同域登录使用 HttpOnly、Secure、SameSite=Strict 的会话 Cookie。
- 早期 GitHub Pages 网页保留原发布分支，仍可调用兼容接口。当前源码分支构建 Cloudflare 根路径版本。

本地用 Node 24：npm ci；npm run check；npm run build；node scripts/check-international.mjs。
部署前从 wrangler.international.json 生成未跟踪的配置，填写原版 D1 的 ID，应用 standalone/intl-schema.sql，再部署新 Worker。静态资源使用 dist/cloudflare，不要把 Git 工作目录设为 assets。
