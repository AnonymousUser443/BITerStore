import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AuthGuard, VerifiedGuard } from '../src/common/auth.js'
import { BooksController } from '../src/modules/books/books.controller.js'

describe('book metadata access', () => {
  it('requires an authenticated, verified account for lookup and recognition', () => {
    expect(Reflect.getMetadata('__guards__', BooksController.prototype.isbn)).toEqual([AuthGuard, VerifiedGuard])
    expect(Reflect.getMetadata('__guards__', BooksController.prototype.recognize)).toEqual([AuthGuard, VerifiedGuard])
  })

  it('delegates valid account lookups without exposing an anonymous variant', async () => {
    const books = { lookup: vi.fn().mockResolvedValue({ isbn: '9787111544937' }) }
    await expect(new BooksController(books as never).isbn('9787111544937')).resolves.toEqual({ isbn: '9787111544937' })
    expect(books.lookup).toHaveBeenCalledWith('9787111544937')
  })
})
