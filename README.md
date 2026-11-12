# 随行 · 国际版

独立复制版。GitHub Pages 托管静态 PWA；Cloudflare Worker 提供独立登录会话、数据同步和 Geoapify 地图接口。原版账号可直接登录。国际版收藏存入独立表，与原版互不覆盖。若要复制行程，请从原版导出 JSON，再在国际版导入。

- 底图、全球地名／地址／兴趣点名称查询、步行／骑行／驾车：Geoapify。公共交通路线暂未接入。
- 密码只在 Worker 登录窗口输入。GitHub Pages 不处理密码；登录窗口向指定网页来源交付会话。Safari 需要允许打开登录窗口。
- 后端用 Worker Secret 配置 GEOAPIFY_API_KEY。不要把 Key 写进网页、公开仓库或聊天。
- 线上构建路径 /suixing-travel-map/；前端发布到 gh-pages，源代码位于 international 分支。原 main 保持原版。

本地用 Node 24：npm ci；npm run check；npm run build；node scripts/check-international.mjs。
后端部署：从 wrangler.international.json 生成未跟踪的配置并填原版 D1 的 ID。仅应用 standalone/intl-schema.sql，再部署新 Worker。不要将国际版部署到原 Worker。
