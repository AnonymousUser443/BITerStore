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
  it('rejects new uploads when completed-but-unbound files exhaust the user quota', async () => {
    const prisma = {
      listingImage: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _count: { _all: 30 }, _sum: { size: 30_000_000 } }),
        create: vi.fn()
      }
    }
    await expect(new UploadsController(prisma as never).presign({ id: 'owner-id' } as never, { mime: 'image/png', size: 100, role: 'COVER' })).rejects.toMatchObject({ status: 429 })
    expect(prisma.listingImage.create).not.toHaveBeenCalled()
  })

  it('rate-limits upload allocation before creating database rows', async () => {
    const redis = { ensureConnected: vi.fn(), client: { incr: vi.fn().mockResolvedValue(31), expire: vi.fn() } }
    await expect(new UploadsController({} as never, redis as never).presign({ id: 'owner-id' } as never, { mime: 'image/png', size: 100 })).rejects.toMatchObject({ status: 429 })
  })

  it('moves a verified upload out of pending before marking it complete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-upload-'))
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const row = { id: 'image-id', ownerId: 'owner-id', objectKey: 'pending/owner-id/source.png', mime: 'image/png', size: bytes.length }
    await mkdir(join(root, 'pending/owner-id'), { recursive: true })
    await writeFile(join(root, row.objectKey), bytes)
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    let stored = { ...row, uploadedAt: null as Date | null }
    const prisma = {
      listingImage: {
        findFirst: vi.fn(async () => stored),
        updateMany: vi.fn(async ({ data }) => { stored = { ...stored, ...data }; return { count: 1 } })
      }
    }
    try {
      const result = await new UploadsController(prisma as never).complete({ id: 'owner-id' } as never, row.id)
      expect(result.objectKey).toMatch(/^media\/owner-id\/image-id-[\w-]+\.png$/)
      expect(prisma.listingImage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ width: 1, height: 1, mime: 'image/png' }) }))
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

  it('cancels an unbound local upload and removes its object transactionally', async () => {
    const root = await mkdtemp(join(tmpdir(), 'biterstore-upload-cancel-'))
    const row = { id: 'image-id', ownerId: 'owner-id', listingId: null, objectKey: 'media/owner-id/image-id.png' }
    await mkdir(join(root, 'media/owner-id'), { recursive: true })
    await writeFile(join(root, row.objectKey), 'image')
    process.env.UPLOAD_STORAGE = 'local'
    process.env.LOCAL_UPLOAD_DIR = root
    const prisma = {
      listingImage: { findFirst: vi.fn().mockResolvedValue(row), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }
    } as any
    prisma.$transaction = vi.fn(async (callback: any) => callback(prisma))
    try {
      await expect(new UploadsController(prisma as never).cancel({ id: 'owner-id' } as never, row.id)).resolves.toEqual({ cancelled: true })
      await expect(access(join(root, row.objectKey))).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
