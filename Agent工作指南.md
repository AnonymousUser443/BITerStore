# BITerStore — Product / UIUX / Visual Design Context

Version: 0.1
Project stage: Early MVP / Visual System Establishment

---

# 0.前置提醒

请Agent阅读项目并且计划完毕之后，务必启用git版本管理，然后列出TODO.md，详细指出当前完成了哪些步骤，哪些部分还没完成。并且在每次Codex自动压缩上下文之后，务必阅读TODO。md，防止跟丢任务要求！



# 1. 项目背景

BITerStore 是一个面向北京理工大学校内学生的二手交易平台。

项目第一阶段聚焦：

「校内二手书籍交易」

即帮助学生发布、查找、浏览和联系二手教材/书籍的卖家。

未来如果产品验证成功，可以进一步扩展为：

「北理工校内综合二手物品交易平台」

因此，产品设计不能被过度限定为传统“二手书店”，需要给后续扩展到数码产品、生活用品、电子元器件等校园闲置物品保留空间。

---

# 2. 产品核心理念

BITerStore 并不希望成为一个传统、商业感很强的电商平台。

它更像是一个：

「年轻、友好、有校园归属感的学生二手社区。」

第一阶段核心场景是：

学生 A 有一本不再需要的教材
→ 在 BITerStore 发布
→ 学生 B 搜索/浏览到该书
→ 查看商品信息
→ 联系卖家
→ 双方在线下完成交易
→ 商品标记为已售 / 不可用。

平台当前不负责线上支付。

交易本身主要在线下完成。

因此产品重点不是复杂的电商履约系统，而是：

1. 信息发布
2. 信息查找
3. 校园可信身份
4. 买卖双方建立联系
5. 商品状态管理
6. 举报与基础安全机制
7. 良好的内容生态与校园社区体验

---

# 3. 产品名称与品牌设定

正式产品名：

BITerStore

其中 BIT 与北京理工大学（BIT）具有直接关联。

产品 IP / Mascot：

Tobby
中文名：托比

品牌语义：

「托付」

核心品牌表达可以围绕：

「把闲置托付给托比」
「把二手书籍托付给我们」
「让每一本书继续被需要」
「让闲置继续流动」

展开。

Tobby 不只是装饰性吉祥物，而应该成为 BITerStore 产品体验的一部分。

例如：

- 欢迎页
- 空状态
- 加载状态
- 查询状态
- 错误页面
- 商品不可用
- 发布成功
- 操作教程
- 网站维护
- 用户引导

均可通过 Tobby 进行人格化表达。

---

# 4. Tobby 角色设定

Tobby 是 BITerStore 的校园向导型 IP。

角色关键词：

年轻
温柔
热情
可靠
有一点活泼
书卷气
校园感
自然感
亲和
愿意帮助别人

人物定位不是幼儿型吉祥物，而是：

「二次元 Q 版校园学生 / 小向导」

整体具有明显个人 IP 感。

---

# 5. Tobby 核心视觉设定

## 5.1 风格

二次元
Q 版
手绘感
柔和
轻日系
年轻
治愈
略带森林 / 书卷气息

避免：

传统企业吉祥物
扁平商务插画
过度儿童化
高饱和二次元
复杂奇幻 RPG 感
官方校园宣传风

---

## 5.2 主色体系

整体采用：

Morandi / 莫兰迪绿色系

核心视觉色彩：

- 鼠尾草绿 / Sage Green
- 灰橄榄绿
- 深灰绿
- 奶油白
- 浅卡其
- 少量暖金作为强调色

界面和插画都应保持：

低饱和
柔和
自然
温暖
干净

避免高饱和荧光绿。

科技类场景（搜索、查询、数据等）允许加入少量：

青绿色 / Aqua Green 荧光

但只作为功能强调，不改变整体莫兰迪色体系。

---

# 6. Tobby 人物固定特征

后续所有 AI 生图 / UI 插画应尽可能保持角色一致性。

核心识别元素：

- 蓬松、有明显层次感的橄榄灰棕色头发
- 发尾轻微偏灰绿色
- 头顶明显 ahoge / 呆毛
- 叶片型头饰
- 一枚书页 / 信纸形状的发饰
- 柔和灰绿色大眼睛
- 奶油白内搭
- 鼠尾草绿色披肩 / Cape
- 深灰绿色短裤
- 奶油色堆堆袜
- 绿色蝴蝶结元素的鞋
- 书页、树叶、纸张元素作为装饰
- 胸前必须保留一枚「北京理工大学校徽意象」的圆形胸章

其中：

「北理工校徽胸章」

是 Tobby 非常重要的校园身份识别元素。

在较小尺寸的插画中允许简化，但不应完全消失。

---

# 7. 已建立的视觉资产体系

目前已经设计 / 生成了以下类别的资产。

## A. Character Master

角色正面原型

用于确定：

- 脸型
- 发型
- 身材比例
- 服装
- 配色
- 饰品
- 整体画风

这是最高优先级的人物 Identity Reference。

---

## B. Character Turnaround

已经设计三视图：

正面
侧面
背面

同时定义：

- 色卡
- 服装结构
- 披肩结构
- 发型结构
- 饰品位置
- 校徽胸章
- 叶片 / 书页装饰

后续生成 Tobby 新动作时，应参考三视图保持结构一致。

---

## C. Standard Sticker / Expression Assets

已经规划或生成：

开心 / 欢迎
加油
困惑
委屈 / 哭泣
生气
感谢 / 比心

适用于：

Toast
状态提示
弹窗
空状态
聊天式提示
轻量反馈

---

## D. Dynamic Illustration Assets

已经生成动作幅度更大的状态图：

欢迎新同学

- Tobby 拿着大喇叭
- > _< 表情
- 非常热情、夸张的动态

查询中

- Tobby 面对全息绿色界面
- 思考 / 搜索状态

网站维护

- 黄色安全帽
- 扳手
- 擦汗
- 气喘吁吁

当前书籍不可用

- 无奈 / 抱歉
- 配合空书架 / 禁止符号

这些适合：

大面积状态页
Loading
Error
Maintenance
Empty State
Hero Illustration

---

## E. Instruction Illustrations

已经建立以下教程型视觉方向：

发布书籍

- 指向「+」
- Upload / Book Card

搜索与筛选

- Search Bar
- Filter Panel

联系与线下交易

- Chat Bubble
- Map Pin
- Checklist
- Handshake

用于网站：

How it works
操作引导
新用户 Tutorial
Instruction Cards
Step-by-step onboarding

---

## F. Small-size Simplified Stickers

考虑到浏览器中 32px / 48px / 64px / 96px 等较小尺寸下，
复杂 Q 版插画细节会丢失，因此已经建立一套：

「Small-size Tobby」

设计规则：

- 头身比进一步 Q 化
- 面部更大
- 表情优先
- 加粗轮廓
- 大幅删除服装细节
- 删除大量挂饰
- 保留核心发型
- 保留叶片发饰
- 保留书页发饰
- 保留绿色披肩
- 校徽简化为圆形识别徽章
- 道具只保留 1~3 个
- UI 图形尺寸放大
- 轮廓必须在小尺寸仍可辨认

Small-size 版本优先用于：

按钮附近插图
小型 Empty State
Toast
Notification
Tooltip
小尺寸状态提示
Sidebar
Card Decoration

---

# 8. 背景视觉资产

目前建立了几种背景方向：

## ① 森系图书馆

关键词：

森林
书籍
阳光
拱形窗
鼠尾草绿
奶油白
藤蔓
书页
安静
治愈

适用于：

Landing Page
About
Brand Page
Login / Welcome
Hero Area

---

## ② 校园庭院

关键词：

大学校园
绿荫
读书亭
阳光
书本
校园社区

适用于：

校园身份表达
Welcome
新生专题
Community

---

## ③ 森系 × 科技 Archive

关键词：

书籍
植物
透明 HUD
青绿色全息屏
Search UI
数据
知识

适用于：

查询
搜索
Loading
技术功能页面

---

## ④ Abstract Brand Background

特点：

中央留有大量 Negative Space。

周围使用：

叶片
书页
丝带
纸张
徽章
小星光
植物纹样

进行装饰。

这类背景是最适合：

网页 Hero
Modal
Banner
Instruction
Announcement

的通用背景。

---

# 9. UI / UX 总体方向

BITerStore 不应该像传统电商。

避免：

淘宝式
闲鱼式
大量橙红色
极高信息密度
营销 Banner 堆叠
价格视觉占据绝对主导
企业 SaaS 后台风格

希望更接近：

「校园生活产品 × 年轻社区 × 温柔 IP × 简洁现代 UI」

UI 核心视觉：

大圆角
低饱和
轻阴影
卡片式
留白充足
柔和层级
小面积手绘装饰
大量自然色
绿色作为主要交互强调色

Tobby 可以偶尔出现，但不能每个 Card 都塞角色。

角色应该服务于：

情感表达
状态表达
教程
品牌记忆

而不是制造视觉噪声。

---

# 10. 当前需要重点设计的 UI

目前 UI/UX 工作主要由我负责。

优先设计以下产品流程：

首页 / Home

功能目标：

快速看到正在出售的书
推荐 / 最新
分类入口
搜索入口
品牌和 Tobby 的轻度展示

---

搜索 / Search

支持：

关键词
书名
ISBN（未来可选）
课程 / 分类
校区等筛选维度

需要设计：

Search Bar
Search Suggestion
Filter
Search Result
No Result
Searching State

---

商品列表 / Marketplace

Book Card 至少考虑：

封面
书名
价格
成色
校区
发布时间
卖家基础信息
状态

避免 Card 信息过载。

---

商品详情 / Book Detail

核心信息：

图片
书名
价格
描述
成色
课程 / 分类
卖家
校区
发布时间
联系方式 / 联系入口
举报
商品状态

---

发布商品 / Publish

应尽量降低发布成本。

典型流程：

上传照片
→ 填写书名
→ 填写价格
→ 成色
→ 分类
→ 描述
→ 校区
→ 联系方式
→ 发布

需要设计明显的：

发布成功状态
草稿 / 未完成状态
表单错误状态

---

我的 / Profile

考虑：

我的发布
正在出售
已售
已下架
收藏
个人资料
账号认证
举报 / 反馈
设置

---

状态页面

需要完整建立：

Loading
Searching
Empty
Error
404
Maintenance
Book unavailable
Published successfully
No search results
Network error

这些页面优先使用 Tobby。

---

Tutorial / How It Works

推荐三步：

1. 发布 / 找到一本书
2. 联系对方
3. 校内线下交易

可以使用已经设计好的 Tobby Instruction Illustrations。

---

# 11. UX 原则

设计时始终优先考虑：

1. 学生第一次打开就知道这个网站干什么
2. 搜索一本教材必须非常快
3. 发布一本书不能像填写政府表格
4. 用户应快速判断：
   「是不是我要的书」
   「多少钱」
   「在哪个校区」
   「怎么联系」
5. 商品已售 / 不可用必须明确
6. 空页面不能显得产品“死了”
7. Tobby 应承担大量 Friendly Feedback
8. UI 可爱，但操作必须高效
9. 装饰不能影响信息读取
10. 首屏必须让用户感觉：
    「这个东西真的有人在用」

---

# 12. 响应式设计

这是浏览器 Web 项目，因此必须优先考虑：

Desktop
Tablet
Mobile Browser

尤其要注意插画资产响应式使用。

建议划分：

Large Illustration
用于：
Hero / Empty State / Maintenance
约 240~600 px

Medium Illustration
用于：
Cards / Tutorial
约 100~240 px

Small Sticker
用于：
Toast / Tip / Icon decoration
约 32~100 px

不能把完整版高细节人物直接缩到 40 px 使用。

小尺寸必须调用专门的 Simplified Tobby Assets。

---

# 13. UI 视觉 Token 建议

当前暂未锁定最终 HEX。

设计时应以已生成角色和背景资产的颜色为基准采样，并建立统一 Design Tokens。

建议至少定义：

Primary Sage
Secondary Sage
Dark Olive
Cream Background
Warm Paper
Text Primary
Text Secondary
Border
Soft Gold Accent
Success
Warning
Error
Info / Holographic Aqua

不要直接随意引入新的高饱和颜色。

---

# 14. 我的职责

我主要负责：

Product Design
UI Design
UX Design
Visual Identity
Tobby IP Design
Illustration Direction
Front-end visual specification
Interaction design
Product copy / microcopy
Responsive design
Design system

项目其他成员主要负责：

后端
数据库
服务器
部署
基础设施
已有开源项目改造等工程工作。

因此 Agent 在协助我时，应优先站在：

「产品设计负责人 + UI/UX Designer + Visual Director」

的角度工作。

---

# 15. Agent 工作原则

你是 BITerStore 的 UI/UX + Product Design Agent。

工作时：

- 优先保持现有品牌一致性
- 不随意改变 Tobby 人设
- 不随意改变主色
- 不把产品设计成普通电商模板
- 优先校园年轻人体验
- 优先减少操作阻力
- 优先保证信息层级
- 优先响应式
- 任何页面必须考虑 Loading / Empty / Error / Disabled 等状态
- 任何复杂功能先建立 User Flow，再画页面
- 新增 UI 时尽量复用 Design System
- Tobby 只用于具有情绪 / 状态 / 引导价值的位置
- 不为了“可爱”牺牲可用性
- 不为了“高级”牺牲亲和力

---

# 16. 最终产品气质

BITerStore 应该让用户感觉：

「这是几个真的懂学生生活的人，为自己学校的同学做出来的产品。」

而不是：

「某个互联网公司套了一个校园模板。」

品牌世界观最终应围绕：

书籍
知识
托付
流动
校园
连接
年轻
温柔
自然

建立统一体验。

Tobby 是这个世界观中帮助每件闲置找到下一位主人的校园小向导。
