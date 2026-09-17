import { CURRENT_USER_ID, notifications, seedBooks, seedThreads, users } from './demo-data';
import { apiRepository } from './api-repository';
import { clearImages } from './image-store';
import { mergeMessagesChronologically } from './date-time';
import type { Book, BookFilters, ChatThread, FeedbackType, ListingStatus, Message, Notification, PublishDraft, User } from './types';

declare const __API_URL__: string;

const KEYS = {
  books: 'biterstore:v1:books', favorites: 'biterstore:v1:favorites', threads: 'biterstore:v1:threads',
  draft: 'biterstore:v1:draft', onboarding: 'biterstore:v1:onboarding', filters: 'biterstore:v1:filters',
  authenticatedSid: 'biterstore:v1:authenticated-sid',
};

const LIST_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:list:';
const MY_LISTING_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:mine:';
const FAVORITE_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:favorites:';
const THREAD_LIST_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:threads:';
const THREAD_DETAIL_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:thread:';
const NOTIFICATION_SNAPSHOT_PREFIX = 'biterstore:v1:snapshot:notifications:';
const knownBooks = new Map<string, Book>();
const wait = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function write<T>(key: string, value: T) {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

export const defaultFilters: BookFilters = {
  query: '', category: '全部', campus: '全部', condition: '全部', minPrice: 0, maxPrice: 200,
  sort: '最新发布', availableOnly: true,
};

export function filterBooks(books: Book[], filters: BookFilters): Book[] {
  const query = filters.query.trim().toLowerCase();
  const result = books.filter((book) => {
    const matchesQuery = !query || [book.title, book.author, book.isbn, book.course, ...book.tags].join(' ').toLowerCase().includes(query);
    return matchesQuery && (filters.category === '全部' || book.category === filters.category)
      && (filters.campus === '全部' || book.campus === filters.campus)
      && (filters.condition === '全部' || book.condition === filters.condition)
      && book.price >= filters.minPrice && book.price <= filters.maxPrice
      && (!filters.availableOnly || book.status === 'available');
  });
  if (filters.sort === '价格从低到高') result.sort((a, b) => a.price - b.price);
  else if (filters.sort === '价格从高到低') result.sort((a, b) => b.price - a.price);
  else result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}

function listSnapshotKey(filters: BookFilters) { return `${LIST_SNAPSHOT_PREFIX}${encodeURIComponent(JSON.stringify(filters))}`; }
function myListingSnapshotKey() { return `${MY_LISTING_SNAPSHOT_PREFIX}${encodeURIComponent(localRepository.getAuthenticatedSid())}`; }
function favoriteSnapshotKey() { return `${FAVORITE_SNAPSHOT_PREFIX}${encodeURIComponent(localRepository.getAuthenticatedSid())}`; }
function threadListSnapshotKey() { return `${THREAD_LIST_SNAPSHOT_PREFIX}${encodeURIComponent(localRepository.getAuthenticatedSid())}`; }
function threadDetailSnapshotKey(id: string) { return `${THREAD_DETAIL_SNAPSHOT_PREFIX}${encodeURIComponent(localRepository.getAuthenticatedSid())}:${encodeURIComponent(id)}`; }
function notificationSnapshotKey() { return `${NOTIFICATION_SNAPSHOT_PREFIX}${encodeURIComponent(localRepository.getAuthenticatedSid())}`; }
function accountScope() {
  if (typeof window === 'undefined') return 'anonymous';
  return read<string>(KEYS.authenticatedSid, '') || 'anonymous';
}
function bookCacheKey(id: string) { return `${accountScope()}:${id}`; }
function remember(items: Book[]) { items.forEach((item) => knownBooks.set(bookCacheKey(item.id), item)); return items; }
function updateSnapshots(update: (items: Book[]) => Book[], prefixes = [LIST_SNAPSHOT_PREFIX, MY_LISTING_SNAPSHOT_PREFIX, FAVORITE_SNAPSHOT_PREFIX]) {
  if (typeof window === 'undefined') return;
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => typeof key === 'string' && prefixes.some((prefix) => key.startsWith(prefix))).forEach((key) => {
    let next = update(read<Book[]>(key, []));
    if (key.startsWith(LIST_SNAPSHOT_PREFIX)) {
      try { next = filterBooks(next, JSON.parse(decodeURIComponent(key.slice(LIST_SNAPSHOT_PREFIX.length))) as BookFilters); } catch { /* replace malformed snapshots on the next network refresh */ }
    }
    write(key, remember(next));
  });
}
export function peekBooks(filters: BookFilters = defaultFilters): Book[] | undefined {
  const cached = read<Book[] | undefined>(listSnapshotKey(filters), undefined);
  return cached ? remember(cached) : undefined;
}
export function peekMyListings(): Book[] | undefined {
  const cached = read<Book[] | undefined>(myListingSnapshotKey(), undefined);
  return cached ? remember(cached) : undefined;
}
export function peekFavorites(): Book[] | undefined {
  const cached = read<Book[] | undefined>(favoriteSnapshotKey(), undefined);
  return cached ? remember(cached) : undefined;
}
export function peekThreads(): ChatThread[] | undefined { return read<ChatThread[] | undefined>(threadListSnapshotKey(), undefined); }
export function peekThread(id: string): ChatThread | undefined { return read<ChatThread | undefined>(threadDetailSnapshotKey(id), undefined); }
export function peekNotifications(): Notification[] | undefined { return read<Notification[] | undefined>(notificationSnapshotKey(), undefined); }
function enrichThread(value: ChatThread): ChatThread {
  if (value.book) { knownBooks.set(bookCacheKey(value.book.id), value.book); return value; }
  return { ...value, book: peekBook(value.bookId) };
}
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  return mergeMessagesChronologically(existing, incoming);
}
function writeThread(value: ChatThread, promote = false) {
  const enriched = enrichThread(value);
  write(threadDetailSnapshotKey(enriched.id), enriched);
  const threads = peekThreads() || [];
  const index = threads.findIndex((thread) => thread.id === enriched.id);
  const next = promote || index < 0
    ? [enriched, ...threads.filter((thread) => thread.id !== enriched.id)]
    : threads.map((thread) => thread.id === enriched.id ? enriched : thread);
  write(threadListSnapshotKey(), next);
  return enriched;
}
export function peekBook(id: string): Book | undefined {
  const known = knownBooks.get(bookCacheKey(id));
  if (known || typeof window === 'undefined') return known;
  const currentAccount = encodeURIComponent(read<string>(KEYS.authenticatedSid, '') || '');
  for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((value): value is string => Boolean(value))) {
    if (!key.startsWith(LIST_SNAPSHOT_PREFIX) && !key.startsWith(MY_LISTING_SNAPSHOT_PREFIX) && !key.startsWith(FAVORITE_SNAPSHOT_PREFIX)) continue;
    if ((key.startsWith(MY_LISTING_SNAPSHOT_PREFIX) || key.startsWith(FAVORITE_SNAPSHOT_PREFIX)) && !key.endsWith(currentAccount)) continue;
    const found = read<Book[]>(key, []).find((item) => item.id === id);
    if (found) { knownBooks.set(bookCacheKey(id), found); return found; }
  }
  return undefined;
}

export interface DemoRepository {
  listBooks(filters?: BookFilters): Promise<Book[]>;
  listBooksPage(filters?: BookFilters, cursor?: string): Promise<{ items: Book[]; nextCursor: string | null }>;
  getBook(id: string): Promise<Book | null>;
  toggleFavorite(id: string): Promise<boolean>;
  listFavorites(): Promise<Book[]>;
  reportBook(id: string, reason: string): Promise<void>;
  saveDraft(draft: PublishDraft): Promise<void>;
  getDraft(): Promise<PublishDraft | null>;
  publishListing(draft: PublishDraft, onProgress?: (progress: number) => void): Promise<Book>;
  updateListingStatus(id: string, status: ListingStatus): Promise<void>;
  deleteListing(id: string): Promise<void>;
  listMyListings(): Promise<Book[]>;
  listMyListingsPage(cursor?: string): Promise<{ items: Book[]; nextCursor: string | null }>;
  countMyListings(): Promise<number>;
  listThreads(): Promise<ChatThread[]>;
  listThreadsPage(cursor?: string): Promise<{ items: ChatThread[]; nextCursor: string | null }>;
  listNotifications(): Promise<Notification[]>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  listBlockedUsers(): Promise<User[]>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
  getThread(id: string): Promise<ChatThread | null>;
  loadOlderMessages(threadId: string, before: string): Promise<{ items: Message[]; olderCursor: string | null }>;
  sendMessage(threadId: string, text: string): Promise<Message>;
  ensureThread(bookId: string): Promise<string>;
  getProfile(): Promise<User>;
  deleteAccount(): Promise<void>;
  submitFeedback(type: FeedbackType, content: string): Promise<void>;
  isOnboardingComplete(): boolean;
  completeOnboarding(): void;
  getAuthenticatedSid(): string;
  markAuthenticated(sid: string): void;
  clearAuthentication(): void;
  resetDemoData(): Promise<void>;
}

const localRepository: DemoRepository = {
  async listBooks(filters = defaultFilters) { return (await this.listBooksPage(filters)).items; },
  async listBooksPage(filters = defaultFilters, cursor) {
    await wait();
    const filtered = filterBooks(read(KEYS.books, seedBooks), filters);
    const cursorIndex = cursor ? filtered.findIndex((book) => book.id === cursor) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const items = filtered.slice(start, start + 20);
    return { items, nextCursor: start + items.length < filtered.length ? items.at(-1)?.id || null : null };
  },
  async getBook(id) { await wait(120); return read(KEYS.books, seedBooks).find((book) => book.id === id) ?? null; },
  async toggleFavorite(id) { const ids = read<string[]>(KEYS.favorites, []); const next = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]; write(KEYS.favorites, next); await wait(90); return next.includes(id); },
  async listFavorites() { const ids = read<string[]>(KEYS.favorites, []); await wait(); return read(KEYS.books, seedBooks).filter((book) => ids.includes(book.id)); },
  async reportBook() { await wait(30); },
  async saveDraft(draft) { write(KEYS.draft, draft); await wait(100); },
  async getDraft() { await wait(80); return read<PublishDraft | null>(KEYS.draft, null); },
  async publishListing(draft, onProgress) {
    onProgress?.(20);
    const book: Book = { id: `listing-${Date.now()}`, title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, price: Number(draft.price), originalPrice: Number(draft.originalPrice || draft.price), condition: draft.condition, campus: draft.campus, description: draft.description, status: 'available', sellerId: CURRENT_USER_ID, createdAt: new Date().toISOString(), tags: draft.tags, tone: 'sage', imageStoreKey: draft.imageStoreKey };
    write(KEYS.books, [book, ...read(KEYS.books, seedBooks)]); localStorage.removeItem(KEYS.draft); await wait(480); onProgress?.(100); return book;
  },
  async updateListingStatus(id, status) { write(KEYS.books, read(KEYS.books, seedBooks).map((book) => book.id === id ? { ...book, status } : book)); await wait(120); },
  async deleteListing(id) { write(KEYS.books, read(KEYS.books, seedBooks).filter((book) => book.id !== id)); await wait(120); },
  async listMyListings() { return (await this.listMyListingsPage()).items; },
  async listMyListingsPage(cursor) { await wait(); const all = read(KEYS.books, seedBooks).filter((book) => book.sellerId === CURRENT_USER_ID); const found = cursor ? all.findIndex((book) => book.id === cursor) + 1 : 0; const start = Math.max(found, 0); const items = all.slice(start, start + 20); return { items, nextCursor: start + items.length < all.length ? items.at(-1)?.id || null : null }; },
  async countMyListings() { await wait(); return read(KEYS.books, seedBooks).filter((book) => book.sellerId === CURRENT_USER_ID).length; },
  async listThreads() { return (await this.listThreadsPage()).items; },
  async listThreadsPage(cursor) { await wait(); const threads = read(KEYS.threads, seedThreads); const index = cursor ? threads.findIndex((thread) => thread.id === cursor) + 1 : 0; const items = threads.slice(Math.max(index, 0), Math.max(index, 0) + 20); return { items, nextCursor: Math.max(index, 0) + items.length < threads.length ? items.at(-1)?.id || null : null }; },
  async listNotifications() { await wait(100); return notifications; },
  async markNotificationsRead() { await wait(40); },
  async listBlockedUsers() { const ids = read<string[]>('biterstore:v1:blocks', []); return ids.map(getUser); },
  async setBlocked(userId, blocked) { const ids = read<string[]>('biterstore:v1:blocks', []); write('biterstore:v1:blocks', blocked ? [...new Set([...ids, userId])] : ids.filter((id) => id !== userId)); await wait(80); },
  async getThread(id) { const threads = read(KEYS.threads, seedThreads); const thread = threads.find((item) => item.id === id) ?? null; if (thread?.unread) { thread.unread = 0; write(KEYS.threads, threads); } await wait(100); return thread; },
  async loadOlderMessages() { return { items: [], olderCursor: null }; },
  async sendMessage(threadId, text) { const message: Message = { id: `message-${Date.now()}`, senderId: CURRENT_USER_ID, text, createdAt: new Date().toISOString() }; const threads = read(KEYS.threads, seedThreads).map((thread) => thread.id === threadId ? { ...thread, updatedAt: message.createdAt, messages: mergeMessages(thread.messages, [message]) } : thread); write(KEYS.threads, threads); await wait(110); return message; },
  async ensureThread(bookId) { const threads = read(KEYS.threads, seedThreads); const existing = threads.find((thread) => thread.bookId === bookId); if (existing) return existing.id; const book = read(KEYS.books, seedBooks).find((item) => item.id === bookId)!; const next: ChatThread = { id: `thread-${bookId}`, participantId: book.sellerId, bookId, unread: 0, updatedAt: '刚刚', messages: [] }; write(KEYS.threads, [next, ...threads]); await wait(90); return next.id; },
  async getProfile() { await wait(80); return users.find((user) => user.id === CURRENT_USER_ID)!; },
  async deleteAccount() { await this.resetDemoData(); this.clearAuthentication(); },
  async submitFeedback(type, content) { write('biterstore:v1:feedback', [{ type, content, createdAt: new Date().toISOString() }, ...read<Array<{ type: FeedbackType; content: string; createdAt: string }>>('biterstore:v1:feedback', [])]); await wait(120); },
  isOnboardingComplete() { return read(KEYS.onboarding, false); },
  completeOnboarding() { write(KEYS.onboarding, true); },
  getAuthenticatedSid() { return read(KEYS.authenticatedSid, ''); },
  markAuthenticated(sid) { write(KEYS.authenticatedSid, sid); },
  clearAuthentication() { localStorage.removeItem(KEYS.authenticatedSid); },
  async resetDemoData() { Object.values(KEYS).forEach((key) => localStorage.removeItem(key)); await clearImages(); await wait(160); },
};

function usesRealAccountApi() {
  const sid = localRepository.getAuthenticatedSid();
  return Boolean(sid && sid !== 'guest');
}

function hasConfiguredPublicApi() {
  return typeof __API_URL__ === 'string' && Boolean(__API_URL__);
}

function publicRepository() {
  return hasConfiguredPublicApi() ? apiRepository : localRepository;
}

function accountRepository() {
  return usesRealAccountApi() ? apiRepository : localRepository;
}

function clearPrivateRepositorySnapshots() {
  if (typeof window === 'undefined') return;
  const privatePrefixes = [MY_LISTING_SNAPSHOT_PREFIX, FAVORITE_SNAPSHOT_PREFIX, THREAD_LIST_SNAPSHOT_PREFIX, THREAD_DETAIL_SNAPSHOT_PREFIX, NOTIFICATION_SNAPSHOT_PREFIX];
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => typeof key === 'string' && privatePrefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => localStorage.removeItem(key));
  knownBooks.clear();
}

export const demoRepository: DemoRepository = {
  async listBooks(filters = defaultFilters) { return (await this.listBooksPage(filters)).items; },
  async listBooksPage(filters = defaultFilters, cursor) {
    const page = await publicRepository().listBooksPage(filters, cursor);
    const fresh = remember(page.items);
    const current = cursor ? peekBooks(filters) || [] : [];
    const items = cursor ? [...current, ...fresh.filter((book) => !current.some((existing) => existing.id === book.id))] : fresh;
    write(listSnapshotKey(filters), items);
    return { items, nextCursor: page.nextCursor };
  },
  async getBook(id) { const cached = peekBook(id); const item = await publicRepository().getBook(id); if (item) knownBooks.set(bookCacheKey(item.id), item); return item || cached || null; },
  async toggleFavorite(id) {
    const enabled = await accountRepository().toggleFavorite(id);
    const current = peekFavorites() || [];
    const item = peekBook(id);
    write(favoriteSnapshotKey(), enabled && item ? [item, ...current.filter((book) => book.id !== id)] : current.filter((book) => book.id !== id));
    return enabled;
  },
  async listFavorites() { const items = remember(await accountRepository().listFavorites()); write(favoriteSnapshotKey(), items); return items; },
  reportBook: (id, reason) => accountRepository().reportBook(id, reason),
  saveDraft: (draft) => accountRepository().saveDraft(draft),
  getDraft: () => accountRepository().getDraft(),
  async publishListing(draft, onProgress) {
    const created = await accountRepository().publishListing(draft, onProgress);
    knownBooks.set(bookCacheKey(created.id), created);
    write(myListingSnapshotKey(), [created, ...(peekMyListings() || []).filter((item) => item.id !== created.id)]);
    updateSnapshots((items) => [created, ...items.filter((item) => item.id !== created.id)], [LIST_SNAPSHOT_PREFIX]);
    return created;
  },
  async updateListingStatus(id, status) { await accountRepository().updateListingStatus(id, status); updateSnapshots((items) => items.map((item) => item.id === id ? { ...item, status } : item)); },
  async deleteListing(id) { await accountRepository().deleteListing(id); knownBooks.delete(bookCacheKey(id)); updateSnapshots((items) => items.filter((item) => item.id !== id)); },
  async listMyListings() { return (await this.listMyListingsPage()).items; },
  async listMyListingsPage(cursor) {
    const page = await accountRepository().listMyListingsPage(cursor);
    const fresh = remember(page.items);
    const current = cursor ? peekMyListings() || [] : [];
    const items = cursor ? [...current, ...fresh.filter((book) => !current.some((existing) => existing.id === book.id))] : fresh;
    write(myListingSnapshotKey(), items);
    return { items, nextCursor: page.nextCursor };
  },
  countMyListings: () => accountRepository().countMyListings(),
  async listThreads() { return (await this.listThreadsPage()).items; },
  async listThreadsPage(cursor) {
    const page = await accountRepository().listThreadsPage(cursor);
    const fresh = page.items.map(enrichThread);
    const current = cursor ? peekThreads() || [] : [];
    const items = cursor ? [...current, ...fresh.filter((thread) => !current.some((existing) => existing.id === thread.id))] : fresh;
    write(threadListSnapshotKey(), items);
    fresh.forEach((item) => {
      const cached = peekThread(item.id);
      write(threadDetailSnapshotKey(item.id), cached ? {
        ...item,
        olderCursor: cached.olderCursor ?? item.olderCursor,
        messages: mergeMessages(cached.messages, item.messages),
      } : item);
    });
    return { items, nextCursor: page.nextCursor };
  },
  async listNotifications() { const items = await accountRepository().listNotifications(); write(notificationSnapshotKey(), items); return items; },
  async markNotificationsRead(ids) { await accountRepository().markNotificationsRead(ids); const current = peekNotifications(); if (current) write(notificationSnapshotKey(), current.map((item) => !ids || ids.includes(item.id) ? { ...item, unread: 0 } : item)); },
  listBlockedUsers: () => accountRepository().listBlockedUsers(),
  setBlocked: (userId, blocked) => accountRepository().setBlocked(userId, blocked),
  async getThread(id) {
    const cached = peekThread(id);
    const item = await accountRepository().getThread(id);
    if (!item) return null;
    const messages = cached ? mergeMessages(cached.messages, item.messages) : item.messages;
    return writeThread({ ...item, messages, olderCursor: cached?.olderCursor ?? item.olderCursor });
  },
  async loadOlderMessages(threadId, before) {
    const page = await accountRepository().loadOlderMessages(threadId, before);
    const cached = peekThread(threadId);
    if (cached) writeThread({ ...cached, olderCursor: page.olderCursor, messages: mergeMessages(cached.messages, page.items) });
    return page;
  },
  async sendMessage(threadId, text) { const message = await accountRepository().sendMessage(threadId, text); const cached = peekThread(threadId); if (cached) writeThread({ ...cached, updatedAt: message.createdAt, messages: mergeMessages(cached.messages, [message]) }, true); return message; },
  async ensureThread(bookId) {
    const id = await accountRepository().ensureThread(bookId);
    if (!peekThread(id)) {
      const book = peekBook(bookId);
      if (book) writeThread({ id, participantId: book.sellerId, participant: book.seller, buyerId: localRepository.getAuthenticatedSid(), bookId, book, unread: 0, updatedAt: '刚刚', messages: [] }, true);
    }
    return id;
  },
  getProfile: () => accountRepository().getProfile(),
  deleteAccount: () => accountRepository().deleteAccount(),
  submitFeedback: (type, content) => accountRepository().submitFeedback(type, content),
  isOnboardingComplete: () => localRepository.isOnboardingComplete(),
  completeOnboarding: () => localRepository.completeOnboarding(),
  getAuthenticatedSid: () => localRepository.getAuthenticatedSid(),
  markAuthenticated: (sid) => localRepository.markAuthenticated(sid),
  clearAuthentication: () => { clearPrivateRepositorySnapshots(); localRepository.clearAuthentication(); },
  resetDemoData: () => localRepository.resetDemoData(),
};

export function getUser(id: string) { return users.find((user) => user.id === id) ?? users[0]; }
