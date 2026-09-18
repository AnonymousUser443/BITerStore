import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preserveSnapshot } from '@/domain/snapshot'
import Taro from '@tarojs/taro'
import { apiRequest, resolveMediaSource, sessionStore } from '@/domain/api'
import { privateMediaAdapter } from '@/platform'
import { loginWithCampus } from '@/domain/auth'
import { defaultFilters, filterListings } from '@/domain/filters'
import { formatMessageTime, formatThreadTime, mergeMessagesChronologically } from '@/domain/date-time'
import { seedListings } from '@/domain/seed'
import { listingAssistant } from '@/domain/assistant'
import { demoRepository } from '@/domain/repository'
import { apiRepository } from '@/domain/api-repository'

const memory = new Map<string, unknown>()
function mockRequest(implementation: (options: { url: string; header?: Record<string, string> }) => Promise<unknown>) {
  vi.mocked(Taro.request).mockImplementation(implementation as unknown as typeof Taro.request)
}
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: vi.fn((key) => memory.get(key) ?? ''),
  setStorageSync: vi.fn((key, data) => { memory.set(key, data) }),
  removeStorageSync: vi.fn((key) => { memory.delete(key) }),
  getStorageInfoSync: vi.fn(() => ({ keys: [...memory.keys()] })),
  getStorage: vi.fn(async ({ key }) => { if (!memory.has(key)) throw new Error('not found'); return { data: memory.get(key) } }),
  setStorage: vi.fn(async ({ key, data }) => { memory.set(key, data) }), removeStorage: vi.fn(async ({ key }) => { memory.delete(key) }),
  getStorageInfo: vi.fn(async () => ({ keys: [...memory.keys()] })), showToast: vi.fn(), showModal: vi.fn(async () => ({ confirm: true })),
  request: vi.fn(async () => ({ statusCode: 200, data: { ok: true } })),
  downloadFile: vi.fn(), getFileSystemManager: vi.fn(() => ({ unlink: vi.fn(({ complete }) => complete()) })),
  navigateTo: vi.fn(), redirectTo: vi.fn(), reLaunch: vi.fn(), switchTab: vi.fn(), navigateBack: vi.fn(), getCurrentInstance: vi.fn(() => ({ router: { path: '' } })), setClipboardData: vi.fn(),
  getWindowInfo: vi.fn(() => ({ windowWidth: 390, statusBarHeight: 44 })), getMenuButtonBoundingClientRect: vi.fn(() => ({ left: 294, bottom: 82 }))
} }))
describe('domain', () => {
  it('formats and orders API message timestamps chronologically', () => {
    const now = new Date(2026, 8, 17, 20, 0)
    expect(formatMessageTime(new Date(2026, 8, 17, 9, 5).toISOString(), now)).toBe('09:05')
    expect(formatMessageTime(new Date(2026, 8, 16, 21, 8).toISOString(), now)).toBe('昨天 21:08')
    expect(formatThreadTime(new Date(2026, 7, 20, 9, 5).toISOString(), now)).toBe('8月20日')
    const merged = mergeMessagesChronologically(
      [{ id: 'later', createdAt: '2026-09-17T11:00:00.000Z' }],
      [{ id: 'earlier', createdAt: '2026-09-17T09:00:00.000Z' }, { id: 'later', createdAt: '2026-09-17T11:00:00.000Z' }]
    )
    expect(merged.map((message) => message.id)).toEqual(['earlier', 'later'])
  })

  it('keeps the current reference when a refreshed snapshot is unchanged', () => {
    const current = [{ id: 'book-a', title: '高等数学' }]
    expect(preserveSnapshot(current, [{ id: 'book-a', title: '高等数学' }])).toBe(current)
    expect(preserveSnapshot(current, [{ id: 'book-a', title: '线性代数' }])).not.toBe(current)
  })

  it('uses the owner listing endpoint for private listing status changes', async () => {
    await sessionStore.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, user: { id: 'owner-a', role: 'USER', campusStatus: 'VERIFIED' } })
    vi.mocked(Taro.request)
      .mockResolvedValueOnce({ statusCode: 200, data: { version: 7 } } as never)
      .mockResolvedValueOnce({ statusCode: 200, data: { status: 'PENDING_REVIEW', version: 8 } } as never)
    await expect(apiRepository.updateListingStatus('draft/a', 'available')).resolves.toBe('reviewing')
    expect(vi.mocked(Taro.request).mock.calls[0]?.[0]).toMatchObject({ url: 'http://api.test/listings/mine/draft%2Fa' })
    expect(vi.mocked(Taro.request).mock.calls[1]?.[0]).toMatchObject({ url: 'http://api.test/listings/draft%2Fa/status', data: { status: 'ACTIVE', version: 7 } })
  })

  beforeEach(async () => {
    vi.unstubAllEnvs()
    memory.clear()
    vi.stubGlobal('__API_URL__', 'http://api.test')
    vi.mocked(Taro.request).mockReset().mockResolvedValue({ statusCode: 200, data: { ok: true } } as never)
    await sessionStore.clear()
  })
  it('loads protected images with credentials, refreshes once, and removes files on logout', async () => {
    vi.stubEnv('TARO_ENV', 'weapp')
    await sessionStore.set({ accessToken: 'old', refreshToken: 'refresh', expiresIn: 3600, user: { id: 'owner', role: 'USER', campusStatus: 'VERIFIED' } })
    vi.mocked(Taro.downloadFile).mockReset()
      .mockResolvedValueOnce({ statusCode: 401, tempFilePath: '/tmp/failed' } as never)
      .mockResolvedValueOnce({ statusCode: 200, tempFilePath: '/tmp/protected' } as never)
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: { accessToken: 'new', refreshToken: 'new-refresh', expiresIn: 3600 } } as never)
    await expect(resolveMediaSource('http://api.test/media/owner/cover')).resolves.toBe('/tmp/protected')
    expect(Taro.downloadFile).toHaveBeenLastCalledWith({ url: 'http://api.test/media/owner/cover', header: { Authorization: 'Bearer new' } })
    const release = vi.spyOn(privateMediaAdapter, 'release')
    await sessionStore.clear()
    expect(release).toHaveBeenCalledWith('/tmp/protected')
    release.mockRestore()
  })

  it('never sends a session token to public or foreign image URLs', async () => {
    vi.stubEnv('TARO_ENV', 'weapp')
    vi.mocked(Taro.downloadFile).mockReset()
    const publicImage = 'http://api.test/media/cover'
    const foreignImage = 'https://foreign.test/media/owner/cover'
    expect(await resolveMediaSource(publicImage)).toBe(publicImage)
    expect(await resolveMediaSource(foreignImage)).toBe(foreignImage)
    expect(Taro.downloadFile).not.toHaveBeenCalled()
  })
  it('无请求体的写请求会发送空 JSON 对象', async () => { await apiRequest('/empty', { method: 'POST' }); expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', data: {} })) })
  it('登录会话写入后下一次请求立即携带访问令牌', async () => {
    const session = { accessToken: 'access-now', refreshToken: 'refresh-now', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    await apiRequest('/me')
    expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ header: expect.objectContaining({ Authorization: 'Bearer access-now' }) }))
  })
  it('H5 校园登录仅保存非敏感会话元数据并使用 HttpOnly Cookie', async () => {
    vi.stubEnv('TARO_ENV', 'h5')
    const cookieSession = { expiresIn: 900, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: cookieSession } as never)
    await expect(loginWithCampus('registration-jwt')).resolves.toMatchObject(cookieSession)
    expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://api.test/auth/campus', credentials: 'include',
      data: { registrationToken: 'registration-jwt', platform: 'h5' },
      header: { 'Content-Type': 'application/json' }
    }))
    expect(await sessionStore.get()).toMatchObject({ transport: 'cookie', user: { id: 'user-a' } })
    expect((await sessionStore.get())?.accessToken).toBeUndefined()
    expect((await sessionStore.get())?.refreshToken).toBeUndefined()
  })
  it('H5 Cookie 刷新失败时清理会话、草稿和账号快照', async () => {
    vi.stubEnv('TARO_ENV', 'h5')
    const session = { expiresIn: 3600, transport: 'cookie' as const, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    memory.set('biterstore:taro:v1:api-draft:user-a', { title: '私有草稿' })
    memory.set('biterstore:taro:v1:api-snapshot:profile:user-a', { name: '同学 A' })
    vi.mocked(Taro.request).mockResolvedValue({ statusCode: 401, data: { message: '登录已失效' } } as never)
    await expect(apiRequest('/me')).rejects.toThrow('登录已失效')
    expect(await sessionStore.get()).toBeNull()
    expect([...memory.keys()].filter((key) => key.startsWith('biterstore:taro:v1:'))).toEqual([])
  })
  it('访问令牌失效时并发请求只刷新一次并使用新令牌重试', async () => {
    const session = { accessToken: 'access-old', refreshToken: 'refresh-old', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    let refreshRequests = 0
    mockRequest(async (options) => {
      if (options.url.endsWith('/auth/refresh')) {
        refreshRequests += 1
        await Promise.resolve()
        return { statusCode: 200, data: { ...session, accessToken: 'access-new', refreshToken: 'refresh-new' } } as never
      }
      return options.header?.Authorization === 'Bearer access-new'
        ? { statusCode: 200, data: { ok: true } } as never
        : { statusCode: 401, data: { message: '登录已失效' } } as never
    })
    await expect(Promise.all([apiRequest('/me'), apiRequest('/notifications')])).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(refreshRequests).toBe(1)
  })
  it('访问令牌即将过期时先刷新再请求受保护接口', async () => {
    const session = { accessToken: 'access-old', refreshToken: 'refresh-old', expiresIn: 1, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    mockRequest(async (options) => {
      if (options.url.endsWith('/auth/refresh')) {
        return { statusCode: 200, data: { ...session, accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 3600 } } as never
      }
      return { statusCode: 200, data: { authorization: options.header?.Authorization } } as never
    })
    await expect(apiRequest<{ authorization?: string }>('/me')).resolves.toEqual({ authorization: 'Bearer access-new' })
    expect(Taro.request).toHaveBeenCalledTimes(2)
    expect(vi.mocked(Taro.request).mock.calls[0]?.[0]).toMatchObject({ url: 'http://api.test/auth/refresh' })
  })
  it('较慢请求返回旧令牌 401 时复用已刷新的会话', async () => {
    const session = { accessToken: 'access-old', refreshToken: 'refresh-old', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    let releaseDelayed: ((value: { statusCode: number; data: { message: string } }) => void) | undefined
    let refreshRequests = 0
    mockRequest(async (options) => {
      if (options.url.endsWith('/auth/refresh')) {
        refreshRequests += 1
        return { statusCode: 200, data: { ...session, accessToken: 'access-new', refreshToken: 'refresh-new' } } as never
      }
      if (options.url.endsWith('/notifications') && options.header?.Authorization === 'Bearer access-old') {
        return await new Promise<{ statusCode: number; data: { message: string } }>((resolve) => { releaseDelayed = resolve })
      }
      return options.header?.Authorization === 'Bearer access-new'
        ? { statusCode: 200, data: { ok: true } } as never
        : { statusCode: 401, data: { message: '登录已失效' } } as never
    })
    const delayed = apiRequest<{ ok: boolean }>('/notifications')
    await expect(apiRequest('/me')).resolves.toEqual({ ok: true })
    releaseDelayed?.({ statusCode: 401, data: { message: '登录已失效' } })
    await expect(delayed).resolves.toEqual({ ok: true })
    expect(refreshRequests).toBe(1)
  })
  it('组合筛选和价格排序保持确定性', () => { const result = filterListings(seedListings, { ...defaultFilters, query: '数据结构', campus: '良乡', sort: '价格从低到高' }); expect(result.map((x) => x.id)).toEqual(['data-c']) })
  it('真实 API 将筛选、排序与分页参数交给服务端', async () => {
    const make = (id: string, priceCents: number) => ({ id, title: id, author: '作者', isbn: '', category: '教材教辅', course: '', priceCents, condition: '八成新', campus: '良乡', description: '', status: 'ACTIVE', sellerId: 'seller', createdAt: `2026-09-0${id === 'cheap' ? '1' : '2'}T00:00:00.000Z`, tags: [], images: [] })
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: { items: [make('cheap', 2000), make('expensive', 8000)], nextCursor: 'expensive' } } as never)
    const page = await apiRepository.listListingsPage({ ...defaultFilters, query: ' 数据结构 ', condition: '八成新', minPrice: 10, maxPrice: 90, sort: '价格从低到高' })
    const result = page.items
    expect(result.map((item) => item.id)).toEqual(['cheap', 'expensive'])
    expect(page.nextCursor).toBe('expensive')
    const requestedUrl = decodeURIComponent(String(vi.mocked(Taro.request).mock.calls.at(-1)?.[0]?.url))
    expect(requestedUrl).toContain('q=数据结构')
    expect(requestedUrl).toContain('condition=八成新')
    expect(requestedUrl).toContain('minPriceCents=1000')
    expect(requestedUrl).toContain('maxPriceCents=9000')
    expect(requestedUrl).toContain('sort=price_asc')
    expect(requestedUrl).toContain('limit=20')
  })
  it('真实 API 持久化分类筛选与引导完成状态', async () => {
    const filters = { ...defaultFilters, campus: '珠海' as const, availableOnly: false }
    await apiRepository.saveFilters(filters)
    await apiRepository.completeOnboarding()
    expect(await apiRepository.getFilters()).toEqual(filters)
    expect(await apiRepository.isOnboardingComplete()).toBe(true)
  })
  it('收藏能够持久化并取消', async () => { expect(await demoRepository.toggleFavorite('math-7')).toBe(true); expect((await demoRepository.listFavorites()).map((x) => x.id)).toEqual(['math-7']); expect(await demoRepository.toggleFavorite('math-7')).toBe(false) })
  it('真实 API 会提交反馈类型、内容和微信端来源', async () => {
    vi.stubEnv('TARO_ENV', 'weapp')
    await apiRepository.submitFeedback('SUGGESTION', '希望增加按课程筛选')
    expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://api.test/me/feedback', method: 'POST', data: { type: 'SUGGESTION', content: '希望增加按课程筛选', platform: 'WEAPP' }
    }))
    vi.unstubAllEnvs()
  })
  it('真实 API 的个人数据快照按账号隔离', async () => {
    const session = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
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
    await sessionStore.set({ ...session, user: { ...session.user, id: 'user-b' } })
    expect(apiRepository.peekProfile()).toBeUndefined()
    expect(apiRepository.peekFavorites()).toBeUndefined()
    expect(apiRepository.peekMyListings()).toBeUndefined()
    expect(apiRepository.peekThreads()).toBeUndefined()
    expect(apiRepository.peekNotifications()).toBeUndefined()
  })
  it('列表读取后可同步交给详情页首帧', async () => { await demoRepository.listListings(); expect(demoRepository.peekListing('math-7')?.title).toContain('高等数学') })
  it('会话摘要显示最新消息，打开后完整已读且刷新不截断历史', async () => {
    const session = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, user: { id: 'user-a', role: 'USER', campusStatus: 'VERIFIED' } }
    await sessionStore.set(session)
    const conversation = {
      id: 'thread-read', listingId: 'book-a', buyerId: 'user-a', sellerId: 'seller', lastMessageAt: '2026-08-31T01:02:00.000Z', unread: 2,
      members: [{ userId: 'user-a', user: { id: 'user-a', nickname: '自己', campus: '良乡' } }, { userId: 'seller', user: { id: 'seller', nickname: '卖家', campus: '良乡' } }],
      listing: { id: 'book-a', title: '消息测试书', author: '作者', isbn: '', category: '教材', course: '', priceCents: 1000, condition: '九成新', campus: '良乡', description: '', status: 'ACTIVE', sellerId: 'seller', createdAt: '2026-08-31T00:00:00.000Z', tags: [], images: [] },
      messages: [{ id: '12', senderId: 'user-a', content: '我刚补充了一句', createdAt: '2026-08-31T01:02:00.000Z' }]
    }
    vi.mocked(Taro.request)
      .mockResolvedValueOnce({ statusCode: 200, data: { items: [conversation] } } as never)
      .mockResolvedValueOnce({ statusCode: 200, data: { items: [
        { id: '10', senderId: 'seller', content: '第一条未读', createdAt: '2026-08-31T01:00:00.000Z' },
        { id: '11', senderId: 'seller', content: '第二条未读', createdAt: '2026-08-31T01:01:00.000Z' },
        conversation.messages[0]
      ] } } as never)
      .mockResolvedValueOnce({ statusCode: 200, data: conversation } as never)
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } } as never)
      .mockResolvedValueOnce({ statusCode: 200, data: { items: [{ ...conversation, unread: 0 }] } } as never)

    const summaries = await apiRepository.listThreads()
    expect(summaries[0]).toMatchObject({ unread: 2, messages: [{ id: '12', text: '我刚补充了一句' }] })
    const loaded = await apiRepository.getThread('thread-read')
    expect(vi.mocked(Taro.request).mock.calls.some(([options]) => options.url === 'http://api.test/conversations/thread-read')).toBe(true)
    expect(loaded.messages.map((item) => item.id)).toEqual(['10', '11', '12'])
    expect(loaded.unread).toBe(0)
    expect(vi.mocked(Taro.request).mock.calls.some(([options]) => options.url === 'http://api.test/conversations/thread-read/read' && options.method === 'POST' && (options.data as { messageId?: string })?.messageId === '12')).toBe(true)

    await apiRepository.listThreads()
    expect(apiRepository.peekThread('thread-read')?.messages.map((item) => item.id)).toEqual(['10', '11', '12'])
  })
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
