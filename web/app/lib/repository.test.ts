import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBooks } from './demo-data';
import { defaultFilters, demoRepository, filterBooks } from './repository';

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
    expect(await demoRepository.toggleFavorite('math-7')).toBe(false);
  });

  it('saves a draft and publishes a local listing', async () => {
    const draft = { title: '测试教材', author: '北理同学', isbn: '123', category: '教材教辅', course: '测试课', price: '12', originalPrice: '30', condition: '九成新' as const, campus: '良乡' as const, description: '一本用于测试发布流程的书。', tags: ['测试'] };
    await demoRepository.saveDraft(draft);
    expect((await demoRepository.getDraft())?.title).toBe('测试教材');
    const listing = await demoRepository.publishListing(draft);
    expect(listing.status).toBe('available');
    expect((await demoRepository.listMyListings()).some((book) => book.id === listing.id)).toBe(true);
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
});
