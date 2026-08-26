import { mediaAdapter, storageAdapter } from '@/platform'
import { CURRENT_USER_ID, seedListings, seedNotifications, seedThreads, users } from './seed'
import { defaultFilters, filterListings } from './filters'
import type { ChatThread, Listing, ListingFilters, ListingStatus, Message, Notification, PublishDraft, User } from './types'
import { AppError } from './types'

const KEYS = { listings: 'listings', favorites: 'favorites', threads: 'threads', draft: 'draft', onboarding: 'onboarding', filters: 'filters', notifications: 'notifications', resetNotice: 'reset-notice' }
const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
export interface DemoRepository {
  listListings(filters?: ListingFilters): Promise<Listing[]>; getListing(id: string): Promise<Listing>;
  toggleFavorite(id: string): Promise<boolean>; listFavorites(): Promise<Listing[]>;
  saveDraft(draft: PublishDraft): Promise<void>; getDraft(): Promise<PublishDraft | null>; publishListing(draft: PublishDraft): Promise<Listing>;
  updateListingStatus(id: string, status: ListingStatus): Promise<void>; listMyListings(): Promise<Listing[]>;
  listThreads(): Promise<ChatThread[]>; getThread(id: string): Promise<ChatThread>; sendMessage(threadId: string, text: string, mediaId?: string): Promise<Message>; ensureThread(listingId: string): Promise<string>;
  listNotifications(): Promise<Notification[]>; getProfile(): Promise<User>; isOnboardingComplete(): Promise<boolean>; completeOnboarding(): Promise<void>;
  getFilters(): Promise<ListingFilters>; saveFilters(filters: ListingFilters): Promise<void>;
  shouldShowResetNotice(): Promise<boolean>; acknowledgeResetNotice(): Promise<void>; resetDemoData(): Promise<void>
}
export const demoRepository: DemoRepository = {
  async listListings(filters = defaultFilters) { await wait(); return filterListings(await storageAdapter.get(KEYS.listings, seedListings), filters) },
  async getListing(id) { const item = (await storageAdapter.get(KEYS.listings, seedListings)).find((x) => x.id === id); if (!item) throw new AppError('NOT_FOUND', '商品不存在'); return item },
  async toggleFavorite(id) { const ids = await storageAdapter.get<string[]>(KEYS.favorites, []); const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; await storageAdapter.set(KEYS.favorites, next); return next.includes(id) },
  async listFavorites() { const ids = await storageAdapter.get<string[]>(KEYS.favorites, []); return (await storageAdapter.get(KEYS.listings, seedListings)).filter((x) => ids.includes(x.id)) },
  async saveDraft(draft) { await storageAdapter.set(KEYS.draft, draft) }, async getDraft() { return storageAdapter.get<PublishDraft | null>(KEYS.draft, null) },
  async publishListing(draft) {
    if (!draft.title.trim() || !draft.price || Number(draft.price) <= 0) throw new AppError('VALIDATION', '请填写标题和有效价格')
    const item: Listing = { id: `listing-${Date.now()}`, title: draft.title.trim(), author: draft.author.trim(), isbn: draft.isbn.trim(), category: draft.category, course: draft.course.trim(), price: Number(draft.price), originalPrice: Number(draft.originalPrice || draft.price), condition: draft.condition, campus: draft.campus, description: draft.description.trim(), status: 'available', sellerId: CURRENT_USER_ID, createdAt: new Date().toISOString(), tags: draft.tags, tone: 'sage', mediaIds: draft.mediaIds }
    await storageAdapter.set(KEYS.listings, [item, ...(await storageAdapter.get(KEYS.listings, seedListings))]); await storageAdapter.remove(KEYS.draft); return item
  },
  async updateListingStatus(id, status) { const items = await storageAdapter.get(KEYS.listings, seedListings); await storageAdapter.set(KEYS.listings, items.map((x) => x.id === id ? { ...x, status } : x)) },
  async listMyListings() { return (await storageAdapter.get(KEYS.listings, seedListings)).filter((x) => x.sellerId === CURRENT_USER_ID) },
  async listThreads() { return storageAdapter.get(KEYS.threads, seedThreads) },
  async getThread(id) { const threads = await storageAdapter.get(KEYS.threads, seedThreads); const thread = threads.find((x) => x.id === id); if (!thread) throw new AppError('NOT_FOUND', '会话不存在'); if (thread.unread) { thread.unread = 0; await storageAdapter.set(KEYS.threads, threads) } return thread },
  async sendMessage(threadId, text, mediaId) { const message: Message = { id: `message-${Date.now()}`, senderId: CURRENT_USER_ID, text, createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), kind: mediaId ? 'image' : 'text', mediaId }; const threads = (await storageAdapter.get(KEYS.threads, seedThreads)).map((x) => x.id === threadId ? { ...x, updatedAt: message.createdAt, messages: [...x.messages, message] } : x); await storageAdapter.set(KEYS.threads, threads); return message },
  async ensureThread(listingId) { const threads = await storageAdapter.get(KEYS.threads, seedThreads); const existing = threads.find((x) => x.listingId === listingId); if (existing) return existing.id; const listing = await this.getListing(listingId); const thread: ChatThread = { id: `thread-${listingId}`, participantId: listing.sellerId, listingId, unread: 0, updatedAt: '刚刚', messages: [] }; await storageAdapter.set(KEYS.threads, [thread, ...threads]); return thread.id },
  async listNotifications() { return storageAdapter.get(KEYS.notifications, seedNotifications) }, async getProfile() { return users.find((x) => x.id === CURRENT_USER_ID)! },
  async getFilters() { return storageAdapter.get(KEYS.filters, defaultFilters) }, async saveFilters(filters) { await storageAdapter.set(KEYS.filters, filters) },
  async isOnboardingComplete() { return storageAdapter.get(KEYS.onboarding, false) }, async completeOnboarding() { await storageAdapter.set(KEYS.onboarding, true) },
  async shouldShowResetNotice() { return !(await storageAdapter.get(KEYS.resetNotice, false)) }, async acknowledgeResetNotice() { await storageAdapter.set(KEYS.resetNotice, true) },
  async resetDemoData() { const media = await mediaAdapter.list(); await mediaAdapter.remove(media.map((x) => x.id)); await storageAdapter.clearNamespace() }
}
export function getUser(id: string) { return users.find((x) => x.id === id) ?? users[0] }
