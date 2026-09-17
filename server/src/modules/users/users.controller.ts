import { BadRequestException, Body, Controller, Delete, Get, Optional, Patch, Post, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { assertNotMuted, AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ImageValidationError, inspectImage } from '../../common/image-validation.js'
import { CatalogCacheService } from '../../infra/catalog-cache.service.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { strictBody } from '../../common/request-validation.js'
@Controller('me') @UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly catalogCache?: CatalogCacheService) {}

  private async profile(userId: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, studentNumber: true, nickname: true, avatarUrl: true, campus: true, bio: true, role: true, status: true, campusStatus: true, createdAt: true, _count: { select: { wechatAccounts: true } } } })
    const { _count, ...profile } = record
    return { ...profile, wechatBound: _count.wechatAccounts > 0 }
  }

  @Get() get(@CurrentUser() user: AuthUser) { return this.profile(user.id) }

  @Post('feedback')
  @UseGuards(VerifiedGuard)
  submitFeedback(@CurrentUser() user: AuthUser, @Body() value: unknown) {
    assertNotMuted(user)
    const body = strictBody(value, ['type', 'content', 'platform'])
    if ((body.type !== undefined && typeof body.type !== 'string') || (body.content !== undefined && typeof body.content !== 'string') || (body.platform !== undefined && typeof body.platform !== 'string')) throw new BadRequestException('反馈字段格式无效')
    const type = body.type?.trim().toUpperCase()
    const content = body.content?.trim() || ''
    if (!type || !['BUG', 'SUGGESTION'].includes(type)) throw new BadRequestException('请选择提交 Bug 或提交建议')
    if (content.length < 2 || content.length > 1000) throw new BadRequestException('反馈内容应为 2–1000 个字符')
    const platform = body.platform?.trim().toUpperCase() === 'WEAPP' ? 'WEAPP' : 'H5'
    return this.prisma.userFeedback.create({ data: { userId: user.id, type, content, platform } })
  }

  @Patch() async update(@CurrentUser() user: AuthUser, @Body() value: unknown) {
    const body = strictBody(value, ['nickname', 'campus', 'bio', 'avatarUrl'])
    if (body.nickname !== undefined && typeof body.nickname !== 'string') throw new BadRequestException('昵称格式无效')
    if (body.campus !== undefined && body.campus !== null && typeof body.campus !== 'string') throw new BadRequestException('校区格式无效')
    if (body.bio !== undefined && typeof body.bio !== 'string') throw new BadRequestException('个人简介格式无效')
    if (body.avatarUrl !== undefined && body.avatarUrl !== null && typeof body.avatarUrl !== 'string') throw new BadRequestException('头像格式无效')
    const nickname = body.nickname?.trim()
    if (body.nickname !== undefined && (!nickname || nickname.length < 2 || nickname.length > 24)) throw new BadRequestException('昵称长度应为 2–24 个字符')
    if (body.campus !== undefined && body.campus !== null && !['中关村', '良乡', '西山', '珠海'].includes(body.campus)) throw new BadRequestException('校区选项无效')
    if (body.bio !== undefined && body.bio.length > 160) throw new BadRequestException('个人简介不能超过 160 个字符')
    if (body.avatarUrl !== undefined && body.avatarUrl !== null && body.avatarUrl !== '') {
      const inlineMatch = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(body.avatarUrl)
      let isInlineImage = false
      if (inlineMatch && body.avatarUrl.length <= 350_000) {
        try {
          inspectImage(Buffer.from(inlineMatch[2], 'base64'), inlineMatch[1])
          isInlineImage = true
        } catch (cause) {
          if (!(cause instanceof ImageValidationError)) throw cause
        }
      }
      const isHttpsImage = body.avatarUrl.length <= 2048 && /^https:\/\//i.test(body.avatarUrl)
      if (!isInlineImage && !isHttpsImage) throw new BadRequestException('头像必须是有效的 JPEG、PNG 或 WebP 图片')
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.nickname !== undefined ? { nickname } : {}),
        ...(body.campus !== undefined ? { campus: body.campus } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl || null } : {})
      }
    })
    await this.catalogCache?.invalidate()
    return this.profile(user.id)
  }
  @Delete() async remove(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) reply?: FastifyReply) {
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.listing.updateMany({ where: { sellerId: user.id, deletedAt: null }, data: { status: 'OFF_SHELF', deletedAt: now, version: { increment: 1 } } }),
      this.prisma.wechatAccount.deleteMany({ where: { userId: user.id } }),
      this.prisma.campusIdentity.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.favorite.deleteMany({ where: { userId: user.id } }),
      this.prisma.block.deleteMany({ where: { OR: [{ userId: user.id }, { blockedUserId: user.id }] } }),
      this.prisma.notification.deleteMany({ where: { userId: user.id } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'DELETED', campusStatus: 'REVOKED', studentNumber: null, nickname: '已注销用户',
          avatarUrl: null, campus: null, bio: '', role: 'USER', adminTotpSecret: null, adminTotpEnabled: false, deletedAt: now
        }
      })
    ])
    if (reply) {
      const secure = process.env.NODE_ENV === 'production'
      reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/' })
      reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' })
      reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' })
      reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' })
    }
    await this.catalogCache?.invalidate()
    return { ok: true }
  }
}
