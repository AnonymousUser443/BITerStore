import { describe, expect, it } from 'vitest'
import { defaultFilters, emptyDraft } from '../domain/constants'
import { MemoryStorageAdapter } from '../platform/storage'
import { LocalDemoRepository, filterBooks } from './demo-repository'
import { seedBooks } from '../domain/demo-data'

const createRepository = () => new LocalDemoRepository(new MemoryStorageAdapter())

describe('filterBooks', () => {
  it('combines query, campus and availability filters', () => {
    const result = filterBooks(seedBooks, { ...defaultFilters, query: '数学', campus: '良乡' })
    expect(result.map((book) => book.id)).toEqual(['math-7'])
  })

  it('sorts price from low to high', () => {
    const result = filterBooks(seedBooks, { ...defaultFilters, sort: '价格从低到高' })
    expect(result[0].price).toBeLessThanOrEqual(result.at(-1)!.price)
  })
})

describe('LocalDemoRepository', () => {
  it('persists favorite toggles', async () => {
    const repository = createRepository()
    expect(await repository.toggleFavorite('math-7')).toBe(true)
    expect((await repository.listFavorites()).map((book) => book.id)).toEqual(['math-7'])
    expect(await repository.toggleFavorite('math-7')).toBe(false)
  })

  it('restores draft and publishes a listing', async () => {
    const repository = createRepository()
    const draft = { ...emptyDraft, title: '测试教材', author: '测试作者', price: '18', description: '测试描述' }
    await repository.saveDraft(draft)
    expect((await repository.getDraft())?.title).toBe('测试教材')
    const book = await repository.publishListing(draft)
    expect(book.status).toBe('available')
    expect(await repository.getDraft()).toBeNull()
  })

  it('marks threads read and appends messages', async () => {
    const repository = createRepository()
    expect((await repository.getThread('thread-lin'))?.unread).toBe(0)
    await repository.sendMessage('thread-lin', { text: '明天见' })
    expect((await repository.getThread('thread-lin'))?.messages.at(-1)?.text).toBe('明天见')
  })

  it('resets onboarding and local changes', async () => {
    const repository = createRepository()
    await repository.completeOnboarding()
    expect(await repository.isOnboardingComplete()).toBe(true)
    await repository.resetDemoData()
    expect(await repository.isOnboardingComplete()).toBe(false)
    expect(await repository.listFavorites()).toEqual([])
  })
})
