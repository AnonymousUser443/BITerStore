import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogCacheService } from '../src/infra/catalog-cache.service.js'
import { normalizeListingQuery } from '../src/modules/listings/listing-query.js'
import { ListingsService } from '../src/modules/listings/listings.service.js'
import { PublicCatalogRateLimitGuard } from '../src/modules/listings/public-catalog-rate-limit.guard.js'
import { publicEtag } from '../src/modules/listings/listings.controller.js'

afterEach(() => vi.unstubAllEnvs())

describe('public catalog query contract', () => {
  it('normalizes bounded filters and server-side sorting', () => {
    expect(normalizeListingQuery({
      q: '  数据结构  ', campus: '良乡', category: '专业课', condition: '八成新',
      minPriceCents: '1000', maxPriceCents: '5000', sort: '价格从低到高', limit: '25'
    })).toEqual({
      q: '数据结构', campus: '良乡', category: '专业课', condition: '八成新',
      minPriceCents: 1000, maxPriceCents: 5000, sort: 'price_asc', limit: 25, mine: false
    })
  })

  it.each([
    [{ unexpected: 'value' }, '不支持的查询参数'],
    [{ q: 'x'.repeat(51) }, '搜索词不能超过'],
    [{ cursor: '../invalid' }, '分页游标格式无效'],
    [{ minPriceCents: '200', maxPriceCents: '100' }, '最低价格不能高于'],
    [{ condition: '破损' }, '成色选项无效'],
    [{ limit: '500' }, '每页数量超出允许范围']
  ])('rejects an invalid query without reaching Prisma', (query, message) => {
    expect(() => normalizeListingQuery(query)).toThrow(expect.objectContaining({ message: expect.stringContaining(message) }))
  })

  it('pushes price, condition and order filters into the database query', async () => {
    const prisma = { listing: { findMany: vi.fn().mockResolvedValue([{ id: 'a', clientRequestId: 'private', moderationDecision: 'ACTIVE', moderatedAt: new Date() }, { id: 'b' }, { id: 'c' }]) } }
    const service = new ListingsService(prisma as never)
    await expect(service.list({ condition: '九成新', minPriceCents: '1000', maxPriceCents: '5000', sort: 'price_desc', limit: '2' }))
      .resolves.toEqual({ items: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })], nextCursor: 'b' })
    expect(prisma.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 3,
      where: expect.objectContaining({ condition: '九成新', priceCents: { gte: 1000, lte: 5000 } }),
      orderBy: [{ priceCents: 'desc' }, { id: 'desc' }]
    }))
    const result = await service.list({ limit: '1' })
    expect(result.items[0]).not.toHaveProperty('clientRequestId')
    expect(result.items[0]).not.toHaveProperty('moderationDecision')
    expect(result.items[0]).not.toHaveProperty('moderatedAt')
  })

  it('counts all non-deleted owner listings without loading their rows', async () => {
    const count = vi.fn().mockResolvedValue(73)
    const service = new ListingsService({ listing: { count } } as never)
    await expect(service.countMine('owner-1')).resolves.toEqual({ count: 73 })
    expect(count).toHaveBeenCalledWith({ where: { sellerId: 'owner-1', deletedAt: null } })
  })
})

describe('public catalog cache', () => {
  it('reuses a public response and invalidates it by namespace version', async () => {
    const values = new Map<string, string>()
    const client = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => { if (!values.has(key)) values.set(key, value); return 'OK' }),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => { values.set(key, value); return 'OK' }),
      incr: vi.fn(async (key: string) => { const next = Number(values.get(key) || 0) + 1; values.set(key, String(next)); return next })
    }
    const cache = new CatalogCacheService({ ensureConnected: vi.fn(), client } as never)
    const loader = vi.fn(async () => ({ items: [{ id: 'listing-a' }], nextCursor: null }))

    const burst = await Promise.all(Array.from({ length: 100 }, () => cache.publicList({ limit: 20 }, loader)))
    expect(burst).toHaveLength(100)
    expect(burst[0]).toMatchObject({ items: [{ id: 'listing-a' }] })
    await expect(cache.publicList({ limit: 20 }, loader)).resolves.toMatchObject({ items: [{ id: 'listing-a' }] })
    expect(loader).toHaveBeenCalledTimes(1)

    await cache.invalidate()
    await cache.publicList({ limit: 20 }, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('public catalog conditional requests', () => {
  it('returns 304 for an unchanged public representation', () => {
    const firstReply = { header: vi.fn(), status: vi.fn() }
    expect(publicEtag(undefined, firstReply as never, { items: [{ id: 'listing-a' }] })).toEqual({ items: [{ id: 'listing-a' }] })
    const etag = firstReply.header.mock.calls.find(([name]) => name === 'ETag')?.[1] as string
    const secondReply = { header: vi.fn(), status: vi.fn() }

    expect(publicEtag(etag, secondReply as never, { items: [{ id: 'listing-a' }] })).toBeUndefined()
    expect(secondReply.status).toHaveBeenCalledWith(304)
  })
})

describe('public catalog rate limit', () => {
  it('uses a bounded local fallback when Redis is unavailable', async () => {
    vi.stubEnv('PUBLIC_CATALOG_LIST_RATE_PER_MINUTE', '1')
    const headers = new Map<string, string>()
    const request = { ip: '203.0.113.10', params: {}, query: {}, socket: {} }
    const reply = { header: vi.fn((name: string, value: string) => { headers.set(name, value); return reply }) }
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply })
    }
    const guard = new PublicCatalogRateLimitGuard({ ensureConnected: vi.fn().mockRejectedValue(new Error('offline')) } as never)

    await expect(guard.canActivate(context as never)).resolves.toBe(true)
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({ status: 429 })
    expect(headers.get('Retry-After')).toBeTruthy()
  })

  it('places public media in its own bounded bucket before it reaches storage', async () => {
    vi.stubEnv('PUBLIC_MEDIA_RATE_PER_MINUTE', '1')
    const request = { url: '/api/v1/media/image-1?cache-bust=1', ip: '203.0.113.11', params: { id: 'image-1' }, query: {}, socket: {} }
    const reply = { header: vi.fn().mockReturnThis() }
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }) }
    const guard = new PublicCatalogRateLimitGuard({ ensureConnected: vi.fn().mockRejectedValue(new Error('offline')) } as never)

    await expect(guard.canActivate(context as never)).resolves.toBe(true)
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({ status: 429 })
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '1')
  })
})
