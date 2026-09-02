import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { AdminGuard, AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'

const userStatuses = ['ACTIVE', 'MUTED', 'BANNED', 'DELETED'] as const
const roles = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const
const campusStatuses = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'EXPIRED', 'REVOKED'] as const
const listingStatuses = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'BLOCKED'] as const
const listingReviewStates = ['PENDING', 'REVIEWED', 'ALL'] as const
const reportStatuses = ['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED'] as const
const actionsByTarget = {
  USER: ['ACTIVE', 'MUTED', 'BANNED', 'REVOKE_SESSIONS', 'ROLE_USER', 'ROLE_MODERATOR', 'ROLE_ADMIN'],
  LISTING: ['ACTIVE', 'OFF_SHELF', 'BLOCKED', 'IGNORE'],
  REPORT: ['PROCESSING', 'RESOLVED', 'REJECTED']
} as const
const roleRank: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 }
const userStatusTransitions: Record<string, readonly string[]> = {
  ACTIVE: ['MUTED', 'BANNED'], MUTED: ['ACTIVE', 'BANNED'], BANNED: ['ACTIVE'], DELETED: []
}
const listingActionSources: Record<string, readonly string[]> = {
  ACTIVE: ['BLOCKED', 'OFF_SHELF', 'PENDING_REVIEW'],
  OFF_SHELF: ['ACTIVE', 'RESERVED', 'PENDING_REVIEW'],
  BLOCKED: ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'PENDING_REVIEW'],
  IGNORE: ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'PENDING_REVIEW']
}
const reportStatusTransitions: Record<string, readonly string[]> = {
  OPEN: ['PROCESSING', 'RESOLVED', 'REJECTED'], PROCESSING: ['RESOLVED', 'REJECTED'], RESOLVED: [], REJECTED: []
}

type TargetType = keyof typeof actionsByTarget
type ActionBody = { targetType: TargetType; targetId: string; action: string; reason: string; requestId?: string }

function pageOptions(pageRaw?: string, pageSizeRaw?: string) {
  const page = Math.max(1, Number.parseInt(pageRaw || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(pageSizeRaw || '20', 10) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

function requireValue<T extends readonly string[]>(value: string | undefined, values: T, label: string) {
  if (value && !values.includes(value)) throw new BadRequestException(`${label}筛选值无效`)
  return value as T[number] | undefined
}

function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('metrics')
  async metrics() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [users, activeUsers, newUsers, listings, activeListings, newListings, sold, openReports] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.listing.count({ where: { deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.listing.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'SOLD', deletedAt: null } }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'PROCESSING'] } } })
    ])
    return { users, activeUsers, newUsers, listings, activeListings, newListings, sold, openReports, generatedAt: new Date().toISOString() }
  }

  @Get('users')
  async users(
    @Query('q') qRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('role') roleRaw?: string,
    @Query('campusStatus') campusStatusRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string
  ) {
    const q = qRaw?.trim().slice(0, 80)
    const status = requireValue(statusRaw, userStatuses, '用户状态')
    const role = requireValue(roleRaw, roles, '角色')
    const campusStatus = requireValue(campusStatusRaw, campusStatuses, '认证状态')
    const { page, pageSize, skip } = pageOptions(pageRaw, pageSizeRaw)
    const where = {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(campusStatus ? { campusStatus } : {}),
      ...(q ? { OR: [
        { nickname: { contains: q, mode: 'insensitive' as const } },
        { studentNumber: { contains: q, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true, nickname: true, avatarUrl: true, campus: true, role: true, status: true,
          campusStatus: true, adminTotpEnabled: true, createdAt: true, updatedAt: true,
          _count: { select: { listings: true, reports: true } }
        }
      }),
      this.prisma.user.count({ where })
    ])
    return pageResult(items, total, page, pageSize)
  }

  @Get('listings')
  async listings(
    @Query('q') qRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('reviewState') reviewStateRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string
  ) {
    const q = qRaw?.trim().slice(0, 80)
    const status = requireValue(statusRaw, listingStatuses, '商品状态')
    const reviewState = requireValue(reviewStateRaw, listingReviewStates, '处置状态') || 'PENDING'
    const { page, pageSize, skip } = pageOptions(pageRaw, pageSizeRaw)
    const decisions = await this.prisma.moderationAction.findMany({
      where: { targetType: 'LISTING' },
      select: { targetId: true, action: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })
    const latestAction = new Map<string, string>()
    for (const decision of decisions) if (!latestAction.has(decision.targetId)) latestAction.set(decision.targetId, decision.action)
    const latestDecision = new Map([...latestAction].filter(([, action]) => ['IGNORE', 'BLOCKED'].includes(action)))
    const reviewedIds = [...latestDecision.keys()]
    const filters: Prisma.ListingWhereInput[] = [{ deletedAt: null }]
    if (status) filters.push({ status })
    if (q) filters.push({ OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { author: { contains: q, mode: 'insensitive' as const } },
        { isbn: { contains: q, mode: 'insensitive' as const } },
        { seller: { nickname: { contains: q, mode: 'insensitive' as const } } }
    ] })
    if (reviewState === 'PENDING') filters.push({ status: { not: 'BLOCKED' }, id: { notIn: reviewedIds } })
    if (reviewState === 'REVIEWED') filters.push({ OR: [{ status: 'BLOCKED' }, { id: { in: reviewedIds } }] })
    const where: Prisma.ListingWhereInput = { AND: filters }
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          seller: { select: { id: true, nickname: true, status: true } },
          images: { select: { id: true, role: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
          _count: { select: { favorites: true, conversations: true } }
        }
      }),
      this.prisma.listing.count({ where })
    ])
    return pageResult(items.map((item) => ({
      ...item,
      moderationDecision: latestDecision.get(item.id) || (item.status === 'BLOCKED' ? 'BLOCKED' : null)
    })), total, page, pageSize)
  }

  @Get('reports')
  async reports(
    @Query('q') qRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string
  ) {
    const q = qRaw?.trim().slice(0, 80)
    const status = requireValue(statusRaw, reportStatuses, '举报状态')
    const { page, pageSize, skip } = pageOptions(pageRaw, pageSizeRaw)
    const where = {
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { reason: { contains: q, mode: 'insensitive' as const } },
        { targetId: { contains: q, mode: 'insensitive' as const } },
        { reporter: { nickname: { contains: q, mode: 'insensitive' as const } } }
      ] } : {})
    }
    const [records, total] = await Promise.all([
      this.prisma.report.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: pageSize,
        include: { reporter: { select: { id: true, nickname: true } } }
      }),
      this.prisma.report.count({ where })
    ])
    const listingIds = records.filter((item) => item.targetType === 'LISTING').map((item) => item.targetId)
    const userIds = records.filter((item) => item.targetType === 'USER').map((item) => item.targetId)
    const [listings, users] = await Promise.all([
      listingIds.length ? this.prisma.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true, status: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, status: true } }) : []
    ])
    const listingTargets = new Map(listings.map((item) => [item.id, { label: item.title, status: item.status }]))
    const userTargets = new Map(users.map((item) => [item.id, { label: item.nickname, status: item.status }]))
    const items = records.map((item) => ({
      ...item,
      target: item.targetType === 'LISTING'
        ? listingTargets.get(item.targetId) || null
        : item.targetType === 'USER' ? userTargets.get(item.targetId) || null : null
    }))
    return pageResult(items, total, page, pageSize)
  }

  @Get('audit-logs')
  async audit(
    @Query('q') qRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string
  ) {
    const q = qRaw?.trim().slice(0, 80)
    const { page, pageSize, skip } = pageOptions(pageRaw, pageSizeRaw)
    const where = q ? { OR: [
      { action: { contains: q, mode: 'insensitive' as const } },
      { resourceType: { contains: q, mode: 'insensitive' as const } },
      { resourceId: { contains: q, mode: 'insensitive' as const } },
      { actor: { nickname: { contains: q, mode: 'insensitive' as const } } }
    ] } : {}
    const [records, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: pageSize,
        include: { actor: { select: { id: true, nickname: true, role: true } } }
      }),
      this.prisma.auditLog.count({ where })
    ])
    const items = records.map((item) => ({ ...item, id: item.id.toString() }))
    return pageResult(items, total, page, pageSize)
  }

  @Post('moderation-actions')
  async action(@CurrentUser() actor: AuthUser, @Body() body: ActionBody) {
    if (!body || !Object.hasOwn(actionsByTarget, body.targetType)) throw new BadRequestException('处置对象类型无效')
    if (!body.targetId?.trim()) throw new BadRequestException('处置对象不能为空')
    if (!(actionsByTarget[body.targetType] as readonly string[]).includes(body.action)) throw new BadRequestException('该对象不支持此处置动作')
    const reason = body.reason?.trim()
    if (!reason || reason.length < 3 || reason.length > 300) throw new BadRequestException('处置原因应为 3–300 个字符')
    const requestId = body.requestId?.trim() || randomRequestId()
    if (requestId.length > 100) throw new BadRequestException('请求标识过长')

    const actorRecord = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true, status: true } })
    if (!actorRecord || actorRecord.status !== 'ACTIVE' || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(actorRecord.role)) throw new ForbiddenException('管理员账号当前不可用')

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.auditLog.findFirst({
        where: { requestId }, select: { actorId: true, action: true, resourceType: true, resourceId: true }
      })
      if (existing) {
        if (existing.actorId === actor.id && existing.action === body.action && existing.resourceType === body.targetType && existing.resourceId === body.targetId) {
          return { ok: true, repeated: true }
        }
        throw new ConflictException('请求标识已用于其他处置操作')
      }

      if (body.targetType === 'USER') {
        const target = await tx.user.findUnique({
          where: { id: body.targetId }, select: { id: true, role: true, status: true, campusStatus: true }
        })
        if (!target) throw new NotFoundException('用户不存在')
        if (target.id === actor.id) throw new ForbiddenException('不能对当前管理员自己执行该操作')
        if (roleRank[actorRecord.role] <= roleRank[target.role]) throw new ForbiddenException('不能管理同级或更高权限账号')
        if (body.action.startsWith('ROLE_')) {
          if (actorRecord.role !== 'SUPER_ADMIN') throw new ForbiddenException('只有超级管理员可以调整后台角色')
          const nextRole = body.action.slice(5) as 'USER' | 'MODERATOR' | 'ADMIN'
          if (nextRole !== 'USER' && (target.status !== 'ACTIVE' || target.campusStatus !== 'VERIFIED')) throw new BadRequestException('只能向状态正常且已认证的用户授予后台角色')
          await tx.user.update({ where: { id: target.id }, data: { role: nextRole, adminTotpEnabled: nextRole === 'USER' ? false : undefined } })
        } else if (body.action === 'REVOKE_SESSIONS') {
          if (target.status === 'DELETED') throw new BadRequestException('已注销账号不可操作')
          await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } })
        } else {
          if (!userStatusTransitions[target.status]?.includes(body.action)) throw new BadRequestException('当前账号状态不支持此操作')
          await tx.user.update({ where: { id: target.id }, data: { status: body.action as 'ACTIVE' | 'MUTED' | 'BANNED' } })
          if (body.action === 'BANNED') await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } })
        }
      }

      if (body.targetType === 'LISTING') {
        const target = await tx.listing.findUnique({ where: { id: body.targetId }, select: { id: true, status: true, deletedAt: true } })
        if (!target) throw new NotFoundException('商品不存在')
        if (target.deletedAt) throw new BadRequestException('当前商品状态不支持此操作')
        if (body.action === 'IGNORE') {
          if (!listingActionSources.IGNORE.includes(target.status)) throw new BadRequestException('当前商品状态不支持忽略')
        } else {
          if (!listingActionSources[body.action]?.includes(target.status)) throw new BadRequestException('当前商品状态不支持此操作')
          await tx.listing.update({ where: { id: target.id }, data: { status: body.action as 'ACTIVE' | 'OFF_SHELF' | 'BLOCKED', version: { increment: 1 } } })
        }
      }

      if (body.targetType === 'REPORT') {
        const target = await tx.report.findUnique({ where: { id: body.targetId }, select: { id: true, status: true } })
        if (!target) throw new NotFoundException('举报工单不存在')
        if (!reportStatusTransitions[target.status]?.includes(body.action)) throw new BadRequestException('当前工单状态不支持此操作')
        await tx.report.update({
          where: { id: target.id },
          data: { status: body.action as 'PROCESSING' | 'RESOLVED' | 'REJECTED', resolution: reason, assigneeId: actor.id }
        })
      }

      await tx.moderationAction.create({ data: { operatorId: actor.id, targetType: body.targetType, targetId: body.targetId, action: body.action, reason } })
      await tx.auditLog.create({ data: { actorId: actor.id, action: body.action, resourceType: body.targetType, resourceId: body.targetId, requestId, metadata: { reason } } })
      return { ok: true, repeated: false }
    })
  }
}

const randomRequestId = () => `admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
