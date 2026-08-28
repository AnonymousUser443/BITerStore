# 本地测试部署

1. 复制 `.env.example` 为 `.env`，填写数据库、微信与 BIT-Login 配置。图片默认写入持久化卷 `api-uploads`；生产环境推荐将 `UPLOAD_STORAGE` 改为 `r2` 并填写 R2 配置。R2 Bucket CORS 需要允许站点域名发起 `PUT` 与携带 `Content-Type`。
2. 服务器不能直连 Open Library 时，部署 `book-metadata-worker/`，并填写 `BOOK_METADATA_PROXY_URL` 与共享密钥 `BOOK_METADATA_PROXY_TOKEN`。服务端会把成功结果缓存 30 天、未找到结果缓存 1 天。
2. 在 `miniProgram` 中以 `BITERSTORE_API_URL=https://api.example.com/api/v1` 构建 H5/WeApp，在 `admin` 中以 `VITE_API_URL=https://api.example.com/api/v1` 构建后台。
3. 执行 `docker compose -f config.yaml up -d --build`，默认仅监听远端回环地址 `127.0.0.1:18081`。
4. PostgreSQL 与 Redis 不映射宿主机公网端口；外部入口仅为 Nginx。
5. 首位管理员先使用学号完成校园登录，按需绑定微信，再在 API 容器中以 `USER_ID=<用户ID> npm run admin:promote` 授权，随后通过 Swagger 调用 TOTP setup/enable。

安装 k6 后执行 `k6 run -e API_URL=http://localhost:8080/api/v1 loadtest.js`，脚本模拟 100 名同时在线用户持续访问 30 分钟。

`backup` 容器保留本地数据库备份。本机图片位于 `api-uploads` 卷，应与数据库一同纳入备份；R2 异地上传或数据库备份同步可在宿主机使用 `rclone`，凭据不得写入仓库。
