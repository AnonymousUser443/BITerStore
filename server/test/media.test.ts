import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaController } from '../src/modules/uploads/media.controller.js'

const previousStorage = process.env.UPLOAD_STORAGE
const previousDirectory = process.env.LOCAL_UPLOAD_DIR

afterEach(() => {
  if (previousStorage === undefined) delete process.env.UPLOAD_STORAGE
  else process.env.UPLOAD_STORAGE = previousStorage
  if (previousDirectory === undefined) delete process.env.LOCAL_UPLOAD_DIR
  else process.env.LOCAL_UPLOAD_DIR = previousDirectory
})

describe('public listing media', () => {
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
      expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({ where: { id: 'image-id', uploadedAt: { not: null }, listingId: { not: null }, role: { not: 'ISBN' }, listing: { deletedAt: null } } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not expose an ISBN page or an unattached upload', async () => {
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue(null) } }
    await expect(new MediaController(prisma as never).get('private-id')).rejects.toMatchObject({ status: 404 })
  })
})
