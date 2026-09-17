import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { UnauthorizedException } from '@nestjs/common'
import { IdentityService } from '../src/modules/identity/identity.service.js'

describe('BIT-Login registration JWT', () => {
  const originalEnv = { ...process.env }
  let privateKey: CryptoKey
  let prisma: any
  let tx: any
  let service: IdentityService

  beforeEach(async () => {
    const keys = await generateKeyPair('EdDSA')
    privateKey = keys.privateKey
    process.env.NODE_ENV = 'test'
    process.env.ALLOW_DEV_AUTH = 'false'
    process.env.BIT_LOGIN_PUBLIC_KEY_PEM = (await exportSPKI(keys.publicKey)).replace(/\n/g, '\\n')
    process.env.BIT_LOGIN_ISSUER = 'bit-login'
    process.env.BIT_LOGIN_AUDIENCE = 'biterstore'
    process.env.CAMPUS_IDENTITY_HASH_KEY = 'test-campus-identity-hash-secret-long-enough'
    tx = {
      campusIdentity: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn(), upsert: vi.fn() },
      user: {
        create: vi.fn().mockResolvedValue({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' }),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn()
      },
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
    expect(tx.user.create).toHaveBeenCalledWith({ data: { studentNumber: '1120230000', nickname: 'BITer1120230000', campusStatus: 'VERIFIED' } })
  })

  it('upgrades only a legacy default nickname on the next campus login', async () => {
    tx.campusIdentity.findUnique.mockResolvedValue({ userId: 'student-1' })
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'student-1', nickname: '北理同学' })
    tx.user.update.mockResolvedValue({ id: 'student-1', nickname: 'BITer1120230000', campusStatus: 'VERIFIED' })

    await service.loginOrCreate(await token())

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { campusStatus: 'VERIFIED', studentNumber: '1120230000', nickname: 'BITer1120230000' }
    }))
  })

  it('restores a recently deleted account with public fields reset', async () => {
    tx.campusIdentity.findUnique.mockResolvedValue({ userId: 'student-1' })
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'student-1', nickname: '已注销用户', status: 'DELETED', deletedAt: new Date(Date.now() - 86_400_000) })
    tx.user.update.mockResolvedValue({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' })

    await service.loginOrCreate(await token())

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE', deletedAt: null, studentNumber: '1120230000', nickname: 'BITer1120230000', role: 'USER' })
    }))
    expect(tx.campusIdentity.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ userId: 'student-1', revokedAt: null }) }))
  })

  it('upgrades a legacy unsalted identity hash when the student logs in', async () => {
    tx.campusIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity-1', userId: 'student-1' })
    tx.campusIdentity.update.mockResolvedValue({ id: 'identity-1', userId: 'student-1' })
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'student-1', nickname: '自定义昵称', status: 'ACTIVE' })
    tx.user.update.mockResolvedValue({ id: 'student-1', nickname: '自定义昵称', status: 'ACTIVE' })

    await service.loginOrCreate(await token())

    expect(tx.campusIdentity.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'identity-1' }, data: { externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/) }
    }))
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
