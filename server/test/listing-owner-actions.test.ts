import { describe, expect, it, vi } from 'vitest'
import { ListingsService } from '../src/modules/listings/listings.service.js'

const body = {
  title: '测试教材', priceCents: 1200, author: '作者', category: '教材教辅',
  condition: '九成新', campus: '良乡', description: '实拍', tags: [],
  imageIds: ['cover-id', 'isbn-id'], clientRequestId: 'publish-request-1'
}

describe('listing owner actions', () => {
  it('returns a non-public listing only to its owner', async () => {
    const item = { id: 'listing-id', sellerId: 'owner-id', status: 'DRAFT', version: 3 }
    const prisma = { listing: { findFirst: vi.fn().mockResolvedValue(item) } }
    const service = new ListingsService(prisma as never)
    await expect(service.getMine('owner-id', 'listing-id')).resolves.toEqual(item)
    await expect(service.getMine('other-owner', 'listing-id')).rejects.toMatchObject({ status: 403 })
  })

  it('returns the original listing for a repeated publish request', async () => {
    const existing = { id: 'existing-listing', sellerId: 'owner-id', clientRequestId: body.clientRequestId }
    const prisma = {
      listing: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() },
      listingImage: { findMany: vi.fn() }
    }
    await expect(new ListingsService(prisma as never).create('owner-id', body)).resolves.toEqual(existing)
    expect(prisma.listing.create).not.toHaveBeenCalled()
    expect(prisma.listingImage.findMany).not.toHaveBeenCalled()
  })

  it('collapses concurrent publish requests through the database unique key', async () => {
    const existing = { id: 'winner-listing', sellerId: 'owner-id', clientRequestId: body.clientRequestId }
    const prisma = {
      listing: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
        create: vi.fn().mockRejectedValue({ code: 'P2002' })
      },
      listingImage: { findMany: vi.fn().mockResolvedValue([{ id: 'cover-id', role: 'COVER' }, { id: 'isbn-id', role: 'ISBN' }]), updateMany: vi.fn() }
    } as any
    prisma.$transaction = vi.fn(async (callback: any) => callback(prisma))
    await expect(new ListingsService(prisma as never).create('owner-id', body)).resolves.toEqual(existing)
    expect(prisma.listing.create).toHaveBeenCalledTimes(1)
  })

  it('soft deletes an owned listing and increments its version', async () => {
    const prisma = {
      listing: {
        findFirst: vi.fn().mockResolvedValue({ id: 'listing-id', sellerId: 'owner-id' }),
        update: vi.fn().mockResolvedValue({ id: 'listing-id' })
      }
    }
    await expect(new ListingsService(prisma as never).remove('owner-id', 'listing-id')).resolves.toEqual({ deleted: true })
    expect(prisma.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-id' },
      data: { deletedAt: expect.any(Date), status: 'OFF_SHELF', version: { increment: 1 } }
    })
  })

  it('does not allow deleting another seller’s listing', async () => {
    const prisma = {
      listing: {
        findFirst: vi.fn().mockResolvedValue({ id: 'listing-id', sellerId: 'other-owner' }),
        update: vi.fn()
      }
    }
    await expect(new ListingsService(prisma as never).remove('owner-id', 'listing-id')).rejects.toMatchObject({ status: 403 })
    expect(prisma.listing.update).not.toHaveBeenCalled()
  })
})
