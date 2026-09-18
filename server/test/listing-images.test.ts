import { describe, expect, it, vi } from 'vitest'
import { ListingsService } from '../src/modules/listings/listings.service.js'

const body = {
  title: '测试教材', priceCents: 1200, author: '作者', category: '教材教辅',
  condition: '九成新', campus: '良乡', description: '实拍', tags: [],
  imageIds: ['cover-id', 'isbn-id']
}

describe('listing required images', () => {
  it('returns controlled media URLs based on opaque image ids', async () => {
    const previous = process.env.PUBLIC_API_URL
    process.env.PUBLIC_API_URL = 'https://store.example.test'
    const prisma = { listing: { findFirst: vi.fn().mockResolvedValue({ id: 'listing-id', images: [{ id: 'cover-id', objectKey: 'pending/user/private-name.jpg', ownerId: 'owner-id', moderationStatus: 'APPROVED' }] }) } }
    try {
      const listing = await new ListingsService(prisma as never).get('listing-id')
      expect(listing).toMatchObject({ images: [{ id: 'cover-id', url: 'https://store.example.test/api/v1/media/cover-id' }] })
      expect(listing.images?.[0]).not.toHaveProperty('objectKey')
      expect(listing.images?.[0]).not.toHaveProperty('ownerId')
      expect(listing.images?.[0]).not.toHaveProperty('moderationStatus')
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_API_URL
      else process.env.PUBLIC_API_URL = previous
    }
  })

  it('excludes the private ISBN page from public listing image queries', async () => {
    const prisma = { listing: { findMany: vi.fn().mockResolvedValue([]) } }
    const service = new ListingsService(prisma as never)
    await expect(service.list({})).resolves.toEqual({ items: [], nextCursor: null })
    expect(prisma.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'ACTIVE',
        AND: [
          { images: { some: { uploadedAt: { not: null }, role: 'COVER', moderationStatus: 'APPROVED' } } },
          { images: { some: { uploadedAt: { not: null }, role: 'ISBN' } } }
        ]
      }),
      include: expect.objectContaining({ images: expect.objectContaining({ where: { uploadedAt: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED' } }) })
    }))
  })

  it('requires completed cover and ISBN images for publication', async () => {
    const prisma = {
      listingImage: { findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'ISBN' }]), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      listing: { create: vi.fn().mockResolvedValue({ id: 'listing-id' }) }
    } as any
    prisma.$transaction = vi.fn(async (callback: any) => callback(prisma))
    const service = new ListingsService(prisma as never)
    await expect(service.create('owner-id', body)).resolves.toEqual({ id: 'listing-id' })
    expect(prisma.listing.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_REVIEW' }) }))
    expect(prisma.listingImage.findMany).toHaveBeenCalledWith({ where: { id: { in: body.imageIds }, ownerId: 'owner-id', uploadedAt: { not: null }, listingId: null } })
    expect(prisma.listingImage.updateMany).toHaveBeenCalledWith({ where: { id: { in: body.imageIds }, ownerId: 'owner-id', uploadedAt: { not: null }, listingId: null }, data: { listingId: 'listing-id' } })
  })

  it('rejects publication when the ISBN page is missing', async () => {
    const prisma = {
      listingImage: { findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'GALLERY' }]), updateMany: vi.fn() },
      listing: { create: vi.fn() }
    } as any
    prisma.$transaction = vi.fn(async (callback: any) => callback(prisma))
    const service = new ListingsService(prisma as never)
    await expect(service.create('owner-id', body)).rejects.toMatchObject({ message: '发布前必须上传封面和 ISBN 页' })
    expect(prisma.listing.create).not.toHaveBeenCalled()
  })

  it('rolls back when another listing binds an image concurrently', async () => {
    const prisma = {
      listingImage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'ISBN' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      listing: { create: vi.fn().mockResolvedValue({ id: 'listing-id' }) }
    } as any
    prisma.$transaction = vi.fn(async (callback: any) => callback(prisma))
    await expect(new ListingsService(prisma as never).create('owner-id', body)).rejects.toMatchObject({ status: 409 })
  })
})
