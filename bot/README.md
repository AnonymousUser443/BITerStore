# BITerStore QQ 运营机器人

这是一个基于 OneBot 11 反向 WebSocket 的只读运营机器人。它不会使用管理员 Cookie，只通过 `BOT_API_TOKEN` 访问 BITerStore 的机器人接口。

支持：

- 新商品进入待审核队列时，在配置的 QQ 群发送提醒；
- 每天按上海时间发送在售、待审核、今日提交、今日通过、今日售出和访问统计；
- 群内发送 `/今日`、`/今日数据` 或 `/待审核` 查询当前数据。

需要配置：

```env
BITERSTORE_API_URL=http://api:3100/api/v1
BOT_API_TOKEN=替换为随机长密钥
ONEBOT_WS_URL=ws://napcat:6700
ONEBOT_ACCESS_TOKEN=如果 OneBot 配置了 token
QQ_GROUP_IDS=群号1,群号2
BOT_REPORT_HOUR=20
BOT_REPORT_MINUTE=0
BOT_POLL_INTERVAL_MS=60000
BOT_STATE_FILE=/data/state.json
```

启动：

```bash
npm install
npm run start
```
