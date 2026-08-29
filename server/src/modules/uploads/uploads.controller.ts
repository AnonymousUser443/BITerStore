import { BadRequestException, Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common'
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
@Controller('uploads') @UseGuards(AuthGuard)
export class UploadsController {
  private readonly s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: process.env.R2_ACCESS_KEY_ID ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } : undefined })
  constructor(private readonly prisma: PrismaService) {}
  private useR2() { return process.env.UPLOAD_STORAGE === 'r2' }
  private localPath(objectKey: string) {
    const root = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
    const target = resolve(root, objectKey)
    if (!target.startsWith(`${root}${sep}`)) throw new BadRequestException('非法的存储路径')
    return target
  }
  @Post('presign') async presign(@CurrentUser() user: AuthUser, @Body() body: { mime: string; size: number; role?: string }) {
    if (!allowed.has(body.mime) || body.size <= 0 || body.size > 5 * 1024 * 1024) throw new BadRequestException('仅支持不超过 5MB 的 JPEG、PNG、WebP')
    const role = ['COVER', 'ISBN', 'GALLERY'].includes(body.role || '') ? body.role as 'COVER' | 'ISBN' | 'GALLERY' : 'GALLERY'
    if (this.useR2() && (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET)) throw new BadRequestException('R2 对象存储尚未配置')
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[body.mime]
    const objectKey = `pending/${user.id}/${randomUUID()}.${extension}`
    const row = await this.prisma.listingImage.create({ data: { ownerId: user.id, objectKey, mime: body.mime, size: body.size, role, sortOrder: role === 'COVER' ? 0 : role === 'ISBN' ? 1 : 2 } })
    const uploadUrl = this.useR2()
      ? await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey, ContentType: body.mime, ContentLength: body.size }), { expiresIn: 600 })
      : `${(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '')}/api/v1/uploads/${row.id}/content`
    return { id: row.id, objectKey, uploadUrl, expiresIn: 600, authRequired: !this.useR2() }
  }
  @Put(':id/content') async putLocal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Buffer) {
    if (this.useR2()) throw new BadRequestException('当前使用 R2，请通过预签名地址上传')
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } })
    if (!row) throw new BadRequestException('上传记录不存在或已完成')
    if (!Buffer.isBuffer(body) || body.length !== row.size) throw new BadRequestException('上传文件与申请大小不一致')
    const target = this.localPath(row.objectKey)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body, { flag: 'wx' })
    return { uploaded: true }
  }
  @Post(':id/complete') async complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } }); if (!row) throw new BadRequestException('上传记录不存在或已完成')
    const extension = row.objectKey.split('.').pop() || 'jpg'
    const finalObjectKey = `media/${user.id}/${row.id}.${extension}`
    if (this.useR2()) {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
      if (head.ContentLength !== row.size || head.ContentType !== row.mime) throw new BadRequestException('上传文件与申请信息不一致')
      await this.s3.send(new CopyObjectCommand({ Bucket: process.env.R2_BUCKET, CopySource: `${process.env.R2_BUCKET}/${row.objectKey}`, Key: finalObjectKey, ContentType: row.mime, MetadataDirective: 'REPLACE' }))
    } else {
      const file = await stat(this.localPath(row.objectKey)).catch(() => null)
      if (!file || file.size !== row.size) throw new BadRequestException('上传文件与申请信息不一致')
      await mkdir(dirname(this.localPath(finalObjectKey)), { recursive: true })
      await rename(this.localPath(row.objectKey), this.localPath(finalObjectKey))
    }
    try {
      const completed = await this.prisma.listingImage.update({ where: { id }, data: { objectKey: finalObjectKey, uploadedAt: new Date() } })
      if (this.useR2()) await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey })).catch(() => undefined)
      return completed
    } catch (cause) {
      if (this.useR2()) await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: finalObjectKey })).catch(() => undefined)
      else await rename(this.localPath(finalObjectKey), this.localPath(row.objectKey)).catch(() => undefined)
      throw cause
    }
  }
}
