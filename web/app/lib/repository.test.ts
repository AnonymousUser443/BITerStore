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

  it('stores only the authenticated student id', () => {
    demoRepository.markAuthenticated('1120230000');
    expect(demoRepository.getAuthenticatedSid()).toBe('1120230000');
    demoRepository.clearAuthentication();
    expect(demoRepository.getAuthenticatedSid()).toBe('');
  });

  it('switches Golden pages to the real API after authentication', async () => {
    demoRepository.markAuthenticated('user-real');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{
      id: 'real-listing', title: '真实教材', author: '真实卖家', isbn: '9787300000000', category: '教材教辅',
      course: '测试课程', priceCents: 1800, originalPriceCents: 3600, condition: '九成新', campus: '良乡',
      description: '来自服务端的数据', status: 'ACTIVE', sellerId: 'seller-real', createdAt: '2026-08-28T00:00:00.000Z', tags: [],
      seller: { id: 'seller-real', nickname: '真实卖家', campus: '良乡', campusStatus: 'VERIFIED' }, images: [],
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const books = await demoRepository.listBooks();

    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ id: 'real-listing', title: '真实教材', seller: { name: '真实卖家' } });
    expect(peekBooks()?.[0]).toMatchObject({ id: 'real-listing', title: '真实教材' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/listings?');
  });

  it('formats API conversation timestamps for compact message cards', async () => {
    demoRepository.markAuthenticated('user-real');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'thread-real', listingId: 'real-listing', buyerId: 'user-real', sellerId: 'seller-real', lastMessageAt: '2026-08-29T12:24:07.770Z',
      unread: 0, members: [{ userId: 'user-real', user: { id: 'user-real', nickname: '自己', campus: null } }, { userId: 'seller-real', user: { id: 'seller-real', nickname: '卖家', campus: null } }],
      listing: { id: 'real-listing', title: '真实教材', author: '真实作者', priceCents: 1800, condition: '九成新', campus: '良乡', status: 'ACTIVE', sellerId: 'seller-real', createdAt: '2026-08-28T00:00:00.000Z', images: [] },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const threads = await demoRepository.listThreads();

    expect(threads[0]).toMatchObject({ id: 'thread-real', buyerId: 'user-real', updatedAt: '8月29日', book: { id: 'real-listing', title: '真实教材' } });
    expect(peekThreads()?.[0].id).toBe('thread-real');
    expect(peekThread('thread-real')?.book?.title).toBe('真实教材');
    vi.useRealTimers();
  });
});
