# BITerStore 书目代理

这是一个受限的 Cloudflare Worker：只接受有效的 ISBN-13；有 Google Books 密钥时优先使用 Google Books，否则依次查询 Open Library 直查、Open Library 搜索索引与 Crossref 精确 ISBN 数据。成功结果缓存 30 天，未找到缓存 1 天；它不是通用网络代理。

部署前生成一个随机共享密钥，然后分别写入 Worker 与 BITerStore 服务端：

```sh
npm install
npx wrangler secret put PROXY_TOKEN
# 推荐：npx wrangler secret put ISBN_WORK_APP_KEY
# 推荐：npx wrangler secret put GOOGLE_BOOKS_API_KEY
npm run deploy
```

将部署输出的 Worker 地址写入服务端 `BOOK_METADATA_PROXY_URL`，将同一密钥写入 `BOOK_METADATA_PROXY_TOKEN`。`ISBN_WORK_APP_KEY` 用于优先查询 isbn.work 的中文书目数据；未配置、查询失败或没有精确匹配时，Worker 会继续查询其他来源。不要把任何密钥提交到 Git。

如果使用 API Token 自动部署，最小账户权限为 `Workers Scripts: Edit`；也可以直接执行 `npx wrangler login` 走浏览器授权。官方权限表见 <https://developers.cloudflare.com/fundamentals/api/reference/permissions/>。

R2 使用另一套 S3 凭据：在 R2 的 API Tokens 页面创建仅限目标 Bucket 的 `Object Read & Write` Token，记录 Access Key ID、Secret Access Key 与 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` Endpoint。Bucket 不要启用公开访问，只添加以下上传 CORS：

```json
[
  {
    "AllowedOrigins": ["https://store.young581.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

参考 Cloudflare 官方文档：<https://developers.cloudflare.com/r2/api/tokens/>、<https://developers.cloudflare.com/r2/buckets/cors/>。
