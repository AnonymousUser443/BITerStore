import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
@Controller('uploads') @UseGuards(AuthGuard)
export class UploadsController {
  private readonly s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: process.env.R2_ACCESS_KEY_ID ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } : undefined })
  constructor(private readonly prisma: PrismaService) {}
  @Post('presign') async presign(@CurrentUser() user: AuthUser, @Body() body: { mime: string; size: number }) {
    if (!allowed.has(body.mime) || body.size <= 0 || body.size > 5 * 1024 * 1024) throw new BadRequestException('仅支持不超过 5MB 的 JPEG、PNG、WebP')
    if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET) throw new BadRequestException('对象存储尚未配置')
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[body.mime]
    const objectKey = `pending/${user.id}/${randomUUID()}.${extension}`
    const row = await this.prisma.listingImage.create({ data: { ownerId: user.id, objectKey, mime: body.mime, size: body.size } })
    const uploadUrl = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey, ContentType: body.mime, ContentLength: body.size }), { expiresIn: 600 })
    return { id: row.id, objectKey, uploadUrl, expiresIn: 600 }
  }
  @Post(':id/complete') async complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.listingImage.findFirst({ where: { id, ownerId: user.id, uploadedAt: null } }); if (!row) throw new BadRequestException('上传记录不存在或已完成')
    const head = await this.s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: row.objectKey }))
    if (head.ContentLength !== row.size || head.ContentType !== row.mime) throw new BadRequestException('上传文件与申请信息不一致')
    return this.prisma.listingImage.update({ where: { id }, data: { uploadedAt: new Date() } })
  }
}
