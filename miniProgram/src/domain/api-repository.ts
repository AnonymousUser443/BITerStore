import Taro from '@tarojs/taro'
import { mediaAdapter, storageAdapter, uploadAdapter } from '@/platform'
import { apiQuery, apiRequest, sessionStore } from './api'
import { defaultFilters } from './filters'
import type { DemoRepository } from './repository'
import type { ChatThread, Listing, ListingStatus, Message, Notification, PublishDraft, User } from './types'

const statusFromApi = (value: string): ListingStatus => ({ ACTIVE: 'available', RESERVED: 'available', SOLD: 'sold', OFF_SHELF: 'offline', BLOCKED: 'offline', DRAFT: 'draft', PENDING_REVIEW: 'reviewing' }[value] || 'offline') as ListingStatus
const statusToApi = (value: ListingStatus) => ({ available: 'ACTIVE', sold: 'SOLD', offline: 'OFF_SHELF', draft: 'DRAFT', reviewing: 'PENDING_REVIEW' }[value])
const listingCache = new Map<string, Listing>()
let myListingsCache: Listing[] | undefined
function listing(value: any): Listing { return { id: value.id, title: value.title, author: value.author, isbn: value.isbn, category: value.category, course: value.course, price: value.priceCents / 100, originalPrice: (value.originalPriceCents ?? value.priceCents) / 100, condition: value.condition, campus: value.campus, description: value.description, status: statusFromApi(value.status), sellerId: value.sellerId, seller: value.seller ? profile(value.seller) : undefined, createdAt: value.createdAt, tags: value.tags || [], tone: 'sage', mediaIds: (value.images || []).map((image: any) => image.id), imageUrls: (value.images || []).map((image: any) => image.url).filter(Boolean) } }
function remember(item: Listing) { listingCache.set(item.id, item); return item }
function profile(value: any): User { return { id: value.id, studentNumber: value.studentNumber || undefined, name: value.nickname, campus: value.campus || '良乡', verified: value.campusStatus === 'VERIFIED', wechatBound: value.wechatBound, bio: value.bio || '', responseTime: '通常很快回复', avatar: value.avatarUrl, avatarTone: 'sage' } }

export const apiRepository: DemoRepository = {
  async listListings(filters = defaultFilters) { const data = await apiRequest<{ items: any[] }>('/listings' + apiQuery({ q: filters.query, category: filters.category, campus: filters.campus, limit: 50 })); return data.items.map(listing).map(remember).filter((item) => item.price >= filters.minPrice && item.price <= filters.maxPrice) },
  async getListing(id) { return remember(listing(await apiRequest(`/listings/${id}`))) }, peekListing(id) { return listingCache.get(id) },
  async toggleFavorite(id) { const enabled = !favoriteIds.has(id); await apiRequest(`/listings/${id}/favorite`, { method: enabled ? 'PUT' : 'DELETE' }); if (enabled) favoriteIds.add(id); else favoriteIds.delete(id); return enabled },
  async listFavorites() { const items = (await apiRequest<any[]>('/listings/favorites/mine')).map(listing); items.forEach((item) => favoriteIds.add(item.id)); return items },
  async reportListing(id, reason) { await apiRequest('/reports', { method: 'POST', data: { targetType: 'LISTING', targetId: id, reason } }) },
  async saveDraft(draft) { await storageAdapter.set('api-draft', draft) }, async getDraft() { return storageAdapter.get<PublishDraft | null>('api-draft', null) },
  async publishListing(draft, onProgress) { onProgress?.(1); const imageIds = await uploadImages(draft, onProgress); onProgress?.(94); const result = remember(listing(await apiRequest('/listings', { method: 'POST', data: { ...draftPayload(draft, false), imageIds } }))); myListingsCache = [result, ...(myListingsCache || []).filter((item) => item.id !== result.id)]; await storageAdapter.remove('api-draft'); onProgress?.(100); return result },
  async updateListingStatus(id, status) { const current: any = await apiRequest(`/listings/${id}`); await apiRequest(`/listings/${id}/status`, { method: 'POST', data: { status: statusToApi(status), version: current.version } }); const cached = listingCache.get(id); if (cached) remember({ ...cached, status }); myListingsCache = myListingsCache?.map((item) => item.id === id ? { ...item, status } : item) },
  async listMyListings() { const data = await apiRequest<{ items: any[] }>('/listings/mine/all' + apiQuery({ limit: 50 })); myListingsCache = data.items.map(listing).map(remember); return myListingsCache },
  peekMyListings() { return myListingsCache },
  async deleteListing(id) { await apiRequest(`/listings/${id}`, { method: 'DELETE' }); listingCache.delete(id); myListingsCache = myListingsCache?.filter((item) => item.id !== id) },
  async listThreads() { const current = await sessionStore.get(); return (await apiRequest<any[]>('/conversations')).map((value) => thread(value, current?.user.id)) },
  async getThread(id) { const current = await sessionStore.get(); const messages = await apiRequest<{ items: any[] }>(`/conversations/${id}/messages`); const all = await apiRequest<any[]>('/conversations'); const found = all.find((item) => item.id === id); if (!found) throw new Error('会话不存在'); return thread({ ...found, messages: messages.items }, current?.user.id) },
  async sendMessage(threadId, text) { return message(await apiRequest(`/conversations/${threadId}/messages`, { method: 'POST', data: { content: text } })) },
  async ensureThread(listingId) { return (await apiRequest<{ id: string }>('/conversations', { method: 'POST', data: { listingId } })).id },
  async listNotifications() { const values = await apiRequest<any[]>('/notifications'); return values.map((value): Notification => ({ id: value.id, type: value.type, title: value.title, subtitle: value.body, unread: value.readAt ? 0 : 1 })) },
  async getProfile() { return profile(await apiRequest('/me')) },
  async updateProfile(value) { return profile(await apiRequest('/me', { method: 'PATCH', data: { nickname: value.name, campus: value.campus, bio: value.bio, avatarUrl: value.avatar || null } })) },
  async isOnboardingComplete() { return Taro.getStorageSync('biterstore:api:onboarding') === 'true' }, async completeOnboarding() { Taro.setStorageSync('biterstore:api:onboarding', 'true') },
  async getAuthenticatedSid() { const session = await sessionStore.get(); return session?.user.id || ((await sessionStore.mode()) === 'guest' ? 'guest' : '') }, async markAuthenticated() {}, async clearAuthentication() { await sessionStore.clear() },
  async getFilters() { return defaultFilters }, async saveFilters() {}, async shouldShowResetNotice() { return false }, async acknowledgeResetNotice() {}, async resetDemoData() { throw new Error('真实数据模式不支持重置') }
}
function draftPayload(draft: PublishDraft, draftOnly: boolean) { return { title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, priceCents: Math.round(Number(draft.price) * 100), originalPriceCents: Math.round(Number(draft.originalPrice || draft.price) * 100), condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, imageIds: draft.mediaIds, draft: draftOnly, clientRequestId: draft.clientRequestId } }
function message(value: any): Message { return { id: String(value.id), senderId: value.senderId, text: value.content, createdAt: value.createdAt, kind: 'text' } }
function thread(value: any, currentUserId?: string): ChatThread { const other = (value.members || []).find((member: any) => member.userId !== currentUserId) || (value.members || [])[0]; return { id: value.id, participantId: other?.userId || value.sellerId, participant: other?.user ? profile(other.user) : undefined, listingId: value.listingId, unread: Number(value.unread || 0), updatedAt: value.lastMessageAt, messages: (value.messages || []).map(message) } }
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
