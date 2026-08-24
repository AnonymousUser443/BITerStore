import type { Book, ChatThread, Notification, User } from './types';

export const CURRENT_USER_ID = 'user-tobby';

export const users: User[] = [
  { id: CURRENT_USER_ID, name: '北理小书童', campus: '良乡', verified: true, bio: '愿每一本书都能遇见新的读者。', responseTime: '通常 10 分钟内回复', avatarTone: 'sage' },
  { id: 'user-lin', name: '林小暖', campus: '中关村', verified: true, bio: '数学与生活都要慢慢理解。', responseTime: '30 分钟内回复', avatarTone: 'peach', avatar: '/assets/avatar-lin.webp' },
  { id: 'user-zhou', name: 'Oliver_周', campus: '良乡', verified: true, bio: '计院同学，教材循环利用中。', responseTime: '1 小时内回复', avatarTone: 'blue', avatar: '/assets/avatar-zhou.webp' },
  { id: 'user-jian', name: '简一一', campus: '珠海', verified: true, bio: '喜欢文学，也喜欢把书分享出去。', responseTime: '当天回复', avatarTone: 'gold', avatar: '/assets/avatar-jian.webp' },
  { id: 'user-leo', name: 'Leo 学长', campus: '西山', verified: true, bio: '毕业清书架，欢迎来问。', responseTime: '15 分钟内回复', avatarTone: 'olive' },
];

export const seedBooks: Book[] = [
  { id: 'math-7', title: '高等数学（第七版）上册', author: '同济大学数学系 编', isbn: '978-7-5608-9493-7', category: '教材教辅', course: '高等数学', price: 28, originalPrice: 49.8, condition: '九成新', campus: '良乡', description: '同济版经典教材，例题讲解清晰，笔记和标注较少，整体干净整洁，适合期末复习备考。', status: 'available', sellerId: 'user-lin', createdAt: '2026-08-24T10:28:00+08:00', tags: ['考研必备', '期末复习', '笔记少'], tone: 'sage' },
  { id: 'data-c', title: '数据结构（C语言版）第2版', author: '严蔚敏 / 清华大学出版社', isbn: '978-7-302-45488-9', category: '专业课', course: '数据结构', price: 25, originalPrice: 49, condition: '八成新', campus: '良乡', description: '计算机专业核心教材，书页完整，有少量重点标注，配合课程使用很方便。', status: 'available', sellerId: 'user-zhou', createdAt: '2026-08-24T09:12:00+08:00', tags: ['计算机', '专业课'], tone: 'paper' },
  { id: 'python', title: 'Python编程：从入门到实践', author: 'Eric Matthes / 人民邮电出版社', isbn: '978-7-115-42802-8', category: '专业课', course: '程序设计', price: 35, originalPrice: 79, condition: '九成新', campus: '中关村', description: '适合零基础学习 Python，案例完整，附带项目实践章节。', status: 'available', sellerId: 'user-leo', createdAt: '2026-08-23T18:40:00+08:00', tags: ['Python', '入门'], tone: 'mint' },
  { id: 'alive', title: '活着', author: '余华', isbn: '978-7-5063-7540-4', category: '文学小说', course: '通识阅读', price: 15, originalPrice: 28, condition: '八成新', campus: '珠海', description: '经典文学作品，书角有轻微使用痕迹，内页无缺损。', status: 'available', sellerId: 'user-jian', createdAt: '2026-08-23T16:00:00+08:00', tags: ['文学', '经典'], tone: 'ink' },
  { id: 'prince', title: '小王子', author: '圣埃克苏佩里', isbn: '978-7-5442-7862-9', category: '文学小说', course: '通识阅读', price: 18, originalPrice: 32, condition: '九成新', campus: '中关村', description: '精装插图版，保存良好，适合收藏或赠送朋友。', status: 'available', sellerId: 'user-lin', createdAt: '2026-08-22T14:10:00+08:00', tags: ['精装', '插图'], tone: 'night' },
  { id: 'linear', title: '线性代数（第六版）', author: '同济大学数学系 编', isbn: '978-7-04-039661-4', category: '教材教辅', course: '线性代数', price: 22, originalPrice: 39.8, condition: '九成新', campus: '西山', description: '只有目录处写过名字，正文干净，适合理工科基础课。', status: 'sold', sellerId: 'user-leo', createdAt: '2026-08-21T11:25:00+08:00', tags: ['数学', '基础课'], tone: 'sand' },
  { id: 'politics', title: '政治学原理', author: '王浦劬', isbn: '978-7-301-23982-1', category: '考研考公', course: '政治学', price: 20, originalPrice: 46, condition: '八成新', campus: '良乡', description: '考研复习使用，有章节索引和少量重点勾画。', status: 'available', sellerId: 'user-zhou', createdAt: '2026-08-20T20:30:00+08:00', tags: ['考研', '社科'], tone: 'clay' },
  { id: 'ordinary-world', title: '平凡的世界（全三册）', author: '路遥', isbn: '978-7-5302-1200-4', category: '文学小说', course: '通识阅读', price: 26, originalPrice: 69, condition: '七成新及以下', campus: '珠海', description: '全三册齐全，封面有使用痕迹，内页完整，不影响阅读。', status: 'offline', sellerId: 'user-jian', createdAt: '2026-08-19T13:00:00+08:00', tags: ['套装', '文学'], tone: 'earth' },
];

export const seedThreads: ChatThread[] = [
  { id: 'thread-lin', participantId: 'user-lin', bookId: 'math-7', unread: 2, updatedAt: '10:33', messages: [
    { id: 'm1', senderId: 'user-lin', text: '同学你好，请问《高等数学（第七版）上册》还在吗？', createdAt: '10:28' },
    { id: 'm2', senderId: CURRENT_USER_ID, text: '在的！书还在，可以出～', createdAt: '10:29' },
    { id: 'm3', senderId: 'user-lin', text: '方便拍几张书的实拍图看看吗？', createdAt: '10:30', kind: 'book', bookId: 'math-7' },
    { id: 'm4', senderId: CURRENT_USER_ID, text: '看起来挺新的！价格可以再便宜点吗～', createdAt: '10:32' },
    { id: 'm5', senderId: 'user-lin', text: '原价 49.8，我用得不多，保护得挺好。可以 26 出～', createdAt: '10:32' },
    { id: 'm6', senderId: CURRENT_USER_ID, text: '可以！我们明天下午在三教门口见面吧？', createdAt: '10:33' },
  ] },
  { id: 'thread-zhou', participantId: 'user-zhou', bookId: 'data-c', unread: 1, updatedAt: '昨天 20:15', messages: [{ id: 'z1', senderId: 'user-zhou', text: '发送了 2 张图片，书的边角都拍到了。', createdAt: '20:15', kind: 'image' }] },
  { id: 'thread-jian', participantId: 'user-jian', bookId: 'alive', unread: 0, updatedAt: '昨天 16:42', messages: [{ id: 'j1', senderId: 'user-jian', text: '好的，谢谢！我明天可以自取～', createdAt: '16:42' }] },
  { id: 'thread-leo', participantId: 'user-leo', bookId: 'python', unread: 0, updatedAt: '3天前', messages: [{ id: 'l1', senderId: 'user-leo', text: '没问题，周二下午图书馆门口见～', createdAt: '3天前' }] },
];

export const notifications: Notification[] = [
  { id: 'n-like', type: 'like', title: '点赞消息', subtitle: '有人赞了你的内容', unread: 3 },
  { id: 'n-comment', type: 'comment', title: '评论消息', subtitle: '有人评论了你的内容', unread: 5 },
  { id: 'n-system', type: 'system', title: '系统通知', subtitle: '平台公告与系统通知', unread: 2 },
  { id: 'n-follow', type: 'follow', title: '新增关注', subtitle: '有人关注了你', unread: 1 },
];
