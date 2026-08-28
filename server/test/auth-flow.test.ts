import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../src/modules/auth/auth.service.js'

describe('student-first authentication', () => {
  const originalEnv = { ...process.env }
  let prisma: any
  let identity: any
  let service: AuthService

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.ALLOW_DEV_AUTH = 'true'
    process.env.WECHAT_MINI_APP_ID = 'test-mini-app'
    process.env.ACCESS_TOKEN_SECRET = 'test-secret-with-enough-entropy'
    prisma = {
      wechatAccount: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      session: { create: vi.fn(), updateMany: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn()
    }
    identity = { loginOrCreate: vi.fn() }
    service = new AuthService(prisma, {} as any, identity)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('creates a session from the one-time campus credential', async () => {
    identity.loginOrCreate.mockResolvedValue({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' })
    const result = await service.campus('registration-jwt', 'weapp')
    expect(identity.loginOrCreate).toHaveBeenCalledWith('registration-jwt')
    expect(prisma.session.create).toHaveBeenCalledOnce()
    expect(result.user).toMatchObject({ id: 'student-1', campusStatus: 'VERIFIED' })
  })

  it('does not create an account when an unbound WeChat identity logs in', async () => {
    prisma.wechatAccount.findUnique.mockResolvedValue(null)
    prisma.wechatAccount.findFirst.mockResolvedValue(null)
    await expect(service.miniProgram('dev-unbound')).rejects.toThrow('该微信尚未绑定')
    expect(prisma.wechatAccount.create).not.toHaveBeenCalled()
    expect(prisma.session.create).not.toHaveBeenCalled()
  })

  it('binds WeChat to the currently authenticated student account', async () => {
    prisma.wechatAccount.findUnique.mockResolvedValue(null)
    prisma.wechatAccount.findFirst.mockResolvedValue(null)
    prisma.wechatAccount.create.mockResolvedValue({ id: 'wechat-1' })
    await expect(service.bindMiniProgram('student-1', 'dev-bind')).resolves.toEqual({ bound: true })
    expect(prisma.wechatAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'student-1', appType: 'MINI_PROGRAM', openid: 'dev-bind' })
    })
  })

  it('refuses to move a WeChat identity from another student account', async () => {
    prisma.wechatAccount.findUnique.mockResolvedValue({ id: 'wechat-1', userId: 'student-2', unionid: 'dev-bound', user: { campusStatus: 'VERIFIED', campusIdentities: [{ id: 'campus-2' }] } })
    await expect(service.bindMiniProgram('student-1', 'dev-bound')).rejects.toThrow('该微信已绑定其他账号')
    expect(prisma.wechatAccount.update).not.toHaveBeenCalled()
  })

  it('moves a legacy unverified WeChat-only identity when the student binds it', async () => {
    prisma.wechatAccount.findUnique.mockResolvedValue({
      id: 'wechat-legacy', userId: 'legacy-user', unionid: 'dev-legacy',
      user: { campusStatus: 'UNVERIFIED', campusIdentities: [] }
    })
    prisma.$transaction.mockResolvedValue([])
    await expect(service.bindMiniProgram('student-1', 'dev-legacy')).resolves.toEqual({ bound: true })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(prisma.wechatAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wechat-legacy' }, data: expect.objectContaining({ userId: 'student-1' })
    }))
  })
})
