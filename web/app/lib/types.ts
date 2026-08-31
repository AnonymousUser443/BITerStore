export type Campus = '中关村' | '良乡' | '西山' | '珠海';
export type ListingStatus = 'available' | 'sold' | 'offline' | 'draft' | 'reviewing';
export type Condition = '全新' | '九成新' | '八成新' | '七成新及以下';

export interface User {
  id: string;
  studentNumber?: string;
  name: string;
  campus: Campus | '未设置';
  verified: boolean;
  bio: string;
  responseTime: string;
  avatar?: string;
  avatarTone: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  course: string;
  price: number;
  originalPrice: number;
  condition: Condition;
  campus: Campus;
  description: string;
  status: ListingStatus;
  sellerId: string;
  createdAt: string;
  tags: string[];
  tone: string;
  imageStoreKey?: string;
  images?: string[];
  seller?: User;
}

export interface BookFilters {
  query: string;
  category: string;
  campus: Campus | '全部';
  condition: Condition | '全部';
  minPrice: number;
  maxPrice: number;
  sort: '最新发布' | '价格从低到高' | '价格从高到低';
  availableOnly: boolean;
}

export interface PublishDraft {
  title: string;
  author: string;
  isbn: string;
  category: string;
  course: string;
  price: string;
  originalPrice: string;
  condition: Condition;
  campus: Campus;
  description: string;
  tags: string[];
  imageStoreKey?: string;
  clientRequestId?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  kind?: 'text' | 'book' | 'image';
  bookId?: string;
}

export interface ChatThread {
  id: string;
  participantId: string;
  buyerId?: string;
  bookId: string;
  book?: Book;
  unread: number;
  updatedAt: string;
  messages: Message[];
  participant?: User;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'system' | 'follow';
  title: string;
  subtitle: string;
  unread: number;
  createdAt?: string;
}
