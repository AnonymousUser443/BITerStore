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

  it('returns verified Chinese metadata instead of a romanized upstream title', async () => {
    const store = redis()
    await expect(new BooksService(store as never).lookup('9787111544937')).resolves.toMatchObject({
      title: '深入理解计算机系统（原书第3版）',
      publisher: '机械工业出版社'
    })
    expect(store.ensureConnected).not.toHaveBeenCalled()
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
    expect(store.client.set).toHaveBeenCalledWith(`book-metadata:v3:${isbn}`, expect.any(String), 'EX', 2592000)
  })

  it('does not autofill a romanized title for a mainland Chinese ISBN', async () => {
    process.env.BOOK_METADATA_PROXY_URL = 'https://metadata.example.test/'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Pin yin shu ming' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new BooksService(redis() as never).lookup(isbn)).rejects.toMatchObject({
      message: '免费书目源仅返回了英文或拼音书名，请手动填写中文书名'
    })
  })
})
