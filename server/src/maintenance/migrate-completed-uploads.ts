import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import { ImageValidationError, inspectImage } from '../common/image-validation.js'

const prisma = new PrismaClient()
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  }
})

async function main() {
  if (process.env.UPLOAD_STORAGE !== 'r2' || !process.env.R2_BUCKET) throw new Error('R2 storage is not configured')
  const rows = await prisma.listingImage.findMany({ where: { uploadedAt: { not: null }, objectKey: { startsWith: 'pending/' } } })
  let migrated = 0
  for (const row of rows) {
    const source = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
    if (!source.Body) throw new Error(`empty R2 object: ${row.objectKey}`)
    const bytes = typeof source.Body.transformToByteArray === 'function'
      ? Buffer.from(await source.Body.transformToByteArray())
      : Buffer.concat(await (async () => { const chunks: Buffer[] = []; for await (const chunk of source.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk)); return chunks })())
    let metadata
    try {
      if (bytes.length !== row.size) throw new ImageValidationError('size mismatch')
      metadata = inspectImage(bytes, row.mime)
    } catch (cause) {
      throw new Error(`invalid completed upload ${row.id}: ${cause instanceof Error ? cause.message : 'image validation failed'}`)
    }
    const extension = row.objectKey.split('.').pop() || 'jpg'
    const finalObjectKey = `media/${row.ownerId}/${row.id}.${extension}`
    await s3.send(new CopyObjectCommand({ Bucket: process.env.R2_BUCKET, CopySource: `${process.env.R2_BUCKET}/${row.objectKey}`, Key: finalObjectKey, ContentType: metadata.mime, MetadataDirective: 'REPLACE' }))
    await prisma.listingImage.update({ where: { id: row.id }, data: { objectKey: finalObjectKey, mime: metadata.mime, width: metadata.width, height: metadata.height } })
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
    migrated += 1
  }
  console.log(JSON.stringify({ completedUploadObjectsMigrated: migrated }))
}

main().finally(() => prisma.$disconnect())
