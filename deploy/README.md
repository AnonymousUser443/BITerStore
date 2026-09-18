# 本地测试部署

1. 复制 `.env.example` 为 `.env`，填写数据库、Redis、微信与 BIT-Login 配置。`REDIS_PASSWORD` 应使用长随机值；Compose 会关闭 Redis 默认账号，并只让位于内部数据网络的 API 使用 `biterstore` ACL 账号。图片默认写入持久化卷 `api-uploads`；生产环境推荐将 `UPLOAD_STORAGE` 改为 `r2` 并填写 R2 配置。R2 Bucket 保持私有，CORS 只需允许站点域名发起 `PUT` 与携带 `Content-Type`；图片读取统一经过 `/api/v1/media/:id`，ISBN 页不会从公开接口返回。R2 上线后先执行 `npm run r2:migrate-completed`，再执行 `npm run r2:configure-lifecycle`，为未完成的 `pending/` 上传设置 1 天自动清理并保留 Bucket 中的其他生命周期规则。
   上传清理应由宿主机 cron/任务计划每小时执行一次：`docker compose -f config.yaml exec api node dist/src/maintenance/cleanup-pending-uploads.js`（或在 API 容器中运行 `npm run uploads:cleanup-pending`）。脚本会同时清除超时的未完成上传，以及已完成但始终未绑定商品的对象；两个期限分别由 `UPLOAD_PENDING_TTL_SECONDS` 与 `UPLOAD_UNBOUND_TTL_SECONDS` 控制。R2 生命周期规则是第二道兜底。
2. 服务器不能直连书目数据源时，部署 `book-metadata-worker/`，并填写 `BOOK_METADATA_PROXY_URL` 与共享密钥 `BOOK_METADATA_PROXY_TOKEN`。Worker 优先使用 isbn.work（配置 `ISBN_WORK_APP_KEY` 时），随后依次使用 Google Books（配置密钥时）、Open Library 与 Crossref；所有候选结果都必须精确匹配请求的 ISBN。服务端会把成功结果缓存 30 天、未找到结果缓存 1 天。
3. 在 `miniProgram` 中以 `BITERSTORE_API_URL=https://api.example.com/api/v1` 构建 H5/WeApp，在 `admin` 中以 `VITE_API_URL=https://api.example.com/api/v1` 构建后台。
4. 执行 `docker compose -f config.yaml up -d --build`，默认仅监听远端回环地址 `127.0.0.1:18081`。
5. PostgreSQL 与 Redis 不映射宿主机端口，并位于独立的内部数据网络；H5、后台与 API 也不直接对外暴露。外部入口仅为 Nginx。
6. 首位管理员先使用学号完成校园登录，按需绑定微信，再在 API 容器中以 `USER_ID=<用户ID> npm run admin:promote` 授权，随后通过 Swagger 调用 TOTP setup/enable。

账号恢复关联清理应每天执行一次：`docker compose -f config.yaml exec api node dist/src/maintenance/cleanup-account-recovery-links.js`。超过 `ACCOUNT_RECOVERY_DAYS` 后，已注销账号不再能恢复为原账号。

`/api/v1/health` 只表示进程存活；`/api/v1/health/ready` 会检查 PostgreSQL、Redis、当前上传存储及 BIT-Login。Compose 只在 readiness 通过后把 Nginx 接到 API。

安装 k6 后，仅在本地或隔离测试环境执行 `k6 run -e API_URL=http://127.0.0.1:18081/api/v1 loadtest.js`。脚本模拟 100 个独立客户端持续访问 30 分钟；禁止把生产域名作为 `API_URL`。

部署前在被 `.gitignore` 排除的 `deploy/secrets/backup-passphrase.txt` 写入独立长随机口令，并限制为仅运维账号可读。将 `.env` 中的 `BACKUP_RUN_UID`、`BACKUP_RUN_GID` 设置为该文件及 `deploy/backups` 目录所有者的数字 UID/GID（默认 `1000:1000`）；不要为了让容器读取而放宽口令文件权限。`backup` 容器每天生成 PostgreSQL 自定义格式备份、校验归档、使用带完整性保护的 OpenPGP AES-256 对称加密，再次解密校验后才原子写入 `deploy/backups/*.dump.gpg`。明文只存在于容器临时目录，且首份归档完整生成前容器不会报告健康。具体恢复演练见 `docs/备份恢复与监控运行手册.md`。

本机图片位于 `api-uploads` 卷，应与数据库同时备份；R2 对象与加密数据库归档都必须再同步到异地私有存储。同步凭据不得写入仓库。只有本地备份不能视为灾备完成。
