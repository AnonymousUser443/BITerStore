import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

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
    const extension = row.objectKey.split('.').pop() || 'jpg'
    const finalObjectKey = `media/${row.ownerId}/${row.id}.${extension}`
    await s3.send(new CopyObjectCommand({ Bucket: process.env.R2_BUCKET, CopySource: `${process.env.R2_BUCKET}/${row.objectKey}`, Key: finalObjectKey, ContentType: row.mime, MetadataDirective: 'REPLACE' }))
    await prisma.listingImage.update({ where: { id: row.id }, data: { objectKey: finalObjectKey } })
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
    migrated += 1
  }
  console.log(JSON.stringify({ completedUploadObjectsMigrated: migrated }))
}

main().finally(() => prisma.$disconnect())
