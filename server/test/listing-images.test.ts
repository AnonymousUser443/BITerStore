import { describe, expect, it, vi } from 'vitest'
import { ListingsService } from '../src/modules/listings/listings.service.js'

const body = {
  title: '测试教材', priceCents: 1200, author: '作者', category: '教材教辅',
  condition: '九成新', campus: '良乡', description: '实拍', tags: [],
  imageIds: ['cover-id', 'isbn-id']
}

describe('listing required images', () => {
  it('requires completed cover and ISBN images for publication', async () => {
    const prisma = {
      listingImage: { findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'ISBN' }]) },
      listing: { create: vi.fn().mockResolvedValue({ id: 'listing-id' }) }
    }
    const service = new ListingsService(prisma as never)
    await expect(service.create('owner-id', body)).resolves.toEqual({ id: 'listing-id' })
    expect(prisma.listingImage.findMany).toHaveBeenCalledWith({ where: { id: { in: body.imageIds }, ownerId: 'owner-id', uploadedAt: { not: null }, listingId: null } })
  })

  it('rejects publication when the ISBN page is missing', async () => {
    const prisma = {
      listingImage: { findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'GALLERY' }]) },
      listing: { create: vi.fn() }
    }
    const service = new ListingsService(prisma as never)
    await expect(service.create('owner-id', body)).rejects.toMatchObject({ message: '发布前必须上传封面和 ISBN 页' })
    expect(prisma.listing.create).not.toHaveBeenCalled()
  })
})
