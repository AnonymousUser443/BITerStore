import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadsController } from '../src/modules/uploads/uploads.controller.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
afterEach(() => vi.unstubAllEnvs())

function setup() {
  vi.stubEnv('UPLOAD_STORAGE', 'r2')
  let row: any = { id: 'image', ownerId: 'owner', objectKey: 'pending/owner/image.png', size: png.length, mime: 'image/png', uploadedAt: null }
  const objects = new Map<string, Buffer>([[row.objectKey, png]])
  const prisma: any = { listingImage: {
    findFirst: vi.fn(async () => row && { ...row }),
    updateMany: vi.fn(async ({ where, data }) => {
      if (!row || row.uploadedAt || row.objectKey !== where.objectKey || where.ownerId !== row.ownerId) return { count: 0 }
      row = { ...row, ...data }
      return { count: 1 }
    })
  } }
  const controller = new UploadsController(prisma)
  const send = vi.spyOn((controller as any).s3, 'send').mockImplementation(async (command: any) => {
    const { Key, Body } = command.input
    switch (command.constructor.name) {
      case 'HeadObjectCommand': return { ContentLength: objects.get(Key)?.length, ContentType: 'image/png' }
      case 'GetObjectCommand': {
        const verified = objects.get(Key)
        if (!verified) throw new Error('missing')
        // The same presigned PUT can replace pending after GET has started.
        objects.set(Key, Buffer.alloc(png.length, 88))
        return { Body: Readable.from([verified]) }
      }
      case 'PutObjectCommand': objects.set(Key, Buffer.from(Body)); return {}
      case 'DeleteObjectCommand': objects.delete(Key); return {}
      case 'CopyObjectCommand': throw new Error('must not copy a mutable pending key')
      default: throw new Error('unexpected S3 command')
    }
  })
  return { controller, prisma, objects, send, current: () => row, cancel: () => { row = null } }
}

describe('upload completion concurrency', () => {
  it('commits exactly the validated bytes even if pending is replaced, and retries are idempotent', async () => {
    const test = setup()
    const result = await test.controller.complete({ id: 'owner' } as never, 'image')
    expect(test.objects.get(result.objectKey)).toEqual(png)
    const count = test.send.mock.calls.length
    expect(await test.controller.complete({ id: 'owner' } as never, 'image')).toEqual(result)
    expect(test.send).toHaveBeenCalledTimes(count)
  })

  it('a losing completion cannot delete the committed object', async () => {
    const test = setup()
    // Let both requests read the original body before either commits.
    const original = test.send.getMockImplementation()!
    test.send.mockImplementation(async (command: any) => command.constructor.name === 'GetObjectCommand'
      ? { Body: Readable.from([png]) } : original(command))
    const results = await Promise.all([test.controller.complete({ id: 'owner' } as never, 'image'), test.controller.complete({ id: 'owner' } as never, 'image')])
    expect(results[0].objectKey).toBe(results[1].objectKey)
    expect(test.objects.get(results[0].objectKey)).toEqual(png)
    expect([...test.objects.keys()]).toEqual([results[0].objectKey])
  })

  it('preserves a committed object if the database reply is lost', async () => {
    const test = setup()
    const update = test.prisma.listingImage.updateMany.getMockImplementation()
    test.prisma.listingImage.updateMany.mockImplementation(async (args: unknown) => { await update(args); throw new Error('connection interrupted') })
    const result = await test.controller.complete({ id: 'owner' } as never, 'image')
    expect(test.objects.get(result.objectKey)).toEqual(png)
    expect(result.uploadedAt).toBeInstanceOf(Date)
  })

  it('cleans its candidate if cancellation wins before commit', async () => {
    const test = setup()
    test.prisma.listingImage.updateMany.mockImplementation(async () => { test.cancel(); return { count: 0 } })
    await expect(test.controller.complete({ id: 'owner' } as never, 'image')).rejects.toMatchObject({ status: 409 })
    expect([...test.objects.keys()].some((key) => key.startsWith('media/'))).toBe(false)
  })
})
