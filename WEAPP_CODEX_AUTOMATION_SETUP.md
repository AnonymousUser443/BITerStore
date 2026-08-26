# 微信开发者工具自动化设置

## 一次性准备

1. 使用微信开发者账号登录开发者工具。
2. 打开“设置 → 安全设置 → 服务端口”。Agent 不会代为修改此设置。
3. 在 `taro/` 复制 `.env.example` 为 `.env.weapp.local`，填写开发者工具显示的 HTTP 服务端口。
4. 如需真机调试，在忽略提交的 `taro/project.private.config.json` 中配置本机真实 AppID；公共 `project.config.json` 始终使用 `touristappid`。

本机 Node 位于 `F:\BITerstore\.tools\node-v22.13.1-win-x64`。若未加入 PATH，可在 PowerShell 当前会话执行：

```powershell
$env:Path='F:\BITerstore\.tools\node-v22.13.1-win-x64;'+$env:Path
```

## 检查与运行

```powershell
cd F:\BITerstore\app\taro
npm run weapp:doctor
npm run build:weapp:e2e
npm run e2e:weapp:launch
```

- DevTools HTTP 服务端口来自安全设置，用于 CLI 调用。
- `9420` 是 automator WebSocket 端口，二者不能混用。
- `e2e:weapp:connect` 连接已运行的 9420 会话；`e2e:weapp:launch` 自行启动并在结束时关闭。
- 失败证据写入 `taro/qa-artifacts/`，该目录不会提交。

## 安全边界

- 禁止运行上传、预览上传、提审或发布命令。
- 禁止提交真实 AppID 私有覆盖、CLI token、端口、登录二维码和用户数据。
- 社区 MCP 仅可在仓库 E2E 通过后另行评估，不是当前必要依赖。
