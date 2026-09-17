import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBooks } from './demo-data';
import { defaultFilters, demoRepository, filterBooks, peekBooks, peekFavorites, peekMyListings, peekThread, peekThreads } from './repository';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('filterBooks', () => {
  it('combines keyword, campus and availability filters', () => {
    const results = filterBooks(seedBooks, { ...defaultFilters, query: '数学', campus: '良乡' });
    expect(results.map((book) => book.id)).toEqual(['math-7']);
  });

  it('sorts by price', () => {
    const results = filterBooks(seedBooks, { ...defaultFilters, sort: '价格从低到高' });
    expect(results[0].price).toBeLessThanOrEqual(results.at(-1)!.price);
  });
});

describe('demoRepository persistence', () => {
  it('toggles and returns favorites', async () => {
    expect(await demoRepository.toggleFavorite('math-7')).toBe(true);
    expect((await demoRepository.listFavorites()).map((book) => book.id)).toContain('math-7');
    expect(peekFavorites()?.map((book) => book.id)).toContain('math-7');
    expect(await demoRepository.toggleFavorite('math-7')).toBe(false);
    expect(peekFavorites()).toEqual([]);
  });

  it('saves a draft and publishes a local listing', async () => {
    const draft = { title: '测试教材', author: '北理同学', isbn: '123', category: '教材教辅', course: '测试课', price: '12', originalPrice: '30', condition: '九成新' as const, campus: '良乡' as const, description: '一本用于测试发布流程的书。', tags: ['测试'] };
    await demoRepository.saveDraft(draft);
    expect((await demoRepository.getDraft())?.title).toBe('测试教材');
    const listing = await demoRepository.publishListing(draft);
    expect(listing.status).toBe('available');
    expect(peekMyListings()?.some((book) => book.id === listing.id)).toBe(true);
    expect((await demoRepository.listMyListings()).some((book) => book.id === listing.id)).toBe(true);
    await demoRepository.deleteListing(listing.id);
    expect((await demoRepository.listMyListings()).some((book) => book.id === listing.id)).toBe(false);
  });

  it('appends sent messages to a thread', async () => {
    await demoRepository.sendMessage('thread-lin', '新的测试消息');
    const thread = await demoRepository.getThread('thread-lin');
    expect(thread?.messages.at(-1)?.text).toBe('新的测试消息');
  });

  it('保持仅查看会话在消息列表中的原顺序', async () => {
    const order = (await demoRepository.listThreads()).map((thread) => thread.id);
    const secondThreadId = order[1];

    await demoRepository.getThread(secondThreadId);

    expect(peekThreads()?.map((thread) => thread.id)).toEqual(order);
  });

  it('发送消息后将对应会话置顶', async () => {
    const order = (await demoRepository.listThreads()).map((thread) => thread.id);
    const secondThreadId = order[1];

    await demoRepository.sendMessage(secondThreadId, '用于验证置顶的消息');

    expect(peekThreads()?.[0].id).toBe(secondThreadId);
  });

  it('stores only the authenticated student id', () => {
    demoRepository.markAuthenticated('1120230000');
    expect(demoRepository.getAuthenticatedSid()).toBe('1120230000');
    demoRepository.clearAuthentication();
    expect(demoRepository.getAuthenticatedSid()).toBe('');
  });

  it('loads the real public catalog for guests and sends filters to the server', async () => {
    demoRepository.markAuthenticated('guest');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{
      id: 'real-listing', title: '真实教材', author: '真实卖家', isbn: '9787300000000', category: '教材教辅',
      course: '测试课程', priceCents: 1800, originalPriceCents: 3600, condition: '九成新', campus: '良乡',
      description: '来自服务端的数据', status: 'ACTIVE', sellerId: 'seller-real', createdAt: '2026-08-28T00:00:00.000Z', tags: [],
      seller: { id: 'seller-real', nickname: '真实卖家', campus: '良乡', campusStatus: 'VERIFIED' }, images: [],
    }], nextCursor: 'real-listing' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await demoRepository.listBooksPage({ ...defaultFilters, query: ' 数据结构 ', condition: '九成新', minPrice: 10, maxPrice: 90, sort: '价格从低到高' });
    const books = page.items;

    expect(books).toHaveLength(1);
    expect(page.nextCursor).toBe('real-listing');
    expect(books[0]).toMatchObject({ id: 'real-listing', title: '真实教材', seller: { name: '真实卖家' } });
    expect(peekBooks({ ...defaultFilters, query: ' 数据结构 ', condition: '九成新', minPrice: 10, maxPrice: 90, sort: '价格从低到高' })?.[0]).toMatchObject({ id: 'real-listing', title: '真实教材' });
    const requestedUrl = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl).toContain('/api/v1/listings?');
    expect(requestedUrl).toContain('q=数据结构');
    expect(requestedUrl).toContain('condition=九成新');
    expect(requestedUrl).toContain('minPriceCents=1000');
    expect(requestedUrl).toContain('maxPriceCents=9000');
    expect(requestedUrl).toContain('sort=price_asc');
  });

  it('submits authenticated feedback through the real API', async () => {
    demoRepository.markAuthenticated('user-real');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'feedback-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await demoRepository.submitFeedback('BUG', '登录按钮没有响应');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/feedback', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ type: 'BUG', content: '登录按钮没有响应', platform: 'H5' })
    }));
  });

  it('uses the protected owner endpoint for inactive listing details and status changes', async () => {
    demoRepository.markAuthenticated('user-real');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '商品不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'listing-a', title: '我的下架商品', priceCents: 1200, condition: '八成新', campus: '良乡', status: 'OFF_SHELF', sellerId: 'user-real', createdAt: '2026-08-28T00:00:00.000Z', images: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 4 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(demoRepository.getBook('listing-a')).resolves.toMatchObject({ id: 'listing-a', status: 'offline' });
    await demoRepository.updateListingStatus('listing-a', 'available');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/listings/mine/listing-a');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/v1/listings/mine/listing-a');
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ body: JSON.stringify({ status: 'ACTIVE', version: 4 }) });
  });

  it('scopes the in-memory favorite state to the signed-in account', async () => {
    demoRepository.markAuthenticated('user-a');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'listing-a', title: '收藏书', priceCents: 1200, condition: '八成新', campus: '良乡', status: 'ACTIVE', sellerId: 'seller-a', createdAt: '2026-08-28T00:00:00.000Z', images: [] }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await demoRepository.listFavorites();

    demoRepository.markAuthenticated('user-b');
    await expect(demoRepository.toggleFavorite('listing-a')).resolves.toBe(true);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
  });

  it('submits listing reports through the real API', async () => {
    demoRepository.markAuthenticated('user-real');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'report-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await demoRepository.reportBook('listing-a', '商品信息不当或疑似虚假');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ targetType: 'LISTING', targetId: 'listing-a', reason: '商品信息不当或疑似虚假' })
    }));
  });

  it('preserves API conversation timestamps so the UI can sort and format them', async () => {
    demoRepository.markAuthenticated('user-real');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'thread-real', listingId: 'real-listing', buyerId: 'user-real', sellerId: 'seller-real', lastMessageAt: '2026-08-29T12:24:07.770Z',
      unread: 2, members: [{ userId: 'user-real', user: { id: 'user-real', nickname: '自己', campus: null } }, { userId: 'seller-real', user: { id: 'seller-real', nickname: '卖家', campus: null } }],
      messages: [{ id: '9', senderId: 'seller-real', content: '这本书还在', createdAt: '2026-08-29T12:24:07.770Z' }],
      listing: { id: 'real-listing', title: '真实教材', author: '真实作者', priceCents: 1800, condition: '九成新', campus: '良乡', status: 'ACTIVE', sellerId: 'seller-real', createdAt: '2026-08-28T00:00:00.000Z', images: [] },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const threads = await demoRepository.listThreads();

    expect(threads[0]).toMatchObject({ id: 'thread-real', buyerId: 'user-real', unread: 2, updatedAt: '2026-08-29T12:24:07.770Z', messages: [{ id: '9', text: '这本书还在', createdAt: '2026-08-29T12:24:07.770Z' }], book: { id: 'real-listing', title: '真实教材' } });
    expect(peekThreads()?.[0].id).toBe('thread-real');
    expect(peekThread('thread-real')?.book?.title).toBe('真实教材');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: '商品不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    expect(await demoRepository.getBook('real-listing')).toMatchObject({ id: 'real-listing', title: '真实教材' });
    vi.useRealTimers();
  });

  it('marks every visible message as read and keeps full history after summary refreshes', async () => {
    demoRepository.markAuthenticated('user-real');
    const conversation = {
      id: 'thread-read', listingId: 'listing-read', buyerId: 'user-real', sellerId: 'seller-real', lastMessageAt: '2026-08-30T12:02:00.000Z', unread: 2,
      members: [{ userId: 'user-real', user: { id: 'user-real', nickname: '自己', campus: '良乡' } }, { userId: 'seller-real', user: { id: 'seller-real', nickname: '卖家', campus: '良乡' } }],
      listing: { id: 'listing-read', title: '消息测试书', author: '作者', priceCents: 1800, condition: '九成新', campus: '良乡', status: 'ACTIVE', sellerId: 'seller-real', createdAt: '2026-08-28T00:00:00.000Z', images: [] },
      messages: [{ id: '12', senderId: 'user-real', content: '我刚补充了一句', createdAt: '2026-08-30T12:02:00.000Z' }],
    };
    const messagePage = { items: [
      { id: '10', senderId: 'seller-real', content: '第一条未读', createdAt: '2026-08-30T12:00:00.000Z' },
      { id: '11', senderId: 'seller-real', content: '第二条未读', createdAt: '2026-08-30T12:01:00.000Z' },
      conversation.messages[0],
    ], olderCursor: null };
    const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [conversation] }))
      .mockResolvedValueOnce(response(messagePage))
      .mockResolvedValueOnce(response({ items: [conversation] }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ items: [{ ...conversation, unread: 0 }] }));
    vi.stubGlobal('fetch', fetchMock);

    await demoRepository.listThreads();
    const loaded = await demoRepository.getThread('thread-read');

    expect(loaded?.messages.map((item) => item.id)).toEqual(['10', '11', '12']);
    expect(loaded?.unread).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/conversations/thread-read/read', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ messageId: '12' }),
    }));

    await demoRepository.listThreads();
    expect(peekThread('thread-read')?.messages.map((item) => item.id)).toEqual(['10', '11', '12']);
  });
});
