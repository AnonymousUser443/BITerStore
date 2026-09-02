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
