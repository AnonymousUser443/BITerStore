import { CURRENT_USER_ID, notifications, seedBooks, seedThreads, users } from './demo-data';
import { apiRepository } from './api-repository';
import { clearImages } from './image-store';
import type { Book, BookFilters, ChatThread, ListingStatus, Message, Notification, PublishDraft, User } from './types';

const KEYS = {
  books: 'biterstore:v1:books', favorites: 'biterstore:v1:favorites', threads: 'biterstore:v1:threads',
  draft: 'biterstore:v1:draft', onboarding: 'biterstore:v1:onboarding', filters: 'biterstore:v1:filters',
  authenticatedSid: 'biterstore:v1:authenticated-sid',
};

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

export interface DemoRepository {
  listBooks(filters?: BookFilters): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  toggleFavorite(id: string): Promise<boolean>;
  listFavorites(): Promise<Book[]>;
  saveDraft(draft: PublishDraft): Promise<void>;
  getDraft(): Promise<PublishDraft | null>;
  publishListing(draft: PublishDraft): Promise<Book>;
  updateListingStatus(id: string, status: ListingStatus): Promise<void>;
  listMyListings(): Promise<Book[]>;
  listThreads(): Promise<ChatThread[]>;
  listNotifications(): Promise<Notification[]>;
  getThread(id: string): Promise<ChatThread | null>;
  sendMessage(threadId: string, text: string): Promise<Message>;
  ensureThread(bookId: string): Promise<string>;
  getProfile(): Promise<User>;
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
  async publishListing(draft) {
    const book: Book = { id: `listing-${Date.now()}`, title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, price: Number(draft.price), originalPrice: Number(draft.originalPrice || draft.price), condition: draft.condition, campus: draft.campus, description: draft.description, status: 'available', sellerId: CURRENT_USER_ID, createdAt: new Date().toISOString(), tags: draft.tags, tone: 'sage', imageStoreKey: draft.imageStoreKey };
    write(KEYS.books, [book, ...read(KEYS.books, seedBooks)]); localStorage.removeItem(KEYS.draft); await wait(480); return book;
  },
  async updateListingStatus(id, status) { write(KEYS.books, read(KEYS.books, seedBooks).map((book) => book.id === id ? { ...book, status } : book)); await wait(120); },
  async listMyListings() { await wait(); return read(KEYS.books, seedBooks).filter((book) => book.sellerId === CURRENT_USER_ID); },
  async listThreads() { await wait(); return read(KEYS.threads, seedThreads); },
  async listNotifications() { await wait(100); return notifications; },
  async getThread(id) { const threads = read(KEYS.threads, seedThreads); const thread = threads.find((item) => item.id === id) ?? null; if (thread?.unread) { thread.unread = 0; write(KEYS.threads, threads); } await wait(100); return thread; },
  async sendMessage(threadId, text) { const message: Message = { id: `message-${Date.now()}`, senderId: CURRENT_USER_ID, text, createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }; const threads = read(KEYS.threads, seedThreads).map((thread) => thread.id === threadId ? { ...thread, updatedAt: message.createdAt, messages: [...thread.messages, message] } : thread); write(KEYS.threads, threads); await wait(110); return message; },
  async ensureThread(bookId) { const threads = read(KEYS.threads, seedThreads); const existing = threads.find((thread) => thread.bookId === bookId); if (existing) return existing.id; const book = read(KEYS.books, seedBooks).find((item) => item.id === bookId)!; const next: ChatThread = { id: `thread-${bookId}`, participantId: book.sellerId, bookId, unread: 0, updatedAt: '刚刚', messages: [] }; write(KEYS.threads, [next, ...threads]); await wait(90); return next.id; },
  async getProfile() { await wait(80); return users.find((user) => user.id === CURRENT_USER_ID)!; },
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
  listBooks: (filters) => activeRepository().listBooks(filters),
  getBook: (id) => activeRepository().getBook(id),
  toggleFavorite: (id) => activeRepository().toggleFavorite(id),
  listFavorites: () => activeRepository().listFavorites(),
  saveDraft: (draft) => activeRepository().saveDraft(draft),
  getDraft: () => activeRepository().getDraft(),
  publishListing: (draft) => activeRepository().publishListing(draft),
  updateListingStatus: (id, status) => activeRepository().updateListingStatus(id, status),
  listMyListings: () => activeRepository().listMyListings(),
  listThreads: () => activeRepository().listThreads(),
  listNotifications: () => activeRepository().listNotifications(),
  getThread: (id) => activeRepository().getThread(id),
  sendMessage: (threadId, text) => activeRepository().sendMessage(threadId, text),
  ensureThread: (bookId) => activeRepository().ensureThread(bookId),
  getProfile: () => activeRepository().getProfile(),
  isOnboardingComplete: () => localRepository.isOnboardingComplete(),
  completeOnboarding: () => localRepository.completeOnboarding(),
  getAuthenticatedSid: () => localRepository.getAuthenticatedSid(),
  markAuthenticated: (sid) => localRepository.markAuthenticated(sid),
  clearAuthentication: () => localRepository.clearAuthentication(),
  resetDemoData: () => localRepository.resetDemoData(),
};

export function getUser(id: string) { return users.find((user) => user.id === id) ?? users[0]; }
