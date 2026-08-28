import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
@Controller() @UseGuards(AuthGuard)
export class ModerationController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('notifications') listNotifications(@CurrentUser() user: AuthUser) { return this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }) }
  @Post('reports') @UseGuards(VerifiedGuard) report(@CurrentUser() user: AuthUser, @Body() body: { targetType: string; targetId: string; reason: string; evidence?: string }) { if (!body.targetId || !body.reason?.trim()) throw new BadRequestException('请填写举报对象和原因'); return this.prisma.report.create({ data: { reporterId: user.id, targetType: body.targetType.slice(0, 30), targetId: body.targetId, reason: body.reason.trim().slice(0, 300), evidence: body.evidence?.slice(0, 1000) } }) }
  @Put('blocks/:userId') @UseGuards(VerifiedGuard) block(@CurrentUser() user: AuthUser, @Param('userId') blockedUserId: string) { if (user.id === blockedUserId) throw new BadRequestException('不能拉黑自己'); return this.prisma.block.upsert({ where: { userId_blockedUserId: { userId: user.id, blockedUserId } }, create: { userId: user.id, blockedUserId }, update: {} }) }
  @Delete('blocks/:userId') unblock(@CurrentUser() user: AuthUser, @Param('userId') blockedUserId: string) { return this.prisma.block.deleteMany({ where: { userId: user.id, blockedUserId } }).then(() => ({ ok: true })) }
}
