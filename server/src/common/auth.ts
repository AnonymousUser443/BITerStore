import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import { SignJWT, jwtVerify } from 'jose'
import { PrismaService } from '../infra/prisma.service.js'
import { accessTokenSecret } from './security-config.js'

export interface AuthUser {
  id: string
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
  campusStatus: string
  /** Set by AuthGuard from the database; optional keeps token helpers backwards compatible. */
  status?: 'ACTIVE' | 'MUTED' | 'BANNED' | 'DELETED'
  adminTotp?: boolean
  sessionId?: string
}
export function assertNotMuted(user: AuthUser | undefined) {
  if (user?.status === 'MUTED') throw new ForbiddenException('当前账号处于禁言状态，暂不能进行互动操作')
}
const secret = () => new TextEncoder().encode(accessTokenSecret())

export async function signAccessToken(user: AuthUser, adminTotp = false, sessionId?: string) {
  return new SignJWT({ role: user.role, campusStatus: user.campusStatus, adminTotp, ...(sessionId ? { sid: sessionId } : {}) }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(`${Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900)}s`).sign(secret())
}

export function verifyAccessToken(token: string) {
  return jwtVerify(token, secret())
}

export function effectiveCampusStatus(record: { campusStatus: string; campusIdentities?: Array<{ expiresAt: Date | null; revokedAt: Date | null }> }, now = new Date()) {
  const identity = record.campusIdentities?.[0]
  if (identity?.revokedAt) return 'REVOKED'
  if (identity?.expiresAt && identity.expiresAt <= now) return 'EXPIRED'
  return record.campusStatus
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const token = bearer || request.cookies?.biterstore_access
    if (!token) throw new UnauthorizedException('需要登录')
    try {
      const { payload } = await jwtVerify(token, secret())
      const userId = typeof payload.sub === 'string' ? payload.sub : ''
      if (!userId) throw new UnauthorizedException('登录已失效')
      if (process.env.NODE_ENV === 'production' && typeof payload.sid !== 'string') throw new UnauthorizedException('登录已失效，请重新登录')
      const record = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, role: true, status: true, campusStatus: true, adminTotpEnabled: true,
          campusIdentities: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { expiresAt: true, revokedAt: true } }
        }
      })
      if (!record || record.status === 'BANNED' || record.status === 'DELETED') throw new UnauthorizedException('账号当前不可用')
      if (typeof payload.sid === 'string') {
        const session = await this.prisma.session.findFirst({ where: { id: payload.sid, userId }, select: { revokedAt: true, expiresAt: true } })
        if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedException('登录已失效')
      }
      request.user = {
        id: record.id,
        role: record.role,
        campusStatus: effectiveCampusStatus(record),
        status: record.status,
        adminTotp: payload.adminTotp === true && record.adminTotpEnabled,
        sessionId: typeof payload.sid === 'string' ? payload.sid : undefined
      }
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as AuthUser
    assertNotMuted(user)
    if (user?.campusStatus !== 'VERIFIED') throw new ForbiddenException('完成校园身份认证后才能操作')
    return true
  }
}

/** Campus verification without applying marketplace interaction status. */
@Injectable()
export class CampusVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as AuthUser
    if (user?.campusStatus !== 'VERIFIED') throw new ForbiddenException('完成校园身份认证后才能查看会话')
    return true
  }
}

/**
 * Blocks marketplace mutations for muted users while keeping read endpoints,
 * profile access and account logout available. AuthGuard must run first.
 */
@Injectable()
export class NotMutedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined
    if (user?.status === 'MUTED') throw new ForbiddenException('当前账号处于禁言状态，暂不能进行互动操作')
    return true
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthUser
    if (!user?.id || !user.adminTotp) throw new ForbiddenException('需要管理员动态验证码')
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        role: true, status: true, campusStatus: true, adminTotpEnabled: true,
        campusIdentities: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { expiresAt: true, revokedAt: true } }
      }
    })
    const campusStatus = record ? effectiveCampusStatus(record) : ''
    if (!record || record.status !== 'ACTIVE' || campusStatus !== 'VERIFIED') throw new ForbiddenException('管理员账号当前不可用')
    if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(record.role)) throw new ForbiddenException('没有后台权限')
    if (!record.adminTotpEnabled) throw new ForbiddenException('管理员动态验证码已停用')
    request.user = { ...user, role: record.role, campusStatus }
    return true
  }
}

export const CurrentUser = createParamDecorator((_data, context: ExecutionContext) => context.switchToHttp().getRequest().user as AuthUser)
