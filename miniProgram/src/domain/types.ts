export type Campus = '中关村' | '良乡' | '西山' | '珠海'
export type ListingStatus = 'available' | 'sold' | 'offline' | 'draft'
export type Condition = '全新' | '九成新' | '八成新' | '七成新及以下'

export interface User { id: string; name: string; campus: Campus; verified: boolean; wechatBound?: boolean; bio: string; responseTime: string; avatar?: string; avatarTone?: 'sage' | 'peach' | 'blue' | 'gold' | 'olive' }
export type Seller = User
export interface StoredMedia { id: string; uri: string; mime: string; size: number; width?: number; height?: number }
export interface Listing {
  id: string; title: string; author: string; isbn: string; category: string; course: string;
  price: number; originalPrice: number; condition: Condition; campus: Campus; description: string;
  status: ListingStatus; sellerId: string; seller?: Seller; createdAt: string; tags: string[]; tone: string; mediaIds: string[]
}
export interface ListingFilters {
  query: string; category: string; campus: Campus | '全部'; condition: Condition | '全部';
  minPrice: number; maxPrice: number; sort: '最新发布' | '价格从低到高' | '价格从高到低'; availableOnly: boolean
}
export interface PublishDraft {
  title: string; author: string; isbn: string; category: string; course: string;
  price: string; originalPrice: string; condition: Condition; campus: Campus;
  description: string; tags: string[]; mediaIds: string[]
}
export interface ListingAIDraft { title: string; description: string; tags: string[] }
export interface Message { id: string; senderId: string; text: string; createdAt: string; kind: 'text' | 'listing' | 'image'; listingId?: string; mediaId?: string }
export interface ChatThread { id: string; participantId: string; listingId: string; unread: number; updatedAt: string; messages: Message[] }
export interface Notification { id: string; type: 'like' | 'comment' | 'system' | 'follow'; title: string; subtitle: string; unread: number }
export type AppErrorCode = 'STORAGE_READ' | 'STORAGE_WRITE' | 'MEDIA_PICK' | 'MEDIA_PERSIST' | 'VALIDATION' | 'NOT_FOUND' | 'BIT_LOGIN' | 'API'
export class AppError extends Error { constructor(public code: AppErrorCode, message: string, public cause?: unknown) { super(message) } }
