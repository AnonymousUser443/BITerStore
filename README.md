# BITerStore 移动端原型

BITerStore 是面向北京理工大学校园场景的二手书可交互原型。本仓库保留原始设计素材，并在 `web/` 中以 React、TypeScript 和独立 CSS 组件复现移动端视觉与交易闭环；设计稿没有被当作整页图片铺进页面。

## 本地运行

环境要求：Node.js 22.13 或更高版本。

```powershell
cd web
npm install
npm run dev
```

默认预览地址为 `http://localhost:3000`。生产校验：

```powershell
npm test
npm run lint
npm run build
```

## 功能范围

- 首次欢迎与 3 步新手指引
- 品牌首页、分类搜索、组合筛选和商品详情
- 收藏、联系卖家、消息列表和聊天发送
- 图片上传、Tobby 本地模拟识别、草稿、预览与发布
- 个人中心、收藏夹、发布状态管理和演示数据重置
- Loading、Searching、Empty、No Results、Network Error、Maintenance、Unavailable、Published 和 404 状态

核心页面由真实 DOM、表单和可交互组件组成。数据经异步 `DemoRepository` 访问，LocalStorage 保存演示状态，上传图片压缩后写入 IndexedDB；不连接真实后端、认证、支付或 AI 服务。

## 移动端边界

视觉以 390px 为主，覆盖 360–430px。桌面访问时会显示居中的 430px 移动应用画布，底栏位于画布内并适配安全区。验收截图保存在 `qa-screenshots/`。

## 目录

- `Assets/`：原始参考素材，不覆盖
- `web/app/`：路由、页面组件、数据仓库与样式
- `web/public/assets/`：WebP 响应式素材和生成头像
- `web/public/og.png`：部署社交预览图
- `TODO.md`：持续开发与验收记录
