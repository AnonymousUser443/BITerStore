export type Campus = '中关村' | '良乡' | '西山' | '珠海'
export type ListingStatus = 'available' | 'sold' | 'offline' | 'draft'
export type Condition = '全新' | '九成新' | '八成新' | '七成新及以下'
export type NotificationType = 'like' | 'comment' | 'system' | 'follow'

export interface User {
  id: string
  name: string
  campus: Campus
  verified: boolean
  bio: string
  responseTime: string
  avatar?: string
  avatarTone: string
}

export interface Seller extends User {
  rating: number
  completedTrades: number
}

export interface Book {
  id: string
  title: string
  author: string
  isbn: string
  category: string
  course: string
  price: number
  originalPrice: number
  condition: Condition
  campus: Campus
  description: string
  status: ListingStatus
  sellerId: string
  createdAt: string
  tags: string[]
  tone: string
  images?: string[]
}

export interface Listing extends Book {
  ownerId: string
}

export interface BookFilters {
  query: string
  category: string
  campus: Campus | '全部'
  condition: Condition | '全部'
  minPrice: number
  maxPrice: number
  sort: '最新发布' | '价格从低到高' | '价格从高到低'
  availableOnly: boolean
}

export interface PublishDraft {
  title: string
  author: string
  isbn: string
  category: string
  course: string
  price: string
  originalPrice: string
  condition: Condition
  campus: Campus
  description: string
  tags: string[]
  images: string[]
}

export interface Message {
  id: string
  senderId: string
  text: string
  createdAt: string
  kind?: 'text' | 'book' | 'image'
  bookId?: string
  imagePath?: string
}

export interface ChatThread {
  id: string
  participantId: string
  bookId: string
  unread: number
  updatedAt: string
  messages: Message[]
}

export interface Notification {
  id: string
  type: NotificationType
  title: string
  subtitle: string
  unread: number
}

export interface ListingAIInput {
  imagePaths: string[]
  currentDraft: PublishDraft
}

export type ListingAIDraft = Pick<PublishDraft, 'title' | 'author' | 'isbn' | 'category' | 'course' | 'price' | 'originalPrice' | 'condition' | 'description' | 'tags'>

export interface ListingAssistant {
  generate(input: ListingAIInput): Promise<ListingAIDraft>
}
