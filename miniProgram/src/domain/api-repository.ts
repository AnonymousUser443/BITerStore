import { mediaAdapter, storageAdapter, uploadAdapter } from '@/platform'
import { apiQuery, apiRequest, sessionStore } from './api'
import { defaultFilters, filterListings } from './filters'
import type { DemoRepository } from './repository'
import type { ChatThread, Listing, ListingStatus, Message, Notification, PublishDraft, User } from './types'

const statusFromApi = (value: string): ListingStatus => ({ ACTIVE: 'available', RESERVED: 'available', SOLD: 'sold', OFF_SHELF: 'offline', BLOCKED: 'offline', DRAFT: 'draft', PENDING_REVIEW: 'reviewing' }[value] || 'offline') as ListingStatus
const statusToApi = (value: ListingStatus) => ({ available: 'ACTIVE', sold: 'SOLD', offline: 'OFF_SHELF', draft: 'DRAFT', reviewing: 'PENDING_REVIEW' }[value])
const listingCache = new Map<string, Listing>()
const apiFiltersKey = 'api-filters'
const apiOnboardingKey = 'api-onboarding'
const campuses = new Set(['中关村', '良乡', '西山', '珠海'])
type SnapshotKind = 'favorites' | 'my-listings' | 'profile' | 'threads' | 'thread' | 'notifications'
function snapshotKey(kind: SnapshotKind, id?: string) { return `api-snapshot:${kind}:${sessionStore.peek()?.user.id || 'anonymous'}${id ? `:${id}` : ''}` }
function readSnapshot<T>(kind: SnapshotKind, id?: string) { return storageAdapter.peek<T | undefined>(snapshotKey(kind, id), undefined) }
async function writeSnapshot<T>(kind: SnapshotKind, value: T, id?: string) { await storageAdapter.set(snapshotKey(kind, id), value) }
function listing(value: any): Listing { return { id: String(value?.id || ''), title: String(value?.title || '未命名书籍'), author: String(value?.author || ''), isbn: String(value?.isbn || ''), category: String(value?.category || '其他'), course: String(value?.course || ''), price: Number(value?.priceCents || 0) / 100, originalPrice: Number(value?.originalPriceCents ?? value?.priceCents ?? 0) / 100, condition: value?.condition || '八成新', campus: campuses.has(value?.campus) ? value.campus : '良乡', description: String(value?.description || ''), status: statusFromApi(value?.status), sellerId: String(value?.sellerId || ''), seller: value?.seller ? profile(value.seller) : undefined, createdAt: String(value?.createdAt || ''), tags: Array.isArray(value?.tags) ? value.tags : [], tone: 'sage', mediaIds: (value?.images || []).map((image: any) => String(image.id)).filter(Boolean), imageUrls: (value?.images || []).map((image: any) => image.url).filter(Boolean) } }
function remember(item: Listing) { listingCache.set(item.id, item); return item }
function profile(value: any): User { return { id: String(value?.id || ''), studentNumber: value?.studentNumber || undefined, name: String(value?.nickname || 'BITer'), campus: campuses.has(value?.campus) ? value.campus : '良乡', verified: value?.campusStatus === 'VERIFIED', wechatBound: Boolean(value?.wechatBound), bio: String(value?.bio || ''), responseTime: '通常很快回复', avatar: value?.avatarUrl || undefined, avatarTone: 'sage' } }

export const apiRepository: DemoRepository = {
  async listListings(filters = defaultFilters) { const data = await apiRequest<{ items: any[] }>('/listings' + apiQuery({ q: filters.query, category: filters.category, campus: filters.campus, limit: 50 })); return filterListings((data.items || []).map(listing).map(remember), filters) },
  async getListing(id) { try { return remember(listing(await apiRequest(`/listings/${id}`))) } catch (cause) { const cached = listingCache.get(id); if (cached) return cached; throw cause } }, peekListing(id) { return listingCache.get(id) },
  async toggleFavorite(id) { const enabled = !favoriteIds.has(id); await apiRequest(`/listings/${id}/favorite`, { method: enabled ? 'PUT' : 'DELETE' }); if (enabled) favoriteIds.add(id); else favoriteIds.delete(id); const current = readSnapshot<Listing[]>('favorites') || []; const cached = listingCache.get(id); await writeSnapshot('favorites', enabled && cached ? [cached, ...current.filter((item) => item.id !== id)] : current.filter((item) => item.id !== id)); return enabled },
  async listFavorites() { const items = (await apiRequest<any[]>('/listings/favorites/mine')).map(listing).map(remember); favoriteIds.clear(); items.forEach((item) => favoriteIds.add(item.id)); await writeSnapshot('favorites', items); return items },
  peekFavorites() { return readSnapshot<Listing[]>('favorites') },
  async reportListing(id, reason) { await apiRequest('/reports', { method: 'POST', data: { targetType: 'LISTING', targetId: id, reason } }) },
  async saveDraft(draft) { await storageAdapter.set('api-draft', draft) }, async getDraft() { return storageAdapter.get<PublishDraft | null>('api-draft', null) },
  async publishListing(draft, onProgress) { onProgress?.(1); const imageIds = await uploadImages(draft, onProgress); onProgress?.(94); const result = remember(listing(await apiRequest('/listings', { method: 'POST', data: { ...draftPayload(draft, false), imageIds } }))); await writeSnapshot('my-listings', [result, ...(readSnapshot<Listing[]>('my-listings') || []).filter((item) => item.id !== result.id)]); await storageAdapter.remove('api-draft'); onProgress?.(100); return result },
  async updateListingStatus(id, status) { const current: any = await apiRequest(`/listings/${id}`); await apiRequest(`/listings/${id}/status`, { method: 'POST', data: { status: statusToApi(status), version: current.version } }); const cached = listingCache.get(id); if (cached) remember({ ...cached, status }); const mine = readSnapshot<Listing[]>('my-listings'); if (mine) await writeSnapshot('my-listings', mine.map((item) => item.id === id ? { ...item, status } : item)); const favorites = readSnapshot<Listing[]>('favorites'); if (favorites) await writeSnapshot('favorites', favorites.map((item) => item.id === id ? { ...item, status } : item)) },
  async listMyListings() { const data = await apiRequest<{ items: any[] }>('/listings/mine/all' + apiQuery({ limit: 50 })); const items = data.items.map(listing).map(remember); await writeSnapshot('my-listings', items); return items },
  peekMyListings() { return readSnapshot<Listing[]>('my-listings') },
  async deleteListing(id) { await apiRequest(`/listings/${id}`, { method: 'DELETE' }); listingCache.delete(id); const mine = readSnapshot<Listing[]>('my-listings'); if (mine) await writeSnapshot('my-listings', mine.filter((item) => item.id !== id)); const favorites = readSnapshot<Listing[]>('favorites'); if (favorites) await writeSnapshot('favorites', favorites.filter((item) => item.id !== id)) },
  async listThreads() { const current = await sessionStore.get(); const values = (await apiRequest<any[]>('/conversations')).map((value) => thread(value, current?.user.id)); await writeSnapshot('threads', values); await Promise.all(values.map((value) => writeSnapshot('thread', value, value.id))); return values },
  peekThreads() { return readSnapshot<ChatThread[]>('threads') },
  async getThread(id) { const current = await sessionStore.get(); const [messages, all] = await Promise.all([apiRequest<{ items: any[] }>(`/conversations/${id}/messages`), apiRequest<any[]>('/conversations')]); const found = all.find((item) => item.id === id); if (!found) throw new Error('会话不存在'); const value = thread({ ...found, messages: messages.items }, current?.user.id); const latest = messages.items?.at(-1); if (latest?.id && latest.senderId !== current?.user.id) await apiRequest(`/conversations/${id}/read`, { method: 'POST', data: { messageId: String(latest.id) } }).catch(() => undefined); value.unread = 0; await persistThread(value); return value },
  peekThread(id) { return readSnapshot<ChatThread>('thread', id) },
  async sendMessage(threadId, text) { const sent = message(await apiRequest(`/conversations/${threadId}/messages`, { method: 'POST', data: { content: text } })); const cached = readSnapshot<ChatThread>('thread', threadId); if (cached) await persistThread({ ...cached, updatedAt: sent.createdAt, messages: [...cached.messages, sent] }, true); return sent },
  async ensureThread(listingId) { const result = await apiRequest<{ id: string }>('/conversations', { method: 'POST', data: { listingId } }); const cachedListing = listingCache.get(listingId); if (cachedListing) { const current = sessionStore.peek(); await persistThread({ id: result.id, participantId: cachedListing.sellerId, participant: cachedListing.seller, buyerId: current?.user.id, listingId, listing: cachedListing, unread: 0, updatedAt: '刚刚', messages: [] }, true) } return result.id },
  async listNotifications() { const values = (await apiRequest<any[]>('/notifications')).map((value): Notification => ({ id: String(value.id), type: (['like', 'comment', 'follow'].includes(value.type) ? value.type : 'system') as Notification['type'], title: String(value.title || '系统通知'), subtitle: String(value.body || ''), unread: value.readAt ? 0 : 1 })); await writeSnapshot('notifications', values); return values },
  peekNotifications() { return readSnapshot<Notification[]>('notifications') },
  async getProfile() { const value = profile(await apiRequest('/me')); await writeSnapshot('profile', value); return value },
  peekProfile() { return readSnapshot<User>('profile') },
  async updateProfile(value) { const updated = profile(await apiRequest('/me', { method: 'PATCH', data: { nickname: value.name, campus: value.campus, bio: value.bio, avatarUrl: value.avatar || null } })); await writeSnapshot('profile', updated); return updated },
  async isOnboardingComplete() { return storageAdapter.get(apiOnboardingKey, false) }, async completeOnboarding() { await storageAdapter.set(apiOnboardingKey, true) },
  async getAuthenticatedSid() { const session = await sessionStore.get(); return session?.user.id || ((await sessionStore.mode()) === 'guest' ? 'guest' : '') }, async markAuthenticated() {}, async clearAuthentication() { await sessionStore.clear() },
  async getFilters() { return storageAdapter.get(apiFiltersKey, defaultFilters) }, async saveFilters(filters) { await storageAdapter.set(apiFiltersKey, filters) }, async shouldShowResetNotice() { return false }, async acknowledgeResetNotice() {}, async resetDemoData() { throw new Error('真实数据模式不支持重置') }
}
function draftPayload(draft: PublishDraft, draftOnly: boolean) { return { title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, priceCents: Math.round(Number(draft.price) * 100), originalPriceCents: Math.round(Number(draft.originalPrice || draft.price) * 100), condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, imageIds: draft.mediaIds, draft: draftOnly, clientRequestId: draft.clientRequestId } }
function compactTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value || '刚刚'; const now = new Date(); if (date.toDateString() === now.toDateString()) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`; return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` }
function message(value: any): Message { return { id: String(value?.id || ''), senderId: String(value?.senderId || ''), text: String(value?.content || ''), createdAt: compactTime(String(value?.createdAt || '')), kind: 'text' } }
function thread(value: any, currentUserId?: string): ChatThread { const other = (value?.members || []).find((member: any) => member.userId !== currentUserId) || (value?.members || [])[0]; const conversationListing = value?.listing ? remember(listing(value.listing)) : undefined; return { id: String(value?.id || ''), participantId: String(other?.userId || value?.sellerId || ''), participant: other?.user ? profile(other.user) : undefined, buyerId: value?.buyerId, listingId: String(value?.listingId || ''), listing: conversationListing, unread: Number(value?.unread || 0), updatedAt: compactTime(String(value?.lastMessageAt || '')), messages: (value?.messages || []).map(message) } }
async function persistThread(value: ChatThread, promote = false) { await writeSnapshot('thread', value, value.id); const threads = readSnapshot<ChatThread[]>('threads') || []; const index = threads.findIndex((item) => item.id === value.id); const next = promote || index < 0 ? [value, ...threads.filter((item) => item.id !== value.id)] : threads.map((item) => item.id === value.id ? value : item); await writeSnapshot('threads', next) }
const favoriteIds = new Set<string>()
async function uploadImages(draft: PublishDraft, onProgress?: (progress: number) => void) {
  const items = (await mediaAdapter.list()).filter((item) => draft.mediaIds.includes(item.id))
  const uploaded: string[] = []
  for (const [index, item] of items.entries()) {
    const role = item.id === draft.coverMediaId ? 'COVER' : item.id === draft.isbnMediaId ? 'ISBN' : 'GALLERY'
    const ticket = await apiRequest<{ id: string; uploadUrl: string; authRequired?: boolean }>('/uploads/presign', { method: 'POST', data: { mime: item.mime, size: item.size, role } })
    const session = ticket.authRequired ? await sessionStore.get() : null
    await uploadAdapter.put(ticket.uploadUrl, item, session?.accessToken, (fraction) => onProgress?.(Math.round(((index + fraction) / Math.max(items.length, 1)) * 88)))
    await apiRequest(`/uploads/${ticket.id}/complete`, { method: 'POST' })
    uploaded.push(ticket.id)
    onProgress?.(Math.round(((index + 1) / Math.max(items.length, 1)) * 88))
  }
  return uploaded
}
