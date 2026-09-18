# www.biterstore.top 校园内网 H5 访问与 R2 保留方案

日期：2026-09-18  
状态：代码默认地址已更新；服务器入口、证书、CORS 和实际发布仍待实施。

## 1. 目标与范围

校园网用户通过 `https://www.biterstore.top` 直连校园内服务器，地址栏不显示额外端口，H5 网站与 API 请求不经过现有公网隧道。沿用原来 `young581.com` 对应的 Cloudflare R2 账号、Bucket、对象及访问配置，不迁移图片。

本阶段将 H5 和微信端生产默认地址统一到 `https://www.biterstore.top`，保留 `https://store.young581.com` 作为现有入口及回退路径。当前不考虑微信上线，不处理平台合法域名、提审或发布；微信端代码和构建配置可以先切换到新域名用于校园内测试。关闭旧公网入口属于另一个变更，不随本方案自动执行。

**纠正此前说明：公网 DNS 可以返回私有 IP。** DNS 查询与访问服务器是两件事；客户端取得私有 IP 后，需要有通往该 IP 的网络路径。无需修改校园 DNS，也不需要用户逐台修改 hosts；但校园递归 DNS 必须能正常返回该解析结果。[阿里云 A 记录说明](https://help.aliyun.com/zh/dns/pubz-add-parsing-record)

## 2. 访问路径

```text
校园客户端查询 www.biterstore.top → DNS 返回服务器校园内网 IPv4
浏览器 HTTPS 默认 443 → NPM 终止 TLS → 项目 nginx:80
                                            ├─ H5 / 微信端 API
                                            ├─ Admin
                                            ├─ API → 现有 R2 私有存储
                                            └─ Bit-Login

浏览器上传图片 → API 获取预签名地址 → 现有 R2
```

DNS 只负责返回地址，不代理网页流量。“隐藏端口”通过让 NPM 监听标准 HTTPS 443 实现；应用内部的 18081 等端口无需出现在用户地址栏。NPM 官方部署也使用 80/443 作为入口。[NPM 配置说明](https://nginxproxymanager.com/guide/)

网站/API 走校园内网后，R2 上传、后端读取 R2、校园身份认证等外部依赖仍会产生对应网络延迟，不能承诺所有操作都变成纯内网速度。

## 3. 实施前检查

以下操作使用已经确认的生产连接；文档不保存 SSH 凭据、API 密钥或服务器私有配置。`<校园内网IPv4>` 替换为本次确认的服务器地址。

1. 从实际使用的校园 Wi-Fi、宿舍网络检查到服务器的可达性；同属校园网不保证所有网段互通。
2. 检查服务器 80/443 是否被占用：`ss -lntp`。如已有统一入口，应复用该入口，不能直接覆盖其他服务。
3. 核对运行中的 NPM Compose 文件、Docker 网络和证书位置；仓库配置仅是实施依据，不替代生产核验。
4. 备份将修改的 Compose、项目 Nginx 配置、NPM 数据和证书、环境变量及 R2 CORS 规则；保存在服务器受限目录，不提交仓库。
5. 记录当前发布标记、旧域名健康响应与图片访问情况，作为回退验收基线。

## 4. 阿里云 DNS（已完成，当前只做核验）

你已完成 `www.biterstore.top` 的解析。本阶段不再新增根域名记录，只核对该记录的返回值和线路：

| 项目 | 值 |
| --- | --- |
| 类型 | A |
| 主机记录 | `www` |
| 记录值 | `<校园内网IPv4>` |
| 解析线路 | 默认 |
| TTL | 600 秒，或控制台允许的值 |

检查同名 A/AAAA/CNAME，避免客户端解析到其他服务器。不要把 `www.biterstore.top` CNAME 到旧公网入口，否则仍会经过旧链路。根域名 `biterstore.top` 暂不作为 H5 入口，避免出现两个 Cookie、证书和回调入口。

校园 Windows 客户端验证：

```powershell
Resolve-DnsName www.biterstore.top -Type A
Test-NetConnection www.biterstore.top -Port 443
```

第二条在 NPM 开放 443 后执行。若权威解析正确而校园 DNS 返回错误或过滤私有地址，先定位解析问题；NPM 无法修复 DNS 过滤。校外设备通常无法访问该私有地址，符合内网入口的预期，但 DNS 本身不是访问控制。

## 5. NPM 监听与代理

仓库文件：`deploy/npm/config.yaml`。当前入口映射为回环地址的 19080、19443，管理端口为回环地址的 19081。保留这些映射，增加校园网卡的标准端口：

```yaml
ports:
  - "127.0.0.1:19080:80"
  - "127.0.0.1:19081:81"
  - "127.0.0.1:19443:443"
  - "<校园内网IPv4>:80:80"
  - "<校园内网IPv4>:443:443"
```

这是需替换地址的示意片段，不能原样执行。80 用于跳转到 HTTPS，443 提供网站；管理端口继续仅在本机开放。结合实际 Docker 防火墙链验证允许的校园来源，不假设普通宿主机防火墙规则必然覆盖 Docker 发布端口。

配置完成后，在实际 NPM Compose 目录执行 `docker compose -f config.yaml up -d`。

在 NPM 新建 **Proxy Host**：

| 字段 | 值 |
| --- | --- |
| Domain Names | `www.biterstore.top` |
| Scheme | `http` |
| Forward Hostname / IP | `nginx` |
| Forward Port | `80` |
| Cache Assets | 关闭，先沿用应用缓存策略 |
| Block Common Exploits | 开启 |
| Websockets Support | 开启 |
| SSL Certificate | 覆盖 `www.biterstore.top` 的受信任证书 |
| Force SSL | 证书配置成功后开启 |

`nginx:80` 是项目网关，仅在 NPM 与网关共享仓库定义的 `deploy_default` 网络时成立。不要转发回服务器的标准 80/443，否则可能进入 NPM 自身形成循环；NPM 容器中的 `127.0.0.1` 也不是宿主机。

检查 NPM 实际生成的配置，确保向网关传递正确 Host 和 `X-Forwarded-Proto: https`。新入口由 NPM 自己终止 TLS，不能照搬旧入口依赖 Cloudflare 转发头的判定方式，也不能信任客户端伪造的 Cloudflare 协议/IP 头。旧公网入口与新内网入口分别明确可信代理来源。

## 6. HTTPS 证书

使用 DNS-01 验证为 `www.biterstore.top` 签发浏览器信任的证书。DNS-01 验证域名 TXT 记录，不要求证书机构连接内网网站；HTTP-01 不适用于这个仅有私有地址的入口。[Let's Encrypt 验证方式](https://letsencrypt.org/docs/challenge-types/)

执行方式：

1. 若运行版本的 NPM 提供阿里云 DNS Provider，选择 DNS Challenge，按界面模板填写受限 DNS 凭据。
2. 若没有对应 Provider，在外部通过支持阿里云 DNS 的 ACME 工具签发，然后导入 NPM；同时安排自动续签与重新加载，不能只导入一次就结束。
3. 凭据仅保存于受限配置中，不写入方案或仓库。
4. 验证证书覆盖 `www.biterstore.top`，证书链受浏览器信任，无需跳过 TLS 校验。

旧域名证书不能直接用于新域名；不能使用仅受 Cloudflare 信任的 Origin CA 证书给校园浏览器直连。

## 7. 项目域名适配：必须与入口配置一起完成

### 7.1 网关与环境变量

| 位置 | 当前情况 | 拟调整 |
| --- | --- | --- |
| `deploy/nginx.conf` | HTTP 和 `/admin` 重定向固定旧域名 | 使用显式域名白名单，为新旧入口分别保留自身域名，未知 Host 拒绝或使用固定安全默认值 |
| NPM → 项目网关 | 原配置兼容公网代理链 | 核对新入口协议头、真实客户端地址及可信代理配置，不扩大为信任任意来源 |
| `deploy/.env` 的 `H5_ORIGIN` | 当前站点来源 | 在原列表追加 `https://www.biterstore.top`，不替换旧来源 |
| Bit-Login 的 `ALLOWED_CORS_ORIGINS` | 固定旧站 | 增加 `https://www.biterstore.top`，保留旧来源 |
| Bit-Login 的 `BASE_URL` | 固定旧站 | 核查生成 URL 的具体用途，为新入口避免跳回旧站；若为单一全局值，需完成双入口兼容后再切换 |
| H5 构建 | 支持相对 API 地址 | 保持 `/api/v1` 和 `/bit-login`，让请求使用当前域名 |
| CSP 和模板跳转 | 包含旧站点配置 | 检查新来源访问与跳转，不通过全面放宽 CSP 解决问题 |

`H5_ORIGIN` 第一项还决定当前微信网页 OAuth 成功后的跳转目的地；不能为增加新域名而直接替换第一项。微信小程序生产构建默认 API 和 BIT-Login 地址改为 `www.biterstore.top`，但当前不把微信平台合法域名、提审和发布作为前置条件；先在校园内完成代码和接口联调，后续上线前再补齐平台配置与真机验收。

新旧顶级域名不能共享登录 Cookie。首次打开 `www.biterstore.top` 需重新登录；之后继续复用该域名自己的会话。不得为了跨域共享而把 HttpOnly Cookie 改为前端可读令牌。

### 7.2 图片 URL：避免页面在内网、图片却回公网

代码检查发现 `PUBLIC_API_URL` 用于生成商品图片、会话私有图片及本地存储上传地址。只改 NPM 和 CORS 会留下旧域名的绝对 URL，既可能绕公网，也可能让新域名 Cookie 无法认证旧域名的私有图片。

推荐服务端 `PUBLIC_API_URL` 暂保留旧入口值，保留旧站兼容；在 H5 和微信端的统一 URL 适配层处理：

- 仅将明确属于本项目、且匹配白名单 API 媒体/本地上传路径的绝对 URL 转为当前站点的相对路径。
- 覆盖商品图片、用户头像、待审核/待修改图片、聊天私有图片及旧缓存中的相同地址。
- Admin 同样核对审核图片请求是否保持当前站点同源。
- 保留查询参数和路径；不对任意第三方 URL 进行替换。
- **R2 预签名上传 URL 原样使用，不能改域名或签名参数。**

需要增加定向测试：已知旧 API 图片转当前入口、私有图片携带当前会话、签名 R2 URL 不变、外部图片 URL 不变。单纯把全局 `PUBLIC_API_URL` 改成内网域名会影响旧公网用户，本阶段不采用。

## 8. 保留 young581.com 对应的现有 R2

“young581.com 的 R2”在本方案中指项目当前使用的 Cloudflare 账号、Bucket 和相关域名配置。实际 S3 Endpoint 以服务器现有配置为准，不假设它就是 `young581.com`。

以下全部保留：

- `R2_ENDPOINT`、`R2_BUCKET`、访问密钥和存储模式。
- 已有对象、对象 Key、数据库中的上传引用和生命周期规则。
- `young581.com` 下与现有 R2/书目 Worker 有关的域名、绑定及配置。
- 私有 Bucket 和现有权限校验，不为新入口把审核图片或聊天图片公开。

在实际 Bucket 的当前 CORS 规则中追加新来源。仓库 `deploy/r2-cors.json` 的等价修改示意如下：

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://store.young581.com",
        "https://www.biterstore.top"
      ],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"],
      "ExposeHeaders": ["etag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

操作时读取并合并真实规则，不用示例整体覆盖未知的生产规则。对象仍存于原 Bucket；允许新 Origin 不等于公开 Bucket。[Cloudflare R2 CORS 说明](https://developers.cloudflare.com/r2/buckets/cors/)

## 9. 实施顺序与职责（H5/微信端校园测试阶段）

| 顺序 | 操作 | 执行位置 |
| --- | --- | --- |
| 1 | 核对校园可达性、端口占用、生产拓扑并备份配置 | 校园客户端、服务器 |
| 2 | 为 `www.biterstore.top` 准备证书及续签方式 | 阿里云 DNS、NPM/ACME |
| 3 | 完成 H5 与微信端默认域名、图片地址适配，运行回归检查 | 项目仓库 |
| 4 | 追加 R2 CORS 来源，保留既有规则 | Cloudflare R2 |
| 5 | 部署兼容新旧域名的配置及代码，开放内网 NPM 80/443 | 服务器 |
| 6 | 用 `curl --resolve` 预验收 H5，再核对已完成的 `www` A 记录 | 校园客户端、阿里云 DNS |
| 7 | 浏览器验证新旧入口，记录发布标记和验收结果 | 校园客户端、服务器 |

`www.biterstore.top` 的 A 记录已由你创建；本阶段只核对解析结果，不重复创建或修改 DNS。涉及阿里云 DNS 和 R2 的操作通过实际控制台或受限凭据执行，不在聊天中收集密钥。

实现阶段修改 H5、`miniProgram/` 默认地址、服务端域名兼容配置和部署配置，按仓库要求运行 server/web/admin/miniProgram 测试、lint、H5 和 WeApp 构建；允许生成 WeApp 构建产物用于校园联调，但不上传、提审或发布微信平台，也不把合法域名审核作为本阶段阻塞项。

## 10. 验收标准

校园客户端基础检查：

```powershell
Resolve-DnsName www.biterstore.top -Type A
Test-NetConnection www.biterstore.top -Port 443
curl.exe --resolve www.biterstore.top:443:<校园内网IPv4> -I https://www.biterstore.top/
curl.exe https://www.biterstore.top/api/v1/health/ready
curl.exe -I https://www.biterstore.top/admin/
```

命令中占位地址需替换；不使用 `-k` 跳过证书校验。预验收时也可以给 ready/admin 请求增加同样的 `--resolve` 参数。

| 场景 | 通过标准 |
| --- | --- |
| 域名与路径 | 根域名解析为校园内网地址；浏览器连接目标为内网地址；URL 不带额外端口 |
| HTTPS | 证书受信任；HTTP 跳到新域名 HTTPS；无循环跳转 |
| 入口 | 首页、`/admin/` 和 ready 返回成功；`/admin` 跳到新域名的 `/admin/` |
| 登录 | 新域名校园登录成功；刷新可恢复会话；退出确实撤销登录 |
| 新旧隔离 | H5 新域名登录不依赖旧域名 Cookie；旧入口登录及原微信链路不受破坏 |
| 微信范围 | 微信端代码默认请求 `www.biterstore.top`；本阶段不处理合法域名、提审或发布 |
| 图片读取 | 公开、本人待审核、审核后台和聊天私有图片正常；未登录访问私有图片仍被拒绝 |
| 图片上传 | 新站预签名上传及完成接口成功；文件进入原 R2 Bucket；预检无 CORS 错误 |
| 网络路径 | 页面和项目 API/媒体请求走当前域名；R2 预签名地址和外部服务保留原目标 |
| 旧站回归 | `store.young581.com` 首页、API、后台与图片保持可用 |

用同一设备、同一账号、同一页面比较新旧入口首屏与 `/me` 请求耗时，区分网络往返和应用本身串行请求。内网入口只能降低链路开销，不能自动修复会话恢复逻辑中的等待。

## 11. 回退

1. 若新入口异常，停止向用户推广新域名，继续使用原入口。
2. 恢复此次修改前的应用配置/镜像及 NPM 配置；只处理新入口和本次改动，不停止其他 NPM 站点。
3. 如需撤销内网监听，移除本次新增的网卡 80/443 映射，保留原回环端口。
4. 移除 `www.biterstore.top` 的 A 记录或恢复原值，并考虑 DNS TTL 缓存。
5. R2 若需回退，仅移除本次新增的 Origin；不删除 Bucket、图片、原域名记录或原访问密钥。
6. 再次验证旧站、API ready、后台、登录与图片。没有数据库结构变更时不执行数据库回滚。

## 12. 本次交付

本次更新为 H5/微信端校园测试方案。`www.biterstore.top` 的 DNS 已创建；客户端默认地址和仓库 R2 CORS 示例已更新，证书、NPM、生产环境变量、实际 R2 CORS 和部署仍待实施。微信端只切换代码默认地址，不执行平台上传、提审或发布。
