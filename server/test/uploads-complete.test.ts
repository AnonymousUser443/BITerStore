import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadsController } from '../src/modules/uploads/uploads.controller.js'

const previousStorage = process.env.UPLOAD_STORAGE
const previousDirectory = process.env.LOCAL_UPLOAD_DIR

afterEach(() => {
  if (previousStorage === undefined) delete process.env.UPLOAD_STORAGE
  else process.env.UPLOAD_STORAGE = previousStorage
  if (previousDirectory === undefined) delete process.env.LOCAL_UPLOAD_DIR
  else process.env.LOCAL_UPLOAD_DIR = previousDirectory
})

describe('upload completion', () => {
  it('moves a verified upload out of pending before marking it complete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-upload-'))
    const row = { id: 'image-id', ownerId: 'owner-id', objectKey: 'pending/owner-id/source.jpg', mime: 'image/jpeg', size: 4 }
    await mkdir(join(root, 'pending/owner-id'), { recursive: true })
    await writeFile(join(root, row.objectKey), Buffer.from('test'))
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    const prisma = {
      listingImage: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockImplementation(({ data }) => ({ ...row, ...data }))
      }
    }
    try {
      const result = await new UploadsController(prisma as never).complete({ id: 'owner-id' } as never, row.id)
      expect(result.objectKey).toBe('media/owner-id/image-id.jpg')
      expect(await readFile(join(root, result.objectKey), 'utf8')).toBe('test')
      await expect(access(join(root, row.objectKey))).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
