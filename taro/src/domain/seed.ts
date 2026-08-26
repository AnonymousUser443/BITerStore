import type { ChatThread, Listing, Notification, User } from './types'

export const CURRENT_USER_ID = 'user-me'
export const users: User[] = [
  { id: CURRENT_USER_ID, name: '北理书友', campus: '良乡', verified: true, bio: '让闲置教材继续流动。', responseTime: '通常 10 分钟内回复', avatar: '/assets/avatar-zhou.webp' },
  { id: 'seller-lin', name: '林小暖', campus: '中关村', verified: true, bio: '经管教材与课程资料', responseTime: '通常 1 小时内回复', avatar: '/assets/avatar-lin.webp' },
  { id: 'seller-jian', name: '简一一', campus: '良乡', verified: true, bio: '计算机与数学教材', responseTime: '通常 30 分钟内回复', avatar: '/assets/avatar-jian.webp' }
]
export const seedListings: Listing[] = [
  { id: 'math-7', title: '高等数学（第七版）上册', author: '同济大学数学系', isbn: '9787040396638', category: '数学', course: '高等数学', price: 18, originalPrice: 45.8, condition: '八成新', campus: '良乡', description: '少量铅笔笔记，章节完整，适合期末复习。', status: 'available', sellerId: 'seller-jian', createdAt: '2026-08-25T09:00:00.000Z', tags: ['高数', '同济七版', '期末'], tone: 'sage', mediaIds: [] },
  { id: 'data-c', title: '数据结构（C语言版）', author: '严蔚敏', isbn: '9787302147510', category: '计算机', course: '数据结构', price: 22, originalPrice: 39.5, condition: '九成新', campus: '中关村', description: '封面干净，无缺页，附自己整理的知识点索引。', status: 'available', sellerId: 'seller-lin', createdAt: '2026-08-24T15:30:00.000Z', tags: ['数据结构', 'C语言'], tone: 'cream', mediaIds: [] },
  { id: 'economics', title: '微观经济学原理', author: '曼昆', isbn: '9787301256909', category: '经管', course: '微观经济学', price: 28, originalPrice: 68, condition: '七成新及以下', campus: '中关村', description: '重点章节有荧光笔标注，阅读不受影响。', status: 'available', sellerId: 'seller-lin', createdAt: '2026-08-22T11:00:00.000Z', tags: ['经济学', '曼昆'], tone: 'warm', mediaIds: [] }
]
export const seedThreads: ChatThread[] = [{ id: 'thread-lin', participantId: 'seller-lin', listingId: 'data-c', unread: 2, updatedAt: '10:18', messages: [{ id: 'm1', senderId: 'seller-lin', text: '你好，这本书还在，可以在中关村校区自取。', createdAt: '10:18', kind: 'text' }] }]
export const seedNotifications: Notification[] = [
  { id: 'n1', type: 'comment', title: '新的留言', subtitle: '林小暖回复了你的商品咨询', unread: 1 },
  { id: 'n2', type: 'system', title: '校园交易提醒', subtitle: '建议在校内公共区域当面验书', unread: 0 }
]
