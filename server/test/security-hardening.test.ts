import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AdminGuard, AuthGuard, VerifiedGuard, signAccessToken } from '../src/common/auth.js'
import { assertHttpsConfiguration, assertSecurityConfiguration, sanitizedRequestUrl, securityHeadersForRequest, trustedProxySetting } from '../src/common/security-config.js'
import { AuthService } from '../src/modules/auth/auth.service.js'
import { AdminSecurityController } from '../src/modules/admin/admin-security.controller.js'
import { UsersController } from '../src/modules/users/users.controller.js'

const originalEnv = { ...process.env }
const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext

afterEach(() => { process.env = { ...originalEnv } })

describe('security configuration', () => {
  it('fails closed when production signing/encryption secrets are absent or weak', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ACCESS_TOKEN_SECRET
    delete process.env.ADMIN_TOTP_ENCRYPTION_KEY
    delete process.env.CAMPUS_IDENTITY_HASH_KEY
    expect(() => assertSecurityConfiguration()).toThrow('ACCESS_TOKEN_SECRET')
    process.env.ACCESS_TOKEN_SECRET = 'access-production-secret-with-sufficient-entropy'
    expect(() => assertSecurityConfiguration()).toThrow('ADMIN_TOTP_ENCRYPTION_KEY')
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'b'.repeat(31)
    expect(() => assertSecurityConfiguration()).toThrow('ADMIN_TOTP_ENCRYPTION_KEY')
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'totp-production-secret-with-sufficient-entropy'
    expect(() => assertSecurityConfiguration()).toThrow('CAMPUS_IDENTITY_HASH_KEY')
    process.env.CAMPUS_IDENTITY_HASH_KEY = 'campus-hash-production-secret-with-entropy'
    expect(() => assertSecurityConfiguration()).not.toThrow()
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = process.env.ACCESS_TOKEN_SECRET
    expect(() => assertSecurityConfiguration()).toThrow('must be different')
  })

  it('requires explicitly configured production origins to use HTTPS', () => {
    process.env.NODE_ENV = 'production'
    process.env.PUBLIC_API_URL = 'http://api.example.test'
    expect(() => assertHttpsConfiguration()).toThrow('HTTPS')
    process.env.PUBLIC_API_URL = 'https://api.example.test'
    process.env.H5_ORIGIN = 'https://store.example.test,https://admin.example.test'
    expect(() => assertHttpsConfiguration()).not.toThrow()
  })

  it('emits HSTS only for secure production requests and uses an API CSP', () => {
    process.env.NODE_ENV = 'production'
    expect(securityHeadersForRequest({ url: '/api/v1/listings', protocol: 'https' })).toMatchObject({
      'Strict-Transport-Security': expect.stringContaining('max-age='),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': expect.stringContaining("default-src 'none'")
    })
    expect(securityHeadersForRequest({ url: '/api/v1/listings', protocol: 'http' })).not.toHaveProperty('Strict-Transport-Security')
  })

  it('marks authentication and account responses as non-cacheable', () => {
    expect(securityHeadersForRequest({ url: '/api/v1/auth/wechat/web/status?state=secret' })).toMatchObject({ 'Cache-Control': 'no-store' })
    expect(securityHeadersForRequest({ url: '/api/v1/me' })).toMatchObject({ 'Cache-Control': 'no-store' })
    expect(securityHeadersForRequest({ url: '/api/v1/listings?limit=20' })).not.toHaveProperty('Cache-Control')
  })

  it('trusts a bounded proxy chain and strips query values from request logs', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.TRUSTED_PROXY_CIDRS
    delete process.env.TRUST_PROXY_HOPS
    const defaultTrust = trustedProxySetting()
    expect(typeof defaultTrust).toBe('function')
    expect((defaultTrust as (address: string, hop: number) => boolean)('127.0.0.1', 0)).toBe(true)
    expect((defaultTrust as (address: string, hop: number) => boolean)('127.0.0.1', 1)).toBe(false)
    process.env.TRUST_PROXY_HOPS = '2'
    const twoHopTrust = trustedProxySetting()
    expect(typeof twoHopTrust).toBe('function')
    expect((twoHopTrust as (address: string, hop: number) => boolean)('127.0.0.1', 1)).toBe(true)
    expect((twoHopTrust as (address: string, hop: number) => boolean)('127.0.0.1', 2)).toBe(false)
    process.env.TRUST_PROXY_HOPS = '99'
    expect(() => trustedProxySetting()).toThrow('TRUST_PROXY_HOPS')
    expect(sanitizedRequestUrl('/api/v1/auth/wechat/web/status?state=sensitive')).toBe('/api/v1/auth/wechat/web/status')
  })
})

describe('database-backed access validation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.ACCESS_TOKEN_SECRET = 'test-secret-with-enough-entropy'
  })

  it('turns an expired campus identity into a non-verified request user', async () => {
    const token = await signAccessToken({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' }, false, 'session-1')
    const request: any = { headers: { authorization: `Bearer ${token}` } }
    const prisma: any = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'student-1', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: false, campusIdentities: [{ expiresAt: new Date(Date.now() - 1000), revokedAt: null }] }) },
      session: { findFirst: vi.fn().mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }) }
    }
    await expect(new AuthGuard(prisma).canActivate(context(request))).resolves.toBe(true)
    expect(request.user.campusStatus).toBe('EXPIRED')
    expect(() => new VerifiedGuard().canActivate(context(request))).toThrow(ForbiddenException)
  })

  it('rejects a revoked session and banned account even when the JWT is otherwise valid', async () => {
    const token = await signAccessToken({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' }, false, 'session-1')
    const request: any = { headers: { authorization: `Bearer ${token}` } }
    const prisma: any = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'student-1', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: false, campusIdentities: [] }) },
      session: { findFirst: vi.fn().mockResolvedValue({ revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }) }
    }
    await expect(new AuthGuard(prisma).canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException)
    prisma.user.findUnique.mockResolvedValue({ id: 'student-1', role: 'USER', status: 'BANNED', campusStatus: 'VERIFIED', adminTotpEnabled: false, campusIdentities: [] })
    await expect(new AuthGuard(prisma).canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('refresh and one-time browser login', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.ACCESS_TOKEN_SECRET = 'test-secret-with-enough-entropy'
  })

  it('rejects a refresh replay when the conditional revoke loses a race', async () => {
    const user = { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' }
    const prisma: any = {
      session: {
        findUnique: vi.fn().mockResolvedValue({ id: 'old-session', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), platform: 'weapp', device: 'phone', user }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn()
      }
    }
    const service = new AuthService(prisma, {} as any, {} as any)
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.session.create).not.toHaveBeenCalled()
  })

  it('revokes an elevated session when logout receives its access token', async () => {
    const prisma: any = { session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }
    const service = new AuthService(prisma, {} as any, {} as any)
    const token = await signAccessToken({ id: 'admin-1', role: 'ADMIN', campusStatus: 'VERIFIED' }, true, 'admin-session')
    await expect(service.logout(undefined, token)).resolves.toEqual({ ok: true })
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin-session', userId: 'admin-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    })
  })

  it('consumes an authenticated web login state exactly once', async () => {
    const value = JSON.stringify({ status: 'AUTHENTICATED', accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: { id: 'student-1' } })
    const redis: any = { ensureConnected: vi.fn(), client: { get: vi.fn().mockResolvedValue(value), getdel: vi.fn().mockResolvedValueOnce(value).mockResolvedValueOnce(null) } }
    const service = new AuthService({} as any, redis, {} as any)
    const state = 'A'.repeat(32)
    await expect(service.webStatus(state)).resolves.toMatchObject({ status: 'AUTHENTICATED', accessToken: 'a' })
    await expect(service.webStatus(state)).rejects.toBeInstanceOf(Error)
    expect(redis.client.getdel).toHaveBeenCalledTimes(2)
  })

  it('stores a scalar pending marker and atomically claims a browser login state', async () => {
    process.env.ALLOW_DEV_AUTH = 'true'
    const setex = vi.fn().mockResolvedValue('OK')
    const redis: any = { ensureConnected: vi.fn(), client: { setex, eval: vi.fn().mockResolvedValue(1) } }
    const prisma: any = {
      wechatAccount: { findUnique: vi.fn().mockResolvedValue({ id: 'wechat-1', unionid: 'dev-openid', user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE', campusIdentities: [] } }) },
      session: { create: vi.fn().mockResolvedValue({ id: 'session-1' }) }
    }
    const service = new AuthService(prisma, redis, {} as any)
    const started = await service.startWebLogin()
    expect(setex).toHaveBeenCalledWith(`web-login:${started.state}`, 300, 'PENDING')
    await expect(service.webCallback('dev-openid', started.state)).resolves.toMatchObject({ status: 'authenticated' })
    expect(redis.client.eval).toHaveBeenCalledWith(expect.stringContaining("value == 'PENDING'"), 1, `web-login:${started.state}`, expect.any(String), 300)
    expect(setex).toHaveBeenLastCalledWith(`web-login:${started.state}`, 60, expect.stringContaining('AUTHENTICATED'))
  })

  it('does not rotate a refresh session after the campus identity expires', async () => {
    const prisma: any = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'old-session', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), platform: 'h5', device: 'desktop',
          user: { id: 'student-1', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', campusIdentities: [{ expiresAt: new Date(Date.now() - 1), revokedAt: null }] }
        }),
        updateMany: vi.fn(), create: vi.fn()
      }
    }
    const service = new AuthService(prisma, {} as any, {} as any)
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.session.updateMany).not.toHaveBeenCalled()
  })
})

describe('administrator TOTP protection and account deletion', () => {
  it('rate-limits TOTP verification by account and source', async () => {
    const prisma: any = { user: { findUnique: vi.fn() } }
    const redis: any = { ensureConnected: vi.fn(), client: { eval: vi.fn().mockResolvedValue(6), del: vi.fn() } }
    const controller = new AdminSecurityController(prisma, redis)
    await expect(controller.verify({ id: 'admin-1', role: 'ADMIN', campusStatus: 'VERIFIED' }, { code: '000000' }, { ip: '192.0.2.1', headers: {} } as any)).rejects.toMatchObject({ status: 429 })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('blocks an administrator whose latest campus identity is expired', async () => {
    const prisma: any = {
      user: { findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: true, campusIdentities: [{ expiresAt: new Date(Date.now() - 1), revokedAt: null }] }) }
    }
    const request: any = { user: { id: 'admin-1', role: 'ADMIN', campusStatus: 'VERIFIED', adminTotp: true } }
    await expect(new AdminGuard(prisma).canActivate(context(request))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('revokes sessions and hides all listings when an account is deleted', async () => {
    const prisma: any = {
      session: { updateMany: vi.fn() },
      listing: { updateMany: vi.fn() },
      wechatAccount: { deleteMany: vi.fn() },
      campusIdentity: { updateMany: vi.fn() },
      favorite: { deleteMany: vi.fn() },
      block: { deleteMany: vi.fn() },
      notification: { deleteMany: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([])
    }
    await expect(new UsersController(prisma).remove({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' })).resolves.toEqual({ ok: true })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { sellerId: 'student-1', deletedAt: null },
      data: { status: 'OFF_SHELF', deletedAt: expect.any(Date), version: { increment: 1 } }
    })
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ studentNumber: null, campusStatus: 'REVOKED', status: 'DELETED' }) }))
  })
})
