import 'reflect-metadata'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicCatalogRateLimitGuard } from '../src/modules/listings/public-catalog-rate-limit.guard.js'
import { MediaController } from '../src/modules/uploads/media.controller.js'
import { AuthGuard, CampusVerifiedGuard } from '../src/common/auth.js'

const previousStorage = process.env.UPLOAD_STORAGE
const previousDirectory = process.env.LOCAL_UPLOAD_DIR

afterEach(() => {
  if (previousStorage === undefined) delete process.env.UPLOAD_STORAGE
  else process.env.UPLOAD_STORAGE = previousStorage
  if (previousDirectory === undefined) delete process.env.LOCAL_UPLOAD_DIR
  else process.env.LOCAL_UPLOAD_DIR = previousDirectory
})

describe('public listing media', () => {
  it('requires authentication on private owner and conversation media', () => {
    expect(Reflect.getMetadata('__guards__', MediaController.prototype.owner)).toEqual([AuthGuard])
    expect(Reflect.getMetadata('__guards__', MediaController.prototype.conversation)).toEqual([AuthGuard, CampusVerifiedGuard])
    for (const method of [MediaController.prototype.owner, MediaController.prototype.conversation]) {
      expect(Reflect.getMetadata('__headers__', method)).toContainEqual({ name: 'Cache-Control', value: 'private, no-store' })
    }
  })

  it('requires both image ownership and listing ownership, including for pending images', async () => {
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue(null) } }
    await expect(new MediaController(prisma as never).owner({ id: 'owner' } as never, 'cover')).rejects.toMatchObject({ status: 404 })
    expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({ where: {
      id: 'cover', ownerId: 'owner', uploadedAt: { not: null }, role: { not: 'ISBN' }, listing: { sellerId: 'owner', deletedAt: null }
    } })
  })

  it('only serves approved conversation media from an eligible listing to its members', async () => {
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue(null) } }
    await expect(new MediaController(prisma as never).conversation({ id: 'buyer' } as never, 'thread', 'cover')).rejects.toMatchObject({ status: 404 })
    expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({ where: {
      id: 'cover', uploadedAt: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED',
      listing: { deletedAt: null, status: { in: ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF'] }, seller: { status: { in: ['ACTIVE', 'MUTED'] } }, conversations: { some: { id: 'thread', members: { some: { userId: 'buyer' } } } } }
    } })
  })

  it('rate-limits the public media route before querying image metadata', () => {
    expect(Reflect.getMetadata('__guards__', MediaController.prototype.get)).toEqual([PublicCatalogRateLimitGuard])
  })

  it('serves a completed non-ISBN image through the controlled route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-media-'))
    const objectKey = 'pending/user/image.jpg'
    await mkdir(join(root, 'pending/user'), { recursive: true })
    await writeFile(join(root, objectKey), Buffer.from('image-bytes'))
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue({ id: 'image-id', objectKey, mime: 'image/jpeg', size: 11 }) } }
    try {
      const result = await new MediaController(prisma as never).get('image-id')
      expect(result.getHeaders()).toMatchObject({ type: 'image/jpeg', length: 11 })
      expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({ where: { id: 'image-id', uploadedAt: { not: null }, listingId: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED', listing: { deletedAt: null, status: 'ACTIVE', seller: { status: 'ACTIVE' } } } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not expose an ISBN page or an unattached upload', async () => {
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue(null) } }
    await expect(new MediaController(prisma as never).get('private-id')).rejects.toMatchObject({ status: 404 })
  })

  it('allows an administrator to inspect any attached pending image, including the private ISBN evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-review-media-'))
    const objectKey = 'pending/user/review.jpg'
    await mkdir(join(root, 'pending/user'), { recursive: true })
    await writeFile(join(root, objectKey), Buffer.from('review-bytes'))
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue({ objectKey, mime: 'image/jpeg', size: 12 }) } }
    try {
      const result = await new MediaController(prisma as never).review('pending-id')
      expect(result.getHeaders()).toMatchObject({ type: 'image/jpeg', length: 12 })
      expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({ where: { id: 'pending-id', uploadedAt: { not: null }, listingId: { not: null }, listing: { deletedAt: null } } })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
