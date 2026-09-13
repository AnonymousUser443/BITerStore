import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { cleanupPendingUploads } from '../src/maintenance/cleanup-pending-uploads.js'

describe('pending upload cleanup', () => {
  it('removes stale local objects and their pending database rows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-pending-'))
    const oldPath = join(root, 'pending', 'owner', 'old.png')
    const freshPath = join(root, 'pending', 'owner', 'fresh.png')
    await mkdir(join(root, 'pending', 'owner'), { recursive: true })
    await writeFile(oldPath, 'old')
    await writeFile(freshPath, 'fresh')
    const now = new Date('2026-09-13T00:00:00.000Z')
    await utimes(oldPath, new Date(now.getTime() - 3_600_000), new Date(now.getTime() - 3_600_000))
    const prisma = {
      listingImage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'old-row', objectKey: 'pending/owner/old.png', createdAt: new Date(now.getTime() - 3_600_000) }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    }
    try {
      const result = await cleanupPendingUploads({ prisma, storage: 'local', localRoot: root, now, ttlSeconds: 60 })
      expect(result.staleDatabaseRows).toBe(1)
      expect(result.removedObjects).toBe(1)
      await expect(readFile(oldPath)).rejects.toBeDefined()
      await expect(readFile(freshPath)).resolves.toEqual(Buffer.from('fresh'))
      expect(prisma.listingImage.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-row'] }, uploadedAt: null } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes old and untracked R2 pending objects in batches', async () => {
    const now = new Date('2026-09-13T00:00:00.000Z')
    const send = vi.fn()
      .mockResolvedValueOnce({ Contents: [
        { Key: 'pending/user/old.png', LastModified: new Date(now.getTime() - 3_600_000) },
        { Key: 'pending/user/fresh.png', LastModified: new Date(now.getTime() + 1_000) },
        { Key: 'pending/orphan.png' }
      ], IsTruncated: false })
      .mockResolvedValueOnce({})
    const prisma = {
      listingImage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'old-row', objectKey: 'pending/user/old.png', createdAt: new Date(now.getTime() - 3_600_000) }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    }
    const result = await cleanupPendingUploads({ prisma, storage: 'r2', bucket: 'bucket', s3: { send } as any, now, ttlSeconds: 60 })
    expect(result.removedObjects).toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].input.Delete.Objects).toEqual(expect.arrayContaining([{ Key: 'pending/user/old.png' }, { Key: 'pending/orphan.png' }]))
  })
})
