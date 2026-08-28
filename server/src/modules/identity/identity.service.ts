import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { importSPKI, jwtVerify } from 'jose'
import { PrismaService } from '../../infra/prisma.service.js'

type CampusClaims = {
  provider: string
  subjectHash: string
  jti: string
  expiresAt: Date | null
}

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  private async verify(token: string, fallbackSubject?: string): Promise<CampusClaims> {
    const pem = (process.env.BIT_LOGIN_PUBLIC_KEY_PEM || '').replace(/\\n/g, '\n')
    let payload: Record<string, unknown>
    if (!pem && process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === 'true' && token.startsWith('dev-campus-token')) {
      const subject = token.split(':', 2)[1] || fallbackSubject || 'student'
      payload = { sub: `dev-${subject}`, jti: `dev-${subject}-${Date.now()}`, purpose: 'registration', exp: Math.floor(Date.now() / 1000) + 300 }
    }
    else {
      if (!pem) throw new ServiceUnavailableException('校园认证公钥尚未配置')
      const key = await importSPKI(pem, 'EdDSA')
      const verified = await jwtVerify(token, key, {
        algorithms: ['EdDSA'],
        issuer: process.env.BIT_LOGIN_ISSUER || 'bit-login',
        audience: process.env.BIT_LOGIN_AUDIENCE || 'biterstore'
      })
      payload = verified.payload
    }
    if (!payload.sub || !payload.jti || payload.purpose !== 'registration') throw new BadRequestException('校园认证凭证声明不完整')
    return {
      provider: process.env.BIT_LOGIN_ISSUER || 'bit-login',
      subjectHash: createHash('sha256').update(String(payload.sub)).digest('hex'),
      jti: String(payload.jti),
      expiresAt: payload.identity_expires_at ? new Date(Number(payload.identity_expires_at) * 1000) : null
    }
  }

  async loginOrCreate(token: string) {
    const claims = await this.verify(token)
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.campusIdentity.findUnique({ where: { provider_externalSubjectHash: { provider: claims.provider, externalSubjectHash: claims.subjectHash } } })
      const user = existing
        ? await tx.user.update({ where: { id: existing.userId }, data: { campusStatus: 'VERIFIED' } })
        : await tx.user.create({ data: { nickname: '北理同学', campusStatus: 'VERIFIED' } })

      await tx.usedAuthToken.create({ data: { jti: claims.jti, userId: user.id } })
      await tx.campusIdentity.upsert({
        where: { provider_externalSubjectHash: { provider: claims.provider, externalSubjectHash: claims.subjectHash } },
        create: { userId: user.id, provider: claims.provider, externalSubjectHash: claims.subjectHash, verifiedAt: new Date(), expiresAt: claims.expiresAt },
        update: { verifiedAt: new Date(), expiresAt: claims.expiresAt, revokedAt: null }
      })
      return user
    })
  }

  async exchange(userId: string, token: string) {
    const claims = await this.verify(token, userId)
    await this.prisma.$transaction(async (tx) => {
      await tx.usedAuthToken.create({ data: { jti: claims.jti, userId } })
      const existing = await tx.campusIdentity.findUnique({ where: { provider_externalSubjectHash: { provider: claims.provider, externalSubjectHash: claims.subjectHash } } })
      if (existing && existing.userId !== userId) throw new BadRequestException('该校园身份已绑定其他账号')
      await tx.campusIdentity.upsert({ where: { provider_externalSubjectHash: { provider: claims.provider, externalSubjectHash: claims.subjectHash } }, create: { userId, provider: claims.provider, externalSubjectHash: claims.subjectHash, verifiedAt: new Date(), expiresAt: claims.expiresAt }, update: { verifiedAt: new Date(), expiresAt: claims.expiresAt, revokedAt: null } })
      await tx.user.update({ where: { id: userId }, data: { campusStatus: 'VERIFIED' } })
    })
    return { status: 'VERIFIED', verifiedAt: new Date().toISOString() }
  }
  async status(userId: string) { const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { campusStatus: true, campusIdentities: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { verifiedAt: true, expiresAt: true } } } }); return { status: user.campusStatus, ...user.campusIdentities[0] } }
}
