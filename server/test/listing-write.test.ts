import { describe, expect, it, vi } from 'vitest'
import { ListingsService } from '../src/modules/listings/listings.service.js'
import { normalizeCreateListing, normalizeUpdateListing } from '../src/modules/listings/listing-write.js'

const valid = {
  title: '测试教材', author: '作者', isbn: '9787115428028', category: '教材教辅', course: '',
  priceCents: 1200, condition: '九成新', campus: '良乡', description: '', tags: [], imageIds: [], draft: true
}

describe('listing write validation', () => {
  it('rejects unknown fields and invalid campuses before database access', () => {
    expect(() => normalizeCreateListing({ ...valid, adminApproved: true })).toThrow('包含不支持的字段')
    expect(() => normalizeCreateListing({ ...valid, campus: '火星' })).toThrow('校区不在允许范围内')
    expect(() => normalizeCreateListing({ ...valid, priceCents: 0 })).toThrow('价格必须是')
  })

  it('requires a version and at least one field for updates', () => {
    expect(() => normalizeUpdateListing({ title: '新标题' })).toThrow('商品版本号无效')
    expect(() => normalizeUpdateListing({ version: 1 })).toThrow('至少提供一个')
  })

  it('updates by expected version and returns 409 when the version is stale', async () => {
    const prisma = {
      listing: {
        findFirst: vi.fn().mockResolvedValue({ id: 'listing-id', sellerId: 'owner-id', status: 'DRAFT', version: 3, images: [] }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    }
    await expect(new ListingsService(prisma as never).update('owner-id', 'listing-id', { title: '新标题', version: 2 })).rejects.toMatchObject({ status: 409 })
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-id', version: 2, deletedAt: null },
      data: { title: '新标题', version: { increment: 1 } }
    })
  })
})
