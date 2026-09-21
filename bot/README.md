# BITerStore QQ 运营机器人

这是一个基于 QQ 官方机器人 WebSocket/OpenAPI 的只读运营机器人，也兼容 OneBot 11。它不会使用管理员 Cookie，只通过 `BOT_API_TOKEN` 访问 BITerStore 的机器人接口。

支持：

- 新商品进入待审核队列时，在配置的 QQ 群发送提醒；
- 每天按上海时间发送在售、待审核、今日提交、今日通过、今日售出和访问统计；
- 群内发送 `/今日`、`/今日数据` 或 `/待审核` 查询当前数据。

需要配置：

```env
BITERSTORE_API_URL=http://api:3100/api/v1
BOT_API_TOKEN=替换为随机长密钥
QQ_APP_ID=QQ开放平台的AppID
QQ_APP_SECRET=QQ开放平台的AppSecret
QQ_GROUP_OPEN_IDS=可选，多个群OpenID用逗号分隔；留空时首次@机器人会自动记录群
BITERSTORE_ADMIN_URL=https://store.young581.com/admin

# 如果使用个人QQ/NapCat，则使用下面的配置；官方机器人配置优先
ONEBOT_WS_URL=ws://napcat:6700
ONEBOT_ACCESS_TOKEN=如果 OneBot 配置了 token
QQ_GROUP_IDS=群号1,群号2
BOT_REPORT_HOUR=20
BOT_REPORT_MINUTE=0
BOT_POLL_INTERVAL_MS=60000
BOT_STATE_FILE=/data/state.json
```

官方机器人没有普通 QQ 群号。将机器人加入群后，在群里发送或 @机器人 `/今日`，程序会从 `GROUP_AT_MESSAGE_CREATE` 事件读取并保存 `group_openid`；也可以通过 `QQ_GROUP_OPEN_IDS` 固定允许的群。

启动：

```bash
npm install
npm run start
```
