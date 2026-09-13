import { BadRequestException, Body, Controller, HttpException, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common'
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { assertNotMuted, AuthGuard, CurrentUser, NotMutedGuard, type AuthUser } from '../../common/auth.js'
import { ImageValidationError, MAX_IMAGE_BYTES, inspectImage, type ImageMetadata, type SupportedImageMime } from '../../common/image-validation.js'
import { PrismaService } from '../../infra/prisma.service.js'
const allowed = new Set<SupportedImageMime>(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PENDING_PER_USER = 20
@Controller('uploads') @UseGuards(AuthGuard, NotMutedGuard)
export class UploadsController {
  private readonly s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: process.env.R2_ACCESS_KEY_ID ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } : undefined })
  constructor(private readonly prisma: PrismaService) {}
  private useR2() { return process.env.UPLOAD_STORAGE === 'r2' }
  private normalizeMime(value: unknown): SupportedImageMime | undefined {
    const mime = typeof value === 'string' ? value.split(';', 1)[0]?.trim().toLowerCase() : ''
    return allowed.has(mime as SupportedImageMime) ? mime as SupportedImageMime : undefined
  }
  private localPath(objectKey: string) {
    const root = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
    const target = resolve(root, objectKey)
    if (!target.startsWith(`${root}${sep}`)) throw new BadRequestException('非法的存储路径')
    return target
  }
  @Post('presign') async presign(@CurrentUser() user: AuthUser, @Body() body: { mime: string; size: number; role?: string }) {
    assertNotMuted(user)
    const mime = this.normalizeMime(body?.mime)
    if (!mime || !Number.isSafeInteger(body?.size) || body.size <= 0 || body.size > MAX_IMAGE_BYTES) throw new BadRequestException('仅支持不超过 5MB 的 JPEG、PNG、WebP')
    const countPending = this.prisma.listingImage.count
    if (typeof countPending === 'function') {
      const pending = await countPending.call(this.prisma.listingImage, { where: { ownerId: user.id, uploadedAt: null, objectKey: { startsWith: 'pending/' } } })
      if (Number(pending) >= MAX_PENDING_PER_USER) throw new HttpException('待上传文件过多，请先完成或取消已有上传', HttpStatus.TOO_MANY_REQUESTS)
    }
    const role = ['COVER', 'ISBN', 'GALLERY'].includes(body.role || '') ? body.role as 'COVER' | 'ISBN' | 'GALLERY' : 'GALLERY'
    if (this.useR2() && (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET)) throw new BadRequestException('R2 对象存储尚未配置')
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime]
    const objectKey = `pending/${user.id}/${randomUUID()}.${extension}`
    const row = await this.prisma.listingImage.create({ data: { ownerId: user.id, objectKey, mime, size: body.size, role, sortOrder: role === 'COVER' ? 0 : role === 'ISBN' ? 1 : 2 } })
    const uploadUrl = this.useR2()
      ? await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey, ContentType: mime, ContentLength: body.size }), { expiresIn: 600 })
      : `${(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '')}/api/v1/uploads/${row.id}/content`
    return { id: row.id, objectKey, uploadUrl, expiresIn: 600, authRequired: !this.useR2() }
  }
  @Put(':id/content') async putLocal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Buffer) {
    assertNotMuted(user)
    if (this.useR2()) throw new BadRequestException('当前使用 R2，请通过预签名地址上传')
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } })
    if (!row) throw new BadRequestException('上传记录不存在或已完成')
    if (!Buffer.isBuffer(body) || body.length !== row.size || body.length > MAX_IMAGE_BYTES) throw new BadRequestException('上传文件与申请大小不一致')
    const metadata = this.validateImage(body, row.mime)
    const target = this.localPath(row.objectKey)
    await mkdir(dirname(target), { recursive: true })
    try {
      await writeFile(target, body, { flag: 'wx' })
    } catch (cause) {
      throw new BadRequestException(`上传文件无法保存：${cause instanceof Error ? cause.message : '请重试'}`)
    }
    return { uploaded: true, width: metadata.width, height: metadata.height, mime: metadata.mime }
  }
  @Post(':id/complete') async complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertNotMuted(user)
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } }); if (!row) throw new BadRequestException('上传记录不存在或已完成')
    const extension = row.objectKey.split('.').pop() || 'jpg'
    const finalObjectKey = `media/${user.id}/${row.id}.${extension}`
    let metadata: ImageMetadata
    if (this.useR2()) {
      try {
        const head = await this.s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
        if (head.ContentLength !== row.size || this.normalizeMime(head.ContentType) !== this.normalizeMime(row.mime)) throw new ImageValidationError('上传文件与申请信息不一致')
        const bytes = await this.readR2(row.objectKey)
        if (bytes.length !== row.size) throw new ImageValidationError('上传文件与申请大小不一致')
        metadata = this.validateImage(bytes, row.mime)
        await this.s3.send(new CopyObjectCommand({ Bucket: process.env.R2_BUCKET, CopySource: `${process.env.R2_BUCKET}/${row.objectKey}`, Key: finalObjectKey, ContentType: metadata.mime, MetadataDirective: 'REPLACE' }))
      } catch (cause) {
        await this.deleteR2(row.objectKey)
        throw this.asBadRequest(cause)
      }
    } else {
      try {
        const file = await stat(this.localPath(row.objectKey)).catch(() => null)
        if (!file || file.size !== row.size) throw new ImageValidationError('上传文件与申请信息不一致')
        const bytes = await readFile(this.localPath(row.objectKey))
        metadata = this.validateImage(bytes, row.mime)
        await mkdir(dirname(this.localPath(finalObjectKey)), { recursive: true })
        await rename(this.localPath(row.objectKey), this.localPath(finalObjectKey))
      } catch (cause) {
        await unlink(this.localPath(row.objectKey)).catch(() => undefined)
        throw this.asBadRequest(cause)
      }
    }
    try {
      const completed = await this.prisma.listingImage.update({ where: { id }, data: { objectKey: finalObjectKey, uploadedAt: new Date(), width: metadata.width, height: metadata.height, mime: metadata.mime, size: row.size } })
      if (this.useR2()) await this.deleteR2(row.objectKey)
      return completed
    } catch (cause) {
      if (this.useR2()) await this.deleteR2(finalObjectKey)
      else await rename(this.localPath(finalObjectKey), this.localPath(row.objectKey)).catch(() => undefined)
      throw cause
    }
  }

  private validateImage(bytes: Buffer, declaredMime: string): ImageMetadata {
    try {
      return inspectImage(bytes, declaredMime)
    } catch (cause) {
      throw this.asBadRequest(cause)
    }
  }

  private asBadRequest(cause: unknown): BadRequestException {
    if (cause instanceof BadRequestException) return cause
    if (cause instanceof ImageValidationError) return new BadRequestException(`图片校验失败：${cause.message}`)
    return new BadRequestException('上传文件无法读取或校验，请重新上传')
  }

  private async readR2(objectKey: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey }))
    const body = response.Body
    if (!body) throw new ImageValidationError('对象内容为空')
    if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray())
    const chunks: Buffer[] = []
    for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }

  private async deleteR2(objectKey: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey })).catch(() => undefined)
  }
}
