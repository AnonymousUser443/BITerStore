import type { Book, BookFilters, ChatThread, ListingStatus, Message, PublishDraft, User } from '../domain/types'

export interface DemoRepository {
  listBooks(filters?: BookFilters): Promise<Book[]>
  getBook(id: string): Promise<Book | null>
  toggleFavorite(id: string): Promise<boolean>
  listFavorites(): Promise<Book[]>
  saveFilters(filters: BookFilters): Promise<void>
  getFilters(): Promise<BookFilters>
  saveDraft(draft: PublishDraft): Promise<void>
  getDraft(): Promise<PublishDraft | null>
  publishListing(draft: PublishDraft): Promise<Book>
  updateListingStatus(id: string, status: ListingStatus): Promise<void>
  listMyListings(): Promise<Book[]>
  listThreads(): Promise<ChatThread[]>
  getThread(id: string): Promise<ChatThread | null>
  sendMessage(threadId: string, message: Pick<Message, 'text' | 'kind' | 'bookId' | 'imagePath'>): Promise<Message>
  ensureThread(bookId: string): Promise<string>
  getProfile(): Promise<User>
  isOnboardingComplete(): Promise<boolean>
  completeOnboarding(): Promise<void>
  resetDemoData(): Promise<void>
}
