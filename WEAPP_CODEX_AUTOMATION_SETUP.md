# 微信开发者工具自动化设置

## 一次性准备

1. 使用微信开发者账号登录开发者工具。
2. 打开“设置 → 安全设置 → 服务端口”。Agent 不会代为修改此设置。
3. 在 `miniProgram/` 复制 `.env.example` 为 `.env.weapp.local`，填写开发者工具显示的 HTTP 服务端口。
4. 如需真机调试，在忽略提交的 `miniProgram/project.private.config.json` 中配置本机真实 AppID；公共 `project.config.json` 始终使用 `touristappid`。

请使用项目锁定的 Node 22.13.x。若使用便携版 Node，可在 PowerShell 当前会话执行：

```powershell
$env:Path='<Node 22.13.x 目录>;'+$env:Path
```

## 检查与运行

```powershell
cd <BITerStore 仓库>\miniProgram
npm run weapp:doctor
npm run build:weapp:e2e
npm run e2e:weapp:launch
```

- DevTools HTTP 服务端口来自安全设置，用于 CLI 调用。
- `9420` 是 automator WebSocket 端口，二者不能混用。
- `e2e:weapp:connect` 连接已运行的 9420 会话；`e2e:weapp:launch` 自行启动并在结束时关闭。
- `e2e:weapp:launch` 默认仅刷新当前项目的文件索引与编译缓存，避免 DevTools 沿用旧资源；不会清理账号、授权、业务 Storage 或安全设置。
- H5 使用包内 WebP，微信真机使用 `src/assets-weapp/` 的 PNG 兼容副本。`assets:verify-weapp` 会阻止缺图或本地 WebP 回归。
- `build:weapp` 与 `build:weapp:e2e` 会在编译后运行 `package:verify-weapp`：主包原始文件总量必须小于 1.5 MiB，估算上传载荷必须留在微信 2 MiB 限制内。若出现错误码 `80051`，不得关闭门禁，应压缩兼容素材或拆分分包。
- 公共 `project.config.json` 已启用 `setting.minified`，预览时继续勾选开发者工具的上传代码压缩，不要把未压缩构建用于真机二维码。
- 微信 `app.json` 由 Taro 生成 `lazyCodeLoading: requiredComponents`，启用组件按需注入；构建后门禁会验证该配置没有丢失。
- 失败证据写入 `miniProgram/qa-artifacts/`，该目录不会提交。

## 安全边界

- 禁止运行上传、预览上传、提审或发布命令。
- 禁止提交真实 AppID 私有覆盖、CLI token、端口、登录二维码和用户数据。
- 社区 MCP 仅可在仓库 E2E 通过后另行评估，不是当前必要依赖。
