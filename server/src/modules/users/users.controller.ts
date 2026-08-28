import { BadRequestException, Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
@Controller('me') @UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async get(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, nickname: true, avatarUrl: true, campus: true, bio: true, role: true, status: true, campusStatus: true, createdAt: true, _count: { select: { wechatAccounts: true } } } })
    const { _count, ...profile } = record
    return { ...profile, wechatBound: _count.wechatAccounts > 0 }
  }
  @Patch() update(@CurrentUser() user: AuthUser, @Body() body: { nickname?: string; campus?: string; bio?: string; avatarUrl?: string }) {
    if (body.nickname && (body.nickname.trim().length < 2 || body.nickname.trim().length > 24)) throw new BadRequestException('昵称长度应为 2–24 个字符')
    return this.prisma.user.update({ where: { id: user.id }, data: { nickname: body.nickname?.trim(), campus: body.campus, bio: body.bio?.slice(0, 160), avatarUrl: body.avatarUrl } })
  }
  @Delete() async remove(@CurrentUser() user: AuthUser) { await this.prisma.$transaction([this.prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }), this.prisma.user.update({ where: { id: user.id }, data: { status: 'DELETED', nickname: '已注销用户', avatarUrl: null, bio: '', deletedAt: new Date() } })]); return { ok: true } }
}
