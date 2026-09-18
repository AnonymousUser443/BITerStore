import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import { readdir, stat, unlink, rmdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PENDING_TTL_SECONDS = 24 * 60 * 60
export const DEFAULT_UNBOUND_TTL_SECONDS = 24 * 60 * 60
const DELETE_BATCH_SIZE = 1_000

type CleanupRow = { id: string; objectKey: string; createdAt?: Date; uploadedAt?: Date | null }

function cutoffDate(now = new Date(), ttlSeconds = Number(process.env.UPLOAD_PENDING_TTL_SECONDS || DEFAULT_PENDING_TTL_SECONDS)) {
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_PENDING_TTL_SECONDS
  return new Date(now.getTime() - ttl * 1000)
}

function unboundCutoffDate(now = new Date(), ttlSeconds = Number(process.env.UPLOAD_UNBOUND_TTL_SECONDS || DEFAULT_UNBOUND_TTL_SECONDS)) {
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_UNBOUND_TTL_SECONDS
  return new Date(now.getTime() - ttl * 1000)
}

function safeLocalPath(root: string, objectKey: string) {
  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, objectKey)
  if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new Error(`invalid pending object key: ${objectKey}`)
  return target
}

async function walkFiles(directory: string): Promise<string[]> {
  const result: string[] = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await walkFiles(path))
    else if (entry.isFile()) result.push(path)
  }
  return result
}

async function removeEmptyDirectories(directory: string) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) if (entry.isDirectory()) await removeEmptyDirectories(join(directory, entry.name))
  try {
    if ((await readdir(directory)).length === 0) await rmdir(directory)
  } catch {
    // Another cleanup worker may have removed it already.
  }
}

export async function cleanupLocalPending(root: string, cutoff: Date) {
  const pendingRoot = safeLocalPath(root, 'pending')
  const files = await walkFiles(pendingRoot)
  let removed = 0
  for (const file of files) {
    const details = await stat(file).catch(() => null)
    if (!details || details.mtime > cutoff) continue
    await unlink(file).catch(() => undefined)
    removed += 1
  }
  await removeEmptyDirectories(pendingRoot)
  return removed
}

async function listPendingObjects(s3: S3Client, bucket: string) {
  const objects: Array<{ key: string; lastModified?: Date }> = []
  let continuationToken: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'pending/', ContinuationToken: continuationToken }))
    for (const item of page.Contents || []) if (item.Key) objects.push({ key: item.Key, lastModified: item.LastModified })
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

async function deleteR2Objects(s3: S3Client, bucket: string, keys: string[]) {
  let removed = 0
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    const batch = keys.slice(index, index + DELETE_BATCH_SIZE)
    if (!batch.length) continue
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }))
    removed += batch.length
  }
  return removed
}

export type PendingCleanupOptions = {
  prisma: {
    listingImage: {
      findMany(args: unknown): Promise<CleanupRow[]>
      deleteMany(args: unknown): Promise<unknown>
    }
    $transaction<T>(callback: (tx: { listingImage: { deleteMany(args: unknown): Promise<{ count: number }> } }) => Promise<T>): Promise<T>
  }
  storage?: 'local' | 'r2'
  localRoot?: string
  s3?: S3Client
  bucket?: string
  now?: Date
  ttlSeconds?: number
  unboundTtlSeconds?: number
}

export async function cleanupPendingUploads(options: PendingCleanupOptions) {
  const now = options.now || new Date()
  const cutoff = cutoffDate(now, options.ttlSeconds)
  const unboundCutoff = unboundCutoffDate(now, options.unboundTtlSeconds)
  const staleRows = await options.prisma.listingImage.findMany({
    where: {
      listingId: null,
      OR: [
        { uploadedAt: null, objectKey: { startsWith: 'pending/' }, createdAt: { lt: cutoff } },
        { uploadedAt: { lt: unboundCutoff }, objectKey: { startsWith: 'media/' } }
      ]
    },
    select: { id: true, objectKey: true, createdAt: true, uploadedAt: true }
  })
  let removedObjects = 0
  let removedDatabaseRows = 0
  const storage = options.storage || (process.env.UPLOAD_STORAGE === 'r2' ? 'r2' : 'local')

  const removeTrackedObject = async (objectKey: string) => {
    if (storage === 'r2') {
      if (!options.s3 || !options.bucket) throw new Error('R2 storage is not configured')
      await options.s3.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: objectKey }))
    } else {
      const target = safeLocalPath(options.localRoot || resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'), objectKey)
      await unlink(target).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== 'ENOENT') throw cause })
    }
  }

  for (const row of staleRows) {
    const staleCondition = row.uploadedAt
      ? { uploadedAt: { lt: unboundCutoff }, objectKey: { startsWith: 'media/' } }
      : { uploadedAt: null, objectKey: { startsWith: 'pending/' }, createdAt: { lt: cutoff } }
    const deleted = await options.prisma.$transaction(async (tx) => {
      const result = await tx.listingImage.deleteMany({ where: { id: row.id, listingId: null, ...staleCondition } })
      if (!result.count) return 0
      await removeTrackedObject(row.objectKey)
      return result.count
    })
    removedDatabaseRows += deleted
    removedObjects += deleted
  }

  if (storage === 'r2') {
    if (!options.s3 || !options.bucket) throw new Error('R2 storage is not configured')
    const listed = await listPendingObjects(options.s3, options.bucket)
    // Missing LastModified is treated as stale because an untracked pending
    // object must not live forever.
    const keysToDelete = listed.filter((item) => !item.lastModified || item.lastModified <= cutoff).map((item) => item.key)
    removedObjects += await deleteR2Objects(options.s3, options.bucket, keysToDelete)
  } else {
    removedObjects += await cleanupLocalPending(options.localRoot || resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'), cutoff)
  }

  return {
    cutoff,
    unboundCutoff,
    staleDatabaseRows: removedDatabaseRows,
    stalePendingDatabaseRows: staleRows.filter((row) => !row.uploadedAt).length,
    staleCompletedDatabaseRows: staleRows.filter((row) => Boolean(row.uploadedAt)).length,
    removedObjects
  }
}

async function main() {
  const prisma = new PrismaClient()
  const storage = process.env.UPLOAD_STORAGE === 'r2' ? 'r2' : 'local'
  const s3 = storage === 'r2' ? new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID || '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' }
  }) : undefined
  try {
    const result = await cleanupPendingUploads({
      prisma,
      storage,
      localRoot: resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'),
      s3,
      bucket: process.env.R2_BUCKET
    })
    console.log(JSON.stringify({ pendingUploadsCleanup: result }))
  } finally {
    await prisma.$disconnect()
    s3?.destroy()
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && resolve(fileURLToPath(import.meta.url)) === invokedPath) void main()
