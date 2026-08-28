import Taro from '@tarojs/taro'
import { mediaAdapter, storageAdapter, uploadAdapter } from '@/platform'
import { apiQuery, apiRequest, sessionStore } from './api'
import { defaultFilters } from './filters'
import type { DemoRepository } from './repository'
import type { ChatThread, Listing, ListingStatus, Message, Notification, PublishDraft, User } from './types'

const statusFromApi = (value: string): ListingStatus => ({ ACTIVE: 'available', RESERVED: 'available', SOLD: 'sold', OFF_SHELF: 'offline', BLOCKED: 'offline', DRAFT: 'draft', PENDING_REVIEW: 'draft' }[value] || 'offline') as ListingStatus
const statusToApi = (value: ListingStatus) => ({ available: 'ACTIVE', sold: 'SOLD', offline: 'OFF_SHELF', draft: 'DRAFT' }[value])
function listing(value: any): Listing { return { id: value.id, title: value.title, author: value.author, isbn: value.isbn, category: value.category, course: value.course, price: value.priceCents / 100, originalPrice: (value.originalPriceCents ?? value.priceCents) / 100, condition: value.condition, campus: value.campus, description: value.description, status: statusFromApi(value.status), sellerId: value.sellerId, seller: value.seller ? profile(value.seller) : undefined, createdAt: value.createdAt, tags: value.tags || [], tone: 'sage', mediaIds: (value.images || []).map((image: any) => image.id) } }
function profile(value: any): User { return { id: value.id, name: value.nickname, campus: value.campus || '良乡', verified: value.campusStatus === 'VERIFIED', wechatBound: value.wechatBound, bio: value.bio || '', responseTime: '通常很快回复', avatar: value.avatarUrl, avatarTone: 'sage' } }

export const apiRepository: DemoRepository = {
  async listListings(filters = defaultFilters) { const data = await apiRequest<{ items: any[] }>('/listings' + apiQuery({ q: filters.query, category: filters.category, campus: filters.campus, limit: 50 })); return data.items.map(listing).filter((item) => item.price >= filters.minPrice && item.price <= filters.maxPrice) },
  async getListing(id) { return listing(await apiRequest(`/listings/${id}`)) }, peekListing() { return undefined },
  async toggleFavorite(id) { const enabled = !favoriteIds.has(id); await apiRequest(`/listings/${id}/favorite`, { method: enabled ? 'PUT' : 'DELETE' }); if (enabled) favoriteIds.add(id); else favoriteIds.delete(id); return enabled },
  async listFavorites() { const items = (await apiRequest<any[]>('/listings/favorites/mine')).map(listing); items.forEach((item) => favoriteIds.add(item.id)); return items },
  async saveDraft(draft) { await storageAdapter.set('api-draft', draft) }, async getDraft() { return storageAdapter.get<PublishDraft | null>('api-draft', null) },
  async publishListing(draft) { const imageIds = await uploadImages(draft.mediaIds); const result = listing(await apiRequest('/listings', { method: 'POST', data: { ...draftPayload(draft, false), imageIds } })); await storageAdapter.remove('api-draft'); return result },
  async updateListingStatus(id, status) { const current: any = await apiRequest(`/listings/${id}`); await apiRequest(`/listings/${id}/status`, { method: 'POST', data: { status: statusToApi(status), version: current.version } }) },
  async listMyListings() { const data = await apiRequest<{ items: any[] }>('/listings/mine/all' + apiQuery({ limit: 50 })); return data.items.map(listing) },
  async listThreads() { return (await apiRequest<any[]>('/conversations')).map(thread) },
  async getThread(id) { const messages = await apiRequest<{ items: any[] }>(`/conversations/${id}/messages`); const all = await apiRequest<any[]>('/conversations'); const found = all.find((item) => item.id === id); if (!found) throw new Error('会话不存在'); return thread({ ...found, messages: messages.items }) },
  async sendMessage(threadId, text) { return message(await apiRequest(`/conversations/${threadId}/messages`, { method: 'POST', data: { content: text } })) },
  async ensureThread(listingId) { return (await apiRequest<{ id: string }>('/conversations', { method: 'POST', data: { listingId } })).id },
  async listNotifications() { const values = await apiRequest<any[]>('/notifications'); return values.map((value): Notification => ({ id: value.id, type: value.type, title: value.title, subtitle: value.body, unread: value.readAt ? 0 : 1 })) },
  async getProfile() { return profile(await apiRequest('/me')) },
  async isOnboardingComplete() { return Taro.getStorageSync('biterstore:api:onboarding') === 'true' }, async completeOnboarding() { Taro.setStorageSync('biterstore:api:onboarding', 'true') },
  async getAuthenticatedSid() { const session = await sessionStore.get(); return session?.user.id || ((await sessionStore.mode()) === 'guest' ? 'guest' : '') }, async markAuthenticated() {}, async clearAuthentication() { await sessionStore.clear() },
  async getFilters() { return defaultFilters }, async saveFilters() {}, async shouldShowResetNotice() { return false }, async acknowledgeResetNotice() {}, async resetDemoData() { throw new Error('真实数据模式不支持重置') }
}
function draftPayload(draft: PublishDraft, draftOnly: boolean) { return { title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, priceCents: Math.round(Number(draft.price) * 100), originalPriceCents: Math.round(Number(draft.originalPrice || draft.price) * 100), condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, imageIds: draft.mediaIds, draft: draftOnly } }
function message(value: any): Message { return { id: String(value.id), senderId: value.senderId, text: value.content, createdAt: value.createdAt, kind: 'text' } }
function thread(value: any): ChatThread { const other = (value.members || [])[0]; return { id: value.id, participantId: other?.userId || value.sellerId, listingId: value.listingId, unread: 0, updatedAt: value.lastMessageAt, messages: (value.messages || []).map(message) } }
const favoriteIds = new Set<string>()
async function uploadImages(ids: string[]) {
  const items = (await mediaAdapter.list()).filter((item) => ids.includes(item.id))
  const uploaded: string[] = []
  for (const item of items) {
    const ticket = await apiRequest<{ id: string; uploadUrl: string }>('/uploads/presign', { method: 'POST', data: { mime: item.mime, size: item.size } })
    await uploadAdapter.put(ticket.uploadUrl, item)
    await apiRequest(`/uploads/${ticket.id}/complete`, { method: 'POST' })
    uploaded.push(ticket.id)
  }
  return uploaded
}
