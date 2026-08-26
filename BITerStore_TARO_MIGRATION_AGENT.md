# BITerStore — Taro 双端迁移 Agent 执行说明

> 目标：在**不丢失当前 H5 高保真原型成果**的前提下，将 BITerStore 正式前端迁移为 **Taro + React**，以 **微信小程序为主产物、H5 为第二产物**，实现“一套业务核心 + 少量平台适配”的双端架构。
>
> 核心原则：**Behavior parity first, feature expansion second.**
>
> 本文档是本轮迁移任务的最高优先级执行说明。若它与仓库中旧版 `TODO.md` / Agent 指南存在冲突，以本文档为准；但不得擅自删除旧文档，应在迁移完成后同步更新。

---

## 0. 开始前必须做的事

Agent 在修改任何代码前，必须依次完成：

1. 阅读仓库根目录：
   - `README.md`
   - `TODO.md`
   - `Agent工作指南.md`（文件名可能经过编码）
2. 阅读当前前端关键文件：
   - `web/app/components/mobile-app.tsx`
   - `web/app/components/client-mobile-app.tsx`
   - `web/app/lib/repository.ts`
   - `web/app/lib/types.ts`
   - `web/app/lib/demo-data.ts`
   - `web/app/lib/image-store.ts`
   - `web/app/globals.css`
   - `web/package.json`
3. 浏览 `qa-screenshots/` 中现有 360 / 390 / 430px 验收截图。
4. 检查 Git 状态和最近提交：
   ```bash
   git status
   git log --oneline --decorate -n 15
   git tag --list
   ```
5. **不得在工作区有未提交改动时开始迁移。**
6. 更新根目录 `TODO.md`，新增“Taro 迁移”阶段，并持续维护完成状态。

---

# 1. 当前项目基线

当前仓库已经有一套完整的移动端 H5 高保真交互原型。

现状包括：

- React 19 + TypeScript
- Next / Vinext / Vite 构建链
- 自定义 CSS 视觉系统
- `DemoRepository` 异步数据边界
- LocalStorage
- IndexedDB 图片持久化
- Service Worker 资源缓存
- Vitest 单元测试
- 360 / 390 / 430px 移动端视觉验收截图

当前已经实现的主要业务闭环：

```text
欢迎 / 新手引导
    ↓
首页
    ↓
搜索 / 分类 / 筛选
    ↓
商品详情
    ↓
收藏 / 联系卖家
    ↓
站内聊天
    ↓
校内线下交易

以及：

发布闲置
    ↓
图片上传
    ↓
Tobby 一键成文（当前为本地规则模拟）
    ↓
完善信息
    ↓
预览
    ↓
发布
```

当前 H5 **不是废弃代码**。

它将作为：

- 迁移行为基准
- 视觉 Golden Reference
- 双端回归对照
- 可复用业务逻辑来源
- 素材与 Design Token 来源

---

# 2. Git 策略：同仓库迁移，不新开仓库

## 2.1 禁止创建独立 `BITerStore-Taro` 仓库

Taro 版本仍属于同一个 BITerStore 产品，因此：

**必须继续使用当前 Git 仓库。**

不要建立两个长期独立维护的前端仓库，否则会导致：

- Design Token 分叉
- Tobby 素材版本不一致
- BookCard 等业务组件修复不同步
- API 类型重复维护
- 产品功能出现双版本漂移

---

## 2.2 给当前稳定 H5 打里程碑 Tag

确认当前 `main` 干净且当前构建确实对应稳定 H5 基线后：

```bash
git switch main
git status
```

若当前稳定版本还没有合适的里程碑 Tag，则创建：

```bash
git tag h5-prototype-v0.1
git push origin h5-prototype-v0.1
```

如果仓库已经存在含义相同的稳定 Tag：

**不要重复创建。**

禁止：

```bash
git tag -f ...
git push --force ...
```

除非项目负责人明确要求。

---

## 2.3 创建迁移分支

```bash
git switch -c refactor/taro-migration
```

后续所有迁移工作先在：

```text
refactor/taro-migration
```

进行。

在双端验收完成前：

**不要直接破坏 `main`。**

---

# 3. 本轮迁移的真正目标

目标不是：

> “把现有 React 网页勉强塞进小程序。”

目标是：

> **重新建立一套以 Taro React 为正式客户端基座的跨端前端，同时最大限度复用当前业务模型、素材、交互和视觉系统。**

最终主要产物：

```text
Taro React Source
      │
      ├── 微信小程序（主产物）
      │
      └── H5（第二产物）
```

预期代码共享模式：

```text
              Shared Business Core
         页面业务 / 类型 / API / 状态
                  │
          Platform Adapters
          ↙               ↘
      WeChat             H5
```

目标不是 100% 无条件共享。

合理目标：

- 主体业务页面与组件：高度共享
- 类型 / Repository / Domain：尽量 100% 共享
- 登录 / 分享 / 存储 / 图片 / 通知：平台适配
- 极少数 UI 或 API：按端差异实现

---

# 4. 目录策略：迁移期间保留现有 `web/`

为了避免一次性重命名导致大量无意义 Git diff，本阶段**不要立刻移动或删除现有 `web/`**。

建议迁移阶段使用：

```text
BITerStore/
├─ Assets/
├─ qa-screenshots/
│
├─ web/                       # 当前 H5 基线，迁移期间保持可运行
│
├─ taro/                      # 新正式客户端
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  ├─ domain/
│  │  ├─ repository/
│  │  ├─ services/
│  │  ├─ platform/
│  │  ├─ styles/
│  │  └─ assets/
│  ├─ config/
│  └─ package.json
│
├─ packages/                  # 仅在真正有复用价值时建立
│  ├─ domain/
│  ├─ design-tokens/
│  └─ shared/
│
├─ README.md
├─ TODO.md
└─ TARO_MIGRATION_AGENT.md
```

注意：

**不要为了“架构看起来漂亮”立刻把所有东西抽成 package。**

优先做到：

1. 能运行
2. 能双端构建
3. 行为一致
4. 视觉一致
5. 再做抽象

避免过早工程化。

---

# 5. Taro 技术基座

使用：

- Taro
- React
- TypeScript

版本原则：

- 使用迁移时的稳定、兼容版本
- 不要为了追最新版同时升级大量无关依赖
- 避免一次迁移同时进行 React 大版本实验

核心代码必须使用跨端组件，例如：

```tsx
import {
  View,
  Text,
  Image,
  Input,
  ScrollView,
} from '@tarojs/components'
```

禁止在需要编译到微信小程序的共享页面中大量继续使用：

```tsx
<div />
<span />
<img />
<input />
```

也不要继续依赖：

- `window`
- `document`
- `history.pushState`
- `localStorage`
- `indexedDB`
- DOM query
- Web-only lifecycle

这些能力必须隔离到平台层。

---

# 6. 迁移优先级：先复刻，不新增

第一阶段必须坚持：

> **Behavior parity first.**

即先让 Taro 版本完整复刻当前稳定 H5 已经存在的行为。

本轮迁移阶段暂时不要顺手大规模加入：

- 新版 EXP 个人中心
- 粉丝 / 关注社交系统
- “关于 Tobby”
- Tobby MBTI 投票
- 真正的大模型接口
- 真正校园认证
- 真支付
- 新后端 API
- 全新功能重设计

这些已经有产品设计方向，但属于：

```text
Phase 2 — Feature Expansion
```

而不是基础迁移阶段。

---

# 7. 产品命名更新：第二导航项统一为“搜索”

当前旧版 H5 / `TODO.md` 中底栏第二项曾写作：

```text
分类
```

最新产品决策已经更新为：

```text
首页 / 搜索 / 发布 / 消息 / 我的
```

因此 Taro 正式版本：

**第二导航项统一显示为“搜索”。**

旧 `/category` 页中的能力并不丢弃，而是整合为：

```text
Search Page
├─ 搜索框
├─ 类别快捷筛选
├─ 校区
├─ 成色
├─ 价格
├─ 排序
├─ 只看可交易
├─ 高级筛选
└─ 搜索结果
```

可以在迁移期内部继续复用 category 相关数据结构，但用户可见命名应迁移到“搜索”。

---

# 8. 页面拆分要求

当前 H5 中 `mobile-app.tsx` 承载了较多页面和路由逻辑。

Taro 重构时禁止继续把全部页面塞进一个超级组件。

建议至少拆分：

```text
src/pages/
├─ welcome/
├─ onboarding/
├─ home/
├─ search/
├─ book-detail/
├─ publish/
├─ messages/
├─ notification-detail/
├─ chat/
├─ profile/
├─ favorites/
├─ my-listings/
└─ states/
```

通用组件拆分：

```text
src/components/
├─ AppShell/
├─ BottomNav/
├─ BrandHeader/
├─ BookCard/
├─ BookList/
├─ SearchBar/
├─ FilterChip/
├─ Tobby/
├─ TobbyBubble/
├─ EmptyState/
├─ Toast/
├─ Modal/
├─ FormField/
└─ StatusTag/
```

原则：

**按稳定复用价值拆，不按“看起来组件化”机械拆。**

---

# 9. Repository 层必须保留

当前工程一个重要优点是：

> UI 不直接依赖 LocalStorage / IndexedDB，而通过 `DemoRepository` 访问数据。

这个设计必须保留。

目标结构：

```text
UI
 │
Repository Interface
 │
├── DemoRepository
└── ApiRepository（未来）
```

页面禁止出现：

```ts
localStorage.getItem(...)
indexedDB.open(...)
fetch('/api/...') // 若未来接口层已有 Repository 时
```

业务 UI 应只调用统一接口。

例如：

```ts
repository.listBooks()
repository.getBook(id)
repository.toggleFavorite(id)
repository.saveDraft(draft)
repository.publishListing(listing)
repository.listMessages()
repository.sendMessage(...)
```

这样未来接真实后端时，只需要替换 Repository 实现。

---

# 10. Platform Adapter

必须建立明确的平台适配边界。

建议：

```text
src/platform/
├─ auth/
├─ navigation/
├─ storage/
├─ media/
├─ share/
├─ notification/
└─ cache/
```

允许采用 Taro 环境判断或平台文件：

```text
auth.weapp.ts
auth.h5.ts

share.weapp.ts
share.h5.ts

storage.weapp.ts
storage.h5.ts
```

上层业务代码只调用统一接口。

---

## 10.1 Navigation

当前 H5 中存在：

```text
window.history.pushState
history.back
window.location.pathname
popstate
```

Taro 端迁移为统一导航封装：

```ts
navigateTo(...)
navigateBack(...)
switchTab(...)
replace(...)
```

底层可使用：

```ts
Taro.navigateTo
Taro.navigateBack
Taro.switchTab
Taro.redirectTo
```

业务页面不要直接依赖浏览器 history。

---

## 10.2 Storage

当前：

```text
LocalStorage
IndexedDB
```

迁移目标：

```text
StorageAdapter
├─ H5 implementation
└─ WeApp implementation
```

普通状态可使用：

```ts
Taro.setStorage
Taro.getStorage
```

大图片或临时文件不要粗暴塞入普通 storage。

---

## 10.3 图片选择 / 上传

当前 Web 端的：

```html
<input type="file">
```

微信端不能直接复用。

建立：

```text
MediaAdapter
```

例如：

```ts
chooseImages()
compressImage()
readImageMetadata()
```

微信实现可以基于 Taro / 小程序媒体 API。

H5 实现则继续使用浏览器文件选择能力。

---

## 10.4 分享

业务层只传：

```ts
{
  type: 'book',
  id: book.id,
  title: book.title
}
```

平台层负责转换：

H5：

```text
https://.../books/:id
```

微信：

```text
/pages/book-detail/index?id=:id
```

不要在业务层假设小程序分享是 HTML `<a>` 标签。

---

## 10.5 通知

微信订阅消息 / H5 Web Notification 等能力必须独立适配。

迁移阶段如果当前 Demo 没有真实通知能力：

**保持模拟，不要顺便接真实服务。**

---

## 10.6 Service Worker / Cache

当前 H5 的 Service Worker：

- 可以继续留在 legacy H5
- Taro H5 可单独评估是否继续使用
- 微信小程序端不要照搬

微信端缓存逻辑应遵循小程序自己的资源与文件机制。

---

# 11. Design System 必须复用

现有视觉 Token：

```text
Primary Sage       #6F7956
Dark Olive         #4F5940
Cream Background   #F7F4EA
Warm Border        #D5C7A7
Price Accent       #C56E3B
Holographic Aqua   #78D8C6
```

迁移时应建立统一 Token，例如：

```ts
export const colors = {
  primarySage: '#6F7956',
  darkOlive: '#4F5940',
  creamBackground: '#F7F4EA',
  warmBorder: '#D5C7A7',
  priceAccent: '#C56E3B',
  holographicAqua: '#78D8C6',
}
```

禁止迁移过程中因为方便：

- 换成默认蓝色
- 换 UI 框架默认主题
- 用微信原生灰色组件替代全部视觉
- 把 BITerStore 改成普通商城风格

---

# 12. 不要擅自重新设计 UI

`qa-screenshots/` 是当前稳定 H5 的 **Golden Visual Reference**。

迁移时必须遵循：

> 当实现方便性与当前视觉发生冲突时，优先尝试保持当前视觉；确实存在平台限制时，再做最小差异适配并记录。

禁止 Agent：

- 自己重新布局首页
- 擅自改字号体系
- 更换主色
- 删除 Tobby
- 改造成标准 Taro Demo 风格
- 用整页截图代替真实 UI

所有页面必须仍由真实组件实现。

---

# 13. Bottom Navigation

正式产品导航：

```text
首页
搜索
发布
消息
我的
```

视觉上保持现有高保真底栏语言：

- 大圆角
- 鼠尾草绿激活态
- 中间发布入口重点突出
- Tobby / 小型叶片点缀适度使用

不要仅为了省开发时间直接切换成完全不同风格的系统默认 TabBar。

如果微信小程序导航机制要求使用原生 / custom tabBar：

- 将差异隔离
- 保持用户可见视觉尽量一致
- 不影响页面业务组件

---

# 14. Tobby 资产迁移规则

Tobby 是产品 Identity，不是普通插图。

必须保留：

- 现有 Character Master
- 简化小尺寸素材
- 状态插画
- 表情素材
- 背景图
- 欢迎页素材

迁移时：

- 不覆盖原始 `Assets/`
- 使用 WebP / 合理压缩版本作为运行资源
- 不把超大 PNG 原图直接塞进首屏
- 首屏关键 Tobby 素材可预加载
- 非首屏素材按需加载
- 长列表避免重复加载大图

---

# 15. 发布页：Tobby 一键成文

当前功能是：

```text
本地规则模拟
```

本阶段迁移必须保持这个行为，而不是直接接真实 AI。

建议抽象接口：

```ts
interface ListingAssistant {
  generate(input: ListingAIInput): Promise<ListingAIDraft>
}
```

当前：

```text
DemoListingAssistant
```

未来：

```text
MultimodalListingAssistant
```

预期未来结构化返回：

```ts
{
  title,
  author,
  isbn,
  category,
  course,
  suggestedCondition,
  suggestedPrice,
  description,
  tags
}
```

页面只消费结构化结果，不依赖具体模型。

---

# 16. 聊天页

迁移必须保持现有演示能力：

- 文本消息
- 图片消息
- 站内书籍链接
- 未读状态
- 交易安全提醒

平台 UI 与 Repository 分离。

暂时不要引入复杂 IM SDK，除非项目负责人另行决定。

---

# 17. 性能重点

BITerStore 当前性能风险主要不是复杂计算，而是：

- Tobby 大图
- 背景 BG
- 商品封面
- 长列表
- 多张发布图片

优先：

- 图片压缩
- 合理尺寸
- lazy load
- 分页 / 增量加载
- 首屏资源控制
- 避免大面积无意义动画

不要为了“GPU 加速”进行过度优化。

禁止迁移阶段引入：

- 重 WebGL 特效
- 大型粒子系统
- 高成本骨骼动画

除非明确需求。

---

# 18. 推荐迁移顺序

必须分阶段迁移，不要一次性全部推倒。

## Phase 0 — Baseline Freeze

- [ ] 确认 `main` 干净
- [ ] 确认当前 H5 可运行
- [ ] 确认 / 创建稳定 Tag
- [ ] 建立 `refactor/taro-migration`
- [ ] 更新 TODO

---

## Phase 1 — Taro Skeleton

- [ ] 初始化 `taro/`
- [ ] Taro React + TypeScript
- [ ] 微信小程序构建成功
- [ ] H5 构建成功
- [ ] 建立基础 App Shell
- [ ] 建立页面路由
- [ ] 建立 Design Tokens
- [ ] 建立 Platform Adapter 空接口

完成后必须提交一次独立 Git commit。

---

## Phase 2 — Shared Domain / Repository

- [ ] 迁移 / 重构类型
- [ ] 迁移 Demo 数据
- [ ] 迁移 Repository Interface
- [ ] DemoRepository 双端可运行
- [ ] StorageAdapter
- [ ] MediaAdapter 基础接口

完成后运行测试并提交。

---

## Phase 3 — Core Navigation

按顺序：

1. Welcome
2. Onboarding
3. Home
4. Search
5. Book Detail

要求：

- 页面跳转正确
- 视觉基本一致
- 小程序和 H5 都能运行

---

## Phase 4 — Publish

- [ ] 图片选择
- [ ] 草稿
- [ ] 表单
- [ ] Tobby 一键成文模拟
- [ ] 预览
- [ ] 发布成功状态

这是核心流程，必须单独验收。

---

## Phase 5 — Messages

- [ ] 消息中心
- [ ] 通知分类
- [ ] 私聊列表
- [ ] 聊天
- [ ] 图片
- [ ] 站内书籍链接
- [ ] 未读状态

---

## Phase 6 — Profile / Management

迁移当前 H5 已存在：

- [ ] Profile
- [ ] Favorites
- [ ] My Listings
- [ ] Demo reset / management

注意：

新版 EXP / 粉丝 / About Tobby 暂不属于 parity 阶段。

---

## Phase 7 — State Pages

迁移：

- [ ] Loading
- [ ] Searching
- [ ] Empty
- [ ] No Results
- [ ] Network Error
- [ ] Maintenance
- [ ] Book Unavailable
- [ ] Published Successfully
- [ ] 404

---

## Phase 8 — 双端视觉与行为验收

H5：

- [ ] 360px
- [ ] 390px
- [ ] 430px

微信小程序：

- [ ] 常见手机尺寸
- [ ] Safe Area
- [ ] 底部导航
- [ ] 滚动区域
- [ ] 键盘顶起
- [ ] 图片选择
- [ ] 页面返回
- [ ] 分享入口（即使暂为 stub）

---

# 19. Golden Screenshot 回归方式

迁移期间建议同时运行：

```text
Legacy H5
Taro H5
WeChat Mini Program
```

逐页比较：

```text
legacy H5 @ 390px
        vs
Taro H5 @ 390px
        vs
WeApp Device Screenshot
```

允许平台导致的轻微字体 / 控件差异。

不允许：

- 页面结构明显改变
- 信息层级变化
- 品牌色漂移
- Tobby 被删除
- 商品卡信息缺失
- Bottom Nav 功能变化

---

# 20. 测试要求

当前已有 Repository 测试覆盖：

- 组合筛选
- 价格排序
- 收藏持久化
- 草稿 + 发布
- 消息追加

迁移时：

1. 尽量保留这些测试逻辑。
2. 将纯业务测试迁移为平台无关测试。
3. Platform Adapter 单独补最小测试。
4. 不允许为了“让测试通过”删除关键断言。

每个阶段至少执行：

```bash
lint
test
build:h5
build:weapp
```

具体命令根据最终 Taro `package.json` 确定。

---

# 21. 每次提交建议

建议小步提交，例如：

```text
chore: initialize taro dual-platform workspace
refactor: extract shared domain and repository contracts
feat: migrate welcome and onboarding to taro
feat: migrate home and search flows
feat: migrate publish flow and media adapter
feat: migrate messages and chat
feat: migrate profile and state pages
fix: align taro h5 visual parity at 390px
fix: align weapp safe-area and tab navigation
docs: complete taro migration notes
```

不要一个 commit 塞完整迁移。

---

# 22. 明确禁止事项

迁移阶段禁止 Agent：

- 新建独立长期仓库
- 删除 `web/`
- 强推 `main`
- 重写 Git 历史
- 覆盖原始 `Assets/`
- 顺手重做整套 UI
- 用截图作为页面背景代替真实 UI
- 把全部页面继续塞进单个超级组件
- 让共享业务代码直接依赖 `window` / `document`
- 为了跨端方便删除关键交互
- 把真实 AI / 后端接入混进基础迁移
- 擅自改变产品核心流程

---

# 23. Phase 2：迁移完成后才允许继续的新功能

Taro 基座完成并合并回主线之后，再继续开发：

## 新版“我的”

- EXP 经验条
- 等级
- 关注人数
- 粉丝人数
- 发布数量
- 获赞数量
- 更多个人工具栏

## 关于 Tobby

- Tobby 的诞生理念
- “托付”品牌解释
- Tobby 小档案
- 角色世界观
- 彩蛋入口

## Tobby MBTI 投票

示例：

```text
猜一猜 Tobby 是什么 MBTI？
ENFP
INFJ
INFP
ENFJ
其他
```

属于轻量品牌彩蛋，不应影响主要交易流程。

## 真实 AI

将：

```text
DemoListingAssistant
```

替换为后端多模态服务。

## 真实 Backend

将：

```text
DemoRepository
```

替换 / 扩展为：

```text
ApiRepository
```

---

# 24. 合并标准

只有同时满足以下条件，才允许将 `refactor/taro-migration` 合并回 `main`：

- [ ] Taro H5 可构建
- [ ] 微信小程序可构建
- [ ] 核心页面完整
- [ ] 当前 H5 主要业务闭环迁移完成
- [ ] Repository 边界保留
- [ ] Platform Adapter 已建立
- [ ] 关键测试通过
- [ ] H5 390px 视觉回归通过
- [ ] 微信端基础真机 / 模拟器验证通过
- [ ] 不存在明显横向溢出
- [ ] 不存在严重 Safe Area 问题
- [ ] 发布流程可完整走通
- [ ] 搜索 / 筛选可完整走通
- [ ] 聊天可完整走通
- [ ] README 已更新
- [ ] TODO 已更新
- [ ] 迁移日志已记录

---

# 25. Agent 每次上下文压缩后的恢复流程

如果 Agent / Codex 发生上下文压缩或重新进入项目，必须先阅读：

```text
TARO_MIGRATION_AGENT.md
TODO.md
README.md
```

然后检查：

```bash
git status
git log --oneline -n 10
```

再继续任务。

禁止仅依赖模型记忆猜测当前进度。

---

# 26. 最终目标架构

迁移结束后，BITerStore 应形成如下思维模型：

```text
                    BITerStore
                         │
               Taro React Frontend
                         │
        ┌────────────────┴────────────────┐
        │                                 │
    Shared Core                     Platform Layer
        │                                 │
  ┌─────┼─────┐                   ┌───────┴───────┐
  │     │     │                   │               │
Books Users Messages            WeApp             H5
  │     │     │              login/share       browser
  └──── Repository ────┐      media/storage     storage/share
                       │
                 DemoRepository
                       │
                Future ApiRepository
```

项目的长期目标不是“同时维护两个前端”。

而是：

> **一套产品、一套核心业务逻辑、一套设计系统，针对微信小程序和 H5 做最薄的平台适配。**

---

# 27. 最重要的一句话

> **当前 H5 是基准，不是包袱；Taro 是新的正式前端基座，不是另一个产品。**

迁移时优先保护已经完成的：

- 产品闭环
- 视觉体系
- Tobby IP
- Repository 边界
- 交互体验
- 测试价值

先完成可靠迁移，再继续让 BITerStore 长新功能。
