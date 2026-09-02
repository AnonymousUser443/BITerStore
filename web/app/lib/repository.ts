import { CURRENT_USER_ID, notifications, seedBooks, seedThreads, users } from './demo-data';
import { apiRepository } from './api-repository';
import { clearImages } from './image-store';
import type { Book, BookFilters, ChatThread, FeedbackType, ListingStatus, Message, Notification, PublishDraft, User } from './types';

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
function remember(items: Book[]) { items.forEach((item) => knownBooks.set(item.id, item)); return items; }
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
  if (value.book) { knownBooks.set(value.book.id, value.book); return value; }
  return { ...value, book: peekBook(value.bookId) };
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
  const known = knownBooks.get(id);
  if (known || typeof window === 'undefined') return known;
  for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((value): value is string => Boolean(value))) {
    if (!key.startsWith(LIST_SNAPSHOT_PREFIX) && !key.startsWith(MY_LISTING_SNAPSHOT_PREFIX) && !key.startsWith(FAVORITE_SNAPSHOT_PREFIX)) continue;
    const found = read<Book[]>(key, []).find((item) => item.id === id);
    if (found) { knownBooks.set(id, found); return found; }
  }
  return undefined;
}

export interface DemoRepository {
  listBooks(filters?: BookFilters): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  toggleFavorite(id: string): Promise<boolean>;
  listFavorites(): Promise<Book[]>;
  saveDraft(draft: PublishDraft): Promise<void>;
  getDraft(): Promise<PublishDraft | null>;
  publishListing(draft: PublishDraft, onProgress?: (progress: number) => void): Promise<Book>;
  updateListingStatus(id: string, status: ListingStatus): Promise<void>;
  deleteListing(id: string): Promise<void>;
  listMyListings(): Promise<Book[]>;
  listThreads(): Promise<ChatThread[]>;
  listNotifications(): Promise<Notification[]>;
  getThread(id: string): Promise<ChatThread | null>;
  sendMessage(threadId: string, text: string): Promise<Message>;
  ensureThread(bookId: string): Promise<string>;
  getProfile(): Promise<User>;
  submitFeedback(type: FeedbackType, content: string): Promise<void>;
  isOnboardingComplete(): boolean;
  completeOnboarding(): void;
  getAuthenticatedSid(): string;
  markAuthenticated(sid: string): void;
  clearAuthentication(): void;
  resetDemoData(): Promise<void>;
}

const localRepository: DemoRepository = {
  async listBooks(filters = defaultFilters) { await wait(); return filterBooks(read(KEYS.books, seedBooks), filters); },
  async getBook(id) { await wait(120); return read(KEYS.books, seedBooks).find((book) => book.id === id) ?? null; },
  async toggleFavorite(id) { const ids = read<string[]>(KEYS.favorites, []); const next = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]; write(KEYS.favorites, next); await wait(90); return next.includes(id); },
  async listFavorites() { const ids = read<string[]>(KEYS.favorites, []); await wait(); return read(KEYS.books, seedBooks).filter((book) => ids.includes(book.id)); },
  async saveDraft(draft) { write(KEYS.draft, draft); await wait(100); },
  async getDraft() { await wait(80); return read<PublishDraft | null>(KEYS.draft, null); },
  async publishListing(draft, onProgress) {
    onProgress?.(20);
    const book: Book = { id: `listing-${Date.now()}`, title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, price: Number(draft.price), originalPrice: Number(draft.originalPrice || draft.price), condition: draft.condition, campus: draft.campus, description: draft.description, status: 'available', sellerId: CURRENT_USER_ID, createdAt: new Date().toISOString(), tags: draft.tags, tone: 'sage', imageStoreKey: draft.imageStoreKey };
    write(KEYS.books, [book, ...read(KEYS.books, seedBooks)]); localStorage.removeItem(KEYS.draft); await wait(480); onProgress?.(100); return book;
  },
  async updateListingStatus(id, status) { write(KEYS.books, read(KEYS.books, seedBooks).map((book) => book.id === id ? { ...book, status } : book)); await wait(120); },
  async deleteListing(id) { write(KEYS.books, read(KEYS.books, seedBooks).filter((book) => book.id !== id)); await wait(120); },
  async listMyListings() { await wait(); return read(KEYS.books, seedBooks).filter((book) => book.sellerId === CURRENT_USER_ID); },
  async listThreads() { await wait(); return read(KEYS.threads, seedThreads); },
  async listNotifications() { await wait(100); return notifications; },
  async getThread(id) { const threads = read(KEYS.threads, seedThreads); const thread = threads.find((item) => item.id === id) ?? null; if (thread?.unread) { thread.unread = 0; write(KEYS.threads, threads); } await wait(100); return thread; },
  async sendMessage(threadId, text) { const message: Message = { id: `message-${Date.now()}`, senderId: CURRENT_USER_ID, text, createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }; const threads = read(KEYS.threads, seedThreads).map((thread) => thread.id === threadId ? { ...thread, updatedAt: message.createdAt, messages: [...thread.messages, message] } : thread); write(KEYS.threads, threads); await wait(110); return message; },
  async ensureThread(bookId) { const threads = read(KEYS.threads, seedThreads); const existing = threads.find((thread) => thread.bookId === bookId); if (existing) return existing.id; const book = read(KEYS.books, seedBooks).find((item) => item.id === bookId)!; const next: ChatThread = { id: `thread-${bookId}`, participantId: book.sellerId, bookId, unread: 0, updatedAt: '刚刚', messages: [] }; write(KEYS.threads, [next, ...threads]); await wait(90); return next.id; },
  async getProfile() { await wait(80); return users.find((user) => user.id === CURRENT_USER_ID)!; },
  async submitFeedback(type, content) { write('biterstore:v1:feedback', [{ type, content, createdAt: new Date().toISOString() }, ...read<Array<{ type: FeedbackType; content: string; createdAt: string }>>('biterstore:v1:feedback', [])]); await wait(120); },
  isOnboardingComplete() { return read(KEYS.onboarding, false); },
  completeOnboarding() { write(KEYS.onboarding, true); },
  getAuthenticatedSid() { return read(KEYS.authenticatedSid, ''); },
  markAuthenticated(sid) { write(KEYS.authenticatedSid, sid); },
  clearAuthentication() { localStorage.removeItem(KEYS.authenticatedSid); },
  async resetDemoData() { Object.values(KEYS).forEach((key) => localStorage.removeItem(key)); await clearImages(); await wait(160); },
};

function usesRealApi() {
  const sid = localRepository.getAuthenticatedSid();
  return Boolean(sid && sid !== 'guest');
}

function activeRepository() {
  return usesRealApi() ? apiRepository : localRepository;
}

export const demoRepository: DemoRepository = {
  async listBooks(filters = defaultFilters) { const items = remember(await activeRepository().listBooks(filters)); write(listSnapshotKey(filters), items); return items; },
  async getBook(id) { const cached = peekBook(id); const item = await activeRepository().getBook(id); if (item) knownBooks.set(item.id, item); return item || cached || null; },
  async toggleFavorite(id) {
    const enabled = await activeRepository().toggleFavorite(id);
    const current = peekFavorites() || [];
    const item = peekBook(id);
    write(favoriteSnapshotKey(), enabled && item ? [item, ...current.filter((book) => book.id !== id)] : current.filter((book) => book.id !== id));
    return enabled;
  },
  async listFavorites() { const items = remember(await activeRepository().listFavorites()); write(favoriteSnapshotKey(), items); return items; },
  saveDraft: (draft) => activeRepository().saveDraft(draft),
  getDraft: () => activeRepository().getDraft(),
  async publishListing(draft, onProgress) {
    const created = await activeRepository().publishListing(draft, onProgress);
    knownBooks.set(created.id, created);
    write(myListingSnapshotKey(), [created, ...(peekMyListings() || []).filter((item) => item.id !== created.id)]);
    updateSnapshots((items) => [created, ...items.filter((item) => item.id !== created.id)], [LIST_SNAPSHOT_PREFIX]);
    return created;
  },
  async updateListingStatus(id, status) { await activeRepository().updateListingStatus(id, status); updateSnapshots((items) => items.map((item) => item.id === id ? { ...item, status } : item)); },
  async deleteListing(id) { await activeRepository().deleteListing(id); knownBooks.delete(id); updateSnapshots((items) => items.filter((item) => item.id !== id)); },
  async listMyListings() { const items = remember(await activeRepository().listMyListings()); write(myListingSnapshotKey(), items); return items; },
  async listThreads() { const items = (await activeRepository().listThreads()).map(enrichThread); write(threadListSnapshotKey(), items); items.forEach((item) => write(threadDetailSnapshotKey(item.id), item)); return items; },
  async listNotifications() { const items = await activeRepository().listNotifications(); write(notificationSnapshotKey(), items); return items; },
  async getThread(id) { const item = await activeRepository().getThread(id); return item ? writeThread(item) : null; },
  async sendMessage(threadId, text) { const message = await activeRepository().sendMessage(threadId, text); const cached = peekThread(threadId); if (cached) writeThread({ ...cached, updatedAt: message.createdAt, messages: [...cached.messages.filter((item) => item.id !== message.id), message] }, true); return message; },
  async ensureThread(bookId) {
    const id = await activeRepository().ensureThread(bookId);
    if (!peekThread(id)) {
      const book = peekBook(bookId);
      if (book) writeThread({ id, participantId: book.sellerId, participant: book.seller, buyerId: localRepository.getAuthenticatedSid(), bookId, book, unread: 0, updatedAt: '刚刚', messages: [] }, true);
    }
    return id;
  },
  getProfile: () => activeRepository().getProfile(),
  submitFeedback: (type, content) => activeRepository().submitFeedback(type, content),
  isOnboardingComplete: () => localRepository.isOnboardingComplete(),
  completeOnboarding: () => localRepository.completeOnboarding(),
  getAuthenticatedSid: () => localRepository.getAuthenticatedSid(),
  markAuthenticated: (sid) => localRepository.markAuthenticated(sid),
  clearAuthentication: () => localRepository.clearAuthentication(),
  resetDemoData: () => localRepository.resetDemoData(),
};

export function getUser(id: string) { return users.find((user) => user.id === id) ?? users[0]; }
