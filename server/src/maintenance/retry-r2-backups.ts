import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

function localPath(root: string, key: string) {
  const base = resolve(root); const target = resolve(base, key)
  if (!target.startsWith(`${base}${sep}`)) throw new Error(`invalid object key: ${key}`)
  return target
}

async function main() {
  const prisma = new PrismaClient()
  const bucket = process.env.R2_BUCKET
  if (!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2 configuration is incomplete')
  const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } })
  const root = process.env.LOCAL_UPLOAD_DIR || 'uploads'
  let backedUp = 0, failed = 0
  try {
    const rows = await prisma.listingImage.findMany({ where: { uploadedAt: { not: null }, localStoredAt: { not: null }, remoteStoredAt: null, objectKey: { startsWith: 'media/' } }, select: { id: true, objectKey: true, size: true, mime: true, backupAttempts: true } })
    for (const row of rows) {
      try {
        const path = localPath(root, row.objectKey); const details = await stat(path)
        if (details.size !== row.size) throw new Error(`size mismatch: ${details.size} != ${row.size}`)
        const bytes = await readFile(path)
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: row.objectKey, Body: bytes, ContentType: row.mime, ContentLength: bytes.length }))
        await prisma.listingImage.update({ where: { id: row.id }, data: { remoteStoredAt: new Date(), backupAttempts: { increment: 1 }, backupError: null } })
        backedUp++
      } catch (cause) {
        failed++
        await prisma.listingImage.update({ where: { id: row.id }, data: { backupAttempts: { increment: 1 }, backupError: cause instanceof Error ? cause.message.slice(0, 500) : 'R2 backup failed' } }).catch(() => undefined)
      }
    }
    console.log(JSON.stringify({ scanned: rows.length, backedUp, failed }))
  } finally { await prisma.$disconnect(); s3.destroy() }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
