import { describe, expect, it, vi } from 'vitest'
import { ListingsService } from '../src/modules/listings/listings.service.js'

function ownerListing(status: string) {
  return { id: 'listing-1', sellerId: 'owner-1', status, moderationDecision: 'ACTIVE', version: 3, deletedAt: null, images: [] }
}

describe('listing review invariants', () => {
  it('cannot bypass content review by taking an edited listing offline and relisting approved images', async () => {
    let item = ownerListing('ACTIVE')
    const prisma: any = {
      listing: {
        findFirst: vi.fn(async () => ({ ...item })),
        updateMany: vi.fn(async ({ where, data }) => {
          if (where.version !== item.version) return { count: 0 }
          item = { ...item, ...data, version: item.version + 1 }
          return { count: 1 }
        })
      },
      listingImage: { findMany: vi.fn().mockResolvedValue([{ role: 'COVER', moderationStatus: 'APPROVED' }, { role: 'ISBN', moderationStatus: 'APPROVED' }]) }
    }
    const service = new ListingsService(prisma)
    await service.update('owner-1', item.id, { version: 3, title: '修改内容' })
    expect(item.status).toBe('PENDING_REVIEW')
    await service.state('owner-1', item.id, { status: 'OFF_SHELF', version: 4 })
    const relisted = await service.state('owner-1', item.id, { status: 'ACTIVE', version: 5 })
    expect(relisted.status).toBe('PENDING_REVIEW')
    expect(item.moderationDecision).toBeNull()
  })

  it('lets an unchanged approved listing return to active', async () => {
    const prisma: any = {
      listing: { findFirst: vi.fn().mockResolvedValue(ownerListing('OFF_SHELF')), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      listingImage: { findMany: vi.fn().mockResolvedValue([{ role: 'COVER', moderationStatus: 'APPROVED' }, { role: 'ISBN', moderationStatus: 'APPROVED' }]) }
    }
    await new ListingsService(prisma).state('owner-1', 'listing-1', { status: 'ACTIVE', version: 3 })
    expect(prisma.listing.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ moderationDecision: 'ACTIVE' }), data: expect.objectContaining({ status: 'ACTIVE' }) }))
  })

  it('requires an uploaded cover and ISBN page before a draft enters review', async () => {
    const prisma: any = {
      listing: { findFirst: vi.fn().mockResolvedValue(ownerListing('DRAFT')), updateMany: vi.fn() },
      listingImage: { findMany: vi.fn().mockResolvedValue([{ role: 'COVER', moderationStatus: 'PENDING' }]) }
    }
    await expect(new ListingsService(prisma).state('owner-1', 'listing-1', { status: 'PENDING_REVIEW', version: 3 }))
      .rejects.toMatchObject({ status: 400 })
    expect(prisma.listing.updateMany).not.toHaveBeenCalled()
  })

  it('clears a stale moderation decision when a complete listing is resubmitted', async () => {
    const prisma: any = {
      listing: {
        findFirst: vi.fn().mockResolvedValue(ownerListing('DRAFT')),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      listingImage: {
        findMany: vi.fn().mockResolvedValue([
          { role: 'COVER', moderationStatus: 'PENDING' },
          { role: 'ISBN', moderationStatus: 'PENDING' }
        ])
      }
    }
    await new ListingsService(prisma).state('owner-1', 'listing-1', { status: 'PENDING_REVIEW', version: 3 })
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-1', sellerId: 'owner-1', version: 3, deletedAt: null },
      data: { status: 'PENDING_REVIEW', moderationDecision: null, moderatedAt: null, version: { increment: 1 } }
    })
  })

  it('does not reactivate a listing while a public image is unapproved', async () => {
    const prisma: any = {
      listing: { findFirst: vi.fn().mockResolvedValue(ownerListing('OFF_SHELF')), updateMany: vi.fn() },
      listingImage: {
        findMany: vi.fn().mockResolvedValue([
          { role: 'COVER', moderationStatus: 'PENDING' },
          { role: 'ISBN', moderationStatus: 'PENDING' }
        ])
      }
    }
    await expect(new ListingsService(prisma).state('owner-1', 'listing-1', { status: 'ACTIVE', version: 3 }))
      .rejects.toMatchObject({ status: 400 })
    expect(prisma.listing.updateMany).not.toHaveBeenCalled()
  })

  it('returns a live listing to review when its content is edited', async () => {
    const prisma: any = {
      listing: {
        findFirst: vi.fn().mockResolvedValue(ownerListing('ACTIVE')),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    }
    await new ListingsService(prisma).update('owner-1', 'listing-1', { version: 3, title: '更新后的书名' })
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-1', version: 3, deletedAt: null },
      data: {
        title: '更新后的书名', status: 'PENDING_REVIEW', moderationDecision: null, moderatedAt: null,
        version: { increment: 1 }
      }
    })
  })

  it('rejects edits to sold listings', async () => {
    const prisma: any = {
      listing: { findFirst: vi.fn().mockResolvedValue(ownerListing('SOLD')), updateMany: vi.fn() }
    }
    await expect(new ListingsService(prisma).update('owner-1', 'listing-1', { version: 3, title: '不应修改' }))
      .rejects.toMatchObject({ status: 400 })
    expect(prisma.listing.updateMany).not.toHaveBeenCalled()
  })
})
