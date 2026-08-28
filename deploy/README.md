# 本地测试部署

1. 复制 `.env.example` 为 `.env`，填写数据库、微信、BIT-Login 和 R2 配置。
2. 在 `miniProgram` 中以 `BITERSTORE_API_URL=https://api.example.com/api/v1` 构建 H5/WeApp，在 `admin` 中以 `VITE_API_URL=https://api.example.com/api/v1` 构建后台。
3. 执行 `docker compose -f config.yaml up -d --build`，默认仅监听远端回环地址 `127.0.0.1:18081`。
4. PostgreSQL 与 Redis 不映射宿主机公网端口；外部入口仅为 Nginx。
5. 首位管理员先使用学号完成校园登录，按需绑定微信，再在 API 容器中以 `USER_ID=<用户ID> npm run admin:promote` 授权，随后通过 Swagger 调用 TOTP setup/enable。

安装 k6 后执行 `k6 run -e API_URL=http://localhost:8080/api/v1 loadtest.js`，脚本模拟 100 名同时在线用户持续访问 30 分钟。

`backup` 容器保留本地数据库备份。R2 异地上传需要在宿主机上使用 `rclone` 对 `deploy/backups` 建立加密同步任务，凭据不得写入仓库。
