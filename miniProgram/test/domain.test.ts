import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preserveSnapshot } from '@/domain/snapshot'
import Taro from '@tarojs/taro'
import { apiRequest } from '@/domain/api'
import { defaultFilters, filterListings } from '@/domain/filters'
import { seedListings } from '@/domain/seed'
import { listingAssistant } from '@/domain/assistant'
import { demoRepository } from '@/domain/repository'
import { apiRepository } from '@/domain/api-repository'

const memory = new Map<string, unknown>()
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: vi.fn((key) => memory.get(key) ?? ''),
  setStorageSync: vi.fn((key, data) => { memory.set(key, data) }),
  removeStorageSync: vi.fn((key) => { memory.delete(key) }),
  getStorageInfoSync: vi.fn(() => ({ keys: [...memory.keys()] })),
  getStorage: vi.fn(async ({ key }) => { if (!memory.has(key)) throw new Error('not found'); return { data: memory.get(key) } }),
  setStorage: vi.fn(async ({ key, data }) => { memory.set(key, data) }), removeStorage: vi.fn(async ({ key }) => { memory.delete(key) }),
  getStorageInfo: vi.fn(async () => ({ keys: [...memory.keys()] })), showToast: vi.fn(), showModal: vi.fn(async () => ({ confirm: true })),
  request: vi.fn(async () => ({ statusCode: 200, data: { ok: true } })),
  navigateTo: vi.fn(), switchTab: vi.fn(), navigateBack: vi.fn(), getCurrentInstance: vi.fn(() => ({ router: { path: '' } })), setClipboardData: vi.fn()
} }))
describe('domain', () => {
  it('keeps the current reference when a refreshed snapshot is unchanged', () => {
    const current = [{ id: 'book-a', title: '高等数学' }]
    expect(preserveSnapshot(current, [{ id: 'book-a', title: '高等数学' }])).toBe(current)
    expect(preserveSnapshot(current, [{ id: 'book-a', title: '线性代数' }])).not.toBe(current)
  })

  beforeEach(() => { memory.clear(); vi.stubGlobal('__API_URL__', 'http://api.test'); vi.mocked(Taro.request).mockClear() })
  it('无请求体的写请求会发送空 JSON 对象', async () => { await apiRequest('/empty', { method: 'POST' }); expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', data: {} })) })
  it('组合筛选和价格排序保持确定性', () => { const result = filterListings(seedListings, { ...defaultFilters, query: '数据结构', campus: '良乡', sort: '价格从低到高' }); expect(result.map((x) => x.id)).toEqual(['data-c']) })
  it('收藏能够持久化并取消', async () => { expect(await demoRepository.toggleFavorite('math-7')).toBe(true); expect((await demoRepository.listFavorites()).map((x) => x.id)).toEqual(['math-7']); expect(await demoRepository.toggleFavorite('math-7')).toBe(false) })
  it('真实 API 的个人数据快照按账号隔离', async () => {
    const session = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    memory.set('biterstore:taro:v1:api-session', session)
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: { id: 'user-a', studentNumber: '1120240001', nickname: '同学 A', campus: '良乡', campusStatus: 'VERIFIED' } } as never)
    await apiRepository.getProfile()
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: [{ id: 'book-a', title: '缓存书籍', author: '作者', isbn: '', category: '教材', course: '', priceCents: 1000, condition: '九成新', campus: '良乡', description: '', status: 'ACTIVE', sellerId: 'seller', createdAt: '2026-08-31T00:00:00.000Z', tags: [], images: [] }] } as never)
    await apiRepository.listFavorites()
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: { items: [] } } as never)
    await apiRepository.listMyListings()
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: [{ id: 'thread-a', listingId: 'book-a', buyerId: 'user-a', sellerId: 'seller', lastMessageAt: '2026-08-31T01:00:00.000Z', members: [{ userId: 'seller', user: { id: 'seller', nickname: '卖家', campus: '良乡' } }], listing: { id: 'book-a', title: '缓存书籍', author: '作者', isbn: '', category: '教材', course: '', priceCents: 1000, condition: '九成新', campus: '良乡', description: '', status: 'ACTIVE', sellerId: 'seller', createdAt: '2026-08-31T00:00:00.000Z', tags: [], images: [] } }] } as never)
    await apiRepository.listThreads()
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: [{ id: 'notice-a', type: 'system', title: '系统通知', body: '测试通知', readAt: null }] } as never)
    await apiRepository.listNotifications()
    expect(apiRepository.peekProfile()?.name).toBe('同学 A')
    expect(apiRepository.peekFavorites()?.[0].id).toBe('book-a')
    expect(apiRepository.peekMyListings()).toEqual([])
    expect(apiRepository.peekThreads()?.[0]).toMatchObject({ id: 'thread-a', buyerId: 'user-a', listing: { id: 'book-a' } })
    expect(apiRepository.peekThread('thread-a')?.listing?.title).toBe('缓存书籍')
    expect(apiRepository.peekNotifications()?.[0].id).toBe('notice-a')
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 404, data: { message: '商品不存在' } } as never)
    await expect(apiRepository.getListing('book-a')).resolves.toMatchObject({ id: 'book-a', title: '缓存书籍' })
    memory.set('biterstore:taro:v1:api-session', { ...session, user: { ...session.user, id: 'user-b' } })
    expect(apiRepository.peekProfile()).toBeUndefined()
    expect(apiRepository.peekFavorites()).toBeUndefined()
    expect(apiRepository.peekMyListings()).toBeUndefined()
    expect(apiRepository.peekThreads()).toBeUndefined()
    expect(apiRepository.peekNotifications()).toBeUndefined()
  })
  it('列表读取后可同步交给详情页首帧', async () => { await demoRepository.listListings(); expect(demoRepository.peekListing('math-7')?.title).toContain('高等数学') })
  it('草稿恢复、发布校验和删除', async () => { const draft = { title: '测试书', author: '', isbn: '', category: '数学', course: '高数', price: '12', originalPrice: '', condition: '八成新' as const, campus: '良乡' as const, description: '', tags: [], mediaIds: ['cover', 'isbn'], coverMediaId: 'cover', isbnMediaId: 'isbn' }; await demoRepository.saveDraft(draft); expect((await demoRepository.getDraft())?.title).toBe('测试书'); const published = await demoRepository.publishListing(draft); expect(published.status).toBe('available'); await demoRepository.deleteListing(published.id); expect((await demoRepository.listMyListings()).some((item) => item.id === published.id)).toBe(false); await expect(demoRepository.publishListing({ ...draft, price: '0' })).rejects.toMatchObject({ code: 'VALIDATION' }); await expect(demoRepository.publishListing({ ...draft, coverMediaId: undefined })).rejects.toMatchObject({ code: 'VALIDATION' }) })
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
