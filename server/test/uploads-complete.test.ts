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
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const row = { id: 'image-id', ownerId: 'owner-id', objectKey: 'pending/owner-id/source.png', mime: 'image/png', size: bytes.length }
    await mkdir(join(root, 'pending/owner-id'), { recursive: true })
    await writeFile(join(root, row.objectKey), bytes)
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
      expect(result.objectKey).toBe('media/owner-id/image-id.png')
      expect(prisma.listingImage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ width: 1, height: 1, mime: 'image/png' }) }))
      expect(await readFile(join(root, result.objectKey))).toEqual(bytes)
      await expect(access(join(root, row.objectKey))).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a MIME-spoofed local upload before it reaches storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-upload-invalid-'))
    const row = { id: 'image-id', ownerId: 'owner-id', objectKey: 'pending/owner-id/source.png', mime: 'image/png', size: 4 }
    const prisma = { listingImage: { findFirst: vi.fn().mockResolvedValue(row) } }
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    try {
      await expect(new UploadsController(prisma as never).putLocal({ id: 'owner-id' } as never, row.id, Buffer.from('test'))).rejects.toMatchObject({ status: 400 })
      await expect(access(join(root, row.objectKey))).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
