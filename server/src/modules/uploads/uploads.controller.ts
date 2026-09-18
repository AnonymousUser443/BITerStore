import { BadRequestException, Body, ConflictException, Controller, Delete, HttpException, HttpStatus, Optional, Param, Post, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { assertNotMuted, AuthGuard, CurrentUser, NotMutedGuard, type AuthUser } from '../../common/auth.js'
import { ImageValidationError, MAX_IMAGE_BYTES, inspectImage, type ImageMetadata, type SupportedImageMime } from '../../common/image-validation.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'
const allowed = new Set<SupportedImageMime>(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PENDING_PER_USER = 20
const DEFAULT_MAX_UNBOUND_FILES_PER_USER = 30
const DEFAULT_MAX_UNBOUND_BYTES_PER_USER = 100 * 1024 * 1024
@Controller('uploads') @UseGuards(AuthGuard, NotMutedGuard)
export class UploadsController {
  private activeImageValidations = 0
  private readonly s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: process.env.R2_ACCESS_KEY_ID ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } : undefined })
  constructor(private readonly prisma: PrismaService, @Optional() private readonly redis?: RedisService) {}
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
    await this.enforceRate(user.id, 'presign', Number(process.env.UPLOAD_PRESIGN_PER_MINUTE || 30))
    const mime = this.normalizeMime(body?.mime)
    if (!mime || !Number.isSafeInteger(body?.size) || body.size <= 0 || body.size > MAX_IMAGE_BYTES) throw new BadRequestException('仅支持不超过 5MB 的 JPEG、PNG、WebP')
    const countPending = this.prisma.listingImage.count
    if (typeof countPending === 'function') {
      const pending = await countPending.call(this.prisma.listingImage, { where: { ownerId: user.id, uploadedAt: null, objectKey: { startsWith: 'pending/' } } })
      if (Number(pending) >= MAX_PENDING_PER_USER) throw new HttpException('待上传文件过多，请先完成或取消已有上传', HttpStatus.TOO_MANY_REQUESTS)
    }
    const aggregateUploads = this.prisma.listingImage.aggregate
    if (typeof aggregateUploads === 'function') {
      const usage = await aggregateUploads.call(this.prisma.listingImage, {
        where: { ownerId: user.id, listingId: null },
        _count: { _all: true },
        _sum: { size: true }
      }) as { _count?: { _all?: number }; _sum?: { size?: number | null } }
      const maxFiles = this.positiveLimit(process.env.UPLOAD_MAX_UNBOUND_FILES_PER_USER, DEFAULT_MAX_UNBOUND_FILES_PER_USER)
      const maxBytes = this.positiveLimit(process.env.UPLOAD_MAX_UNBOUND_BYTES_PER_USER, DEFAULT_MAX_UNBOUND_BYTES_PER_USER)
      if (Number(usage._count?._all || 0) >= maxFiles || Number(usage._sum?.size || 0) + body.size > maxBytes) {
        throw new HttpException('未发布图片已达到配额，请先发布或取消已有上传', HttpStatus.TOO_MANY_REQUESTS)
      }
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
    await this.enforceRate(user.id, 'content', Number(process.env.UPLOAD_CONTENT_PER_MINUTE || 60))
    if (this.useR2()) throw new BadRequestException('当前使用 R2，请通过预签名地址上传')
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } })
    if (!row) throw new BadRequestException('上传记录不存在或已完成')
    if (!Buffer.isBuffer(body) || body.length !== row.size || body.length > MAX_IMAGE_BYTES) throw new BadRequestException('上传文件与申请大小不一致')
    const metadata = await this.validateImage(body, row.mime)
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
    await this.enforceRate(user.id, 'complete', Number(process.env.UPLOAD_COMPLETE_PER_MINUTE || 60))
    const findOwned = () => this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id } })
    const row = await findOwned()
    if (!row) throw new BadRequestException('上传记录不存在或已取消')
    if (row.uploadedAt) return row
    const extension = row.objectKey.split('.').pop() || 'jpg'
    // Every attempt owns a separate destination. A losing concurrent request
    // must never overwrite or delete the winning request's committed object.
    const finalObjectKey = `media/${user.id}/${row.id}-${randomUUID()}.${extension}`
    let committed = false
    try {
      let bytes: Buffer
      if (this.useR2()) {
        const head = await this.s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
        if (head.ContentLength !== row.size || this.normalizeMime(head.ContentType) !== this.normalizeMime(row.mime)) throw new ImageValidationError('上传文件与申请信息不一致')
        bytes = await this.readR2(row.objectKey)
      } else {
        const file = await stat(this.localPath(row.objectKey)).catch(() => null)
        if (!file || file.size !== row.size) throw new ImageValidationError('上传文件与申请信息不一致')
        bytes = await readFile(this.localPath(row.objectKey))
      }
      if (bytes.length !== row.size || bytes.length > MAX_IMAGE_BYTES) throw new ImageValidationError('上传文件与申请大小不一致')
      const metadata = await this.validateImage(bytes, row.mime)
      if (this.useR2()) {
        // Persist the exact inspected bytes, not a mutable presigned PUT key.
        await this.s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: finalObjectKey, Body: bytes, ContentType: metadata.mime, ContentLength: bytes.length }))
      } else {
        await mkdir(dirname(this.localPath(finalObjectKey)), { recursive: true })
        await writeFile(this.localPath(finalObjectKey), bytes, { flag: 'wx' })
      }
      const result = await this.prisma.listingImage.updateMany({
        where: { id, ownerId: user.id, uploadedAt: null, objectKey: row.objectKey },
        data: { objectKey: finalObjectKey, uploadedAt: new Date(), width: metadata.width, height: metadata.height, mime: metadata.mime, size: bytes.length }
      })
      committed = result.count === 1
      if (!committed) {
        await this.removeObject(finalObjectKey).catch(() => undefined)
        const winner = await findOwned()
        if (winner?.uploadedAt) return winner
        throw new ConflictException('上传已取消，请重新上传')
      }
      // Pending cleanup is best-effort; failure cannot undo a committed upload.
      await this.removeObject(row.objectKey).catch(() => undefined)
      const completed = await findOwned()
      if (!completed) throw new ConflictException('上传已取消，请重新上传')
      return completed
    } catch (cause) {
      if (!committed) {
        // A winner may have removed pending while this request was reading it.
        // Also resolve an ambiguous database response before deleting anything:
        // the update may have committed even if its response was interrupted.
        const winner = await findOwned()
        if (winner?.uploadedAt) {
          if (winner.objectKey !== finalObjectKey) await this.removeObject(finalObjectKey).catch(() => undefined)
          return winner
        }
        await this.removeObject(finalObjectKey).catch(() => undefined)
      }
      if (cause instanceof HttpException) throw cause
      throw this.asBadRequest(cause)
    }
  }

  @Delete(':id') async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertNotMuted(user)
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, listingId: null } })
    if (!row) throw new BadRequestException('上传记录不存在、已绑定商品或已取消')
    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listingImage.deleteMany({ where: { id, ownerId: user.id, listingId: null, objectKey: row.objectKey } })
      if (!result.count) return 0
      await this.removeObject(row.objectKey)
      return result.count
    })
    if (!removed) throw new ConflictException('上传记录已变化，请刷新后重试')
    return { cancelled: true }
  }

  private async validateImage(bytes: Buffer, declaredMime: string): Promise<ImageMetadata> {
    try {
      if (process.env.NODE_ENV !== 'production') return inspectImage(bytes, declaredMime)
      const maximum = this.positiveLimit(process.env.UPLOAD_IMAGE_VALIDATION_CONCURRENCY, 2)
      if (this.activeImageValidations >= Math.min(maximum, 16)) throw new HttpException('图片处理繁忙，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      this.activeImageValidations += 1
      try { return await this.validateImageInWorker(bytes, declaredMime) }
      finally { this.activeImageValidations -= 1 }
    } catch (cause) {
      if (cause instanceof HttpException) throw cause
      throw this.asBadRequest(cause)
    }
  }

  private validateImageInWorker(bytes: Buffer, declaredMime: string) {
    const copied = Uint8Array.from(bytes)
    const timeoutMs = Math.min(this.positiveLimit(process.env.UPLOAD_IMAGE_VALIDATION_TIMEOUT_MS, 5_000), 15_000)
    return new Promise<ImageMetadata>((resolve, reject) => {
      const worker = new Worker(new URL('./image-validation.worker.js', import.meta.url), {
        workerData: { bytes: copied, declaredMime }, transferList: [copied.buffer]
      })
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        callback()
      }
      const timeout = setTimeout(() => finish(() => { void worker.terminate(); reject(new ImageValidationError('图片校验超时')) }), timeoutMs)
      worker.once('message', (message: { metadata?: ImageMetadata; error?: string }) => finish(() => {
        void worker.terminate()
        if (message.error || !message.metadata) reject(new ImageValidationError(message.error || '图片校验失败'))
        else resolve(message.metadata)
      }))
      worker.once('error', (cause) => finish(() => reject(cause)))
      worker.once('exit', (code) => { if (code !== 0) finish(() => reject(new Error(`image validation worker exited with code ${code}`))) })
    })
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
    if (response.ContentLength !== undefined && response.ContentLength > MAX_IMAGE_BYTES) {
      (body as { destroy?: () => void }).destroy?.()
      throw new ImageValidationError('上传文件超过 5MB')
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      size += chunk.length
      if (size > MAX_IMAGE_BYTES) throw new ImageValidationError('上传文件超过 5MB')
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  private async removeObject(objectKey: string) {
    if (this.useR2()) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey }))
      return
    }
    await unlink(this.localPath(objectKey)).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== 'ENOENT') throw cause })
  }

  private positiveLimit(raw: string | undefined, fallback: number) {
    const parsed = Number(raw)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
  }

  private async enforceRate(userId: string, action: string, rawLimit: number) {
    if (!this.redis) return
    const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? rawLimit : 30
    const key = `ratelimit:upload:${action}:${userId}:${Math.floor(Date.now() / 60_000)}`
    try {
      await this.redis.ensureConnected()
      const count = await this.redis.client.incr(key)
      if (count === 1) await this.redis.client.expire(key, 120)
      if (count > limit) throw new HttpException('上传操作过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    } catch (cause) {
      if (cause instanceof HttpException) throw cause
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('上传配额服务暂时不可用，请稍后重试')
    }
  }
}
