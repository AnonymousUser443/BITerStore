import { BadRequestException, Controller, ForbiddenException, Get, HttpException, HttpStatus, Post, Body, Optional, Req, UseGuards, ServiceUnavailableException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthGuard, CurrentUser, effectiveCampusStatus, signAccessToken, type AuthUser } from '../../common/auth.js'
import { createTotpSecret, decryptTotp, encryptTotp, verifyTotp } from '../../common/totp.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'
import { hashRefreshToken } from '../auth/auth.service.js'
import { randomBytes } from 'node:crypto'

@Controller('admin/security') @UseGuards(AuthGuard)
export class AdminSecurityController {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly redis?: RedisService) {}

  private async enforceTotpRateLimit(userId: string, request: FastifyRequest | undefined, action: 'enable' | 'verify') {
    if (!this.redis) throw new ServiceUnavailableException('安全验证服务暂不可用，请稍后再试')
    const forwarded = request?.headers?.['x-forwarded-for']
    const ip = String(request?.ip || (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown')).split(',')[0].trim().slice(0, 80) || 'unknown'
    try {
      await this.redis.ensureConnected()
      const count = await this.redis.client.eval(
        "local userCount = redis.call('INCR', KEYS[1]); local ipCount = redis.call('INCR', KEYS[2]); if userCount == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; if ipCount == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]); end; return math.max(userCount, ipCount)",
        2, `admin-totp:${action}:user:${userId}`, `admin-totp:${action}:ip:${ip}`, 300
      )
      if (Number(count) > 5) throw new HttpException('动态验证码尝试次数过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error
      throw new ServiceUnavailableException('安全验证服务暂不可用，请稍后再试')
    }
  }

  private async clearTotpRateLimit(userId: string, request: FastifyRequest | undefined, action: 'enable' | 'verify') {
    if (!this.redis) return
    const forwarded = request?.headers?.['x-forwarded-for']
    const ip = String(request?.ip || (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown')).split(',')[0].trim().slice(0, 80) || 'unknown'
    await this.redis.client.del(`admin-totp:${action}:user:${userId}`, `admin-totp:${action}:ip:${ip}`).catch(() => undefined)
  }

  private async adminRecord(userId: string) {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { campusIdentities: { orderBy: { verifiedAt: 'desc' }, take: 1 } }
    })
    const campusStatus = record ? effectiveCampusStatus(record) : ''
    if (record && campusStatus !== 'VERIFIED') throw new ForbiddenException('campus identity is not verified')
    if (!record || record.status !== 'ACTIVE' || record.campusStatus !== 'VERIFIED' || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(record.role)) {
      throw new ForbiddenException('需要已认证且状态正常的管理员账号')
    }
    return { ...record, campusStatus }
  }

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const record = await this.adminRecord(user.id)
    return {
      user: { id: record.id, nickname: record.nickname, role: record.role, campusStatus: record.campusStatus },
      totpEnabled: record.adminTotpEnabled
    }
  }

  @Post('totp/setup')
  async setup(@CurrentUser() user: AuthUser) {
    const record = await this.adminRecord(user.id)
    if (record.adminTotpEnabled) throw new BadRequestException('动态验证码已启用，如需重置请由服务器管理员执行安全重置')
    const secret = createTotpSecret()
    await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpSecret: encryptTotp(secret), adminTotpEnabled: false } })
    return { secret, otpauthUrl: `otpauth://totp/BITerStore:${user.id}?secret=${secret}&issuer=BITerStore` }
  }

  @Post('totp/enable')
  async enable(@CurrentUser() user: AuthUser, @Body() body: { code: string }, @Req() request?: FastifyRequest) {
    await this.enforceTotpRateLimit(user.id, request, 'enable')
    const record = await this.adminRecord(user.id)
    if (!record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误')
    await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpEnabled: true } })
    await this.clearTotpRateLimit(user.id, request, 'enable')
    return { ok: true }
  }

  @Post('totp/verify')
  async verify(@CurrentUser() user: AuthUser, @Body() body: { code: string }, @Req() request?: FastifyRequest) {
    await this.enforceTotpRateLimit(user.id, request, 'verify')
    const record = await this.adminRecord(user.id)
    if (!record.adminTotpEnabled || !record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误或尚未启用')
    const refreshToken = randomBytes(48).toString('base64url')
    const session = await this.prisma.session.create({
      data: {
        userId: record.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        platform: 'admin-totp',
        device: 'admin',
        expiresAt: new Date(Date.now() + Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900) * 1000)
      }
    })
    await this.clearTotpRateLimit(user.id, request, 'verify')
    return {
      accessToken: await signAccessToken({ id: record.id, role: record.role, campusStatus: record.campusStatus }, true, session?.id),
      expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
      user: { id: record.id, nickname: record.nickname, role: record.role }
    }
  }
}
