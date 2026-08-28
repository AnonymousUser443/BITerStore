import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { UnauthorizedException } from '@nestjs/common'
import { IdentityService } from '../src/modules/identity/identity.service.js'

describe('BIT-Login registration JWT', () => {
  const originalEnv = { ...process.env }
  let privateKey: CryptoKey
  let prisma: any
  let service: IdentityService

  beforeEach(async () => {
    const keys = await generateKeyPair('EdDSA')
    privateKey = keys.privateKey
    process.env.NODE_ENV = 'test'
    process.env.ALLOW_DEV_AUTH = 'false'
    process.env.BIT_LOGIN_PUBLIC_KEY_PEM = (await exportSPKI(keys.publicKey)).replace(/\n/g, '\\n')
    process.env.BIT_LOGIN_ISSUER = 'bit-login'
    process.env.BIT_LOGIN_AUDIENCE = 'biterstore'
    const tx = {
      campusIdentity: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      user: { create: vi.fn().mockResolvedValue({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' }), update: vi.fn() },
      usedAuthToken: { create: vi.fn() }
    }
    prisma = { $transaction: vi.fn((callback) => callback(tx)) }
    service = new IdentityService(prisma)
  })

  afterEach(() => { process.env = { ...originalEnv } })

  async function token(overrides: { audience?: string; issuer?: string; purpose?: string } = {}) {
    return new SignJWT({ purpose: overrides.purpose ?? 'registration' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'registration-1' })
      .setSubject('1120230000')
      .setJti('challenge-1')
      .setIssuer(overrides.issuer ?? 'bit-login')
      .setAudience(overrides.audience ?? 'biterstore')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
  }

  it('accepts a valid one-time registration JWT', async () => {
    await expect(service.loginOrCreate(await token())).resolves.toMatchObject({ id: 'student-1', campusStatus: 'VERIFIED' })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('returns an authentication error for a malformed compact JWT', async () => {
    await expect(service.loginOrCreate('invalid')).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects the wrong audience, issuer, or purpose', async () => {
    await expect(service.loginOrCreate(await token({ audience: 'other-app' }))).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(service.loginOrCreate(await token({ issuer: 'other-issuer' }))).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(service.loginOrCreate(await token({ purpose: 'access' }))).rejects.toThrow('校园认证凭证声明不完整')
  })
})
