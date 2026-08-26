import type { BookFilters, PublishDraft } from './types'

export const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说'] as const
export const campuses = ['全部', '中关村', '良乡', '西山', '珠海'] as const
export const conditions = ['全部', '全新', '九成新', '八成新', '七成新及以下'] as const

export const defaultFilters: BookFilters = {
  query: '',
  category: '全部',
  campus: '全部',
  condition: '全部',
  minPrice: 0,
  maxPrice: 200,
  sort: '最新发布',
  availableOnly: true,
}

export const emptyDraft: PublishDraft = {
  title: '',
  author: '',
  isbn: '',
  category: '教材教辅',
  course: '',
  price: '',
  originalPrice: '',
  condition: '九成新',
  campus: '良乡',
  description: '',
  tags: [],
  images: [],
}

export const formatPrice = (price: number) => price.toFixed(2)

export const listingStatusLabel = {
  available: '可交易',
  sold: '已售',
  offline: '已下架',
  draft: '草稿',
} as const
