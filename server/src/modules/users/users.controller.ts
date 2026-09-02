import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
@Controller('me') @UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  private async profile(userId: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, studentNumber: true, nickname: true, avatarUrl: true, campus: true, bio: true, role: true, status: true, campusStatus: true, createdAt: true, _count: { select: { wechatAccounts: true } } } })
    const { _count, ...profile } = record
    return { ...profile, wechatBound: _count.wechatAccounts > 0 }
  }

  @Get() get(@CurrentUser() user: AuthUser) { return this.profile(user.id) }

  @Post('feedback')
  @UseGuards(VerifiedGuard)
  submitFeedback(@CurrentUser() user: AuthUser, @Body() body: { type?: string; content?: string; platform?: string }) {
    const type = body.type?.trim().toUpperCase()
    const content = body.content?.trim() || ''
    if (!type || !['BUG', 'SUGGESTION'].includes(type)) throw new BadRequestException('请选择提交 Bug 或提交建议')
    if (content.length < 2 || content.length > 1000) throw new BadRequestException('反馈内容应为 2–1000 个字符')
    const platform = body.platform?.trim().toUpperCase() === 'WEAPP' ? 'WEAPP' : 'H5'
    return this.prisma.userFeedback.create({ data: { userId: user.id, type, content, platform } })
  }

  @Patch() async update(@CurrentUser() user: AuthUser, @Body() body: { nickname?: string; campus?: string | null; bio?: string; avatarUrl?: string | null }) {
    const nickname = body.nickname?.trim()
    if (body.nickname !== undefined && (!nickname || nickname.length < 2 || nickname.length > 24)) throw new BadRequestException('昵称长度应为 2–24 个字符')
    if (body.campus !== undefined && body.campus !== null && !['中关村', '良乡', '西山', '珠海'].includes(body.campus)) throw new BadRequestException('校区选项无效')
    if (body.bio !== undefined && body.bio.length > 160) throw new BadRequestException('个人简介不能超过 160 个字符')
    if (body.avatarUrl !== undefined && body.avatarUrl !== null && body.avatarUrl !== '') {
      const isInlineImage = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.avatarUrl) && body.avatarUrl.length <= 350_000
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
    return this.profile(user.id)
  }
  @Delete() async remove(@CurrentUser() user: AuthUser) { await this.prisma.$transaction([this.prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }), this.prisma.user.update({ where: { id: user.id }, data: { status: 'DELETED', nickname: '已注销用户', avatarUrl: null, bio: '', deletedAt: new Date() } })]); return { ok: true } }
}
