# BITerStore Agent Rules

- `web/` 是视觉与行为 Golden Reference；迁移期间不得删除、重命名或为实现便利而重设计。
- 可见页面修改完成后必须运行 `miniProgram` 的 lint、test、H5 build 和 WeApp build；微信服务端口可用时还必须运行仓库内 E2E。
- 微信验收必须检查当前 route、稳定 `e2e-*` 元素、console/exception、结构快照和截图。
- 页面不得直接使用浏览器或微信专属 API；平台差异必须进入 `src/platform`。
- 不得上传体验版、提审、发布、修改用户 AppID、生成上传私钥或更改开发者工具安全设置。
- `.env.weapp.local`、`project.private.config.json`、CLI token、端口和实际失败工件不得提交。
- 社区 MCP 不是验收依据，不得暴露 `run_js`；确定性基线始终是版本化 E2E 脚本。
- 只允许本地里程碑提交；推送、部署和其他远端写入必须再次取得用户确认。
