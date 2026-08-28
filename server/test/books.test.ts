import { BadRequestException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BooksService, isValidIsbn, normalizeIsbn } from '../src/modules/books/books.service.js'

const isbn = '9787115428028'

function redis(cached: string | null = null) {
  return {
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    client: { get: vi.fn().mockResolvedValue(cached), set: vi.fn().mockResolvedValue('OK') }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BOOK_METADATA_PROXY_URL
  delete process.env.BOOK_METADATA_PROXY_TOKEN
})

describe('book metadata', () => {
  it('normalizes and validates ISBN checksums', () => {
    expect(normalizeIsbn('978-7-115-42802-8')).toBe(isbn)
    expect(isValidIsbn(isbn)).toBe(true)
    expect(isValidIsbn('9787115428029')).toBe(false)
  })

  it('rejects a syntactically valid ISBN with a bad checksum', async () => {
    const service = new BooksService(redis() as never)
    await expect(service.lookup('9787115428029')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('returns a cached normalized result without an upstream request', async () => {
    const value = { isbn, title: '缓存教材', author: '', publisher: '', publishDate: '', coverUrl: '', subjects: [] }
    const store = redis(JSON.stringify(value))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new BooksService(store as never).lookup(isbn)).resolves.toEqual(value)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses only the configured ISBN proxy path and caches the normalized result', async () => {
    process.env.BOOK_METADATA_PROXY_URL = 'https://metadata.example.test/'
    process.env.BOOK_METADATA_PROXY_TOKEN = 'shared-secret'
    const store = redis()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: '高等数学', author: '同济大学', subjects: ['教材'] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new BooksService(store as never).lookup(isbn)
    expect(result).toMatchObject({ isbn, title: '高等数学', author: '同济大学' })
    expect(fetchMock).toHaveBeenCalledWith(`https://metadata.example.test/isbn/${isbn}`, expect.objectContaining({ headers: { Authorization: 'Bearer shared-secret' } }))
    expect(store.client.set).toHaveBeenCalledWith(`book-metadata:${isbn}`, expect.any(String), 'EX', 2592000)
  })
})
