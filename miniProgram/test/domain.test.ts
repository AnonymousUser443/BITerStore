import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultFilters, filterListings } from '@/domain/filters'
import { seedListings } from '@/domain/seed'
import { listingAssistant } from '@/domain/assistant'
import { demoRepository } from '@/domain/repository'

const memory = new Map<string, unknown>()
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: vi.fn((key) => memory.get(key) ?? ''),
  setStorageSync: vi.fn((key, data) => { memory.set(key, data) }),
  removeStorageSync: vi.fn((key) => { memory.delete(key) }),
  getStorageInfoSync: vi.fn(() => ({ keys: [...memory.keys()] })),
  getStorage: vi.fn(async ({ key }) => { if (!memory.has(key)) throw new Error('not found'); return { data: memory.get(key) } }),
  setStorage: vi.fn(async ({ key, data }) => { memory.set(key, data) }), removeStorage: vi.fn(async ({ key }) => { memory.delete(key) }),
  getStorageInfo: vi.fn(async () => ({ keys: [...memory.keys()] })), showToast: vi.fn(), showModal: vi.fn(async () => ({ confirm: true })),
  navigateTo: vi.fn(), switchTab: vi.fn(), navigateBack: vi.fn(), getCurrentInstance: vi.fn(() => ({ router: { path: '' } })), setClipboardData: vi.fn()
} }))
describe('domain', () => {
  beforeEach(() => memory.clear())
  it('组合筛选和价格排序保持确定性', () => { const result = filterListings(seedListings, { ...defaultFilters, query: '数据结构', campus: '良乡', sort: '价格从低到高' }); expect(result.map((x) => x.id)).toEqual(['data-c']) })
  it('收藏能够持久化并取消', async () => { expect(await demoRepository.toggleFavorite('math-7')).toBe(true); expect((await demoRepository.listFavorites()).map((x) => x.id)).toEqual(['math-7']); expect(await demoRepository.toggleFavorite('math-7')).toBe(false) })
  it('列表读取后可同步交给详情页首帧', async () => { await demoRepository.listListings(); expect(demoRepository.peekListing('math-7')?.title).toContain('高等数学') })
  it('草稿恢复和发布校验', async () => { const draft = { title: '测试书', author: '', isbn: '', category: '数学', course: '高数', price: '12', originalPrice: '', condition: '八成新' as const, campus: '良乡' as const, description: '', tags: [], mediaIds: [] }; await demoRepository.saveDraft(draft); expect((await demoRepository.getDraft())?.title).toBe('测试书'); expect((await demoRepository.publishListing(draft)).status).toBe('available'); await expect(demoRepository.publishListing({ ...draft, price: '0' })).rejects.toMatchObject({ code: 'VALIDATION' }) })
  it('消息发送后可读取且未读归零', async () => { await demoRepository.sendMessage('thread-lin', '收到'); const thread = await demoRepository.getThread('thread-lin'); expect(thread.messages.at(-1)?.text).toBe('收到'); expect(thread.unread).toBe(0) })
  it('Tobby 规则成文可重放', async () => { const a = await listingAssistant.generate({ course: '线性代数', condition: '九成新' }); const b = await listingAssistant.generate({ course: '线性代数', condition: '九成新' }); expect(a).toEqual(b); expect(a.tags).toContain('线性代数') })
  it('重置仅清理新版命名空间', async () => { await demoRepository.completeOnboarding(); memory.set('legacy:key', true); await demoRepository.resetDemoData(); expect(memory.get('legacy:key')).toBe(true); expect(await demoRepository.isOnboardingComplete()).toBe(false) })
  it('认证状态只保存学号', async () => { await demoRepository.markAuthenticated('1120230000'); expect(await demoRepository.getAuthenticatedSid()).toBe('1120230000'); await demoRepository.clearAuthentication(); expect(await demoRepository.getAuthenticatedSid()).toBe('') })
  it('筛选条件在异步持久化完成前即可交给分类页', async () => {
    const selected = { ...defaultFilters, category: '教材教辅' }
    const persistence = demoRepository.saveFilters(selected)
    expect(await demoRepository.getFilters()).toEqual(selected)
    await persistence
  })
})
