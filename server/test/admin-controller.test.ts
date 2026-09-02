import { describe, expect, it, vi } from 'vitest'
import { AdminController } from '../src/modules/admin/admin.controller.js'

const actor = { id: 'admin-1', role: 'ADMIN' as const, status: 'ACTIVE' }
const authUser = { id: actor.id, role: actor.role, campusStatus: 'VERIFIED', adminTotp: true }

function actionPrisma(target: { id: string; role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'; status: string; campusStatus: string } = { id: 'user-1', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED' }) {
  const prisma: any = {
    user: {
      findUnique: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target),
      update: vi.fn().mockResolvedValue(target)
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    listing: { findUnique: vi.fn(), update: vi.fn() },
    report: { findUnique: vi.fn(), update: vi.fn() },
    moderationAction: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }
  }
  prisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) => callback(prisma))
  return prisma
}

describe('administrator moderation actions', () => {
  it('rejects unsupported actions before writing an audit record', async () => {
    const prisma = actionPrisma()
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'SUPER_ADMIN', reason: '非法提权'
    })).rejects.toMatchObject({ status: 400 })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('prevents an administrator from acting on a peer administrator', async () => {
    const prisma = actionPrisma({ id: 'admin-2', role: 'ADMIN', status: 'ACTIVE', campusStatus: 'VERIFIED' })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'admin-2', action: 'BANNED', reason: '测试同级保护'
    })).rejects.toMatchObject({ status: 403 })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('bans a lower-role user, revokes sessions, and records the reason', async () => {
    const prisma = actionPrisma()
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'BANNED', reason: ' 多次发布违规信息 ', requestId: 'admin-request-1'
    })).resolves.toEqual({ ok: true, repeated: false })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { status: 'BANNED' } })
    expect(prisma.session.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ requestId: 'admin-request-1', metadata: { reason: '多次发布违规信息' } }) })
  })

  it('allows an action without a reason and records a fallback audit reason', async () => {
    const prisma = actionPrisma()
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'MUTED'
    })).resolves.toEqual({ ok: true, repeated: false })
    expect(prisma.moderationAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: '管理员未填写原因' })
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { reason: '管理员未填写原因' } })
    })
  })

  it('rejects a reason longer than the audit field limit', async () => {
    const prisma = actionPrisma()
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'MUTED', reason: 'a'.repeat(301)
    })).rejects.toMatchObject({ status: 400 })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns repeated success without applying the same request twice', async () => {
    const prisma = actionPrisma()
    prisma.auditLog.findFirst.mockResolvedValue({ actorId: 'admin-1', action: 'BANNED', resourceType: 'USER', resourceId: 'user-1' })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'BANNED', reason: '重复请求测试', requestId: 'same-request'
    })).resolves.toEqual({ ok: true, repeated: true })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.moderationAction.create).not.toHaveBeenCalled()
  })

  it('rejects reuse of a request identifier for a different action', async () => {
    const prisma = actionPrisma()
    prisma.auditLog.findFirst.mockResolvedValue({ actorId: 'admin-1', action: 'MUTED', resourceType: 'USER', resourceId: 'user-1' })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'BANNED', reason: '请求标识冲突', requestId: 'same-request'
    })).rejects.toMatchObject({ status: 409 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('does not restore a deleted user account', async () => {
    const prisma = actionPrisma({ id: 'user-1', role: 'USER', status: 'DELETED', campusStatus: 'VERIFIED' })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'USER', targetId: 'user-1', action: 'ACTIVE', reason: '不应恢复注销账号'
    })).rejects.toMatchObject({ status: 400 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('does not restore a sold listing to active through a direct API call', async () => {
    const prisma = actionPrisma()
    prisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'SOLD', deletedAt: null })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'LISTING', targetId: 'listing-1', action: 'ACTIVE', reason: '非法状态回退'
    })).rejects.toMatchObject({ status: 400 })
    expect(prisma.listing.update).not.toHaveBeenCalled()
  })

  it('persists an ignored listing decision without changing its sale status', async () => {
    const prisma = actionPrisma()
    prisma.listing.findUnique.mockResolvedValue({ id: 'listing-1', status: 'SOLD', deletedAt: null })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'LISTING', targetId: 'listing-1', action: 'IGNORE', reason: '管理员确认无需处置'
    })).resolves.toEqual({ ok: true, repeated: false })
    expect(prisma.listing.update).not.toHaveBeenCalled()
    expect(prisma.moderationAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetType: 'LISTING', targetId: 'listing-1', action: 'IGNORE' })
    })
  })

  it('does not reopen a terminal report through a direct API call', async () => {
    const prisma = actionPrisma()
    prisma.report.findUnique.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' })
    const controller = new AdminController(prisma)
    await expect(controller.action(authUser, {
      targetType: 'REPORT', targetId: 'report-1', action: 'PROCESSING', reason: '非法重开工单'
    })).rejects.toMatchObject({ status: 400 })
    expect(prisma.report.update).not.toHaveBeenCalled()
  })
})

describe('administrator listing review queue', () => {
  it('excludes persisted decisions from the default pending queue', async () => {
    const prisma: any = {
      moderationAction: { findMany: vi.fn().mockResolvedValue([{ targetId: 'ignored-1', action: 'IGNORE', createdAt: new Date() }]) },
      listing: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }
    }
    await new AdminController(prisma).listings()
    expect(prisma.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ status: { not: 'BLOCKED' }, id: { notIn: ['ignored-1'] } }]) }
    }))
  })
})

describe('administrator user activity summary', () => {
  it('returns active listing counts, the latest login, and distinct recent devices', async () => {
    const latest = new Date('2026-09-02T05:00:00.000Z')
    const older = new Date('2026-09-01T05:00:00.000Z')
    const prisma: any = {
      user: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'user-1', studentNumber: '1120241261', nickname: '测试用户', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED',
          createdAt: older, updatedAt: latest, _count: { listings: 2, reports: 1 },
          sessions: [
            { platform: 'h5', device: 'desktop', createdAt: latest, expiresAt: new Date('2099-01-01'), revokedAt: null },
            { platform: 'h5', device: 'desktop', createdAt: older, expiresAt: new Date('2026-01-01'), revokedAt: older },
            { platform: 'weapp', device: 'phone', createdAt: older, expiresAt: new Date('2099-01-01'), revokedAt: null }
          ]
        }]),
        count: vi.fn().mockResolvedValue(1)
      }
    }
    const result = await new AdminController(prisma).users()
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        studentNumber: true,
        sessions: expect.objectContaining({ take: 12, orderBy: { createdAt: 'desc' } }),
        _count: { select: { listings: { where: { status: 'ACTIVE', deletedAt: null } }, reports: true } }
      })
    }))
    expect(result.items[0]).toMatchObject({
      studentNumber: '1120241261',
      lastSeenAt: latest,
      _count: { listings: 2, reports: 1 },
      recentAccess: [
        { platform: 'h5', device: 'desktop', lastSeenAt: latest, active: true },
        { platform: 'weapp', device: 'phone', lastSeenAt: older, active: true }
      ]
    })
    expect(result.items[0]).not.toHaveProperty('sessions')
  })
})

describe('administrator audit log serialization', () => {
  it('serializes bigint audit identifiers for JSON responses', async () => {
    const prisma: any = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([{ id: 42n, action: 'BLOCKED', createdAt: new Date(), actor: null }]),
        count: vi.fn().mockResolvedValue(1)
      }
    }
    const result = await new AdminController(prisma).audit()
    expect(result.items[0].id).toBe('42')
  })
})
