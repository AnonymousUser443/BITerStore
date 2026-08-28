import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AdminGuard, AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
@Controller('admin') @UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('metrics') async metrics() { const [users, listings, sold, reports] = await Promise.all([this.prisma.user.count(), this.prisma.listing.count({ where: { deletedAt: null } }), this.prisma.listing.count({ where: { status: 'SOLD' } }), this.prisma.report.count({ where: { status: { in: ['OPEN', 'PROCESSING'] } } })]); return { users, listings, sold, openReports: reports } }
  @Get('users') users(@Query('q') q?: string) { return this.prisma.user.findMany({ where: q ? { nickname: { contains: q, mode: 'insensitive' } } : {}, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, nickname: true, avatarUrl: true, campus: true, role: true, status: true, campusStatus: true, createdAt: true } }) }
  @Get('listings') listings(@Query('status') status?: any) { return this.prisma.listing.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { seller: { select: { nickname: true } }, images: true } }) }
  @Get('reports') reports(@Query('status') status?: any) { return this.prisma.report.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { reporter: { select: { nickname: true } } } }) }
  @Get('audit-logs') audit() { return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) }
  @Post('moderation-actions') async action(@CurrentUser() actor: AuthUser, @Body() body: { targetType: 'USER' | 'LISTING' | 'REPORT'; targetId: string; action: string; reason: string; requestId?: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('处置原因不能为空')
    await this.prisma.$transaction(async (tx) => {
      if (body.targetType === 'USER' && ['BANNED', 'MUTED', 'ACTIVE'].includes(body.action)) {
        await tx.user.update({ where: { id: body.targetId }, data: { status: body.action as any } })
        if (body.action === 'BANNED') await tx.session.updateMany({ where: { userId: body.targetId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      if (body.targetType === 'LISTING' && ['BLOCKED', 'OFF_SHELF', 'ACTIVE'].includes(body.action)) await tx.listing.update({ where: { id: body.targetId }, data: { status: body.action as any, version: { increment: 1 } } })
      if (body.targetType === 'REPORT' && ['PROCESSING', 'RESOLVED', 'REJECTED'].includes(body.action)) await tx.report.update({ where: { id: body.targetId }, data: { status: body.action as any, resolution: body.reason, assigneeId: actor.id } })
      await tx.moderationAction.create({ data: { operatorId: actor.id, targetType: body.targetType, targetId: body.targetId, action: body.action, reason: body.reason.trim() } })
      await tx.auditLog.create({ data: { actorId: actor.id, action: body.action, resourceType: body.targetType, resourceId: body.targetId, requestId: body.requestId || randomRequestId(), metadata: { reason: body.reason } } })
    })
    return { ok: true }
  }
}
const randomRequestId = () => `admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
