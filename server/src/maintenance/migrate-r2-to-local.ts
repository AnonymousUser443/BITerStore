import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { inspectImage } from '../common/image-validation.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function localPath(root: string, objectKey: string) {
  const base = resolve(root)
  const target = resolve(base, objectKey)
  if (!target.startsWith(`${base}${sep}`)) throw new Error(`invalid object key: ${objectKey}`)
  return target
}

async function readR2(s3: S3Client, bucket: string, key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) throw new Error(`empty R2 object: ${key}`)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length
    if (size > MAX_IMAGE_BYTES) throw new Error(`R2 object exceeds image limit: ${key}`)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function main() {
  const prisma = new PrismaClient()
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID || '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' }
  })
  const bucket = process.env.R2_BUCKET
  const root = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
  if (!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2 configuration is incomplete')
  let migrated = 0
  let skipped = 0
  try {
    const rows = await prisma.listingImage.findMany({ where: { uploadedAt: { not: null }, objectKey: { startsWith: 'media/' } }, select: { id: true, objectKey: true, size: true, mime: true } })
    for (const row of rows) {
      const target = localPath(root, row.objectKey)
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.objectKey }))
      const bytes = await readR2(s3, bucket, row.objectKey)
      if (bytes.length !== row.size) throw new Error(`size mismatch for ${row.objectKey}: ${bytes.length} != ${row.size}`)
      inspectImage(bytes, row.mime)
      const digest = createHash('sha256').update(bytes).digest('hex')
      const existing = await readFile(target).catch((cause: NodeJS.ErrnoException) => {
        if (cause.code === 'ENOENT') return null
        throw cause
      })
      if (existing) {
        if (createHash('sha256').update(existing).digest('hex') !== digest) throw new Error(`local content conflict: ${row.id}`)
        await prisma.listingImage.update({ where: { id: row.id }, data: { localStoredAt: new Date(), remoteStoredAt: new Date(), backupError: null } })
        skipped += 1
        console.log(JSON.stringify({ id: row.id, bytes: bytes.length, sha256: digest, status: 'verified-existing' }))
        continue
      }
      const temporary = `${target}.migrate-${process.pid}-${digest.slice(0, 12)}`
      await mkdir(dirname(target), { recursive: true })
      await writeFile(temporary, bytes, { flag: 'wx' })
      try {
        // Publish only complete bytes and never replace an existing file.
        await link(temporary, target)
      } finally { await unlink(temporary) }
      const persisted = await readFile(target)
      if (createHash('sha256').update(persisted).digest('hex') !== digest) throw new Error(`local verification failed: ${row.id}`)
      await prisma.listingImage.update({ where: { id: row.id }, data: { localStoredAt: new Date(), remoteStoredAt: new Date(), backupError: null } })
      migrated += 1
      console.log(JSON.stringify({ id: row.id, objectKey: row.objectKey, bytes: bytes.length, sha256: digest }))
    }
    console.log(JSON.stringify({ migrated, skipped, total: rows.length, localRoot: root }))
  } finally {
    await prisma.$disconnect()
    s3.destroy()
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1 })
