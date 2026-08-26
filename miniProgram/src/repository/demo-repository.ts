import { defaultFilters } from '../domain/constants'
import { CURRENT_USER_ID, getUser, seedBooks, seedThreads } from '../domain/demo-data'
import type { Book, BookFilters, ChatThread, ListingStatus, Message, PublishDraft } from '../domain/types'
import { storageAdapter } from '../platform/storage'
import type { StorageAdapter } from '../platform/storage'
import type { DemoRepository } from './contracts'

const KEYS = {
  books: 'biterstore:v2:books',
  favorites: 'biterstore:v2:favorites',
  threads: 'biterstore:v2:threads',
  draft: 'biterstore:v2:draft',
  onboarding: 'biterstore:v2:onboarding',
  filters: 'biterstore:v2:filters',
  migrated: 'biterstore:v2:migrated',
} as const

const LEGACY_KEYS: Partial<Record<keyof typeof KEYS, string>> = {
  books: 'biterstore:v1:books',
  favorites: 'biterstore:v1:favorites',
  threads: 'biterstore:v1:threads',
  draft: 'biterstore:v1:draft',
  onboarding: 'biterstore:v1:onboarding',
  filters: 'biterstore:v1:filters',
}

const delay = (ms = 90) => new Promise((resolve) => setTimeout(resolve, ms))

export function filterBooks(books: Book[], filters: BookFilters): Book[] {
  const query = filters.query.trim().toLowerCase()
  const result = books.filter((book) => {
    const haystack = [book.title, book.author, book.isbn, book.course, ...book.tags].join(' ').toLowerCase()
    return (!query || haystack.includes(query))
      && (filters.category === '全部' || book.category === filters.category)
      && (filters.campus === '全部' || book.campus === filters.campus)
      && (filters.condition === '全部' || book.condition === filters.condition)
      && book.price >= filters.minPrice
      && book.price <= filters.maxPrice
      && (!filters.availableOnly || book.status === 'available')
  })
  if (filters.sort === '价格从低到高') result.sort((a, b) => a.price - b.price)
  else if (filters.sort === '价格从高到低') result.sort((a, b) => b.price - a.price)
  else result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
}

export class LocalDemoRepository implements DemoRepository {
  private migration?: Promise<void>

  constructor(private readonly storage: StorageAdapter = storageAdapter) {}

  private ensureMigrated(): Promise<void> {
    if (this.migration) return this.migration
    this.migration = (async () => {
      if (await this.storage.get(KEYS.migrated, false)) return
      for (const [name, legacyKey] of Object.entries(LEGACY_KEYS)) {
        if (!legacyKey) continue
        const value = await this.storage.get<unknown>(legacyKey, undefined)
        if (value !== undefined) await this.storage.set(KEYS[name as keyof typeof KEYS], value)
      }
      await this.storage.set(KEYS.migrated, true)
    })()
    return this.migration
  }

  private async books() {
    await this.ensureMigrated()
    return this.storage.get<Book[]>(KEYS.books, seedBooks)
  }

  async listBooks(filters = defaultFilters) {
    await delay()
    return filterBooks(await this.books(), filters)
  }

  async getBook(id: string) {
    await delay(60)
    return (await this.books()).find((book) => book.id === id) ?? null
  }

  async toggleFavorite(id: string) {
    await this.ensureMigrated()
    const ids = await this.storage.get<string[]>(KEYS.favorites, [])
    const active = !ids.includes(id)
    await this.storage.set(KEYS.favorites, active ? [...ids, id] : ids.filter((value) => value !== id))
    await delay(50)
    return active
  }

  async listFavorites() {
    await this.ensureMigrated()
    const ids = await this.storage.get<string[]>(KEYS.favorites, [])
    await delay()
    return (await this.books()).filter((book) => ids.includes(book.id))
  }

  async saveFilters(filters: BookFilters) {
    await this.storage.set(KEYS.filters, filters)
  }

  async getFilters() {
    await this.ensureMigrated()
    return this.storage.get(KEYS.filters, defaultFilters)
  }

  async saveDraft(draft: PublishDraft) {
    await this.storage.set(KEYS.draft, draft)
    await delay(50)
  }

  async getDraft() {
    await this.ensureMigrated()
    return this.storage.get<PublishDraft | null>(KEYS.draft, null)
  }

  async publishListing(draft: PublishDraft) {
    const book: Book = {
      id: `listing-${Date.now()}`,
      title: draft.title,
      author: draft.author,
      isbn: draft.isbn,
      category: draft.category,
      course: draft.course || draft.category,
      price: Number(draft.price),
      originalPrice: Number(draft.originalPrice || draft.price),
      condition: draft.condition,
      campus: draft.campus,
      description: draft.description,
      status: 'available',
      sellerId: CURRENT_USER_ID,
      createdAt: new Date().toISOString(),
      tags: draft.tags,
      tone: 'sage',
      images: draft.images,
    }
    await this.storage.set(KEYS.books, [book, ...(await this.books())])
    await this.storage.remove(KEYS.draft)
    await delay(180)
    return book
  }

  async updateListingStatus(id: string, status: ListingStatus) {
    await this.storage.set(KEYS.books, (await this.books()).map((book) => book.id === id ? { ...book, status } : book))
    await delay(60)
  }

  async listMyListings() {
    await delay()
    return (await this.books()).filter((book) => book.sellerId === CURRENT_USER_ID)
  }

  async listThreads() {
    await this.ensureMigrated()
    await delay()
    return this.storage.get<ChatThread[]>(KEYS.threads, seedThreads)
  }

  async getThread(id: string) {
    const threads = await this.listThreads()
    const thread = threads.find((item) => item.id === id) ?? null
    if (thread?.unread) {
      await this.storage.set(KEYS.threads, threads.map((item) => item.id === id ? { ...item, unread: 0 } : item))
      return { ...thread, unread: 0 }
    }
    return thread
  }

  async sendMessage(threadId: string, input: Pick<Message, 'text' | 'kind' | 'bookId' | 'imagePath'>) {
    const message: Message = {
      id: `message-${Date.now()}`,
      senderId: CURRENT_USER_ID,
      text: input.text,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      kind: input.kind ?? 'text',
      bookId: input.bookId,
      imagePath: input.imagePath,
    }
    const threads = (await this.listThreads()).map((thread) => thread.id === threadId
      ? { ...thread, updatedAt: message.createdAt, messages: [...thread.messages, message] }
      : thread)
    await this.storage.set(KEYS.threads, threads)
    await delay(60)
    return message
  }

  async ensureThread(bookId: string) {
    const threads = await this.listThreads()
    const existing = threads.find((thread) => thread.bookId === bookId)
    if (existing) return existing.id
    const book = (await this.books()).find((item) => item.id === bookId)
    if (!book) throw new Error('BOOK_NOT_FOUND')
    const next: ChatThread = { id: `thread-${bookId}`, participantId: book.sellerId, bookId, unread: 0, updatedAt: '刚刚', messages: [] }
    await this.storage.set(KEYS.threads, [next, ...threads])
    return next.id
  }

  async getProfile() {
    await delay(50)
    return getUser(CURRENT_USER_ID)
  }

  async isOnboardingComplete() {
    await this.ensureMigrated()
    return this.storage.get(KEYS.onboarding, false)
  }

  async completeOnboarding() {
    await this.storage.set(KEYS.onboarding, true)
  }

  async resetDemoData() {
    await this.storage.clearOwned(Object.values(KEYS))
    this.migration = undefined
    await delay(80)
  }
}

export const demoRepository = new LocalDemoRepository()
