import { getImages } from './image-store';
import { h5ApiRequest } from './h5-auth';
import type { DemoRepository } from './repository';
import type { Book, BookFilters, ChatThread, ListingStatus, Message, Notification, PublishDraft, User } from './types';

function draftKey() { return `biterstore:v1:api-draft:${encodeURIComponent(currentUserId() || 'anonymous')}`; }
const favoriteIds = new Set<string>();
function favoriteKey(id: string) { return `${currentUserId() || 'anonymous'}:${id}`; }

interface ApiUser {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  campus?: string | null;
  campusStatus?: string;
  bio?: string | null;
}

interface ApiImage { url?: string }

interface ApiListing {
  id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  category?: string | null;
  course?: string | null;
  priceCents: number;
  originalPriceCents?: number | null;
  condition: Book['condition'];
  campus: Book['campus'];
  description?: string | null;
  status: string;
  sellerId: string;
  seller?: ApiUser;
  createdAt: string;
  tags?: string[];
  images?: ApiImage[];
  version?: number;
}

interface ApiMessage { id: string | number; senderId: string; content: string; createdAt: string }
interface ApiMember { userId: string; user?: ApiUser }
interface ApiConversation {
  id: string;
  listingId: string;
  buyerId?: string;
  sellerId: string;
  lastMessageAt: string;
  createdAt?: string;
  listing?: ApiListing;
  unread?: number;
  members?: ApiMember[];
  messages?: ApiMessage[];
}
interface ApiNotification { id: string; type: string; title: string; body: string; readAt?: string | null; createdAt: string }

const apiDefaults: BookFilters = {
  query: '', category: '全部', campus: '全部', condition: '全部', minPrice: 0, maxPrice: 200,
  sort: '最新发布', availableOnly: true,
};

function statusFromApi(value: string): ListingStatus {
  return ({ ACTIVE: 'available', RESERVED: 'available', SOLD: 'sold', OFF_SHELF: 'offline', BLOCKED: 'offline', DRAFT: 'draft', PENDING_REVIEW: 'reviewing' }[value] || 'offline') as ListingStatus;
}

function user(value: ApiUser): User {
  const campus = ['中关村', '良乡', '西山', '珠海'].includes(value?.campus || '') ? value.campus as User['campus'] : '未设置';
  return {
    id: value?.id || '', name: value?.nickname || 'BITer', campus,
    verified: value?.campusStatus === 'VERIFIED', bio: value?.bio || '', responseTime: '通常很快回复',
    avatar: value?.avatarUrl || undefined, avatarTone: 'sage',
  };
}

function book(value: ApiListing): Book {
  return {
    id: value.id, title: value.title, author: value.author || '', isbn: value.isbn || '', category: value.category || '其他',
    course: value.course || '', price: Number(value.priceCents || 0) / 100,
    originalPrice: Number(value.originalPriceCents ?? value.priceCents ?? 0) / 100,
    condition: value.condition, campus: value.campus, description: value.description || '', status: statusFromApi(value.status),
    sellerId: value.sellerId, seller: value.seller ? user(value.seller) : undefined,
    createdAt: value.createdAt, tags: value.tags || [], tone: 'sage',
    images: (value.images || []).map((image) => image.url).filter((url): url is string => Boolean(url)),
  };
}

function message(value: ApiMessage): Message {
  return { id: String(value.id), senderId: value.senderId, text: value.content, createdAt: value.createdAt, kind: 'text' };
}

function currentUserId() {
  try { return JSON.parse(localStorage.getItem('biterstore:v1:authenticated-sid') || '""') as string; } catch { return ''; }
}

function compactThreadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function thread(value: ApiConversation): ChatThread {
  const other = (value.members || []).find((member) => member.userId !== currentUserId()) || (value.members || [])[0];
  const conversationBook = value.listing ? book(value.listing) : undefined;
  return {
    id: value.id, participantId: other?.userId || value.sellerId, participant: other?.user ? user(other.user) : undefined, buyerId: value.buyerId,
    bookId: value.listingId, unread: Number(value.unread || 0), updatedAt: compactThreadTime(value.lastMessageAt),
    book: conversationBook, messages: (value.messages || []).map(message),
  };
}

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function draftPayload(draft: PublishDraft, imageIds: string[]) {
  return {
    title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course,
    priceCents: Math.round(Number(draft.price) * 100),
    originalPriceCents: Math.round(Number(draft.originalPrice || draft.price) * 100),
    condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, imageIds, draft: false,
    clientRequestId: draft.clientRequestId,
  };
}

function putBlob(url: string, blob: Blob, authRequired: boolean, onProgress?: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.withCredentials = authRequired;
    request.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    request.onerror = () => reject(new Error('图片上传网络中断，请检查网络后重试'));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`图片上传失败（${request.status}）`));
    request.send(blob);
  });
}

async function uploadDraftImages(draft: PublishDraft, onProgress?: (progress: number) => void) {
  const images = await getImages(draft.imageStoreKey);
  const uploaded: string[] = [];
  const total = images.filter(Boolean).length;
  let completed = 0;
  for (const [index, dataUrl] of images.entries()) {
    if (!dataUrl) continue;
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const role = index === 0 ? 'COVER' : index === 1 ? 'ISBN' : 'GALLERY';
    const ticket = await h5ApiRequest<{ id: string; uploadUrl: string; authRequired?: boolean }>('/uploads/presign', {
      method: 'POST', body: JSON.stringify({ mime: blob.type || 'image/jpeg', size: blob.size, role }),
    });
    await putBlob(ticket.uploadUrl, blob, Boolean(ticket.authRequired), (fraction) => onProgress?.(Math.round(((completed + fraction) / Math.max(total, 1)) * 88)));
    await h5ApiRequest(`/uploads/${ticket.id}/complete`, { method: 'POST', body: '{}' });
    uploaded.push(ticket.id);
    completed += 1;
    onProgress?.(Math.round((completed / Math.max(total, 1)) * 88));
  }
  return uploaded;
}

export const apiRepository: DemoRepository = {
  async listBooks(filters = apiDefaults) {
    const result = await h5ApiRequest<{ items: ApiListing[] }>('/listings' + queryString({
      q: filters.query, category: filters.category === '全部' ? undefined : filters.category,
      campus: filters.campus === '全部' ? undefined : filters.campus, limit: 50,
    }));
    const items = result.items.map(book).filter((item) => item.price >= filters.minPrice && item.price <= filters.maxPrice)
      .filter((item) => filters.condition === '全部' || item.condition === filters.condition)
      .filter((item) => !filters.availableOnly || item.status === 'available');
    if (filters.sort === '价格从低到高') items.sort((a, b) => a.price - b.price);
    else if (filters.sort === '价格从高到低') items.sort((a, b) => b.price - a.price);
    return items;
  },
  async getBook(id) {
    try { return book(await h5ApiRequest<ApiListing>(`/listings/${id}`)); }
    catch {
      // Public details intentionally hide inactive listings. If the signed-in
      // owner opens one of their own historical listings, use the protected
      // owner endpoint so the detail page remains reachable after delisting.
      if (!currentUserId()) return null;
      try {
        const ownerListing = await h5ApiRequest<ApiListing>(`/listings/mine/${id}`);
        if (!ownerListing || ownerListing.id !== id) return null;
        return book(ownerListing);
      } catch { return null; }
    }
  },
  async toggleFavorite(id) {
    const key = favoriteKey(id);
    const enabled = !favoriteIds.has(key);
    await h5ApiRequest(`/listings/${id}/favorite`, { method: enabled ? 'PUT' : 'DELETE', body: '{}' });
    if (enabled) favoriteIds.add(key); else favoriteIds.delete(key);
    return enabled;
  },
  async listFavorites() {
    const items = (await h5ApiRequest<ApiListing[]>('/listings/favorites/mine')).map(book);
    const accountPrefix = `${currentUserId() || 'anonymous'}:`;
    for (const key of [...favoriteIds]) if (key.startsWith(accountPrefix)) favoriteIds.delete(key);
    items.forEach((item) => favoriteIds.add(favoriteKey(item.id)));
    return items;
  },
  async reportBook(id, reason) {
    await h5ApiRequest('/reports', { method: 'POST', body: JSON.stringify({ targetType: 'LISTING', targetId: id, reason }) });
  },
  async saveDraft(draft) { localStorage.setItem(draftKey(), JSON.stringify(draft)); },
  async getDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null') as PublishDraft | null; } catch { return null; } },
  async publishListing(draft, onProgress) {
    onProgress?.(1);
    const imageIds = await uploadDraftImages(draft, onProgress);
    onProgress?.(94);
    const created = book(await h5ApiRequest<ApiListing>('/listings', { method: 'POST', body: JSON.stringify(draftPayload(draft, imageIds)) }));
    localStorage.removeItem(draftKey());
    onProgress?.(100);
    return created;
  },
  async updateListingStatus(id, status) {
    const current = await h5ApiRequest<ApiListing>(`/listings/mine/${id}`);
    if (!Number.isFinite(Number(current.version))) throw new Error('商品版本信息缺失，请刷新后重试');
    const next = status === 'sold' ? 'SOLD' : status === 'offline' ? 'OFF_SHELF' : 'ACTIVE';
    await h5ApiRequest(`/listings/${id}/status`, { method: 'POST', body: JSON.stringify({ status: next, version: Number(current.version) }) });
  },
  async listMyListings() {
    const result = await h5ApiRequest<{ items: ApiListing[] }>('/listings/mine/all?limit=50');
    return result.items.map(book);
  },
  async deleteListing(id) { await h5ApiRequest(`/listings/${id}`, { method: 'DELETE' }); },
  async listThreads() { return (await h5ApiRequest<ApiConversation[]>('/conversations')).map(thread); },
  async getThread(id) {
    const [messages, conversations] = await Promise.all([
      h5ApiRequest<{ items: ApiMessage[] }>(`/conversations/${id}/messages`), h5ApiRequest<ApiConversation[]>('/conversations'),
    ]);
    const found = conversations.find((item) => item.id === id);
    return found ? thread({ ...found, messages: messages.items }) : null;
  },
  async sendMessage(threadId, text) { return message(await h5ApiRequest<ApiMessage>(`/conversations/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ content: text }) })); },
  async ensureThread(listingId) { return (await h5ApiRequest<{ id: string }>('/conversations', { method: 'POST', body: JSON.stringify({ listingId }) })).id; },
  async listNotifications() {
    return (await h5ApiRequest<ApiNotification[]>('/notifications')).map((value): Notification => ({
      id: value.id, type: (['like', 'comment', 'follow'].includes(value.type) ? value.type : 'system') as Notification['type'],
      title: value.title, subtitle: value.body, unread: value.readAt ? 0 : 1, createdAt: value.createdAt,
    }));
  },
  async getProfile() { return user(await h5ApiRequest<ApiUser>('/me')); },
  async submitFeedback(type, content) { await h5ApiRequest('/me/feedback', { method: 'POST', body: JSON.stringify({ type, content, platform: 'H5' }) }); },
  isOnboardingComplete() { return localStorage.getItem('biterstore:v1:onboarding') === 'true'; },
  completeOnboarding() { localStorage.setItem('biterstore:v1:onboarding', 'true'); },
  getAuthenticatedSid: currentUserId,
  markAuthenticated() {}, clearAuthentication() {},
  async resetDemoData() { throw new Error('真实数据模式不支持重置'); },
};
