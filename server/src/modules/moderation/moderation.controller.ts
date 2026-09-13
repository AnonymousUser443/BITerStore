import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { assertNotMuted, AuthGuard, CurrentUser, NotMutedGuard, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'

const reportTargetTypes = ['LISTING', 'USER', 'MESSAGE'] as const
type ReportTargetType = typeof reportTargetTypes[number]
const REPORT_WINDOW_SECONDS = 60 * 60
const REPORT_USER_LIMIT = 10
const REPORT_TARGET_LIMIT = 50
const REPORT_IP_LIMIT = 30

type ReportBody = {
  targetType?: string
  targetId?: string
  reason?: string
  evidence?: string
}

@Controller()
@UseGuards(AuthGuard)
export class ModerationController {
  constructor(private readonly prisma: PrismaService, private readonly redis?: RedisService) {}

  @Get('notifications')
  listNotifications(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 })
  }

  @Post('reports')
  @UseGuards(VerifiedGuard)
  async report(@CurrentUser() user: AuthUser, @Body() body: ReportBody, @Req() request?: FastifyRequest) {
    assertNotMuted(user)
    const targetType = this.normalizeTargetType(body?.targetType)
    const targetId = this.normalizeTargetId(body?.targetId)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const evidence = typeof body?.evidence === 'string' ? body.evidence.trim() : undefined
    if (!targetType) throw new BadRequestException('举报对象类型无效，仅支持商品、用户或消息')
    if (!targetId) throw new BadRequestException('举报对象不能为空或包含非法字符')
    if (reason.length < 2 || reason.length > 300) throw new BadRequestException('举报原因应为 2–300 个字符')
    if (evidence && evidence.length > 1000) throw new BadRequestException('举报证据不能超过 1000 个字符')

    // The unique database constraint is the final race-safe dedupe barrier;
    // this read avoids spending quota on ordinary repeated taps.
    const existing = await this.prisma.report.findFirst({
      where: { reporterId: user.id, targetType, targetId },
      orderBy: { createdAt: 'asc' }
    })
    if (existing) return existing

    await this.assertTargetExists(targetType, targetId, user.id)

    await this.enforceReportQuota(user.id, targetType, targetId, request)
    try {
      const created = await this.prisma.report.create({
        data: {
          reporterId: user.id,
          targetType,
          targetId,
          reason,
          ...(evidence ? { evidence } : {})
        }
      })
      return created
    } catch (cause) {
      // A concurrent request can pass the read above. PostgreSQL's unique
      // index makes that request idempotent instead of creating two tickets.
      if ((cause as { code?: string }).code === 'P2002') {
        const concurrent = await this.prisma.report.findFirst({ where: { reporterId: user.id, targetType, targetId }, orderBy: { createdAt: 'asc' } })
        if (concurrent) return concurrent
      }
      throw cause
    }
  }

  @Put('blocks/:userId')
  @UseGuards(VerifiedGuard)
  async block(@CurrentUser() user: AuthUser, @Param('userId') blockedUserId: string) {
    assertNotMuted(user)
    const targetId = this.normalizeTargetId(blockedUserId)
    if (!targetId) throw new BadRequestException('用户标识无效')
    if (user.id === targetId) throw new BadRequestException('不能拉黑自己')
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, status: true } })
    if (!target || target.status === 'DELETED') throw new NotFoundException('用户不存在')
    return this.prisma.block.upsert({ where: { userId_blockedUserId: { userId: user.id, blockedUserId: targetId } }, create: { userId: user.id, blockedUserId: targetId }, update: {} })
  }

  @Delete('blocks/:userId')
  @UseGuards(NotMutedGuard)
  unblock(@CurrentUser() user: AuthUser, @Param('userId') blockedUserId: string) {
    assertNotMuted(user)
    const targetId = this.normalizeTargetId(blockedUserId)
    if (!targetId) throw new BadRequestException('用户标识无效')
    return this.prisma.block.deleteMany({ where: { userId: user.id, blockedUserId: targetId } }).then(() => ({ ok: true }))
  }

  private normalizeTargetType(value: unknown): ReportTargetType | undefined {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
    return (reportTargetTypes as readonly string[]).includes(normalized) ? normalized as ReportTargetType : undefined
  }

  private normalizeTargetId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim()
    // IDs are opaque UUIDs in production, but retaining a conservative
    // printable alphabet keeps migrations/test fixtures with non-UUID IDs
    // compatible while rejecting path/control-character injection.
    if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9_-]+$/.test(normalized)) return undefined
    return normalized
  }

  private async assertTargetExists(type: ReportTargetType, id: string, reporterId: string) {
    if (type === 'LISTING') {
      const listingModel = this.prisma.listing as typeof this.prisma.listing & { findUnique?: (args: unknown) => Promise<{ id: string; sellerId: string; status: string; deletedAt?: Date | null } | null> }
      const target = typeof listingModel.findFirst === 'function'
        ? await listingModel.findFirst({ where: { id, deletedAt: null }, select: { id: true, sellerId: true, status: true, deletedAt: true } })
        : await listingModel.findUnique?.({ where: { id }, select: { id: true, sellerId: true, status: true, deletedAt: true } })
      if (!target) throw new NotFoundException('商品不存在或已删除')
      if (target.deletedAt) throw new NotFoundException('商品不存在或已删除')
      if (target.sellerId === reporterId) throw new BadRequestException('不能举报自己的商品')
      return target
    }
    if (type === 'MESSAGE') {
      let messageId: bigint
      try {
        messageId = BigInt(id)
      } catch {
        throw new BadRequestException('消息标识无效')
      }
      const messageModel = this.prisma.message as typeof this.prisma.message | undefined
      if (!messageModel || typeof messageModel.findUnique !== 'function') throw new NotFoundException('消息不存在')
      const target = await messageModel.findUnique({ where: { id: messageId }, select: { id: true, senderId: true } })
      if (!target) throw new NotFoundException('消息不存在')
      if (target.senderId === reporterId) throw new BadRequestException('不能举报自己的消息')
      return target
    }
    const userModel = this.prisma.user as typeof this.prisma.user & { findFirst?: (args: unknown) => Promise<{ id: string; status: string } | null> }
    const target = typeof userModel.findUnique === 'function'
      ? await userModel.findUnique({ where: { id }, select: { id: true, status: true } })
      : await userModel.findFirst?.({ where: { id }, select: { id: true, status: true } })
    if (!target || target.status === 'DELETED') throw new NotFoundException('用户不存在')
    if (target.id === reporterId) throw new BadRequestException('不能举报自己')
    return target
  }

  private async enforceReportQuota(userId: string, targetType: ReportTargetType, targetId: string, request?: FastifyRequest) {
    const ip = this.requestIp(request)
    if (this.redis) {
      try {
        await this.redis.ensureConnected()
        const digest = createHash('sha256').update(`${targetType}:${targetId}`).digest('hex')
        const result = await this.redis.client.eval(
          "local user = redis.call('INCR', KEYS[1]); local target = redis.call('INCR', KEYS[2]); local ip = redis.call('INCR', KEYS[3]); if user == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; if target == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]); end; if ip == 1 then redis.call('EXPIRE', KEYS[3], ARGV[1]); end; return user .. ':' .. target .. ':' .. ip",
          3,
          `reports:user:${userId}`,
          `reports:target:${digest}`,
          `reports:ip:${createHash('sha256').update(ip).digest('hex')}`,
          REPORT_WINDOW_SECONDS
        )
        const [userCount, targetCount, ipCount] = String(result).split(':').map(Number)
        if (![userCount, targetCount, ipCount].every(Number.isFinite)) throw new Error('invalid report quota response')
        if (userCount > REPORT_USER_LIMIT || targetCount > REPORT_TARGET_LIMIT || ipCount > REPORT_IP_LIMIT) throw new HttpException('举报提交过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
        return
      } catch (cause) {
        if (cause instanceof HttpException && cause.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw cause
        if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('举报频率服务暂不可用，请稍后再试')
        // Local tests/dev can continue without a running Redis instance.
      }
    }

    // Database fallback keeps the quota effective during a Redis outage in
    // non-production environments and provides a deterministic safety net.
    const count = this.prisma.report.count
    if (typeof count !== 'function') return
    const since = new Date(Date.now() - REPORT_WINDOW_SECONDS * 1000)
    const [userCount, targetCount] = await Promise.all([
      count.call(this.prisma.report, { where: { reporterId: userId, createdAt: { gte: since } } }),
      count.call(this.prisma.report, { where: { targetType, targetId, createdAt: { gte: since } } })
    ])
    if (Number(userCount) >= REPORT_USER_LIMIT || Number(targetCount) >= REPORT_TARGET_LIMIT) throw new HttpException('举报提交过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
  }

  private requestIp(request?: FastifyRequest) {
    const forwarded = request?.headers?.['x-forwarded-for']
    return String(request?.ip || (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown')).split(',')[0].trim().slice(0, 80) || 'unknown'
  }
}
