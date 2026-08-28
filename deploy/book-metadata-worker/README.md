# BITerStore 书目代理

这是一个受限的 Cloudflare Worker：只接受有效的 ISBN-13，只访问 Open Library，并可选用 Google Books 作为后备。成功结果缓存 30 天，未找到缓存 1 天；它不是通用网络代理。

部署前生成一个随机共享密钥，然后分别写入 Worker 与 BITerStore 服务端：

```sh
npm install
npx wrangler secret put PROXY_TOKEN
# 可选：npx wrangler secret put GOOGLE_BOOKS_API_KEY
npm run deploy
```

将部署输出的 Worker 地址写入服务端 `BOOK_METADATA_PROXY_URL`，将同一密钥写入 `BOOK_METADATA_PROXY_TOKEN`。不要把密钥提交到 Git。
