import { Controller, Get, Header, NotFoundException, Param, StreamableFile, UseGuards } from '@nestjs/common'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { AdminGuard, AuthGuard, CampusVerifiedGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { PublicCatalogRateLimitGuard } from '../listings/public-catalog-rate-limit.guard.js'

@Controller('media')
export class MediaController {
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: process.env.R2_ACCESS_KEY_ID ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } : undefined
  })

  constructor(private readonly prisma: PrismaService) {}

  @Get('owner/:id')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'private, no-store')
  async owner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const image = await this.prisma.listingImage.findFirst({
      where: { id, ownerId: user.id, uploadedAt: { not: null }, role: { not: 'ISBN' }, listing: { sellerId: user.id, deletedAt: null } }
    })
    if (!image) throw new NotFoundException('图片不存在')
    return this.stream(image)
  }

  @Get('conversation/:conversationId/:id')
  @UseGuards(AuthGuard, CampusVerifiedGuard)
  @Header('Cache-Control', 'private, no-store')
  async conversation(@CurrentUser() user: AuthUser, @Param('conversationId') conversationId: string, @Param('id') id: string) {
    const image = await this.prisma.listingImage.findFirst({
      where: {
        id, uploadedAt: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED',
        listing: { deletedAt: null, status: { in: ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF'] }, seller: { status: { in: ['ACTIVE', 'MUTED'] } }, conversations: { some: { id: conversationId, members: { some: { userId: user.id } } } } }
      }
    })
    if (!image) throw new NotFoundException('图片不存在')
    return this.stream(image)
  }

  @Get('review/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @Header('Cache-Control', 'private, no-store')
  async review(@Param('id') id: string) {
    const image = await this.prisma.listingImage.findFirst({
      where: { id, uploadedAt: { not: null }, listingId: { not: null }, listing: { deletedAt: null } }
    })
    if (!image) throw new NotFoundException('图片不存在')
    return this.stream(image)
  }

  @Get(':id')
  @UseGuards(PublicCatalogRateLimitGuard)
  @Header('Cache-Control', 'public, max-age=30, must-revalidate')
  async get(@Param('id') id: string) {
    const image = await this.prisma.listingImage.findFirst({
      where: { id, uploadedAt: { not: null }, listingId: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED', listing: { deletedAt: null, status: 'ACTIVE', seller: { status: 'ACTIVE' } } }
    })
    if (!image) throw new NotFoundException('图片不存在')
    return this.stream(image)
  }

  private async stream(image: { objectKey: string; mime: string; size: number }) {
    try {
      const bytes = process.env.UPLOAD_STORAGE === 'r2'
        ? await this.readR2(image.objectKey)
        : await readFile(this.localPath(image.objectKey))
      return new StreamableFile(bytes, { type: image.mime, length: image.size })
    } catch {
      throw new NotFoundException('图片不存在')
    }
  }

  private async readR2(objectKey: string) {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey }))
    if (!response.Body) throw new Error('empty R2 object')
    return Buffer.from(await response.Body.transformToByteArray())
  }

  private localPath(objectKey: string) {
    const root = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
    const target = resolve(root, objectKey)
    if (!target.startsWith(`${root}${sep}`)) throw new Error('invalid object key')
    return target
  }
}
